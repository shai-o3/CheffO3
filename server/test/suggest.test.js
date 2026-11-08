// Pantry suggestions: invent vs. web search (with pause_turn continuation), against a fake API.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

const suggestion = {
  title: 'חביתת עגבניות', description: '', emoji: '🍳', category: 'ארוחת בוקר', cuisine: '', prep_minutes: 5, cook_minutes: 10,
  servings: 2, difficulty: 'קל', tags: [], notes: '', why: 'רק ביצים ועגבניות', missing: [],
  source_url: 'https://example.co.il/omelet', source_name: 'מתכונים לדוגמה',
  ingredients: [{ section: '', name: 'ביצים', quantity: 3, unit: '', note: '', category: 'מוצרי חלב וביצים', search_term: 'ביצים', emoji: '🥚' }],
  steps: [{ text: 'טורפים ומטגנים.', tip: '', minutes: 5 }],
};
const requests = [];
let server;
before(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const parsed = JSON.parse(body);
      requests.push(parsed);
      const paused = parsed.tools && parsed.messages.length === 1; // first web-search turn pauses
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({
        id: 'm', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_sequence: null,
        stop_reason: paused ? 'pause_turn' : 'end_turn', usage: { input_tokens: 1, output_tokens: 1 },
        content: paused ? [{ type: 'text', text: 'מחפש...' }] : [{ type: 'text', text: JSON.stringify({ suggestions: [suggestion] }) }],
      }));
    });
  });
  await new Promise((r) => server.listen(0, r));
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${server.address().port}`;
  process.env.ANTHROPIC_API_KEY = 'test';
});
after(() => server.close());

test('invent mode: only the pantry ingredients, no tools', async () => {
  const { suggestRecipes } = await import('../src/ai.js');
  requests.length = 0;
  const out = await suggestRecipes({ pantry: ['ביצים', 'עגבניות'], mode: 'invent' });
  assert.equal(out[0].title, 'חביתת עגבניות');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].tools, undefined);
  const prompt = requests[0].messages[0].content[0].text;
  assert.match(prompt, /אך ורק במצרכים האלה/);
  assert.match(prompt, /ביצים, עגבניות/);
});

test('web mode: uses web search, continues a paused turn, keeps the source link', async () => {
  const { suggestRecipes } = await import('../src/ai.js');
  requests.length = 0;
  const out = await suggestRecipes({ pantry: ['ביצים', 'עגבניות'], mode: 'web', allowStaples: false });
  assert.equal(requests.length, 2, 'paused turn was continued');
  assert.equal(requests[0].tools[0].type, 'web_search_20260209');
  assert.equal(requests[1].messages[1].role, 'assistant');
  assert.match(requests[0].messages[0].content[0].text, /אסור להוסיף אף מצרך/);
  assert.equal(out[0].source, 'https://example.co.il/omelet');
  assert.equal(out[0].source_name, 'מתכונים לדוגמה');
});
