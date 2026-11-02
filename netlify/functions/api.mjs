// CheffO3 on Netlify: one function serves the API, accounts, uploaded images, the PWA
// share target and the WhatsApp webhook. Data lives in Netlify Blobs:
//   store "cheffo3"         key "state-<userId>"  → that user's recipes, shopping list, pantry
//   store "cheffo3-users"   key "user/<email>"    → account; "phone/<digits>" → userId;
//                           key "meta/session-secret" → generated signing key for sessions
//   store "cheffo3-images"  key <ingredient>      → cached product-image lookups (shared)
//   store "cheffo3-uploads" key <file name>       → uploaded photos
//   store "cheffo3-wa"      key <phone>           → WhatsApp messages waiting to be grouped
//
// Environment variables (Netlify UI → Project configuration → Environment variables):
//   ANTHROPIC_API_KEY   enables the AI features
//   GEMINI_API_KEY      enables AI dish photos (Google AI Studio)
//   GOOGLE_CLIENT_ID    enables "Sign in with Google" (see README)
//   ALLOWED_EMAILS      optional: who may register, e.g. "@example.com,friend@gmail.com"
//   SESSION_SECRET      optional: session signing key (generated automatically otherwise)
//   WHATSAPP_*          optional bot (see README)

import crypto from 'node:crypto';
import { getStore } from '@netlify/blobs';
import { handle, seedState, emptyState, createRecipe, listShopping, httpError } from '../../server/src/core.js';
import { lookupImage } from '../../server/src/imageProviders.js';
import { imageGenEnabled, generateDishImage, dishKey } from '../../server/src/imageGen.js';
import { ensureTagged } from '../../server/src/tagging.js';
import { cleanWhatsAppText, shoppingListToWhatsApp } from '../../server/src/whatsappFormat.js';
import {
  whatsappConfigured, verifyWebhook, signatureValid, incomingMessages, sendText, downloadMedia, HELP,
} from '../../server/src/whatsappCloud.js';
import {
  hashPassword, verifyPassword, passwordProblem, normalizeEmail, validEmail, signSession, verifySession,
  readCookie, verifyGoogleIdToken, emailAllowed,
} from '../../server/src/auth.js';

// Functions get at most 60 seconds; keep the AI call inside that.
process.env.ANTHROPIC_TIMEOUT_MS ??= '55000';
process.env.ANTHROPIC_MAX_RETRIES ??= '0';
process.env.AI_EFFORT ??= 'low';
const ai = await import('../../server/src/ai.js');

const COOKIE = 'cheffo3_session';
const publicUrl = () => (process.env.APP_PUBLIC_URL || process.env.URL || '').replace(/\/$/, '');

// ------------------------------------------------------------------ storage

export const stores = () => ({
  data: getStore({ name: 'cheffo3', consistency: 'strong' }),
  users: getStore({ name: 'cheffo3-users', consistency: 'strong' }),
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
    generateImage: imageGenEnabled() ? generateDishImage : null,
    dishKey,
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

/**
 * Load a user's state document, run fn(ctx), and save it with optimistic concurrency
 * (retry on conflict). `s.data` needs getWithMetadata/setJSON.
 */
export async function withState(s, userId, fn) {
  const key = `state-${userId}`;
  for (let attempt = 0; attempt < 8; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 20 + Math.random() * 80 * attempt));
    const entry = await s.data.getWithMetadata(key, { type: 'json' });
    const isNew = !entry;
    const state = entry?.data ?? (process.env.SEED === '0' ? emptyState() : seedState());
    // One-time automatic tagging of recipes saved before tags existed (per TAGS_VERSION).
    const retagged = ensureTagged(state);
    const ctx = { ...makeCtx(s), state, dirty: false };
    const result = await fn(ctx);
    if (!ctx.dirty && !isNew && !retagged) return result;
    const { modified } = await s.data.setJSON(key, state, isNew ? { onlyIfNew: true } : { onlyIfMatch: entry.etag });
    if (modified) return result;
    if (!ctx.dirty) return result; // first state was created concurrently; our read is still valid
  }
  throw httpError(409, 'השמירה נכשלה בגלל עדכון במקביל. נסו שוב.');
}

// ------------------------------------------------------------------ accounts

