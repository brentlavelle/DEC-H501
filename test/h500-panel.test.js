// The H-500 preset: the real inventory, laid out like the real panel
// (docs/H500-PARITY.md, sections 2 and 6).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import GateLibrary from '../gateLibrary.js';
import { parseCircuitFile } from '../circuitModel.js';
import { flattenCircuit } from '../subcircuits.js';
import { createSimulator } from '../sim/core.js';

const text = readFileSync(new URL('../panels/h500.json', import.meta.url), 'utf8');
const panel = parseCircuitFile(text);
const box = c => ({ id: c.id, left: c.x, top: c.y, right: c.x + GateLibrary[c.type].width, bottom: c.y + GateLibrary[c.type].height });
const of = type => panel.components.filter(c => c.type === type);
const byX = (a, b) => a.x - b.x || a.y - b.y;

test('the preset is an ordinary version 2 circuit file with nothing wired', () => {
  assert.equal(panel.version, 2);
  assert.deepEqual(panel, JSON.parse(text), 'loading it changes nothing');
  assert.deepEqual(panel.wires, []);
  assert.deepEqual(panel.subcircuits, {});
});

test('it holds exactly the real inventory, including six HIGH and two GND terminals', () => {
  const counts = {};
  for (const c of panel.components) counts[c.type] = (counts[c.type] || 0) + 1;
  assert.deepEqual(counts, {
    jk: 8, '2nand': 8, '3nand': 6, '4nand': 4, andnor: 4,
    switch: 8, pulser: 3, led: 8, clock: 1, hi: 6, gnd: 2
  });
});

test('every part lies inside the board and no two parts overlap', () => {
  const boxes = panel.components.map(box);
  for (const b of boxes) {
    assert.ok(b.left >= 0 && b.top >= 0 && b.right <= panel.board.width && b.bottom <= panel.board.height, `${b.id} is on the board`);
  }
  for (const a of boxes) {
    for (const b of boxes) {
      if (a.id >= b.id) continue;
      const apart = a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;
      assert.ok(apart, `${a.id} and ${b.id} overlap`);
    }
  }
});

test('the panel is portrait, like the real one', () => {
  assert.ok(panel.board.height > panel.board.width);
});

test('logic rows, top to bottom and left to right, match the real patch panel', () => {
  const logic = panel.components
    .filter(c => ['jk', '2nand', '3nand', '4nand', 'andnor'].includes(c.type))
    .sort((a, b) => a.y - b.y);
  // Parts whose heights overlap or touch are one row; a stacked pair counts as one row.
  const rows = [];
  let bottom = -Infinity;
  for (const c of logic) {
    if (c.y > bottom) rows.push([]);
    rows.at(-1).push(c);
    bottom = Math.max(bottom, c.y + GateLibrary[c.type].height);
  }
  const nandRow = ['2nand', '2nand', '2nand', '2nand', '3nand', '3nand', '3nand'];
  assert.deepEqual(rows.map(row => row.sort(byX).map(c => c.type)), [
    ['jk', 'jk', 'jk', 'jk'],
    nandRow,
    ['4nand', '4nand', '4nand', '4nand'],
    ['andnor', 'andnor', 'andnor', 'andnor'],
    nandRow,
    ['jk', 'jk', 'jk', 'jk']
  ]);
  // In each NAND row the 2-input gates are two stacked pairs.
  for (const row of [rows[1], rows[4]]) {
    const twos = row.filter(c => c.type === '2nand').sort(byX);
    assert.equal(twos[0].x, twos[1].x);
    assert.equal(twos[2].x, twos[3].x);
    assert.ok(twos[0].x < twos[2].x);
  }
});

test('HIGH terminals: three in the gap under each NAND/AND-NOR block; GND under the last flip-flops', () => {
  const top = type => Math.min(...of(type).map(c => c.y));
  const his = of('hi').sort((a, b) => a.y - b.y || a.x - b.x);
  const upper = his.slice(0, 3);
  const lower = his.slice(3);
  assert.ok(upper.every(c => c.y === upper[0].y) && lower.every(c => c.y === lower[0].y));
  assert.ok(upper[0].y > top('2nand') && upper[0].y < top('4nand'), 'upper three between the first NAND row and the 4-input NANDs');
  assert.ok(lower[0].y > top('andnor') && lower[0].y < Math.max(...of('2nand').map(c => c.y)), 'lower three under the AND/NORs');
  const lastFlipFlopBottom = Math.max(...of('jk').map(c => c.y)) + GateLibrary.jk.height;
  assert.ok(of('gnd').every(c => c.y >= lastFlipFlopBottom));
});

test('controls: lamps above the switches at the lower right, pulsers to their left, the clock at the lower left', () => {
  const logicBottom = Math.max(...of('jk').map(c => c.y)) + GateLibrary.jk.height;
  const lamps = of('led').sort(byX);
  const switches = of('switch').sort(byX);
  const pulsers = of('pulser').sort(byX);
  const [clock] = of('clock');
  for (const c of [...lamps, ...switches, ...pulsers, clock]) assert.ok(c.y > logicBottom, `${c.id} is below the patch panel`);
  assert.deepEqual(lamps.map(c => c.x), switches.map(c => c.x), 'each lamp is over its switch');
  assert.ok(lamps[0].y < switches[0].y);
  assert.ok(pulsers.at(-1).x < switches[0].x);
  assert.ok(clock.x < pulsers[0].x);
  assert.ok(switches[0].x > panel.board.width / 3, 'switches are on the right');
  assert.deepEqual(lamps.map(c => c.label), ['1', '2', '3', '4', '5', '6', '7', '8']);
  assert.deepEqual(switches.map(c => c.label), ['1', '2', '3', '4', '5', '6', '7', '8']);
  assert.deepEqual(pulsers.map(c => c.label), ['1', '2', '3']);
});

test('it powers on settled, with every lamp dark and every switch LO', () => {
  const sim = createSimulator(flattenCircuit(panel));
  assert.equal(sim.powerOn.settled, true);
  assert.equal(sim.powerOn.raceResolved, false);
  for (const lamp of of('led')) assert.equal(sim.readInput(lamp.id, 'in'), false);
  for (const sw of of('switch')) assert.equal(sim.read(sw.id, 'out'), false);
  for (const ff of of('jk')) assert.equal(sim.read(ff.id, 'q'), false);
});

test('the nameplate sits on the board, left of the lamps, clear of every part', () => {
  const plate = panel.nameplate;
  assert.ok(plate, 'the preset has a nameplate');
  assert.deepEqual(plate.text, ['DIGITAL', 'H-500 LOGIC LABORATORY']);
  const p = { left: plate.x, top: plate.y, right: plate.x + plate.width, bottom: plate.y + plate.height };
  assert.ok(p.left >= 0 && p.top >= 0 && p.right <= panel.board.width && p.bottom <= panel.board.height, 'on the board');
  const lamps = of('led').sort(byX);
  assert.ok(p.right <= lamps[0].x, 'left of the first lamp');
  assert.ok(p.top < lamps[0].y + GateLibrary.led.height && p.bottom > lamps[0].y, 'level with the lamps');
  for (const b of panel.components.map(box)) {
    const apart = p.right <= b.left || b.right <= p.left || p.bottom <= b.top || b.bottom <= p.top;
    assert.ok(apart, `clear of ${b.id}`);
  }
});
