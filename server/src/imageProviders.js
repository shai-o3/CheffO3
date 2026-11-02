// Product-image lookup for ingredients: Shufersal store search, then Hebrew Wikipedia.
// Pure fetch-based code, shared by the Express server and the Netlify function.

const PROVIDERS = (process.env.IMAGE_PROVIDERS || 'shufersal,wikipedia').split(',').map((s) => s.trim()).filter(Boolean);
const USER_AGENT = process.env.IMAGE_USER_AGENT || 'CheffO3-RecipeApp/1.0 (personal recipe manager)';
export const MISS_TTL_DAYS = 7;
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

export const providers = {
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

/** Try each configured provider in order. Returns {url, product, source} or null. */
export async function lookupImage(term) {
  for (const prov of PROVIDERS) {
    if (!providers[prov]) continue;
    const found = await providers[prov](term);
    if (found) return { ...found, source: prov };
  }
  return null;
}
