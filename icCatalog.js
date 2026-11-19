// IC Catalog
// Maps each primitive gate type (and input count, where it matters) to real 7400-series
// packages that could be used to build it on a breadboard. Several parts exist per gate
// type with different gate/input counts per package; list the common ones first.
//
// The H-500 itself used standard TTL; the catalog names the LS parts you can still buy.
// - jk: the 74LS73A is the LS form of the H-500's 7473: two J-K flip-flops per chip,
//   triggered on the falling clock edge, with an active-LO clear.
// - andnor: the H-500's 7450 is obsolete. The 74LS51 holds one 2-wide 2-input
//   AND-OR-INVERT section and one 2-wide 3-input section; tie the 3-input section's
//   spare inputs HIGH and it serves as the second 2-input gate.

const IC_CATALOG = {
  and: [{ part: '74LS08', gatesPerPackage: 4, inputsPerGate: 2 }],
  or: [{ part: '74LS32', gatesPerPackage: 4, inputsPerGate: 2 }],
  nor: [{ part: '74LS02', gatesPerPackage: 4, inputsPerGate: 2 }],
  xor: [{ part: '74LS86', gatesPerPackage: 4, inputsPerGate: 2 }],
  xnor: [{ part: '74LS266', gatesPerPackage: 4, inputsPerGate: 2 }],
  not: [{ part: '74LS04', gatesPerPackage: 6, inputsPerGate: 1 }],
  jk: [{ part: '74LS73A', gatesPerPackage: 2, inputsPerGate: null }],
  andnor: [{ part: '74LS51', gatesPerPackage: 2, inputsPerGate: 4 }],
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
