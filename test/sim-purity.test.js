// WP1 acceptance 14: nothing under sim/ touches the DOM, timers or wall-clock
// time, or reaches into the renderer or the editor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const simDir = new URL('../sim/', import.meta.url);

function filesUnder(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? filesUnder(new URL(`${entry.name}/`, dir)) : [new URL(entry.name, dir)]
  );
}

const forbidden = [
  'document',
  'window',
  'setTimeout',
  'setInterval',
  'requestAnimationFrame',
  'Date.now',
  'performance.now',
  'renderer.js',
  'boardEditor.js',
  'subcircuits.js'
];

const files = filesUnder(simDir);

test('sim/ holds the simulator', () => {
  const names = files.map(file => file.pathname.split('/sim/')[1]).sort();
  assert.ok(names.includes('core.js') && names.includes('components.js'), names.join(', '));
});

for (const file of files) {
  const name = file.pathname.split('/sim/')[1];
  test(`sim/${name} is free of DOM, timers and wall-clock time`, () => {
    const text = readFileSync(file, 'utf8');
    for (const word of forbidden) {
      assert.ok(!text.includes(word), `sim/${name} mentions "${word}"`);
    }
    for (const [, target] of text.matchAll(/\bimport\b[^'"]*['"]([^'"]+)['"]/g)) {
      assert.ok(target.startsWith('./'), `sim/${name} imports "${target}" from outside sim/`);
    }
  });
}
