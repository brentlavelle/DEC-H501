// WP2: schema version 2 and the version 1 migration (docs/H500-PARITY.md, section 8).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import {
  CURRENT_VERSION,
  createEmptyCircuit,
  migrateCircuit,
  parseCircuitFile,
  serializeCircuit,
  validateCircuit
} from '../circuitModel.js';
import { flattenCircuit } from '../subcircuits.js';
import { createSimulator } from '../sim/core.js';

const REMOVED = ['previousClock', 'previousJ', 'previousK', 'internalState'];
const end = (component, pin) => ({ component, pin });

function version1() {
  return {
    version: 1,
    board: { width: 1200, height: 800 },
    components: [
      { id: 'sw', type: 'switch', x: 24, y: 40, state: 1 },
      { id: 'ff', type: 'jk', x: 325, y: 40, state: 1, previousClock: 1, previousJ: true, previousK: false },
      { id: 'lamp', type: 'led', x: 610, y: 40 },
      { id: 'box', type: 'blinker', x: 325, y: 300, internalState: { ff: { id: 'box.ff', type: 'jk', state: 1 } } }
    ],
    wires: [
      { from: end('sw', 'out'), to: end('ff', 'c') },
      { from: end('ff', 'q'), to: end('lamp', 'in') },
      { from: end('ff', 'qbar'), to: end('lamp', 'return') },
      { from: end('sw', 'out'), to: end('box', 'in0') },
      { from: end('sw', 'out'), to: end('box', 'in1') }
    ],
    subcircuits: {
      blinker: {
        components: [
          { id: 'ff', type: 'jk', x: 0, y: 0, state: 1, previousClock: 0, previousJ: false, previousK: false },
          { id: 'lamp', type: 'led', x: 300, y: 0 }
        ],
        wires: [
          { from: end('ff', 'q'), to: end('lamp', 'in') },
          { from: end('ff', 'qbar'), to: end('lamp', 'return') }
        ],
        pins: [
          { name: 'in0', direction: 'input', internal: end('ff', 'c'), x: 18, y: 43 },
          { name: 'in1', direction: 'input', internal: end('lamp', 'return'), x: 18, y: 87 }
        ],
        width: 260,
        height: 130
      }
    }
  };
}

test('the current schema version is 2', () => {
  assert.equal(CURRENT_VERSION, 2);
  assert.equal(createEmptyCircuit().version, 2);
});

test('a version 1 file with a wire to led.return migrates to version 2 without it and validates', () => {
  const raw = version1();
  const before = structuredClone(raw);
  const circuit = parseCircuitFile(JSON.stringify(raw));
  assert.deepEqual(raw, before);

  assert.equal(circuit.version, 2);
  assert.equal(validateCircuit(circuit), circuit);
  assert.deepEqual(circuit.wires, [
    { from: end('sw', 'out'), to: end('ff', 'c') },
    { from: end('ff', 'q'), to: end('lamp', 'in') },
    { from: end('sw', 'out'), to: end('box', 'in0') }
  ]);
  // Inside the definition too, along with the external pin that led to the lost pin.
  assert.deepEqual(circuit.subcircuits.blinker.wires, [{ from: end('ff', 'q'), to: end('lamp', 'in') }]);
  assert.deepEqual(circuit.subcircuits.blinker.pins.map(pin => pin.name), ['in0']);

  // What is left simulates.
  const sim = createSimulator(flattenCircuit(circuit));
  assert.equal(sim.read('ff', 'q'), false);
});

test('migration removes saved runtime state, including flip-flop state', () => {
  const circuit = migrateCircuit(version1());
  const text = JSON.stringify(circuit);
  for (const field of REMOVED) assert.ok(!text.includes(field), field);
  assert.deepEqual(circuit.components.find(c => c.id === 'ff'), { id: 'ff', type: 'jk', x: 325, y: 40 });
  assert.deepEqual(circuit.subcircuits.blinker.components[0], { id: 'ff', type: 'jk', x: 0, y: 0 });
  assert.equal(circuit.components.find(c => c.id === 'sw').state, 1, 'a switch position is the user\'s and stays');
});

