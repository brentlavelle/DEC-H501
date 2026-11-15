// WP1 acceptance 3: results do not depend on the order of the arrays.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { createSimulator } from '../sim/core.js';
import { componentTypes } from '../sim/components.js';

const dir = new URL('fixtures/', import.meta.url);
const names = readdirSync(dir).filter(name => name.endsWith('.json')).sort();

function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(list, random) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Every pin of every component, in an order that does not depend on the arrays.
function snapshot(sim, flat) {
  const pins = { time: sim.time };
  for (const { id, type } of [...flat.components].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    for (const pin of componentTypes[type].outputs) pins[`${id}.${pin}`] = sim.read(id, pin);
    for (const pin of componentTypes[type].inputs) pins[`${id}.${pin} (in)`] = sim.readInput(id, pin);
  }
  return pins;
}

// Power on, then work every switch and pulser and let time pass.
function exercise(flat) {
  const sim = createSimulator(flat);
  const log = [sim.settle(), snapshot(sim, flat)];
  const inputs = flat.components
    .filter(c => c.type === 'switch' || c.type === 'pulser')
    .map(c => c.id)
    .sort();
  for (let round = 0; round < 6; round++) {
    inputs.forEach((id, i) => {
      log.push(sim.setInput(id, (round + i) % 2 === 0), snapshot(sim, flat));
    });
    log.push(sim.advance(130), snapshot(sim, flat));
  }
  return log;
}

test('there are fixtures to check', () => {
  assert.ok(names.length >= 10, `only ${names.length} fixtures`);
});

for (const name of names) {
  test(`order independence: ${name}`, () => {
    const flat = JSON.parse(readFileSync(new URL(name, dir), 'utf8'));
    assert.equal(flat.version, 2);
    for (const c of flat.components) {
      assert.equal(typeof c.x, 'number', `${c.id} needs x`);
      assert.equal(typeof c.y, 'number', `${c.id} needs y`);
    }
    const expected = exercise(flat);
    const random = mulberry32(names.indexOf(name) + 1);
    for (let i = 0; i < 25; i++) {
      const variant = {
        components: shuffled(flat.components, random),
        wires: shuffled(flat.wires, random).map(w => (random() < 0.5 ? w : { from: w.to, to: w.from }))
      };
      assert.deepEqual(exercise(variant), expected, `shuffle ${i}`);
    }
  });
}
