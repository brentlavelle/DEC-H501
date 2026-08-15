// Gate Library
// Defines gate types, their SVG symbol IDs, and pin coordinates

const GateLibrary = {
  "and": {
    svgId: "and",
    pins: [
      { name: "in0", x: 18, y: 42 },
      { name: "in1", x: 18, y: 88 },
      { name: "out", x: 224, y: 65 }
    ]
  },
  "or": {
    svgId: "or",
    pins: [
      { name: "in0", x: 18, y: 42 },
      { name: "in1", x: 18, y: 88 },
      { name: "out", x: 224, y: 65 }
    ]
  },
  "nand": {
    svgId: "nand",
    pins: [
      { name: "in0", x: 18, y: 42 },
      { name: "in1", x: 18, y: 88 },
      { name: "out", x: 224, y: 65 }
    ]
  },
  "nor": {
    svgId: "nor",
    pins: [
      { name: "in0", x: 18, y: 42 },
      { name: "in1", x: 18, y: 88 },
      { name: "out", x: 224, y: 65 }
    ]
  },
  "xor": {
    svgId: "xor",
    pins: [
      { name: "in0", x: 18, y: 42 },
      { name: "in1", x: 18, y: 88 },
      { name: "out", x: 224, y: 65 }
    ]
  },
  "xnor": {
    svgId: "xnor",
    pins: [
      { name: "in0", x: 18, y: 42 },
      { name: "in1", x: 18, y: 88 },
      { name: "out", x: 224, y: 65 }
    ]
  },
  "not": {
    svgId: "not",
    pins: [
      { name: "in", x: 18, y: 65 },
      { name: "out", x: 224, y: 65 }
    ]
  },
  "jk": {
    svgId: "jk",
    pins: [
      { name: "j", x: 18, y: 36, direction: "input" },
      { name: "c", x: 18, y: 65, direction: "input" },
      { name: "k", x: 18, y: 94, direction: "input" },
      { name: "q", x: 224, y: 36, direction: "output" },
      { name: "qbar", x: 224, y: 94, direction: "output" },
      { name: "reset", x: 125, y: 126, direction: "input" }
    ]
  },
  "2nand": {
    svgId: "2nand",
    pins: [
      { name: "in0", x: 18, y: 42 },
      { name: "in1", x: 18, y: 88 },
      { name: "out", x: 224, y: 65 }
    ]
  },
  "3nand": {
    svgId: "3nand",
    pins: [
      { name: "in0", x: 18, y: 42 },
      { name: "in1", x: 18, y: 65 },
      { name: "in2", x: 18, y: 88 },
      { name: "out", x: 224, y: 65 }
    ]
  },
  "4nand": {
    svgId: "4nand",
    pins: [
      { name: "in0", x: 18, y: 30 },
      { name: "in1", x: 18, y: 50 },
      { name: "in2", x: 18, y: 80 },
      { name: "in3", x: 18, y: 100 },
      { name: "out", x: 224, y: 65 }
    ]
  },
  "switch": {
    svgId: "switch",
    pins: [
    { name: "out", x: 224, y: 65 }
    ]
  },
  "led": {
    svgId: "light",
    pins: [
    { name: "in", x: 94, y: 25, direction: "input" },
    { name: "return", x: 170, y: 25, direction: "input" }
    ]
  }
};

export default GateLibrary;