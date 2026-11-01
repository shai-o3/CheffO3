// Ingredient product images.
//
// For each ingredient we look up a product photo, in order:
//   1. Shufersal online store search (https://www.shufersal.co.il)
//   2. Hebrew Wikipedia page image for the ingredient
// Results (including misses) are cached in the `ingredient_images` table so each
// ingredient is fetched once. Users can also set an image manually from the UI,
// which always wins over the automatic lookup.

import { db } from './db.js';
import { normalizeName } from './hebrew.js';

const PROVIDERS = (process.env.IMAGE_PROVIDERS || 'shufersal,wikipedia').split(',').map((s) => s.trim()).filter(Boolean);
const USER_AGENT = process.env.IMAGE_USER_AGENT || 'CheffO3-RecipeApp/1.0 (personal recipe manager)';
const MISS_TTL_DAYS = 7;
const TIMEOUT_MS = 8000;

async function fetchJson(url, headers = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': USER_AGENT, ...headers }, signal: ctrl.signal });
    if (!res.ok) return null;
    const type = res.headers.get('content-type') || '';
    if (!type.includes('json')) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** Find the first product image URL in a Shufersal search response. */
export function extractShufersalImage(data) {
  const results = data?.results || data?.products || [];
  for (const p of results) {
    const imgs = p.images || p.image || [];
    const list = Array.isArray(imgs) ? imgs : [imgs];
    const preferred = list.find((i) => /medium|product/i.test(i?.format || '')) || list[0];
    const url = typeof preferred === 'string' ? preferred : preferred?.url;
    if (url) {
      return { url: url.startsWith('http') ? url : `https://www.shufersal.co.il${url}`, product: p.name || p.title || '' };
    }
  }
  return null;
}

const providers = {
  async shufersal(term) {
    const url = `https://www.shufersal.co.il/online/he/search/results?q=${encodeURIComponent(term)}&limit=5`;
    const data = await fetchJson(url, { 'X-Requested-With': 'XMLHttpRequest' });
    return data ? extractShufersalImage(data) : null;
  },
  async wikipedia(term) {
    const base = 'https://he.wikipedia.org/w/api.php?format=json&origin=*&action=query&prop=pageimages&piprop=thumbnail&pithumbsize=320&redirects=1';
    let data = await fetchJson(`${base}&titles=${encodeURIComponent(term)}`);
    let page = data && Object.values(data.query?.pages || {}).find((p) => p.thumbnail);
    if (!page) {
      data = await fetchJson(`${base}&generator=search&gsrlimit=1&gsrsearch=${encodeURIComponent(term)}`);
      page = data && Object.values(data.query?.pages || {}).find((p) => p.thumbnail);
    }
    return page ? { url: page.thumbnail.source, product: page.title } : null;
  },
};

const inflight = new Map();

function cached(key) {
  return db.prepare('SELECT * FROM ingredient_images WHERE key = ?').get(key);
}

/**
 * Get an image for an ingredient. `term` is a generic search term (e.g. "קמח לבן")
 * that works better for store search than the full ingredient text.
 */
export async function getIngredientImage(name, term) {
  const key = normalizeName(term || name);
  if (!key) return { url: null };
  const row = cached(key);
  if (row) {
    const fresh = row.image_url || row.manual ||
      (Date.now() - new Date(row.fetched_at + 'Z').getTime()) / 864e5 < MISS_TTL_DAYS;
    if (fresh) return { url: row.image_url, source: row.source, product: row.product_name };
  }
  if (inflight.has(key)) return inflight.get(key);
  const p = (async () => {
    let found = null;
    for (const prov of PROVIDERS) {
      if (!providers[prov]) continue;
      found = await providers[prov](term || name);
      if (found) { found.source = prov; break; }
    }
    db.prepare(`INSERT INTO ingredient_images (key, image_url, source, product_name, manual, fetched_at)
      VALUES (?, ?, ?, ?, 0, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET image_url = excluded.image_url, source = excluded.source,
        product_name = excluded.product_name, fetched_at = excluded.fetched_at WHERE manual = 0`)
      .run(key, found?.url || null, found?.source || null, found?.product || null);
    return { url: found?.url || null, source: found?.source, product: found?.product };
  })().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

export function setManualImage(term, url) {
  const key = normalizeName(term);
  db.prepare(`INSERT INTO ingredient_images (key, image_url, source, manual, fetched_at)
    VALUES (?, ?, 'manual', 1, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET image_url = excluded.image_url, source = 'manual', manual = 1, fetched_at = excluded.fetched_at`)
    .run(key, url || null);
  return { url: url || null, source: 'manual' };
}

export function resetImage(term) {
  db.prepare('DELETE FROM ingredient_images WHERE key = ?').run(normalizeName(term));
}

/** Link to search the product on the supermarket site – shown next to every ingredient. */
export const storeLinks = (term) => ({
  shufersal: `https://www.shufersal.co.il/online/he/search?text=${encodeURIComponent(term)}`,
  ramilevy: `https://www.rami-levy.co.il/he/online/search?q=${encodeURIComponent(term)}`,
});
