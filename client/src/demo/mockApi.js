// In-browser stand-in for the server, used by the demo build (`npm run build:demo`).
// Runs the shared API core (server/src/core.js) over a state kept in localStorage.
// No AI and no store-image lookup here: those need a server.

import { handle, seedState } from '../../../server/src/core.js';

const KEY = 'cheffo3-demo-v2';

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* storage blocked */ }
  return null;
}

const fileToDataUrl = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = reject;
  r.readAsDataURL(file);
});

/** Install a fetch interceptor that answers /api/* requests in the browser. */
export function installMockApi() {
  const state = load() || { ...seedState(), images: {} };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage blocked */ } };
  const ctx = {
    state,
    demo: true,
    ai: null,
    images: {
      get: async (k) => state.images[k] || null,
      set: async (k, v) => { if (v) state.images[k] = v; else delete state.images[k]; save(); },
    },
    saveUpload: fileToDataUrl,
    fileToBase64: async (f) => (await fileToDataUrl(f)).split(',')[1],
  };

  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    if (!url.pathname.startsWith('/api/')) return realFetch(input, init);
    const method = (init.method || 'GET').toUpperCase();
    let body = init.body;
    if (typeof body === 'string') body = JSON.parse(body);
    try {
      ctx.dirty = false;
      const data = await handle(ctx, method, url.pathname.slice(4), url.searchParams, body);
      if (ctx.dirty) save();
      if (data === null) return new Response(null, { status: 204 });
      return Response.json(data);
    } catch (e) {
      return Response.json({ error: e.message }, { status: e.status || 500 });
    }
  };
}
