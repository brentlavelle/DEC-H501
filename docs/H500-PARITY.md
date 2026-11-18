# H-500 parity specification

This is the definition of done for "parity with the DEC H-500". Tests are written against this
document. If the code and this document disagree, the code is wrong. If this document looks
wrong, stop and say so.

Each fact carries a tag:

- **[W]** stated in the 1969 Computer Lab Workbook (page given).
- **[R]** taken from the 2020 reproduction project, which traced the original wiring.
- **[D]** a design decision made for this simulator. Not a fact about the hardware.

## 1. What parity means

1. Every part on the real panel exists as a component with the real behavior.
2. A circuit that works on the real machine works here with the same wiring and the same
   switch, pulser and clock actions.
3. The app opens on a preset holding exactly the real inventory, laid out like the real
   panel. From there the user can move parts, add more, and make the board wider or
   taller.
4. The freeform editor, subcircuits and BOM keep working, and may use extra gate types the
   real machine never had.

## 2. Inventory

| Real part | Qty | Type id | In the repo today |
|-----------|-----|---------|-------------------|
| J-K flip-flop, master-slave | 8 | `jk` | present, wrong behavior |
| 2-input NAND | 8 | `2nand` | present (`nand` is a duplicate) |
| 3-input NAND | 6 | `3nand` | present |
| 4-input NAND | 4 | `4nand` | present |
| AND/NOR gate | 4 | `andnor` | missing |
| Rocker switch | 8 | `switch` | present |
| Pulser | 3 | `pulser` | missing |
| Lamp | 8 | `led` | present, has a stray `return` pin |
| Variable clock | 1 | `clock` | missing |
| HI terminal | 6 | `hi` | missing |
| GND terminal | 2 | `gnd` | missing |

Quantities are [W] (specifications section), except the HI and GND terminal counts, which
are counted from the panel photograph [R]. The chips behind them are [R]: 2 x SN7400,
2 x SN7410, 2 x SN7420, 2 x SN7450, 4 x SN7473.

Freeform-only types, not on the real panel: `and`, `or`, `nor`, `xor`, `xnor`, `not`, `nand`.
They stay in the palette. The H-500 layout does not use them.

GND terminals exist on the real panel for linking two units [W, p. 101]. Linking units is
not modelled, but the terminals are on the panel: see `gnd` in section 3.

## 3. Component behavior

Levels are HI and LO. In code, `true` is HI.

**NAND (`2nand`, `3nand`, `4nand`, `nand`).** Output is LO only when every input is HI.

**AND/NOR (`andnor`).** Pins `in0`, `in1`, `in2`, `in3`, `out`.
`out = NOT((in0 AND in1) OR (in2 AND in3))`. Two 2-input AND sections feeding a NOR [W, p. 58;
R: SN7450]. With the open-input rule below, an AND section left unwired reads HI AND HI and
holds the output LO. That is how the real gate behaves and it must be tested.

**J-K flip-flop (`jk`).** Pins `j`, `k`, `c`, `reset` in; `q`, `qbar` out. The panel labels the
outputs "1" and "0" [W, p. 65].

- Outputs change on the HI-to-LO transition of `c`, the trailing edge of the clock pulse
  [W, pp. 65-66].
- At that edge: J LO, K LO holds. J HI, K LO sets. J LO, K HI clears. J HI, K HI complements
  [W, p. 68 for hold and complement].
- `reset` is active LO. While it is LO, `q` is LO and `qbar` is HI whatever the clock does.
  Held HI, it does nothing [W, pp. 74, 83, 89].
- J and K are read at the trailing edge [D]. The real master-slave part also catches a HI on
  J or K at any time while the clock is HI. That is not modelled. See section 7.
- There is no set input.
- Power-on state is `q` LO [D]. The real part powers on in either state.

**Rocker switch (`switch`).** Pin `out`. HI with the upper side pressed, LO with the lower
side pressed [W, specifications]. Persisted as `state: 1` or `0`.

