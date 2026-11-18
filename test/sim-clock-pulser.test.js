// WP1 acceptance 10 and 11: the clock, virtual time, and the pulser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSimulator } from '../sim/core.js';

const fixture = name => JSON.parse(readFileSync(new URL(`fixtures/${name}.json`, import.meta.url), 'utf8'));
const counter = () => createSimulator(fixture('clock-counter'));
const count = sim => [0, 1, 2, 3].reduce((sum, i) => sum + (Number(sim.read(`ff${i}`, 'q')) << i), 0);
const state = sim => ({ time: sim.time, clock: sim.read('clk', 'out'), count: count(sim) });

function withRate(hz) {
  const flat = fixture('clock-counter');
  flat.components.find(c => c.id === 'clk').hz = hz;
  return createSimulator(flat);
}

test('10 Hz: advance(1000) holds exactly 10 trailing edges and the counter reads 10', () => {
  const sim = counter();
  assert.deepEqual(state(sim), { time: 0, clock: false, count: 0 });
  const result = sim.advance(1000);
  assert.equal(result.edges, 20, '10 rises and 10 falls');
  assert.equal(result.behind, false);
  assert.equal(result.settled, true);
  assert.deepEqual(state(sim), { time: 1000, clock: false, count: 10 });
});

test('10 Hz: watching the output for one second shows 10 rises and 10 falls', () => {
  const sim = counter();
  let rises = 0;
  let falls = 0;
  let before = sim.read('clk', 'out');
  for (let t = 0; t < 1000; t += 5) {
    sim.advance(5);
    const now = sim.read('clk', 'out');
    if (now && !before) rises++;
    if (!now && before) {
      falls++;
      assert.equal(count(sim), falls, 'the counter steps on the trailing edge');
    }
    before = now;
  }
  assert.deepEqual([rises, falls], [10, 10]);
});

test('advance is additive', () => {
  const whole = counter();
  whole.advance(1000);
  for (const steps of [[500, 500], [333, 667], [100, 0, 50, 850], Array(1000).fill(1)]) {
    const sim = counter();
    for (const ms of steps) sim.advance(ms);
    assert.deepEqual(state(sim), state(whole), `steps ${steps.slice(0, 4)}`);
  }
  const half = counter();
  half.advance(500);
  assert.deepEqual(state(half), { time: 500, clock: false, count: 5 });
});

test('the clock is a square wave: LO for half the period, HI for half, ending each period', () => {
  const slow = withRate(0.25); // period 4000 ms, HI from 2000 to 4000
  slow.advance(1999);
  assert.equal(slow.read('clk', 'out'), false);
  slow.advance(1);
  assert.equal(slow.read('clk', 'out'), true);
  slow.advance(1999);
  assert.deepEqual(state(slow), { time: 3999, clock: true, count: 0 });
  slow.advance(1);
  assert.deepEqual(state(slow), { time: 4000, clock: false, count: 1 });

  const one = withRate(1); // rises at 500, falls at 1000
  one.advance(499);
  assert.equal(one.read('clk', 'out'), false);
  one.advance(1);
  assert.equal(one.read('clk', 'out'), true);
  one.advance(499);
  assert.equal(one.read('clk', 'out'), true);
  one.advance(1);
  assert.deepEqual(state(one), { time: 1000, clock: false, count: 1 });

  const fast = withRate(100); // period 10 ms, HI from 5 to 10
  fast.advance(4);
  assert.equal(fast.read('clk', 'out'), false);
  fast.advance(1);
  assert.equal(fast.read('clk', 'out'), true);
  fast.advance(5);
  assert.deepEqual(state(fast), { time: 10, clock: false, count: 1 });
});

test('1 Hz: one full second shows exactly one rise and one fall', () => {
  const sim = withRate(1);
  const levels = [];
  for (let t = 0; t < 2000; t += 100) {
    sim.advance(100);
    levels.push(sim.read('clk', 'out') ? 1 : 0);
  }
  assert.deepEqual(levels, [0, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 0]);
});

for (const hz of [0.25, 0.5, 1, 10]) {
  test(`${hz} Hz: 12 periods count 12`, () => {
    const sim = withRate(hz);
    sim.advance(12000 / hz);
    assert.equal(count(sim), 12);
  });
}

