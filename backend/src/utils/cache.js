/**
 * Simple in-process TTL cache.
 * Survives across requests within the same Node.js process.
 * Resets on Render restart — acceptable for dashboard data.
 */
const store = new Map();

const cache = {
  get(key) {
    const entry = store.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > entry.ttl) {
      store.delete(key);
      return null;
    }
    return entry.data;
  },
  set(key, data, ttlMs = 300000) {
    store.set(key, { data, ts: Date.now(), ttl: ttlMs });
  },
  invalidate(key) {
    store.delete(key);
  },
  invalidateAll() {
    store.clear();
  }
};

module.exports = cache;
