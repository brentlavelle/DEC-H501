# DEC-H501: instructions for coding agents

Read this file, then `docs/H500-PARITY.md`, then the one work package you were assigned in
`docs/WORK-PACKAGES.md`. Do that package and nothing else.

## The project

The H-501: a browser recreation of the DEC H-500 "Computer Lab" logic trainer (1968), and one
step beyond it. Patch-cord wiring, rocker switches, pulsers, lamps, a variable clock, NAND and
AND/NOR gates, J-K flip-flops. Vanilla JavaScript ES modules and SVG. No framework, no build
step, no runtime dependencies. Apache License 2.0.

The goal is behavioral parity with the real H-500, defined in `docs/H500-PARITY.md`, plus the
additions that make it the H-501: the freeform editor, subcircuits ("Make Component") and the
BOM generator. Those stay, and must keep working. The machine is called H-501 on screen; the
original hardware is called H-500 everywhere else, including the parity spec, the preset's
file name and the Add menu's "H-500 parts".

## Repo state on 2026-11-19

- One branch, `main`. Work packages branch from it and merge back with `--no-ff`. The older
  `track*`, `wp*`, `claude-restart` and `h500-parity` branches are fully merged into `main`.
- `node --test` runs the whole suite on Node 20 or later, with nothing installed.
- `docs/WORK-PACKAGES.md` holds the plan and the status of every package.

## Module map

| File | Role |
|------|------|
| `index.html` | The VT220-style terminal (menus, status line) and `<svg id="board">` |
| `menus.js` | Opens and closes the terminal's menus and sets the phosphor colour. Knows nothing about what the items do |
| `boardEditor.js` | All interaction: menus' actions, wiring, selection, moving, the controls, make/ungroup, BOM. Owns `circuit`, `navStack`, `selectedIds` and the simulator. Draws the board at `BOARD_SCALE` (1.2) screen pixels per board unit |
| `editing.js` | Editing rules with no DOM: ids, delete, move, undo history, clock positions, breadcrumb |
| `renderer.js` | `renderCircuit` rebuilds the SVG; `updateCircuit` updates levels in place each clock tick; `wireEnds` lists the terminals that get a connection dot. Draws the layout's nameplate. Reads levels from the simulator and computes nothing |
| `sim/core.js`, `sim/components.js` | The simulator: `createSimulator(flat, { carryFrom })`, settle, virtual-time `advance`, the behavior of each primitive. No DOM, no timers, no wall clock |
| `simDriver.js` | The only place wall-clock time enters: calls `sim.advance` once per animation frame |
| `gateLibrary.js` | type -> `{ svgId, width, height, pins: [{ name, x, y, direction? }] }`. A pin with no `direction` is an input if its name starts with `in`, otherwise an output |
| `gates.svg` | Symbol sprite sheet. Gates and the flip-flop are 84 x 65, controls 40 x 65, HIGH and GND terminals 40 x 30. One terminal per lead |
| `panels/h500.json` | The H-500 layout, loaded at startup, with its board size and nameplate |
| `circuitModel.js` | `createEmptyCircuit`, `migrateCircuit`, `validateCircuit`, `parseCircuitFile`, `serializeCircuit`. Schema version 2 |
| `subcircuits.js` | `flattenCircuit`, `makeComponent`, `ungroupComponent`, `getComponentPins`, `getComponentSize`, `isSubcircuitType` |
| `bomGenerator.js`, `icCatalog.js` | `generateBOM(circuit)` and the 7400-series catalog |
| `fonts/` | Glass TTY VT220, public domain, with its own licence |
| `exampleCircuit.json` | A small version 1 sample, used by tests |
| `test/`, `test/fixtures/` | The test suite and the circuits it runs |

## Known defects

1. "New" makes a 1200 x 800 board, which no longer matches the H-500's 600 x 970. WP9 fixes
   it.

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
- Leave `.bak/` alone. It is ignored by git.
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
