// Subcircuits
// Lets a set of gates be collapsed into a reusable named "IC box" component that can be
// zoomed into for editing. Definitions live in circuit.subcircuits, keyed by type name,
// and are shared by every placed instance of that type (like editing a symbol).

import GateLibrary from './gateLibrary.js';

const PIN_SPACING = 40;
const BOX_WIDTH = 260;
const BOX_MIN_HEIGHT = 130;

export function getComponentPins(circuit, type) {
  if (GateLibrary[type]) return GateLibrary[type].pins;
  return circuit.subcircuits?.[type]?.pins || null;
}

export function isSubcircuitType(circuit, type) {
  return !GateLibrary[type] && Boolean(circuit.subcircuits?.[type]);
}

export function getSubcircuitDef(circuit, type) {
  return circuit.subcircuits?.[type] || null;
}

// Expands every subcircuit instance into primitive gate components/wires with
// instance-qualified ids ("u1.g2"), so the simulator only ever sees base gate types.
// Pure: the circuit passed in is not modified, and the result shares no objects with it.
// Runtime state is the simulator's, keyed by these qualified ids, so two instances of
// one definition never share flip-flop state. Also returns rootPinMap: for each root-level subcircuit instance, maps its
// external pin name to the qualified {component, pin} that actually carries the signal —
// used by the renderer to look up simulation state for wires/pins on a collapsed box.
export function flattenCircuit(circuit) {
  const components = [];
  const wires = [];
  const rootPinMap = {};
  const subcircuits = circuit.subcircuits || {};
  flattenLevel(circuit.components, circuit.wires, '', subcircuits, components, wires, rootPinMap);
  return { components, wires, rootPinMap };
}

function flattenLevel(levelComponents, levelWires, prefix, subcircuits, outComponents, outWires, pinMapOut) {
  levelComponents.forEach(component => {
    const qualifiedId = prefix + component.id;
    const subDef = subcircuits[component.type];

    if (!subDef) {
      outComponents.push({ ...component, id: qualifiedId });
      return;
    }

    const childPrefix = `${qualifiedId}.`;
    const childPinMap = {};
    flattenLevel(subDef.components, subDef.wires, childPrefix, subcircuits, outComponents, outWires, childPinMap);

    pinMapOut[component.id] = {};
    subDef.pins.forEach(pin => {
      const resolved = childPinMap[pin.internal.component]?.[pin.internal.pin];
      pinMapOut[component.id][pin.name] = resolved ? { ...resolved } : {
        component: childPrefix + pin.internal.component,
        pin: pin.internal.pin
      };
    });
  });

  levelWires.forEach(wire => {
    outWires.push({
      from: resolveEndpoint(wire.from, prefix, pinMapOut),
      to: resolveEndpoint(wire.to, prefix, pinMapOut)
    });
  });
}

function resolveEndpoint(endpoint, prefix, pinMap) {
  const mapped = pinMap[endpoint.component]?.[endpoint.pin];
  return mapped ? { ...mapped } : { component: prefix + endpoint.component, pin: endpoint.pin };
}

