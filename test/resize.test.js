// WP11: dragging the board's corner changes its size, never smaller than what is on it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resizeBoard, MIN_BOARD, BOARD_MARGIN } from '../units.js';
import { parseCircuitFile, createEmptyCircuit } from '../circuitModel.js';
import { getComponentSize, makeComponent } from '../subcircuits.js';

const panel = () => parseCircuitFile(readFileSync(new URL('../panels/h500.json', import.meta.url), 'utf8'));
const extent = circuit => ({
  right: Math.max(...circuit.components.map(c => c.x + getComponentSize(circuit, c.type).width)),
  bottom: Math.max(...circuit.components.map(c => c.y + getComponentSize(circuit, c.type).height))
});

test('the board grows to whatever size the corner is dragged to', () => {
  assert.deepEqual(resizeBoard(panel(), 900, 1300), { width: 900, height: 1300 });
});

test('sizes come out as whole units', () => {
  assert.deepEqual(resizeBoard(panel(), 900.6, 1300.2), { width: 901, height: 1300 });
});

test('the board cannot shrink past the parts on it', () => {
  const circuit = panel();
  const { right, bottom } = extent(circuit);
  const size = resizeBoard(circuit, 100, 100);
  assert.ok(size.width >= right + BOARD_MARGIN, `width ${size.width} covers the parts (${right})`);
  assert.ok(size.height >= bottom + BOARD_MARGIN, `height ${size.height} covers the parts (${bottom})`);
});

test('a part far out sets the limit', () => {
  const circuit = panel();
  circuit.board = { width: 1400, height: 1400 };
  circuit.components.push({ id: 'far', type: '2nand', x: 1200, y: 1250 });
  assert.deepEqual(resizeBoard(circuit, 600, 970), { width: 1200 + 84 + BOARD_MARGIN, height: 1250 + 65 + BOARD_MARGIN });
});

test('the nameplate counts as something on the board', () => {
  const circuit = createEmptyCircuit();
  circuit.nameplate = { x: 30, y: 800, width: 194, height: 52, text: ['DIGITAL', 'H-501'] };
  assert.equal(resizeBoard(circuit, 600, 400).height, 852 + BOARD_MARGIN);
});

test('parts inside a component definition count too, since they are drawn on the same board', () => {
  const circuit = createEmptyCircuit();
  circuit.board = { width: 1400, height: 1400 };
  circuit.components.push({ id: 'a', type: '2nand', x: 10, y: 10 }, { id: 'b', type: '2nand', x: 900, y: 1100 });
  makeComponent(circuit, ['a', 'b'], 'Wide');
  const size = resizeBoard(circuit, 600, 400);
  assert.ok(size.width >= 890 + 84, 'wide enough for the far gate inside the definition');
  assert.ok(size.height >= 1090 + 65, 'tall enough for it');
});

test('an empty board shrinks no smaller than one panel wide and the minimum height', () => {
  assert.deepEqual(resizeBoard(createEmptyCircuit(), 10, 10), MIN_BOARD);
  assert.equal(MIN_BOARD.width, 600, 'one panel wide, so the terminal menus still fit');
});

test('resizeBoard changes nothing it is given', () => {
  const circuit = panel();
  const copy = structuredClone(circuit);
  resizeBoard(circuit, 2000, 2000);
  assert.deepEqual(circuit, copy);
});
