// Board Editor
// Adds drag-and-drop functionality and a palette for placing gates

import renderCircuit, { updateCircuit } from './renderer.js';
import { createEmptyCircuit, parseCircuitFile, serializeCircuit } from './circuitModel.js';
import { flattenCircuit, makeComponent, ungroupComponent, getComponentSize } from './subcircuits.js';
import { generateBOM } from './bomGenerator.js';
import { createSimulator } from './sim/core.js';
import { createDriver } from './simDriver.js';
import { addBlankUnit, copyGates, copyAll, resizeBoard } from './units.js';
import {
  nextClockRate, nextComponentId, deleteComponents, moveComponents,
  carryControlSettings, createHistory, breadcrumbPath, findFreeSpot
} from './editing.js';

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

// --- Undo ---
// A snapshot is the whole circuit plus where the user is zoomed into. Switch positions and
// clock rates are not edits: an undo keeps them where the user last set them.
const history = createHistory();
const undoBtn = document.getElementById('undoBtn');
const redoBtn = document.getElementById('redoBtn');

const snapshot = () => ({ circuit: structuredClone(circuit), navStack: [...navStack] });

function updateHistoryButtons() {
  if (undoBtn) undoBtn.disabled = !history.canUndo;
  if (redoBtn) redoBtn.disabled = !history.canRedo;
}

// Runs a change to the circuit and, if it did not throw, makes it undoable.
function edit(change) {
  const before = snapshot();
  const result = change();
  history.record(before);
  updateHistoryButtons();
  return result;
}

function restore(snap) {
  carryControlSettings(circuit, snap.circuit);
  const sameView = snap.navStack.join('/') === navStack.join('/');
  circuit = snap.circuit;
  navStack = snap.navStack;
  selectedIds.clear();
  clearWireSelection();
  rebuildSim({ carry: sameView });
  render();
  updateHistoryButtons();
}

function undo() {
  const snap = history.undo(snapshot());
  if (!snap) return setStatus('Nothing to undo.');
  restore(snap);
  setStatus('Undone.');
}

function redo() {
  const snap = history.redo(snapshot());
  if (!snap) return setStatus('Nothing to redo.');
  restore(snap);
  setStatus('Redone.');
}

undoBtn?.addEventListener('click', undo);
redoBtn?.addEventListener('click', redo);

