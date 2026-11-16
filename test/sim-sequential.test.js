// WP1 acceptance 7, 8 and 9: counters and a shift register.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSimulator } from '../sim/core.js';

const fixture = name => JSON.parse(readFileSync(new URL(`fixtures/${name}.json`, import.meta.url), 'utf8'));

function pulse(sim, id = 'p') {
  const press = sim.setInput(id, 1);
  const release = sim.setInput(id, 0);
  assert.equal(press.settled && release.settled, true);
  assert.equal(press.raceResolved || release.raceResolved, false);
}

const bits = (sim, n) => Array.from({ length: n }, (_, i) => Number(sim.read(`ff${i}`, 'q')));
const count = (sim, n) => bits(sim, n).reduce((sum, bit, i) => sum + (bit << i), 0);

test('four-bit ripple counter: 16 pulses go 0 to 15 and back to 0', () => {
  const sim = createSimulator(fixture('ripple-counter-4'));
  assert.equal(count(sim, 4), 0);
  const seen = [];
  for (let i = 0; i < 16; i++) {
    sim.setInput('p', 1);
    assert.equal(count(sim, 4), i, 'nothing moves while the pulser is held');
    sim.setInput('p', 0);
    seen.push(count(sim, 4));
  }
  assert.deepEqual(seen, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 0]);
  for (let i = 0; i < 4; i++) assert.equal(sim.readInput(`l${i}`, 'in'), false);
});

test('four-bit ripple counter: the reset switch clears it', () => {
  const sim = createSimulator(fixture('ripple-counter-4'));
  for (let i = 0; i < 11; i++) pulse(sim);
  assert.equal(count(sim, 4), 11);
  sim.setInput('rst', 0);
  assert.equal(count(sim, 4), 0);
  pulse(sim);
  assert.equal(count(sim, 4), 0);
  sim.setInput('rst', 1);
  pulse(sim);
  assert.equal(count(sim, 4), 1);
});

test('three-bit synchronous counter counts 0 to 7 and wraps', () => {
  const sim = createSimulator(fixture('sync-counter-3'));
  assert.equal(count(sim, 3), 0);
  const seen = [];
  for (let i = 0; i < 17; i++) {
    pulse(sim);
    seen.push(count(sim, 3));
  }
  assert.deepEqual(seen, [1, 2, 3, 4, 5, 6, 7, 0, 1, 2, 3, 4, 5, 6, 7, 0, 1]);
});

test('four-bit shift register moves one position per pulse, never two', () => {
  const sim = createSimulator(fixture('shift-register-4'));
  const data = [1, 0, 0, 0, 1, 1, 0, 1, 0, 0, 0, 0];
  let expected = [0, 0, 0, 0];
  for (const bit of data) {
    sim.setInput('d', bit);
    assert.deepEqual(bits(sim, 4), expected, 'data alone moves nothing');
    pulse(sim);
    expected = [bit, ...expected.slice(0, 3)];
    assert.deepEqual(bits(sim, 4), expected);
  }
});