let cachedSecret;
async function sessionSecret(s) {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (cachedSecret) return cachedSecret;
  await s.users.setJSON('meta/session-secret', { secret: crypto.randomBytes(32).toString('hex') }, { onlyIfNew: true });
  cachedSecret = (await s.users.get('meta/session-secret', { type: 'json' })).secret;
  return cachedSecret;
}

const userKey = (email) => `user/${encodeURIComponent(email)}`;
// Profile picture: an uploaded photo wins over the Google photo.
const publicUser = (u) => ({
  id: u.id, email: u.email, name: u.name, phone: u.phone || '',
  picture: u.uploadedPicture || u.googlePicture || u.picture || '',
  hasUploadedPicture: !!u.uploadedPicture,
  googleLinked: !!u.googleSub,
  hasPassword: !!u.passwordHash,
});
const googleKey = (sub) => `google/${sub}`;
const saveUser = (s, u) => s.users.setJSON(userKey(u.email), u);

async function verifyGoogle(credential) {
  if (!process.env.GOOGLE_CLIENT_ID) throw httpError(400, 'כניסה עם Google לא הוגדרה');
  try {
    return await verifyGoogleIdToken(credential, process.env.GOOGLE_CLIENT_ID);
  } catch (e) {
    console.error('google sign-in', e.message);
    await new Promise((r) => setTimeout(r, 700));
    throw httpError(401, 'הכניסה עם Google נכשלה. נסו שוב.');
  }
}

/** Attach a Google identity to an account and refresh its Google photo. */
async function linkGoogle(s, account, claims) {
  await s.users.setJSON(googleKey(claims.sub), { email: account.email });
  const next = { ...account, googleSub: claims.sub, googlePicture: claims.picture || account.googlePicture || '' };
  if (!next.name && claims.name) next.name = claims.name;
  if (JSON.stringify(next) !== JSON.stringify(account)) await saveUser(s, next);
  return next;
}

/** Israeli/international phone → digits as WhatsApp sends them (e.g. 972501234567). */
export const normalizePhone = (p) => {
  const d = String(p || '').replace(/\D/g, '');
  return d.startsWith('0') ? `972${d.slice(1)}` : d;
};

