// Storage-agnostic implementation of the CheffO3 API over a plain JSON "state" document.
// Used by the Netlify function (state in Netlify Blobs) and the browser demo (state in
// localStorage). Contains no Node-specific code. The Express server keeps its own
// SQLite implementation with the same routes.
//
// state = { seq, recipes: [...], shopping: [...], pantry: [...] }

import {
  INGREDIENT_CATEGORIES, RECIPE_CATEGORIES, DIFFICULTIES, STAPLES,
  guessCategory, guessEmoji, ingredientMatches, normalizeName, heuristicParse,
} from './hebrew.js';
import { SAMPLE_RECIPES } from './sampleRecipes.js';
import { cleanWhatsAppText, recipeToWhatsApp, shoppingListToWhatsApp } from './whatsappFormat.js';

const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const num = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v));
export const httpError = (status, message) => Object.assign(new Error(message), { status });

export const emptyState = () => ({ seq: 1, recipes: [], shopping: [], pantry: [] });

export function seedState(state = emptyState()) {
  for (const r of SAMPLE_RECIPES) createRecipe(state, { ...r, source: 'מתכוני דוגמה' });
  return state;
}

// ------------------------------------------------------------------ recipes

function buildRecipe(state, data, id, existing = {}) {
  const ingredients = (data.ingredients || existing.ingredients || [])
    .filter((i) => String(i.name || '').trim())
    .map((i, position) => ({
      id: state.seq++, recipe_id: id, position, section: i.section || '', name: String(i.name).trim(),
      quantity: num(i.quantity), unit: i.unit || '', note: i.note || '', category: i.category || guessCategory(i.name),
      search_term: i.search_term || String(i.name).trim(), emoji: i.emoji || guessEmoji(i.name),
    }));
  const steps = (data.steps || existing.steps || [])
    .map((st) => (typeof st === 'string' ? { text: st } : st))
    .filter((st) => String(st.text || '').trim())
    .map((st, position) => ({ id: state.seq++, recipe_id: id, position, text: String(st.text).trim(), tip: st.tip || '', minutes: num(st.minutes) }));
  return {
    id, title: String(data.title).trim(), description: data.description || '', emoji: data.emoji || '🍽️', image: data.image || null,
    category: data.category || 'עיקריות', cuisine: data.cuisine || '', prep_minutes: num(data.prep_minutes),
    cook_minutes: num(data.cook_minutes), servings: num(data.servings) || 4, difficulty: data.difficulty || 'בינוני',
    tags: Array.isArray(data.tags) ? data.tags : [], source: data.source || '', notes: data.notes || '', favorite: !!data.favorite,
    created_at: existing.created_at || now(), updated_at: now(), ingredients, steps,
  };
}

export function createRecipe(state, data) {
  if (!String(data.title || '').trim()) throw httpError(400, 'חסרה כותרת למתכון');
  const r = buildRecipe(state, data, state.seq++);
  state.recipes.push(r);
  return r;
}

const summary = ({ ingredients, steps, ...rest }) => ({ ...rest, ingredient_count: ingredients.length });

function getRecipe(state, id) {
  const r = state.recipes.find((x) => x.id === Number(id));
  if (!r) throw httpError(404, 'המתכון לא נמצא');
  return r;
}

function listRecipes(state, p) {
  const q = p.get('q');
  return state.recipes
    .filter((r) => (!p.get('category') || r.category === p.get('category'))
      && (!p.get('tag') || r.tags.includes(p.get('tag')))
      && (p.get('favorite') !== '1' || r.favorite)
      && (!q || [r.title, r.description, ...r.tags, ...r.ingredients.map((i) => i.name)].some((t) => t.includes(q))))
    .sort((a, b) => b.favorite - a.favorite || b.updated_at.localeCompare(a.updated_at) || b.id - a.id)
    .map(summary);
}

function allTags(state) {
  const m = new Map();
  state.recipes.forEach((r) => r.tags.forEach((t) => m.set(t, (m.get(t) || 0) + 1)));
  return [...m].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
}

