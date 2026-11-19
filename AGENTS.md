# DEC-H501: instructions for coding agents

Read this file, then `docs/H500-PARITY.md`, then the one work package you were assigned in
`docs/WORK-PACKAGES.md`. Do that package and nothing else.

## The project

A browser recreation of the DEC H-500 "Computer Lab" logic trainer (1968): patch-cord wiring,
rocker switches, pulsers, lamps, a variable clock, NAND and AND/NOR gates, J-K flip-flops.
Vanilla JavaScript ES modules and SVG. No framework, no build step, no runtime dependencies.

The current goal is behavioral parity with the real H-500. The freeform editor, subcircuits
("Make Component") and the BOM generator stay, and must keep working.

## Repo state on 2026-11-15

- Work sits on stacked branches: `claude-restart` -> `track1-save-load` -> `track2-components`
  -> `track3-ic-bom` (checked out). `track4-panel-look` forks from `claude-restart` and was
  never merged. `main` is a 2025 prototype commit. WP0 puts everything on one branch,
  `h500-parity`.
- `README.md` is untracked.
- There are no tests.
- `context.md`, the "Current baseline" paragraph of `PLAN.md`, and
  `.github/agents/dec-h501.agent.md` describe an older codebase. Where they disagree with this
  file or with the code, they are wrong.

## Module map (track3-ic-bom)

| File | Role |
|------|------|
| `index.html` | Menus, palette, `<svg id="board">`. The board's size comes from `circuit.board`, one screen pixel per board unit |
| `boardEditor.js` | All interaction: file menu, make/ungroup, BOM button, drag, wiring, selection, palette. Owns `circuit`, `navStack`, `selectedIds` |
| `renderer.js` | `evaluateCircuit` (the simulator, to be replaced) and `renderCircuit(circuit, svg)`, which clears and rebuilds the whole SVG on every call |
| `gateLibrary.js` | type -> `{ svgId, width, height, pins: [{ name, x, y, direction? }] }`. A pin with no `direction` is an input if its name starts with `in`, otherwise an output |
| `gates.svg` | Symbol sprite sheet. Gates and the flip-flop are 84 x 65, controls 40 x 65, HIGH and GND terminals 40 x 30. One terminal per lead |
| `panels/h500.json` | The H-500 preset, loaded at startup |
| `circuitModel.js` | `createEmptyCircuit`, `migrateCircuit`, `validateCircuit`, `parseCircuitFile`, `serializeCircuit`. Schema version 1 |
| `subcircuits.js` | `flattenCircuit`, `makeComponent`, `ungroupComponent`, `getComponentPins`, `isSubcircuitType` |
| `bomGenerator.js`, `icCatalog.js` | `generateBOM(circuit)` and the 7400-series catalog |
| `exampleCircuit.json` | A small version 1 sample. No longer loaded at startup |

## Known defects

Items 1, 2 and 9 were reproduced on 2026-11-15 by running the code headless in Node. The rest
come from reading the code.

1. `evaluateCircuit` leaves `and`, `or` and `not` out of its gate list. Their outputs are
   always LO.
2. Evaluation is one pass in array order and gate outputs are not kept between passes. A
   three-gate NAND chain gives a wrong answer when the gates were placed in reverse order, and
   a cross-coupled NAND latch can neither reset nor hold.
3. The J-K flip-flop triggers on the rising clock edge, and also whenever J or K changes while
   the clock is HI. Its reset is active HI. The real part triggers on the trailing edge and
   resets on LO.
4. Unconnected inputs read LO. See `docs/H500-PARITY.md` for the rule to implement.
5. No clock, pulser, AND/NOR gate or HI terminal exists.
6. Simulation runs inside `renderCircuit`. Runtime state is written onto circuit objects
   (`state`, `previousClock`, `previousJ`, `previousK`, and `internalState` on subcircuit
   instances), and `flattenCircuit` mutates its argument.
7. The palette creates ids as `g${components.length + 1}`, which can collide after Make
   Component shrinks the array, or after a load.
8. Wires can be deleted. Components cannot.
9. `generateBOM` returns `totalGates` as the flattened component count, so switches and lamps
   are counted as gates.
10. The lamp (`led`) declares a second input pin, `return`, that nothing reads.

## Rules

- No runtime dependencies and no build step. Node is used for tests only: `node --test`,
  Node 20 or later, no `npm install`.
- Nothing under `sim/` may touch `document`, `window`, timers, `Date.now` or
  `performance.now`, or import from `renderer.js` or `boardEditor.js`. Time is an argument.
- After WP2 the renderer draws and the simulator computes. Do not put logic evaluation back
  into the renderer or the editor.
- Runtime state belongs to the simulator. Circuit JSON holds only what the user set: switch
  positions, clock rate, wiring, layout.
- Do not change pin coordinates in `gates.svg` without changing `gateLibrary.js` to match and
  checking that wire ends still meet the pins.
- Every behavior change comes with a test. A bug fix starts with a test that fails.
- Never delete, skip or loosen a test to get to green. If a test contradicts
  `docs/H500-PARITY.md`, stop and report it.
- Leave these alone: `.bak/`, `copilot-demo.html`, `qwen3-demo.html`, `draggable.html`.
- Git: one branch per work package, cut from `main` and named `wp<N>-<slug>`. Small
  commits. Commit only when `node --test` passes. Merge into `main` with `--no-ff` after the
  package's acceptance list passes. Do not push and do not rewrite history.

## When to stop and ask

- The parity spec is ambiguous or contradicts itself.
- Your package needs a change in a file that belongs to a package you were not given.
- The only way forward adds a dependency or a build step.

## Report format

End your session with exactly these headings:

1. **Changed**: files and one line each.
2. **Tests**: the last lines of `node --test` output, pasted.
3. **Checked by hand**: what you opened in a browser and saw, or "nothing".
4. **Not verified**: anything you assumed or could not check.
5. **Spec questions**: places where `docs/H500-PARITY.md` was unclear or looked wrong.
