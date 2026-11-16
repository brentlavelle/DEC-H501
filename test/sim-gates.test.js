// WP1 acceptance 1 and 2: truth tables and the open-input rule.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSimulator } from '../sim/core.js';

// Reference functions, written out separately from sim/components.js.
const reference = {
  and: { pins: ['in0', 'in1'], fn: (a, b) => a && b },
  or: { pins: ['in0', 'in1'], fn: (a, b) => a || b },
  not: { pins: ['in'], fn: a => !a },
  nand: { pins: ['in0', 'in1'], fn: (a, b) => !(a && b) },
  nor: { pins: ['in0', 'in1'], fn: (a, b) => !(a || b) },
  xor: { pins: ['in0', 'in1'], fn: (a, b) => a !== b },
  xnor: { pins: ['in0', 'in1'], fn: (a, b) => a === b },
  '2nand': { pins: ['in0', 'in1'], fn: (a, b) => !(a && b) },
  '3nand': { pins: ['in0', 'in1', 'in2'], fn: (a, b, c) => !(a && b && c) },
  '4nand': { pins: ['in0', 'in1', 'in2', 'in3'], fn: (a, b, c, d) => !(a && b && c && d) },
  andnor: { pins: ['in0', 'in1', 'in2', 'in3'], fn: (a, b, c, d) => !((a && b) || (c && d)) }
};

// One gate "g" with a switch on each of the named pins.
function rig(type, wiredPins) {
  return createSimulator({
    components: [
      { id: 'g', type },
      ...wiredPins.map(pin => ({ id: `sw_${pin}`, type: 'switch', state: 0 }))
    ],
    wires: wiredPins.map(pin => ({
      from: { component: `sw_${pin}`, pin: 'out' },
      to: { component: 'g', pin }
    }))
  });
}

const combinations = n =>
  Array.from({ length: 1 << n }, (_, row) => Array.from({ length: n }, (_, i) => Boolean((row >> i) & 1)));

for (const [type, { pins, fn }] of Object.entries(reference)) {
  test(`truth table: ${type}`, () => {
    const sim = rig(type, pins);
    // Twice through, so every row is also reached from a different previous row.
    for (const values of [...combinations(pins.length), ...combinations(pins.length).reverse()]) {
      let result;
      pins.forEach((pin, i) => {
        result = sim.setInput(`sw_${pin}`, values[i]);
      });
      assert.equal(result.settled, true);
      assert.equal(sim.read('g', 'out'), fn(...values), `${type}(${values.map(Number)})`);
      pins.forEach((pin, i) => assert.equal(sim.readInput('g', pin), values[i]));
    }
  });
}

test('open inputs: an unwired 2nand outputs LO and its inputs read HI', () => {
  const sim = rig('2nand', []);
  assert.equal(sim.read('g', 'out'), false);
  assert.equal(sim.readInput('g', 'in0'), true);
  assert.equal(sim.readInput('g', 'in1'), true);
});

test('open inputs: a 2nand with one input open inverts the other', () => {
  const sim = rig('2nand', ['in0']);
  assert.equal(sim.read('g', 'out'), true);
  sim.setInput('sw_in0', 1);
  assert.equal(sim.read('g', 'out'), false);
});

for (const wired of [['in0', 'in1'], ['in2', 'in3']]) {
  test(`open inputs: andnor with only ${wired.join(', ')} wired outputs LO whatever they see`, () => {
    const sim = rig('andnor', wired);
    for (const values of combinations(2)) {
      wired.forEach((pin, i) => sim.setInput(`sw_${pin}`, values[i]));
      assert.equal(sim.read('g', 'out'), false, `inputs ${values.map(Number)}`);
    }
  });
}

test('open inputs: a lamp with nothing connected is dark', () => {
  const sim = createSimulator({ components: [{ id: 'lamp', type: 'led' }], wires: [] });
  assert.equal(sim.readInput('lamp', 'in'), false);
});

test('a lamp is lit by HI and dark on LO', () => {
  const sim = createSimulator({
    components: [{ id: 'sw', type: 'switch', state: 1 }, { id: 'lamp', type: 'led' }],
    wires: [{ from: { component: 'sw', pin: 'out' }, to: { component: 'lamp', pin: 'in' } }]
  });
  assert.equal(sim.readInput('lamp', 'in'), true);
  sim.setInput('sw', 0);
  assert.equal(sim.readInput('lamp', 'in'), false);
});

test('a HI terminal is always HI', () => {
  const sim = createSimulator({
    components: [{ id: 'h', type: 'hi' }, { id: 'g', type: 'not' }],
    wires: [{ from: { component: 'h', pin: 'out' }, to: { component: 'g', pin: 'in' } }]
  });
  assert.equal(sim.read('h', 'out'), true);
  assert.equal(sim.read('g', 'out'), false);
});
