// Renderer
// Converts JSON circuit model into SVG elements

import GateLibrary from './gateLibrary.js';
import { flattenCircuit, getComponentPins, isSubcircuitType } from './subcircuits.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function readInput(circuit, componentId, pinName, states) {
  const wire = circuit.wires.find(item =>
    item.to.component === componentId && item.to.pin === pinName
  );
  return wire ? readOutput(wire.from.component, wire.from.pin, states) : false;
}

function readOutput(componentId, pinName, states) {
  const value = Boolean(states[componentId]);
  const component = states.components?.find(item => item.id === componentId);
  return component?.type === 'jk' && pinName === 'qbar' ? !value : value;
}

function evaluateCircuit(circuit) {
  const states = Object.fromEntries(circuit.components.map(component => [component.id, Boolean(component.state)]));
  states.components = circuit.components;

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
    if (component.type !== 'jk') return;

    const clock = readInput(circuit, component.id, 'c', states);
    const reset = readInput(circuit, component.id, 'reset', states);
    const j = readInput(circuit, component.id, 'j', states);
    const k = readInput(circuit, component.id, 'k', states);
    const previousClock = Boolean(component.previousClock);
    const previousJ = Boolean(component.previousJ);
    const previousK = Boolean(component.previousK);
    const clockPulse = clock && !previousClock;
    const inputPulse = clock && (j !== previousJ || k !== previousK);

    if (reset) {
      component.state = 0;
    } else if (clockPulse || inputPulse) {
      if (j && k) {
        component.state = component.state ? 0 : 1;
      } else if (j && !k) {
        component.state = 1;
      } else if (!j && k) {
        component.state = 0;
      }
    }

    component.previousClock = clock ? 1 : 0;
    component.previousJ = j;
    component.previousK = k;
    states[component.id] = Boolean(component.state);
  });

  circuit.components.forEach(component => {
    if (component.type === 'led') {
      states[component.id] = readInput(circuit, component.id, 'in', states);
    }
  });

  return states;
}

function renderSubcircuitBox(circuit, component, svgElement) {
  const subDef = circuit.subcircuits[component.type];
  const rect = document.createElementNS(SVG_NS, 'rect');
  rect.setAttribute('x', component.x);
  rect.setAttribute('y', component.y);
  rect.setAttribute('width', subDef.width);
  rect.setAttribute('height', subDef.height);
  rect.setAttribute('class', 'ic-box');
  rect.setAttribute('id', component.id);
  rect.setAttribute('data-type', component.type);
  svgElement.appendChild(rect);

  const label = document.createElementNS(SVG_NS, 'text');
  label.setAttribute('x', component.x + subDef.width / 2);
  label.setAttribute('y', component.y + subDef.height / 2);
  label.setAttribute('text-anchor', 'middle');
  label.setAttribute('dominant-baseline', 'middle');
  label.setAttribute('class', 'ic-label');
  label.textContent = component.type;
  svgElement.appendChild(label);
}

function renderCircuit(circuit, svgElement) {
  // Clear existing SVG content
  while (svgElement.firstChild) {
    svgElement.removeChild(svgElement.firstChild);
  }

  const flattened = flattenCircuit(circuit);
  const states = evaluateCircuit(flattened);

  // Resolves a root-level {component, pin} to the qualified id that actually carries the
  // signal, following through any subcircuit instance's external pin mapping.
  function rootPin(componentId, pinName) {
    return flattened.rootPinMap[componentId]?.[pinName] || { component: componentId, pin: pinName };
  }

  // Render wires first so components and pin labels remain visible above them.
  circuit.wires.forEach((wire, wireIndex) => {
    const fromComponent = circuit.components.find(c => c.id === wire.from.component);
    const toComponent = circuit.components.find(c => c.id === wire.to.component);

    if (!fromComponent || !toComponent) return;

    const fromPin = getComponentPins(circuit, fromComponent.type)?.find(p => p.name === wire.from.pin);
    const toPin = getComponentPins(circuit, toComponent.type)?.find(p => p.name === wire.to.pin);

    if (!fromPin || !toPin) return;

    const x1 = fromComponent.x + fromPin.x;
    const y1 = fromComponent.y + fromPin.y;
    const x2 = toComponent.x + toPin.x;
    const y2 = toComponent.y + toPin.y;
    const curve = document.createElementNS(SVG_NS, 'path');
    curve.setAttribute('d', wirePath(x1, y1, x2, y2));
    const qualified = rootPin(wire.from.component, wire.from.pin);
    const energized = readOutput(qualified.component, qualified.pin, states);
    curve.setAttribute('class', `wire${energized ? ' wire-energized' : ''}`);
    curve.setAttribute('data-energized', energized ? '1' : '0');
    curve.setAttribute('data-wire-index', wireIndex);
    svgElement.appendChild(curve);
  });

  // Render components
  circuit.components.forEach(component => {
    const pins = getComponentPins(circuit, component.type);
    if (!pins) {
      console.error(`Unknown component type: ${component.type}`);
      return;
    }

    if (isSubcircuitType(circuit, component.type)) {
      renderSubcircuitBox(circuit, component, svgElement);
    } else {
      const gateDef = GateLibrary[component.type];
      const useElement = document.createElementNS(SVG_NS, 'use');
      const symbolId = component.type === 'switch'
        ? (component.state ? 'switch-closed' : 'switch-open')
        : component.type === 'led'
          ? (states[component.id] ? 'light-on' : 'light-off')
          : component.type === 'jk'
            ? (states[component.id] ? 'jk-high' : 'jk')
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

      if (component.type === 'switch') {
        const switchHitArea = document.createElementNS(SVG_NS, 'rect');
        switchHitArea.setAttribute('x', component.x - 26);
        switchHitArea.setAttribute('y', component.y + 35);
        switchHitArea.setAttribute('width', '312');
        switchHitArea.setAttribute('height', '60');
        switchHitArea.setAttribute('fill', 'transparent');
        switchHitArea.setAttribute('class', 'switch-hit-area');
        switchHitArea.setAttribute('data-switch-hit', 'true');
        switchHitArea.setAttribute('data-component', component.id);
        svgElement.appendChild(switchHitArea);
      }
    }

    pins.forEach(pin => {
      const pinElement = document.createElementNS(SVG_NS, 'circle');
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