// In-browser stand-in for the server API, used by the demo build (`npm run build:demo`).
// Data lives in localStorage of the viewer's browser. AI image reading, store images and
// the WhatsApp bot need the real server, so they are disabled here.

import {
  INGREDIENT_CATEGORIES, RECIPE_CATEGORIES, DIFFICULTIES, STAPLES,
  guessCategory, guessEmoji, ingredientMatches, normalizeName, heuristicParse,
} from '../../../server/src/hebrew.js';
import { SAMPLE_RECIPES } from '../../../server/src/sampleRecipes.js';

const KEY = 'cheffo3-demo-v1';
const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* storage blocked */ }
  return null;
}

let state;
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage blocked */ }
}

function seed() {
  const s = { seq: 1, recipes: [], shopping: [], pantry: [], images: {} };
  for (const r of SAMPLE_RECIPES) createRecipe({ ...r, source: 'מתכוני דוגמה' }, s);
  return s;
}

const num = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v));
const err = (status, message) => Object.assign(new Error(message), { status });

function buildRecipe(data, id, s, existing = {}) {
  const ingredients = (data.ingredients || existing.ingredients || [])
    .filter((i) => String(i.name || '').trim())
    .map((i, position) => ({
      id: s.seq++, recipe_id: id, position, section: i.section || '', name: String(i.name).trim(), quantity: num(i.quantity),
      unit: i.unit || '', note: i.note || '', category: i.category || guessCategory(i.name),
      search_term: i.search_term || i.name, emoji: i.emoji || guessEmoji(i.name),
    }));
  const steps = (data.steps || existing.steps || [])
    .map((st) => (typeof st === 'string' ? { text: st } : st))
    .filter((st) => String(st.text || '').trim())
    .map((st, position) => ({ id: s.seq++, recipe_id: id, position, text: st.text.trim(), tip: st.tip || '', minutes: num(st.minutes) }));
  return {
    id, title: data.title, description: data.description || '', emoji: data.emoji || '🍽️', image: data.image || null,
    category: data.category || 'עיקריות', cuisine: data.cuisine || '', prep_minutes: num(data.prep_minutes),
    cook_minutes: num(data.cook_minutes), servings: num(data.servings) || 4, difficulty: data.difficulty || 'בינוני',
    tags: data.tags || [], source: data.source || '', notes: data.notes || '', favorite: !!data.favorite,
    created_at: existing.created_at || now(), updated_at: now(), ingredients, steps,
  };
}

function createRecipe(data, s = state) {
  if (!data.title?.trim()) throw err(400, 'חסרה כותרת למתכון');
  const r = buildRecipe(data, s.seq++, s);
  s.recipes.push(r);
  return r;
}

const summary = (r) => {
  const { ingredients, steps, ...rest } = r;
  return { ...rest, ingredient_count: ingredients.length };
};
const getRecipe = (id) => {
  const r = state.recipes.find((x) => x.id === Number(id));
  if (!r) throw err(404, 'לא נמצא');
  return r;
};

function listRecipes(p) {
  const q = p.get('q');
  let list = state.recipes.filter((r) => (!p.get('category') || r.category === p.get('category'))
    && (!p.get('tag') || r.tags.includes(p.get('tag')))
    && (p.get('favorite') !== '1' || r.favorite)
    && (!q || [r.title, r.description, ...r.tags, ...r.ingredients.map((i) => i.name)].some((t) => t.includes(q))));
  list = list.sort((a, b) => b.favorite - a.favorite || b.updated_at.localeCompare(a.updated_at) || b.id - a.id);
  return list.map(summary);
}

function allTags() {
  const m = new Map();
  state.recipes.forEach((r) => r.tags.forEach((t) => m.set(t, (m.get(t) || 0) + 1)));
  return [...m].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
}

