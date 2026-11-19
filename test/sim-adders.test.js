// WP1 acceptance 13: adders built from NANDs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSimulator } from '../sim/core.js';

const fixture = name => JSON.parse(readFileSync(new URL(`fixtures/${name}.json`, import.meta.url), 'utf8'));

function check(name, inputs) {
  const flat = fixture(name);
  assert.ok(
    flat.components.every(c => ['switch', 'led', '2nand'].includes(c.type)),
    'built from 2-input NANDs only'
  );
  const sim = createSimulator(flat);
  const rows = Array.from({ length: 1 << inputs.length }, (_, row) => inputs.map((_, i) => (row >> i) & 1));
  // Forwards then backwards, so each row is reached from two different rows.
  for (const values of [...rows, ...[...rows].reverse()]) {
    let result;
    inputs.forEach((id, i) => {
      result = sim.setInput(id, values[i]);
    });
    assert.equal(result.settled, true);
    assert.equal(result.raceResolved, false);
    const total = values.reduce((sum, v) => sum + v, 0);
    const got = Number(sim.readInput('l_sum', 'in')) + 2 * Number(sim.readInput('l_carry', 'in'));
    assert.equal(got, total, `${inputs.map((id, i) => `${id}=${values[i]}`).join(' ')}`);
  }
}

test('half adder matches binary addition for every input', () => check('half-adder', ['a', 'b']));
test('full adder matches binary addition for every input', () => check('full-adder', ['a', 'b', 'cin']));
