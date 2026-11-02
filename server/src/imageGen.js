// Dish photos generated with Google's Gemini image model ("Nano Banana").
// Enabled when GEMINI_API_KEY is set (create one at https://aistudio.google.com/apikey).
//   GEMINI_IMAGE_MODEL  model id (default below)
//
// Uses the Interactions endpoint and falls back to the classic generateContent
// endpoint; the image is read from either response format.

import crypto from 'node:crypto';

const API = () => process.env.GEMINI_API_BASE || 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_MODEL = 'gemini-nano-banana-2.1';
const TIMEOUT_MS = 50_000;

const apiKey = () => String(process.env.GEMINI_API_KEY || '').trim().replace(/^["']|["']$/g, '');
export const imageGenEnabled = () => !!apiKey();
const model = () => process.env.GEMINI_IMAGE_MODEL || DEFAULT_MODEL;

/** Prompt describing the finished dish, built from the recipe. */
export function dishPrompt(recipe) {
  const main = (recipe.ingredients || [])
    .filter((i) => !/מלח|פלפל שחור|^מים|שמן/.test(i.name))
    .slice(0, 8)
    .map((i) => i.name)
    .join(', ');
  return [
    'Professional food photography of a finished, home-cooked dish, ready to eat.',
    `Dish (Hebrew name): "${recipe.title}".`,
    recipe.description && `Description (Hebrew): ${recipe.description}`,
    main && `Main ingredients (Hebrew): ${main}.`,
    recipe.cuisine && `Cuisine: ${recipe.cuisine}.`,
    recipe.category && `Course: ${recipe.category}.`,
    'Show the dish plated or in the pan it is served in, on a warm kitchen table, soft natural window light,',
    '45-degree angle, shallow depth of field, appetizing and realistic. No text, no labels, no watermark, no people, no hands.',
  ].filter(Boolean).join(' ');
}

/** Stable key so identical recipes (e.g. the sample recipes) share one generated image. */
export function dishKey(recipe) {
  const basis = JSON.stringify([recipe.title, recipe.description, (recipe.ingredients || []).map((i) => i.name)]);
  return `dish:${crypto.createHash('sha256').update(basis).digest('hex').slice(0, 32)}`;
}

/** Find the first base64 image anywhere in a Gemini response (either API format). */
export function findImage(node) {
  if (!node || typeof node !== 'object') return null;
  const inline = node.inlineData || node.inline_data;
  if (inline?.data) return { data: inline.data, mimeType: inline.mimeType || inline.mime_type || 'image/png' };
  if (node.type === 'image' && typeof node.data === 'string') return { data: node.data, mimeType: node.mime_type || node.mimeType || 'image/png' };
  for (const v of Array.isArray(node) ? node : Object.values(node)) {
    const found = findImage(v);
    if (found) return found;
  }
  return null;
}

async function post(path, body) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API()}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey() },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { ok: res.ok, status: res.status, json, text };
  } finally {
    clearTimeout(t);
  }
}

/**
 * Generate a photo of the dish. Returns { data: base64, mimeType }.
 * Throws an Error with a user-facing Hebrew message on failure.
 */
export async function generateDishImage(recipe) {
  if (!imageGenEnabled()) throw Object.assign(new Error('יצירת תמונות לא מוגדרת (חסר GEMINI_API_KEY)'), { status: 400 });
  const prompt = dishPrompt(recipe);

  let res = await post('interactions', {
    model: model(),
    input: prompt,
    response_format: { type: 'image', mime_type: 'image/jpeg', aspect_ratio: '4:3' },
  });
  let image = res.ok ? findImage(res.json) : null;

  // Fallback: the classic generateContent endpoint.
  if (!image) {
    const first = res;
    res = await post(`models/${encodeURIComponent(model())}:generateContent`, {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '4:3' } },
    });
    image = res.ok ? findImage(res.json) : null;
    if (!image) {
      console.error('gemini image failed', first.status, first.text.slice(0, 300), '|', res.status, res.text.slice(0, 300));
      const msg = res.json?.error?.message || first.json?.error?.message || `קוד ${res.status}`;
      const reason = (j) => j?.error?.details?.find((d) => d.reason)?.reason || j?.error?.status || '';
      const detail = `[interactions: ${first.status} ${reason(first.json)} | generateContent: ${res.status} ${reason(res.json)}]`;
      if (/API key not valid|API_KEY_INVALID/i.test(msg + first.text + res.text)) {
        const k = apiKey();
        const looksRight = k.startsWith('AQ.') || k.startsWith('AIza');
        const hint = looksRight ? '' : ` הערך שהוגדר מתחיל ב-"${k.slice(0, 4)}…", ומפתח Gemini מתחיל ב-"AQ." או ב-"AIza".`;
        throw Object.assign(new Error(`Google דחה את מפתח ה-Gemini.${hint} ודאו שהמפתח נוצר ב-aistudio.google.com/apikey והועתק במלואו ל-GEMINI_API_KEY. ${detail}`), { status: 400 });
      }
      if (res.status === 429 || first.status === 429) {
        const freeTier = /free_tier|FreeTier|Free Tier/i.test(first.text + res.text);
        throw Object.assign(new Error(freeTier
          ? 'יצירת תמונות לא זמינה בתוכנית החינמית של Google. יש להפעיל חיוב (Billing) בפרויקט של מפתח ה-Gemini ב-aistudio.google.com, ואז לנסות שוב.'
          : 'הגעתם למכסת יצירת התמונות ב-Google. נסו שוב מאוחר יותר.'), { status: 429, code: 'quota' });
      }
      throw Object.assign(new Error(`יצירת התמונה נכשלה: ${msg} ${detail}`), { status: 502 });
    }
  }
  return image;
}
