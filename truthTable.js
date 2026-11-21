// Truth tables: the rules behind the Truth Table panel. No DOM.
//
// A table is { inputs: [{ component, pin }], outputs: [{ component, pin }] }, saved on the
// circuit as `truthTable`. Inputs are named A, B, C... in order, outputs X, Y, Z...; removing
// a column closes up the names after it.
//
// - terminalRole: whether a terminal takes an input chip, an output chip, or neither.
// - addColumn, removeColumn: a new table with a column added or taken away.
// - liveTable: the table without columns whose part or pin no longer exists.
// - rows: every combination of n inputs, the first input changing slowest, T before F.

import { getComponentPins } from './subcircuits.js';

export const MAX_COLUMNS = 6;
export const INPUT_NAMES = ['A', 'B', 'C', 'D', 'E', 'F'];
export const OUTPUT_NAMES = ['X', 'Y', 'Z', 'U', 'V', 'W'];

// The controls whose single terminal feeds the circuit: on a truth table they are inputs.
const SOURCES = new Set(['switch', 'pulser', 'clock']);
// Power terminals are neither: they never change.
const RAILS = new Set(['hi', 'gnd']);

export function emptyTable() {
  return { inputs: [], outputs: [] };
}

function pinDirection(pin) {
  return pin.direction || (pin.name.startsWith('in') ? 'input' : 'output');
}

// 'input' for the left side of a gate, flip-flop or component and for a switch, pulser or
// clock; 'output' for the right side of a gate, flip-flop or component and for a lamp; null
// for anything else, including HIGH, GND and terminals that do not exist.
export function terminalRole(circuit, componentId, pinName) {
  const component = circuit.components.find(c => c.id === componentId);
  if (!component) return null;
  const pin = getComponentPins(circuit, component.type)?.find(p => p.name === pinName);
  if (!pin) return null;
  if (RAILS.has(component.type)) return null;
  if (SOURCES.has(component.type)) return 'input';
  if (component.type === 'led') return 'output';
  return pinDirection(pin) === 'input' ? 'input' : 'output';
}

const same = (a, b) => a.component === b.component && a.pin === b.pin;
const listFor = side => (side === 'input' ? 'inputs' : 'outputs');

// Returns a new table with `terminal` added as the next column on `side` ('input' or
// 'output'). Throws, with a message for the user, if the terminal is the wrong kind, already
// has a chip, or the side is full.
export function addColumn(circuit, table, side, terminal) {
  const role = terminalRole(circuit, terminal.component, terminal.pin);
  if (role !== side) {
    throw new Error(side === 'input'
      ? 'An input goes on the left side of a gate or flip-flop, or on a switch, pulser or the clock.'
      : 'An output goes on the right side of a gate or flip-flop, or on a lamp.');
  }
  if ([...table.inputs, ...table.outputs].some(t => same(t, terminal))) {
    throw new Error('That terminal is already in the table.');
  }
  const list = listFor(side);
  if (table[list].length >= MAX_COLUMNS) {
    throw new Error(`A table holds at most ${MAX_COLUMNS} ${list}.`);
  }
  return { ...table, [list]: [...table[list], { component: terminal.component, pin: terminal.pin }] };
}

export function removeColumn(table, side, index) {
  const list = listFor(side);
  return { ...table, [list]: table[list].filter((_, i) => i !== index) };
}

export function liveTable(circuit) {
  const table = circuit.truthTable ?? emptyTable();
  const exists = t => terminalRole(circuit, t.component, t.pin) !== null;
  return {
    inputs: (table.inputs ?? []).filter(exists),
    outputs: (table.outputs ?? []).filter(exists)
  };
}

export function columnNames(table) {
  return {
    inputs: table.inputs.map((_, i) => INPUT_NAMES[i]),
    outputs: table.outputs.map((_, i) => OUTPUT_NAMES[i])
  };
}

export function rows(n) {
  if (n === 0) return [];
  const all = [];
  for (let r = 0; r < 2 ** n; r++) {
    all.push(Array.from({ length: n }, (_, col) => ((r >> (n - 1 - col)) & 1) === 0));
  }
  return all;
}
