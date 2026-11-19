// The panel's power rails: HIGH (+5 V) and GND terminals.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSimulator } from '../sim/core.js';
import { parseCircuitFile, serializeCircuit } from '../circuitModel.js';

const wire = (a, b) => {
  const end = text => ({ component: text.split('.')[0], pin: text.split('.')[1] });
  return { from: end(a), to: end(b) };
};

test('a GND terminal is always LO and a HIGH terminal is always HI', () => {
  const sim = createSimulator({
    components: [{ id: 'g', type: 'gnd' }, { id: 'h', type: 'hi' }, { id: 'lg', type: 'led' }, { id: 'lh', type: 'led' }],
    wires: [wire('g.out', 'lg.in'), wire('h.out', 'lh.in')]
  });
  assert.equal(sim.read('g', 'out'), false);
  assert.equal(sim.read('h', 'out'), true);
  sim.advance(5000);
  assert.equal(sim.readInput('lg', 'in'), false);
  assert.equal(sim.readInput('lh', 'in'), true);
  assert.throws(() => sim.setInput('g', 1), /not a switch or pulser/);
});

test('GND ties an input LO: a NAND with one input grounded outputs HI whatever the other sees', () => {
  const sim = createSimulator({
    components: [{ id: 'g', type: 'gnd' }, { id: 'sw', type: 'switch', state: 0 }, { id: 'n', type: '2nand' }],
    wires: [wire('g.out', 'n.in0'), wire('sw.out', 'n.in1')]
  });
  assert.equal(sim.readInput('n', 'in0'), false);
  assert.equal(sim.read('n', 'out'), true);
  sim.setInput('sw', 1);
  assert.equal(sim.read('n', 'out'), true);
});

test('GND on reset holds a flip-flop cleared; HIGH on reset leaves it free', () => {
  const build = rail =>
    createSimulator({
      components: [{ id: 'r', type: rail }, { id: 'p', type: 'pulser' }, { id: 'ff', type: 'jk' }],
      wires: [wire('r.out', 'ff.reset'), wire('p.out', 'ff.c')]
    });
  const held = build('gnd');
  const free = build('hi');
  for (const sim of [held, free]) {
    sim.setInput('p', 1);
    sim.setInput('p', 0);
  }
  assert.equal(held.read('ff', 'q'), false);
  assert.equal(free.read('ff', 'q'), true);
});

test('a circuit holding both rails survives save and load unchanged', () => {
  const circuit = {
    version: 2,
    board: { width: 600, height: 400 },
    components: [
      { id: 'g', type: 'gnd', x: 30, y: 30 },
      { id: 'h', type: 'hi', x: 30, y: 80 },
      { id: 'n', type: '2nand', x: 140, y: 30 }
    ],
    wires: [wire('g.out', 'n.in0'), wire('h.out', 'n.in1')],
    subcircuits: {}
  };
  assert.deepEqual(parseCircuitFile(serializeCircuit(circuit)), circuit);
});