async function sessionCookie(s, user) {
  const token = signSession({ uid: user.id, email: user.email }, await sessionSecret(s));
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${60 * 86400}`;
}

/** The logged-in user, or null. */
async function currentUser(req, s) {
  const payload = verifySession(readCookie(req.headers.get('cookie'), COOKIE), await sessionSecret(s));
  if (!payload) return null;
  const user = await s.users.get(userKey(payload.email), { type: 'json' });
  return user && user.id === payload.uid ? user : null;
}

/**
 * Create an account. The very first account inherits the data saved before accounts
 * existed (the old single "state" document), so nothing is lost on upgrade.
 */
async function createUser(s, fields) {
  const existing = await s.users.list({ prefix: 'user/' });
  const isFirst = existing.blobs.length === 0;
  const user = { id: crypto.randomUUID(), created_at: new Date().toISOString(), phone: '', ...fields };
  const { modified } = await s.users.setJSON(userKey(user.email), user, { onlyIfNew: true });
  if (!modified) throw httpError(409, 'כבר קיים חשבון עם האימייל הזה');
  if (isFirst) {
    const legacy = await s.data.get('state', { type: 'json' });
    if (legacy) await s.data.setJSON(`state-${user.id}`, legacy, { onlyIfNew: true });
  }
  return user;
}

const json = (data, init = {}) => Response.json(data, init);
const slowFail = async (message, status = 401) => {
  await new Promise((r) => setTimeout(r, 700)); // slow down password guessing
  return json({ error: message }, { status });
};

async function authRoutes(req, url, s, user) {
  const p = url.pathname;

  if (p === '/api/session') {
    return json({
      authRequired: true,
      user: user && publicUser(user),
      googleClientId: process.env.GOOGLE_CLIENT_ID || null,
      signupRestricted: !!process.env.ALLOWED_EMAILS,
    });
  }

  if (p === '/api/auth/register' && req.method === 'POST') {
    const { email: rawEmail, password, name } = await req.json().catch(() => ({}));
    const email = normalizeEmail(rawEmail);
    if (!validEmail(email)) return json({ error: 'כתובת אימייל לא תקינה' }, { status: 400 });
    const problem = passwordProblem(password);
    if (problem) return json({ error: problem }, { status: 400 });
    if (!emailAllowed(email)) return json({ error: 'ההרשמה לאפליקציה מוגבלת. פנו למנהל האפליקציה.' }, { status: 403 });
    const created = await createUser(s, { email, name: String(name || '').trim() || email.split('@')[0], passwordHash: hashPassword(password) });
    return json({ user: publicUser(created) }, { status: 201, headers: { 'Set-Cookie': await sessionCookie(s, created) } });
  }

  if (p === '/api/auth/login' && req.method === 'POST') {
    const { email: rawEmail, password } = await req.json().catch(() => ({}));
    const found = await s.users.get(userKey(normalizeEmail(rawEmail)), { type: 'json' });
    if (!found?.passwordHash) {
      return slowFail(found?.googleSub ? 'החשבון הזה נוצר עם Google. היכנסו עם "המשך עם Google".' : 'אימייל או סיסמה שגויים');
    }
    if (!verifyPassword(password, found.passwordHash)) return slowFail('אימייל או סיסמה שגויים');
    return json({ user: publicUser(found) }, { headers: { 'Set-Cookie': await sessionCookie(s, found) } });
  }

  if (p === '/api/auth/google' && req.method === 'POST') {
    const { credential } = await req.json().catch(() => ({}));
    const claims = await verifyGoogle(credential);
    // Find the account: first by the linked Google identity, then by email.
    const link = await s.users.get(googleKey(claims.sub), { type: 'json' });
    const email = link?.email || normalizeEmail(claims.email);
    let account = await s.users.get(userKey(email), { type: 'json' });
    if (account) {
      if (account.googleSub && account.googleSub !== claims.sub) return slowFail('חשבון Google אחר כבר מקושר לאימייל הזה');
      account = await linkGoogle(s, account, claims);
    } else {
      if (!emailAllowed(email)) return json({ error: 'ההרשמה לאפליקציה מוגבלת. פנו למנהל האפליקציה.' }, { status: 403 });
      account = await createUser(s, { email, name: claims.name || email.split('@')[0] });
      account = await linkGoogle(s, account, claims);
    }
    return json({ user: publicUser(account) }, { headers: { 'Set-Cookie': await sessionCookie(s, account) } });
  }

  // Connect a Google account to the logged-in user (also brings in the Google photo).
  if (p === '/api/me/google' && req.method === 'POST' && user) {
    const { credential } = await req.json().catch(() => ({}));
    const claims = await verifyGoogle(credential);
    const link = await s.users.get(googleKey(claims.sub), { type: 'json' });
    if (link && link.email !== user.email) return json({ error: 'חשבון ה-Google הזה כבר מחובר למשתמש אחר' }, { status: 409 });
    if (user.googleSub && user.googleSub !== claims.sub) await s.users.delete(googleKey(user.googleSub));
    return json(publicUser(await linkGoogle(s, user, claims)));
  }

  if (p === '/api/me/picture' && user) {
    if (req.method === 'POST') {
      const form = await req.formData();
      const file = form.get('image');
      if (!file || typeof file === 'string') return json({ error: 'יש להעלות קובץ תמונה' }, { status: 400 });
      const next = { ...user, uploadedPicture: await makeCtx(s).saveUpload(file) };
      await saveUser(s, next);
      return json(publicUser(next));
    }
    if (req.method === 'DELETE') {
      const { uploadedPicture: _removed, ...next } = user;
      await saveUser(s, next);
      return json(publicUser(next));
    }
  }

  if (p === '/api/auth/logout' && req.method === 'POST') {
    return json({ ok: true }, { headers: { 'Set-Cookie': `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0` } });
  }

  if (p === '/api/me' && user) {
    if (req.method === 'GET') return json(publicUser(user));
    if (req.method === 'PUT') {
      const body = await req.json().catch(() => ({}));
      const next = { ...user };
      if (typeof body.name === 'string' && body.name.trim()) next.name = body.name.trim().slice(0, 60);
      if (typeof body.phone === 'string') {
        const phone = body.phone.trim() ? normalizePhone(body.phone) : '';
        if (phone && !/^\d{9,15}$/.test(phone)) return json({ error: 'מספר טלפון לא תקין' }, { status: 400 });
        if (phone !== (user.phone || '')) {
          if (phone) {
            const owner = await s.users.get(`phone/${phone}`, { type: 'json' });
            if (owner && owner.userId !== user.id) return json({ error: 'המספר כבר מקושר לחשבון אחר' }, { status: 409 });
            await s.users.setJSON(`phone/${phone}`, { userId: user.id, email: user.email });
          }
          if (user.phone) await s.users.delete(`phone/${user.phone}`);
          next.phone = phone;
        }
      }
      await s.users.setJSON(userKey(user.email), next);
      return json(publicUser(next));
    }
  }

  if (p === '/api/me/password' && req.method === 'POST' && user) {
    const { current, next } = await req.json().catch(() => ({}));
    if (user.passwordHash && !verifyPassword(current, user.passwordHash)) return slowFail('הסיסמה הנוכחית שגויה', 400);
    const problem = passwordProblem(next);
    if (problem) return json({ error: problem }, { status: 400 });
    await s.users.setJSON(userKey(user.email), { ...user, passwordHash: hashPassword(next) });
    return json({ ok: true });
  }

  return null;
}

// ------------------------------------------------------------------ WhatsApp bot

const BURST_MS = 5000;

async function userByPhone(s, phone) {
  const link = await s.users.get(`phone/${normalizePhone(phone)}`, { type: 'json' });
  return link ? s.users.get(userKey(link.email), { type: 'json' }) : null;
}

async function whatsappWebhook(req, context, s) {
  const raw = await req.text();
  if (!signatureValid(raw, req.headers.get('x-hub-signature-256'))) return new Response('bad signature', { status: 401 });
  if (!whatsappConfigured()) return new Response('ok');
  let body;
  try { body = JSON.parse(raw); } catch { return new Response('ok'); }

  for (const msg of incomingMessages(body)) {
    const from = msg.from;
    context.waitUntil((async () => {
      const user = await userByPhone(s, from);
      if (!user) {
        await sendText(from, `👋 המספר הזה לא מקושר לחשבון CheffO3.\nכדי לשמור מתכונים מוואטסאפ, היכנסו לאפליקציה (${publicUrl()}) ← לחיצה על השם שלכם ← הגדרות, והוסיפו את מספר הטלפון.`);
        return;
      }
      const text = msg.text?.body?.trim() || '';
      if (msg.type === 'text' && /^(רשימה|רשימת קניות|קניות)$/.test(text)) {
        const items = await withState(s, user.id, (ctx) => listShopping(ctx.state));
        await sendText(from, shoppingListToWhatsApp(items));
        return;
      }
      if (msg.type === 'text' && /^(עזרה|help|היי|שלום|hi)$/i.test(text)) {
        await sendText(from, HELP);
        return;
      }
      const media = msg.image || (msg.type === 'document' && /^image\//.test(msg.document?.mime_type || '') ? msg.document : null);
      const part = { text: msg.type === 'text' ? text : media?.caption || '', mediaId: media?.id || null };
      if (!part.text && !part.mediaId) return;
      await queueAndProcess(s, user, from, part, msg.id);
    })().catch(console.error));
  }
  return new Response('ok');
}

/** Collect messages that arrive together (album + caption) and turn them into one recipe. */
async function queueAndProcess(s, user, from, part, stamp) {
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
      const bytes = Buffer.from(images[0].data, 'base64');
      image = await makeCtx(s).saveUpload(new File([bytes], 'wa', { type: images[0].media_type })).catch(() => null);
    }
    const recipe = await withState(s, user.id, (ctx) => {
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

    const user = await currentUser(req, s);
    const authResponse = await authRoutes(req, url, s, user);
    if (authResponse) return authResponse;

    if (!user) {
      if (url.pathname === '/share-target') return Response.redirect(new URL('/', url), 303);
      return json({ error: 'נדרשת התחברות', auth: true }, { status: 401 });
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
    const data = await withState(s, user.id, (ctx) => handle(ctx, req.method, url.pathname.slice(4), url.searchParams, body));
    if (data === null) return new Response(null, { status: 204 });
    return json(data, { status: req.method === 'POST' && url.pathname === '/api/recipes' ? 201 : 200 });
  } catch (e) {
    const status = e.status && e.status < 600 ? e.status : 500;
    if (status >= 500) console.error(e);
    return json({ error: status >= 500 && !e.status ? 'שגיאת שרת' : e.message }, { status });
  }
};

export const config = {
  path: ['/api/*', '/uploads/*', '/share-target'],
};
