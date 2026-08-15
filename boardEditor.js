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

// Enable dragging for gates
board.addEventListener('mousedown', (event) => {
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

document.addEventListener('mousemove', (event) => {
  if (!draggedElement) return;

  const point = screenToSvg(event);
  const newX = point.x - offsetX;
  const newY = point.y - offsetY;

  draggedElement.setAttribute('x', newX);
  draggedElement.setAttribute('y', newY);
});

document.addEventListener('mouseup', () => {
  if (!draggedElement) return;

  // Update circuit model
  const id = draggedElement.getAttribute('id');
  const component = circuit.components.find(c => c.id === id);
  if (component) {
    component.x = parseFloat(draggedElement.getAttribute('x'));
    component.y = parseFloat(draggedElement.getAttribute('y'));
  }

  draggedElement = null;
  renderCircuit(circuit, board); // Re-render to ensure wires update
});

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