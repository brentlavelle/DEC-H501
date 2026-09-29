---
name: "DEC H-501 Roadmap — Layout, Save/Load, Components, IC Mapping"
description: "Working plan for the next four major feature tracks. Update as work lands."
---

# Roadmap

Current baseline (Sep 2026): freeform SVG board, click-drag gate placement, patch-cord
wires drawn as bezier paths, live boolean simulation (`evaluateCircuit` in
[renderer.js](renderer.js)), gate symbols in `gates.svg`, pin maps in
[gateLibrary.js](gateLibrary.js), and one flat circuit JSON
([exampleCircuit.json](exampleCircuit.json)) with no persistence.

Four tracks below are largely independent and can be worked in any order, but the
suggested sequence is: **Save/Load → Components/Subcircuits → IC Mapping → H-500 Panel Look**,
because save/load needs a stable schema before subcircuits add nesting to it, and the
IC-mapping tool is easiest to test once you can build/save a few real circuits.

---

## Track 1 — Save & Load

**Goal:** persist and restore a circuit, with a schema that won't need to be redesigned
once subcircuits (Track 2) land.

1. **Version the schema now.** Add `"version": 1` to the circuit JSON root. Write a tiny
   `migrateCircuit(json)` function that becomes the single place future format changes
   get normalized. Do this before anything else so every saved file is future-proof.
2. **In-memory model / file split.** Pull the `circuit` object and its mutation helpers
   (add component, add wire, delete wire, move component) out of `boardEditor.js` into a
   small `circuitModel.js`. Right now board editor, renderer, and simulation all reach
   into the same object ad hoc; giving it a real module boundary makes save/load (and
   later, undo) much simpler.
3. **Save.**
   - "Save" button serializes `circuit` with `JSON.stringify(circuit, null, 2)`.
   - Prefer the File System Access API (`showSaveFilePicker`) when available for a real
     "Save"/"Save As" experience; fall back to an `<a download>` blob link for other
     browsers.
   - Optional: autosave to `localStorage` on every change (debounced) so a reload/crash
     doesn't lose work-in-progress; treat this as a recovery cache, not the source of
     truth.
4. **Load.**
   - "Load" button opens a file picker (`<input type="file" accept=".json">` or
     `showOpenFilePicker`), reads and `JSON.parse`s, runs it through `migrateCircuit`,
     validates shape (see below), then replaces `circuit` and re-renders.
   - Validation: check `components`/`wires` arrays exist, every wire references
     components/pins that exist in `GateLibrary`, every component `type` is known. Reject
     with a visible error message instead of throwing into the console — this file format
     will eventually be hand-edited or AI-generated, so defensive parsing matters.
