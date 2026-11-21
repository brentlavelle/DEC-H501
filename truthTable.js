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
// - fillTable: the output columns, worked out on a copy lifted off the board.

import { getComponentPins, flattenCircuit } from './subcircuits.js';
import { componentTypes } from './sim/components.js';

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

// --- Filling in the outputs ---
//
// The circuit is lifted off the board: nothing here touches the live simulator. In the copy,
// every lead attached to something other than HIGH or GND (an unlettered switch, a pulser,
// the clock) is trimmed and reads unknown; an input that was never wired reads HI, as it does
// on the board. Values are three-valued: true, false, or null for unknown. A flip-flop's
// outputs are unknown, because what it holds depends on what happened before, unless its
// reset is held LO. Every gate starts unknown and is worked out until nothing changes; what
// is still unknown then (a held latch, a ring that never settles) reads ?.
// An output cell is 'T' only if the output is T whatever the unknowns are, 'F' likewise,
// and '?' otherwise.

const and3 = values => (values.includes(false) ? false : values.includes(null) ? null : true);
const or3 = values => (values.includes(true) ? true : values.includes(null) ? null : false);
const not3 = value => (value === null ? null : !value);
const xor3 = (a, b) => (a === null || b === null ? null : a !== b);

const LOGIC = {
  and: v => and3(v),
  or: v => or3(v),
  not: v => not3(v[0]),
  nand: v => not3(and3(v)),
  '2nand': v => not3(and3(v)),
  '3nand': v => not3(and3(v)),
  '4nand': v => not3(and3(v)),
  nor: v => not3(or3(v)),
  xor: v => xor3(v[0], v[1]),
  xnor: v => not3(xor3(v[0], v[1])),
  andnor: v => not3(or3([and3([v[0], v[1]]), and3([v[2], v[3]])]))
};

const key = (component, pin) => `${component}\u0000${pin}`;

export function fillTable(circuit, table) {
  const flat = flattenCircuit(circuit);
  const byId = new Map(flat.components.map(c => [c.id, c]));
  const typeOf = id => circuit.components.find(c => c.id === id)?.type;
  // A terminal on the board, as the part and pin that carry it after flattening.
  const resolve = ({ component, pin }) => flat.rootPinMap[component]?.[pin] ?? { component, pin };

  const drivers = new Map(); // input pin -> [output pins driving it]
  for (const w of flat.wires) {
    const k = key(w.to.component, w.to.pin);
    if (!drivers.has(k)) drivers.set(k, []);
    drivers.get(k).push(w.from);
  }

  const logic = flat.components.filter(c => LOGIC[c.type] || c.type === 'jk');
  const limit = 2 * flat.components.length + 8;

  return rows(table.inputs.length).map(values => {
    const heldInputs = new Map(); // gate input pin -> value: a letter on it overrides its wire
    const out = new Map(); // output pin -> value
    table.inputs.forEach((terminal, i) => {
      const { component, pin } = resolve(terminal);
      if (SOURCES.has(typeOf(terminal.component))) out.set(key(component, pin), values[i]);
      else heldInputs.set(key(component, pin), values[i]);
    });
    for (const c of flat.components) {
      if (c.type === 'hi') out.set(key(c.id, 'out'), true);
      else if (c.type === 'gnd') out.set(key(c.id, 'out'), false);
      else if (SOURCES.has(c.type) && !out.has(key(c.id, 'out'))) out.set(key(c.id, 'out'), null); // trimmed
    }

    const outputOf = (component, pin) => (out.has(key(component, pin)) ? out.get(key(component, pin)) : null);
    const read = (component, pin) => {
      const k = key(component, pin);
      if (heldInputs.has(k)) return heldInputs.get(k);
      const from = drivers.get(k);
      if (from) return and3(from.map(d => outputOf(d.component, d.pin))); // several drivers: LO wins
      return componentTypes[byId.get(component)?.type]?.openInput ?? true; // never wired
    };

    for (let pass = 0; pass < limit; pass++) {
      let changed = false;
      for (const c of logic) {
        const results = {};
        if (c.type === 'jk') {
          const reset = read(c.id, 'reset');
          results.q = reset === false ? false : null;
          results.qbar = reset === false ? true : null;
        } else {
          results.out = LOGIC[c.type](componentTypes[c.type].inputs.map(pin => read(c.id, pin)));
        }
        for (const [pin, value] of Object.entries(results)) {
          if (outputOf(c.id, pin) !== value) {
            out.set(key(c.id, pin), value);
            changed = true;
          }
        }
      }
      if (!changed) break;
    }

    const cell = value => (value === true ? 'T' : value === false ? 'F' : '?');
    const outputs = table.outputs.map(terminal => {
      const { component, pin } = resolve(terminal);
      return cell(typeOf(terminal.component) === 'led' ? read(component, pin) : outputOf(component, pin));
    });
    return { inputs: values, outputs };
  });
}