function updateBreadcrumb() {
  if (!breadcrumbEl) return;
  breadcrumbEl.innerHTML = '';
  const path = breadcrumbPath(navStack);
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


// The board is as big as the circuit says, drawn at BOARD_SCALE screen pixels per board unit.
// A bigger board does not make the parts smaller; the page scrolls, and the terminal widens
// with it. Pointer positions go through the SVG's own transform (screenToSvg), so the scale
// never reaches the circuit's coordinates.
const BOARD_SCALE = 1.2;
function boardSize() {
  return circuit?.board?.width > 0 && circuit?.board?.height > 0
    ? circuit.board
    : { width: 1200, height: 800 };
}

function applyBoardSize() {
  const { width, height } = boardSize();
  board.setAttribute('viewBox', `0 0 ${width} ${height}`);
  board.style.width = `${width * BOARD_SCALE}px`;
  board.style.height = `${height * BOARD_SCALE}px`;
  // The terminal above takes the board's width so the two line up (styles.css, .vt).
  document.documentElement.style.setProperty('--board-width', `${width * BOARD_SCALE}px`);
}

function render() {
  applyBoardSize();
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

// Reads a circuit file that ships with the page: the H-500 panel or an example.
async function fetchCircuit(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Could not load ${path} (${response.status}).`);
  return parseCircuitFile(await response.text());
}

// Swaps in a whole new circuit after asking. Undo brings the old one back.
function replaceCircuit(next, question, message) {
  if (!confirm(`${question} You can still undo this.`)) return;
  history.record(snapshot());
  circuit = next;
  navStack = [];
  selectedIds.clear();
  rebuildSim();
  render();
  updateHistoryButtons();
  setStatus(message);
}

// Opens on the H-500 panel: the real inventory, laid out like the real machine.
fetchCircuit('./panels/h500.json')
  .then(loaded => {
    circuit = loaded;
    rebuildSim();
    render();
  })
  .catch(error => console.error('Error loading circuit JSON:', error));

// --- Edit menu: grow the machine one panel at a time (units.js) ---

// `grow(circuit, panel)` returns the bigger circuit; `panel` is the H-501 panel, which also
// gives the width of one panel. Each grow can be undone.
async function growBoard(grow, message) {
  if (navStack.length > 0) {
    setStatus('Leave the component first: panels are added to the board itself.', true);
    return;
  }
  try {
    const panel = await fetchCircuit('./panels/h500.json');
    edit(() => { circuit = grow(circuit, panel); });
    selectedIds.clear();
    rebuildSim({ carry: true });
    render();
    setStatus(message);
  } catch (error) {
    setStatus(error.message, true);
  }
}

document.getElementById('addUnitBtn')?.addEventListener('click', () =>
  growBoard(addBlankUnit, 'Added a blank H-501 to the right.'));
document.getElementById('copyGatesBtn')?.addEventListener('click', () =>
  growBoard(copyGates, 'Copied the gates to the right, without wires.'));
document.getElementById('copyAllBtn')?.addEventListener('click', () =>
  growBoard(copyAll, 'Copied the gates and wires to the right, on the one clock.'));

// --- The resize grip: drag the board's bottom-right corner to change its size ---
// resizeBoard (units.js) keeps the board from shrinking past anything on it. Only the board's
// size changes; no part moves. A whole drag is one undo step.

const resizeHandle = document.getElementById('resizeHandle');
let resizeState = null;

resizeHandle?.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  event.preventDefault();
  if (navStack.length > 0) {
    setStatus('Leave the component first: the board is resized from the board itself.', true);
    return;
  }
  resizeHandle.setPointerCapture(event.pointerId);
  resizeState = { x: event.clientX, y: event.clientY, start: { ...boardSize() }, before: snapshot() };
});

resizeHandle?.addEventListener('pointermove', (event) => {
  if (!resizeState) return;
  const { x, y, start } = resizeState;
  const size = resizeBoard(
    circuit,
    start.width + (event.clientX - x) / BOARD_SCALE,
    start.height + (event.clientY - y) / BOARD_SCALE
  );
  const now = boardSize();
  if (size.width === now.width && size.height === now.height) return;
  circuit.board = size;
  applyBoardSize();
  setStatus(`Board ${size.width} × ${size.height}`);
});

function endResize() {
  if (!resizeState) return;
  const { before, start } = resizeState;
  resizeState = null;
  const now = boardSize();
  if (now.width !== start.width || now.height !== start.height) {
    history.record(before);
    updateHistoryButtons();
  }
}
resizeHandle?.addEventListener('pointerup', endResize);
resizeHandle?.addEventListener('pointercancel', endResize);

// --- File menu: New / Save / Load / Examples ---

document.getElementById('newH501Btn')?.addEventListener('click', async () => {
  try {
    replaceCircuit(await fetchCircuit('./panels/h500.json'), 'Start again from a blank H-501?', 'New H-501.');
  } catch (error) {
    setStatus(error.message, true);
  }
});

document.getElementById('newCircuitBtn')?.addEventListener('click', () => {
  replaceCircuit(createEmptyCircuit(), 'Start a new empty board?', 'New empty board.');
});

// One menu item per entry in examples/index.json. A static server cannot list a folder,
// so the index is the list.
const exampleItems = document.getElementById('exampleItems');
fetch('./examples/index.json')
  .then(response => (response.ok ? response.json() : []))
  .then(entries => {
    for (const { file, title } of entries) {
      const item = document.createElement('button');
      item.setAttribute('role', 'menuitem');
      item.textContent = title;
      item.addEventListener('click', async () => {
        try {
          replaceCircuit(await fetchCircuit(`./examples/${file}`), `Open the example "${title}"?`, `Opened ${title}.`);
        } catch (error) {
          setStatus(error.message, true);
        }
      });
      exampleItems?.appendChild(item);
    }
  })
  .catch(error => console.error('Error loading the examples index:', error));

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
    const loaded = parseCircuitFile(text);
    history.record(snapshot());
    circuit = loaded;
    navStack = [];
    selectedIds.clear();
    clearWireSelection();
    rebuildSim();
    render();
    updateHistoryButtons();
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
    edit(() => makeComponent(activeView(), [...selectedIds], name.trim()));
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
    edit(() => ungroupComponent(activeView(), id));
    selectedIds.clear();
    rebuildSim({ carry: true });
    render();
    setComponentStatus('Ungrouped.');
  } catch (error) {
    setComponentStatus(error.message, true);
  }
});

// Double-click a component box to zoom into its definition. The breadcrumb is the way back out.
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

// Interaction state
let moveState = null; // a right-button drag of the selected parts
let heldPulser = null; // id of the pulser being held down
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

function selectOnly(ids) {
  selectedIds.clear();
  ids.forEach(id => selectedIds.add(id));
  applySelectionHighlight();
}

// The clock knob: each click moves it to the next of off, 0.25, 0.5, 1 and 10 Hz.
function turnClock(component) {
  component.hz = nextClockRate(component.hz ?? 1);
  if (sim) reportSim(sim.setClockRate(component.id, component.hz));
  render(); // the rate legend under the knob is drawn by the full render
}

function pressPulser(component) {
  heldPulser = component.id;
  if (sim) reportSim(sim.setInput(component.id, true));
  refresh();
}

function releasePulser() {
  if (heldPulser === null) return;
  const id = heldPulser;
  heldPulser = null;
  if (sim) {
    try {
      reportSim(sim.setInput(id, false));
    } catch {
      // The pulser was deleted or the circuit replaced while it was held.
    }
  }
  refresh();
}

function deleteSelectedComponents() {
  if (selectedIds.size === 0) {
    setComponentStatus('Select one or more components first.', true);
    return;
  }
  const ids = [...selectedIds];
  const removed = edit(() => deleteComponents(circuit, navStack, ids));
  selectedIds.clear();
  rebuildSim({ carry: true });
  render();
  setComponentStatus(`Deleted ${removed} component${removed === 1 ? '' : 's'} and their wires.`);
}

document.getElementById('deleteSelectedBtn')?.addEventListener('click', deleteSelectedComponents);

// Left button: select, or operate a switch, pulser or clock knob. Right button (or
// ctrl-click): move the selected parts. Dragging with the left button never moves anything.
board.addEventListener('contextmenu', event => event.preventDefault());

board.addEventListener('mousedown', (event) => {
  const moveButton = event.button === 2 || (event.button === 0 && event.ctrlKey);
  if (!moveButton && event.button !== 0) return;

  if (moveButton) {
    event.preventDefault();
    const target = event.target.closest('[data-type]');
    const id = target?.getAttribute('id');
    if (!target) return;
    if (!selectedIds.has(id)) {
      setComponentStatus('Click a part to select it, then right-drag to move it.', true);
      return;
    }
    const view = activeView();
    const origins = new Map();
    view.components.forEach(component => {
      if (selectedIds.has(component.id)) origins.set(component.id, { x: component.x, y: component.y });
    });
    moveState = { start: screenToSvg(event), origins, before: snapshot() };
    return;
  }

  const wire = event.target.closest('.wire');
  if (wire) {
    clearWireSelection();
    selectOnly([]);
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
    clearWireSelection();
    if (!event.shiftKey) selectedIds.clear();
    selectionRectStart = point;
    applySelectionHighlight();
    event.preventDefault();
    return;
  }

  const componentId = target.getAttribute('id');
  const component = activeView()?.components.find(c => c.id === componentId);
  event.preventDefault();

  if (event.shiftKey) {
    clearWireSelection();
    if (selectedIds.has(componentId)) selectedIds.delete(componentId);
    else selectedIds.add(componentId);
    applySelectionHighlight();
    return;
  }

  if (component?.type === 'switch') {
    toggleSwitch(component);
    return;
  }
  if (component?.type === 'pulser') {
    pressPulser(component);
    return;
  }
  if (component?.type === 'clock') {
    turnClock(component);
    return;
  }

  clearWireSelection();
  selectOnly([componentId]);
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

  if (moveState) {
    const point = screenToSvg(event);
    const snap = gridSnapToggle?.checked
      ? (x, y) => [snapToGrid(x, GRID_CELL_X), snapToGrid(y, GRID_CELL_Y)]
      : undefined;
    const moved = moveComponents(
      activeView().components, new Set(moveState.origins.keys()), moveState.origins,
      point.x - moveState.start.x, point.y - moveState.start.y, snap
    );
    // Redraw so the wires and pins follow the parts while they move.
    if (moved) render();
  }
});

document.addEventListener('mouseup', (event) => {
  releasePulser();

  if (moveState) {
    const { before, origins } = moveState;
    moveState = null;
    const anyMoved = activeView().components.some(component => {
      const origin = origins.get(component.id);
      return origin && (origin.x !== component.x || origin.y !== component.y);
    });
    if (anyMoved) {
      history.record(before);
      updateHistoryButtons();
    }
    return;
  }

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
        edit(() => wires.push({
          from: pendingWire.from,
          to: {
            component: target.dataset.component,
            pin: target.dataset.pin
          }
        }));
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
  }
});

window.addEventListener('blur', releasePulser);

document.addEventListener('keydown', (event) => {
  if (event.target?.closest?.('input, textarea, select, [contenteditable]')) return;

  const modifier = event.metaKey || event.ctrlKey;
  const key = event.key.toLowerCase();
  if (modifier && key === 'z') {
    event.preventDefault();
    if (event.shiftKey) redo();
    else undo();
    return;
  }
  if (modifier && key === 'y') {
    event.preventDefault();
    redo();
    return;
  }

  if (event.key !== 'Delete' && event.key !== 'Backspace') return;

  if (selectedWireIndex !== null) {
    const index = selectedWireIndex;
    edit(() => activeView().wires.splice(index, 1));
    clearWireSelection();
    rebuildSim({ carry: true });
    render();
    event.preventDefault();
  } else if (selectedIds.size > 0) {
    deleteSelectedComponents();
    event.preventDefault();
  }
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

// Palette for adding new parts. The new part is selected, so it can be right-dragged
// straight away.
const palette = document.getElementById('palette');
palette.addEventListener('click', (event) => {
  const gateType = event.target.dataset.gateType;
  if (!gateType) return;

  // The new part lands in the first free space along the top of the board (findFreeSpot).
  const view = activeView();
  const sizeOf = type => getComponentSize(circuit, type) ?? { width: 0, height: 0 };
  const boxes = view.components.map(c => ({ x: c.x, y: c.y, ...sizeOf(c.type) }));
  const spot = findFreeSpot(boxes, sizeOf(gateType), boardSize());
  const newGate = {
    id: nextComponentId(view.components),
    type: gateType,
    x: spot.x,
    y: spot.y
  };
  if (gateType === 'clock') newGate.hz = 1;
  if (gateType === 'switch') newGate.state = 0;
  edit(() => view.components.push(newGate));

  rebuildSim({ carry: true });
  render();
  selectOnly([newGate.id]);
});

// Runs the clock. A frame only touches logic levels, never the elements themselves.
createDriver({ getSim: () => sim, onChange: refresh, onReport: reportSim }).start();
