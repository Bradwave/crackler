// Crackler: Pure autosave store over a localStorage-like object: a few most recent projects, newest first.
// Entries are keyed by video identity (name, size, duration, frame count) so work comes back with the same video.

const KEY = "crackler.autosave.v1";

// The video's identity without the frame count, for finding work before frames are loaded.
const videoPrefix = (info) => `${info.name}|${info.size}|${Math.round((info.duration || 0) * 1000)}|`;
const videoId = (info, frames) => videoPrefix(info) + frames;

function createAutosave(storage, { max = 6 } = {}) {
  const read = () => {
    try {
      const v = JSON.parse(storage.getItem(KEY) || "[]");
      return Array.isArray(v) ? v.filter((e) => e && typeof e.id === "string" && typeof e.text === "string") : [];
    } catch {
      return [];
    }
  };
  // On a full store, drop the oldest entries until it fits.
  const write = (list) => {
    for (;;) {
      try {
        storage.setItem(KEY, JSON.stringify(list));
        return true;
      } catch {
        if (list.length <= 1) return false;
        list = list.slice(0, -1);
      }
    }
  };
  return {
    // meta: small facts for the restore prompt, e.g. { points }
    save(id, text, meta = {}, now = Date.now()) {
      const list = read().filter((e) => e.id !== id);
      list.unshift({ id, t: now, meta, text });
      return write(list.slice(0, max));
    },
    find: (id) => read().find((e) => e.id === id) || null,
    findPrefix: (prefix) => read().find((e) => e.id.startsWith(prefix)) || null,
    remove(id) {
      write(read().filter((e) => e.id !== id));
    },
    list: read,
  };
}

export { KEY, createAutosave, videoId, videoPrefix };
