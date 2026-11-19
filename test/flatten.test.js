// WP2: flattenCircuit is pure, and runtime state lives in the simulator per instance.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flattenCircuit, ungroupComponent } from '../subcircuits.js';
import { createSimulator } from '../sim/core.js';

const wire = (a, b) => {
  const end = text => {
    const dot = text.lastIndexOf('.');
    return { component: text.slice(0, dot), pin: text.slice(dot + 1) };
  };
  return { from: end(a), to: end(b) };
};

// "toggle" is one flip-flop: in0 is its clock, out0 its 1 output.
// "pair" holds two toggles in series, to exercise a subcircuit inside a subcircuit.
function circuit() {
  return {
    version: 2,
    board: { width: 1200, height: 800 },
    components: [
      { id: 'sw1', type: 'switch', x: 40, y: 40, state: 0 },
      { id: 'sw2', type: 'switch', x: 40, y: 200, state: 0 },
      { id: 'u1', type: 'toggle', x: 340, y: 40 },
      { id: 'u2', type: 'toggle', x: 340, y: 200 },
      { id: 'p1', type: 'pair', x: 340, y: 360 },
      { id: 'lamp1', type: 'led', x: 640, y: 40 },
      { id: 'lamp2', type: 'led', x: 640, y: 200 },
      { id: 'lamp3', type: 'led', x: 640, y: 360 }
    ],
    wires: [
      wire('sw1.out', 'u1.in0'),
      wire('sw2.out', 'u2.in0'),
      wire('sw2.out', 'p1.in0'),
      wire('u1.out0', 'lamp1.in'),
      wire('u2.out0', 'lamp2.in'),
      wire('p1.out0', 'lamp3.in')
    ],
    subcircuits: {
      toggle: {
        components: [{ id: 'ff', type: 'jk', x: 0, y: 0 }],
        wires: [],
        pins: [
          { name: 'in0', direction: 'input', internal: { component: 'ff', pin: 'c' }, x: 18, y: 65 },
          { name: 'out0', direction: 'output', internal: { component: 'ff', pin: 'q' }, x: 224, y: 65 }
        ],
        width: 260,
        height: 130
      },
      pair: {
        components: [
          { id: 'a', type: 'toggle', x: 0, y: 0 },
          { id: 'b', type: 'toggle', x: 300, y: 0 }
        ],
        wires: [wire('a.out0', 'b.in0')],
        pins: [
          { name: 'in0', direction: 'input', internal: { component: 'a', pin: 'in0' }, x: 18, y: 65 },
          { name: 'out0', direction: 'output', internal: { component: 'b', pin: 'out0' }, x: 224, y: 65 }
        ],
        width: 260,
        height: 130
      }
    }
  };
}

test('flattenCircuit leaves its argument exactly as it was', () => {
  const input = circuit();
  const copy = structuredClone(input);
  flattenCircuit(input);
  flattenCircuit(input);
  assert.deepEqual(input, copy);
});

test('flattenCircuit returns nothing that is shared with its argument', () => {
  const input = circuit();
  const copy = structuredClone(input);
  const flat = flattenCircuit(input);
  for (const component of flat.components) {
    component.state = 'changed';
    component.id += '!';
  }
  for (const w of flat.wires) {
    w.from.component = 'changed';
    w.to.pin = 'changed';
  }
  for (const pins of Object.values(flat.rootPinMap)) {
    for (const ref of Object.values(pins)) ref.component = 'changed';
  }
  assert.deepEqual(input, copy);
});

test('flattenCircuit gives qualified ids and maps instance pins to the parts behind them', () => {
  const flat = flattenCircuit(circuit());
  assert.deepEqual(
    flat.components.map(c => c.id).sort(),
    ['lamp1', 'lamp2', 'lamp3', 'p1.a.ff', 'p1.b.ff', 'sw1', 'sw2', 'u1.ff', 'u2.ff']
  );
  assert.deepEqual(flat.rootPinMap.u1.in0, { component: 'u1.ff', pin: 'c' });
  assert.deepEqual(flat.rootPinMap.p1.out0, { component: 'p1.b.ff', pin: 'q' });
  assert.ok(flat.wires.some(w => w.from.component === 'p1.a.ff' && w.to.component === 'p1.b.ff'));
});

test('two instances of one subcircuit holding a flip-flop keep different states', () => {
  const input = circuit();
  const copy = structuredClone(input);
  const sim = createSimulator(flattenCircuit(input));

  sim.setInput('sw1', 1);
  sim.setInput('sw1', 0);
  assert.equal(sim.read('u1.ff', 'q'), true);
  assert.equal(sim.read('u2.ff', 'q'), false);
  assert.equal(sim.readInput('lamp1', 'in'), true);
  assert.equal(sim.readInput('lamp2', 'in'), false);

  sim.setInput('sw2', 1);
  sim.setInput('sw2', 0);
  sim.setInput('sw1', 1);
  sim.setInput('sw1', 0);
  assert.equal(sim.read('u1.ff', 'q'), false);
  assert.equal(sim.read('u2.ff', 'q'), true);

  // The nested pair divides sw2 by four: two pulses so far, so a is back LO and b is HI.
  sim.setInput('sw2', 1);
  sim.setInput('sw2', 0);
  assert.equal(sim.read('p1.a.ff', 'q'), false);
  assert.equal(sim.read('p1.b.ff', 'q'), true);
  assert.equal(sim.readInput('lamp3', 'in'), true);

  assert.deepEqual(input, copy, 'simulating wrote nothing onto the circuit');
});

test('ungroupComponent restores the definition as it is, with no saved runtime state', () => {
  const input = circuit();
  ungroupComponent(input, 'u1');
  const restored = input.components.find(c => c.id === 'u1.ff');
  assert.deepEqual(restored, { id: 'u1.ff', type: 'jk', x: 340, y: 40 });
  const sim = createSimulator(flattenCircuit(input));
  sim.setInput('sw1', 1);
  sim.setInput('sw1', 0);
  assert.equal(sim.readInput('lamp1', 'in'), true);
});
