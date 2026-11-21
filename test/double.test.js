// WP11: Edit -> Add blank H-501 puts a fresh panel to the right, as many times as you like.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { addBlankUnit, copyGates, copyAll } from '../units.js';
import { parseCircuitFile } from '../circuitModel.js';
import { flattenCircuit, getComponentSize } from '../subcircuits.js';
import { createSimulator } from '../sim/core.js';

const panel = () => parseCircuitFile(readFileSync(new URL('../panels/h500.json', import.meta.url), 'utf8'));
const counter = () => parseCircuitFile(readFileSync(new URL('../examples/binary-counter.json', import.meta.url), 'utf8'));
const box = (circuit, c) => ({ id: c.id, left: c.x, top: c.y, right: c.x + getComponentSize(circuit, c.type).width, bottom: c.y + getComponentSize(circuit, c.type).height });
const count = (circuit, type) => circuit.components.filter(c => c.type === type).length;
const added = (before, after) => after.components.filter(c => !before.components.some(o => o.id === c.id));
const labelsOf = (parts, type) => parts.filter(c => c.type === type).sort((a, b) => a.x - b.x).map(c => c.label);

test('one press: the board is twice as wide and holds a second panel without a clock', () => {
  const before = panel();
  const after = addBlankUnit(before, panel());
  assert.deepEqual(after.board, { width: 1200, height: 970 });
  for (const [type, n] of [['jk', 16], ['2nand', 16], ['3nand', 12], ['4nand', 8], ['andnor', 8],
    ['switch', 16], ['led', 16], ['pulser', 6], ['hi', 12], ['gnd', 4], ['clock', 1]]) {
    assert.equal(count(after, type), n, type);
  }
  assert.deepEqual(after.nameplate, before.nameplate, 'still one nameplate, on the left');
});

test('the new half sits right of the seam, on the board, overlapping nothing', () => {
  const before = panel();
  const after = addBlankUnit(before, panel());
  for (const c of added(before, after)) assert.ok(c.x >= 600, `${c.id} is in the new half`);
  const boxes = after.components.map(c => box(after, c));
  for (const b of boxes) assert.ok(b.left >= 0 && b.right <= 1200 && b.top >= 0 && b.bottom <= 970, `${b.id} on the board`);
  for (const a of boxes) for (const b of boxes) {
    if (a.id < b.id) assert.ok(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top, `${a.id} and ${b.id} overlap`);
  }
});

test('numbering continues: switches and lamps 9 to 16, pulsers 4 to 6, ids in the same pattern', () => {
  const before = panel();
  const parts = added(before, addBlankUnit(before, panel()));
  const numbers = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => String(from + i));
  assert.deepEqual(labelsOf(parts, 'switch'), numbers(9, 16));
  assert.deepEqual(labelsOf(parts, 'led'), numbers(9, 16));
  assert.deepEqual(labelsOf(parts, 'pulser'), numbers(4, 6));
  const ids = parts.map(c => c.id);
  for (const id of ['ff9', 'ff16', 'sw9', 'sw16', 'l9', 'l16', 'p4', 'p6', 'n2_16', 'an8', 'hi12', 'gnd4']) assert.ok(ids.includes(id), id);
});

test('the new bottom row flows: no gap where a clock would be, each lamp over its switch', () => {
  const before = panel();
  const parts = added(before, addBlankUnit(before, panel()));
  const of = type => parts.filter(c => c.type === type).sort((a, b) => a.x - b.x);
  const clock = before.components.find(c => c.type === 'clock');
  assert.equal(of('pulser')[0].x, 600 + clock.x, 'pulser 4 starts where the clock starts on the left');
  const original = before.components;
  const firstPulser = Math.min(...original.filter(c => c.type === 'pulser').map(c => c.x));
  const firstSwitch = Math.min(...original.filter(c => c.type === 'switch').map(c => c.x));
  assert.equal(of('switch')[0].x - of('pulser')[0].x, firstSwitch - firstPulser, 'same pulser-to-switch spacing as the left');
  assert.deepEqual(of('led').map(c => c.x), of('switch').map(c => c.x), 'each lamp over its switch');
});

test('again and again: each press adds one more panel further right, numbering on', () => {
  let circuit = panel();
  circuit = addBlankUnit(circuit, panel());
  const two = circuit;
  circuit = addBlankUnit(circuit, panel());
  assert.equal(circuit.board.width, 1800);
  const third = added(two, circuit);
  for (const c of third) assert.ok(c.x >= 1200, `${c.id} is in the third panel`);
  assert.deepEqual(labelsOf(third, 'switch')[0], '17');
  assert.deepEqual(labelsOf(third, 'pulser'), ['7', '8', '9']);
  assert.equal(new Set(circuit.components.map(c => c.id)).size, circuit.components.length, 'every id unique');
});

test('the existing circuit is left exactly as it was, wires and all, and still runs', () => {
  const before = counter();
  const copy = structuredClone(before);
  const after = addBlankUnit(before, panel());
  assert.deepEqual(before, copy, 'its argument is not changed');
  for (const c of before.components) assert.deepEqual(after.components.find(o => o.id === c.id), c, `${c.id} unchanged`);
  assert.deepEqual(after.wires, before.wires, 'no wires added or lost');
  after.wires.push({ from: { component: 'sw9', pin: 'out' }, to: { component: 'l9', pin: 'in' } });
  const sim = createSimulator(flattenCircuit(after));
  sim.setInput('sw9', 1);
  assert.equal(sim.readInput('l9', 'in'), true, 'a new switch drives a new lamp');
});

