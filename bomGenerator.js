// BOM Generator
// Given a finished circuit (including any collapsed subcircuit components), works out
// which real 7400-series ICs would be needed to build it, and how many of each.

import GateLibrary from './gateLibrary.js';
import { flattenCircuit } from './subcircuits.js';
import IC_CATALOG from './icCatalog.js';

// The panel's controls and terminals are not built from ICs: switches, lamps, pulsers,
// the clock, and the HIGH and GND terminals.
const NON_IC_TYPES = new Set(['switch', 'led', 'pulser', 'clock', 'hi', 'gnd']);

function inputCountFor(type) {
  const pins = GateLibrary[type]?.pins || [];
  return pins.filter(pin => (pin.direction || (pin.name.startsWith('in') ? 'input' : 'output')) === 'input').length;
}

// Returns { rows, unsupported, totalGates }. totalGates counts logic parts only, not controls.
// rows: [{ type, inputs, count, part, gatesPerPackage, packages }]
// unsupported: gate types with no matching catalog entry, so they're called out instead
// of silently omitted.
export function generateBOM(circuit) {
  const { components } = flattenCircuit(circuit);

  const tally = new Map(); // "type:inputCount" -> count
  let totalGates = 0;
  components.forEach(component => {
    if (NON_IC_TYPES.has(component.type)) return;
    totalGates++;
    const inputs = inputCountFor(component.type);
    const key = `${component.type}:${inputs}`;
    tally.set(key, (tally.get(key) || 0) + 1);
  });

  const rows = [];
  const unsupported = [];

  tally.forEach((count, key) => {
    const separatorIndex = key.lastIndexOf(':');
    const type = key.slice(0, separatorIndex);
    const inputs = Number(key.slice(separatorIndex + 1));
    const options = IC_CATALOG[type];

    if (!options) {
      unsupported.push({ type, inputs, count });
      return;
    }

    // Prefer a package whose gate input count matches exactly (e.g. 3-input NAND needs
    // 74LS10, not 74LS00); flip-flops etc. mark inputsPerGate as null (any match).
    const option = options.find(o => o.inputsPerGate === inputs) || options.find(o => o.inputsPerGate === null) || options[0];
    // Gates of the same (type, input count) are fully interchangeable within a package,
    // so plain ceiling division is already the optimal (not just approximate) bin count.
    const packages = Math.ceil(count / option.gatesPerPackage);
    rows.push({ type, inputs, count, part: option.part, gatesPerPackage: option.gatesPerPackage, packages });
  });

  rows.sort((a, b) => a.part.localeCompare(b.part));

  return { rows, unsupported, totalGates };
}
