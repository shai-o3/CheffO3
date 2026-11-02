import { compressAll, compressImage } from './imageUtils.js';

async function request(method, url, body, { form } = {}) {
  const opts = { method, headers: {} };
  if (form) opts.body = form;
  else if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`/api${url}`, opts);
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && data.auth) window.dispatchEvent(new Event('cheffo3-auth'));
  if (!res.ok) throw new Error(data.error || `שגיאה (${res.status})`);
  return data;
}

const qs = (o) => {
  const p = new URLSearchParams();
  Object.entries(o).forEach(([k, v]) => v != null && v !== '' && v !== false && p.set(k, v === true ? '1' : v));
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const auth = {
  /** { authRequired: false } on servers without accounts (local server, demo) */
  session: () => request('GET', '/session'),
  register: (body) => request('POST', '/auth/register', body),
  login: (email, password) => request('POST', '/auth/login', { email, password }),
  google: (credential) => request('POST', '/auth/google', { credential }),
  logout: () => request('POST', '/auth/logout', {}),
  updateMe: (patch) => request('PUT', '/me', patch),
  changePassword: (current, next) => request('POST', '/me/password', { current, next }),
  linkGoogle: (credential) => request('POST', '/me/google', { credential }),
  uploadPicture: async (file) => {
    const f = new FormData();
    f.append('image', await compressImage(file, { maxDim: 400 }));
    return request('POST', '/me/picture', null, { form: f });
  },
  removePicture: () => request('DELETE', '/me/picture'),
};

export const api = {
  meta: () => request('GET', '/meta'),
  recipes: (filters = {}) => request('GET', `/recipes${qs(filters)}`),
  recipe: (id) => request('GET', `/recipes/${id}`),
  createRecipe: (r) => request('POST', '/recipes', r),
  updateRecipe: (id, r) => request('PUT', `/recipes/${id}`, r),
  deleteRecipe: (id) => request('DELETE', `/recipes/${id}`),
  setFavorite: (id, favorite) => request('PATCH', `/recipes/${id}/favorite`, { favorite }),
  uploadRecipeImage: async (id, file) => {
    const f = new FormData();
    f.append('image', await compressImage(file));
    return request('POST', `/recipes/${id}/image`, null, { form: f });
  },
  recipeWhatsApp: (id, servings) => request('GET', `/recipes/${id}/whatsapp${qs({ servings })}`),

  extract: async ({ text, files, keepImage }) => {
    const f = new FormData();
    f.append('text', text || '');
    (await compressAll(files || [])).forEach((file) => f.append('images', file));
    if (keepImage) f.append('keepImage', '1');
    return request('POST', '/ai/extract', null, { form: f });
  },
  suggest: (body) => request('POST', '/ai/suggest', body),
  adapt: (id, instruction) => request('POST', `/recipes/${id}/adapt`, { instruction }),
  ask: (id, question, history) => request('POST', `/recipes/${id}/ask`, { question, history }),

  match: (have, ignoreStaples = true) => request('POST', '/match', { have, ignoreStaples }),
  pantry: () => request('GET', '/pantry'),
  addPantry: (names) => request('POST', '/pantry', { names }),
  removePantry: (name) => request('DELETE', `/pantry/${encodeURIComponent(name)}`),
  clearPantry: () => request('DELETE', '/pantry'),

  shopping: () => request('GET', '/shopping'),
  shoppingWhatsApp: () => request('GET', '/shopping/whatsapp'),
  addShopping: (items) => request('POST', '/shopping', items),
  addFromRecipe: (id, body) => request('POST', `/shopping/from-recipe/${id}`, body),
  updateShopping: (id, patch) => request('PATCH', `/shopping/${id}`, patch),
  deleteShopping: (id) => request('DELETE', `/shopping/${id}`),
  clearShopping: (onlyChecked) => request('DELETE', `/shopping${qs({ checked: onlyChecked })}`),

  ingredientImage: (name, q) => request('GET', `/ingredient-image${qs({ name, q })}`),
  setIngredientImage: (term, url) => request('PUT', '/ingredient-image', { term, url }),
  uploadIngredientImage: async (term, file) => {
    const f = new FormData();
    f.append('term', term);
    f.append('image', await compressImage(file, { maxDim: 600 }));
    return request('POST', '/ingredient-image/upload', null, { form: f });
  },
  resetIngredientImage: (term) => request('DELETE', `/ingredient-image${qs({ term })}`),
};

export const whatsappLink = (text) => `https://wa.me/?text=${encodeURIComponent(text)}`;
export const shufersalLink = (term) => `https://www.shufersal.co.il/online/he/search?text=${encodeURIComponent(term)}`;

export function formatQty(q) {
  if (q == null || q === '') return '';
  const n = Number(q);
  const whole = Math.floor(n);
  const frac = n - whole;
  const fr = [[0.25, '¼'], [0.5, '½'], [0.75, '¾'], [1 / 3, '⅓'], [2 / 3, '⅔']].find(([v]) => Math.abs(frac - v) < 0.04);
  if (fr) return whole ? `${whole}${fr[1]}` : fr[1];
  return String(Math.round(n * 100) / 100);
}

export const totalTime = (r) => (r.prep_minutes || 0) + (r.cook_minutes || 0);