**Pulser (`pulser`).** Pin `out`. Normally LO. HI for as long as it is held, back to LO on
release [W, p. XI]. Never persisted as pressed. The real pulser has two output terminals
carrying the same signal; one pin is enough here because one output can drive many wires [D].

**Lamp (`led`).** Pin `in`. Lit when the input is HI, dark when it is LO, dark with nothing
connected [W, p. XII]. Remove the `return` pin.

**HI terminal (`hi`).** Pin `out`, always HI [W, p. XI]. This is the panel's +5 V point.

**GND terminal (`gnd`).** Pin `out`, always LO [D]. On the real panel it is the 0 V point
used to join two units; here it is a LO source, the counterpart of the HI terminal, for
tying an input LO.

**Clock (`clock`).** Pin `out`. A continuous train of HI pulses [W, p. XI]. Persisted as
`hz`. See section 5.

**Open inputs.** An unconnected gate or flip-flop input reads HI [D]. The workbook does not
say what an open input does; it tells the student to tie unused inputs to HI [W, p. XII].
The parts are TTL, and an open TTL input floats HI, so HI is the faithful choice. The lamp is
the exception, as stated above.

## 4. Simulator semantics [D]

The simulator is a module with no DOM and no clock of its own. All of this section is design.

**State.** One boolean per output pin, plus, per flip-flop, the last value it saw on `c`.

**Nets.** Wires have no direction. Pins joined by wires, directly or through other pins,
form one net, so a cord chained from one input to the next carries the same signal. An input
reads the output on its net. With no output on the net it is open. With more than one output
on the net it reads LO if any of them is LO.

**Power-on.** Sources take their own value (switch state, HI terminal HI, GND terminal LO,
pulser LO, clock LO). Flip-flops are reset. Gate outputs start LO. Then settle. During that first settle a
flip-flop obeys `reset` but ignores its clock, and its remembered clock value is taken when
the settle ends. Gate outputs rising and falling on their way to their first stable value
would otherwise clock flip-flops at power-on.

**Sweep.** Compute the next output of every component from the pin values as they stood at
the start of the sweep, then commit them all at once. Every gate therefore has one unit of
delay, and the result cannot depend on the order of the `components` or `wires` arrays.

**Settle.** Sweep until a sweep changes nothing. The limit is `2 * componentCount + 8` sweeps.

**Races.** If the limit is reached, run a second phase: evaluate components one at a time in
ascending id order, each seeing the newest values, up to the same limit. If that reaches a
fixed point, the circuit had a symmetric race (for example a NAND latch powered on with both
inputs HI) and it is now resolved the same way every time: report `settled: true,
raceResolved: true`. Id order is plain string comparison, so `g10` comes before `g2`. If not, the circuit oscillates (for example a ring of three inverters):
report `settled: false` and list the ids still changing. Never loop without a bound.

**Time.** Virtual milliseconds, advanced only by the caller. `advance(ms)` finds every clock
edge in the interval, takes them in time order (ties in id order), applies each and settles
after each. It is additive: `advance(500)` twice equals `advance(1000)` once. If more than
`maxEdges` (default 10 000) fall in the interval, stop applying edges, move time to the
target anyway and report `behind: true`. A rise and a fall are one edge each, in `edges` and
against `maxEdges`: one second at 10 Hz is 20 edges. Edges skipped this way are discarded. A
skipped clock keeps the level it had and carries on from the new time.

**Clock waveform.** A square wave, changed from a narrow pulse at Brent's direction on
2026-11-16. With period `T = 1000 / hz` ms, the output rises at `k * T - T / 2` and falls
at `k * T`, for k = 1, 2, 3 and so on, counted from when the
clock was created or its rate last set. Every whole period therefore ends on a trailing edge:
N periods give exactly N trailing edges. An edge that lands exactly on the target time of
`advance` belongs to that call, not the next one. A clock with no `hz` runs at 1 Hz.
`setClockRate` restarts the count from the current time and leaves the output level alone: a
HI output stays HI until the next fall of the new waveform, so changing the rate never
clocks anything.

**Contract.** These are the names WP1 shipped. `createSimulator` throws on an unknown type, a
duplicate id, or a wire end that is not a pin; the methods throw on an unknown id or pin.

