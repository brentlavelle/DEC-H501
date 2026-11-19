// WP2: the drawing library and the simulator agree on every primitive type and pin.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import GateLibrary from '../gateLibrary.js';
import { componentTypes } from '../sim/components.js';

const direction = pin => pin.direction || (pin.name.startsWith('in') ? 'input' : 'output');
const names = (pins, wanted) => pins.filter(pin => direction(pin) === wanted).map(pin => pin.name).sort();

test('gateLibrary and the simulator know the same types', () => {
  assert.deepEqual(Object.keys(GateLibrary).sort(), Object.keys(componentTypes).sort());
});

for (const [type, def] of Object.entries(GateLibrary)) {
  test(`${type}: library pins match simulator pins`, () => {
    const simType = componentTypes[type];
    assert.ok(simType, `the simulator has no "${type}"`);
    assert.deepEqual(names(def.pins, 'input'), [...simType.inputs].sort());
    assert.deepEqual(names(def.pins, 'output'), [...simType.outputs].sort());
    for (const pin of def.pins) {
      assert.ok(pin.x >= 0 && pin.x <= 260 && pin.y >= 0 && pin.y <= 130, `${pin.name} is inside the footprint`);
    }
  });
}

test('the lamp has one pin, and the four new types have their final pin names', () => {
  assert.deepEqual(GateLibrary.led.pins.map(pin => pin.name), ['in']);
  assert.deepEqual(GateLibrary.andnor.pins.map(pin => pin.name), ['in0', 'in1', 'in2', 'in3', 'out']);
  for (const type of ['pulser', 'clock', 'hi']) {
    assert.deepEqual(GateLibrary[type].pins.map(pin => pin.name), ['out']);
  }
});
