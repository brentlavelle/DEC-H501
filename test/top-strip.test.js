// WP10: a part added from the Add menu lands in the first free space along the top of the
// board, working left to right, and in the upper-right corner when there is none.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { findFreeSpot, PLACEMENT } from '../editing.js';
import { getComponentSize, makeComponent } from '../subcircuits.js';
import { parseCircuitFile } from '../circuitModel.js';

const { margin, gap } = PLACEMENT;
const preset = () => parseCircuitFile(readFileSync(new URL('../panels/h500.json', import.meta.url), 'utf8'));
const boxesOf = circuit => circuit.components.map(c => ({ id: c.id, x: c.x, y: c.y, ...getComponentSize(circuit, c.type) }));
const size = (circuit, type) => getComponentSize(circuit, type);
const overlaps = (a, b) => !(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);

// Adds a part of `type` where findFreeSpot says, as the Add menu does, and returns its box.
function add(circuit, type, id) {
  const spot = findFreeSpot(boxesOf(circuit), size(circuit, type), circuit.board);
  circuit.components.push({ id, type, x: spot.x, y: spot.y });
  return { id, ...spot, ...size(circuit, type) };
}

test('the first part on the H-500 lands at the left of the top strip, the next to its right', () => {
  const circuit = preset();
  const first = add(circuit, '2nand', 'new1');
  assert.deepEqual([first.x, first.y], [margin, margin]);
  const second = add(circuit, '2nand', 'new2');
  assert.deepEqual([second.x, second.y], [margin + first.width + gap, margin]);
});

test('a part moved out of the strip leaves a gap, and the next part that fits goes into it', () => {
  const circuit = preset();
  const placed = ['a', 'b', 'c', 'd'].map(id => add(circuit, '2nand', id));
  Object.assign(circuit.components.find(c => c.id === 'b'), { x: 450, y: 1200 }); // dragged off the strip
  const next = add(circuit, '2nand', 'e');
  assert.deepEqual([next.x, next.y], [placed[1].x, placed[1].y], 'it reuses b\'s old place, not the space after d');
});

test('a narrow part fits a gap a gate would not', () => {
  const circuit = preset();
  add(circuit, '2nand', 'a');
  const hi = add(circuit, 'hi', 'h');
  add(circuit, '2nand', 'c');
  circuit.components.splice(circuit.components.findIndex(c => c.id === 'h'), 1);
  const gnd = add(circuit, 'gnd', 'g');
  assert.deepEqual([gnd.x, gnd.y], [hi.x, hi.y], 'a 40-wide terminal goes back in the 40-wide hole');
  const gate = add(circuit, '2nand', 'z');
  assert.ok(gate.x > hi.x, 'an 84-wide gate does not');
});

test('a full strip sends the next part to the upper-right corner', () => {
  const circuit = preset();
  const w = size(circuit, '2nand').width;
  // Six 84-wide gates fit between the 8-unit margins of a 600-wide board, 6 units apart.
  const row = [0, 1, 2, 3, 4, 5].map(i => add(circuit, '2nand', `r${i}`));
  row.forEach((box, i) => assert.deepEqual([box.x, box.y], [margin + i * (w + gap), margin], `gate ${i}`));
  const seventh = add(circuit, '2nand', 'r6');
  assert.deepEqual([seventh.x, seventh.y], [circuit.board.width - w - margin, margin]);
});

test('gates, terminals and a component box never overlap each other or the panel', () => {
  const circuit = preset();
  makeComponent(circuit, ['n2_1'], 'Mine'); // a component type, sized by its 130-wide box
  const added = ['2nand', 'hi', 'Mine', 'jk', 'gnd', 'switch', 'led'].map((type, i) => add(circuit, type, `x${i}`));
  const panel = boxesOf(circuit).filter(b => !b.id.startsWith('x'));
  for (const box of added) {
    assert.ok(box.x >= 0 && box.x + box.width <= circuit.board.width, `${box.id} is on the board`);
    for (const other of [...added, ...panel]) {
      if (other.id !== box.id) assert.ok(!overlaps(box, other), `${box.id} overlaps ${other.id}`);
    }
  }
});

test('findFreeSpot changes nothing it is given', () => {
  const circuit = preset();
  const boxes = boxesOf(circuit);
  const footprint = size(circuit, '2nand');
  const board = circuit.board;
  const before = JSON.stringify([boxes, footprint, board]);
  findFreeSpot(boxes, footprint, board);
  assert.equal(JSON.stringify([boxes, footprint, board]), before);
});
