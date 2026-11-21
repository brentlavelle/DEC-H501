// Filling in the truth table: the circuit is lifted off the board, every lead attached to
// anything but HIGH or GND is trimmed to unknown, and each output reads T only if it is
// always T, F only if always F, and ? otherwise.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fillTable } from '../truthTable.js';
import { parseCircuitFile } from '../circuitModel.js';
import { makeComponent } from '../subcircuits.js';

const wire = (from, to) => {
  const [fc, fp] = from.split('.');
  const [tc, tp] = to.split('.');
  return { from: { component: fc, pin: fp }, to: { component: tc, pin: tp } };
};
const at = text => { const [component, pin] = text.split('.'); return { component, pin }; };
const board = (components, wires = []) => ({
  version: 2, board: { width: 600, height: 400 }, subcircuits: {}, wires,
  components: components.map(([id, type, extra = {}], i) => ({ id, type, x: 10 + 60 * i, y: 100, ...extra }))
});
const outputs = (circuit, inputs, outs) =>
  fillTable(circuit, { inputs: inputs.map(at), outputs: outs.map(at) }).map(row => row.outputs.join(''));

test('a NAND fed by two switches gives the NAND truth table', () => {
  const c = board([['a', 'switch'], ['b', 'switch'], ['n', '2nand']], [wire('a.out', 'n.in0'), wire('b.out', 'n.in1')]);
  assert.deepEqual(outputs(c, ['a.out', 'b.out'], ['n.out']), ['F', 'T', 'T', 'T']);
});

test('letters can sit right on a gate\'s inputs', () => {
  const c = board([['n', '2nand']]);
  assert.deepEqual(outputs(c, ['n.in0', 'n.in1'], ['n.out']), ['F', 'T', 'T', 'T']);
});

test('an input never wired reads HI, as on the board: one lettered input makes an inverter', () => {
  const c = board([['n', '2nand']]);
  assert.deepEqual(outputs(c, ['n.in0'], ['n.out']), ['F', 'T']);
});

test('a lead to a switch that is not in the table is trimmed: unknown, so ? unless the answer is forced', () => {
  const c = board([['s', 'switch', { state: 1 }], ['n', '2nand']], [wire('s.out', 'n.in1')]);
  assert.deepEqual(outputs(c, ['n.in0'], ['n.out']), ['?', 'T'], 'A = F forces a NAND to T whatever the other input');
});

test('leads to HIGH and GND are kept', () => {
  const hi = board([['h', 'hi'], ['n', '2nand']], [wire('h.out', 'n.in1')]);
  assert.deepEqual(outputs(hi, ['n.in0'], ['n.out']), ['F', 'T']);
  const gnd = board([['g', 'gnd'], ['n', '2nand']], [wire('g.out', 'n.in1')]);
  assert.deepEqual(outputs(gnd, ['n.in0'], ['n.out']), ['T', 'T']);
});

test('a letter on a wired gate input overrides the wire, like a test lead', () => {
  const c = board([['s', 'switch', { state: 0 }], ['n', '2nand']], [wire('s.out', 'n.in0')]);
  assert.deepEqual(outputs(c, ['n.in0'], ['n.out']), ['F', 'T']);
});

test('a lamp shows what drives it; a lamp with nothing on it is dark', () => {
  const c = board([['n', '2nand'], ['l', 'led'], ['m', 'led']], [wire('n.out', 'l.in')]);
  assert.deepEqual(outputs(c, ['n.in0', 'n.in1'], ['l.in', 'm.in']), ['FF', 'TF', 'TF', 'TF']);
});

test('a flip-flop remembers, so its outputs are ?, unless reset held LO forces them', () => {
  const free = board([['s', 'switch'], ['f', 'jk']], [wire('s.out', 'f.j')]);
  assert.deepEqual(outputs(free, ['s.out'], ['f.q', 'f.qbar']), ['??', '??']);
  const held = board([['s', 'switch'], ['g', 'gnd'], ['f', 'jk']], [wire('s.out', 'f.j'), wire('g.out', 'f.reset')]);
  assert.deepEqual(outputs(held, ['s.out'], ['f.q', 'f.qbar']), ['FT', 'FT']);
});

test('a NAND latch: set and reset are known, hold is ?', () => {
  // q = NAND(S, qbar), qbar = NAND(R, q); inputs are active LO.
  const c = board([['n1', '2nand'], ['n2', '2nand']], [wire('n2.out', 'n1.in1'), wire('n1.out', 'n2.in0')]);
  // Rows S R: TT (hold), TF (reset), FT (set), FF (both low).
  assert.deepEqual(outputs(c, ['n1.in0', 'n2.in1'], ['n1.out', 'n2.out']), ['??', 'FT', 'TF', 'TT']);
});

test('a ring that never settles reads ?', () => {
  const c = board([['s', 'switch'], ['a', 'not'], ['b', 'not'], ['d', 'not']],
    [wire('a.out', 'b.in'), wire('b.out', 'd.in'), wire('d.out', 'a.in')]);
  assert.deepEqual(outputs(c, ['s.out'], ['a.out']), ['?', '?']);
});

test('the parity example: lamp 5 is the parity of switches 1 to 4', () => {
  const c = parseCircuitFile(readFileSync(new URL('../examples/parity-generator.json', import.meta.url), 'utf8'));
  const rowsOut = fillTable(c, { inputs: ['sw1', 'sw2', 'sw3', 'sw4'].map(id => at(`${id}.out`)), outputs: [at('l5.in')] });
  assert.equal(rowsOut.length, 16);
  for (const row of rowsOut) {
    const ones = row.inputs.filter(Boolean).length;
    assert.equal(row.outputs[0], ones % 2 === 1 ? 'T' : 'F', row.inputs.map(v => (v ? 'T' : 'F')).join(''));
  }
});

test('letters on a component box reach the parts inside', () => {
  // The NAND is wired to switches and a lamp, so grouping it gives the box two inputs and an output.
  const d = board([['a', 'switch'], ['b', 'switch'], ['n', '2nand'], ['l', 'led']],
    [wire('a.out', 'n.in0'), wire('b.out', 'n.in1'), wire('n.out', 'l.in')]);
  makeComponent(d, ['n'], 'Box');
  const box = d.components.find(c2 => c2.type === 'Box').id;
  assert.deepEqual(outputs(d, [`${box}.in0`, `${box}.in1`], [`${box}.out0`]), ['F', 'T', 'T', 'T']);
});

test('filling the table changes nothing on the board', () => {
  const c = board([['s', 'switch', { state: 1 }], ['n', '2nand']], [wire('s.out', 'n.in0')]);
  const before = JSON.stringify(c);
  outputs(c, ['n.in0'], ['n.out']);
  assert.equal(JSON.stringify(c), before);
});

test('rows carry their inputs, in the sheet\'s order', () => {
  const c = board([['n', '2nand']]);
  const filled = fillTable(c, { inputs: [at('n.in0'), at('n.in1')], outputs: [at('n.out')] });
  assert.deepEqual(filled.map(r => r.inputs), [[true, true], [true, false], [false, true], [false, false]]);
});
