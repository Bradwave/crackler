// Crackler: Pure store of sessions: a video kept in the browser together with the analysis done on it.
// Works over a small async backend { get, put, del, all } of two stores, "meta" (small records) and "video" (blobs),
// so the logic is tested with a map in memory and runs on IndexedDB in the page.

const META = "meta",
  VIDEO = "video";

function memoryBackend() {
  const data = { [META]: new Map(), [VIDEO]: new Map() };
  return {
    get: async (s, k) => data[s].get(k),
    put: async (s, k, v) => void data[s].set(k, v),
    del: async (s, k) => void data[s].delete(k),
    all: async (s) => [...data[s].values()],
  };
}

const newId = () => "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function createSessions(backend) {
  return {
    // meta: { name, videoName, size, duration, extract, project, points }. The video goes first, so a failure leaves nothing behind.
    async create(blob, meta, now = Date.now()) {
      const id = newId();
      await backend.put(VIDEO, id, blob);
      try {
        await backend.put(META, id, { ...meta, id, t: now });
      } catch (e) {
        await backend.del(VIDEO, id);
        throw e;
      }
      return id;
    },
    // Updates the analysis of a session (project text, point count); false if it no longer exists.
    async save(id, patch, now = Date.now()) {
      const m = await backend.get(META, id);
      if (!m) return false;
      await backend.put(META, id, { ...m, ...patch, id, t: now });
      return true;
    },
    async rename(id, name) {
      const m = await backend.get(META, id);
      if (!m) return false;
      await backend.put(META, id, { ...m, name: name.trim().slice(0, 80) || m.videoName });
      return true;
    },
    get: (id) => backend.get(META, id),
    video: (id) => backend.get(VIDEO, id),
    async remove(id) {
      await backend.del(META, id);
      await backend.del(VIDEO, id);
    },
    // Newest first, without the video.
    async list() {
      return (await backend.all(META)).sort((a, b) => b.t - a.t);
    },
  };
}

export { META, VIDEO, createSessions, memoryBackend };