test('a panel whose parts were moved or deleted still gets a complete fresh panel', () => {
  const before = panel();
  before.components = before.components.filter(c => c.id !== 'ff1' && c.id !== 'sw8');
  const parts = added(before, addBlankUnit(before, panel()));
  assert.equal(parts.filter(c => c.type === 'jk').length, 8);
  assert.equal(parts.filter(c => c.type === 'switch').length, 8);
  assert.equal(new Set([...before.components, ...parts].map(c => c.id)).size, before.components.length + parts.length);
});

// Copy Gates: the parts as they are laid out now, with no wires and no clock.

test('on an untouched panel, Copy Gates gives exactly what Add Blank gives', () => {
  assert.deepEqual(copyGates(panel(), panel()), addBlankUnit(panel(), panel()));
});

test('Copy Gates copies the layout as changed: moved, added and deleted parts, but no wires', () => {
  const before = counter();
  Object.assign(before.components.find(c => c.id === 'n4_1'), { x: 250, y: 15 });
  before.components = before.components.filter(c => c.id !== 'sw8');
  before.components.push({ id: 'g1', type: 'xor', x: 380, y: 15 });
  const after = copyGates(before, panel());
  const parts = added(before, after);
  assert.equal(after.board.width, 1200);
  assert.equal(parts.length, before.components.length - 1, 'everything but the clock');
  assert.equal(count(after, 'clock'), 1);
  assert.equal(parts.filter(c => c.type === 'switch').length, 7, 'the deleted switch stays deleted');
  const copyOf = (type, x, y) => parts.find(c => c.type === type && c.x === x + 600 && c.y === y);
  assert.ok(copyOf('4nand', 250, 15), 'the moved gate is copied where it now is');
  assert.ok(copyOf('xor', 380, 15), 'the added gate is copied');
  assert.deepEqual(after.wires, before.wires, 'no wires copied');
});

test('Copy Gates on a two-panel board doubles it: four panels, one clock, numbering on', () => {
  const two = addBlankUnit(panel(), panel());
  const four = copyGates(two, panel());
  assert.deepEqual(four.board, { width: 2400, height: 970 });
  assert.equal(count(four, 'jk'), 32);
  assert.equal(count(four, 'switch'), 32);
  assert.equal(count(four, 'clock'), 1);
  const parts = added(two, four);
  assert.equal(Math.max(...parts.filter(c => c.type === 'switch').map(c => Number(c.label))), 32);
  assert.equal(new Set(four.components.map(c => c.id)).size, four.components.length, 'every id unique');
  const sw9 = two.components.find(c => c.id === 'sw9');
  assert.ok(parts.some(c => c.type === 'switch' && c.x === sw9.x + 1200 && c.y === sw9.y), 'the second panel copies across unshifted');
});

test('Copy Gates leaves its argument alone', () => {
  const before = counter();
  const copy = structuredClone(before);
  copyGates(before, panel());
  assert.deepEqual(before, copy);
});

// Copy All: the parts and the wires, still on the one clock.

const shiftRegister = () => parseCircuitFile(readFileSync(new URL('../examples/shift-register.json', import.meta.url), 'utf8'));

test('with no wires on the board, Copy All gives exactly what Copy Gates gives', () => {
  const before = panel();
  before.components.push({ id: 'g1', type: 'xor', x: 8, y: 8 });
  assert.deepEqual(copyAll(before, panel()), copyGates(before, panel()));
});

test('Copy All doubles the wires, each copy joining the copied parts', () => {
  const before = counter();
  const after = copyAll(before, panel());
  assert.equal(after.wires.length, before.wires.length * 2);
  assert.deepEqual(after.wires.slice(0, before.wires.length), before.wires, 'the original wires are untouched');
  const newIds = new Set(added(before, after).map(c => c.id));
  for (const wire of after.wires.slice(before.wires.length)) {
    assert.ok(newIds.has(wire.to.component), `a copied wire ends on a copied part (${wire.to.component})`);
    assert.ok(newIds.has(wire.from.component) || wire.from.component === 'clk', `and starts on a copied part or the clock (${wire.from.component})`);
  }
  assert.equal(count(after, 'clock'), 1, 'still one clock');
});

test('a doubled counter runs on the one clock: both halves count in step', () => {
  const after = copyAll(counter(), panel());
  const hz = after.components.find(c => c.type === 'clock').hz;
  const sim = createSimulator(flattenCircuit(after));
  const read = from => [0, 1, 2, 3, 4, 5, 6, 7]
    .reduce((n, i) => n + (Number(sim.readInput(`l${from + i}`, 'in')) << i), 0);
  let elapsed = 0;
  for (const n of [1, 5, 37, 200]) {
    sim.advance((n - elapsed) * (1000 / hz));
    elapsed = n;
    assert.equal(read(1), n, `left counter after ${n}`);
    assert.equal(read(9), n, `right counter after ${n}`);
  }
});

test('a doubled shift register works on its own switch and pulser', () => {
  const after = copyAll(shiftRegister(), panel());
  const sim = createSimulator(flattenCircuit(after));
  const lamps = from => [0, 1, 2, 3].map(i => (sim.readInput(`l${from + i}`, 'in') ? 1 : 0)).join('');
  sim.setInput('sw9', 1);
  sim.setInput('p4', 1); sim.setInput('p4', 0);
  assert.equal(lamps(9), '1000', 'the copy shifts');
  assert.equal(lamps(1), '0000', 'the original does not');
});

test('Copy All leaves its argument alone', () => {
  const before = counter();
  const copy = structuredClone(before);
  copyAll(before, panel());
  assert.deepEqual(before, copy);
});
