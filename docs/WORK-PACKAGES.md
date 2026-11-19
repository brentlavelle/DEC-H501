# Work packages: H-500 parity

Seven packages. Each is sized for one agent session on one branch. Run them in the order the
graph allows, one agent per package, and merge a package into `h500-parity` only after its
acceptance list passes.

```mermaid
flowchart LR
  WP0[WP0 one trunk] --> WP1[WP1 simulator core]
  WP1 --> WP2[WP2 editor on the simulator]
  WP2 --> WP3[WP3 missing H-500 parts]
  WP2 --> WP4[WP4 BOM and subcircuits]
  WP3 --> WP5[WP5 H-500 layout]
  WP4 --> WP5
  WP5 --> WP6[WP6 parity audit]
```

WP3 and WP4 can run at the same time. Nothing else can.

**Status, 2026-11-16.** WP0, WP1 and WP2 are done. Branch `wp5-compact-panel`, cut from
`wp2-editor-on-sim`, did part of WP3 and WP5 out of order at Brent's direction:

- WP3 items 1 and 4: final half-size symbols for every type, one terminal per lead.
- A `gnd` type, which no package had planned.
- WP5 items 1, 2 and 5 and the first half of 7: `panels/h500.json`, the board sized from
  `circuit.board`, labels, and start-up on the preset. Controls use compact 40 x 65 symbols.

Still open in WP3: items 2, 3, 5 and 6 (palette buttons, pulser and clock controls, delete,
the id generator). Still open in WP5: items 3, 4, 6 and the rest of 7 (board size control,
free-spot placement, the white patch panel, "New" offering the preset).

## Prompts

**Worker.** Replace `N`.

```text
You are working in the DEC-H501 repository. Read AGENTS.md, then docs/H500-PARITY.md, then
the section "WP N" in docs/WORK-PACKAGES.md. Do WP N and nothing else.

Before you write code, state in five lines or fewer which files you will touch and which
tests you will add. Then proceed without waiting for a reply.

Work on a branch named as AGENTS.md says. Finish with the report format in AGENTS.md. If you
hit one of the stop conditions in AGENTS.md, stop and report instead of guessing.
```

**Reviewer.** Give this to a model from a different vendor than the worker. Replace `N` and
the branch name.

```text
You are reviewing branch wpN-... of the DEC-H501 repository. You did not write it. Read
AGENTS.md, docs/H500-PARITY.md and the section "WP N" in docs/WORK-PACKAGES.md.

Run `node --test`. For every item in the WP N acceptance list, answer pass or fail and give
the evidence: a test name, or a file and line. Then look for these and list what you find:
tests that restate the implementation instead of checking the spec; tests that were skipped,
loosened or deleted; DOM access, timers or wall-clock time under sim/; runtime state written
onto circuit objects; behavior that differs from docs/H500-PARITY.md without being listed in
its section 7.

Do not fix anything. Report.
```

## Which model for which package

| Package | Cost of getting it wrong | Use |
|---------|--------------------------|-----|
| WP0 | Low. Mechanical | Claude Sonnet 5.5, the Copilot coding agent, or Codex |
| WP1 | High. Everything else stands on it | Claude Opus 5.5 or Fable 5.2 writes it. Codex's strongest model reviews it with the reviewer prompt |
| WP2 | Medium. Touches most files | Claude Opus 5.5 or Sonnet 5.5 |
| WP3 | Low to medium | Sonnet 5.5, Copilot or Codex |
| WP4 | Low. Fully gated by tests | A local coding model on the M4 Max is acceptable here and only here |
| WP5 | Medium | Claude Opus 5.5 or Sonnet 5.5. The layout is written down in the spec; a model that can read images can refine the spacing from the photographs |
| WP6 | It is the audit | A different vendor from whoever wrote WP1 |

---

## WP 0: one trunk

**Goal.** One branch holding all landed work, with a test runner that runs.

A step-by-step version of this package, written for a local model, is in
`docs/prompts/WP0-local.md`. Items 4 and 5 below are already done: `package.json` and
`test/smoke.test.js` exist and pass.

**Do.**

1. Create `h500-parity` from `track3-ic-bom`.
2. Merge `track4-panel-look` into it. Expect two conflict hunks, both in `boardEditor.js`;
   `index.html`, `styles.css` and `gates.svg` merge cleanly. Keep the track 3 structure
   (`activeView()`, the `moved` check in the mouseup handler) and re-apply track 4's grid
   snap inside it.
