// Board Editor
// Adds drag-and-drop functionality and a palette for placing gates

import renderCircuit from './renderer.js';

const board = document.getElementById('board');
let circuit = null; // Circuit will be loaded dynamically

// Fetch the circuit JSON dynamically
fetch('./exampleCircuit.json')
  .then(response => response.json())
  .then(data => {
    circuit = data;
    renderCircuit(circuit, board);
  })
  .catch(error => console.error('Error loading circuit JSON:', error));

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
  const bounds = board.getBoundingClientRect();
  const viewBox = board.viewBox.baseVal;
  return {
    x: viewBox.x + ((event.clientX - bounds.left) / bounds.width) * viewBox.width,
    y: viewBox.y + ((event.clientY - bounds.top) / bounds.height) * viewBox.height
  };
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
  preview.setAttribute(
    'd',
    `M ${pendingWire.startX} ${pendingWire.startY} C ${pendingWire.startX + horizontalDistance} ${pendingWire.startY}, ${pendingWire.endX - horizontalDistance} ${pendingWire.endY}, ${pendingWire.endX} ${pendingWire.endY}`
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