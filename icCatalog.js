// IC Catalog
// Maps each primitive gate type (and input count, where it matters) to real 7400-series
// packages that could be used to build it on a breadboard. Several parts exist per gate
// type with different gate/input counts per package; list the common ones first.

const IC_CATALOG = {
  and: [{ part: '74LS08', gatesPerPackage: 4, inputsPerGate: 2 }],
  or: [{ part: '74LS32', gatesPerPackage: 4, inputsPerGate: 2 }],
  nor: [{ part: '74LS02', gatesPerPackage: 4, inputsPerGate: 2 }],
  xor: [{ part: '74LS86', gatesPerPackage: 4, inputsPerGate: 2 }],
  xnor: [{ part: '74LS266', gatesPerPackage: 4, inputsPerGate: 2 }],
  not: [{ part: '74LS04', gatesPerPackage: 6, inputsPerGate: 1 }],
  jk: [{ part: '74LS76', gatesPerPackage: 2, inputsPerGate: null }],
  nand: [
    { part: '74LS00', gatesPerPackage: 4, inputsPerGate: 2 },
    { part: '74LS10', gatesPerPackage: 3, inputsPerGate: 3 },
    { part: '74LS20', gatesPerPackage: 2, inputsPerGate: 4 }
  ],
  '2nand': [{ part: '74LS00', gatesPerPackage: 4, inputsPerGate: 2 }],
  '3nand': [{ part: '74LS10', gatesPerPackage: 3, inputsPerGate: 3 }],
  '4nand': [{ part: '74LS20', gatesPerPackage: 2, inputsPerGate: 4 }]
};

export default IC_CATALOG;
