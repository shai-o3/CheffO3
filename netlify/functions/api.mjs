// CheffO3 on Netlify: one function serves the API, uploaded images, the PWA share
// target and the WhatsApp webhook. Data lives in Netlify Blobs:
//   store "cheffo3"         key "state"        → recipes, shopping list, pantry (one JSON document)
//   store "cheffo3-images"  key <ingredient>   → cached product-image lookups
//   store "cheffo3-uploads" key <file name>    → uploaded photos
//   store "cheffo3-wa"      key <phone>        → WhatsApp messages waiting to be grouped
//
// Environment variables (Netlify UI → Site configuration → Environment variables):
//   APP_PASSWORD        password for the app (strongly recommended)
//   ANTHROPIC_API_KEY   enables the AI features
//   WHATSAPP_*          optional bot (see README)

import crypto from 'node:crypto';
import { getStore } from '@netlify/blobs';
import { handle, seedState, emptyState, createRecipe, listShopping, httpError } from '../../server/src/core.js';
import { lookupImage } from '../../server/src/imageProviders.js';
import { cleanWhatsAppText, shoppingListToWhatsApp } from '../../server/src/whatsappFormat.js';
import {
  whatsappConfigured, verifyWebhook, signatureValid, incomingMessages, allowed, sendText, downloadMedia, HELP,
} from '../../server/src/whatsappCloud.js';

// Functions get at most 60 seconds; keep the AI call inside that.
process.env.ANTHROPIC_TIMEOUT_MS ??= '55000';
process.env.ANTHROPIC_MAX_RETRIES ??= '0';
process.env.AI_EFFORT ??= 'low';
const ai = await import('../../server/src/ai.js');

const COOKIE = 'cheffo3_session';
const publicUrl = () => (process.env.APP_PUBLIC_URL || process.env.URL || '').replace(/\/$/, '');

// ------------------------------------------------------------------ storage

const stores = () => ({
  data: getStore({ name: 'cheffo3', consistency: 'strong' }),
  images: getStore('cheffo3-images'),
  uploads: getStore('cheffo3-uploads'),
  wa: getStore({ name: 'cheffo3-wa', consistency: 'strong' }),
});

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

function makeCtx(s) {
  return {
    ai: ai.aiEnabled() ? ai : null,
    whatsappBot: whatsappConfigured(),
    publicUrl: publicUrl(),
    lookupImage,
    images: {
      get: (k) => s.images.get(encodeURIComponent(k), { type: 'json' }),
      set: (k, v) => (v ? s.images.setJSON(encodeURIComponent(k), v) : s.images.delete(encodeURIComponent(k))),
    },
    saveUpload: async (file) => {
      if (!EXT[file.type]) throw httpError(400, 'סוג קובץ לא נתמך – יש להעלות תמונה');
      const key = `${crypto.randomBytes(10).toString('hex')}.${EXT[file.type]}`;
      await s.uploads.set(key, await file.arrayBuffer(), { metadata: { type: file.type } });
      return `/uploads/${key}`;
    },
    fileToBase64: async (file) => Buffer.from(await file.arrayBuffer()).toString('base64'),
  };
}

/** Load the state document, run fn(ctx), and save with optimistic concurrency (retry on conflict). */
export async function withState(s, fn) {
  for (let attempt = 0; attempt < 8; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 20 + Math.random() * 80 * attempt));
    const entry = await s.data.getWithMetadata('state', { type: 'json' });
    const isNew = !entry;
    const state = entry?.data ?? (process.env.SEED === '0' ? emptyState() : seedState());
    const ctx = { ...makeCtx(s), state, dirty: false };
    const result = await fn(ctx);
    if (!ctx.dirty && !isNew) return result;
    const { modified } = await s.data.setJSON('state', state, isNew ? { onlyIfNew: true } : { onlyIfMatch: entry.etag });
    if (modified) return result;
    if (!ctx.dirty) return result; // someone else created the first state meanwhile; our read is still fine
  }
  throw httpError(409, 'השמירה נכשלה בגלל עדכון במקביל. נסו שוב.');
}

