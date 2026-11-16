// Board Editor
// Adds drag-and-drop functionality and a palette for placing gates

import renderCircuit, { updateCircuit } from './renderer.js';
import { createEmptyCircuit, parseCircuitFile, serializeCircuit } from './circuitModel.js';
import { flattenCircuit, makeComponent, ungroupComponent, getComponentSize } from './subcircuits.js';
import { generateBOM } from './bomGenerator.js';
import { createSimulator } from './sim/core.js';
import { createDriver } from './simDriver.js';

const board = document.getElementById('board');
const fileStatus = document.getElementById('fileStatus');
const componentStatus = document.getElementById('componentStatus');
const breadcrumbEl = document.getElementById('breadcrumb');
const simStatus = document.getElementById('simStatus');
let circuit = null; // Circuit will be loaded dynamically

// The one simulator for the active view (the root circuit, or the subcircuit definition
// zoomed into, simulated on its own). All logic levels on screen are read from it.
let sim = null;
let rootPinMap = {};
let simMessage = '';

// Navigation stack of subcircuit type names being edited; [] means viewing the root circuit.
let navStack = [];
// Ids of components selected in the currently active view (root or a zoomed-in subcircuit).
let selectedIds = new Set();

function setStatus(message, isError = false) {
  if (!fileStatus) return;
  fileStatus.textContent = message;
  fileStatus.style.color = isError ? 'crimson' : 'inherit';
}

function setComponentStatus(message, isError = false) {
  if (!componentStatus) return;
  componentStatus.textContent = message;
  componentStatus.style.color = isError ? 'crimson' : 'inherit';
}

function setSimStatus(message) {
  if (!simStatus || message === simMessage) return;
  simMessage = message;
  simStatus.textContent = message;
  simStatus.style.color = message ? 'crimson' : 'inherit';
}

// Says so when the circuit oscillates or the clock outruns the simulator.
function reportSim(result) {
  if (!result.settled) {
    setSimStatus(`Oscillating, no stable state: ${result.oscillating.join(', ')}`);
  } else if (result.behind) {
    setSimStatus('The clock is running faster than the simulation can follow; pulses were skipped.');
  } else {
    setSimStatus('');
  }
}

// Builds the simulator for the active view. With `carry`, parts that are still there
// keep their state, so adding a wire does not reset a counter. A different view or a
// different file starts from power-on.
function rebuildSim({ carry = false } = {}) {
  const view = activeView();
  if (!view) {
    sim = null;
    rootPinMap = {};
    return;
  }
  try {
    const flat = flattenCircuit(view);
    sim = createSimulator(flat, carry && sim ? { carryFrom: sim } : {});
    rootPinMap = flat.rootPinMap;
    reportSim(sim.powerOn);
  } catch (error) {
    sim = null;
    rootPinMap = {};
    setSimStatus(`Simulation stopped: ${error.message}`);
  }
}

// Redraws logic levels in place, without rebuilding the board.
function refresh() {
  const view = activeView();
  if (view) updateCircuit(view, board, { sim, rootPinMap });
}

function toggleSwitch(component) {
  component.state = component.state ? 0 : 1;
  if (sim) {
    reportSim(sim.setInput(component.id, component.state));
  }
  refresh();
}

// Returns a { components, wires, subcircuits } view onto whatever is being edited right
// now: the root circuit, or the definition of the subcircuit currently zoomed into.
function activeView() {
  if (navStack.length === 0) return circuit;
  const def = circuit.subcircuits[navStack[navStack.length - 1]];
  return { components: def.components, wires: def.wires, subcircuits: circuit.subcircuits };
}

function updateBreadcrumb() {
  if (!breadcrumbEl) return;
  breadcrumbEl.innerHTML = '';
  const path = ['Root', ...navStack];
  path.forEach((name, index) => {
    const span = document.createElement('span');
    span.textContent = name;
    span.className = 'breadcrumb-item';
    if (index < path.length - 1) {
      span.classList.add('clickable');
      span.addEventListener('click', () => {
        navStack = navStack.slice(0, index);
        selectedIds.clear();
        rebuildSim();
        render();
      });
    }
    breadcrumbEl.appendChild(span);
    if (index < path.length - 1) breadcrumbEl.appendChild(document.createTextNode(' > '));
  });
}

function applySelectionHighlight() {
  board.querySelectorAll('[data-type]').forEach(element => {
    element.classList.toggle('selected', selectedIds.has(element.getAttribute('id')));
  });
}


