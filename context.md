---
name: "DEC H-501 Logic Trainer — Project Context"
description: "Self-guided context for Codex and Copilot working on the DEC H-501 project."
---

# DEC H-501 Logic Trainer

## What this is
A browser-based recreation of the **DEC H-500/H-501** (1970s–80s) physical digital logic trainer. The goal is a drag-and-drop circuit simulator where users can place logic gates, wire them with patch cables, toggle switches for inputs, and see LED outputs — all in vanilla JS + SVG.

## Current state of the codebase
- **index.html** (1018b) — Entry point. Loads `renderer.js` + `boardEditor.js` via `<script type="module">`. Has a palette with 2NAND/3NAND/4NAND buttons and an SVG canvas (1200×800).
- **boardEditor.js** (73 lines) — Adds drag-and-drop to gates on the board. On mouseup it re-renders the whole circuit to update wires. Has a palette click handler that pushes new gates into `circuit.components`.
- **renderer.js** (56 lines) — Takes a circuit JSON object and draws SVG `<use>` elements for each gate component, plus SVG `<line>` elements for each wire connecting pin-to-pin.
- **gateLibrary.js** (45 lines) — Exports a map of gate type → `{ svgId, pins: [{name, x, y}] }`. Currently has 2nand, 3nand, 4nand, switch, led.
- **exampleCircuit.json** (464b) — Sample circuit: one 2NAND gate, one toggle switch (`sw1`, state=0), one LED (`led1`), and two wires connecting them.
- **gates.svg** (sprite sheet) — `<symbol>` definitions for 2nand/3nand/4nand gates. viewBox="0 0 1000 1000". Output pin is at x=78,y=40; inputs are at x=0,y={varies}.
- **draggable.html** — Prototype for drag-and-drop (Aug 23). A working prototype exists but may have coordinate conversion bugs.
- **draggable.html-whoops** — Old broken prototype (leave alone).
- **gate-preview.html** — Empty file (0 bytes). May be a placeholder for future gate preview tooling.
- **styles.css** — Minimal: just a `.gate` class (stroke/fill).
- **.github/agents/dec-h501.agent.md** — A Codex agent definition doc with detailed architecture notes, core work areas, and constraints. Keep this intact; it's your primary reference alongside this file.
- **and.svg / dont-use.svg / scratch.svg** — Experimental SVG files from earlier iterations. Marked "don't-use" explicitly; leave them alone unless asked to consolidate.

## Project history
Only one commit so far:
```
525e1b2  A draggable 2 leg nand Gate  (Aug 27 2025)
```
The repo is essentially a fresh start from early May 2025 with one committed prototype plus iterative work on the file system since.

## Architecture overview
```
index.html
  ├─ renderer.js      ← circuit JSON → SVG draw (gate + wire rendering)
  ├─ boardEditor.js   ← drag/drop + palette gate placement
  ├─ gateLibrary.js   ← gate type definitions (pins, svgId mappings)
  └─ exampleCircuit.json  ← data model reference
gates.svg              ← sprite sheet (<symbol> definitions)
draggable.html         ← standalone drag prototype
```

## Data model (circuit JSON)
```json
{
  "board": { "width": 1200, "height": 800 },
  "components": [
    { "id": "g1", "type": "2nand", "x": 100, "y": 150 },
    { "id": "sw1", "type": "switch", "x": 20, "y": 140, "state": 0 }
  ],
  "wires": [
    { "from": { "component": "sw1", "pin": "out" },
      "to": { "component": "g1", "pin": "in0" } }
  ]
}
```

Each component has `id`, `type`, `x`, `y`. Switches have a `state` (0/1). LEDs reflect their input state visually. Wires connect named pins between components via the GateLibrary coordinate map.

## Core work areas (from agent.md)
1. **SVG gate symbols** — Need AND, OR, NAND, NOR, NOT, BUF, XOR, XNOR, SR/D/JK flip-flops in `gates.svg` with consistent pin coordinates.
2. **Drag-and-drop** — Coordinate conversion from screen pixels to SVG units; wire re-rendering on drag end.
3. **Patch wire connections** — Click-output-pin → drag → click-input-pin interaction model. Update wires when gates move. Multi-driver, single-load rules.
4. **Switches & LEDs** — Click-to-toggle switches; color-change LEDs.
5. **Logic simulation engine** — Boolean computation per gate type; topological propagation; combinational loop detection.

## Constraints (from agent.md)
- Vanilla JS only. No frameworks or build tools unless explicitly requested.
- Work in SVG user units, not screen pixels.
- Gate pin positions must be deterministic and documented.
- Don't alter gate symbol geometry without verifying pin alignment.

## Where to look next
- Start with `draggable.html` for a working prototype reference.
- Use `.github/agents/dec-h501.agent.md` for detailed architecture guidance.
- This file for a quick scan of the codebase layout and current state.

## I found a similar tool
I recently watched a video from https://www.instagram.com/sagecadence_ that
showed a tool called falstad.com/circut that does what I was looking for.
Over a year into this project and days after usinging better AI models. I don't like the look
of it but it is a WAY better tool. I may take some ideas from it but keep my project pure digital.
That creater is fantastic showing me so many tools that I knew of like Spice that I need to use the
formats that industsry use for later features like save and restore features.