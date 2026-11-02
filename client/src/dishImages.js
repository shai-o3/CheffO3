import { api } from './api.js';

// One generation at a time across the app, and each recipe is tried at most once per
// browser session, so a failing key or quota never turns into a loop of paid calls.
const tried = new Set();
let queue = Promise.resolve();
let blocked = null; // set after a quota/billing error: no more automatic attempts this session

/** Generate a dish photo for a recipe without one. Resolves to the updated recipe, or null. */
export function ensureDishImage(recipe, { fresh = false } = {}) {
  if (!fresh && (recipe.image || tried.has(recipe.id))) return Promise.resolve(null);
  if (!fresh && blocked) return Promise.reject(blocked);
  tried.add(recipe.id);
  const job = queue.then(() => api.generateImage(recipe.id, fresh)).catch((e) => {
    if (e.status === 429) blocked = e;
    throw e;
  });
  queue = job.catch(() => {});
  return job;
}