3. Commit the untracked `README.md`.
4. Add `package.json` containing only `"private": true`, `"type": "module"` and a `test`
   script that runs `node --test`. No dependencies.
5. Add `test/smoke.test.js`: every `svgId` in `gateLibrary.js`, and every symbol id the
   renderer builds by hand (`switch-open`, `switch-closed`, `light-on`, `light-off`,
   `jk-high`), exists as a `<symbol id>` in `gates.svg`; every type in `icCatalog.js` exists
   in `gateLibrary.js`; `exampleCircuit.json` passes `parseCircuitFile`.
6. Replace the stale "current state" material in `context.md` and
   `.github/agents/dec-h501.agent.md` with a pointer to `AGENTS.md`. Keep the "I found a
   similar tool" note in `context.md`. Add one status line to `PLAN.md` saying tracks 1 to 4
   have landed and that `docs/WORK-PACKAGES.md` is the current plan.

**Acceptance.**

- `node --test` passes.
- `git log --oneline --graph h500-parity` shows both lines of work.
- `main` and the `track*` branches are unchanged.
- The app loads from a static server; a gate can be placed, wired, dragged with grid snap on
  and off, saved and loaded.

---

## WP 1: simulator core

**Goal.** A DOM-free simulator that implements sections 3 and 4 of the parity spec, proven by
tests. The UI is not touched in this package and keeps using the old evaluator.

**Files.** New: `sim/core.js`, `sim/components.js` (the behavior of each primitive type),
`test/sim-*.test.js`, `test/fixtures/*.json`. Changed: none outside those.

**Notes.**

- Input is an already-flat circuit. Do not import `subcircuits.js`.
- Write fixtures in the circuit file schema, version 2, with real `x` and `y` values, so each
  one can also be opened in the editor as an example.
- The types `andnor`, `pulser`, `clock` and `hi` are implemented here as behavior. Their
  symbols and palette entries are WP3.

**Acceptance.** One or more tests for each line.

1. Exhaustive truth tables for `and`, `or`, `not`, `nand`, `nor`, `xor`, `xnor`, `2nand`,
   `3nand`, `4nand`, `andnor`.
2. Open inputs: an unwired `2nand` outputs LO. An `andnor` with one AND section unwired
   outputs LO whatever the other section sees. A lamp with nothing connected is dark.
3. Order independence: every fixture gives identical pin values under at least 20 random
   shuffles of its `components` and `wires` arrays.
4. NAND latch: set, hold, reset, hold. Powered on with both inputs HI it settles with
   `raceResolved: true`, and to the same state under every shuffle.
5. A ring of three inverters returns `settled: false`, names the three gates, and returns in
   bounded time.
6. J-K: hold, set, clear and complement happen on the trailing edge and only there. Nothing
   happens on the rising edge. Nothing happens when J or K changes while the clock is steady
   HI or steady LO. `reset` LO forces `q` LO at once, with no clock, and wins over a
   simultaneous trailing edge. `reset` open is inactive. J and K open complement.
7. Four-bit ripple counter: 16 pulses take it through 0 to 15 and back to 0.
8. Three-bit synchronous counter with gated J-K inputs counts 0 to 7 and wraps. This checks
   that all flip-flops sample their inputs before any of them changes.
9. Four-bit shift register: one position per pulse, never two.
10. Clock: at 10 Hz, `advance(1000)` produces exactly 10 trailing edges and a counter on it
    reads 10. `advance(500)` twice leaves the same state as `advance(1000)` once. Exceeding
    `maxEdges` returns `behind: true` and still moves `time` to the target.
11. Pulser: press gives HI, release gives LO, and one press and release advances a flip-flop
    exactly once.
12. `carryFrom`: add a wire to a counter that has counted to 5; it still reads 5. Power-on:
    a flip-flop clocked from a gate whose output rises and falls during the first settle
    is still reset afterwards.
13. Half adder and full adder built from NANDs match binary addition for every input.
14. A test reads every file under `sim/` and fails on `document`, `window`, `setTimeout`,
    `setInterval`, `requestAnimationFrame`, `Date.now` or `performance.now`.

**Review.** This package gets the reviewer prompt before it is merged.

---

## WP 2: editor on the simulator

