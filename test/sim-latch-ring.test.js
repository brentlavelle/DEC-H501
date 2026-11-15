// WP1 acceptance 4 and 5: a symmetric race and an oscillator.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSimulator } from '../sim/core.js';

const fixture = name => JSON.parse(readFileSync(new URL(`fixtures/${name}.json`, import.meta.url), 'utf8'));

function rotations(list) {
  return list.map((_, i) => [...list.slice(i), ...list.slice(0, i)]);
}

// 6 rotations x 6 rotations, each also reversed: 72 orderings.
function orderings(flat) {
  const result = [];
  for (const components of rotations(flat.components)) {
    for (const wires of rotations(flat.wires)) {
      result.push({ components, wires });
      result.push({ components: [...components].reverse(), wires: [...wires].reverse() });
    }
  }
  return result;
}

const q = sim => sim.read('n1', 'out');
const qbar = sim => sim.read('n2', 'out');

test('NAND latch: set, hold, reset, hold', () => {
  const sim = createSimulator(fixture('nand-latch'));

  let result = sim.setInput('s_n', 0);
  assert.deepEqual([result.settled, result.raceResolved], [true, false]);
  assert.deepEqual([q(sim), qbar(sim)], [true, false], 'set');

  sim.setInput('s_n', 1);
  assert.deepEqual([q(sim), qbar(sim)], [true, false], 'hold after set');

  result = sim.setInput('r_n', 0);
  assert.deepEqual([result.settled, result.raceResolved], [true, false]);
  assert.deepEqual([q(sim), qbar(sim)], [false, true], 'reset');

  sim.setInput('r_n', 1);
  assert.deepEqual([q(sim), qbar(sim)], [false, true], 'hold after reset');

  assert.equal(sim.readInput('lq', 'in'), false);
  assert.equal(sim.readInput('lqbar', 'in'), true);
});

test('NAND latch powered on with both inputs HI: race resolved, the same way under every ordering', () => {
  const flat = fixture('nand-latch');
  assert.ok(flat.components.filter(c => c.type === 'switch').every(c => c.state === 1));

  const states = new Set();
  const all = orderings(flat);
  assert.ok(all.length >= 20);
  for (const variant of all) {
    const sim = createSimulator(variant);
    assert.equal(sim.powerOn.settled, true);
    assert.equal(sim.powerOn.raceResolved, true);
    assert.deepEqual(sim.powerOn.oscillating, []);
    assert.deepEqual(sim.settle(), { settled: true, sweeps: 1, raceResolved: false, oscillating: [] });
    assert.notEqual(q(sim), qbar(sim), 'outputs are complementary');
    states.add(q(sim));
  }
  assert.equal(states.size, 1);
});

test('NAND latch: releasing both inputs at once is reported as raceResolved', () => {
  // Both inputs LO drive both outputs HI. Releasing both in one step is the race.
  const flat = fixture('nand-latch');
  flat.components.push({ id: 'both', type: 'switch', x: 40, y: 360, state: 0 });
  flat.wires = flat.wires.filter(w => w.from.component !== 's_n' && w.from.component !== 'r_n');
  flat.wires.push(
    { from: { component: 'both', pin: 'out' }, to: { component: 'n1', pin: 'in0' } },
    { from: { component: 'both', pin: 'out' }, to: { component: 'n2', pin: 'in1' } }
  );
  const sim = createSimulator(flat);
  assert.deepEqual([q(sim), qbar(sim)], [true, true]);
  const result = sim.setInput('both', 1);
  assert.equal(result.settled, true);
  assert.equal(result.raceResolved, true);
  assert.deepEqual(result.oscillating, []);
  assert.notEqual(q(sim), qbar(sim));
});

test('ring of three inverters: not settled, names the three gates, bounded', () => {
  const flat = fixture('inverter-ring');
  const sim = createSimulator(flat);
  assert.equal(sim.powerOn.settled, false);
  const result = sim.settle();
  assert.equal(result.settled, false);
  assert.equal(result.raceResolved, false);
  assert.deepEqual(result.oscillating, ['a', 'b', 'c']);
  const limit = 2 * flat.components.length + 8;
  assert.ok(result.sweeps <= 2 * limit, `${result.sweeps} sweeps`);

  const later = sim.advance(1000);
  assert.equal(later.settled, false);
  assert.deepEqual(later.oscillating, ['a', 'b', 'c']);
});
