// WP2: the old evaluator and its runtime fields are gone from the application code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const sources = readdirSync(root).filter(name => name.endsWith('.js'));
const banned = /evaluateCircuit|previousClock|internalState/;

test('there is application code to check', () => {
  for (const name of ['renderer.js', 'boardEditor.js', 'subcircuits.js', 'circuitModel.js']) {
    assert.ok(sources.includes(name), name);
  }
});

for (const name of sources) {
  test(`${name}: no evaluateCircuit, previousClock or internalState`, () => {
    const lines = readFileSync(new URL(name, root), 'utf8').split('\n');
    const hits = lines.map((line, i) => `${name}:${i + 1}: ${line.trim()}`).filter(line => banned.test(line));
    if (name === 'circuitModel.js') {
      // The migration has to name the fields it strips. Nothing else may.
      assert.ok(hits.length <= 1 && hits.every(line => line.includes('RUNTIME_FIELDS')), hits.join('\n'));
    } else {
      assert.deepEqual(hits, []);
    }
  });
}

test('the renderer computes no logic and the simulator is the only evaluator', () => {
  const renderer = readFileSync(new URL('renderer.js', root), 'utf8');
  assert.ok(!/function\s+(readInput|readOutput)\b/.test(renderer));
  assert.ok(!renderer.includes('flattenCircuit'), 'the editor flattens; the renderer only draws');
  const editor = readFileSync(new URL('boardEditor.js', root), 'utf8');
  assert.ok(editor.includes("from './sim/core.js'"));
});
