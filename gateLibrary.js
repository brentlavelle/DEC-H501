// Gate Library
// Defines gate types, their SVG symbol IDs, footprints and pin coordinates.
//
// Coordinates are board units measured from the part's top-left corner, and must match
// the symbols in gates.svg. Gates and the flip-flop are 84 x 65 with inputs at x = 7 and
// outputs at x = 77. Switches, pulsers, lamps and the clock are 40 x 65 with their one
// terminal at the top. A pin with no `direction` is an input if its name starts with
// `in`, otherwise an output.

const GATE = { width: 84, height: 65 };
const CONTROL = { width: 40, height: 65 };

const IN_X = 7;
const OUT_X = 77;
const MID_Y = 32.5;

const twoInput = svgId => ({
  svgId,
  ...GATE,
  pins: [
    { name: "in0", x: IN_X, y: 21 },
    { name: "in1", x: IN_X, y: 44 },
    { name: "out", x: OUT_X, y: MID_Y }
  ]
});

const topTerminal = (svgId, name, direction) => ({
  svgId,
  ...CONTROL,
  pins: [{ name, x: 20, y: 6, direction }]
});

const GateLibrary = {
  "and": twoInput("and"),
  "or": twoInput("or"),
  "nand": twoInput("nand"),
  "nor": twoInput("nor"),
  "xor": twoInput("xor"),
  "xnor": twoInput("xnor"),
  "not": {
    svgId: "not",
    ...GATE,
    pins: [
      { name: "in", x: IN_X, y: MID_Y },
      { name: "out", x: OUT_X, y: MID_Y }
    ]
  },
  "jk": {
    svgId: "jk",
    ...GATE,
    pins: [
      { name: "j", x: IN_X, y: 18, direction: "input" },
      { name: "c", x: IN_X, y: MID_Y, direction: "input" },
      { name: "k", x: IN_X, y: 47, direction: "input" },
      { name: "q", x: OUT_X, y: 18, direction: "output" },
      { name: "qbar", x: OUT_X, y: 47, direction: "output" },
      { name: "reset", x: 40.5, y: 61, direction: "input" }
    ]
  },
  "2nand": twoInput("2nand"),
  "3nand": {
    svgId: "3nand",
    ...GATE,
    pins: [
      { name: "in0", x: IN_X, y: 15 },
      { name: "in1", x: IN_X, y: MID_Y },
      { name: "in2", x: IN_X, y: 50 },
      { name: "out", x: OUT_X, y: MID_Y }
    ]
  },
  "4nand": {
    svgId: "4nand",
    ...GATE,
    pins: [
      { name: "in0", x: IN_X, y: 11 },
      { name: "in1", x: IN_X, y: 25 },
      { name: "in2", x: IN_X, y: 40 },
      { name: "in3", x: IN_X, y: 54 },
      { name: "out", x: OUT_X, y: MID_Y }
    ]
  },
  // Two 2-input AND sections (in0, in1 and in2, in3) feeding a NOR.
  "andnor": {
    svgId: "andnor",
    ...GATE,
    pins: [
      { name: "in0", x: IN_X, y: 11 },
      { name: "in1", x: IN_X, y: 24 },
      { name: "in2", x: IN_X, y: 41 },
      { name: "in3", x: IN_X, y: 54 },
      { name: "out", x: OUT_X, y: MID_Y }
    ]
  },
  "switch": topTerminal("switch", "out", "output"),
  "pulser": topTerminal("pulser", "out", "output"),
  "clock": topTerminal("clock", "out", "output"),
  "led": topTerminal("light", "in", "input"),
  "hi": {
    svgId: "hi",
    width: 40,
    height: 30,
    pins: [{ name: "out", x: 20, y: 21, direction: "output" }]
  }
};

export default GateLibrary;
