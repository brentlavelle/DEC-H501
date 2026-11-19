import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import GateLibrary from '../gateLibrary.js';
import IC_CATALOG from '../icCatalog.js';
import { parseCircuitFile } from '../circuitModel.js';

const root = new URL('../', import.meta.url);
const read = name => readFileSync(new URL(name, root), 'utf8');

const symbolIds = new Set(
  [...read('gates.svg').matchAll(/<symbol\s+id="([^"]+)"/g)].map(match => match[1])
);

test('every gateLibrary svgId is a symbol in gates.svg', () => {
  for (const [type, def] of Object.entries(GateLibrary)) {
    assert.ok(symbolIds.has(def.svgId), `${type} -> missing symbol "${def.svgId}"`);
  }
});

test('symbols the renderer names by hand exist in gates.svg', () => {
  for (const id of ['switch-open', 'switch-closed', 'light-on', 'light-off', 'jk-high']) {
    assert.ok(symbolIds.has(id), `missing symbol "${id}"`);
  }
});

test('every icCatalog type is a gateLibrary type', () => {
  for (const type of Object.keys(IC_CATALOG)) {
    assert.ok(GateLibrary[type], `icCatalog type "${type}" is not in gateLibrary`);
  }
});

test('exampleCircuit.json parses and validates', () => {
  const circuit = parseCircuitFile(read('exampleCircuit.json'));
  assert.ok(circuit.components.length > 0);
});
