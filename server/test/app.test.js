import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Isolated DB + a fake Anthropic API so AI paths run without a real key.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cheffo3-test-'));
process.env.DATA_DIR = tmp;
process.env.IMAGE_PROVIDERS = 'none';
process.env.ANTHROPIC_API_KEY = 'test-key';

let lastAnthropicRequest;
const fakeRecipe = {
  is_recipe: true, title: 'עוגיות שוקולד צ\'יפס', description: 'עוגיות פריכות', emoji: '🍪', category: 'מאפים', cuisine: 'אמריקאי',
  prep_minutes: 15, cook_minutes: 12, servings: 20, difficulty: 'קל', tags: ['חלבי'], notes: '',
  ingredients: [
    { section: '', name: 'קמח לבן', quantity: 2, unit: 'כוסות', note: '', category: 'קמח ואפייה', search_term: 'קמח לבן', emoji: '🌾' },
    { section: '', name: 'שוקולד צ\'יפס', quantity: 150, unit: 'גרם', note: '', category: 'קטגוריה-לא-קיימת', search_term: 'שוקולד צ\'יפס', emoji: '🍫' },
  ],
  steps: [{ text: 'מערבבים ואופים.', tip: '', minutes: 12 }],
};
const fakeApi = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    lastAnthropicRequest = { url: req.url, headers: req.headers, body: JSON.parse(body) };
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({
      id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'end_turn', stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 },
      content: [{ type: 'text', text: JSON.stringify(fakeRecipe) }],
    }));
  });
});

let server;
let base;
before(async () => {
  await new Promise((r) => fakeApi.listen(0, r));
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${fakeApi.address().port}`;
  const { createApp } = await import('../src/index.js');
  const { seedIfEmpty } = await import('../src/seed.js');
  seedIfEmpty();
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => { server?.close(); fakeApi.close(); });

const j = async (method, url, body) => {
  const res = await fetch(base + url, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
  return { status: res.status, data: res.status === 204 ? null : await res.json() };
};

test('heuristic ingredient parsing', async () => {
  const { parseIngredientLine } = await import('../src/hebrew.js');
  assert.deepEqual(
    (({ name, quantity, unit, note }) => ({ name, quantity, unit, note }))(parseIngredientLine('1½ כוסות קמח תופח (מנופה)')),
    { name: 'קמח תופח', quantity: 1.5, unit: 'כוסות', note: 'מנופה' },
  );
  const l = parseIngredientLine('100 גרם חמאה, רכה');
  assert.equal(l.name, 'חמאה');
  assert.equal(l.note, 'רכה');
  assert.equal(l.category, 'מוצרי חלב וביצים');
  assert.equal(parseIngredientLine('2 כפות רסק עגבניות').category, 'שימורים ורטבים');
  assert.equal(parseIngredientLine('חצי כוס סוכר').quantity, 0.5);
});

test('WhatsApp export text is cleaned', async () => {
  const { cleanWhatsAppText } = await import('../src/whatsapp.js');
  const out = cleanWhatsAppText('[1.11.2026, 10:05:12] דנה כהן: *עוגה* טעימה\n1.11.26, 10:06 - דנה: 2 כוסות קמח\n<Media omitted>');
  assert.equal(out, 'עוגה טעימה\n2 כוסות קמח');
});

test('recipes CRUD + search', async () => {
  const list = await j('GET', '/recipes');
  assert.equal(list.data.length, 6);
  const created = await j('POST', '/recipes', {
    title: 'מרק עדשים', category: 'מרקים', servings: 6,
    ingredients: [{ name: 'עדשים כתומות', quantity: 2, unit: 'כוסות' }, { name: 'גזר', quantity: 2 }],
    steps: ['מבשלים הכל 30 דקות'], tags: ['טבעוני'],
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.ingredients[0].category, 'קטניות');
  assert.equal(created.data.steps.length, 1);
  const found = await j('GET', `/recipes?q=${encodeURIComponent('עדשים')}`);
  assert.ok(found.data.some((r) => r.id === created.data.id));
  const upd = await j('PUT', `/recipes/${created.data.id}`, { title: 'מרק עדשים כתומות' });
  assert.equal(upd.data.title, 'מרק עדשים כתומות');
  assert.equal(upd.data.ingredients.length, 2, 'ingredients preserved on partial update');
  assert.equal((await j('DELETE', `/recipes/${created.data.id}`)).status, 204);
  assert.equal((await j('GET', `/recipes/${created.data.id}`)).status, 404);
});

test('match recipes by pantry', async () => {
  const { data } = await j('POST', '/match', { have: ['עגבניה', 'ביצה', 'בצל', 'פלפל אדום', 'שום', 'פפריקה', 'כמון', 'פטרוזיל', 'רסק עגבניות'] });
  assert.equal(data[0].recipe.title, 'שקשוקה ביתית');
  assert.ok(data[0].score > 0.9, `score ${data[0].score}`);
});

test('shopping list from recipe merges and scales', async () => {
  await j('DELETE', '/shopping');
  await j('POST', '/shopping/from-recipe/1', { servings: 8 }); // shakshuka for 8 = x2
  const { data: { items } } = await j('POST', '/shopping/from-recipe/1', {});
  const eggs = items.find((i) => i.name === 'ביצים');
  assert.equal(eggs.quantity, 18); // 12 + 6
  assert.deepEqual(eggs.recipes.map((r) => r.id), [1]);
  const wa = await j('GET', '/shopping/whatsapp');
  assert.match(wa.data.text, /רשימת קניות/);
  assert.match(wa.data.text, /ביצים – 18/);
});

test('AI extract sends a valid request and normalizes output', async () => {
  const form = new FormData();
  form.append('text', 'מתכון לעוגיות');
  form.append('images', new Blob([Buffer.from('iVBORw0KGgo=', 'base64')], { type: 'image/png' }), 'a.png');
  const res = await fetch(`${base}/ai/extract`, { method: 'POST', body: form });
  const data = await res.json();
  assert.equal(res.status, 200, JSON.stringify(data));
  assert.equal(data.title, fakeRecipe.title);
  assert.equal(data.ingredients[1].category, 'מתוקים', 'unknown category replaced');
  assert.equal(data.is_recipe, undefined);
  const body = lastAnthropicRequest.body;
  assert.equal(body.model, 'claude-opus-5-5');
  assert.equal(body.fallbacks, 'default');
  assert.equal(body.output_config.format.type, 'json_schema');
  assert.equal(body.messages[0].content[0].type, 'image');
  assert.match(lastAnthropicRequest.headers['anthropic-beta'], /server-side-fallback-2026-07-01/);
});

test('recipe WhatsApp message', async () => {
  const { data } = await j('GET', '/recipes/2/whatsapp?servings=8');
  assert.match(data.text, /^\*🥗 סלט ישראלי קצוץ\*/);
  assert.match(data.text, /• 8 עגבניות/);
  assert.match(data.text, /אופן ההכנה/);
});

test('WhatsApp webhook verification', async () => {
  process.env.WHATSAPP_VERIFY_TOKEN = 'secret';
  const ok = await fetch(`${base}/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=secret&hub.challenge=42`);
  assert.equal(await ok.text(), '42');
  const bad = await fetch(`${base}/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=42`);
  assert.equal(bad.status, 403);
});
