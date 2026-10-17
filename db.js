/*!
 * FrameLocal - storage layer
 * 100% client side. IndexedDB first, then localStorage, then in-memory as a last resort.
 *
 * Stores
 *   posts   post metadata + a small square thumbnail (cheap to list)
 *   photos  the full-size photo as a base64 data URL, keyed by post id (loaded on demand)
 *   meta    key/value: profile, flags
 *
 * Made by Ashraf
 */
(() => {
  'use strict';
  const FL = (window.FL = window.FL || {});

  const DB_NAME = 'framelocal';
  const DB_VERSION = 1;

  /* ---------------------------------------------------------------- IndexedDB */
  function createIDBBackend() {
    let opening;

    const open = () =>
      opening ||
      (opening = new Promise((resolve, reject) => {
        if (!window.indexedDB) return reject(new Error('IndexedDB unavailable'));
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('posts')) {
            db.createObjectStore('posts', { keyPath: 'id' }).createIndex('createdAt', 'createdAt');
          }
          if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos');
          if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
        };
        req.onsuccess = () => {
          const db = req.result;
          db.onversionchange = () => db.close();
          resolve(db);
        };
        req.onerror = () => reject(req.error);
        req.onblocked = () => reject(new Error('IndexedDB blocked'));
      }));

    // Runs `work` in one transaction. `work(...stores)` may return a thunk that is read once the tx commits.
    const run = async (names, mode, work) => {
      const db = await open();
      return new Promise((resolve, reject) => {
        let thunk;
        const tx = db.transaction(names, mode);
        tx.oncomplete = () => resolve(typeof thunk === 'function' ? thunk() : undefined);
        tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
        tx.onerror = () => reject(tx.error || new Error('Transaction failed'));
        try {
          thunk = work(...names.map((n) => tx.objectStore(n)));
        } catch (err) {
          try { tx.abort(); } catch (_) { /* already finished */ }
          reject(err);
        }
      });
    };

    return {
      kind: 'indexeddb',
      init: open,
      listPosts: () => run(['posts'], 'readonly', (p) => { const r = p.getAll(); return () => r.result; }),
      getPhoto: (id) => run(['photos'], 'readonly', (ph) => { const r = ph.get(id); return () => r.result || null; }),
      getPhotos: (ids) => run(['photos'], 'readonly', (ph) => { const rs = ids.map((id) => ph.get(id)); return () => rs.map((r) => r.result || null); }),
      putPost: (post, photo) => run(['posts', 'photos'], 'readwrite', (p, ph) => { p.put(post); if (photo != null) ph.put(photo, post.id); }),
      putMany: (items) => run(['posts', 'photos'], 'readwrite', (p, ph) => { for (const { post, photo } of items) { p.put(post); if (photo != null) ph.put(photo, post.id); } }),
      deletePost: (id) => run(['posts', 'photos'], 'readwrite', (p, ph) => { p.delete(id); ph.delete(id); }),
      getMeta: (k) => run(['meta'], 'readonly', (m) => { const r = m.get(k); return () => (r.result === undefined ? null : r.result); }),
      setMeta: (k, v) => run(['meta'], 'readwrite', (m) => { m.put(v, k); }),
      clear: () => run(['posts', 'photos', 'meta'], 'readwrite', (p, ph, m) => { p.clear(); ph.clear(); m.clear(); }),
    };
  }

  /* ------------------------------------------- key/value backends (fallbacks) */
  function createKVBackend(kind, kv) {
    const P = 'fl:post:';
    const H = 'fl:photo:';
    const M = 'fl:meta:';
    const parse = (s) => { try { return JSON.parse(s); } catch (_) { return null; } };
    const self = {
      kind,
      init: async () => {},
      listPosts: async () => kv.keys(P).map((k) => parse(kv.get(k))).filter(Boolean),
      getPhoto: async (id) => kv.get(H + id) || null,
      getPhotos: async (ids) => ids.map((id) => kv.get(H + id) || null),
      putPost: async (post, photo) => {
        const had = kv.get(P + post.id);
        kv.set(P + post.id, JSON.stringify(post));
        if (photo != null) {
          try {
            kv.set(H + post.id, photo);
          } catch (err) {
            if (had == null) kv.remove(P + post.id);
            throw err;
          }
        }
      },
      putMany: async (items) => {
        for (const { post, photo } of items) await self.putPost(post, photo);
      },
      deletePost: async (id) => { kv.remove(P + id); kv.remove(H + id); },
      getMeta: async (k) => { const v = kv.get(M + k); return v == null ? null : parse(v); },
      setMeta: async (k, v) => { kv.set(M + k, JSON.stringify(v)); },
      clear: async () => { [P, H, M].forEach((pre) => kv.keys(pre).forEach((k) => kv.remove(k))); },
    };
    return self;
  }

  const localStorageKV = () => {
    const ls = window.localStorage;
    ls.setItem('fl:probe', '1');
    ls.removeItem('fl:probe');
    return {
      get: (k) => ls.getItem(k),
      set: (k, v) => ls.setItem(k, v),
      remove: (k) => ls.removeItem(k),
      keys: (prefix) => { const out = []; for (let i = 0; i < ls.length; i++) { const k = ls.key(i); if (k && k.startsWith(prefix)) out.push(k); } return out; },
    };
  };

  const memoryKV = () => {
    const m = new Map();
    return {
      get: (k) => (m.has(k) ? m.get(k) : null),
      set: (k, v) => { m.set(k, v); },
      remove: (k) => { m.delete(k); },
      keys: (prefix) => [...m.keys()].filter((k) => k.startsWith(prefix)),
    };
  };

  /* ------------------------------------------------------------------ facade */
  let backend = null;
  const cache = new Map(); // small LRU of recently shown photos
  const CACHE_MAX = 24;

  const remember = (id, src) => {
    cache.delete(id);
    cache.set(id, src);
    while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  };

  // Map low-level failures to something the UI can explain.
  const guard = async (fn) => {
    try {
      return await fn();
    } catch (err) {
      const name = (err && err.name) || '';
      const e = new Error(name === 'QuotaExceededError' ? 'storage-full' : (err && err.message) || 'storage-error');
      e.code = name === 'QuotaExceededError' ? 'storage-full' : 'storage-error';
      e.cause = err;
      throw e;
    }
  };

  FL.db = {
    /** Picks the best available backend. Never rejects. Resolves to the backend kind. */
    async init() {
      const attempts = [
        () => { const b = createIDBBackend(); return b.init().then(() => b); },
        () => Promise.resolve(createKVBackend('localstorage', localStorageKV())),
        () => Promise.resolve(createKVBackend('memory', memoryKV())),
      ];
      for (const make of attempts) {
        try { backend = await make(); break; } catch (err) { console.warn('[FrameLocal] storage backend failed', err); }
      }
      // Ask the browser not to evict our data under storage pressure (no-op in most WebViews).
      try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (_) { /* optional */ }
      return backend.kind;
    },

    get kind() { return backend ? backend.kind : 'none'; },

    async listPosts() {
      const rows = await guard(() => backend.listPosts());
      return rows.sort((a, b) => b.createdAt - a.createdAt);
    },

    async getPhoto(id) {
      if (cache.has(id)) { const v = cache.get(id); remember(id, v); return v; }
      const src = await guard(() => backend.getPhoto(id));
      if (src) remember(id, src);
      return src;
    },

    getPhotos: (ids) => guard(() => backend.getPhotos(ids)),

    /** Saves post metadata, and the full photo when given. */
    async putPost(post, photo) {
      await guard(() => backend.putPost(post, photo));
      if (photo != null) remember(post.id, photo);
    },

    async putMany(items) {
      await guard(() => backend.putMany(items));
      items.forEach(({ post, photo }) => photo != null && remember(post.id, photo));
    },

    async deletePost(id) {
      await guard(() => backend.deletePost(id));
      cache.delete(id);
    },

    getMeta: (k) => guard(() => backend.getMeta(k)),
    setMeta: (k, v) => guard(() => backend.setMeta(k, v)),

    async clear() {
      await guard(() => backend.clear());
      cache.clear();
    },

    /** { used, quota } in bytes when the platform can tell us, otherwise null. */
    async usage() {
      try {
        const e = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null;
        return e ? { used: e.usage || 0, quota: e.quota || 0 } : null;
      } catch (_) {
        return null;
      }
    },
  };
})();
