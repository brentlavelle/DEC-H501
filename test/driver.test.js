// WP2: the animation-frame driver, run here with a hand-cranked frame source.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDriver, MAX_FRAME_MS } from '../simDriver.js';
import { createSimulator } from '../sim/core.js';

const fixture = name => JSON.parse(readFileSync(new URL(`fixtures/${name}.json`, import.meta.url), 'utf8'));
const count = sim => [0, 1, 2, 3].reduce((sum, i) => sum + (Number(sim.read(`ff${i}`, 'q')) << i), 0);

// Stands in for requestAnimationFrame: frames run only when the test says so.
function frames() {
  let pending = null;
  let cancelled = 0;
  return {
    requestFrame(callback) {
      pending = callback;
      return 1;
    },
    cancelFrame() {
      pending = null;
      cancelled++;
    },
    fire(timestamp) {
      const callback = pending;
      pending = null;
      callback(timestamp);
    },
    get waiting() {
      return pending !== null;
    },
    get cancelled() {
      return cancelled;
    }
  };
}

function rig(sim) {
  const source = frames();
  const changes = [];
  const reports = [];
  const driver = createDriver({
    getSim: () => sim,
    onChange: result => changes.push(result),
    onReport: result => reports.push(result),
    requestFrame: source.requestFrame,
    cancelFrame: source.cancelFrame
  });
  return { source, changes, reports, driver };
}

test('the clamp is 100 ms', () => {
  assert.equal(MAX_FRAME_MS, 100);
});

test('each frame advances the simulator by the time since the last frame', () => {
  const sim = createSimulator(fixture('clock-counter'));
  const { source, driver } = rig(sim);
  driver.start();
  source.fire(5000); // the first frame only sets the time base
  assert.equal(sim.time, 0);
  for (let t = 5016; t <= 6000; t += 16) source.fire(t);
  assert.equal(sim.time, 992);
  assert.equal(count(sim), 9);
  source.fire(6008);
  assert.equal(sim.time, 1008);
  assert.equal(count(sim), 10);
  assert.ok(source.waiting, 'it keeps asking for the next frame');
});

test('a long gap is clamped, so a background tab does not replay minutes', () => {
  const sim = createSimulator(fixture('clock-counter'));
  const { source, driver } = rig(sim);
  driver.start();
  source.fire(0);
  source.fire(10 * 60 * 1000);
  assert.equal(sim.time, 100);
  assert.equal(count(sim), 1);
  source.fire(10 * 60 * 1000 - 50); // a timestamp that goes backwards adds nothing
  assert.equal(sim.time, 100);
});

test('onChange fires only on frames that applied a clock edge; onReport fires every frame', () => {
  const sim = createSimulator(fixture('clock-counter')); // rises at 50, falls at 100
  const { source, changes, reports, driver } = rig(sim);
  driver.start();
  source.fire(0);
  source.fire(20);
  source.fire(40);
  assert.equal(changes.length, 0);
  source.fire(60);
  assert.equal(changes.length, 1);
  source.fire(80);
  assert.equal(changes.length, 1);
  source.fire(100);
  assert.equal(changes.length, 2);
  assert.equal(reports.length, 6);
  assert.ok(reports.every(result => result.settled && !result.behind));
});

test('a circuit with no clock is never redrawn by the driver', () => {
  const sim = createSimulator(fixture('nand-latch'));
  const { source, changes, driver } = rig(sim);
  driver.start();
  for (let t = 0; t < 500; t += 16) source.fire(t);
  assert.equal(changes.length, 0);
});

test('an oscillating circuit is reported on every frame', () => {
  const sim = createSimulator(fixture('inverter-ring'));
  const { source, reports, driver } = rig(sim);
  driver.start();
  source.fire(0);
  source.fire(16);
  assert.equal(reports.length, 2);
  assert.ok(reports.every(result => result.settled === false));
  assert.deepEqual(reports[1].oscillating, ['a', 'b', 'c']);
});

test('with no simulator a frame does nothing and the loop keeps running', () => {
  const { source, reports, driver } = rig(null);
  driver.start();
  source.fire(0);
  source.fire(16);
  assert.equal(reports.length, 0);
  assert.ok(source.waiting);
});

test('the simulator can be swapped between frames', () => {
  let sim = createSimulator(fixture('clock-counter'));
  const source = frames();
  const driver = createDriver({ getSim: () => sim, requestFrame: source.requestFrame, cancelFrame: source.cancelFrame });
  driver.start();
  source.fire(0);
  source.fire(100);
  source.fire(200);
  source.fire(300);
  source.fire(400);
  source.fire(500);
  assert.equal(count(sim), 5);
  sim = createSimulator(fixture('clock-counter'), { carryFrom: sim });
  source.fire(600);
  assert.equal(sim.time, 600);
  assert.equal(count(sim), 6);
});

test('stop cancels the pending frame, and start does not double up', () => {
  const sim = createSimulator(fixture('clock-counter'));
  const { source, driver } = rig(sim);
  driver.start();
  driver.start();
  assert.equal(driver.running, true);
  source.fire(0);
  driver.stop();
  assert.equal(driver.running, false);
  assert.equal(source.cancelled, 1);
  assert.equal(source.waiting, false);
  driver.start();
  source.fire(90000); // a fresh time base after a restart
  assert.equal(sim.time, 0);
});
