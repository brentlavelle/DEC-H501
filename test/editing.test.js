// Delete, undo, id generation, group move and the clock selector (editing.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CLOCK_RATES, nextClockRate, nextComponentId, deleteComponents, moveComponents,
  carryControlSettings, createHistory
} from '../editing.js';
import { makeComponent, ungroupComponent, flattenCircuit } from '../subcircuits.js';
import { parseCircuitFile, serializeCircuit, validateCircuit } from '../circuitModel.js';
import { createSimulator } from '../sim/core.js';

const wire = (a, ap, b, bp) => ({ from: { component: a, pin: ap }, to: { component: b, pin: bp } });
const part = (id, type, x = 0, y = 0, extra = {}) => ({ id, type, x, y, ...extra });

function chain() {
  return {
    version: 2,
    board: { width: 600, height: 400 },
    components: [part('s', 'switch'), part('g1', 'not'), part('g2', 'not'), part('lamp', 'led')],
    wires: [wire('s', 'out', 'g1', 'in'), wire('g1', 'out', 'g2', 'in'), wire('g2', 'out', 'lamp', 'in')],
    subcircuits: {}
  };
}

test('deleting a part removes it and every wire that touched it', () => {
  const circuit = chain();
  assert.equal(deleteComponents(circuit, [], ['g1']), 1);
  assert.deepEqual(circuit.components.map(c => c.id), ['s', 'g2', 'lamp']);
  assert.deepEqual(circuit.wires, [wire('g2', 'out', 'lamp', 'in')]);
  assert.doesNotThrow(() => validateCircuit(circuit));
});

test('deleting several parts at once, and a part nothing is wired to', () => {
  const circuit = chain();
  circuit.components.push(part('lonely', 'not'));
  assert.equal(deleteComponents(circuit, [], ['s', 'g2', 'lonely']), 3);
  assert.deepEqual(circuit.components.map(c => c.id), ['g1', 'lamp']);
  assert.deepEqual(circuit.wires, []);
});

test('deleting an id that is not there changes nothing', () => {
  const circuit = chain();
  assert.equal(deleteComponents(circuit, [], ['nope']), 0);
  assert.equal(circuit.components.length, 4);
  assert.equal(circuit.wires.length, 3);
});

test('a circuit that lost a part still simulates', () => {
  const circuit = chain();
  deleteComponents(circuit, [], ['g1']);
  const sim = createSimulator(flattenCircuit(circuit));
  assert.equal(typeof sim.read('g2', 'out'), 'boolean');
});

test('inside a subcircuit, deleting the part behind an external pin drops the pin and the wires on it', () => {
  const circuit = chain();
  makeComponent(circuit, ['g1', 'g2'], 'pair'); // s -> pair.in0 ... pair.out0 -> lamp
  const instance = circuit.components.find(c => c.type === 'pair').id;
  assert.equal(circuit.wires.length, 2);

  deleteComponents(circuit, ['pair'], ['g1']);
  const def = circuit.subcircuits.pair;
  assert.deepEqual(def.components.map(c => c.id), ['g2']);
  assert.deepEqual(def.pins.map(p => p.name), ['out0']);
  assert.deepEqual(circuit.wires, [wire(instance, 'out0', 'lamp', 'in')]);
  assert.doesNotThrow(() => validateCircuit(circuit));
  assert.doesNotThrow(() => createSimulator(flattenCircuit(circuit)));
});

test('losing a pin cascades out through a definition that holds an instance', () => {
  const circuit = chain();
  makeComponent(circuit, ['g1', 'g2'], 'inner');
  const innerId = circuit.components.find(c => c.type === 'inner').id;
  makeComponent(circuit, [innerId], 'outer');
  const outerId = circuit.components.find(c => c.type === 'outer').id;

  deleteComponents(circuit, ['outer', 'inner'], ['g1']);
  assert.deepEqual(circuit.subcircuits.inner.pins.map(p => p.name), ['out0']);
  assert.deepEqual(circuit.subcircuits.outer.pins.map(p => p.name), ['out0']);
  assert.deepEqual(circuit.wires, [wire(outerId, 'out0', 'lamp', 'in')]);
  assert.doesNotThrow(() => validateCircuit(circuit));
});

test('ids: the first one on an empty board, and never one already in use', () => {
  assert.equal(nextComponentId([]), 'g1');
  assert.equal(nextComponentId([part('g1', 'not'), part('g2', 'not')]), 'g3');
});

test('ids: a delete in the middle does not make the next id collide (the old length + 1 scheme did)', () => {
  const components = [part('g1', 'not'), part('g2', 'not'), part('g3', 'not')];
  const remaining = components.filter(c => c.id !== 'g2');
  assert.equal(nextComponentId(remaining), 'g4');
});

test('ids: odd names do not confuse it, and a gap is never reused over a live id', () => {
  const components = [part('g10', 'not'), part('g2', 'not'), part('gx', 'not'), part('u1.g7', 'not')];
  assert.equal(nextComponentId(components), 'g11');
});

