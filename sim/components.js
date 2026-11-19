// Behavior of each primitive component type (docs/H500-PARITY.md, section 3).
// Pure functions of pin values. No DOM, no timers, no time source.
//
// A type is { kind, inputs, outputs, openInput } plus:
//   kind 'gate'      step(input) -> { out }
//   kind 'flipflop'  step(input, state) -> { out, lastC }, state = { out, lastC, fresh }
//   kind 'source'    initial(component) -> boolean; the simulator holds the value
//   kind 'sink'      nothing; the simulator only reads its input
// openInput is the level an unconnected input reads.

const inputNames = count => Array.from({ length: count }, (_, i) => `in${i}`);

function gate(inputs, fn) {
  return {
    kind: 'gate',
    inputs,
    outputs: ['out'],
    openInput: true,
    step(input) {
      return { out: { out: fn(inputs.map(name => input[name])) } };
    }
  };
}

const every = values => values.every(Boolean);
const some = values => values.some(Boolean);
const nand = count => gate(inputNames(count), values => !every(values));

function source(initial) {
  return { kind: 'source', inputs: [], outputs: ['out'], openInput: true, initial };
}

const jk = {
  kind: 'flipflop',
  inputs: ['j', 'k', 'c', 'reset'],
  outputs: ['q', 'qbar'],
  openInput: true,
  clockPin: 'c',
  initialOut: { q: false, qbar: true },
  step(input, state) {
    let q = state.out.q;
    let lastC;
    // A flip-flop that has just been powered on ignores its clock until the
    // first settle is over; the simulator then records the clock level it sees.
    if (!state.fresh) {
      if (state.lastC && !input.c) {
        // Trailing edge. J and K are read here and nowhere else.
        if (input.j && input.k) q = !q;
        else if (input.j) q = true;
        else if (input.k) q = false;
      }
      lastC = input.c;
    }
    // Reset is active LO and wins over a simultaneous trailing edge.
    if (!input.reset) q = false;
    return { out: { q, qbar: !q }, lastC };
  }
};

export const componentTypes = {
  and: gate(inputNames(2), every),
  or: gate(inputNames(2), some),
  not: gate(['in'], values => !values[0]),
  nand: nand(2),
  nor: gate(inputNames(2), values => !some(values)),
  xor: gate(inputNames(2), values => values[0] !== values[1]),
  xnor: gate(inputNames(2), values => values[0] === values[1]),
  '2nand': nand(2),
  '3nand': nand(3),
  '4nand': nand(4),
  andnor: gate(inputNames(4), v => !((v[0] && v[1]) || (v[2] && v[3]))),
  jk,
  switch: source(component => component.state === 1 || component.state === true),
  pulser: source(() => false),
  hi: source(() => true),
  gnd: source(() => false),
  clock: source(() => false),
  led: { kind: 'sink', inputs: ['in'], outputs: [], openInput: false }
};

export const DEFAULT_CLOCK_HZ = 1;
