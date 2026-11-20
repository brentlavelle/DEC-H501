// WP9: the examples on the File menu load, simulate, and do what their titles say.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { parseCircuitFile, createEmptyCircuit } from '../circuitModel.js';
import { flattenCircuit } from '../subcircuits.js';
import { createSimulator } from '../sim/core.js';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const index = JSON.parse(read('examples/index.json'));
const example = file => parseCircuitFile(read(`examples/${file}`));

test('the examples index lists at least the binary counter, each with a file and a title', () => {
  assert.ok(Array.isArray(index) && index.length >= 1);
  assert.ok(index.some(entry => entry.file === 'binary-counter.json'));
  for (const entry of index) {
    assert.equal(typeof entry.title, 'string');
    assert.ok(entry.title.trim(), `${entry.file} has a title`);
    assert.ok(existsSync(new URL(`../examples/${entry.file}`, import.meta.url)), `${entry.file} exists`);
  }
});

test('every example validates, flattens and builds a simulator', () => {
  for (const { file } of index) {
    const circuit = example(file);
    assert.doesNotThrow(() => createSimulator(flattenCircuit(circuit)), file);
  }
});

test('every example on the H-500 panel carries the H-501 nameplate', () => {
  for (const { file } of index) {
    const plate = example(file).nameplate;
    if (plate) assert.deepEqual(plate.text, ['DIGITAL', 'H-501 LOGIC LABORATORY'], file);
  }
});

test('the binary counter counts: after N clock periods the lamps read N, lamp 1 lowest', () => {
  const circuit = example('binary-counter.json');
  const hz = circuit.components.find(c => c.type === 'clock').hz;
  const period = 1000 / hz;
  const lamps = sim => [1, 2, 3, 4, 5, 6, 7, 8]
    .reduce((n, i) => n + (Number(sim.readInput(`l${i}`, 'in')) << (i - 1)), 0);
  const sim = createSimulator(flattenCircuit(circuit));
  assert.equal(lamps(sim), 0, 'all dark at power-on');
  let elapsed = 0;
  for (const n of [1, 2, 3, 8, 100, 255, 256, 257]) {
    sim.advance((n - elapsed) * period);
    elapsed = n;
    assert.equal(lamps(sim), n % 256, `after ${n} periods`);
  }
});

test('an empty board is the size of the H-500 panel, so the terminal still lines up', () => {
  const preset = JSON.parse(read('panels/h500.json'));
  assert.deepEqual(createEmptyCircuit().board, preset.board);
});

test('the shift register moves the data switch one lamp per pulse, never two', () => {
  assert.ok(index.some(entry => entry.file === 'shift-register.json'), 'listed on the menu');
  const sim = createSimulator(flattenCircuit(example('shift-register.json')));
  const lamps = () => [1, 2, 3, 4].map(i => (sim.readInput(`l${i}`, 'in') ? 1 : 0)).join('');
  const pulse = () => { sim.setInput('p1', 1); sim.setInput('p1', 0); };
  assert.equal(lamps(), '0000', 'all dark at power-on');
  sim.setInput('sw1', 1); pulse();
  assert.equal(lamps(), '1000', 'a 1 enters at lamp 1');
  sim.setInput('sw1', 0);
  for (const expected of ['0100', '0010', '0001', '0000']) {
    pulse();
    assert.equal(lamps(), expected);
  }
  // Load 1, 0, 1, 1: after four pulses the first bit in is at lamp 4.
  for (const bit of [1, 0, 1, 1]) { sim.setInput('sw1', bit); pulse(); }
  assert.equal(lamps(), '1101');
  // Holding the pulser down shifts nothing; the shift happens when it is released.
  sim.setInput('sw1', 0);
  sim.setInput('p1', 1);
  assert.equal(lamps(), '1101', 'pressed, not yet released');
  sim.setInput('p1', 0);
  assert.equal(lamps(), '0110');
});

test('the parity generator lights lamp 5 so that the five lamps always show an even number lit', () => {
  assert.ok(index.some(entry => entry.file === 'parity-generator.json'), 'listed on the menu');
  const sim = createSimulator(flattenCircuit(example('parity-generator.json')));
  for (let n = 0; n < 16; n++) {
    const bits = [0, 1, 2, 3].map(i => (n >> i) & 1);
    bits.forEach((bit, i) => sim.setInput(`sw${i + 1}`, bit));
    const label = bits.join('');
    bits.forEach((bit, i) => assert.equal(sim.readInput(`l${i + 1}`, 'in'), Boolean(bit), `lamp ${i + 1} shows switch ${i + 1} for ${label}`));
    const ones = bits.reduce((a, b) => a + b, 0);
    assert.equal(sim.readInput('l5', 'in'), ones % 2 === 1, `parity lamp for ${label}`);
    const lit = [1, 2, 3, 4, 5].filter(i => sim.readInput(`l${i}`, 'in')).length;
    assert.equal(lit % 2, 0, `even number lit for ${label}`);
  }
});
