// WP4: the BOM lists real chips for the logic and nothing for the controls.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateBOM } from '../bomGenerator.js';
import { parseCircuitFile } from '../circuitModel.js';
import { makeComponent } from '../subcircuits.js';
import GateLibrary from '../gateLibrary.js';
import IC_CATALOG from '../icCatalog.js';

const preset = () => parseCircuitFile(readFileSync(new URL('../panels/h500.json', import.meta.url), 'utf8'));
const CONTROLS = ['switch', 'led', 'pulser', 'clock', 'hi', 'gnd'];
const parts = bom => Object.fromEntries(bom.rows.map(row => [row.part, row.packages]));

test('the H-500 inventory needs 2 x 74LS00, 2 x 74LS10, 2 x 74LS20, 2 x 74LS51 and 4 x 74LS73A', () => {
  const bom = generateBOM(preset());
  assert.deepEqual(parts(bom), { '74LS00': 2, '74LS10': 2, '74LS20': 2, '74LS51': 2, '74LS73A': 4 });
  assert.deepEqual(bom.unsupported, []);
});

test('totalGates counts the 30 logic parts and none of the controls', () => {
  assert.equal(generateBOM(preset()).totalGates, 30);
});

test('a board of nothing but controls needs no chips', () => {
  const circuit = {
    version: 2, board: { width: 600, height: 400 }, wires: [], subcircuits: {},
    components: CONTROLS.map((type, i) => ({ id: `c${i}`, type, x: 0, y: 0 }))
  };
  const bom = generateBOM(circuit);
  assert.deepEqual(bom.rows, []);
  assert.deepEqual(bom.unsupported, []);
  assert.equal(bom.totalGates, 0);
});

test('gates inside a component are counted as if they were loose', () => {
  const circuit = preset();
  makeComponent(circuit, ['n2_1', 'n2_2', 'ff1'], 'Bundle');
  const bom = generateBOM(circuit);
  assert.deepEqual(parts(bom), { '74LS00': 2, '74LS10': 2, '74LS20': 2, '74LS51': 2, '74LS73A': 4 });
  assert.equal(bom.totalGates, 30);
});

test('every logic type in the gate library has a chip in the catalog', () => {
  for (const type of Object.keys(GateLibrary)) {
    if (CONTROLS.includes(type)) continue;
    assert.ok(IC_CATALOG[type]?.length, `${type} has a catalog entry`);
  }
});
