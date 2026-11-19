// Renderer
// Converts JSON circuit model into SVG elements

import GateLibrary from './gateLibrary.js';
import { getComponentPins, getComponentSize, isSubcircuitType } from './subcircuits.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
// Small enough that the hotspots of a 4-input gate's pins, 14 units apart, do not overlap.
const PIN_HOTSPOT_RADIUS = 6;
// Covers the white centre of a terminal ring, which is 3.5 units across its middle.
const WIRE_END_RADIUS = 3.5;

// Pin values come from a simulator; nothing is evaluated here.
// `view` is { sim, rootPinMap }: the simulator built from the flattened circuit, and the
// map from a subcircuit instance's external pins to the flattened pins behind them.
// With no simulator (it could not be built), everything draws as LO.
function levelReader(view) {
  const sim = view?.sim;
  const rootPinMap = view?.rootPinMap || {};
  return (componentId, pinName) => {
    if (!sim) return false;
    // Follows a pin on a collapsed subcircuit box through to the part that carries it.
    const { component, pin } = rootPinMap[componentId]?.[pinName] || { component: componentId, pin: pinName };
    try {
      return sim.read(component, pin);
    } catch {
      try {
        return sim.readInput(component, pin);
      } catch {
        return false;
      }
    }
  };
}

// The one level a primitive part shows: a lamp its input, a flip-flop its 1 output,
// everything else its output.
function shownLevel(component, level) {
  if (component.type === 'led') return level(component.id, 'in');
  if (component.type === 'jk') return level(component.id, 'q');
  return level(component.id, 'out');
}

function symbolFor(component, on) {
  if (component.type === 'switch') return on ? 'switch-closed' : 'switch-open';
  if (component.type === 'led') return on ? 'light-on' : 'light-off';
  if (component.type === 'jk') return on ? 'jk-high' : 'jk';
  return GateLibrary[component.type].svgId;
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

// Clears the SVG and rebuilds it. Use updateCircuit when only pin values changed.
// A nameplate is decoration from the layout: { x, y, width, height, text: [name, model] }.
// The first line is drawn large, the rest small beneath it, all centred on the plate.
function renderNameplate(plate, svgElement) {
  const group = document.createElementNS(SVG_NS, 'g');
  group.setAttribute('class', 'nameplate');
  const rect = document.createElementNS(SVG_NS, 'rect');
  rect.setAttribute('x', plate.x);
  rect.setAttribute('y', plate.y);
  rect.setAttribute('width', plate.width);
  rect.setAttribute('height', plate.height);
  rect.setAttribute('rx', 3);
  rect.setAttribute('class', 'nameplate-plate');
  group.appendChild(rect);
  const [name, ...rest] = plate.text || [];
  const centre = plate.x + plate.width / 2;
  const lines = [[name, 'nameplate-name', plate.y + plate.height * 0.48],
    ...rest.map((line, i) => [line, 'nameplate-model', plate.y + plate.height * 0.78 + i * 10])];
  for (const [line, className, y] of lines) {
    if (!line) continue;
    const text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('x', centre);
    text.setAttribute('y', y);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('class', className);
    text.textContent = line;
    group.appendChild(text);
  }
  svgElement.appendChild(group);
}

function renderCircuit(circuit, svgElement, view) {
  // Clear existing SVG content
  while (svgElement.firstChild) {
    svgElement.removeChild(svgElement.firstChild);
  }

  const level = levelReader(view);

  // The panel's nameplate, if the layout has one, goes under everything else.
  if (circuit.nameplate) renderNameplate(circuit.nameplate, svgElement);

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
    const energized = level(wire.from.component, wire.from.pin);
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
      const on = shownLevel(component, level);
      const useElement = document.createElementNS(SVG_NS, 'use');
      useElement.setAttribute('href', `gates.svg#${symbolFor(component, on)}`);
      const size = getComponentSize(circuit, component.type);
      useElement.setAttribute('width', size.width);
      useElement.setAttribute('height', size.height);
      useElement.setAttribute('x', component.x);
      useElement.setAttribute('y', component.y);
      useElement.setAttribute('id', component.id);
      useElement.setAttribute('data-type', component.type);
      useElement.setAttribute('data-state', on ? '1' : '0');
      svgElement.appendChild(useElement);
    }

    // The clock shows its rate under the knob; click the knob to change it.
    if (component.type === 'clock') {
      const size = getComponentSize(circuit, component.type);
      const rate = document.createElementNS(SVG_NS, 'text');
      rate.setAttribute('x', component.x + size.width / 2);
      rate.setAttribute('y', component.y + size.height + (component.label ? 16 : 8));
      rate.setAttribute('text-anchor', 'middle');
      rate.setAttribute('class', 'part-label clock-rate');
      rate.textContent = component.hz === 0 ? 'OFF' : `${component.hz ?? 1} Hz`;
      svgElement.appendChild(rate);
    }

    // The optional label (a panel number, a legend) goes just under the part.
    if (component.label) {
      const size = getComponentSize(circuit, component.type);
      const labelElement = document.createElementNS(SVG_NS, 'text');
      labelElement.setAttribute('x', component.x + size.width / 2);
      labelElement.setAttribute('y', component.y + size.height + 8);
      labelElement.setAttribute('text-anchor', 'middle');
      labelElement.setAttribute('class', 'part-label');
      labelElement.textContent = component.label;
      svgElement.appendChild(labelElement);
    }

    pins.forEach(pin => {
      const pinElement = document.createElementNS(SVG_NS, 'circle');
      pinElement.setAttribute('cx', component.x + pin.x);
      pinElement.setAttribute('cy', component.y + pin.y);
      pinElement.setAttribute('r', PIN_HOTSPOT_RADIUS);
      pinElement.setAttribute('class', 'pin-hotspot');
      pinElement.setAttribute('data-component', component.id);
      pinElement.setAttribute('data-pin', pin.name);
      pinElement.setAttribute('data-direction', pin.direction || (pin.name.startsWith('in') ? 'input' : 'output'));
      svgElement.appendChild(pinElement);
    });
  });

  // A filled dot on every terminal that has a wire on it, so a wire that only passes over a
  // terminal cannot be mistaken for one that ends there. Drawn last, above the parts; the
  // pin hotspots underneath still take the clicks.
  for (const end of wireEnds(circuit)) {
    const dot = document.createElementNS(SVG_NS, 'circle');
    const energized = level(end.source.component, end.source.pin);
    dot.setAttribute('cx', end.x);
    dot.setAttribute('cy', end.y);
    dot.setAttribute('r', WIRE_END_RADIUS);
    dot.setAttribute('class', `wire-end${energized ? ' wire-end-energized' : ''}`);
    dot.setAttribute('data-source-component', end.source.component);
    dot.setAttribute('data-source-pin', end.source.pin);
    svgElement.appendChild(dot);
  }
}