5. **New/Reset.** A "New Circuit" action that clears to an empty board with a
   confirmation prompt (this is a destructive, hard-to-undo action from the user's
   perspective even though it's local).
6. **Recent files / examples menu.** Once save/load works, turn `exampleCircuit.json`
   into one of several bundled example circuits (half-adder, SR latch, etc.) selectable
   from a dropdown — good smoke tests for every other track.

Data model impact: none beyond the added `version` field until Track 2.

---

## Track 2 — Components (subcircuits you can hide/zoom into)

**Goal:** select a group of gates + wires, collapse them into a single reusable "IC-like"
box with named external pins, and be able to double-click it to zoom in and edit the
internals.

### Data model changes
Add a `subcircuits` dictionary alongside `components`/`wires`, keyed by a user-defined
type name (e.g. `"halfAdder"`):

```json
{
  "version": 1,
  "board": { "width": 1200, "height": 800 },
  "components": [
    { "id": "u1", "type": "halfAdder", "x": 300, "y": 200 }
  ],
  "wires": [ ... ],
  "subcircuits": {
    "halfAdder": {
      "components": [ { "id": "x1", "type": "xor", ... }, { "id": "a1", "type": "and", ... } ],
      "wires": [ ... ],
      "pins": [
        { "name": "a",   "direction": "input",  "internal": { "component": "x1", "pin": "in0" } },
        { "name": "b",   "direction": "input",  "internal": { "component": "x1", "pin": "in1" } },
        { "name": "sum", "direction": "output", "internal": { "component": "x1", "pin": "out" } },
        { "name": "carry","direction": "output","internal": { "component": "a1", "pin": "out" } }
      ]
    }
  }
}
```

A placed instance (`{"id": "u1", "type": "halfAdder", ...}`) behaves exactly like a gate
instance to the renderer/board-editor: `GateLibrary`-style pin lookup just needs to check
`subcircuits[type].pins` when `type` isn't a built-in gate.

### Steps
1. **Selection.** Add rubber-band (drag-on-empty-canvas) multi-select of components, plus
   shift-click to add/remove from selection. Store selected ids in board-editor state,
   render a highlight outline.
2. **"Make Component" action.**
   - Take selected components + any wires whose both ends are inside the selection →
     move them into a new `subcircuits[newTypeName]` entry.
   - Any wire crossing the selection boundary (one end inside, one outside) becomes an
     external pin: auto-generate a pin name (`in0`, `in1`, `out0`...) or prompt the user
     to name each boundary pin.
   - Replace the selected components/wires in the root circuit with one new component
     instance of the new type, rewiring the boundary wires to point at the new instance's
     pins instead.
   - Prompt for a display name and pin count → auto-generate an "IC box" SVG symbol (a
     simple rectangle sized to the pin count, reusing the existing pin-hotspot rendering
     code path) so no manual `gates.svg` editing is needed per component.
3. **Rendering as a black box.** In `renderer.js`, when a component's `type` isn't in
   `GateLibrary`, look it up in `circuit.subcircuits`; draw a generic IC rectangle with
   the type name as a label and pins positioned evenly down each side (mirrors real DIP
   package numbering — left side inputs, right side outputs, like the existing gate
   symbols).
4. **Simulation.** Easiest correct approach: **flatten at evaluation time**, not at
   authoring time. Before calling `evaluateCircuit`, recursively expand every subcircuit
   instance into its internal components/wires with instance-qualified ids (e.g. `u1.x1`,
   `u1.a1`), rewrite external wires to connect to the mapped internal pin, and evaluate
   the flattened graph as one flat circuit (this already matches what `evaluateCircuit`
   expects — no changes needed there). Cache the flattened graph and only rebuild it when
   `components`/`wires`/`subcircuits` change, since flattening on every render would be
   wasteful once nesting gets deep.
5. **Zoom-in / navigation.**
   - Maintain a navigation stack: `[{type: 'root'}, {type: 'subcircuit', typeName, instanceId}]`.
   - Double-click an IC box → push its subcircuit onto the stack, render
     `circuit.subcircuits[typeName]` as the active editable circuit, with a breadcrumb bar
     ("Root > halfAdder") and a "Back" action.
   - **Important design decision:** a subcircuit *definition* is shared by all instances
     of that type (like editing a symbol, not one instance) — editing it inside the zoom
     view changes every placed copy. Make this explicit in the breadcrumb UI ("Editing
     definition: halfAdder — affects 3 placed instances") so it isn't surprising.
   - Support nested subcircuits (a subcircuit containing another subcircuit instance) —
     the flattening step in (4) should already be recursive, so this should fall out
     naturally if you don't special-case one level of depth.
6. **Un-group.** Inverse of "Make Component" — expand one instance back into loose gates
   at its position, for editing/debugging.

This is the largest track; consider landing it in the order above as separate,
independently testable increments rather than one big change.

---

## Track 3 — IC / Chip-Finder (BOM generator)

**Goal:** given a finished circuit, tell the user which real 7400-series (or CMOS 4000-series)
ICs they'd need to buy to build it on a breadboard, and how many.

1. **Static package catalog.** Add a small data file (e.g. `icCatalog.js`) mapping gate
   type → candidate real chips, since several families exist per gate type:
   ```js
   const IC_CATALOG = {
     nand: [{ part: "74LS00", gatesPerPackage: 4, inputsPerGate: 2 },
            { part: "74LS10", gatesPerPackage: 3, inputsPerGate: 3 },
            { part: "74LS20", gatesPerPackage: 2, inputsPerGate: 4 }],
     nor:  [{ part: "74LS02", gatesPerPackage: 4, inputsPerGate: 2 }],
     and:  [{ part: "74LS08", gatesPerPackage: 4, inputsPerGate: 2 }],
     or:   [{ part: "74LS32", gatesPerPackage: 4, inputsPerGate: 2 }],
     xor:  [{ part: "74LS86", gatesPerPackage: 4, inputsPerGate: 2 }],
     not:  [{ part: "74LS04", gatesPerPackage: 6, inputsPerGate: 1 }],
     jk:   [{ part: "74LS76", gatesPerPackage: 2, inputsPerGate: null }],
     ...
   };
   ```
   Start with the handful of parts covering your existing gate types
   (`and/or/nand/nor/xor/xnor/not/jk`); extend later.
2. **Flatten first.** Reuse the Track 2 flattening step (or, if Track 2 isn't done yet,
   just walk `circuit.components` directly) so the BOM reflects the *actual* primitive
   gate count, not the box-level component count — an `halfAdder` instance should count
   as one XOR + one AND toward the totals, not one mystery part.
3. **Bin-packing.** For each gate type, tally how many instances are needed grouped by
   input count (a 2-input NAND is not interchangeable with a 3-input NAND on the same
   package). Within each (type, input-count) bucket, run a simple first-fit-decreasing
   pack against `gatesPerPackage` to compute minimum chip count. This is the same
   category of problem as bin packing for shipping boxes — no need for anything fancier
   than greedy first-fit for this scale.
4. **Output panel.** A "Generate BOM" button that renders a table: part number, quantity,
   gates-used / gates-available (so the user can see wasted capacity and manually swap
   components between chips if they want fewer packages), plus a rough total gate count
   for a sanity check against the schematic.
5. **Stretch: pin assignment + netlist export.** Once the BOM works, optionally assign
   each flattened gate to a specific package+pin (e.g. "U3 pin 1/2/3") and export a plain
   text netlist (`component, pin, net`) — enough to hand-wire a breadboard or import into
   KiCad/other EDA tools later. Not required for v1 of this track.

This track has no dependency on Track 1/2 beyond wanting a flattening step; it can be
built against the current flat circuit model first and adapted once subcircuits exist.

---

## Track 4 — Original H-500/H-501 Panel Look

**Goal:** move from a plain white SVG canvas toward the look of the physical DEC H-500
faceplate — dark panel background, fixed module bays, a labeled switch/lamp strip —
without giving up the freeform drag placement that already works well.

1. **Reference gathering.** Before drawing anything, collect a few reference photos of
   the real H-500/H-501 panel (module card shape, switch row, lamp row, nameplate/legend
   style, color palette) to pin down concrete visual targets — this is worth doing as a
   short research pass so the art direction is anchored to the real device rather than
   guessed.
2. **Background layer.** Add a static panel-background SVG (new file, e.g.
   `panelBackground.svg`) rendered behind `#board`'s dynamic content: brushed-metal/dark
   panel texture, drawn mounting rails, and a nameplate label. This is pure art, doesn't
   touch the data model.
3. **Fixed module bays / snapping grid.** The real board plugged fixed-size cards into a
   grid of bays rather than freeform placement. Introduce an optional grid-snap: define a
   cell size (matching gate symbol footprint, e.g. 260×130 plus gutter) and snap
   `component.x/y` to the nearest cell on drop in `boardEditor.js`. Keep freeform mode as
   a toggle if you don't want to force it — this is additive, not a rewrite of the drag
   code.
4. **Switch/lamp strip restyle.** Re-skin the existing `switch-open/closed` and
   `light-off/on` symbols in `gates.svg` to match the real toggle-switch and lamp look
   (chrome bezel, red toggle, amber/red lamp lens) — visual-only change, no pin
   coordinate changes needed since hookups are already keyed off `GateLibrary`.
5. **Panel chrome (labels, legends).** Add static text labels near switches/lamps
   (`SW1..SWn`, `L1..Ln`) matching the real unit's silkscreen legends, and a permanent
   "DIGITAL H-500 LOGIC LABORATORY" nameplate graphic, for the full retro-panel feel.

This track is purely additive/visual and safe to interleave with the others whenever you
want a break from data-model work.

---

## Suggested order of attack

1. Track 1 (save/load) — small, unblocks safe experimentation and example-file testing.
2. Track 2 (components/subcircuits) — biggest lift; do it in the sub-steps listed above.
3. Track 3 (IC/BOM finder) — fun, mostly self-contained, good motivation break.
4. Track 4 (H-500 panel look) — art-heavy, no urgency, do in parallel whenever.
