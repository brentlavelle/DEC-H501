# DEC H-501 Digital Logic Trainer

An interactive, browser-based recreation of the classic **DEC H-500/H-501** digital logic trainer — a hands-on educational instrument from the 1970s that let engineers and students build real digital circuits using physical logic gate modules, toggle switches, patch cables, and indicator lamps.

## What Is This?

The DEC H-500/H-501 was a benchtop training system used in the 1970s–80s to teach digital electronics. Users would plug physical logic gate cards into the chassis, route patch cables between pins, flip toggle switches for inputs, and watch indicator lamps light up to see how signals propagated through their circuits.

This project recreates that experience entirely in the browser. No server required, no frameworks, no dependencies — just vanilla HTML, CSS, JavaScript, and SVG running directly from your computer.

## Features

### Circuit Editor
- **Drag-and-drop gates** from a side palette onto an SVG canvas board
- **Patch cord wiring** — click an output pin, drag to an input pin, and release to create a connection
- **Move gates freely** — grab any placed gate and reposition it; wires update automatically
- **Delete wires** — select a wire and press Delete/Backspace to remove it

### Logic Gates & Components
- **AND, OR, NAND, NOR, XOR, XNOR** — all standard two-input gates
- **NOT (Inverter)** — single-input gate
- **JK Flip-Flop** — sequential logic with clock, J/K inputs, and reset
- **2-input, 3-input, and 4-input NANDs** — for building larger combinational circuits
- **Toggle Switches** — set a binary input high or low; click to flip state
- **LED Indicators** — show the output state of any wire in your circuit

### Live Simulation
- **Real-time boolean evaluation** — change a switch and watch the effect ripple through the entire circuit instantly
- **Energized wires glow amber** when their signal is high, making signal flow visually obvious
- **Flip-flops track state** — JK flip-flops remember their Q output across clock edges

### Advanced Tools
- **Save & Load circuits** as JSON files with full schema versioning, validation, and migration
- **Subcircuit creation** — select multiple gates, collapse them into a named IC block, then zoom in to edit the internals
- **BOM Generator** — analyze your finished circuit and get a bill of materials mapping every gate to real 7400-series IC part numbers with quantities

## Getting Started

### Run Locally

The simplest way is to serve the files from a local directory so the browser's ES module system loads correctly:

```bash
python3 -m http.server
# Then open http://localhost:8000 in your browser
```

Any of these work too — they all do the same thing for static files:

```bash
npx serve .           # Node.js
ruby -run -e httpd .  # Ruby (Mac default)
php -S localhost:8000   # PHP
```

Or just open `index.html` directly in most browsers. Some features like the file-save picker may need a server origin, but the core editor works fine either way.

### First Steps

1. Open the palette panel on the left side of the screen
2. Click **Add AND** (or any gate) to drop it onto the board
3. Add another gate and wire them together by dragging from one pin to another
4. Add a switch and connect it to drive your first gate
5. Flip the switch — watch the output update live!

## How the Editor Works

| Feature | How to Use It |
|---------|---------------|
| **Place a gate** | Click its button in the left palette; it appears on the board |
| **Move a gate** | Click and drag it to a new position |
| **Wire two pins** | Click an output pin, drag your mouse to an input pin, release |
| **Toggle a switch** | Click directly on the switch icon on the board |
| **Delete a wire** | Click the wire to select it (turns red), then press Delete/Backspace |
| **Select multiple gates** | Drag a rubber-band rectangle over the empty board |
| **Create an IC box** | Select a group of gates, click "Make Component from Selection", name it |

## Digital Logic Quick Reference

| Gate | Behavior | Meaning |
|------|----------|---------|
| **AND** | Output 1 only when both inputs are 1 | Both conditions met |
| **OR** | Output 1 when either input is 1 | At least one condition met |
| **NAND** | AND with inverted output | Universal gate — build anything from just NANDs |
| **NOR** | OR with inverted output | Also universal |
| **XOR** | Output 1 when inputs differ | "Exclusive or" — different signals pass through |
| **XNOR** | Output 1 when inputs are the same | Equality detector |
| **NOT** | Flips the input bit (0 to 1, 1 to 0) | Inversion |
| **JK Flip-Flop** | Q changes on clock edge based on J,K; holds state otherwise | Memory element |

### Fun Fact
NAND gates are *functionally complete* — any logic circuit can be built from NAND gates alone. The original H-501 shipped with a "nand trainer" card as its core module. This editor lets you explore that same principle: build any gate type by chaining NANDs together.

## Project Structure

```
DEC-H501/
├── index.html              # Main entry point; loads boardEditor.js as ES module
├── styles.css              # Board, palette, wire styling, SVG gate look
├── boardEditor.js          # Core editor: palette clicks, drag-and-drop, wiring, save/load
├── renderer.js             # SVG rendering engine; circuit evaluation + draws gates and wires
├── gateLibrary.js          # Gate definitions: type to SVG symbol ID, pin names and coordinates
├── circuitModel.js         # Schema versioning (v1), validation, migration for JSON files
├── subcircuits.js          # Subcircuit creation, flattening, and ungrouping logic
├── bomGenerator.js         # Bill-of-materials calculation from circuit gate counts
├── icCatalog.js            # 7400-series part lookup: part number to gates-per-package mapping
├── exampleCircuit.json     # Sample circuit that loads on startup
└── gates.svg               # SVG sprite sheet; symbol definitions for all gate visuals
```

### Key Architecture Decisions

- **Zero dependencies** — no build step, no package manager. Just files in a folder.
- **ES module imports** provide clean separation between editor logic, rendering, simulation, and BOM generation.
- **Deterministic pin coordinates** in `gateLibrary.js` — every gate's input/output pins have known `(x, y)` values so wires always align correctly.
- **Boolean evaluation engine** runs on every board update. Handles both combinational logic (all gates) and sequential logic (JK flip-flop state machine).
- **Circuit data model** is a plain JSON object (`components[]`, `wires[]`, `subcircuits{}`), making save/load and BOM generation trivial and future-proof.

## Build-A-Circuit Workflow

The BOM generator bridges the gap between simulation and building circuits for real:

1. Design your circuit in the editor
2. Click **Generate BOM** (top panel)
3. The tool counts every gate type across all levels of your circuit
4. Results show which 7400-series ICs you need, how many packages, and leftover capacity
5. Order those exact part numbers from any electronics distributor (DigiKey, Mouser, Arrow, etc.)

## Roadmap

| Feature | Status |
|---------|--------|
| Save/Load circuits with JSON versioning | Complete |
| Full simulation engine (combinational + JK flip-flops) | Complete |
| Subcircuit creation and zoom into IC boxes | Complete |
| BOM generator with 7400-series part suggestions | Complete |
| Pre-built demo circuits (half-adder, SR latch, counter) | Planned |
| Undo/Redo for board edits | Planned |
| Import/export SPICE netlists for breadboard wiring | Planned |
| H-500/H-501 retro panel aesthetic (dark background, chrome bezels) | Planned |

## Ideas to Try

- **Half Adder** — XOR + AND from two switches driving two LEDs. Teaches binary addition of single bits.
- **SR Latch** — Cross-couple two NAND gates with two switches and one LED. The classic memory element.
- **3-Bit Counter** — Three JK flip-flops as a ripple counter, clocked by one toggle switch. Counts 0–7 on three LEDs.

## License

This project is open-source educational software. Feel free to modify, share, and build upon it.
