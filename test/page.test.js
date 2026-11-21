// The page and the scripts agree: every element a script looks up by id exists once in
// index.html, and the Add menu offers every primitive type.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import GateLibrary from '../gateLibrary.js';

const read = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const html = read('index.html');
const idsInPage = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);

test('no id appears twice in index.html', () => {
  assert.equal(new Set(idsInPage).size, idsInPage.length);
});

for (const script of ['boardEditor.js', 'menus.js']) {
  test(`every id ${script} looks up is in index.html`, () => {
    const wanted = [...read(script).matchAll(/getElementById\('([^']+)'\)/g)].map(match => match[1]);
    for (const id of wanted) assert.ok(idsInPage.includes(id), `#${id}`);
  });
}

test('both scripts are loaded as modules', () => {
  assert.match(html, /<script type="module" src="boardEditor\.js">/);
  assert.match(html, /<script type="module" src="menus\.js">/);
});

test('the Add menu offers every primitive type exactly once, inside #palette', () => {
  const start = html.indexOf('id="palette"');
  const palette = html.slice(start, html.indexOf('</nav>', start));
  const offered = [...palette.matchAll(/data-gate-type="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual([...offered].sort(), Object.keys(GateLibrary).sort());
  assert.equal([...html.matchAll(/data-gate-type="/g)].length, offered.length, 'none outside the Add menu');
});

test('every menu has a title and a list of items, and there are three phosphor colours', () => {
  const titles = [...html.matchAll(/class="vt-menu-title"[^>]*>([^<]+)</g)].map(match => match[1]);
  assert.deepEqual(titles, ['File', 'Edit', 'Component', 'Add', 'Tools', 'Screen']);
  assert.equal([...html.matchAll(/class="vt-menu-items/g)].length, titles.length);
  const colours = [...html.matchAll(/data-phosphor-choice="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(colours, ['amber', 'green', 'white']);
  const css = read('styles.css');
  for (const colour of ['green', 'white']) assert.ok(css.includes(`:root[data-phosphor="${colour}"]`), colour);
});

test('a switch that is on glows with the same light as a held pulser', () => {
  const css = read('styles.css');
  const rule = selector => {
    const start = css.indexOf(selector);
    assert.ok(start >= 0, `styles.css has ${selector}`);
    return css.slice(start, css.indexOf('}', start));
  };
  const glow = block => block.match(/drop-shadow\([^)]*\)/)?.[0];
  const pulser = glow(rule('#board use[data-type="pulser"][data-state="1"]'));
  assert.ok(pulser, 'the pulser glows');
  assert.equal(glow(rule('#board use[data-type="switch"][data-state="1"]')), pulser);
});

test('the truth table sheet hides with an arrow, and its letters on the board show only while it is open', () => {
  const css = read('styles.css');
  const close = html.match(/<button id="truthCloseBtn"[^>]*>([^<]*)<\/button>/);
  assert.ok(close, 'there is a button to hide the sheet');
  assert.equal(close[1].trim(), '→', 'a right arrow, not an X: nothing is deleted');
  assert.match(close[0], /title="Hide[^"]*"/);
  assert.match(css, /\.tt-tag\s*\{[^}]*display:\s*none/, 'letters hidden by default');
  assert.match(css, /body\.tt-open \.tt-tag\s*\{[^}]*display:\s*inline/, 'and shown while the sheet is open');
  assert.match(read('boardEditor.js'), /classList\.toggle\('tt-open', open\)/, 'the editor marks the page while the sheet is open');
});