test('migrateCircuit does not modify its argument', () => {
  const raw = version1();
  const before = structuredClone(raw);
  migrateCircuit(raw);
  assert.deepEqual(raw, before);
});

test('an unversioned file is treated as version 1', () => {
  const circuit = migrateCircuit({
    components: [{ id: 'l', type: 'led', x: 0, y: 0 }, { id: 's', type: 'switch', x: 0, y: 200, state: 0 }],
    wires: [{ from: end('s', 'out'), to: end('l', 'return') }]
  });
  assert.equal(circuit.version, 2);
  assert.deepEqual(circuit.wires, []);
  assert.deepEqual(circuit.subcircuits, {});
  assert.deepEqual(circuit.board, { width: 1200, height: 800 });
});

test('a version 2 file with a wire to led.return is rejected, not silently repaired', () => {
  const raw = { ...version1(), version: 2 };
  assert.throws(() => parseCircuitFile(JSON.stringify(raw)), /unknown pin "return"/);
});

test('serializeCircuit output holds none of the removed fields', () => {
  // An in-memory circuit that still carries everything an old session could have left.
  const circuit = { ...version1(), version: 2 };
  circuit.components.push({ id: 'p', type: 'pulser', x: 24, y: 500, state: 1 });
  const before = structuredClone(circuit);
  const text = serializeCircuit(circuit);
  assert.deepEqual(circuit, before, 'serializing does not modify the circuit');

  for (const field of REMOVED) assert.ok(!text.includes(field), field);
  const saved = JSON.parse(text);
  assert.equal(saved.version, 2);
  const everyComponent = [saved.components, ...Object.values(saved.subcircuits).map(def => def.components)].flat();
  for (const component of everyComponent) {
    if (component.type === 'jk' || component.type === 'pulser') {
      assert.ok(!('state' in component), `${component.id} must not save state`);
    }
  }
  assert.equal(saved.components.find(c => c.id === 'sw').state, 1);
});

test('what the user set survives save and load: switch position, clock rate, label, board size', () => {
  const circuit = {
    version: 2,
    board: { width: 2400, height: 900 },
    components: [
      { id: 'sw', type: 'switch', x: 40, y: 40, state: 1, label: 'RUN' },
      { id: 'clk', type: 'clock', x: 40, y: 200, hz: 0.25 },
      { id: 'g', type: 'andnor', x: 340, y: 40 },
      { id: 'h', type: 'hi', x: 40, y: 360 },
      { id: 'p', type: 'pulser', x: 40, y: 520 }
    ],
    wires: [{ from: end('clk', 'out'), to: end('g', 'in3') }, { from: end('h', 'out'), to: end('g', 'in2') }],
    subcircuits: {}
  };
  assert.deepEqual(parseCircuitFile(serializeCircuit(circuit)), circuit);
});

test('validation rejects a bad clock rate and a label that is not text', () => {
  const base = { version: 2, wires: [], subcircuits: {} };
  assert.throws(
    () => validateCircuit({ ...base, components: [{ id: 'c', type: 'clock', x: 0, y: 0, hz: 0 }] }),
    /above 0 Hz/
  );
  assert.throws(
    () => validateCircuit({ ...base, components: [{ id: 'c', type: 'clock', x: 0, y: 0, hz: '10' }] }),
    /above 0 Hz/
  );
  assert.throws(
    () => validateCircuit({ ...base, components: [{ id: 's', type: 'switch', x: 0, y: 0, label: 7 }] }),
    /label/
  );
});

const fixtures = new URL('fixtures/', import.meta.url);
for (const name of readdirSync(fixtures).filter(file => file.endsWith('.json')).sort()) {
  test(`fixture ${name} loads, validates, flattens and simulates through the editor's path`, () => {
    const text = readFileSync(new URL(name, fixtures), 'utf8');
    const circuit = parseCircuitFile(text);
    assert.equal(circuit.version, 2);
    assert.deepEqual(circuit, JSON.parse(text), 'loading a version 2 fixture changes nothing');
    const flat = flattenCircuit(circuit);
    assert.equal(flat.components.length, circuit.components.length);
    createSimulator(flat);
    assert.deepEqual(parseCircuitFile(serializeCircuit(circuit)), circuit);
  });
}
