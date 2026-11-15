// WP1 acceptance 6: the J-K flip-flop.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSimulator } from '../sim/core.js';

// One flip-flop "ff" with a switch on each named pin. Unnamed pins stay open.
function rig(start = { j: 0, k: 0, c: 0, reset: 1 }) {
  return createSimulator({
    components: [
      { id: 'ff', type: 'jk' },
      ...Object.entries(start).map(([pin, state]) => ({ id: pin, type: 'switch', state }))
    ],
    wires: Object.keys(start).map(pin => ({
      from: { component: pin, pin: 'out' },
      to: { component: 'ff', pin }
    }))
  });
}

const q = sim => {
  assert.equal(sim.read('ff', 'qbar'), !sim.read('ff', 'q'), 'qbar is the complement of q');
  return sim.read('ff', 'q');
};

// Puts the flip-flop in a known state with one full clock pulse.
function force(sim, value) {
  sim.setInput('j', value);
  sim.setInput('k', !value);
  sim.setInput('c', 1);
  sim.setInput('c', 0);
  assert.equal(q(sim), value);
}

test('power-on state is q LO, qbar HI', () => {
  assert.equal(q(rig()), false);
});

const rows = [
  { name: 'hold', j: 0, k: 0, next: before => before },
  { name: 'set', j: 1, k: 0, next: () => true },
  { name: 'clear', j: 0, k: 1, next: () => false },
  { name: 'complement', j: 1, k: 1, next: before => !before }
];

for (const { name, j, k, next } of rows) {
  for (const before of [false, true]) {
    test(`${name} from q=${Number(before)}: nothing on the rising edge, acts on the trailing edge`, () => {
      const sim = rig();
      force(sim, before);
      sim.setInput('j', j);
      sim.setInput('k', k);
      assert.equal(q(sim), before, 'setting J and K with the clock LO');
      sim.setInput('c', 1);
      assert.equal(q(sim), before, 'rising edge');
      sim.setInput('c', 0);
      assert.equal(q(sim), next(before), 'trailing edge');
      sim.settle();
      assert.equal(q(sim), next(before), 'stays put afterwards');
    });
  }
}

test('J and K changing while the clock is steady LO do nothing', () => {
  for (const before of [false, true]) {
    const sim = rig();
    force(sim, before);
    for (const [j, k] of [[1, 0], [1, 1], [0, 1], [0, 0], [1, 1], [0, 0]]) {
      sim.setInput('j', j);
      sim.setInput('k', k);
      assert.equal(q(sim), before);
    }
  }
});

test('J and K changing while the clock is steady HI do nothing, and are not remembered', () => {
  for (const before of [false, true]) {
    const sim = rig();
    force(sim, before);
    sim.setInput('j', 0);
    sim.setInput('k', 0);
    sim.setInput('c', 1);
    for (const [j, k] of [[1, 0], [1, 1], [0, 1], [0, 0], [1, 1], [0, 0]]) {
      sim.setInput('j', j);
      sim.setInput('k', k);
      assert.equal(q(sim), before);
    }
    // J and K are both LO again at the trailing edge, so this is a hold.
    sim.setInput('c', 0);
    assert.equal(q(sim), before);
  }
});

test('J and K are read at the trailing edge', () => {
  const sim = rig();
  sim.setInput('c', 1);
  sim.setInput('j', 1);
  sim.setInput('c', 0);
  assert.equal(q(sim), true);
});

test('reset LO forces q LO at once, with no clock', () => {
  for (const c of [0, 1]) {
    const sim = rig();
    force(sim, true);
    sim.setInput('c', c);
    assert.equal(q(sim), true);
    sim.setInput('reset', 0);
    assert.equal(q(sim), false, `clock steady at ${c}`);
  }
});

test('while reset is held LO the clock does nothing; held HI it does nothing itself', () => {
  const sim = rig({ j: 1, k: 1, c: 0, reset: 0 });
  for (let i = 0; i < 3; i++) {
    sim.setInput('c', 1);
    sim.setInput('c', 0);
    assert.equal(q(sim), false);
  }
  sim.setInput('reset', 1);
  assert.equal(q(sim), false, 'releasing reset changes nothing');
  sim.setInput('c', 1);
  sim.setInput('c', 0);
  assert.equal(q(sim), true, 'the clock works again');
});

test('reset LO wins over a simultaneous trailing edge', () => {
  // One switch drives both c and reset, so they fall in the same step.
  // J and K are open, so the trailing edge alone would complement q to HI.
  // A second flip-flop clocked from q catches even a momentary HI on it.
  const sim = createSimulator({
    components: [{ id: 'ff', type: 'jk' }, { id: 'x', type: 'switch', state: 1 }, { id: 'watch', type: 'jk' }],
    wires: [
      { from: { component: 'x', pin: 'out' }, to: { component: 'ff', pin: 'c' } },
      { from: { component: 'x', pin: 'out' }, to: { component: 'ff', pin: 'reset' } },
      { from: { component: 'ff', pin: 'q' }, to: { component: 'watch', pin: 'c' } }
    ]
  });
  assert.equal(q(sim), false);
  for (let i = 0; i < 3; i++) {
    sim.setInput('x', 0);
    assert.equal(q(sim), false);
    sim.setInput('x', 1);
    assert.equal(q(sim), false);
  }
  assert.equal(sim.read('watch', 'q'), false, 'q never pulsed HI');
});

test('reset open is inactive; J and K open complement', () => {
  const sim = rig({ c: 0 });
  assert.equal(sim.readInput('ff', 'reset'), true);
  assert.equal(sim.readInput('ff', 'j'), true);
  assert.equal(sim.readInput('ff', 'k'), true);
  const seen = [];
  for (let i = 0; i < 4; i++) {
    sim.setInput('c', 1);
    sim.setInput('c', 0);
    seen.push(q(sim));
  }
  assert.deepEqual(seen, [true, false, true, false]);
});

test('a flip-flop with its clock open never changes', () => {
  const sim = rig({ j: 1, k: 0 });
  sim.setInput('j', 0);
  sim.setInput('j', 1);
  sim.advance(1000);
  assert.equal(q(sim), false);
});
