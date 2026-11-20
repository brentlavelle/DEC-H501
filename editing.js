// Editing helpers: no DOM, no timers. boardEditor.js calls these; tests call them directly.
//
// - nextComponentId: ids that cannot collide, even after deletes.
// - deleteComponents: removes parts and every wire (and subcircuit pin) that touched them.
// - createHistory: undo and redo over whole-circuit snapshots.
// - carryControlSettings: keeps switch positions and clock rates across an undo.
// - CLOCK_RATES, nextClockRate: the clock's selector positions, 0 being off.
// - breadcrumbPath: the way back out of a subcircuit, shown only while inside one.
// - findFreeSpot, PLACEMENT: where a part added from the Add menu lands.
// - moveComponents: shifts a set of parts together.

export const CLOCK_RATES = [0, 0.25, 0.5, 1, 10];

// The position after `hz`. A rate that is not on the selector goes to the first position
// above it, so a hand-edited 3 Hz moves on to 10 Hz rather than snapping back to off.
export function nextClockRate(hz) {
  const next = CLOCK_RATES.find(rate => rate > hz);
  return next ?? CLOCK_RATES[0];
}

// An id of the form g<N> that no part in `components` uses. N is one more than the largest
// g<N> present, so an id freed by a delete is not handed out again straight away.
export function nextComponentId(components) {
  const taken = new Set(components.map(component => component.id));
  let highest = 0;
  for (const id of taken) {
    const match = /^g(\d+)$/.exec(id);
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  let n = highest + 1;
  while (taken.has(`g${n}`)) n++;
  return `g${n}`;
}

// Removes the parts `ids` from the circuit level named by `navStack` ([] is the root,
// otherwise the last name is the subcircuit definition being edited), together with every
// wire that touches them. Inside a definition, a part that carried one of the definition's
// external pins takes that pin with it, and so does every wire, at any level, that ended
// on the pin; that can in turn remove a pin of a definition holding an instance of this
// one, so it repeats until nothing changes. Returns the number of parts removed.
export function deleteComponents(circuit, navStack, ids) {
  const doomed = new Set(ids);
  const def = navStack.length ? circuit.subcircuits[navStack[navStack.length - 1]] : null;
  const level = def ?? circuit;

  const before = level.components.length;
  level.components = level.components.filter(component => !doomed.has(component.id));
  const removed = before - level.components.length;
  level.wires = level.wires.filter(
    wire => !doomed.has(wire.from.component) && !doomed.has(wire.to.component)
  );

  if (def) {
    const gone = pin => doomed.has(pin.internal.component);
    const lost = { [navStack[navStack.length - 1]]: new Set(def.pins.filter(gone).map(pin => pin.name)) };
    def.pins = def.pins.filter(pin => !gone(pin));
    dropWiresOnLostPins(circuit, lost);
  }
  return removed;
}

function dropWiresOnLostPins(circuit, lost) {
  const levels = [circuit, ...Object.values(circuit.subcircuits || {})];
  const isGone = (level, end) => {
    const part = level.components.find(component => component.id === end.component);
    return Boolean(part && lost[part.type]?.has(end.pin));
  };
  for (let changed = true; changed; ) {
    changed = false;
    for (const level of levels) {
      const kept = level.wires.filter(wire => !isGone(level, wire.from) && !isGone(level, wire.to));
      if (kept.length !== level.wires.length) {
        level.wires = kept;
      }
    }
    for (const [name, def] of Object.entries(circuit.subcircuits || {})) {
      const dropped = def.pins.filter(pin => isGone(def, pin.internal));
      if (dropped.length) {
        lost[name] = lost[name] || new Set();
        dropped.forEach(pin => lost[name].add(pin.name));
        def.pins = def.pins.filter(pin => !dropped.includes(pin));
        changed = true;
      }
    }
  }
}

// Shifts the parts `ids` by (dx, dy) from the positions in `origins` (id -> {x, y}), so a
// drag is always measured from where it began and never accumulates rounding. `snap` maps a
// coordinate pair to a snapped pair, or is omitted for free placement. Returns true if any
// part ended up somewhere new.
export function moveComponents(components, ids, origins, dx, dy, snap) {
  let moved = false;
  for (const component of components) {
    if (!ids.has(component.id)) continue;
    const origin = origins.get(component.id);
    if (!origin) continue;
    let x = origin.x + dx;
    let y = origin.y + dy;
    if (snap) [x, y] = snap(x, y);
    if (x !== component.x || y !== component.y) moved = true;
    component.x = x;
    component.y = y;
  }
  return moved;
}

// Copies the settings a user operates while the circuit runs, switch positions and clock
// rates, from `from` onto the parts of `to` with the same id and type. An undo then brings
// back the wiring and layout without flipping switches the user has set since.
export function carryControlSettings(from, to) {
  const copy = (source, target) => {
    for (const part of target) {
      const old = source.find(c => c.id === part.id && c.type === part.type);
      if (!old) continue;
      if (part.type === 'switch' && 'state' in old) part.state = old.state;
      if (part.type === 'clock' && 'hz' in old) part.hz = old.hz;
    }
  };
  copy(from.components, to.components);
  for (const [name, def] of Object.entries(to.subcircuits || {})) {
    const old = from.subcircuits?.[name];
    if (old) copy(old.components, def.components);
  }
}

// Undo and redo over snapshots. The caller decides what a snapshot is; this only orders
// them. record(snapshot) is called with the state as it was BEFORE an edit.
// undo(current) takes the state now and returns the one to go back to, or null if there is
// nothing to undo; redo(current) is the same in the other direction.
export function createHistory({ limit = 100 } = {}) {
  let past = [];
  let future = [];
  return {
    record(snapshot) {
      past.push(snapshot);
      if (past.length > limit) past.shift();
      future = [];
    },
    undo(current) {
      if (past.length === 0) return null;
      future.push(current);
      return past.pop();
    },
    redo(current) {
      if (future.length === 0) return null;
      past.push(current);
      return future.pop();
    },
    clear() {
      past = [];
      future = [];
    },
    get canUndo() {
      return past.length > 0;
    },
    get canRedo() {
      return future.length > 0;
    }
  };
}

// The breadcrumb's items for the current view. On the board itself there is nowhere to go
// back to, so it is empty and the editor hides it.
export function breadcrumbPath(navStack) {
  return navStack.length === 0 ? [] : ['Root', ...navStack];
}

// Where a newly added part goes: the first free space along the top of the board, working
// left to right, so parts fill the strip above the panel and a gap left by a part moved away
// is used before anything further right. With no free space it goes to the upper-right
// corner, even on top of something, where the user can see it and drag it.
// `boxes` are the parts already on the board, { x, y, width, height }; `footprint` is
// { width, height } of the new part; `board` is { width, height }. Returns { x, y }.
export const PLACEMENT = { margin: 8, gap: 6 };

export function findFreeSpot(boxes, footprint, board) {
  const { margin, gap } = PLACEMENT;
  const { width, height } = footprint;
  const y = margin;
  const clearAt = x => boxes.every(b =>
    x + width + gap <= b.x || b.x + b.width + gap <= x ||
    y + height + gap <= b.y || b.y + b.height + gap <= y);
  for (let x = margin; x + width <= board.width - margin; x++) {
    if (clearAt(x)) return { x, y };
  }
  return { x: Math.max(margin, board.width - width - margin), y };
}