function match(have, ignoreStaples) {
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

// ---- shopping
function listShopping() {
  const order = (c) => { const i = INGREDIENT_CATEGORIES.indexOf(c); return i === -1 ? 999 : i; };
  return [...state.shopping].sort((a, b) => a.checked - b.checked || order(a.category) - order(b.category) || a.id - b.id);
}
function addItem({ name, quantity = null, unit = '', category, emoji, search_term, recipe }) {
  name = String(name || '').trim();
  if (!name) throw err(400, 'חסר שם מוצר');
  const ex = state.shopping.find((i) => !i.checked && normalizeName(i.name) === normalizeName(name) && (i.unit || '') === (unit || ''));
  if (ex) {
    if (recipe && !ex.recipes.some((r) => r.id === recipe.id)) ex.recipes.push(recipe);
    if (ex.quantity != null || (quantity != null && quantity !== '')) ex.quantity = (ex.quantity || 0) + (num(quantity) || 0);
    return;
  }
  state.shopping.push({
    id: state.seq++, name, quantity: num(quantity), unit: unit || '', category: category || guessCategory(name),
    emoji: emoji || guessEmoji(name), search_term: search_term || name, checked: false, recipes: recipe ? [recipe] : [],
  });
}

function whatsappRecipe(r, servings) {
  const f = servings && r.servings ? servings / r.servings : 1;
  const fq = (q) => (q == null ? '' : String(Math.round(q * f * 100) / 100));
  const lines = [`*${r.emoji} ${r.title}*`];
  if (r.description) lines.push(`_${r.description}_`);
  lines.push(`🍽️ ${servings || r.servings} מנות`, '', '*🧺 מצרכים:*');
  let sec = '';
  for (const i of r.ingredients) {
    if (i.section && i.section !== sec) { sec = i.section; lines.push(`_${sec}:_`); }
    lines.push(`• ${[fq(i.quantity), i.unit, i.name].filter(Boolean).join(' ')}${i.note ? ` (${i.note})` : ''}`);
  }
  lines.push('', '*👩‍🍳 אופן ההכנה:*', ...r.steps.map((s, k) => `${k + 1}. ${s.text}`));
  if (r.notes) lines.push('', `📝 ${r.notes}`);
  return lines.join('\n');
}
function whatsappShopping() {
  const open = listShopping().filter((i) => !i.checked);
  if (!open.length) return '🛒 רשימת הקניות ריקה';
  const lines = ['*🛒 רשימת קניות*'];
  let cat = '';
  for (const i of open) {
    if (i.category !== cat) { cat = i.category; lines.push('', `*${cat}*`); }
    const q = [i.quantity != null ? Math.round(i.quantity * 100) / 100 : '', i.unit].filter(Boolean).join(' ');
    lines.push(`☐ ${i.name}${q ? ` – ${q}` : ''}`);
  }
  return lines.join('\n');
}

const fileToDataUrl = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = reject;
  r.readAsDataURL(file);
});

const AI_OFF = 'בגרסת ההדגמה אין חיבור לבינה מלאכותית. בגרסה המלאה (עם מפתח API בשרת) זה עובד.';

