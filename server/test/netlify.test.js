// Runs the Netlify function (netlify/functions/api.mjs) against a local Netlify Blobs
// server and a fake Anthropic API.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BlobsServer } from '@netlify/blobs/server';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cheffo3-netlify-'));
let blobs;
let fakeApi;
let fn;
let lastAiRequest;
const cookieJar = { value: '' };
const ORIGIN = 'https://cheffo3.example';

before(async () => {
  blobs = new BlobsServer({ directory: tmp, token: 'tok', port: 0 });
  const { port } = await blobs.start();
  const url = `http://127.0.0.1:${port}`;
  process.env.NETLIFY_BLOBS_CONTEXT = Buffer.from(JSON.stringify({ siteID: 'site', token: 'tok', edgeURL: url, uncachedEdgeURL: url })).toString('base64');

  fakeApi = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      lastAiRequest = JSON.parse(body);
      res.setHeader('content-type', 'application/json');
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
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${fakeApi.address().port}`;
  process.env.ANTHROPIC_API_KEY = 'test';
  process.env.APP_PASSWORD = 'סיסמה-סודית';
  process.env.IMAGE_PROVIDERS = 'none';
  fn = (await import('../../netlify/functions/api.mjs')).default;
});
after(async () => { await blobs.stop(); fakeApi.close(); });

const pending = [];
const context = { waitUntil: (p) => pending.push(p) };

async function call(method, p, body, { form, raw } = {}) {
  const headers = { cookie: cookieJar.value };
  let payload;
  if (form) payload = form;
  else if (raw !== undefined) payload = raw;
  else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fn(new Request(ORIGIN + p, { method, headers, body: payload }), context);
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookieJar.value = setCookie.split(';')[0];
  const type = res.headers.get('content-type') || '';
  return { status: res.status, headers: res.headers, data: type.includes('json') ? await res.json() : await res.text() };
}

test('requires the password', async () => {
  const r = await call('GET', '/api/recipes');
  assert.equal(r.status, 401);
  assert.equal(r.data.auth, true);
  assert.equal((await call('POST', '/api/login', { password: 'wrong' })).status, 401);
  const ok = await call('POST', '/api/login', { password: 'סיסמה-סודית' });
  assert.equal(ok.status, 200);
  assert.match(cookieJar.value, /^cheffo3_session=/);
});

test('seeds sample recipes and serves the API from Blobs', async () => {
  const list = await call('GET', '/api/recipes');
  assert.equal(list.status, 200);
  assert.equal(list.data.length, 6);
  const created = await call('POST', '/api/recipes', { title: 'פנקייק', ingredients: [{ name: 'קמח', quantity: 1, unit: 'כוס' }], steps: ['מערבבים'] });
  assert.equal(created.status, 201);
  const again = await call('GET', `/api/recipes/${created.data.id}`);
  assert.equal(again.data.title, 'פנקייק');
  assert.equal(again.data.ingredients[0].category, 'קמח ואפייה');
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
  const s = { data, images: null, uploads: null };
  const names = ['חלב', 'לחם', 'ביצים', 'גבינה', 'עגבניות'];
  await Promise.all(names.map((name) => withState(s, (ctx) => handle(ctx, 'POST', '/shopping', new URLSearchParams(), { name }))));
  const items = JSON.parse(doc).shopping.map((i) => i.name).sort();
  assert.deepEqual(items, [...names].sort());
});

test('image upload is stored and served', async () => {
  const form = new FormData();
  form.append('image', new Blob([Buffer.from('fakejpeg')], { type: 'image/jpeg' }), 'a.jpg');
  const r = await call('POST', '/api/recipes/1/image', undefined, { form });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.match(r.data.image, /^\/uploads\/[0-9a-f]+\.jpg$/);
  const img = await call('GET', r.data.image);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('content-type'), 'image/jpeg');
});

test('AI extraction works through the function', async () => {
  const form = new FormData();
  form.append('text', 'מרק עגבניות פשוט');
  const r = await call('POST', '/api/ai/extract', undefined, { form });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.title, 'מרק עגבניות');
  assert.equal(lastAiRequest.output_config.effort, 'low');
});

test('ingredient image cache and manual override', async () => {
  const first = await call('GET', `/api/ingredient-image?name=${encodeURIComponent('קמח')}`);
  assert.equal(first.data.url, null);
  await call('PUT', '/api/ingredient-image', { term: 'קמח', url: 'https://img.example/flour.jpg' });
  const second = await call('GET', `/api/ingredient-image?name=${encodeURIComponent('קמח')}`);
  assert.equal(second.data.url, 'https://img.example/flour.jpg');
});

test('WhatsApp webhook verification works without login', async () => {
  process.env.WHATSAPP_VERIFY_TOKEN = 'vt';
  const saved = cookieJar.value;
  cookieJar.value = '';
  const r = await call('GET', '/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=vt&hub.challenge=77');
  assert.equal(r.data, '77');
  cookieJar.value = saved;
});
