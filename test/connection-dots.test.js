// A terminal with a wire on it is drawn filled; one a wire only passes over is not.
// wireEnds lists the terminals that get the filled dot.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wireEnds } from '../renderer.js';
import GateLibrary from '../gateLibrary.js';

const pin = (type, name) => GateLibrary[type].pins.find(p => p.name === name);
const wire = (from, to) => {
  const [fc, fp] = from.split('.');
  const [tc, tp] = to.split('.');
  return { from: { component: fc, pin: fp }, to: { component: tc, pin: tp } };
};
const circuit = {
  board: { width: 600, height: 400 },
  components: [
    { id: 'sw', type: 'switch', x: 10, y: 300, state: 1 },
    { id: 'a', type: '2nand', x: 100, y: 100 },
    { id: 'b', type: '2nand', x: 300, y: 100 },
    { id: 'lamp', type: 'led', x: 500, y: 100 }
  ],
  wires: [wire('sw.out', 'a.in0'), wire('sw.out', 'b.in1'), wire('a.out', 'lamp.in')],
  subcircuits: {}
};
const key = end => `${end.component}.${end.pin}`;

test('every wired terminal is listed once, at its pin on the board', () => {
  const ends = wireEnds(circuit);
  assert.deepEqual(ends.map(key).sort(), ['a.in0', 'a.out', 'b.in1', 'lamp.in', 'sw.out']);
  const a0 = ends.find(end => key(end) === 'a.in0');
  assert.equal(a0.x, 100 + pin('2nand', 'in0').x);
  assert.equal(a0.y, 100 + pin('2nand', 'in0').y);
});

test('an output feeding two wires gets one dot, not two', () => {
  assert.equal(wireEnds(circuit).filter(end => key(end) === 'sw.out').length, 1);
});

test('terminals with no wire are not listed, whatever passes over them', () => {
  const keys = wireEnds(circuit).map(key);
  for (const unwired of ['a.in1', 'b.in0', 'b.out']) assert.ok(!keys.includes(unwired), unwired);
});

test('each dot knows which output drives it, so it can light with the wire', () => {
  const ends = wireEnds(circuit);
  assert.deepEqual(ends.find(end => key(end) === 'b.in1').source, { component: 'sw', pin: 'out' });
  assert.deepEqual(ends.find(end => key(end) === 'lamp.in').source, { component: 'a', pin: 'out' });
  assert.deepEqual(ends.find(end => key(end) === 'sw.out').source, { component: 'sw', pin: 'out' });
});

test('a wire to a part or pin that is not there draws no dot', () => {
  const broken = { ...circuit, wires: [wire('a.out', 'ghost.in'), wire('a.nope', 'b.in0')] };
  assert.deepEqual(wireEnds(broken), []);
});

test('wireEnds does not change the circuit', () => {
  const before = JSON.stringify(circuit);
  wireEnds(circuit);
  assert.equal(JSON.stringify(circuit), before);
});
