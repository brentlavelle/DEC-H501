// Board Editor
// Adds drag-and-drop functionality and a palette for placing gates

import renderCircuit from './renderer.js';
import { createEmptyCircuit, parseCircuitFile, serializeCircuit } from './circuitModel.js';

const board = document.getElementById('board');
const fileStatus = document.getElementById('fileStatus');
let circuit = null; // Circuit will be loaded dynamically

function setStatus(message, isError = false) {
  if (!fileStatus) return;
  fileStatus.textContent = message;
  fileStatus.style.color = isError ? 'crimson' : 'inherit';
}

// Fetch the circuit JSON dynamically
fetch('./exampleCircuit.json')
  .then(response => response.json())
  .then(data => {
    circuit = parseCircuitFile(JSON.stringify(data));
    renderCircuit(circuit, board);
  })
  .catch(error => console.error('Error loading circuit JSON:', error));

// --- File menu: New / Save / Load ---

document.getElementById('newCircuitBtn')?.addEventListener('click', () => {
  if (!confirm('Start a new circuit? Unsaved changes will be lost.')) return;
  circuit = createEmptyCircuit();
  renderCircuit(circuit, board);
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
    clearWireSelection();
    renderCircuit(circuit, board);
    setStatus(`Loaded ${file.name}.`);
  } catch (error) {
    setStatus(`Load failed: ${error.message}`, true);
  }
});

// Drag state
let draggedElement = null;
let offsetX = 0;
let offsetY = 0;
let pendingWire = null;
let selectedWireIndex = null;

function clearWireSelection() {
  selectedWireIndex = null;
  board.querySelectorAll('.wire-selected').forEach(line => {
    line.classList.remove('wire-selected');
  });
}

// Enable dragging for gates
board.addEventListener('mousedown', (event) => {
  const switchHitArea = event.target.closest('[data-switch-hit]');
  if (switchHitArea) {
    const component = circuit?.components.find(c => c.id === switchHitArea.dataset.component);
    if (component) {
      component.state = component.state ? 0 : 1;
      renderCircuit(circuit, board);
    }
    event.preventDefault();
    return;
  }

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

  const target = event.target.closest('use');
  if (!target) return;

  const component = circuit?.components.find(c => c.id === target.getAttribute('id'));
  if (component?.type === 'switch') {
    component.state = component.state ? 0 : 1;
    renderCircuit(circuit, board);
    return;
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
      const alreadyConnected = circuit.wires.some(wire =>
        wire.to.component === target.dataset.component && wire.to.pin === target.dataset.pin
      );
      if (!alreadyConnected) {
        circuit.wires.push({
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
    renderCircuit(circuit, board);
    return;
  }

  if (!draggedElement) return;

  // Update circuit model
  const id = draggedElement.getAttribute('id');
  const component = circuit.components.find(c => c.id === id);
  if (component) {
    component.x = parseFloat(draggedElement.getAttribute('x'));
    component.y = parseFloat(draggedElement.getAttribute('y'));
  }

  draggedElement = null;
  clearWireSelection();
  renderCircuit(circuit, board); // Re-render to ensure wires update
});

document.addEventListener('keydown', (event) => {
  if (selectedWireIndex === null) return;
  if (event.key !== 'Delete' && event.key !== 'Backspace') return;

  circuit.wires.splice(selectedWireIndex, 1);
  clearWireSelection();
  renderCircuit(circuit, board);
  event.preventDefault();
});

function drawPendingWire() {
  let preview = board.querySelector('.wire-preview');
  if (!preview) {
    preview = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    preview.setAttribute('class', 'wire-preview');
    board.appendChild(preview);
  }

  const horizontalDistance = Math.max(40, Math.abs(pendingWire.endX - pendingWire.startX) * 0.35);
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

  // Add new gate to circuit model
  const newGate = {
    id: `g${circuit.components.length + 1}`,
    type: gateType,
    x: 100,
    y: 100
  };
  circuit.components.push(newGate);

  renderCircuit(circuit, board);
});