// Collapses the given component ids (plus any wires fully contained within them) into a
// new subcircuit definition, replacing them in `circuit` with a single instance. Wires
// crossing the selection boundary become the new component's external pins.
export function makeComponent(circuit, selectedIds, typeName) {
  if (!typeName || !typeName.trim()) throw new Error('Component name is required.');
  if (GateLibrary[typeName] || circuit.subcircuits?.[typeName]) {
    throw new Error(`"${typeName}" is already a component type.`);
  }
  const idSet = new Set(selectedIds);
  const selectedComponents = circuit.components.filter(c => idSet.has(c.id));
  if (selectedComponents.length < 1) throw new Error('Select at least one component first.');

  const innerWires = [];
  const boundaryWires = [];
  circuit.wires.forEach(wire => {
    const fromInside = idSet.has(wire.from.component);
    const toInside = idSet.has(wire.to.component);
    if (fromInside && toInside) innerWires.push(wire);
    else if (fromInside || toInside) boundaryWires.push(wire);
    // wires with neither end selected are untouched, left in circuit.wires below
  });

  const pins = [];
  const externalPinByBoundaryWire = new Map();
  let inputCount = 0;
  let outputCount = 0;
  boundaryWires.forEach(wire => {
    const fromInside = idSet.has(wire.from.component);
    const direction = fromInside ? 'output' : 'input';
    const internal = fromInside ? wire.from : wire.to;
    const name = direction === 'input' ? `in${inputCount++}` : `out${outputCount++}`;
    pins.push({ name, direction, internal: { component: internal.component, pin: internal.pin } });
    externalPinByBoundaryWire.set(wire, { name, direction });
  });

  const height = Math.max(BOX_MIN_HEIGHT, PIN_SPACING * Math.max(inputCount, outputCount, 1) + PIN_SPACING);
  let nextIn = 0;
  let nextOut = 0;
  pins.forEach(pin => {
    pin.x = pin.direction === 'input' ? 18 : BOX_WIDTH - 36;
    const slot = pin.direction === 'input' ? nextIn++ : nextOut++;
    const count = pin.direction === 'input' ? inputCount : outputCount;
    pin.y = ((slot + 1) * height) / (count + 1);
  });

  const minX = Math.min(...selectedComponents.map(c => c.x));
  const minY = Math.min(...selectedComponents.map(c => c.y));

  circuit.subcircuits = circuit.subcircuits || {};
  circuit.subcircuits[typeName] = {
    components: selectedComponents.map(c => ({ ...c, x: c.x - minX, y: c.y - minY })),
    wires: innerWires,
    pins,
    width: BOX_WIDTH,
    height
  };

  const instanceId = uniqueId(circuit, typeName);
  const instance = { id: instanceId, type: typeName, x: minX, y: minY };

  const rewiredBoundary = boundaryWires.map(wire => {
    const pin = externalPinByBoundaryWire.get(wire);
    return pin.direction === 'input'
      ? { from: wire.from, to: { component: instanceId, pin: pin.name } }
      : { from: { component: instanceId, pin: pin.name }, to: wire.to };
  });

  // Mutate arrays in place (rather than reassigning circuit.components/wires) so this
  // still works when `circuit` is a lightweight { components, wires, subcircuits } view
  // onto a nested subcircuit definition, not just the root circuit object.
  const remainingComponents = circuit.components.filter(c => !idSet.has(c.id));
  circuit.components.length = 0;
  circuit.components.push(...remainingComponents, instance);

  const remainingWires = circuit.wires.filter(w => !innerWires.includes(w) && !boundaryWires.includes(w));
  circuit.wires.length = 0;
  circuit.wires.push(...remainingWires, ...rewiredBoundary);

  return instanceId;
}

// Inverse of makeComponent: expands one instance back into loose gates at its position.
export function ungroupComponent(circuit, instanceId) {
  const instance = circuit.components.find(c => c.id === instanceId);
  if (!instance) throw new Error('Component instance not found.');
  const subDef = circuit.subcircuits?.[instance.type];
  if (!subDef) throw new Error(`"${instance.type}" is not a component (built-in gates can't be ungrouped).`);

  const prefix = `${instanceId}.`;
  const restoredComponents = subDef.components.map(inner => ({
    ...inner,
    id: prefix + inner.id,
    x: inner.x + instance.x,
    y: inner.y + instance.y
  }));
  const restoredWires = subDef.wires.map(wire => ({
    from: { component: prefix + wire.from.component, pin: wire.from.pin },
    to: { component: prefix + wire.to.component, pin: wire.to.pin }
  }));

  const pinToInternal = new Map(subDef.pins.map(pin => [pin.name, { component: prefix + pin.internal.component, pin: pin.internal.pin }]));
  const rewiredExternal = circuit.wires
    .filter(w => w.from.component === instanceId || w.to.component === instanceId)
    .map(wire => {
      if (wire.from.component === instanceId) {
        return { from: pinToInternal.get(wire.from.pin), to: wire.to };
      }
      return { from: wire.from, to: pinToInternal.get(wire.to.pin) };
    });

  const keptComponents = circuit.components.filter(c => c.id !== instanceId);
  circuit.components.length = 0;
  circuit.components.push(...keptComponents, ...restoredComponents);

  const keptWires = circuit.wires.filter(w => w.from.component !== instanceId && w.to.component !== instanceId);
  circuit.wires.length = 0;
  circuit.wires.push(...keptWires, ...restoredWires, ...rewiredExternal);
}

function uniqueId(circuit, typeName) {
  const base = typeName.replace(/[^a-zA-Z0-9]/g, '') || 'u';
  let n = 1;
  let id = `${base}1`;
  const existing = new Set(circuit.components.map(c => c.id));
  while (existing.has(id)) {
    n += 1;
    id = `${base}${n}`;
  }
  return id;
}