function match(state, have, ignoreStaples) {
  const isStaple = (n) => STAPLES.some((s) => normalizeName(n) === normalizeName(s));
  const out = [];
  for (const r of state.recipes) {
    const ings = r.ingredients.filter((i) => !(ignoreStaples && isStaple(i.name)));
    if (!ings.length) continue;
    const matched = ings.filter((i) => have.some((h) => ingredientMatches(i.name, h)));
    if (!matched.length) continue;
    const missing = ings.filter((i) => !matched.includes(i));
    out.push({
      recipe: { ...summary(r), ingredient_count: ings.length }, score: matched.length / ings.length,
      matched: matched.map((i) => i.name),
      missing: missing.map(({ name, quantity, unit, category, emoji, search_term }) => ({ name, quantity, unit, category, emoji, search_term })),
    });
  }
  return out.sort((a, b) => b.score - a.score || a.missing.length - b.missing.length);
}

// ------------------------------------------------------------------ shopping

export function listShopping(state) {
  const order = (c) => { const i = INGREDIENT_CATEGORIES.indexOf(c); return i === -1 ? 999 : i; };
  return [...state.shopping].sort((a, b) => a.checked - b.checked || order(a.category) - order(b.category) || a.id - b.id);
}

function addItem(state, { name, quantity = null, unit = '', category, emoji, search_term, recipe }) {
  name = String(name || '').trim();
  if (!name) throw httpError(400, 'חסר שם מוצר');
  const ex = state.shopping.find((i) => !i.checked && normalizeName(i.name) === normalizeName(name) && (i.unit || '') === (unit || ''));
  if (ex) {
    if (recipe && !ex.recipes.some((r) => r.id === recipe.id)) ex.recipes.push(recipe);
    if (ex.quantity != null || num(quantity) != null) ex.quantity = Math.round(((ex.quantity || 0) + (num(quantity) || 0)) * 100) / 100;
    return;
  }
  state.shopping.push({
    id: state.seq++, name, quantity: num(quantity), unit: unit || '', category: category || guessCategory(name),
    emoji: emoji || guessEmoji(name), search_term: search_term || name, checked: false, recipes: recipe ? [recipe] : [],
  });
}

// ------------------------------------------------------------------ router

async function filesToImages(ctx, files) {
  return Promise.all(files.map(async (f) => ({ media_type: f.type || 'image/jpeg', data: await ctx.fileToBase64(f) })));
}

const aiOff = () => httpError(400, 'יכולת ה-AI לא מוגדרת: יש להגדיר ANTHROPIC_API_KEY בשרת.');

/**
 * Handle one API request.
 * @param {object} ctx {
 *   state,                      mutable state document
 *   ai?: { extractRecipe, suggestRecipes, adaptRecipe, askChef },   null = AI disabled
 *   images?: { get(key), set(key, value) },    ingredient image cache (async)
 *   lookupImage?: (term) => Promise<{url, source, product}|null>,
 *   saveUpload: (file) => Promise<string url>,
 *   fileToBase64: (file) => Promise<string>,
 *   publicUrl?, whatsappBot?, demo?
 * }
 * Sets ctx.dirty = true when the state changed and must be saved.
 * @returns the JSON response body (null for 204)
 */
