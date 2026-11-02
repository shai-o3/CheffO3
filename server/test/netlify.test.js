// Runs the Netlify function (netlify/functions/api.mjs) against a local Netlify Blobs
// server, a fake Anthropic API and a fake Google key endpoint.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BlobsServer } from '@netlify/blobs/server';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cheffo3-netlify-'));
const ORIGIN = 'https://cheffo3.example';
const GOOGLE_CLIENT_ID = 'test-client.apps.googleusercontent.com';
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
let blobs;
let fakeApi;
let fn;
let lastAiRequest;

before(async () => {
  blobs = new BlobsServer({ directory: tmp, token: 'tok', port: 0 });
  const { port } = await blobs.start();
  const url = `http://127.0.0.1:${port}`;
  process.env.NETLIFY_BLOBS_CONTEXT = Buffer.from(JSON.stringify({ siteID: 'site', token: 'tok', edgeURL: url, uncachedEdgeURL: url })).toString('base64');

  fakeApi = http.createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url.startsWith('/certs')) {
      res.end(JSON.stringify({ keys: [{ ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' }] }));
      return;
    }
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      lastAiRequest = JSON.parse(body);
      res.end(JSON.stringify({
        id: 'msg', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'end_turn', stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1 },
        content: [{ type: 'text', text: JSON.stringify({
          is_recipe: true, title: 'מרק עגבניות', description: '', emoji: '🍅', category: 'מרקים', cuisine: '', prep_minutes: 10,
          cook_minutes: 30, servings: 4, difficulty: 'קל', tags: [], notes: '',
          ingredients: [{ section: '', name: 'עגבניות', quantity: 6, unit: '', note: '', category: 'ירקות ופירות', search_term: 'עגבניות', emoji: '🍅' }],
          steps: [{ text: 'מבשלים.', tip: '', minutes: 30 }],
        }) }],
      }));
    });
  });
  await new Promise((r) => fakeApi.listen(0, r));
  const fakeUrl = `http://127.0.0.1:${fakeApi.address().port}`;
  process.env.ANTHROPIC_BASE_URL = fakeUrl;
  process.env.ANTHROPIC_API_KEY = 'test';
  process.env.GOOGLE_CLIENT_ID = GOOGLE_CLIENT_ID;
  process.env.GOOGLE_JWKS_URL = `${fakeUrl}/certs`;
  process.env.IMAGE_PROVIDERS = 'none';
  fn = (await import('../../netlify/functions/api.mjs')).default;
});
after(async () => { await blobs.stop(); fakeApi.close(); });

const context = { waitUntil: () => {} };

/** A browser-like client with its own cookie jar. */
function client() {
  const jar = { value: '' };
  return async function call(method, p, body, { form } = {}) {
    const headers = { cookie: jar.value };
    let payload;
    if (form) payload = form;
    else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
    const res = await fn(new Request(ORIGIN + p, { method, headers, body: payload }), context);
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) jar.value = setCookie.split(';')[0];
    const type = res.headers.get('content-type') || '';
    return { status: res.status, headers: res.headers, data: type.includes('json') ? await res.json() : await res.text() };
  };
}

function googleToken(claims) {
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const head = enc({ alg: 'RS256', kid: 'k1', typ: 'JWT' });
  const body = enc({ iss: 'https://accounts.google.com', aud: GOOGLE_CLIENT_ID, exp: Math.floor(Date.now() / 1000) + 600, email_verified: true, ...claims });
  const sig = crypto.sign('RSA-SHA256', Buffer.from(`${head}.${body}`), privateKey).toString('base64url');
  return `${head}.${body}.${sig}`;
}

const dana = client();
const yossi = client();

test('first account inherits data saved before accounts existed', async () => {
  const { stores } = await import('../../netlify/functions/api.mjs');
  await stores().data.setJSON('state', { seq: 100, recipes: [{ id: 1, title: 'מתכון ישן', ingredients: [], steps: [], tags: [], favorite: false, updated_at: '2026-01-01' }], shopping: [], pantry: [] });

  const anon = await dana('GET', '/api/recipes');
  assert.equal(anon.status, 401);
  assert.equal(anon.data.auth, true);

  const s = await dana('GET', '/api/session');
  assert.equal(s.data.user, null);
  assert.equal(s.data.googleClientId, GOOGLE_CLIENT_ID);

  assert.equal((await dana('POST', '/api/auth/register', { email: 'dana@example.com', password: 'short' })).status, 400);
  const reg = await dana('POST', '/api/auth/register', { name: 'דנה', email: 'Dana@Example.com', password: 'secret-pass-1' });
  assert.equal(reg.status, 201, JSON.stringify(reg.data));
  assert.equal(reg.data.user.email, 'dana@example.com');
  const list = await dana('GET', '/api/recipes');
  assert.deepEqual(list.data.map((r) => r.title), ['מתכון ישן']);
});

test('each user has separate recipes', async () => {
  const reg = await yossi('POST', '/api/auth/register', { name: 'יוסי', email: 'yossi@example.com', password: 'another-pass' });
  assert.equal(reg.status, 201);
  const mine = await yossi('GET', '/api/recipes');
  assert.equal(mine.data.length, 6, 'new users start with the sample recipes');
  await yossi('POST', '/api/recipes', { title: 'הפסטה של יוסי', ingredients: [{ name: 'פסטה' }], steps: ['מבשלים'] });
  const danas = await dana('GET', '/api/recipes');
  assert.ok(!danas.data.some((r) => r.title === 'הפסטה של יוסי'));
  assert.equal((await yossi('POST', '/api/auth/register', { email: 'dana@example.com', password: 'whatever-123' })).status, 409);
});

