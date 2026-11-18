// Simulator core (docs/H500-PARITY.md, section 4).
// No DOM and no time source of its own: virtual time moves only in advance().

import { componentTypes, DEFAULT_CLOCK_HZ } from './components.js';

const internals = new WeakMap();
const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

function checkHz(hz, id) {
  if (typeof hz !== 'number' || !Number.isFinite(hz) || hz <= 0) {
    throw new Error(`Clock "${id}" needs a rate above 0 Hz.`);
  }
  return hz;
}

export function createSimulator(flat, options = {}) {
  let time = 0;
  const comps = new Map();

  for (const component of flat.components ?? []) {
    const def = componentTypes[component.type];
    if (!def) {
      throw new Error(`Unknown primitive type "${component.type}" on "${component.id}".`);
    }
    if (comps.has(component.id)) {
      throw new Error(`Duplicate component id "${component.id}".`);
    }
    const comp = { id: component.id, type: component.type, def, out: {}, drivers: {} };
    if (def.kind === 'source') {
      comp.out.out = def.initial(component);
    } else if (def.kind === 'flipflop') {
      Object.assign(comp.out, def.initialOut);
      comp.fresh = true;
      comp.lastC = undefined;
    } else {
      for (const pin of def.outputs) comp.out[pin] = false;
    }
    if (component.type === 'clock') {
      comp.hz = checkHz(component.hz ?? DEFAULT_CLOCK_HZ, comp.id);
      comp.origin = 0;
      comp.edge = 0;
    }
    comps.set(comp.id, comp);
  }

  // Wires join pins into nets, in either direction and through input pins.
  const parent = new Map();
  const keyOf = (id, pin) => JSON.stringify([id, pin]);
  const find = key => {
    let root = key;
    while (parent.get(root) !== root) root = parent.get(root);
    while (parent.get(key) !== root) {
      const next = parent.get(key);
      parent.set(key, root);
      key = next;
    }
    return root;
  };
  for (const comp of comps.values()) {
    for (const pin of [...comp.def.inputs, ...comp.def.outputs]) {
      const key = keyOf(comp.id, pin);
      parent.set(key, key);
    }
  }
  for (const wire of flat.wires ?? []) {
    const keys = [wire.from, wire.to].map(end => {
      const key = end && keyOf(end.component, end.pin);
      if (!key || !parent.has(key)) {
        throw new Error(`Wire end ${JSON.stringify(end)} is not a pin in this circuit.`);
      }
      return key;
    });
    parent.set(find(keys[0]), find(keys[1]));
  }
  const netDrivers = new Map();
  for (const comp of comps.values()) {
    for (const pin of comp.def.outputs) {
      const root = find(keyOf(comp.id, pin));
      if (!netDrivers.has(root)) netDrivers.set(root, []);
      netDrivers.get(root).push([comp, pin]);
    }
  }
  for (const comp of comps.values()) {
    for (const pin of comp.def.inputs) {
      comp.drivers[pin] = netDrivers.get(find(keyOf(comp.id, pin))) ?? [];
    }
  }

  const logic = [...comps.values()]
    .filter(comp => comp.def.kind === 'gate' || comp.def.kind === 'flipflop')
    .sort(byId);
  const clocks = [...comps.values()].filter(comp => comp.type === 'clock').sort(byId);
  const limit = 2 * comps.size + 8;

  // An input with no driver reads its open level. If several outputs share
  // the net, LO wins.
  function readPin(comp, pin) {
    const drivers = comp.drivers[pin];
    if (drivers.length === 0) return comp.def.openInput;
    for (const [driver, driverPin] of drivers) {
      if (!driver.out[driverPin]) return false;
    }
    return true;
  }

  function readInputs(comp) {
    const input = {};
    for (const pin of comp.def.inputs) input[pin] = readPin(comp, pin);
    return input;
  }

  function commit(comp, result) {
    let changed = false;
    for (const pin of comp.def.outputs) {
      if (comp.out[pin] !== result.out[pin]) {
        comp.out[pin] = result.out[pin];
        changed = true;
      }
    }
    if (result.lastC !== undefined) comp.lastC = result.lastC;
    return changed;
  }

  // Every component computes from the values at the start of the sweep.
  function sweep() {
    const results = logic.map(comp => comp.def.step(readInputs(comp), comp));
    const changed = [];
    logic.forEach((comp, i) => {
      if (commit(comp, results[i])) changed.push(comp.id);
    });
    return changed;
  }

  // Race phase: one component at a time in id order, each seeing the newest values.
  function pass() {
    const changed = [];
    for (const comp of logic) {
      if (commit(comp, comp.def.step(readInputs(comp), comp))) changed.push(comp.id);
    }
    return changed;
  }

  function settleLoop() {
    let sweeps = 0;
    while (sweeps < limit) {
      sweeps++;
      if (sweep().length === 0) {
        return { settled: true, sweeps, raceResolved: false, oscillating: [] };
      }
    }
    let previous = [];
    let last = [];
    for (let passes = 1; passes <= limit; passes++) {
      const changed = pass();
      sweeps++;
      if (changed.length === 0) {
        return { settled: true, sweeps, raceResolved: true, oscillating: [] };
      }
      previous = last;
      last = changed;
    }
    const oscillating = [...new Set([...previous, ...last])].sort();
    return { settled: false, sweeps, raceResolved: false, oscillating };
  }

  function settle() {
    const result = settleLoop();
    for (const comp of logic) {
      if (comp.fresh) {
        comp.lastC = readPin(comp, comp.def.clockPin);
        comp.fresh = false;
      }
    }
    return result;
  }

  function get(id) {
    const comp = comps.get(id);
    if (!comp) throw new Error(`No component "${id}" in this circuit.`);
    return comp;
  }

  // Edge 0 is the first rise, edge 1 the first fall, and so on. Times are
  // computed from the pulse number, never accumulated, so advance() is additive.
  function edgeTime(clock, edge) {
    const k = Math.floor(edge / 2) + 1;
    const fall = clock.origin + (k * 1000) / clock.hz;
    return edge % 2 === 0 ? fall - 500 / clock.hz : fall;
  }

  function skipEdgesThrough(clock, target) {
    const k = Math.floor(((target - clock.origin) * clock.hz) / 1000);
    clock.edge = Math.max(clock.edge, 2 * (k - 1));
    while (edgeTime(clock, clock.edge) <= target) clock.edge++;
  }

  function advance(ms, { maxEdges = 10000 } = {}) {
    if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) {
      throw new Error('advance needs a duration of 0 ms or more.');
    }
    const target = time + ms;
    let total = null;
    let edges = 0;
    let behind = false;
    for (;;) {
      let next = null;
      let nextTime = Infinity;
      for (const clock of clocks) {
        const t = edgeTime(clock, clock.edge);
        if (t <= target && t < nextTime) {
          next = clock;
          nextTime = t;
        }
      }
      if (!next) break;
      if (edges >= maxEdges) {
        behind = true;
        for (const clock of clocks) skipEdgesThrough(clock, target);
        break;
      }
      next.out.out = next.edge % 2 === 0;
      next.edge++;
      edges++;
      time = nextTime;
      const result = settle();
      if (!total) {
        total = result;
      } else {
        total = {
          settled: total.settled && result.settled,
          sweeps: total.sweeps + result.sweeps,
          raceResolved: total.raceResolved || result.raceResolved,
          oscillating: [...new Set([...total.oscillating, ...result.oscillating])].sort()
        };
      }
    }
    time = target;
    return { ...(total ?? settle()), edges, behind };
  }

  if (options.carryFrom) {
    const previous = internals.get(options.carryFrom);
    if (!previous) throw new Error('carryFrom must be a simulator made by createSimulator.');
    time = previous.time();
    for (const comp of comps.values()) {
      const old = previous.comps.get(comp.id);
      if (!old || old.type !== comp.type) continue;
      if (comp.def.kind === 'gate' || comp.def.kind === 'flipflop') {
        Object.assign(comp.out, old.out);
      }
      if (comp.def.kind === 'flipflop') {
        comp.lastC = old.lastC;
        comp.fresh = false;
      }
      // A switch takes its position from the new circuit; a held pulser stays held.
      if (comp.type === 'pulser') comp.out.out = old.out.out;
      if (comp.type === 'clock') {
        comp.out.out = old.out.out;
        if (old.hz === comp.hz) {
          comp.origin = old.origin;
          comp.edge = old.edge;
        }
      }
    }
    // A clock that is new, or whose rate differs, starts its count now.
    for (const clock of clocks) {
      const old = previous.comps.get(clock.id);
      if (!old || old.type !== 'clock' || old.hz !== clock.hz) clock.origin = time;
    }
  }

  const sim = {
    setInput(id, value) {
      const comp = get(id);
      if (comp.type !== 'switch' && comp.type !== 'pulser') {
        throw new Error(`"${id}" is a ${comp.type}, not a switch or pulser.`);
      }
      comp.out.out = Boolean(value);
      return settle();
    },
    // Restarts the pulse count from now. The output keeps its level until the
    // next edge of the new waveform, so changing the rate never clocks anything.
    setClockRate(id, hz) {
      const comp = get(id);
      if (comp.type !== 'clock') throw new Error(`"${id}" is a ${comp.type}, not a clock.`);
      comp.hz = checkHz(hz, id);
      comp.origin = time;
      comp.edge = 0;
      return settle();
    },
    settle,
    advance,
    read(id, pin) {
      const comp = get(id);
      if (!comp.def.outputs.includes(pin)) throw new Error(`"${id}" has no output pin "${pin}".`);
      return comp.out[pin];
    },
    readInput(id, pin) {
      const comp = get(id);
      if (!comp.def.inputs.includes(pin)) throw new Error(`"${id}" has no input pin "${pin}".`);
      return readPin(comp, pin);
    },
    get time() {
      return time;
    }
  };

  internals.set(sim, { comps, time: () => time });
  // The result of the first settle: power-on, or the settle after carryFrom.
  sim.powerOn = settle();
  return sim;
}
