// Truth tables: which terminals take an input or output chip, the columns, and the rows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  terminalRole, addColumn, removeColumn, liveTable, rows, emptyTable, columnNames, logicKey, MAX_COLUMNS
} from '../truthTable.js';
import { parseCircuitFile, serializeCircuit } from '../circuitModel.js';
import { deleteComponents } from '../editing.js';

const panel = () => parseCircuitFile(readFileSync(new URL('../panels/h500.json', import.meta.url), 'utf8'));
const T = true, F = false;
const at = (component, pin) => ({ component, pin });

test('rows: one input gives T, F; two give TT, TF, FT, FF; the first input changes slowest', () => {
  assert.deepEqual(rows(0), []);
  assert.deepEqual(rows(1), [[T], [F]]);
  assert.deepEqual(rows(2), [[T, T], [T, F], [F, T], [F, F]]);
  const three = rows(3);
  assert.equal(three.length, 8);
  assert.deepEqual(three.map(r => r[0]), [T, T, T, T, F, F, F, F]);
  assert.deepEqual(three.map(r => r[2]), [T, F, T, F, T, F, T, F]);
});

test('inputs: the left side of gates and flip-flops, the switches, the pulsers and the clock', () => {
  const circuit = panel();
  for (const [c, p] of [['n2_1', 'in0'], ['n3_1', 'in2'], ['an1', 'in3'], ['ff1', 'j'], ['ff1', 'c'], ['ff1', 'k'],
    ['ff1', 'reset'], ['sw1', 'out'], ['p1', 'out'], ['clk', 'out']]) {
    assert.equal(terminalRole(circuit, c, p), 'input', `${c}.${p}`);
  }
});

test('outputs: the right side of gates and flip-flops, and the lamps; HIGH and GND are neither', () => {
  const circuit = panel();
  for (const [c, p] of [['n2_1', 'out'], ['an1', 'out'], ['ff1', 'q'], ['ff1', 'qbar'], ['l1', 'in']]) {
    assert.equal(terminalRole(circuit, c, p), 'output', `${c}.${p}`);
  }
  assert.equal(terminalRole(circuit, 'hi1', 'out'), null);
  assert.equal(terminalRole(circuit, 'gnd1', 'out'), null);
  assert.equal(terminalRole(circuit, 'nothere', 'out'), null);
  assert.equal(terminalRole(circuit, 'n2_1', 'nope'), null);
});

test('inputs are named A, B, C... and outputs X, Y, Z...', () => {
  const circuit = panel();
  let table = emptyTable();
  table = addColumn(circuit, table, 'input', at('sw1', 'out'));
  table = addColumn(circuit, table, 'input', at('n2_1', 'in0'));
  table = addColumn(circuit, table, 'output', at('l1', 'in'));
  table = addColumn(circuit, table, 'output', at('ff1', 'q'));
  assert.deepEqual(columnNames(table), { inputs: ['A', 'B'], outputs: ['X', 'Y'] });
  assert.deepEqual(table.inputs, [at('sw1', 'out'), at('n2_1', 'in0')]);
});

test('a chip only goes on a terminal of its own kind, and only once', () => {
  const circuit = panel();
  const table = addColumn(circuit, emptyTable(), 'input', at('sw1', 'out'));
  assert.throws(() => addColumn(circuit, table, 'input', at('l1', 'in')), /input/);
  assert.throws(() => addColumn(circuit, table, 'output', at('sw2', 'out')), /output/);
  assert.throws(() => addColumn(circuit, table, 'input', at('hi1', 'out')), /input/);
  assert.throws(() => addColumn(circuit, table, 'input', at('sw1', 'out')), /already/);
});

test('at most six inputs (64 rows) and six outputs', () => {
  const circuit = panel();
  assert.equal(MAX_COLUMNS, 6);
  let table = emptyTable();
  for (let i = 1; i <= 6; i++) table = addColumn(circuit, table, 'input', at(`sw${i}`, 'out'));
  assert.throws(() => addColumn(circuit, table, 'input', at('sw7', 'out')), /6/);
  for (let i = 1; i <= 6; i++) table = addColumn(circuit, table, 'output', at(`l${i}`, 'in'));
  assert.throws(() => addColumn(circuit, table, 'output', at('l7', 'in')), /6/);
});

test('removing a column closes up the letters after it', () => {
  const circuit = panel();
  let table = emptyTable();
  for (const id of ['sw1', 'sw2', 'sw3']) table = addColumn(circuit, table, 'input', at(id, 'out'));
  table = removeColumn(table, 'input', 0);
  assert.deepEqual(table.inputs, [at('sw2', 'out'), at('sw3', 'out')]);
  assert.deepEqual(columnNames(table).inputs, ['A', 'B'], 'what was B is now A');
});

test('a column whose part is gone drops out', () => {
  const circuit = panel();
  let table = emptyTable();
  table = addColumn(circuit, table, 'input', at('sw1', 'out'));
  table = addColumn(circuit, table, 'input', at('sw2', 'out'));
  table = addColumn(circuit, table, 'output', at('l1', 'in'));
  circuit.truthTable = table;
  deleteComponents(circuit, [], ['sw1']);
  assert.deepEqual(liveTable(circuit), { inputs: [at('sw2', 'out')], outputs: [at('l1', 'in')] });
  assert.deepEqual(liveTable({ ...panel() }), emptyTable(), 'no table is an empty table');
});

test('the table is saved with the circuit', () => {
  const circuit = panel();
  circuit.truthTable = addColumn(circuit, emptyTable(), 'input', at('sw1', 'out'));
  assert.deepEqual(parseCircuitFile(serializeCircuit(circuit)).truthTable, circuit.truthTable);
});

test('adding and removing columns never changes the table or circuit it was given', () => {
  const circuit = panel();
  const table = addColumn(circuit, emptyTable(), 'input', at('sw1', 'out'));
  const before = JSON.stringify([circuit, table]);
  addColumn(circuit, table, 'input', at('sw2', 'out'));
  removeColumn(table, 'input', 0);
  assert.equal(JSON.stringify([circuit, table]), before);
});

// The sheet works the table out again only when this key changes, so dragging parts and
// flipping switches stay smooth with a big table open.

test('the table\'s key ignores where parts sit and how switches are set, but not wiring or letters', () => {
  const circuit = panel();
  circuit.truthTable = addColumn(circuit, emptyTable(), 'input', at('sw1', 'out'));
  const key = logicKey(circuit);
  const moved = structuredClone(circuit);
  moved.components.find(c => c.id === 'n2_1').x += 40;
  moved.components.find(c => c.id === 'sw2').state = 1;
  moved.board = { width: 900, height: 1200 };
  assert.equal(logicKey(moved), key, 'moving a part, flipping a switch or resizing the board changes nothing');

  const wired = structuredClone(circuit);
  wired.wires.push({ from: { component: 'sw1', pin: 'out' }, to: { component: 'n2_1', pin: 'in0' } });
  assert.notEqual(logicKey(wired), key, 'a new wire does');
  const lettered = structuredClone(circuit);
  lettered.truthTable = addColumn(lettered, lettered.truthTable, 'output', at('n2_1', 'out'));
  assert.notEqual(logicKey(lettered), key, 'a new letter does');
  const fewer = structuredClone(circuit);
  fewer.components = fewer.components.filter(c => c.id !== 'n2_2');
  assert.notEqual(logicKey(fewer), key, 'a deleted part does');
});