function render() {
  renderCircuit(activeView(), board, { sim, rootPinMap });
  applySelectionHighlight();
  updateBreadcrumb();
}

// Optional snap to a module-bay grid (gate footprint + a small gutter).
const GRID_CELL_X = 100;
const GRID_CELL_Y = 80;
const gridSnapToggle = document.getElementById('gridSnapToggle');

function snapToGrid(value, cellSize) {
  return Math.round(value / cellSize) * cellSize;
}

// Fetch the circuit JSON dynamically
fetch('./exampleCircuit.json')
  .then(response => response.json())
  .then(data => {
    circuit = parseCircuitFile(JSON.stringify(data));
    rebuildSim();
    render();
  })
  .catch(error => console.error('Error loading circuit JSON:', error));

// --- File menu: New / Save / Load ---

document.getElementById('newCircuitBtn')?.addEventListener('click', () => {
  if (!confirm('Start a new circuit? Unsaved changes will be lost.')) return;
  circuit = createEmptyCircuit();
  navStack = [];
  selectedIds.clear();
  rebuildSim();
  render();
  setStatus('New circuit created.');
});

document.getElementById('saveCircuitBtn')?.addEventListener('click', async () => {
  if (!circuit) return;
  const json = serializeCircuit(circuit);

  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: 'circuit.json',
        types: [{ description: 'Circuit JSON', accept: { 'application/json': ['.json'] } }]
      });
      const writable = await handle.createWritable();
      await writable.write(json);
      await writable.close();
      setStatus('Saved.');
      return;
    } catch (error) {
      if (error?.name === 'AbortError') return; // user cancelled the picker
      console.error('Save via file picker failed, falling back to download:', error);
    }
  }

  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'circuit.json';
  link.click();
  URL.revokeObjectURL(url);
  setStatus('Downloaded circuit.json.');
});

const loadCircuitInput = document.getElementById('loadCircuitInput');
document.getElementById('loadCircuitBtn')?.addEventListener('click', () => {
  loadCircuitInput?.click();
});
loadCircuitInput?.addEventListener('change', async () => {
  const file = loadCircuitInput.files?.[0];
  loadCircuitInput.value = '';
  if (!file) return;

  try {
    const text = await file.text();
    circuit = parseCircuitFile(text);
    navStack = [];
    selectedIds.clear();
    clearWireSelection();
    rebuildSim();
    render();
    setStatus(`Loaded ${file.name}.`);
  } catch (error) {
    setStatus(`Load failed: ${error.message}`, true);
  }
});

// --- Component menu: Make Component / Ungroup ---

document.getElementById('makeComponentBtn')?.addEventListener('click', () => {
  if (selectedIds.size === 0) {
    setComponentStatus('Select one or more components first (shift-click to multi-select).', true);
    return;
  }
  const name = prompt('Name for the new component:');
  if (!name || !name.trim()) return;

  try {
    makeComponent(activeView(), [...selectedIds], name.trim());
    selectedIds.clear();
    rebuildSim({ carry: true });
    render();
    setComponentStatus(`Created component "${name.trim()}".`);
  } catch (error) {
    setComponentStatus(error.message, true);
  }
});

document.getElementById('ungroupComponentBtn')?.addEventListener('click', () => {
  if (selectedIds.size !== 1) {
    setComponentStatus('Select exactly one component instance to ungroup.', true);
    return;
  }
  const [id] = selectedIds;
  try {
    ungroupComponent(activeView(), id);
    selectedIds.clear();
    rebuildSim({ carry: true });
    render();
    setComponentStatus('Ungrouped.');
  } catch (error) {
    setComponentStatus(error.message, true);
  }
});

// Double-click a component box to zoom into its definition; double-click empty board to zoom out.
board.addEventListener('dblclick', (event) => {
  const box = event.target.closest('.ic-box');
  if (box) {
    navStack.push(box.dataset.type);
    selectedIds.clear();
    rebuildSim();
    render();
  }
});

// --- BOM: which real 7400-series ICs would be needed to build this circuit ---