**Goal.** The browser uses `sim/core.js`. The old evaluator is gone. The clock can run
without breaking interaction.

**Do.**

1. Make `flattenCircuit` pure: it must not write to its argument. Remove `internalState`
   everywhere, including `ungroupComponent`.
2. Delete `evaluateCircuit`, `readInput` and `readOutput` from `renderer.js`.
   `renderCircuit` takes a simulator and reads pin values from it. Keep the `rootPinMap`
   lookup so wires and pins on a collapsed subcircuit box still show their state.
3. `boardEditor.js` owns one simulator for the active view. Rebuild it with `carryFrom` when
   components or wires change, when the view changes, and on load. Switch clicks call
   `sim.setInput`.
4. When zoomed into a subcircuit definition, simulate that definition on its own, as the
   code does today.
5. Add a browser driver module, outside `sim/`, that calls `sim.advance(elapsed)` per
   animation frame, clamps `elapsed` to 100 ms so a background tab does not replay minutes,
   and updates lamp, wire and flip-flop appearance in place. A tick must not cancel a drag,
   a half-drawn wire, a rubber-band selection or a selected wire.
6. Schema version 2 and the version 1 migration, as in section 8 of the parity spec. Remove
   the lamp's `return` pin from `gateLibrary.js`.
7. Report oscillation and `behind` in the status area.
8. Add `gateLibrary.js` entries and plain placeholder symbols for `andnor`, `pulser`,
   `clock` and `hi`, with their final pin names, so the WP1 fixtures load and draw. No
   palette buttons and no controls yet. WP3 replaces the placeholders.

**Acceptance.**

- All WP1 tests still pass, unchanged.
- New tests: `flattenCircuit` leaves a deep copy of its input equal to the input. Two
  instances of one subcircuit containing a flip-flop hold different states. A version 1 file
  with a wire to `led.return` migrates to version 2 without that wire and validates.
  `serializeCircuit` output contains none of the removed fields.
- `grep -n "evaluateCircuit\|previousClock\|internalState" *.js` finds nothing outside the
  migration code in `circuitModel.js`.
- By hand: AND, OR and NOT give correct outputs. A NAND latch sets, holds and resets. With a
  clock fixture from WP1 loaded, lamps blink while a gate is being
  dragged and while a wire is being drawn, and neither action is interrupted.

---

## WP 3: missing H-500 parts

**Goal.** The clock, pulser, AND/NOR gate and HI terminal can be placed and used, and the
editor gaps that block real use are closed.

**Do.**

1. Final symbols in `gates.svg` for `andnor`, `pulser`, `clock` and `hi`, replacing the WP2
   placeholders. Use the 260 x 130 footprint and the existing pin columns (inputs at x = 18, outputs
   at x = 224). `andnor` inputs are `in0` to `in3`, drawn as two pairs.
2. Palette buttons for the four new types.
3. Pulser interaction and clock rate control as in section 5 of the parity spec. The clock's
   `hz` is saved with the circuit.
4. Redraw the `jk` symbol to match the real part: an inversion bubble on `reset`, a
   trailing-edge marker on `c`, outputs labelled 1 and 0. Pin names and coordinates do not
   change.
5. Delete selected components with Delete or Backspace, removing their wires.
6. Replace `g${components.length + 1}` with an id generator that cannot collide. Put it in a
   module with no DOM access so it can be tested.

**Acceptance.**

- The WP0 smoke test covers the new symbols and still passes.
- Tests: the id generator never returns an id already in the circuit, including after
  Make Component and after Ungroup. Deleting a component leaves no wire that refers to it. A circuit holding each new
  type survives save and load unchanged.
- By hand: one clock, one flip-flop and one lamp divide the clock by two, visibly, at 1 Hz.
  A pulser clocks a flip-flop once per press. An AND/NOR gate with one section unwired holds
  its output LO.

---

## WP 4: BOM and subcircuits

**Goal.** The two features that are not part of the H-500 are tested and correct against
the new simulator.

**Do.**

1. `icCatalog.js`: add `andnor` as 7450, two gates per package. Change `jk` to 7473, two per
   package, which is the part the H-500 used.
2. `generateBOM`: `switch`, `led`, `pulser`, `clock`, `hi` and `gnd` are not ICs and are not
   counted in `totalGates`.
