import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoTags, mergeTags, ensureTagged, TAGS_VERSION } from '../src/tagging.js';
import { handle, emptyState } from '../src/core.js';

const ing = (...names) => names.map((name) => ({ name }));

test('kashrut, diet and main ingredient', () => {
  assert.deepEqual(
    autoTags({ category: 'עיקריות', ingredients: ing('שוקי עוף', 'אבקת מרק עוף', 'שעועית לבנה'), steps: [] }).filter((t) => ['בשרי', 'עוף', 'קטניות', 'חלבי'].includes(t)).sort(),
    ['בשרי', 'עוף', 'קטניות'].sort(),
  );
  const pasta = autoTags({ category: 'עיקריות', ingredients: ing('פסטה', 'גבינה צהובה', 'ביצים'), steps: [{ text: 'אופים בתנור 45 דקות' }] });
  assert.ok(pasta.includes('חלבי') && pasta.includes('צמחוני') && pasta.includes('תנור') && pasta.includes('פסטה'));
  assert.ok(!pasta.includes('טבעוני') && !pasta.includes('ללא גלוטן'));
  const salad = autoTags({ category: 'סלטים', cook_minutes: 0, prep_minutes: 15, ingredients: ing('עגבניות', 'מלפפונים', 'שמן זית'), steps: [] });
  assert.ok(['סלט', 'פרווה', 'טבעוני', 'צמחוני', 'ללא גלוטן', 'מהיר'].every((t) => salad.includes(t)));
  // Words that only look like dairy/pasta are not.
  const tricky = autoTags({ ingredients: ing('שעועית לבנה', 'צנוברים', 'בצלצלי פנינה', 'חלבון ביצה'), steps: [] });
  assert.ok(!tricky.includes('חלבי') && !tricky.includes('פסטה'));
  // Chicken-flavored soup powder doesn't make a dish meaty.
  assert.ok(autoTags({ ingredients: ing('במיה', 'אבקת מרק עוף'), steps: [] }).includes('פרווה'));
});

test('wrong kashrut/diet tags are replaced, free tags kept', () => {
  const tags = mergeTags({ category: 'עוגות', tags: ['פרווה', 'שוקולד', 'קינוחים'], ingredients: ing('חמאה', 'קמח'), steps: [{ text: 'אופים' }] });
  assert.ok(tags.includes('חלבי') && !tags.includes('פרווה') && tags.includes('שוקולד') && tags.includes('קינוח'));
});

test('saving tags automatically; a tag the user removed stays removed', async () => {
  const ctx = { state: emptyState() };
  const p = new URLSearchParams();
  const r = await handle(ctx, 'POST', '/recipes', p, { title: 'עוף בתנור', category: 'עיקריות', ingredients: ing('כרעי עוף', 'תפוחי אדמה'), steps: ['אופים בתנור שעה'] });
  assert.ok(r.tags.includes('בשרי') && r.tags.includes('עוף') && r.tags.includes('ללא גלוטן'));
  const edited = await handle(ctx, 'PUT', `/recipes/${r.id}`, p, { tags: r.tags.filter((t) => t !== 'ללא גלוטן') });
  assert.ok(!edited.tags.includes('ללא גלוטן'));
  const again = await handle(ctx, 'PUT', `/recipes/${r.id}`, p, { title: 'עוף בתנור עם בצל' });
  assert.ok(!again.tags.includes('ללא גלוטן'), 'exclusion survives later edits');
  const readded = await handle(ctx, 'PUT', `/recipes/${r.id}`, p, { tags: [...again.tags, 'ללא גלוטן'] });
  assert.ok(readded.tags.includes('ללא גלוטן'));
});

test('existing recipes are tagged once, and filtering by several tags', async () => {
  const state = { seq: 10, recipes: [
    { id: 1, title: 'קציצות', category: 'עיקריות', tags: [], ingredients: ing('בשר טחון', 'פירורי לחם'), steps: [], favorite: false, updated_at: '1' },
    { id: 2, title: 'עוגה', category: 'עוגות', tags: [], ingredients: ing('חמאה', 'קמח'), steps: [{ text: 'אופים' }], favorite: false, updated_at: '2' },
  ], shopping: [], pantry: [] };
  assert.equal(ensureTagged(state), true);
  assert.equal(state.tagsVersion, TAGS_VERSION);
  assert.equal(ensureTagged(state), false);
  const ctx = { state };
  const list = await handle(ctx, 'GET', '/recipes', new URLSearchParams({ tags: 'חלבי,קינוח' }));
  assert.deepEqual(list.map((r) => r.title), ['עוגה']);
  const meat = await handle(ctx, 'GET', '/recipes', new URLSearchParams({ tags: 'בשרי' }));
  assert.deepEqual(meat.map((r) => r.title), ['קציצות']);
});
