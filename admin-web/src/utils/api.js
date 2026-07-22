import useAuthStore from '../store/authStore';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || 'http://localhost:3000';

// Stale-while-revalidate in-memory cache for GET requests
// Shows cached data instantly, silently re-fetches in background
const cache = new Map(); // key -> { data, ts }
const CACHE_TTL = 8_000; // 8 seconds

const isFresh = (ts) => Date.now() - ts < CACHE_TTL;

const invalidatePrefix = (prefix) => {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
};

const apiRequest = async (endpoint, options = {}) => {
  const token = useAuthStore.getState().token;

  const headers = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  };

  // If payload is FormData (like Excel upload), remove standard Content-Type to let browser boundary resolve it
  if (options.body instanceof FormData) {
    delete headers['Content-Type'];
  }

  // Stale-while-revalidate: only for GET requests without body
  const isGet = !options.method || options.method === 'GET';
  if (isGet) {
    // Build cache key including any query params
    const paramStr = options.params
      ? '?' + new URLSearchParams(options.params).toString()
      : '';
    const cacheKey = endpoint + paramStr;
    const hit = cache.get(cacheKey);

    const doFetch = async () => {
      // Inline params into URL for GET requests
      const url = `${API_BASE_URL}${endpoint}${paramStr}`;
      const response = await fetch(url, { ...options, headers, params: undefined });
      const text = await response.text();
      let data;
      try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text }; }
      if (!response.ok) {
        if (response.status === 401) useAuthStore.getState().logout();
        throw new Error(data.error || data.message || 'Something went wrong');
      }
      cache.set(cacheKey, { data, ts: Date.now() });
      return data;
    };

    if (hit && !options.noCache) {
      // Return stale data immediately; revalidate silently in background if stale
      if (!isFresh(hit.ts)) {
        doFetch().catch(() => {}); // silent background refresh — don't throw
      }
      return hit.data;
    }

    // No cache entry yet — fetch, cache, return
    return doFetch();
  }

  // Non-GET: bypass cache entirely and invalidate related cache entries
  // Invalidate the same endpoint prefix to force re-fetch on next GET
  const basePath = endpoint.split('?')[0];
  invalidatePrefix(basePath.replace(/\/[^/]+$/, '')); // invalidate parent path

  const url = `${API_BASE_URL}${endpoint}`;
  const response = await fetch(url, { ...options, headers });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text }; }
  if (!response.ok) {
    if (response.status === 401) useAuthStore.getState().logout();
    throw new Error(data.error || data.message || 'Something went wrong');
  }
  return data;
};

export default {
  get: (endpoint, options) => apiRequest(endpoint, { ...options, method: 'GET' }),
  post: (endpoint, body, options) => apiRequest(endpoint, { ...options, method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body) }),
  patch: (endpoint, body, options) => apiRequest(endpoint, { ...options, method: 'PATCH', body: JSON.stringify(body) }),
  delete: (endpoint, options) => apiRequest(endpoint, { ...options, method: 'DELETE' }),
  invalidateCache: invalidatePrefix,
  API_BASE_URL,
};

