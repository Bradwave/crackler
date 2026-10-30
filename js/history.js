// Crackler: Pure undo/redo over snapshots (strings). Rapid changes with the same key coalesce.

function createHistory(limit = 100, window = 800) {
  let states = [],
    idx = -1,
    lastKey = null,
    lastT = 0;
  return {
    reset(s) {
      states = [s];
      idx = 0;
      lastKey = null;
    },
    // Records a new snapshot; returns false if nothing changed.
    push(s, key = null, now = Date.now()) {
      if (idx < 0) return this.reset(s), true;
      if (states[idx] === s) return false;
      states.length = idx + 1;
      if (key && key === lastKey && now - lastT < window && idx > 0) states[idx] = s;
      else {
        states.push(s);
        if (states.length > limit) states.shift();
        idx = states.length - 1;
      }
      lastKey = key;
      lastT = now;
      return true;
    },
    undo() {
      if (idx <= 0) return null;
      lastKey = null;
      return states[--idx];
    },
    redo() {
      if (idx < 0 || idx >= states.length - 1) return null;
      lastKey = null;
      return states[++idx];
    },
    get canUndo() {
      return idx > 0;
    },
    get canRedo() {
      return idx >= 0 && idx < states.length - 1;
    },
  };
}

export { createHistory };
