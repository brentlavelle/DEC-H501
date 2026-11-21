// Panel units: growing the board to the right.
// No DOM. boardEditor.js calls these from the Edit menu; tests call them directly.
//
// - addBlankUnit: a fresh copy of the H-501 panel, without its clock, to the right.
// - copyGates: the parts on the board as they are now laid out, without wires or the clock,
//   to the right. On an untouched panel it gives exactly what addBlankUnit gives.
// - copyAll: the parts and the wires. The copy's wires from the clock go to the one clock,
//   so both halves run in step. With no wires on the board it equals copyGates.
// - resizeBoard: the size the board's corner can be dragged to, never cutting anything off.

import { getComponentSize } from './subcircuits.js';

// Splits "ff12" into ["ff", 12] and "n2_7" into ["n2_", 7]. An id with no trailing number
// (the clock is "clk") has no number.
function splitId(id) {
  const match = /^(.*?)(\d+)$/.exec(id);
  return match ? [match[1], Number(match[2])] : [id, null];
}

function highestNumber(components, prefix) {
  let highest = 0;
  for (const c of components) {
    const [p, n] = splitId(c.id);
    if (p === prefix && n !== null && n > highest) highest = n;
  }
  return highest;
}

function highestLabel(components, type) {
  let highest = 0;
  for (const c of components) {
    if (c.type !== type || !/^\d+$/.test(c.label ?? '')) continue;
    highest = Math.max(highest, Number(c.label));
  }
  return highest;
}

// The controls along the bottom edge.
const BOTTOM_ROW = new Set(['pulser', 'switch', 'led']);

// The copy leaves out the clock: one clock serves the whole machine. Where the clock was, the
// bottom row of controls in that panel slides left to close the gap, so the row runs on. A
// panel is `unitWidth` wide; the shift is worked out per panel that holds a clock, and
// controls in other panels stay where they are.
function bottomRowShifts(template, unitWidth) {
  const shifts = new Map(); // panel index -> shift
  for (const clock of template.components.filter(c => c.type === 'clock')) {
    const panel = Math.floor(clock.x / unitWidth);
    const pulsers = template.components
      .filter(c => c.type === 'pulser' && Math.floor(c.x / unitWidth) === panel);
    if (pulsers.length === 0) continue;
    const shift = Math.min(...pulsers.map(c => c.x)) - clock.x;
    if (shift > 0) shifts.set(panel, shift);
  }
  return part => (BOTTOM_ROW.has(part.type) ? shifts.get(Math.floor(part.x / unitWidth)) ?? 0 : 0);
}

// Returns a new circuit: `circuit` with the parts of `template` added to its right, the board
// widened by the template's width. Ids and numeric labels carry on from the highest already
// in use, so it works any number of times and after parts were added or deleted. Nothing
// already on the board moves, and `circuit` is not changed. With `wires`, the template's
// wires are copied too, joined to the copied parts; a wire from a clock, which is never
// copied, stays on that clock.
function addUnitFrom(circuit, template, unitWidth, { wires = false } = {}) {
  const next = structuredClone(circuit);
  const offset = next.board.width;
  const shiftOf = bottomRowShifts(template, unitWidth);
  const idOffsets = new Map();
  const labelOffsets = new Map();
  const taken = new Set(next.components.map(c => c.id));
  const newId = new Map(); // template id -> id of its copy

  for (const part of structuredClone(template.components)) {
    if (part.type === 'clock') continue;
    const copy = structuredClone(part);

    const [prefix, n] = splitId(part.id);
    if (n !== null) {
      if (!idOffsets.has(prefix)) idOffsets.set(prefix, highestNumber(next.components, prefix));
      copy.id = `${prefix}${n + idOffsets.get(prefix)}`;
    }
    let suffix = 2;
    const base = copy.id;
    while (taken.has(copy.id)) copy.id = `${base}_${suffix++}`;
    taken.add(copy.id);
    newId.set(part.id, copy.id);

    if (/^\d+$/.test(part.label ?? '')) {
      if (!labelOffsets.has(part.type)) labelOffsets.set(part.type, highestLabel(next.components, part.type));
      copy.label = String(Number(part.label) + labelOffsets.get(part.type));
    }

    copy.x = part.x + offset - shiftOf(part);
    next.components.push(copy);
  }

  if (wires) {
    const end = ({ component, pin }) => ({ component: newId.get(component) ?? component, pin });
    for (const wire of template.wires) {
      next.wires.push({ from: end(wire.from), to: end(wire.to) });
    }
  }

  next.board = {
    width: offset + template.board.width,
    height: Math.max(next.board.height, template.board.height)
  };
  return next;
}

// A fresh copy of `panel` (the H-501 panel, panels/h500.json) to the right of the board.
export function addBlankUnit(circuit, panel) {
  return addUnitFrom(circuit, panel, panel.board.width);
}

// The board's own parts, as they are laid out now, to the right: the board doubles in width.
// `panel` gives the width of one panel, so the clock's gap is closed in the right place.
export function copyGates(circuit, panel) {
  return addUnitFrom(circuit, circuit, panel.board.width);
}

// The board's parts and wires, as they are now, to the right: the board doubles in width.
export function copyAll(circuit, panel) {
  return addUnitFrom(circuit, circuit, panel.board.width, { wires: true });
}

// The smallest board: one panel wide, so the terminal's menu bar still fits on one line.
export const MIN_BOARD = { width: 600, height: 400 };
// Room kept between the furthest part and the board's edge.
export const BOARD_MARGIN = 8;

// The size the board takes when its corner is dragged to `width` x `height`, in board units:
// whole units, at least MIN_BOARD, and never so small that a part, the nameplate, or a part
// inside a component definition (drawn on the same board when you open the component)
// would fall off the edge. `circuit` is not changed.
export function resizeBoard(circuit, width, height) {
  let right = 0;
  let bottom = 0;
  const cover = (x, y, w, h) => {
    right = Math.max(right, x + w);
    bottom = Math.max(bottom, y + h);
  };
  const coverParts = components => {
    for (const c of components) {
      const size = getComponentSize(circuit, c.type);
      if (size) cover(c.x, c.y, size.width, size.height);
    }
  };
  coverParts(circuit.components);
  for (const def of Object.values(circuit.subcircuits ?? {})) coverParts(def.components ?? []);
  const plate = circuit.nameplate;
  if (plate) cover(plate.x, plate.y, plate.width, plate.height);

  const least = (wanted, floor, needed) => Math.max(Math.round(wanted), floor, Math.ceil(needed));
  return {
    width: least(width, MIN_BOARD.width, right > 0 ? right + BOARD_MARGIN : 0),
    height: least(height, MIN_BOARD.height, bottom > 0 ? bottom + BOARD_MARGIN : 0)
  };
}
