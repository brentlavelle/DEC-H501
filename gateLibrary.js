// Gate Library
// Defines gate types, their SVG symbol IDs, and pin coordinates

const GateLibrary = {
  "2nand": {
    svgId: "2nand",
    pins: [
      { name: "in0", x: 10, y: 30 },
      { name: "in1", x: 10, y: 50 },
      { name: "out", x: 78, y: 40 }
    ]
  },
  "3nand": {
    svgId: "3nand",
    pins: [
      { name: "in0", x: 10, y: 25 },
      { name: "in1", x: 10, y: 40 },
      { name: "in2", x: 10, y: 55 },
      { name: "out", x: 78, y: 40 }
    ]
  },
  "4nand": {
    svgId: "4nand",
    pins: [
      { name: "in0", x: 10, y: 20 },
      { name: "in1", x: 10, y: 35 },
      { name: "in2", x: 10, y: 50 },
      { name: "in3", x: 10, y: 65 },
      { name: "out", x: 78, y: 40 }
    ]
  },
  "switch": {
    svgId: "switch",
    pins: [
      { name: "out", x: 78, y: 40 }
    ]
  },
  "led": {
    svgId: "led",
    pins: [
      { name: "in", x: 10, y: 40 }
    ]
  }
};

export default GateLibrary;