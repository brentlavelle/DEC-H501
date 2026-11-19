// Simulation driver
// Moves the simulator's virtual time forward once per animation frame. This is the only
// place wall-clock time enters; sim/ itself never looks at a clock.

// A tab that was in the background comes back with one very long frame. Clamping it
// means the circuit pauses while hidden, rather than replaying minutes of clock pulses.
export const MAX_FRAME_MS = 100;

// getSim()      -> the current simulator, or null when there is none
// onChange(r)   -> called when a frame applied one or more clock edges; redraw state in place
// onReport(r)   -> called every frame with the advance() result (settled, behind, ...)
// requestFrame, cancelFrame -> default to the browser's animation frame functions
export function createDriver({
  getSim,
  onChange,
  onReport,
  requestFrame = callback => globalThis.requestAnimationFrame(callback),
  cancelFrame = handle => globalThis.cancelAnimationFrame(handle)
}) {
  let running = false;
  let handle = null;
  let lastTimestamp = null;

  function frame(timestamp) {
    if (!running) return;
    const elapsed = lastTimestamp === null ? 0 : Math.min(Math.max(timestamp - lastTimestamp, 0), MAX_FRAME_MS);
    lastTimestamp = timestamp;

    const sim = getSim();
    if (sim) {
      const result = sim.advance(elapsed);
      if (result.edges > 0) onChange?.(result);
      onReport?.(result);
    }
    handle = requestFrame(frame);
  }

  return {
    start() {
      if (running) return;
      running = true;
      lastTimestamp = null;
      handle = requestFrame(frame);
    },
    stop() {
      running = false;
      if (handle !== null) cancelFrame(handle);
      handle = null;
    },
    get running() {
      return running;
    }
  };
}
