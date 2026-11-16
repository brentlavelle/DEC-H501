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
    assert.ok(def.width > 0 && def.height > 0, 'it has a footprint');
    for (const pin of def.pins) {
      assert.ok(pin.x >= 0 && pin.x <= def.width && pin.y >= 0 && pin.y <= def.height, `${pin.name} is inside the footprint`);
    }
    const spots = def.pins.map(pin => `${pin.x},${pin.y}`);
    assert.equal(new Set(spots).size, spots.length, 'no two pins share a position');
  });
}

test('the lamp has one pin, and the four new types have their final pin names', () => {
  assert.deepEqual(GateLibrary.led.pins.map(pin => pin.name), ['in']);
  assert.deepEqual(GateLibrary.andnor.pins.map(pin => pin.name), ['in0', 'in1', 'in2', 'in3', 'out']);
  for (const type of ['pulser', 'clock', 'hi']) {
    assert.deepEqual(GateLibrary[type].pins.map(pin => pin.name), ['out']);
  }
});

test('gates are half their original size: an 84 x 65 footprint, and no part is larger', () => {
  for (const type of ['and', 'or', 'not', 'nand', 'nor', 'xor', 'xnor', '2nand', '3nand', '4nand', 'andnor', 'jk']) {
    assert.deepEqual([GateLibrary[type].width, GateLibrary[type].height], [84, 65], type);
  }
  for (const [type, def] of Object.entries(GateLibrary)) {
    assert.ok(def.width <= 84 && def.height <= 65, type);
  }
});

test('every symbol in gates.svg has the footprint its library entry gives', async () => {
  const { readFileSync } = await import('node:fs');
  const svg = readFileSync(new URL('../gates.svg', import.meta.url), 'utf8');
  for (const [type, def] of Object.entries(GateLibrary)) {
    const match = svg.match(new RegExp(`<symbol id="${def.svgId}" viewBox="0 0 (\\S+) (\\S+)"`));
    assert.ok(match, `${type}: symbol "${def.svgId}"`);
    assert.deepEqual([Number(match[1]), Number(match[2])], [def.width, def.height], type);
  }
});

test('pins are far enough apart that their hotspots do not overlap', () => {
  for (const [type, def] of Object.entries(GateLibrary)) {
    for (const a of def.pins) {
      for (const b of def.pins) {
        if (a !== b) assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= 12, `${type}: ${a.name} and ${b.name}`);
      }
    }
  }
});
