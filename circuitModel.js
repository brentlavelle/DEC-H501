// Circuit Model
// Schema versioning, validation, and migration for circuit JSON files.
// This is the single place future circuit-file format changes get normalized.
//
// Version 2 (docs/H500-PARITY.md, section 8): adds andnor, pulser, clock (with hz) and hi,
// an optional label on any component, and a user-set board size. Runtime state is no
// longer saved, and the lamp has one pin.

import GateLibrary from './gateLibrary.js';
import { getComponentPins } from './subcircuits.js';

export const CURRENT_VERSION = 2;

// Fields older versions of the app wrote onto components while simulating.
const RUNTIME_FIELDS = ['previousClock', 'previousJ', 'previousK', 'internalState'];
// Types whose `state` was runtime state, not something the user set.
const STATELESS_TYPES = new Set(['jk', 'pulser']);

export function createEmptyCircuit() {
  return {
    version: CURRENT_VERSION,
    board: { width: 1200, height: 800 },
    components: [],
    wires: [],
    subcircuits: {}
  };
}

function cleanComponent(component) {
  const copy = { ...component };
  for (const field of RUNTIME_FIELDS) delete copy[field];
  if (STATELESS_TYPES.has(copy.type)) delete copy.state;
  return copy;
}

const copyWire = wire => ({ ...wire, from: { ...wire.from }, to: { ...wire.to } });

// A copy of the circuit with runtime state removed at every level. Wiring is kept.
function withoutRuntimeState(circuit) {
  const subcircuits = {};
  for (const [name, def] of Object.entries(circuit.subcircuits || {})) {
    subcircuits[name] = {
      ...def,
      components: (def.components || []).map(cleanComponent),
      wires: (def.wires || []).map(copyWire),
      pins: (def.pins || []).map(pin => ({ ...pin, internal: pin.internal && { ...pin.internal } }))
    };
  }
  return {
    ...circuit,
    board: circuit.board && { ...circuit.board },
    components: circuit.components.map(cleanComponent),
    wires: circuit.wires.map(copyWire),
    subcircuits
  };
}

// Version 1 -> 2: the lamp's `return` pin is gone. Drops every wire that ends on it,
// every subcircuit pin that led to it, and every wire that ended on such a pin.
function dropLampReturn(circuit) {
  const removedPins = {}; // subcircuit type -> Set of external pin names that went away
  const isGone = (level, end) => {
    const component = level.components.find(c => c.id === end?.component);
    if (!component) return false;
    if (component.type === 'led') return end.pin === 'return';
    return Boolean(removedPins[component.type]?.has(end.pin));
  };

  // A definition can only lose a pin through a definition it contains, so repeat until
  // nothing changes. Each round removes at least one pin or stops.
  for (let changed = true; changed; ) {
    changed = false;
    for (const [name, def] of Object.entries(circuit.subcircuits)) {
      const kept = def.pins.filter(pin => !isGone(def, pin.internal));
      if (kept.length !== def.pins.length) {
        removedPins[name] = removedPins[name] || new Set();
        def.pins.filter(pin => !kept.includes(pin)).forEach(pin => removedPins[name].add(pin.name));
        def.pins = kept;
        changed = true;
      }
    }
  }

  for (const level of [circuit, ...Object.values(circuit.subcircuits)]) {
    level.wires = level.wires.filter(wire => !isGone(level, wire.from) && !isGone(level, wire.to));
  }
}

// Brings any older/unversioned circuit file up to the current schema shape.
// Returns a new object; the argument is not modified.
export function migrateCircuit(raw) {
  // Pre-versioning files: only shape ever seen is board + components + wires.
  const fromVersion = typeof raw.version === 'number' ? raw.version : 1;

  const circuit = withoutRuntimeState({
    ...raw,
    board: raw.board || { width: 1200, height: 800 },
    components: Array.isArray(raw.components) ? raw.components : [],
    wires: Array.isArray(raw.wires) ? raw.wires : [],
    subcircuits: raw.subcircuits && typeof raw.subcircuits === 'object' ? raw.subcircuits : {}
  });

  if (fromVersion < 2) dropLampReturn(circuit);

  circuit.version = CURRENT_VERSION;
  return circuit;
}

// Throws with a human-readable message describing the first problem found.
export function validateCircuit(circuit) {
  if (!circuit || typeof circuit !== 'object') {
    throw new Error('Circuit file is not a JSON object.');
  }
  if (!Array.isArray(circuit.components)) {
    throw new Error('Circuit file is missing a "components" array.');
  }
  if (!Array.isArray(circuit.wires)) {
    throw new Error('Circuit file is missing a "wires" array.');
  }

  const ids = new Set();
  for (const component of circuit.components) {
    if (!component.id || !component.type) {
      throw new Error('Every component needs an "id" and "type".');
    }
    if (ids.has(component.id)) {
      throw new Error(`Duplicate component id "${component.id}".`);
    }
    ids.add(component.id);
    if (!GateLibrary[component.type] && !circuit.subcircuits?.[component.type]) {
      throw new Error(`Unknown component type "${component.type}".`);
    }
    if ('label' in component && typeof component.label !== 'string') {
      throw new Error(`The label on "${component.id}" must be text.`);
    }
    if (component.type === 'clock' && 'hz' in component) {
      if (typeof component.hz !== 'number' || !Number.isFinite(component.hz) || component.hz <= 0) {
        throw new Error(`Clock "${component.id}" needs a rate above 0 Hz.`);
      }
    }
  }

  for (const wire of circuit.wires) {
    for (const end of [wire.from, wire.to]) {
      if (!end || !end.component || !end.pin) {
        throw new Error('Every wire needs "from" and "to" with a component and pin.');
      }
      if (!ids.has(end.component)) {
        throw new Error(`Wire references unknown component "${end.component}".`);
      }
      const pins = getComponentPins(circuit, circuit.components.find(c => c.id === end.component).type);
      if (!pins.some(pin => pin.name === end.pin)) {
        throw new Error(`Wire references unknown pin "${end.pin}" on "${end.component}".`);
      }
    }
  }

  return circuit;
}

export function parseCircuitFile(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('File is not valid JSON.');
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Circuit file is not a JSON object.');
  }
  const circuit = migrateCircuit(raw);
  return validateCircuit(circuit);
}

// Holds only what the user set: wiring, layout, switch positions, clock rates.
export function serializeCircuit(circuit) {
  return JSON.stringify({ ...withoutRuntimeState(circuit), version: CURRENT_VERSION }, null, 2);
}