3. Tests for `makeComponent` and `ungroupComponent`: build a full adder from loose gates,
   record the lamp outputs for all eight input combinations, group it, compare, ungroup it,
   compare. Repeat with a subcircuit placed inside another subcircuit.
4. Test that `makeComponent` rejects a name that is already a type, and that boundary pins
   come out named `in0...` and `out0...` in a stable order.

**Acceptance.**

- BOM of exactly the section 2 inventory (8 `jk`, 8 `2nand`, 6 `3nand`, 4 `4nand`,
  4 `andnor`, plus the switches, pulsers, lamps and clock) is 2 x 7400, 2 x 7410, 2 x 7420,
  2 x 7450, 4 x 7473, with `totalGates` 30. Use the LS part numbers the catalog already uses
  if you keep them, and say so in the report.
- Every test in items 3 and 4 passes.

---

## WP 5: H-500 layout and resizable board

**Goal.** The app opens looking like an H-500 and stays a freeform editor, as specified in
section 6 of the parity spec.

**Do.**

1. Lay out `panels/h500.json` following the row table in section 6 of the parity spec. If
   you can view images, open the two photographs listed in section 9 and match the spacing
   and proportions. The real panel is portrait.
2. `circuit.board` drives the board size. The full inventory will not fit in 1200 x 800, so
   the preset sets its own size. Twelve controls will not fit in one row at the 260-wide
   footprint: either draw compact symbols for the switch, pulser, lamp and clock, or wrap
   them. Say which you chose.
3. Board size control: the user can set width and height. Put the rule in a function with no
   DOM access, for example `resizeBoard(circuit, width, height)`, which refuses a size that
   would leave any part outside the board. The screen scale does not change with board size;
   the board scrolls.
4. Palette placement: put the search for empty space in a function with no DOM access, for
   example `findFreeSpot(circuit, footprint)`, which returns a position that overlaps no
   existing part, or nothing when the board is full.
5. Optional `label` on components, drawn beside the part. The preset labels switches,
   pulsers and lamps with their numbers, and the terminal groups with the real legends.
6. Use track 4's dark faceplate, switch and lamp skins and nameplate for the board.
7. Start-up loads `panels/h500.json` instead of `exampleCircuit.json`. "New" offers the
   H-500 layout or an empty board. The palette, Make Component, Ungroup, Save, Load and BOM
   all work on the preset exactly as on any other circuit.

**Acceptance.**

- Test: `panels/h500.json` validates and holds exactly the section 2 inventory, including
  six HI terminals.
- Test: reading the preset's logic parts row by row, top to bottom and left to right, gives
  the sequence of types in the section 6 table.
- Test: no two parts in the preset overlap, and all of them lie inside its board.
- Test: the BOM of the preset equals the WP4 result.
- Test: `resizeBoard` accepts a board twice as wide and one slightly taller, and refuses one
  smaller than the parts on it. `findFreeSpot` never returns a position that overlaps a
  part, and returns nothing on a full board.
- By hand, starting from the preset: a NAND latch from two 2-input NANDs and two switches;
  a 4-bit ripple counter on the clock showing on four lamps; the same counter stepped with a
  pulser. Then make the board twice as wide, add four more gates from the palette, wire
  them into the circuit, save, reload, and find the size, the parts and the wires intact.

---

## WP 6: parity audit

**Goal.** An independent answer to "is this at parity", with evidence.

**Do.**

1. Go through sections 2, 3 and 6 of the parity spec line by line. For each line give pass
   or fail and the evidence.
2. Check the two facts the spec could not read directly, the J-K truth table and the
   AND/NOR expression, against the workbook's chapter 4 and chapter 5 figures. Check every
   **[W]** page reference you can.
3. Build five workbook experiments as fixtures with tests, taking the wiring from the
   workbook figures: 1.1 (2-input NAND), 1.4 (inverter), 3.1 (R-S flip-flop), one counter
   and one shift register.
4. Write `docs/PARITY-AUDIT.md`: the table from step 1, the result of step 2, the
   experiments from step 3, and every difference from the hardware that section 7 of the
   spec does not already list.

**Acceptance.** `docs/PARITY-AUDIT.md` exists, `node --test` passes, and every failure in
the audit has either a fix merged or a line added to section 7 of the parity spec.

---

## After parity

Not part of this plan: undo and redo, autosave, an examples menu built from
`test/fixtures`, netlist export, fan-out warnings, transcribing the rest of the workbook.