test('a rate that does not divide 1000 still lands its edge on the whole second', () => {
  const sim = withRate(3);
  sim.advance(1000);
  assert.equal(count(sim), 3);
});

test('exceeding maxEdges reports behind and still moves time to the target', () => {
  const sim = counter();
  const result = sim.advance(1000, { maxEdges: 5 });
  assert.equal(result.behind, true);
  assert.equal(result.edges, 5);
  assert.equal(sim.time, 1000);
  assert.equal(count(sim), 2);

  // The skipped edges are gone; the next call starts from the new time.
  const next = sim.advance(100);
  assert.equal(next.behind, false);
  assert.equal(next.edges, 2);
  assert.equal(sim.time, 1100);
  assert.equal(count(sim), 3);
});

test('the default maxEdges is 10 000', () => {
  const sim = withRate(1000);
  const result = sim.advance(6000);
  assert.equal(result.edges, 10000);
  assert.equal(result.behind, true);
  assert.equal(sim.time, 6000);
});

test('setClockRate restarts the pulse count from now', () => {
  const sim = counter();
  sim.advance(30);
  const result = sim.setClockRate('clk', 1); // rises at 530, falls at 1030
  assert.equal(result.settled, true);
  sim.advance(499);
  assert.equal(sim.read('clk', 'out'), false);
  sim.advance(1);
  assert.equal(sim.read('clk', 'out'), true);
  sim.advance(500);
  assert.deepEqual(state(sim), { time: 1030, clock: false, count: 1 });
});

test('setClockRate while the output is HI does not clock anything', () => {
  const sim = counter();
  sim.advance(60); // rose at 50
  assert.equal(sim.read('clk', 'out'), true);
  sim.setClockRate('clk', 1); // next fall at 1060
  assert.deepEqual(state(sim), { time: 60, clock: true, count: 0 });
  sim.advance(999);
  assert.deepEqual(state(sim), { time: 1059, clock: true, count: 0 });
  sim.advance(1);
  assert.deepEqual(state(sim), { time: 1060, clock: false, count: 1 });
});

test('two clocks: edges are taken in time order', () => {
  const sim = createSimulator({
    components: [
      { id: 'fast', type: 'clock', hz: 10 },
      { id: 'slow', type: 'clock', hz: 1 },
      { id: 'ff_fast', type: 'jk' },
      { id: 'ff_slow', type: 'jk' }
    ],
    wires: [
      { from: { component: 'fast', pin: 'out' }, to: { component: 'ff_fast', pin: 'c' } },
      { from: { component: 'slow', pin: 'out' }, to: { component: 'ff_slow', pin: 'c' } },
      // ff_slow can only set while ff_fast is HI. Both clocks fall at 1000 ms;
      // "fast" goes first, which leaves ff_fast LO after its tenth toggle.
      { from: { component: 'ff_fast', pin: 'q' }, to: { component: 'ff_slow', pin: 'j' } }
    ]
  });
  const result = sim.advance(1000);
  assert.equal(result.edges, 22);
  assert.equal(sim.read('ff_fast', 'q'), false);
  assert.equal(sim.read('ff_slow', 'q'), false);
});

test('pulser: HI while pressed, LO on release, and one press steps a flip-flop once', () => {
  const sim = createSimulator(fixture('pulser-flipflop'));
  assert.equal(sim.read('p', 'out'), false);
  const seen = [];
  for (let i = 0; i < 4; i++) {
    sim.setInput('p', 1);
    assert.equal(sim.read('p', 'out'), true);
    const held = sim.read('ff', 'q');
    sim.advance(250);
    assert.equal(sim.read('ff', 'q'), held, 'holding it does nothing more');
    sim.setInput('p', 0);
    assert.equal(sim.read('p', 'out'), false);
    seen.push(sim.read('ff', 'q'));
    assert.equal(sim.readInput('lamp', 'in'), sim.read('ff', 'q'));
  }
  assert.deepEqual(seen, [true, false, true, false]);
});

test('pulser: a state of 1 in the file is ignored, it powers on LO', () => {
  const sim = createSimulator({ components: [{ id: 'p', type: 'pulser', state: 1 }], wires: [] });
  assert.equal(sim.read('p', 'out'), false);
});