```js
import { createSimulator } from './sim/core.js';

// flat = { components: [{ id, type, state?, hz? }], wires: [{ from: {component, pin}, to: {component, pin} }] }
// Primitive types only. Subcircuits are flattened before this point.
const sim = createSimulator(flat, { carryFrom: previousSim });

sim.setInput(id, value);     // switch or pulser. Settles, returns the result below.
sim.setClockRate(id, hz);    // Settles, returns the result below.
sim.settle();                // { settled, sweeps, raceResolved, oscillating: [ids] }
sim.advance(ms, { maxEdges }); // same, plus { edges, behind }
sim.powerOn;                 // the settle result from construction: power-on, or after carryFrom
sim.read(id, pin);           // boolean at an output pin
sim.readInput(id, pin);      // boolean an input pin sees, open-input rule applied
sim.time;                    // virtual ms
```

`carryFrom` copies pin values, flip-flop state, remembered clock values, clock phase and
virtual time for every id present in both simulators with the same type, then settles. It is
how the editor adds a wire without resetting the user's counter. A switch takes its position
from the new circuit, not from the old simulator. A pulser that was held stays held. A clock
whose `hz` differs from the old one starts its count at the carry. A part that is new powers
on as in "Power-on" above, including ignoring its clock during that settle.

## 5. Controls in the browser [D]

- A driver module calls `sim.advance(elapsed)` once per animation frame and redraws only if
  something changed. A redraw during a tick must not cancel a drag, a half-drawn wire or a
  selection, so ticks update lamp, wire and flip-flop appearance in place rather than calling
  the full `renderCircuit` rebuild.
- Clock rate control: a four-position selector, 0.25, 0.5, 1 and 10 Hz. Click the clock to step to the next position; the rate is drawn under it. There is no fine
  control in this generation. The real unit picks a coarse range with a patch cord between
  range terminals and has a fine knob, fully counterclockwise slowest [W, p. XI]. The
  simulator itself accepts any rate; the limit is in the control.
- Pulser: HI on mouse or touch down, LO on up, including an up that happens off the symbol.
- When `settle` or `advance` reports an oscillation or `behind`, say so in the status area.

## 6. The H-500 layout and the board [D]

- A preset, `panels/h500.json`, holds exactly the inventory in section 2, laid out like the
  real panel. It is an ordinary circuit file. Nothing in it is locked: every part can be
  moved, deleted or grouped, and parts can be added from the palette.
- The app opens on this preset. "New" offers it or an empty board.
- The real machine, from the photographs in the reproduction write-up [R]. It is portrait,
  about 292 wide by 419 tall inside its frame. Top to bottom: the white patch panel; a black
  strip with the clock FINE knob at the left and the eight lamps at the right; a black
  switch panel with the logo at the left, then three white pulsers numbered 1 2 3, then
  eight tan rocker switches at the right, under the lamps.
- The patch panel, top to bottom:

  | Row | Left to right |
  |-----|---------------|
  | 1 | 4 J-K flip-flops |
  | 2 | 2 two-input NANDs stacked, 2 more stacked, then 3 three-input NANDs |
  |   | 3 HIGH terminals, in the gaps below row 2 |
  | 3 | 4 four-input NANDs |
  | 4 | 4 AND/NOR gates |
  |   | 3 HIGH terminals, in the gaps below row 4 |
  | 5 | the same as row 2 |
  | 6 | 4 J-K flip-flops, with 2 GND terminals (`gnd`) below them |
  | 7 | Terminal strip: CLOCK RANGE - COARSE with a FINE marker, CLOCK OUTPUT, PULSER OUTPUTS, then SWITCH OUTPUTS above LAMP INPUTS |

- The flip-flop symbol has J, C and K down the left side, the 1 output at the top right, the
  0 output at the bottom right, and R at the bottom. The AND/NOR symbol is two AND shapes
  feeding one NOR shape.
