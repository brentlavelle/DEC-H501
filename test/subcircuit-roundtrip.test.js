// WP4: grouping parts into a component, and ungrouping it, never changes what the circuit does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeComponent, ungroupComponent, flattenCircuit } from '../subcircuits.js';
import { createSimulator } from '../sim/core.js';

const fullAdder = () => JSON.parse(readFileSync(new URL('fixtures/full-adder.json', import.meta.url), 'utf8'));
const GATES = ['n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7', 'n8', 'n9'];

// The two lamps for every combination of the three switches, in order 000 to 111.
function truthTable(circuit) {
  const sim = createSimulator(flattenCircuit(circuit));
  const rows = [];
  for (let n = 0; n < 8; n++) {
    sim.setInput('a', (n >> 2) & 1);
    sim.setInput('b', (n >> 1) & 1);
    sim.setInput('cin', n & 1);
    rows.push([sim.readInput('l_sum', 'in'), sim.readInput('l_carry', 'in')]);
  }
  return rows;
}
const instanceOf = (circuit, type) => circuit.components.find(c => c.type === type).id;

test('the loose full adder adds', () => {
  const rows = truthTable(fullAdder());
  for (let n = 0; n < 8; n++) {
    const total = ((n >> 2) & 1) + ((n >> 1) & 1) + (n & 1);
    assert.deepEqual(rows[n], [Boolean(total & 1), total >= 2], `inputs ${n.toString(2).padStart(3, '0')}`);
  }
});

test('grouping the adder into a component, then ungrouping it, gives the same table each time', () => {
  const circuit = fullAdder();
  const loose = truthTable(circuit);
  makeComponent(circuit, GATES, 'Adder');
  assert.deepEqual(truthTable(circuit), loose, 'grouped');
  ungroupComponent(circuit, instanceOf(circuit, 'Adder'));
  assert.deepEqual(truthTable(circuit), loose, 'ungrouped');
});

test('a component inside a component: group twice, ungroup twice, the table never changes', () => {
  const circuit = fullAdder();
  const loose = truthTable(circuit);
  makeComponent(circuit, ['n1', 'n2', 'n3', 'n4'], 'Xor');
  assert.deepEqual(truthTable(circuit), loose, 'inner grouped');
  makeComponent(circuit, [instanceOf(circuit, 'Xor'), 'n5', 'n6', 'n7', 'n8', 'n9'], 'Adder');
  assert.deepEqual(circuit.subcircuits.Adder.components.map(c => c.type).includes('Xor'), true, 'Xor sits inside Adder');
  assert.deepEqual(truthTable(circuit), loose, 'both grouped');
  ungroupComponent(circuit, instanceOf(circuit, 'Adder'));
  assert.deepEqual(truthTable(circuit), loose, 'outer ungrouped');
  ungroupComponent(circuit, instanceOf(circuit, 'Xor'));
  assert.deepEqual(truthTable(circuit), loose, 'both ungrouped');
});

test('a component cannot take the name of a built-in type or of another component', () => {
  for (const name of ['jk', '2nand', 'switch', 'led']) {
    assert.throws(() => makeComponent(fullAdder(), ['n1'], name), /already a component type/, name);
  }
  const circuit = fullAdder();
  makeComponent(circuit, ['n1'], 'Half');
  assert.throws(() => makeComponent(circuit, ['n2'], 'Half'), /already a component type/);
  assert.throws(() => makeComponent(fullAdder(), ['n1'], '  '), /name is required/);
});

test('boundary pins are named in0... and out0..., in the same order every time', () => {
  const pinsOf = () => {
    const circuit = fullAdder();
    makeComponent(circuit, GATES, 'Adder');
    return circuit.subcircuits.Adder.pins.map(pin => [pin.name, pin.direction]);
  };
  const pins = pinsOf();
  const inputs = pins.filter(([, d]) => d === 'input').map(([name]) => name);
  const outputs = pins.filter(([, d]) => d === 'output').map(([name]) => name);
  assert.deepEqual(inputs, inputs.map((_, i) => `in${i}`));
  assert.deepEqual(outputs, ['out0', 'out1']);
  assert.ok(inputs.length >= 3, 'at least one pin for each switch');
  assert.deepEqual(pinsOf(), pins, 'stable');
});
