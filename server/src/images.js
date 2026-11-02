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
import { lookupImage, MISS_TTL_DAYS } from './imageProviders.js';

export { extractShufersalImage } from './imageProviders.js';

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
    const found = await lookupImage(term || name);
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