// The terminals that have a wire on them: one entry per terminal, however many wires it
// carries, with its position on the board and the output that drives it. A wire whose part
// or pin cannot be found is skipped, as it is when wires are drawn.
export function wireEnds(circuit) {
  const ends = new Map();
  for (const wire of circuit.wires) {
    const located = [wire.from, wire.to].map(end => {
      const component = circuit.components.find(c => c.id === end.component);
      const pin = component && getComponentPins(circuit, component.type)?.find(p => p.name === end.pin);
      return pin ? { component: end.component, pin: end.pin, x: component.x + pin.x, y: component.y + pin.y } : null;
    });
    if (located.includes(null)) continue;
    for (const end of located) {
      const key = `${end.component}.${end.pin}`;
      if (!ends.has(key)) ends.set(key, { ...end, source: { component: wire.from.component, pin: wire.from.pin } });
    }
  }
  return [...ends.values()];
}

function wirePath(x1, y1, x2, y2) {
  const horizontalDistance = Math.max(20, Math.abs(x2 - x1) * 0.35);
  const direction = x2 >= x1 ? 1 : -1;
  return `M ${x1} ${y1} C ${x1 + direction * horizontalDistance} ${y1}, ${x2 - direction * horizontalDistance} ${y2}, ${x2} ${y2}`;
}

// Brings wires, lamps, switches and flip-flops up to date with the simulator without
// rebuilding anything: no element is added, removed or moved, so a drag, a half-drawn
// wire, a rubber-band rectangle and the current selection all survive it.
export function updateCircuit(circuit, svgElement, view) {
  const level = levelReader(view);

  svgElement.querySelectorAll('path.wire').forEach(path => {
    const wire = circuit.wires[Number(path.getAttribute('data-wire-index'))];
    if (!wire) return;
    const energized = level(wire.from.component, wire.from.pin);
    path.classList.toggle('wire-energized', energized);
    path.setAttribute('data-energized', energized ? '1' : '0');
  });

  svgElement.querySelectorAll('circle.wire-end').forEach(dot => {
    const energized = level(dot.getAttribute('data-source-component'), dot.getAttribute('data-source-pin'));
    dot.classList.toggle('wire-end-energized', energized);
  });

  const byId = new Map(circuit.components.map(component => [component.id, component]));
  svgElement.querySelectorAll('use[data-type]').forEach(useElement => {
    const component = byId.get(useElement.getAttribute('id'));
    if (!component || !GateLibrary[component.type]) return;
    const on = shownLevel(component, level);
    const href = `gates.svg#${symbolFor(component, on)}`;
    if (useElement.getAttribute('href') !== href) useElement.setAttribute('href', href);
    useElement.setAttribute('data-state', on ? '1' : '0');
  });
}

export default renderCircuit;