document.getElementById('generateBomBtn')?.addEventListener('click', () => {
  const bomResults = document.getElementById('bomResults');
  if (!circuit || !bomResults) return;

  const { rows, unsupported, totalGates } = generateBOM(circuit);

  if (rows.length === 0 && unsupported.length === 0) {
    bomResults.textContent = 'No ICs needed for this circuit.';
    return;
  }

  const table = document.createElement('table');
  table.innerHTML = `
    <thead>
      <tr><th>Part</th><th>Gate type</th><th>Inputs</th><th>Gates used</th><th>Gates/pkg</th><th>Packages</th></tr>
    </thead>
  `;
  const tbody = document.createElement('tbody');
  rows.forEach(row => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${row.part}</td><td>${row.type}</td><td>${row.inputs}</td><td>${row.count}</td><td>${row.gatesPerPackage}</td><td>${row.packages}</td>`;
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  bomResults.innerHTML = '';
  bomResults.appendChild(table);

  const totalPackages = rows.reduce((sum, row) => sum + row.packages, 0);
  const summary = document.createElement('p');
  summary.textContent = `${totalGates} primitive gates, ${totalPackages} package(s) total.`;
  bomResults.appendChild(summary);

  if (unsupported.length > 0) {
    const warning = document.createElement('p');
    warning.style.color = 'crimson';
    warning.textContent = `No catalog entry for: ${unsupported.map(u => `${u.type} (${u.inputs}-input) x${u.count}`).join(', ')}.`;
    bomResults.appendChild(warning);
  }
});

// Drag state
let draggedElement = null;
let offsetX = 0;
let offsetY = 0;
let pendingWire = null;
let selectedWireIndex = null;
let selectionRectStart = null;
let selectionRectEl = null;

function clearWireSelection() {
  selectedWireIndex = null;
  board.querySelectorAll('.wire-selected').forEach(line => {
    line.classList.remove('wire-selected');
  });
}

// Enable dragging for gates
board.addEventListener('mousedown', (event) => {
  const wire = event.target.closest('.wire');
  if (wire) {
    clearWireSelection();
    selectedWireIndex = Number(wire.dataset.wireIndex);
    wire.classList.add('wire-selected');
    event.preventDefault();
    return;
  }

  const pin = event.target.closest('[data-pin]');
  if (pin) {
    if (pin.dataset.direction !== 'output') return;

    const point = screenToSvg(event);
    pendingWire = {
      from: {
        component: pin.dataset.component,
        pin: pin.dataset.pin
      },
      startX: point.x,
      startY: point.y,
      endX: point.x,
      endY: point.y,
      targetPin: null
    };
    drawPendingWire();
    event.preventDefault();
    return;
  }

  const target = event.target.closest('[data-type]');
  if (!target) {
    // Clicked empty board: start a rubber-band selection rectangle.
    const point = screenToSvg(event);
    if (!event.shiftKey) selectedIds.clear();
    selectionRectStart = point;
    applySelectionHighlight();
    event.preventDefault();
    return;
  }

  const componentId = target.getAttribute('id');
  const component = activeView()?.components.find(c => c.id === componentId);

  if (event.shiftKey) {
    if (selectedIds.has(componentId)) selectedIds.delete(componentId);
    else selectedIds.add(componentId);
    applySelectionHighlight();
    event.preventDefault();
    return;
  }

  if (component?.type === 'switch') {
    toggleSwitch(component);
    return;
  }

  if (!selectedIds.has(componentId)) {
    selectedIds.clear();
    selectedIds.add(componentId);
    applySelectionHighlight();
  }

  draggedElement = target;
  const point = screenToSvg(event);
  offsetX = point.x - parseFloat(target.getAttribute('x'));
  offsetY = point.y - parseFloat(target.getAttribute('y'));
});

function screenToSvg(event) {
  const point = board.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  return point.matrixTransform(board.getScreenCTM().inverse());
}

function findPinTarget(event) {
  const element = document.elementFromPoint(event.clientX, event.clientY);
  return element?.closest?.('[data-pin]') || null;
}

document.addEventListener('mousemove', (event) => {
  if (pendingWire) {
    const point = screenToSvg(event);
    pendingWire.endX = point.x;
    pendingWire.endY = point.y;
    pendingWire.targetPin = findPinTarget(event);
    drawPendingWire();
    return;
  }

  if (selectionRectStart) {
    const point = screenToSvg(event);
    if (!selectionRectEl) {
      selectionRectEl = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      selectionRectEl.setAttribute('class', 'select-rect');
      board.appendChild(selectionRectEl);
    }
    const x = Math.min(selectionRectStart.x, point.x);
    const y = Math.min(selectionRectStart.y, point.y);
    const width = Math.abs(point.x - selectionRectStart.x);
    const height = Math.abs(point.y - selectionRectStart.y);
    selectionRectEl.setAttribute('x', x);
    selectionRectEl.setAttribute('y', y);
    selectionRectEl.setAttribute('width', width);
    selectionRectEl.setAttribute('height', height);
    return;
  }

  if (!draggedElement) return;

  const point = screenToSvg(event);
  const newX = point.x - offsetX;
  const newY = point.y - offsetY;

  draggedElement.setAttribute('x', newX);
  draggedElement.setAttribute('y', newY);
});

document.addEventListener('mouseup', (event) => {
  if (pendingWire) {
    const target = pendingWire.targetPin || findPinTarget(event);
    if (
      target &&
      target.dataset.direction === 'input' &&
      target.dataset.component !== pendingWire.from.component
    ) {
      const wires = activeView().wires;
      const alreadyConnected = wires.some(wire =>
        wire.to.component === target.dataset.component && wire.to.pin === target.dataset.pin
      );
      if (!alreadyConnected) {
        wires.push({
          from: pendingWire.from,
          to: {
            component: target.dataset.component,
            pin: target.dataset.pin
          }
        });
      }
    }

    pendingWire = null;
    clearWireSelection();
    rebuildSim({ carry: true });
    render();
    return;
  }

  if (selectionRectStart) {
    const rect = selectionRectEl?.getBBox();
    if (rect && (rect.width > 2 || rect.height > 2)) {
      activeView().components.forEach(component => {
        const { width, height } = getComponentSize(activeView(), component.type);
        const intersects = component.x < rect.x + rect.width && component.x + width > rect.x &&
          component.y < rect.y + rect.height && component.y + height > rect.y;
        if (intersects) selectedIds.add(component.id);
      });
    }
    selectionRectEl?.remove();
    selectionRectEl = null;
    selectionRectStart = null;
    applySelectionHighlight();
    return;
  }

  if (!draggedElement) return;

  // Update circuit model
  const id = draggedElement.getAttribute('id');
  const component = activeView().components.find(c => c.id === id);
  let moved = false;
  if (component) {
    let newX = parseFloat(draggedElement.getAttribute('x'));
    let newY = parseFloat(draggedElement.getAttribute('y'));
    if (gridSnapToggle?.checked) {
      newX = snapToGrid(newX, GRID_CELL_X);
      newY = snapToGrid(newY, GRID_CELL_Y);
    }
    moved = newX !== component.x || newY !== component.y;
    component.x = newX;
    component.y = newY;
  }

  draggedElement = null;
  clearWireSelection();
  // Only re-render if something actually moved: a plain click just selecting a
  // component shouldn't tear down and rebuild the whole board (it also preserves the
  // clicked DOM node so native dblclick detection keeps working).
  if (moved) render();
});

document.addEventListener('keydown', (event) => {
  if (selectedWireIndex === null) return;
  if (event.key !== 'Delete' && event.key !== 'Backspace') return;

  activeView().wires.splice(selectedWireIndex, 1);
  clearWireSelection();
  rebuildSim({ carry: true });
  render();
  event.preventDefault();
});

function drawPendingWire() {
  let preview = board.querySelector('.wire-preview');
  if (!preview) {
    preview = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    preview.setAttribute('class', 'wire-preview');
    board.appendChild(preview);
  }

  const horizontalDistance = Math.max(20, Math.abs(pendingWire.endX - pendingWire.startX) * 0.35);
  const direction = pendingWire.endX >= pendingWire.startX ? 1 : -1;
  preview.setAttribute(
    'd',
    `M ${pendingWire.startX} ${pendingWire.startY} C ${pendingWire.startX + direction * horizontalDistance} ${pendingWire.startY}, ${pendingWire.endX - direction * horizontalDistance} ${pendingWire.endY}, ${pendingWire.endX} ${pendingWire.endY}`
  );
}

// Palette for adding new gates
const palette = document.getElementById('palette');
palette.addEventListener('click', (event) => {
  const gateType = event.target.dataset.gateType;
  if (!gateType) return;

  const view = activeView();
  // Add new gate to circuit model
  const newGate = {
    id: `g${view.components.length + 1}`,
    type: gateType,
    x: 100,
    y: 100
  };
  view.components.push(newGate);

  rebuildSim({ carry: true });
  render();
});

// Runs the clock. A frame only touches logic levels, never the elements themselves.
createDriver({ getSim: () => sim, onChange: refresh, onReport: reportSim }).start();