- Every terminal on the real panel is a pair of eyelets. Here one pin stands for the pair.
- Parts are drawn at one screen pixel per board unit. Gates and flip-flops have an 84 x 65
  footprint, half the size of the first drawings; switches, pulsers, lamps and the clock are
  40 x 65 with their terminal at the top; HIGH and GND terminals are 40 x 30.
- On the real machine the switches, pulsers, lamps and clock reach the patch panel through
  the row 7 terminal strip. Here they are parts with their own pins, so the preset puts the
  parts themselves where the strip and the controls are: the clock at the lower left, then
  the pulsers, then the switches at the lower right with the lamps above them.
- Switches, pulsers and lamps in the preset carry their panel numbers as labels.
- The board size comes from `circuit.board`, not from the `viewBox` hard-coded in
  `index.html`, and the user can change it: twice as wide, a little taller, any size that
  still contains every part on it. The size is saved with the circuit.
- Making the board bigger does not make the parts smaller. The scale on screen stays the
  same and the board scrolls.
- A part added from the palette lands in empty space on the board, never on top of another
  part. If there is no room, say so and point at the board size control.

## 7. Deliberate differences from the hardware

| Hardware | Here |
|----------|------|
| Clock from under 1 to over 10 million pulses per second, 50 ns pulses [W] | 0.25, 0.5, 1 or 10 Hz, pulse stretched to 50 ms so it can be seen |
| Coarse clock range set by a patch cord, fine knob within the range | Four fixed rates on a selector, no fine control |
| Master-slave flip-flop catches J or K going HI while the clock is HI | J and K read at the trailing edge only |
| Real gate delays, real hazards | One unit of delay per component |
| Flip-flops power on in either state | Power on reset |
| Rocker switches bounce; pulsers are filtered [W] | Nothing bounces |
| Fan-out limits: 10 for logic outputs, 30 for switches, pulsers, clock and HI [W] | Not enforced |
| GND terminals link the grounds of two units | One unit only. A GND terminal is a LO source |
| A fixed panel of 30 logic elements | The same panel as a starting layout that can be rearranged, extended and resized |

## 8. Schema version 2

- `version: 2`.
- New types: `andnor`, `pulser`, `clock` (with `hz`), `hi`, `gnd`.
- `board.width` and `board.height` are set by the user and saved.
- Optional `label` string on any component, drawn beside it.
- Removed from saved files: `previousClock`, `previousJ`, `previousK`, `internalState`, any
  flip-flop `state`. Flip-flop state is runtime state and is not saved.
- The lamp's `return` pin is gone. Migration drops wires that end on it.
- `migrateCircuit` takes a version 1 file to version 2. Version 1 circuits change behavior
  (open inputs, reset polarity, clock edge). That is accepted: the only version 1 file in the
  repo, `exampleCircuit.json`, has no wires.
- A switch inside a subcircuit definition belongs to the definition and is shared by every
  instance. Flip-flop state is per instance, because the simulator keys it by flattened id.

## 9. Sources

- Computer Lab Workbook, DEC, 1969:
  https://cdn.hackaday.io/files/1702327283205888/Digital_Computer_Lab_Workbook_1969.pdf
- Specifications section of the same workbook, transcribed:
  https://mail.smecc.org/logic_trainers_%26_simple_computers.htm
- Reproduction project logs (chip list, switch and clock notes):
  https://hackaday.io/project/170232-dec-h-500-computer-lab-reproduction
- Reproduction write-up, with the photographs the section 6 layout was read from:
  https://www.instructables.com/DEC-H-500-Computer-Lab-Reproduction/
  Patch panel: https://content.instructables.com/FKQ/86C5/KBUSUSVX/FKQ86C5KBUSUSVX.png
  Whole machine: https://content.instructables.com/FAY/IB6D/KBUSSSQ7/FAYIB6DKBUSSSQ7.jpg
- Museum catalogue entry with the panel legends:
  https://collection.ingenium.ca/en/id/1977.0049.001

The workbook's J-K truth table and the AND/NOR Boolean expression were not read directly.
The flip-flop rows for set and clear, and the AND/NOR expression, follow from the standard
behavior of the SN7473 and SN7450 named by the reproduction project. WP6 checks them against
the workbook's figures.
