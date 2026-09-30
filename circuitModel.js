// Circuit Model
// Schema versioning, validation, and migration for circuit JSON files.
// This is the single place future circuit-file format changes get normalized.

import GateLibrary from './gateLibrary.js';
import { getComponentPins } from './subcircuits.js';

export const CURRENT_VERSION = 1;

export function createEmptyCircuit() {
  return {
    version: CURRENT_VERSION,
    board: { width: 1200, height: 800 },
    components: [],
    wires: [],
    subcircuits: {}
  };
}

// Brings any older/unversioned circuit file up to the current schema shape.
export function migrateCircuit(raw) {
  const circuit = { ...raw };

  if (typeof circuit.version !== 'number') {
    // Pre-versioning files: only shape ever seen is board + components + wires.
    circuit.version = 1;
  }

  circuit.board = circuit.board || { width: 1200, height: 800 };
  circuit.components = Array.isArray(circuit.components) ? circuit.components : [];
  circuit.wires = Array.isArray(circuit.wires) ? circuit.wires : [];
  circuit.subcircuits = circuit.subcircuits && typeof circuit.subcircuits === 'object' ? circuit.subcircuits : {};

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
  const circuit = migrateCircuit(raw);
  return validateCircuit(circuit);
}

export function serializeCircuit(circuit) {
  return JSON.stringify({ ...circuit, version: CURRENT_VERSION }, null, 2);
}
