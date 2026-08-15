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
    if (!component.type.endsWith('nand')) return;

    const pins = GateLibrary[component.type].pins.filter(pin => pin.name.startsWith('in'));
    const allInputsHigh = pins.every(pin => readInput(circuit, component.id, pin.name, states));
    states[component.id] = !allInputsHigh;
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
  circuit.wires.forEach(wire => {
    const fromComponent = circuit.components.find(c => c.id === wire.from.component);
    const toComponent = circuit.components.find(c => c.id === wire.to.component);

    if (!fromComponent || !toComponent) return;

    const fromPin = GateLibrary[fromComponent.type]?.pins.find(p => p.name === wire.from.pin);
    const toPin = GateLibrary[toComponent.type]?.pins.find(p => p.name === wire.to.pin);

    if (!fromPin || !toPin) return;

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', fromComponent.x + fromPin.x);
    line.setAttribute('y1', fromComponent.y + fromPin.y);
    line.setAttribute('x2', toComponent.x + toPin.x);
    line.setAttribute('y2', toComponent.y + toPin.y);
    line.setAttribute('class', 'wire');
    svgElement.appendChild(line);
  });

  // Render components
  circuit.components.forEach(component => {
    const gateDef = GateLibrary[component.type];
    if (!gateDef) {
      console.error(`Unknown gate type: ${component.type}`);
      return;
    }

    const useElement = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    useElement.setAttribute('href', `gates.svg#${gateDef.svgId}`);
    useElement.setAttribute('width', '1000');
    useElement.setAttribute('height', '1000');
    useElement.setAttribute('x', component.x);
    useElement.setAttribute('y', component.y);
    useElement.setAttribute('id', component.id);
    useElement.setAttribute('data-type', component.type);
    useElement.setAttribute('data-state', states[component.id] ? '1' : '0');
    svgElement.appendChild(useElement);
  });
}

export default renderCircuit;