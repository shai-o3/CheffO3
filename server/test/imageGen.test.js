// Dish-photo generation against a fake Gemini API, in both response formats, through the
// shared API core (as the Netlify function uses it).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

const PNG = Buffer.from('89504e470d0a1a0a', 'hex').toString('base64');
let mode = 'interactions';
let calls = [];
let server;

before(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      calls.push({ url: req.url, key: req.headers['x-goog-api-key'], body: JSON.parse(body) });
      res.setHeader('content-type', 'application/json');
      if (req.url.endsWith('/interactions')) {
        if (mode !== 'interactions') { res.statusCode = 404; res.end(JSON.stringify({ error: { message: 'not found' } })); return; }
        res.end(JSON.stringify({ status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'image', data: PNG, mime_type: 'image/png' }] }] }));
        return;
      }
      if (mode === 'broken') { res.statusCode = 400; res.end(JSON.stringify({ error: { message: 'API key not valid' } })); return; }
      res.end(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/jpeg', data: PNG } }] } }] }));
    });
  });
  await new Promise((r) => server.listen(0, r));
  process.env.GEMINI_API_BASE = `http://127.0.0.1:${server.address().port}`;
  process.env.GEMINI_API_KEY = 'gem-key';
});
after(() => server.close());

async function setup() {
  const { handle, seedState } = await import('../src/core.js');
  const { generateDishImage, dishKey } = await import('../src/imageGen.js');
  const cache = new Map();
  const uploads = [];
  const ctx = {
    state: seedState(),
    generateImage: generateDishImage,
    dishKey,
    images: { get: async (k) => cache.get(k) || null, set: async (k, v) => cache.set(k, v) },
    saveUpload: async (file) => { uploads.push(file.type); return `/uploads/${uploads.length}.${file.type.split('/')[1]}`; },
  };
  return { ctx, handle, uploads };
}

test('generates a dish photo (interactions format) and caches it by recipe content', async () => {
  mode = 'interactions';
  calls = [];
  const { ctx, handle, uploads } = await setup();
  const r = await handle(ctx, 'POST', '/recipes/1/generate-image', new URLSearchParams(), {});
  assert.equal(r.image, '/uploads/1.png');
  assert.equal(ctx.dirty, true);
  assert.equal(calls[0].key, 'gem-key');
  assert.match(calls[0].body.input, /שקשוקה/);
  assert.match(calls[0].body.input, /No text/);

  // A second user with the same sample recipe gets the cached image: no new API call.
  const again = { ...ctx, state: (await import('../src/core.js')).seedState() };
  const r2 = await handle(again, 'POST', '/recipes/1/generate-image', new URLSearchParams(), {});
  assert.equal(r2.image, '/uploads/1.png');
  assert.equal(calls.length, 1);
  assert.equal(uploads.length, 1);

  // "fresh" forces a new image.
  await handle(ctx, 'POST', '/recipes/1/generate-image', new URLSearchParams(), { fresh: true });
  assert.equal(calls.length, 2);
});

test('falls back to generateContent (inlineData format)', async () => {
  mode = 'generateContent';
  calls = [];
  const { ctx, handle } = await setup();
  const r = await handle(ctx, 'POST', `/recipes/${ctx.state.recipes[1].id}/generate-image`, new URLSearchParams(), {});
  assert.equal(r.image, '/uploads/1.jpeg');
  assert.ok(calls[1].url.includes(':generateContent'));
  assert.deepEqual(calls[1].body.generationConfig.responseModalities, ['IMAGE']);
});

test('reports a clear error when Google refuses', async () => {
  mode = 'broken';
  const { ctx, handle } = await setup();
  await assert.rejects(handle(ctx, 'POST', `/recipes/${ctx.state.recipes[2].id}/generate-image`, new URLSearchParams(), {}), /API key not valid/);
});