// ---- router
async function handle(method, path, params, body) {
  let m;
  const route = (meth, re) => method === meth && (m = path.match(re));

  if (route('GET', /^\/meta$/)) {
    return {
      aiEnabled: false, whatsappBot: false, demo: true, ingredientCategories: INGREDIENT_CATEGORIES, recipeCategories: RECIPE_CATEGORIES,
      difficulties: DIFFICULTIES, staples: STAPLES, tags: allTags(),
      knownIngredients: [...new Set(state.recipes.flatMap((r) => r.ingredients.map((i) => i.name)))],
    };
  }
  if (route('GET', /^\/recipes$/)) return listRecipes(params);
  if (route('GET', /^\/recipes\/(\d+)$/)) return getRecipe(m[1]);
  if (route('POST', /^\/recipes$/)) return createRecipe(body);
  if (route('PUT', /^\/recipes\/(\d+)$/)) {
    const cur = getRecipe(m[1]);
    const next = buildRecipe({ ...cur, ...body }, cur.id, state, cur);
    state.recipes[state.recipes.indexOf(cur)] = next;
    return next;
  }
  if (route('PATCH', /^\/recipes\/(\d+)\/favorite$/)) {
    const r = getRecipe(m[1]);
    r.favorite = !!body.favorite;
    return r;
  }
  if (route('DELETE', /^\/recipes\/(\d+)$/)) {
    getRecipe(m[1]);
    state.recipes = state.recipes.filter((r) => r.id !== Number(m[1]));
    return null;
  }
  if (route('POST', /^\/recipes\/(\d+)\/image$/)) {
    const r = getRecipe(m[1]);
    r.image = await fileToDataUrl(body.get('image'));
    return r;
  }
  if (route('GET', /^\/recipes\/(\d+)\/whatsapp$/)) return { text: whatsappRecipe(getRecipe(m[1]), Number(params.get('servings')) || undefined) };

  if (route('POST', /^\/ai\/extract$/)) {
    const text = body.get('text') || '';
    if (body.getAll('images').length) throw err(400, 'קריאת מתכון מצילום מסך זמינה בגרסה המלאה עם מפתח API. בהדגמה אפשר להדביק טקסט.');
    if (!text.trim()) throw err(400, 'יש להזין טקסט');
    const cleaned = text.split('\n')
      .map((l) => l.replace(/^‎?\[?\d{1,2}[./]\d{1,2}[./]\d{2,4},?\s+\d{1,2}:\d{2}(?::\d{2})?\]?\s*(?:-\s*)?[^:]{1,40}:\s*/, '').replace(/(^|\s)[*_~]([^*_~\n]+)[*_~]/g, '$1$2'))
      .join('\n');
    return { ...heuristicParse(cleaned), _engine: 'heuristic' };
  }
  if (route('POST', /^\/ai\/suggest$/) || route('POST', /^\/recipes\/\d+\/(adapt|ask)$/)) throw err(400, AI_OFF);

  if (route('POST', /^\/match$/)) return match(body.have?.length ? body.have : state.pantry, body.ignoreStaples !== false);

  if (route('GET', /^\/pantry$/)) return state.pantry;
  if (route('POST', /^\/pantry$/)) {
    for (const n of [].concat(body.names || [])) if (n.trim() && !state.pantry.includes(n.trim())) state.pantry.unshift(n.trim());
    return state.pantry;
  }
  if (route('DELETE', /^\/pantry$/)) { state.pantry = []; return []; }
  if (route('DELETE', /^\/pantry\/(.+)$/)) {
    state.pantry = state.pantry.filter((n) => n !== decodeURIComponent(m[1]));
    return state.pantry;
  }

  if (route('GET', /^\/shopping$/)) return listShopping();
  if (route('GET', /^\/shopping\/whatsapp$/)) return { text: whatsappShopping() };
  if (route('POST', /^\/shopping$/)) { [].concat(body).forEach(addItem); return listShopping(); }
  if (route('POST', /^\/shopping\/from-recipe\/(\d+)$/)) {
    const r = getRecipe(m[1]);
    const f = body?.servings && r.servings ? body.servings / r.servings : 1;
    let added = 0;
    for (const i of r.ingredients) {
      if (body?.ingredientIds && !body.ingredientIds.includes(i.id)) continue;
      addItem({ ...i, quantity: i.quantity != null ? Math.round(i.quantity * f * 100) / 100 : null, recipe: { id: r.id, title: r.title } });
      added++;
    }
    return { added, items: listShopping() };
  }
  if (route('PATCH', /^\/shopping\/(\d+)$/)) {
    const it = state.shopping.find((i) => i.id === Number(m[1]));
    if (!it) throw err(404, 'לא נמצא');
    Object.assign(it, body);
    return it;
  }
  if (route('DELETE', /^\/shopping\/(\d+)$/)) { state.shopping = state.shopping.filter((i) => i.id !== Number(m[1])); return null; }
  if (route('DELETE', /^\/shopping$/)) {
    state.shopping = params.get('checked') === '1' ? state.shopping.filter((i) => !i.checked) : [];
    return listShopping();
  }

  // Store images can't be fetched from inside the demo page; manual images still work.
  if (route('GET', /^\/ingredient-image$/)) {
    const k = normalizeName(params.get('q') || params.get('name') || '');
    return { url: state.images[k] || null, source: state.images[k] ? 'manual' : undefined };
  }
  if (route('PUT', /^\/ingredient-image$/)) { state.images[normalizeName(body.term)] = body.url || null; return { url: body.url }; }
  if (route('POST', /^\/ingredient-image\/upload$/)) {
    const url = await fileToDataUrl(body.get('image'));
    state.images[normalizeName(body.get('term'))] = url;
    return { url, source: 'manual' };
  }
  if (route('DELETE', /^\/ingredient-image$/)) { delete state.images[normalizeName(params.get('term') || '')]; return null; }

  throw err(404, 'לא נמצא');
}

/** Install a fetch interceptor for /api/* requests. */
export function installMockApi() {
  state = load() || seed();
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    if (!url.pathname.startsWith('/api/')) return realFetch(input, init);
    const method = (init.method || 'GET').toUpperCase();
    let body = init.body;
    if (typeof body === 'string') body = JSON.parse(body);
    try {
      const data = await handle(method, url.pathname.slice(4), url.searchParams, body);
      if (method !== 'GET') save();
      if (data === null) return new Response(null, { status: 204 });
      return new Response(JSON.stringify(data), { status: method === 'POST' && /\/recipes$/.test(url.pathname) ? 201 : 200, headers: { 'content-type': 'application/json' } });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: e.status || 500, headers: { 'content-type': 'application/json' } });
    }
  };
}