export async function handle(ctx, method, path, params, body) {
  const { state } = ctx;
  let m;
  const route = (meth, re) => method === meth && (m = path.match(re));
  const mutate = (v) => { ctx.dirty = true; return v; };

  if (route('GET', /^\/session$/)) return { authRequired: false };

  if (route('GET', /^\/meta$/)) {
    return {
      aiEnabled: !!ctx.ai, whatsappBot: !!ctx.whatsappBot, demo: !!ctx.demo,
      ingredientCategories: INGREDIENT_CATEGORIES, recipeCategories: RECIPE_CATEGORIES, difficulties: DIFFICULTIES,
      staples: STAPLES, tags: allTags(state),
      knownIngredients: [...new Set(state.recipes.flatMap((r) => r.ingredients.map((i) => i.name)))],
    };
  }

  // recipes
  if (route('GET', /^\/recipes$/)) return listRecipes(state, params);
  if (route('GET', /^\/recipes\/(\d+)$/)) return getRecipe(state, m[1]);
  if (route('POST', /^\/recipes$/)) return mutate(createRecipe(state, body));
  if (route('PUT', /^\/recipes\/(\d+)$/)) {
    const cur = getRecipe(state, m[1]);
    const next = buildRecipe(state, { ...cur, ...body }, cur.id, cur);
    state.recipes[state.recipes.indexOf(cur)] = next;
    return mutate(next);
  }
  if (route('PATCH', /^\/recipes\/(\d+)\/favorite$/)) {
    const r = getRecipe(state, m[1]);
    r.favorite = !!body.favorite;
    return mutate(r);
  }
  if (route('DELETE', /^\/recipes\/(\d+)$/)) {
    getRecipe(state, m[1]);
    state.recipes = state.recipes.filter((r) => r.id !== Number(m[1]));
    return mutate(null);
  }
  if (route('POST', /^\/recipes\/(\d+)\/image$/)) {
    const r = getRecipe(state, m[1]);
    const file = body.get('image');
    if (!file || typeof file === 'string') throw httpError(400, 'יש להעלות קובץ תמונה');
    r.image = await ctx.saveUpload(file);
    r.updated_at = now();
    return mutate(r);
  }
  if (route('GET', /^\/recipes\/(\d+)\/whatsapp$/)) {
    const r = getRecipe(state, m[1]);
    const url = ctx.publicUrl && `${ctx.publicUrl}/recipes/${r.id}`;
    return { text: recipeToWhatsApp(r, { servings: Number(params.get('servings')) || undefined, url }) };
  }

  // AI
  if (route('POST', /^\/ai\/extract$/)) {
    const files = body.getAll('images').filter((f) => typeof f !== 'string');
    const text = cleanWhatsAppText(String(body.get('text') || ''));
    if (!text.trim() && !files.length) throw httpError(400, 'יש להזין טקסט או להעלות תמונה');
    if (!ctx.ai) {
      if (files.length) throw httpError(400, 'קריאת מתכון מצילום מסך דורשת חיבור ל-AI (מפתח ANTHROPIC_API_KEY בשרת).');
      return { ...heuristicParse(text), _engine: 'heuristic' };
    }
    const recipe = await ctx.ai.extractRecipe({ text, images: await filesToImages(ctx, files) });
    if (files.length && body.get('keepImage') === '1') recipe.image = await ctx.saveUpload(files[0]);
    return recipe;
  }
  if (route('POST', /^\/ai\/suggest$/)) {
    if (!ctx.ai) throw aiOff();
    const pantry = body.pantry?.length ? body.pantry : state.pantry;
    if (!pantry.length) throw httpError(400, 'הוסיפו מצרכים שיש לכם בבית');
    return ctx.ai.suggestRecipes({
      pantry, preferences: body.preferences, count: Math.min(Number(body.count) || 3, 5),
      existingTitles: state.recipes.map((r) => r.title),
    });
  }
  if (route('POST', /^\/recipes\/(\d+)\/adapt$/)) {
    if (!ctx.ai) throw aiOff();
    return ctx.ai.adaptRecipe(getRecipe(state, m[1]), String(body.instruction || ''));
  }
  if (route('POST', /^\/recipes\/(\d+)\/ask$/)) {
    if (!ctx.ai) throw aiOff();
    return { answer: await ctx.ai.askChef(getRecipe(state, m[1]), String(body.question || ''), body.history || []) };
  }

  // match & pantry
  if (route('POST', /^\/match$/)) return match(state, body.have?.length ? body.have : state.pantry, body.ignoreStaples !== false);
  if (route('GET', /^\/pantry$/)) return state.pantry;
  if (route('POST', /^\/pantry$/)) {
    for (const n of [].concat(body.names || body.name || [])) {
      const v = String(n).trim();
      if (v && !state.pantry.includes(v)) state.pantry.unshift(v);
    }
    return mutate(state.pantry);
  }
  if (route('DELETE', /^\/pantry$/)) { state.pantry = []; return mutate([]); }
  if (route('DELETE', /^\/pantry\/(.+)$/)) {
    state.pantry = state.pantry.filter((n) => n !== decodeURIComponent(m[1]));
    return mutate(state.pantry);
  }

  // shopping
  if (route('GET', /^\/shopping$/)) return listShopping(state);
  if (route('GET', /^\/shopping\/whatsapp$/)) return { text: shoppingListToWhatsApp(listShopping(state)) };
  if (route('POST', /^\/shopping$/)) {
    [].concat(body).forEach((i) => addItem(state, i));
    return mutate(listShopping(state));
  }
  if (route('POST', /^\/shopping\/from-recipe\/(\d+)$/)) {
    const r = getRecipe(state, m[1]);
    const f = body?.servings && r.servings ? Number(body.servings) / r.servings : 1;
    let added = 0;
    for (const i of r.ingredients) {
      if (body?.ingredientIds && !body.ingredientIds.includes(i.id)) continue;
      addItem(state, { ...i, quantity: i.quantity != null ? Math.round(i.quantity * f * 100) / 100 : null, recipe: { id: r.id, title: r.title } });
      added++;
    }
    return mutate({ added, items: listShopping(state) });
  }
  if (route('PATCH', /^\/shopping\/(\d+)$/)) {
    const it = state.shopping.find((i) => i.id === Number(m[1]));
    if (!it) throw httpError(404, 'הפריט לא נמצא');
    for (const k of ['name', 'quantity', 'unit', 'category', 'checked']) if (k in body) it[k] = k === 'quantity' ? num(body[k]) : body[k];
    return mutate(it);
  }
  if (route('DELETE', /^\/shopping\/(\d+)$/)) {
    state.shopping = state.shopping.filter((i) => i.id !== Number(m[1]));
    return mutate(null);
  }
  if (route('DELETE', /^\/shopping$/)) {
    state.shopping = params.get('checked') === '1' ? state.shopping.filter((i) => !i.checked) : [];
    return mutate(listShopping(state));
  }

  // ingredient images (cache kept outside the state document)
  if (route('GET', /^\/ingredient-image$/)) {
    const key = normalizeName(params.get('q') || params.get('name') || '');
    if (!key || !ctx.images) return { url: null };
    const cached = await ctx.images.get(key);
    const fresh = cached && (cached.url || cached.manual || Date.now() - (cached.at || 0) < 7 * 864e5);
    if (fresh) return { url: cached.url, source: cached.source, product: cached.product };
    if (!ctx.lookupImage) return { url: null };
    const found = await ctx.lookupImage(params.get('q') || params.get('name'));
    const entry = { url: found?.url || null, source: found?.source || null, product: found?.product || null, at: Date.now() };
    await ctx.images.set(key, entry);
    return entry;
  }
  if (route('PUT', /^\/ingredient-image$/)) {
    const entry = { url: body.url || null, source: 'manual', manual: true, at: Date.now() };
    await ctx.images?.set(normalizeName(body.term || ''), entry);
    return entry;
  }
  if (route('POST', /^\/ingredient-image\/upload$/)) {
    const file = body.get('image');
    if (!file || typeof file === 'string') throw httpError(400, 'יש להעלות קובץ תמונה');
    const entry = { url: await ctx.saveUpload(file), source: 'manual', manual: true, at: Date.now() };
    await ctx.images?.set(normalizeName(String(body.get('term') || '')), entry);
    return entry;
  }
  if (route('DELETE', /^\/ingredient-image$/)) {
    await ctx.images?.set(normalizeName(params.get('term') || ''), null);
    return null;
  }

  throw httpError(404, 'הנתיב לא נמצא');
}