// ------------------------------------------------------------------ auth

const sessionToken = () => crypto.createHmac('sha256', process.env.APP_PASSWORD).update('cheffo3-session-v1').digest('hex');

function authorized(req) {
  if (!process.env.APP_PASSWORD) return true;
  const cookie = req.headers.get('cookie') || '';
  const value = cookie.split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1) || '';
  const a = Buffer.from(value);
  const b = Buffer.from(sessionToken());
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function login(req) {
  const { password } = await req.json().catch(() => ({}));
  const a = crypto.createHash('sha256').update(String(password || '')).digest();
  const b = crypto.createHash('sha256').update(process.env.APP_PASSWORD || '').digest();
  if (!process.env.APP_PASSWORD || !crypto.timingSafeEqual(a, b)) {
    await new Promise((r) => setTimeout(r, 800)); // slow down guessing
    return Response.json({ error: 'סיסמה שגויה' }, { status: 401 });
  }
  return Response.json({ ok: true }, {
    headers: { 'Set-Cookie': `${COOKIE}=${sessionToken()}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000` },
  });
}

// ------------------------------------------------------------------ WhatsApp bot

const BURST_MS = 5000;

async function whatsappWebhook(req, context, s) {
  const raw = await req.text();
  if (!signatureValid(raw, req.headers.get('x-hub-signature-256'))) return new Response('bad signature', { status: 401 });
  if (!whatsappConfigured()) return new Response('ok');
  let body;
  try { body = JSON.parse(raw); } catch { return new Response('ok'); }

  for (const msg of incomingMessages(body)) {
    const from = msg.from;
    if (!allowed(from)) continue;
    const text = msg.text?.body?.trim() || '';
    if (msg.type === 'text' && /^(רשימה|רשימת קניות|קניות)$/.test(text)) {
      context.waitUntil(withState(s, (ctx) => listShopping(ctx.state))
        .then((items) => sendText(from, shoppingListToWhatsApp(items))).catch(console.error));
      continue;
    }
    if (msg.type === 'text' && /^(עזרה|help|היי|שלום|hi)$/i.test(text)) {
      context.waitUntil(sendText(from, HELP).catch(console.error));
      continue;
    }
    const media = msg.image || (msg.type === 'document' && /^image\//.test(msg.document?.mime_type || '') ? msg.document : null);
    const part = { text: msg.type === 'text' ? text : media?.caption || '', mediaId: media?.id || null };
    if (!part.text && !part.mediaId) continue;
    context.waitUntil(queueAndProcess(s, from, part, msg.id).catch(console.error));
  }
  return new Response('ok');
}

/** Collect messages that arrive together (album + caption) and turn them into one recipe. */
async function queueAndProcess(s, from, part, stamp) {
  for (let i = 0; i < 5; i++) {
    const entry = await s.wa.getWithMetadata(from, { type: 'json' });
    const pending = entry?.data || { texts: [], mediaIds: [] };
    if (part.text) pending.texts.push(part.text);
    if (part.mediaId) pending.mediaIds.push(part.mediaId);
    pending.last = stamp;
    const { modified } = await s.wa.setJSON(from, pending, entry ? { onlyIfMatch: entry.etag } : { onlyIfNew: true });
    if (modified) break;
  }
  await new Promise((r) => setTimeout(r, BURST_MS));
  const latest = await s.wa.get(from, { type: 'json' });
  if (!latest || latest.last !== stamp) return; // a newer message will handle the batch
  await s.wa.delete(from);

  try {
    await sendText(from, '⏳ קיבלתי! מפענח את המתכון...');
    if (!ai.aiEnabled()) throw new Error('ה-AI לא מוגדר בשרת (ANTHROPIC_API_KEY)');
    const images = [];
    for (const id of latest.mediaIds.slice(0, 5)) images.push(await downloadMedia(id));
    const parsed = await ai.extractRecipe({ text: cleanWhatsAppText(latest.texts.join('\n\n')), images });
    let image = null;
    if (images[0]) {
      const ctx = makeCtx(s);
      const bytes = Buffer.from(images[0].data, 'base64');
      image = await ctx.saveUpload(new File([bytes], 'wa', { type: images[0].media_type })).catch(() => null);
    }
    const recipe = await withState(s, (ctx) => {
      ctx.dirty = true;
      return createRecipe(ctx.state, { ...parsed, image, source: 'WhatsApp' });
    });
    await sendText(from, `✅ המתכון "${recipe.title}" נשמר (${recipe.ingredients.length} מצרכים, ${recipe.steps.length} שלבים).\n${publicUrl()}/recipes/${recipe.id}`);
  } catch (e) {
    await sendText(from, `😕 לא הצלחתי לשמור את המתכון: ${e.message}`).catch(() => {});
  }
}

// ------------------------------------------------------------------ entry point

async function readBody(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined;
  const type = req.headers.get('content-type') || '';
  if (type.includes('multipart/form-data') || type.includes('application/x-www-form-urlencoded')) return req.formData();
  const text = await req.text();
  return text ? JSON.parse(text) : {};
}

export default async (req, context) => {
  const url = new URL(req.url);
  const s = stores();
  try {
    // Uploaded images are public (random, unguessable names) so <img> tags work everywhere.
    if (url.pathname.startsWith('/uploads/') && req.method === 'GET') {
      const entry = await s.uploads.getWithMetadata(decodeURIComponent(url.pathname.slice(9)), { type: 'arrayBuffer' });
      if (!entry) return new Response('Not found', { status: 404 });
      return new Response(entry.data, { headers: { 'Content-Type': entry.metadata?.type || 'image/jpeg', 'Cache-Control': 'public, max-age=31536000, immutable' } });
    }

    if (url.pathname === '/api/whatsapp/webhook') {
      if (req.method === 'GET') {
        const challenge = verifyWebhook(Object.fromEntries(url.searchParams));
        return challenge == null ? new Response('forbidden', { status: 403 }) : new Response(challenge);
      }
      return whatsappWebhook(req, context, s);
    }
    if (url.pathname === '/api/login' && req.method === 'POST') return login(req);
    if (url.pathname === '/api/session') return Response.json({ passwordRequired: !!process.env.APP_PASSWORD, loggedIn: authorized(req) });

    if (!authorized(req)) {
      if (url.pathname === '/share-target') return Response.redirect(new URL('/', url), 303);
      return Response.json({ error: 'נדרשת התחברות', auth: true }, { status: 401 });
    }

    // Web Share Target: sharing from WhatsApp / gallery on Android posts here.
    if (url.pathname === '/share-target' && req.method === 'POST') {
      const form = await req.formData();
      const ctx = makeCtx(s);
      const imgs = [];
      for (const f of form.getAll('images')) if (typeof f !== 'string' && EXT[f.type]) imgs.push(await ctx.saveUpload(f));
      const params = new URLSearchParams({ text: ['title', 'text', 'url'].map((k) => form.get(k)).filter(Boolean).join('\n') });
      if (imgs.length) params.set('images', imgs.join(','));
      return Response.redirect(new URL(`/add?${params}`, url), 303);
    }

    const body = await readBody(req);
    const data = await withState(s, (ctx) => handle(ctx, req.method, url.pathname.slice(4), url.searchParams, body));
    if (data === null) return new Response(null, { status: 204 });
    return Response.json(data, { status: req.method === 'POST' && url.pathname === '/api/recipes' ? 201 : 200 });
  } catch (e) {
    const status = e.status && e.status < 600 ? e.status : 500;
    if (status >= 500) console.error(e);
    return Response.json({ error: status >= 500 && !e.status ? 'שגיאת שרת' : e.message }, { status });
  }
};

export const config = {
  path: ['/api/*', '/uploads/*', '/share-target'],
};