test('ids: never returns an id in the circuit, over many adds and deletes, and after Make Component and Ungroup', () => {
  const circuit = { components: [], wires: [], subcircuits: {} };
  const add = () => {
    const id = nextComponentId(circuit.components);
    assert.ok(!circuit.components.some(c => c.id === id), `${id} was already in use`);
    circuit.components.push(part(id, 'not'));
    return id;
  };
  for (let i = 0; i < 6; i++) add();
  deleteComponents(circuit, [], ['g2', 'g5']);
  for (let i = 0; i < 4; i++) add();
  makeComponent(circuit, ['g1', 'g3'], 'blob');
  for (let i = 0; i < 3; i++) add();
  const blob = circuit.components.find(c => c.type === 'blob').id;
  ungroupComponent(circuit, blob);
  for (let i = 0; i < 3; i++) add();
  const ids = circuit.components.map(c => c.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('clock selector: 0.25, 0.5, 1 and 10 Hz in a ring', () => {
  assert.deepEqual(CLOCK_RATES, [0.25, 0.5, 1, 10]);
  assert.equal(nextClockRate(0.25), 0.5);
  assert.equal(nextClockRate(0.5), 1);
  assert.equal(nextClockRate(1), 10);
  assert.equal(nextClockRate(10), 0.25);
  assert.equal(nextClockRate(3), 10, 'a rate off the selector moves up to the next position');
  assert.equal(nextClockRate(50), 0.25);
});

test('a chosen clock rate survives save and load', () => {
  const circuit = { version: 2, board: { width: 100, height: 100 }, components: [part('clk', 'clock', 0, 0, { hz: 10 })], wires: [], subcircuits: {} };
  const loaded = parseCircuitFile(serializeCircuit(circuit));
  assert.equal(loaded.components[0].hz, 10);
});

test('moving a selection shifts every selected part and no other', () => {
  const components = [part('a', 'not', 10, 10), part('b', 'not', 50, 20), part('c', 'not', 90, 90)];
  const ids = new Set(['a', 'b']);
  const origins = new Map(components.map(c => [c.id, { x: c.x, y: c.y }]));
  assert.equal(moveComponents(components, ids, origins, 5, -3), true);
  assert.deepEqual(components.map(c => [c.x, c.y]), [[15, 7], [55, 17], [90, 90]]);
  // Measured from the origins, so moving again to a different offset does not accumulate.
  moveComponents(components, ids, origins, 0, 0);
  assert.deepEqual(components.map(c => [c.x, c.y]), [[10, 10], [50, 20], [90, 90]]);
});

test('moving with snap puts parts on the grid, and reports no move when nothing changed', () => {
  const components = [part('a', 'not', 100, 80)];
  const origins = new Map([['a', { x: 100, y: 80 }]]);
  const snap = (x, y) => [Math.round(x / 100) * 100, Math.round(y / 80) * 80];
  assert.equal(moveComponents(components, new Set(['a']), origins, 30, 20, snap), false);
  assert.equal(moveComponents(components, new Set(['a']), origins, 60, 50, snap), true);
  assert.deepEqual([components[0].x, components[0].y], [200, 160]);
});

test('undo and redo walk back and forward, and a new edit discards the redo branch', () => {
  const history = createHistory();
  assert.equal(history.undo('now'), null);
  assert.equal(history.canUndo, false);
  history.record('A');
  history.record('B');
  assert.equal(history.undo('C'), 'B');
  assert.equal(history.undo('B'), 'A');
  assert.equal(history.undo('A'), null);
  assert.equal(history.canRedo, true);
  assert.equal(history.redo('A'), 'B');
  assert.equal(history.redo('B'), 'C');
  assert.equal(history.redo('C'), null);

  history.undo('C');
  history.record('X');
  assert.equal(history.canRedo, false, 'editing after an undo ends the redo branch');
});

test('history keeps only the newest `limit` snapshots', () => {
  const history = createHistory({ limit: 3 });
  for (const s of ['A', 'B', 'C', 'D', 'E']) history.record(s);
  assert.deepEqual([history.undo('F'), history.undo('E'), history.undo('D')], ['E', 'D', 'C']);
  assert.equal(history.undo('C'), null);
});

test('undoing a delete brings back the part and its wires, and keeps the switch where the user left it', () => {
  const circuit = chain();
  const history = createHistory();
  history.record(structuredClone(circuit));
  deleteComponents(circuit, [], ['s', 'g1']);
  circuit.components.find(c => c.id === 'lamp').x = 99; // some later edit that is part of "now"

  // The user had flipped the switch after the snapshot was taken.
  const snapshotBefore = history.undo(structuredClone(circuit));
  snapshotBefore.components.find(c => c.id === 's').state = 0;
  const live = structuredClone(snapshotBefore);
  live.components.find(c => c.id === 's').state = 1;
  carryControlSettings(live, snapshotBefore);

  assert.equal(snapshotBefore.components.length, 4);
  assert.equal(snapshotBefore.wires.length, 3);
  assert.equal(snapshotBefore.components.find(c => c.id === 's').state, 1);
  assert.doesNotThrow(() => validateCircuit(snapshotBefore));
});

test('carryControlSettings copies clock rates and switch states by id, inside subcircuits too', () => {
  const from = {
    components: [part('s', 'switch', 0, 0, { state: 1 }), part('clk', 'clock', 0, 0, { hz: 10 }), part('x', 'not')],
    subcircuits: { box: { components: [part('inner', 'switch', 0, 0, { state: 1 })] } }
  };
  const to = {
    components: [part('s', 'switch', 0, 0, { state: 0 }), part('clk', 'clock', 0, 0, { hz: 1 }), part('x', 'not'), part('new', 'switch', 0, 0, { state: 0 })],
    subcircuits: { box: { components: [part('inner', 'switch', 0, 0, { state: 0 })] } }
  };
  carryControlSettings(from, to);
  assert.equal(to.components[0].state, 1);
  assert.equal(to.components[1].hz, 10);
  assert.equal(to.components[3].state, 0, 'a part that was not there keeps its own setting');
  assert.equal(to.subcircuits.box.components[0].state, 1);
});
