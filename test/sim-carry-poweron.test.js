// WP1 acceptance 12: carryFrom and power-on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSimulator } from '../sim/core.js';

const fixture = name => JSON.parse(readFileSync(new URL(`fixtures/${name}.json`, import.meta.url), 'utf8'));
const count = sim => [0, 1, 2, 3].reduce((sum, i) => sum + (Number(sim.read(`ff${i}`, 'q')) << i), 0);
const wire = (a, b) => {
  const end = text => ({ component: text.split('.')[0], pin: text.split('.')[1] });
  return { from: end(a), to: end(b) };
};

function pulse(sim) {
  sim.setInput('p', 1);
  sim.setInput('p', 0);
}

test('carryFrom: a wire added to a counter at 5 leaves it at 5', () => {
  const flat = fixture('ripple-counter-4');
  const before = createSimulator(flat);
  for (let i = 0; i < 5; i++) pulse(before);
  assert.equal(count(before), 5);

  const edited = structuredClone(flat);
  edited.wires.push(wire('ff0.qbar', 'l_spare.in'));
  const after = createSimulator(edited, { carryFrom: before });
  assert.equal(after.powerOn.settled, true);
  assert.equal(count(after), 5);
  assert.equal(after.readInput('l_spare', 'in'), false);

  pulse(after);
  assert.equal(count(after), 6);
  assert.equal(after.readInput('l_spare', 'in'), true);
  assert.equal(count(before), 5, 'the old simulator is untouched');

  const fresh = createSimulator(edited);
  assert.equal(count(fresh), 0, 'without carryFrom it powers on at 0');
});

test('carryFrom: a part that is added powers on, a part that is removed is dropped', () => {
  const flat = fixture('ripple-counter-4');
  const before = createSimulator(flat);
  for (let i = 0; i < 5; i++) pulse(before);

  const edited = structuredClone(flat);
  edited.components = edited.components.filter(c => c.id !== 'l_spare');
  edited.components.push({ id: 'ff_new', type: 'jk', x: 40, y: 520 }, { id: 'g_new', type: 'not', x: 340, y: 520 });
  // ff_new is clocked from ff0, which is HI at 5: no edge may be invented for it.
  edited.wires.push(wire('ff0.q', 'ff_new.c'), wire('ff0.q', 'g_new.in'));
  const after = createSimulator(edited, { carryFrom: before });
  assert.equal(count(after), 5);
  assert.equal(after.read('ff_new', 'q'), false);
  assert.equal(after.read('g_new', 'out'), false);
  pulse(after); // 6: ff0 falls, which clocks ff_new
  assert.equal(count(after), 6);
  assert.equal(after.read('ff_new', 'q'), true);
  assert.throws(() => after.readInput('l_spare', 'in'), /No component/);
});

test('carryFrom: an id that comes back as another type is not carried', () => {
  const before = createSimulator({ components: [{ id: 'x', type: 'hi' }, { id: 'g', type: 'not' }], wires: [] });
  const after = createSimulator(
    { components: [{ id: 'x', type: 'pulser' }, { id: 'g', type: 'not' }], wires: [wire('x.out', 'g.in')] },
    { carryFrom: before }
  );
  assert.equal(after.read('x', 'out'), false);
  assert.equal(after.read('g', 'out'), true);
});

test('carryFrom: virtual time and clock phase carry over, even in mid-pulse', () => {
  const flat = fixture('clock-counter');
  for (const at of [500, 560, 585]) {
    const before = createSimulator(flat);
    before.advance(at);
    assert.equal(count(before), 5);

    const edited = structuredClone(flat);
    edited.wires.push(wire('ff0.qbar', 'l_spare.in'));
    const after = createSimulator(edited, { carryFrom: before });
    assert.equal(after.time, at);
    assert.equal(after.read('clk', 'out'), before.read('clk', 'out'));
    assert.equal(count(after), 5);
    after.advance(1000 - at);
    assert.equal(after.time, 1000);
    assert.equal(count(after), 10, `carried at ${at} ms`);
  }
});

test('carryFrom: a clock whose rate changed starts its count at the carry', () => {
  const flat = fixture('clock-counter');
  const before = createSimulator(flat);
  before.advance(500);
  const edited = structuredClone(flat);
  edited.components.find(c => c.id === 'clk').hz = 1;
  const after = createSimulator(edited, { carryFrom: before });
  after.advance(999);
  assert.equal(count(after), 5);
  after.advance(1);
  assert.equal(count(after), 6);
});

test('carryFrom: a switch takes its position from the new circuit', () => {
  const flat = { components: [{ id: 'sw', type: 'switch', state: 0 }], wires: [] };
  const before = createSimulator(flat);
  const after = createSimulator({ components: [{ id: 'sw', type: 'switch', state: 1 }], wires: [] }, { carryFrom: before });
  assert.equal(after.read('sw', 'out'), true);
});

test('carryFrom: anything that is not a simulator is refused', () => {
  assert.throws(() => createSimulator({ components: [], wires: [] }, { carryFrom: {} }), /carryFrom/);
});

test('power-on: a clock that rises and falls during the first settle does not clock the flip-flop', () => {
  // sw is LO. n1 goes LO -> HI. n2 starts LO, sees n1 still LO and goes HI,
  // then sees n1 HI and falls back: a full pulse on ff.c during power-on.
  // J and K are open, so a counted trailing edge would leave q HI.
  const sim = createSimulator(fixture('power-on-glitch'));
  assert.equal(sim.powerOn.settled, true);
  assert.ok(sim.powerOn.sweeps >= 3, 'the first settle really took several sweeps');
  assert.equal(sim.read('n1', 'out'), true);
  assert.equal(sim.read('n2', 'out'), false);
  assert.equal(sim.read('ff', 'q'), false);
  assert.equal(sim.read('ff', 'qbar'), true);

  // The flip-flop is live afterwards: the same path clocks it normally.
  sim.setInput('sw', 1);
  assert.equal(sim.read('ff', 'q'), false, 'rising edge on c');
  sim.setInput('sw', 0);
  assert.equal(sim.read('ff', 'q'), true, 'trailing edge on c');
});

test('power-on: the clock level a flip-flop remembers is the settled one', () => {
  // c settles HI through an inverter. The first real fall must count.
  const sim = createSimulator({
    components: [{ id: 'sw', type: 'switch', state: 0 }, { id: 'n', type: 'not' }, { id: 'ff', type: 'jk' }],
    wires: [wire('sw.out', 'n.in'), wire('n.out', 'ff.c')]
  });
  assert.equal(sim.read('ff', 'q'), false);
  sim.setInput('sw', 1);
  assert.equal(sim.read('ff', 'q'), true);
});

test('power-on: a flip-flop obeys reset during the first settle', () => {
  const sim = createSimulator({
    components: [{ id: 'r', type: 'switch', state: 0 }, { id: 'ff', type: 'jk' }, { id: 'p', type: 'pulser' }],
    wires: [wire('r.out', 'ff.reset'), wire('p.out', 'ff.c')]
  });
  sim.setInput('p', 1);
  sim.setInput('p', 0);
  assert.equal(sim.read('ff', 'q'), false);
});
