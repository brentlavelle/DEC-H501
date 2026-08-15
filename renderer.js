// Renderer
// Converts JSON circuit model into SVG elements

import GateLibrary from './gateLibrary.js';

function readInput(circuit, componentId, pinName, states) {
  const wire = circuit.wires.find(item =>
    item.to.component === componentId && item.to.pin === pinName
  );
  return wire ? Boolean(states[wire.from.component]) : false;
}

function evaluateCircuit(circuit) {
  const states = Object.fromEntries(circuit.components.map(component => [component.id, Boolean(component.state)]));

  circuit.components.forEach(component => {
    if (!['nand', 'nor', 'xor', 'xnor', '2nand', '3nand', '4nand'].includes(component.type)) return;

    const pins = GateLibrary[component.type].pins.filter(pin => pin.name.startsWith('in'));
    const inputs = pins.map(pin => readInput(circuit, component.id, pin.name, states));
    const highCount = inputs.filter(Boolean).length;
    const allInputsHigh = highCount === inputs.length;
    const anyInputHigh = highCount > 0;

    if (component.type === 'nor') {
      states[component.id] = !anyInputHigh;
    } else if (component.type === 'xor') {
      states[component.id] = highCount % 2 === 1;
    } else if (component.type === 'xnor') {
      states[component.id] = highCount % 2 === 0;
    } else {
      states[component.id] = !allInputsHigh;
    }
  });

  circuit.components.forEach(component => {
    if (component.type === 'led') {
      states[component.id] = readInput(circuit, component.id, 'in', states);
    }
  });

  return states;
}

function renderCircuit(circuit, svgElement) {
  // Clear existing SVG content
  while (svgElement.firstChild) {
    svgElement.removeChild(svgElement.firstChild);
  }

  const states = evaluateCircuit(circuit);

  // Render wires first so components and pin labels remain visible above them.
  circuit.wires.forEach((wire, wireIndex) => {
    const fromComponent = circuit.components.find(c => c.id === wire.from.component);
    const toComponent = circuit.components.find(c => c.id === wire.to.component);

    if (!fromComponent || !toComponent) return;

    const fromPin = GateLibrary[fromComponent.type]?.pins.find(p => p.name === wire.from.pin);
    const toPin = GateLibrary[toComponent.type]?.pins.find(p => p.name === wire.to.pin);

    if (!fromPin || !toPin) return;

    const x1 = fromComponent.x + fromPin.x;
    const y1 = fromComponent.y + fromPin.y;
    const x2 = toComponent.x + toPin.x;
    const y2 = toComponent.y + toPin.y;
    const curve = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    curve.setAttribute('d', wirePath(x1, y1, x2, y2));
    curve.setAttribute('class', `wire${states[wire.from.component] ? ' wire-energized' : ''}`);
    curve.setAttribute('data-energized', states[wire.from.component] ? '1' : '0');
    curve.setAttribute('data-wire-index', wireIndex);
    svgElement.appendChild(curve);
  });

  // Render components
  circuit.components.forEach(component => {
    const gateDef = GateLibrary[component.type];
    if (!gateDef) {
      console.error(`Unknown gate type: ${component.type}`);
      return;
    }

    const useElement = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    const symbolId = component.type === 'switch'
      ? (component.state ? 'switch-closed' : 'switch-open')
      : gateDef.svgId;
    useElement.setAttribute('href', `gates.svg#${symbolId}`);
    useElement.setAttribute('width', '260');
    useElement.setAttribute('height', '130');
    useElement.setAttribute('x', component.x);
    useElement.setAttribute('y', component.y);
    useElement.setAttribute('id', component.id);
    useElement.setAttribute('data-type', component.type);
    useElement.setAttribute('data-state', states[component.id] ? '1' : '0');
    svgElement.appendChild(useElement);

    gateDef.pins.forEach(pin => {
      const pinElement = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      pinElement.setAttribute('cx', component.x + pin.x);
      pinElement.setAttribute('cy', component.y + pin.y);
      pinElement.setAttribute('r', '12');
      pinElement.setAttribute('class', 'pin-hotspot');
      pinElement.setAttribute('data-component', component.id);
      pinElement.setAttribute('data-pin', pin.name);
      pinElement.setAttribute('data-direction', pin.direction || (pin.name.startsWith('in') ? 'input' : 'output'));
      svgElement.appendChild(pinElement);
    });
  });
}

function wirePath(x1, y1, x2, y2) {
  const horizontalDistance = Math.max(40, Math.abs(x2 - x1) * 0.35);
  const direction = x2 >= x1 ? 1 : -1;
  return `M ${x1} ${y1} C ${x1 + direction * horizontalDistance} ${y1}, ${x2 - direction * horizontalDistance} ${y2}, ${x2} ${y2}`;
}

export default renderCircuit;