// Net building and argument checking in sim/core.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSimulator } from '../sim/core.js';

const wire = (a, b) => {
  const end = text => ({ component: text.split('.')[0], pin: text.split('.')[1] });
  return { from: end(a), to: end(b) };
};

test('a wire works in either direction', () => {
  const sim = createSimulator({
    components: [{ id: 'sw', type: 'switch', state: 1 }, { id: 'g', type: 'not' }],
    wires: [wire('g.in', 'sw.out')]
  });
  assert.equal(sim.read('g', 'out'), false);
});

test('a cord chained from one input to the next carries the same signal', () => {
  const sim = createSimulator({
    components: [{ id: 'sw', type: 'switch', state: 0 }, { id: 'g', type: '2nand' }, { id: 'lamp', type: 'led' }],
    wires: [wire('sw.out', 'g.in0'), wire('g.in0', 'g.in1'), wire('g.in1', 'lamp.in')]
  });
  assert.equal(sim.read('g', 'out'), true);
  sim.setInput('sw', 1);
  assert.equal(sim.read('g', 'out'), false);
  assert.equal(sim.readInput('lamp', 'in'), true);
});

test('two outputs on one net: LO wins', () => {
  const sim = createSimulator({
    components: [{ id: 'a', type: 'switch', state: 1 }, { id: 'b', type: 'switch', state: 1 }, { id: 'lamp', type: 'led' }],
    wires: [wire('a.out', 'lamp.in'), wire('b.out', 'lamp.in')]
  });
  assert.equal(sim.readInput('lamp', 'in'), true);
  sim.setInput('b', 0);
  assert.equal(sim.readInput('lamp', 'in'), false);
});

test('the circuit passed in is not modified', () => {
  const flat = {
    components: [{ id: 'p', type: 'pulser' }, { id: 'ff', type: 'jk' }],
    wires: [wire('p.out', 'ff.c')]
  };
  const before = JSON.stringify(flat);
  const sim = createSimulator(flat);
  sim.setInput('p', 1);
  sim.setInput('p', 0);
  assert.equal(sim.read('ff', 'q'), true);
  assert.equal(JSON.stringify(flat), before);
});

test('bad circuits and bad calls throw', () => {
  assert.throws(() => createSimulator({ components: [{ id: 'x', type: 'adder' }], wires: [] }), /Unknown primitive type/);
  assert.throws(() => createSimulator({ components: [{ id: 'x', type: 'not' }, { id: 'x', type: 'not' }], wires: [] }), /Duplicate/);
  assert.throws(() => createSimulator({ components: [{ id: 'x', type: 'not' }], wires: [wire('x.out', 'y.in')] }), /not a pin/);
  assert.throws(() => createSimulator({ components: [{ id: 'x', type: 'led' }], wires: [wire('x.in', 'x.return')] }), /not a pin/);
  assert.throws(() => createSimulator({ components: [{ id: 'c', type: 'clock', hz: 0 }], wires: [] }), /above 0 Hz/);
  const sim = createSimulator({ components: [{ id: 'g', type: 'not' }, { id: 'c', type: 'clock', hz: 1 }], wires: [] });
  assert.throws(() => sim.setInput('g', 1), /not a switch or pulser/);
  assert.throws(() => sim.setInput('nope', 1), /No component/);
  assert.throws(() => sim.setClockRate('g', 1), /not a clock/);
  assert.throws(() => sim.setClockRate('c', -1), /above 0 Hz/);
  assert.throws(() => sim.read('g', 'in'), /no output pin/);
  assert.throws(() => sim.readInput('g', 'out'), /no input pin/);
  assert.throws(() => sim.advance(-1), /0 ms or more/);
});