test('login, wrong password, logout', async () => {
  const c = client();
  assert.equal((await c('POST', '/api/auth/login', { email: 'yossi@example.com', password: 'nope-nope' })).status, 401);
  const ok = await c('POST', '/api/auth/login', { email: 'YOSSI@example.com', password: 'another-pass' });
  assert.equal(ok.status, 200);
  assert.ok((await c('GET', '/api/recipes')).data.some((r) => r.title === 'הפסטה של יוסי'));
  await c('POST', '/api/auth/logout', {});
  assert.equal((await c('GET', '/api/recipes')).status, 401);
});

test('tampered session cookie is rejected', async () => {
  const res = await fn(new Request(`${ORIGIN}/api/recipes`, { headers: { cookie: 'cheffo3_session=eyJ1aWQiOiJ4In0.forged' } }), context);
  assert.equal(res.status, 401);
});

test('Google sign-in creates an account and links to an existing email', async () => {
  const g = client();
  const res = await g('POST', '/api/auth/google', { credential: googleToken({ sub: 'g-1', email: 'new@gmail.com', name: 'Noa' }) });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.equal(res.data.user.name, 'Noa');
  assert.equal((await g('GET', '/api/recipes')).status, 200);

  const link = client();
  const linked = await link('POST', '/api/auth/google', { credential: googleToken({ sub: 'g-2', email: 'dana@example.com', name: 'Dana G' }) });
  assert.equal(linked.status, 200);
  assert.ok((await link('GET', '/api/recipes')).data.some((r) => r.title === 'מתכון ישן'), 'same account as password login');

  const bad = client();
  assert.equal((await bad('POST', '/api/auth/google', { credential: googleToken({ sub: 'g-3', email: 'x@gmail.com', aud: 'someone-else' }) })).status, 401);
});

test('ALLOWED_EMAILS restricts registration', async () => {
  process.env.ALLOWED_EMAILS = '@family.co.il,friend@gmail.com';
  try {
    const c = client();
    assert.equal((await c('POST', '/api/auth/register', { email: 'stranger@gmail.com', password: '12345678' })).status, 403);
    assert.equal((await c('POST', '/api/auth/register', { email: 'mom@family.co.il', password: '12345678' })).status, 201);
  } finally {
    delete process.env.ALLOWED_EMAILS;
  }
});

test('profile: WhatsApp phone is unique per account', async () => {
  const r = await dana('PUT', '/api/me', { phone: '050-1234567' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.phone, '972501234567');
  assert.equal((await yossi('PUT', '/api/me', { phone: '+972 50 123 4567' })).status, 409);
  assert.equal((await dana('POST', '/api/me/password', { current: 'wrong', next: 'new-password-1' })).status, 400);
  assert.equal((await dana('POST', '/api/me/password', { current: 'secret-pass-1', next: 'new-password-1' })).status, 200);
});

test('parallel updates are not lost (conditional writes + retry)', async () => {
  // The local Blobs test server doesn't return etags on read, so use an in-memory store that does.
  const { withState } = await import('../../netlify/functions/api.mjs');
  const { handle } = await import('../src/core.js');
  let doc = null;
  let version = 0;
  const data = {
    async getWithMetadata() {
      await new Promise((r) => setTimeout(r, Math.random() * 5));
      return doc && { data: JSON.parse(doc), etag: String(version) };
    },
    async setJSON(_key, value, opts) {
      await new Promise((r) => setTimeout(r, Math.random() * 5));
      if (opts.onlyIfNew && doc) return { modified: false };
      if (opts.onlyIfMatch && opts.onlyIfMatch !== String(version)) return { modified: false };
      doc = JSON.stringify(value);
      version++;
      return { modified: true };
    },
  };
  const names = ['חלב', 'לחם', 'ביצים', 'גבינה', 'עגבניות'];
  await Promise.all(names.map((name) => withState({ data }, 'u1', (ctx) => handle(ctx, 'POST', '/shopping', new URLSearchParams(), { name }))));
  assert.deepEqual(JSON.parse(doc).shopping.map((i) => i.name).sort(), [...names].sort());
});

test('image upload is stored and served', async () => {
  const form = new FormData();
  form.append('image', new Blob([Buffer.from('fakejpeg')], { type: 'image/jpeg' }), 'a.jpg');
  const r = await dana('POST', '/api/recipes/1/image', undefined, { form });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.match(r.data.image, /^\/uploads\/[0-9a-f]+\.jpg$/);
  const img = await client()('GET', r.data.image);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('content-type'), 'image/jpeg');
});

test('AI extraction works through the function', async () => {
  const form = new FormData();
  form.append('text', 'מרק עגבניות פשוט');
  const r = await dana('POST', '/api/ai/extract', undefined, { form });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.title, 'מרק עגבניות');
  assert.equal(lastAiRequest.output_config.effort, 'low');
});

test('WhatsApp webhook verification works without login', async () => {
  process.env.WHATSAPP_VERIFY_TOKEN = 'vt';
  const r = await client()('GET', '/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=vt&hub.challenge=77');
  assert.equal(r.data, '77');
});

test('packages used by the function resolve from the repo root (as Netlify packs it)', async () => {
  // Netlify traces the function from netlify/functions and only ships packages it can
  // resolve from there, i.e. from the root node_modules, not server/node_modules.
  const { createRequire } = await import('node:module');
  const fnDir = new URL('../../netlify/functions/', import.meta.url);
  const req = createRequire(new URL('api.mjs', fnDir));
  for (const pkg of ['@anthropic-ai/sdk', 'zod', '@netlify/blobs']) {
    const resolved = req.resolve(pkg);
    assert.ok(!resolved.includes('/server/node_modules/'), `${pkg} must be a root dependency (resolved to ${resolved})`);
  }
});
