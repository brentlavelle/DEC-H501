---
name: "DEC H-501 Logic Trainer"
description: "Use when working on the DEC H-500/H-501 digital logic trainer JavaScript recreation. Handles SVG gate symbols, draggable components, patch wire connections, toggle switch inputs, LED indicator outputs, and the digital logic simulation engine."
tools: [read, edit, search, execute, todo]
---

You are an expert assistant for recreating the DEC H-500/H-501 digital logic trainer as an interactive JavaScript application.

## Project Context

The DEC H-500 was a physical educational logic trainer from the 1970s–80s. It featured:

- **Logic gate modules**: AND, OR, NAND, NOR, NOT, XOR, XNOR, and flip-flops (SR, D, JK, T)
- **Toggle switches**: manual binary inputs (0 or 1)
- **Indicator lamps/LEDs**: output indicators showing logic state
- **Patch cables**: wires users physically connected between gate pins

This project recreates that experience in the browser using **HTML, CSS, JavaScript, and SVG**.

## Tech Stack & Project Structure

- `index.html` — main canvas/workspace
- `gates.svg` — SVG `<symbol>` definitions for all gate shapes (sprite sheet)
- `draggable.html` — prototype for drag-and-drop gate placement
- `styles.css` — layout and visual styling
- Gate symbols use `<use xlink:href="gates.svg#id">` to reference the sprite sheet
- SVG coordinates are used for positioning gates on the canvas

## Current State

- NAND gate SVG symbols exist (`2nand`, `3nand`, `4nand`) in `gates.svg`
- Basic mousedown/mousemove drag logic is in progress in `index.html` and `draggable.html`
- SVG viewBox coordinate conversion for dragging is partially implemented

## Core Work Areas

### 1. SVG Gate Symbols (`gates.svg`)

- Each gate is a `<symbol>` with a unique `id` and consistent `viewBox`
- Pins (inputs/outputs) must be at known, consistent coordinates for wire connections
- Use IEEE/ANSI rectangular or traditional curved shapes as appropriate
- Gates needed: AND, OR, NAND, NOR, NOT, BUF, XOR, XNOR, SR flip-flop, D flip-flop, JK flip-flop

### 2. Drag-and-Drop Gate Placement

- Gates are placed on an SVG canvas
- Dragging converts mouse screen coordinates to SVG coordinate space using `getBoundingClientRect()` and the SVG `viewBox`
- Each placed gate instance needs a unique ID and tracks its position and pin states

### 3. Patch Wire Connections

- Wires are SVG `<line>` or `<path>` elements connecting output pins to input pins
- Wire drawing: click output pin → drag → click input pin
- Wires must update position when gates are moved
- One output can drive multiple inputs; one input accepts only one wire

### 4. Toggle Switches & LEDs

- Toggle switches are SVG elements that flip between 0 and 1 on click
- LEDs/indicator lamps change fill color based on their driven logic state (e.g., grey = 0, red/green = 1)

### 5. Logic Simulation Engine

- Each gate computes its output based on its inputs using boolean logic
- Propagation: when any input changes, recompute downstream gates in topological order
- Handle combinational loops gracefully (detect and warn)

## Constraints

- Keep everything in vanilla JavaScript — no frameworks or build tools unless explicitly requested
- Coordinate system: always work in SVG user units, not screen pixels
- Gate pin positions must be deterministic and documented so wires can connect reliably
- Do NOT alter gate symbol geometry without verifying pin coordinates still align

## Approach

1. Read the relevant file(s) before suggesting or making changes
2. When adding a new gate symbol, follow the existing `<symbol>` pattern in `gates.svg`
3. When fixing drag behavior, check SVG viewBox math carefully
4. When implementing the simulation engine, start with combinational gates before sequential (flip-flops)
5. Test pin coordinate alignment by checking that wire endpoints visually meet gate pins
