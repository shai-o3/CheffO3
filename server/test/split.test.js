import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitRecipesHeuristic, cutByStartLines } from '../src/hebrew.js';

const DOC = `ספר המתכונים של סבתא

עוגת גבינה
עוגה קלאסית לשבועות
מצרכים:
500 גרם גבינה לבנה
3 ביצים
אופן ההכנה:
מערבבים ואופים.

מרק עדשים
מצרכים:
2 כוסות עדשים
1 גזר
אופן ההכנה:
מבשלים שעה.

סלט טונה
מצרכים:
1 קופסת טונה
אופן ההכנה:
מערבבים.`;

test('heuristic split finds each recipe by its ingredients heading', () => {
  const parts = splitRecipesHeuristic(DOC);
  assert.deepEqual(parts.map((p) => p.title), ['עוגת גבינה', 'מרק עדשים', 'סלט טונה']);
  assert.match(parts[0].text, /^עוגת גבינה\nעוגה קלאסית/);
  assert.match(parts[1].text, /מבשלים שעה\.$/);
  assert.ok(!parts[0].text.includes('מרק עדשים'));
});

test('cutting by AI start lines keeps the text between markers', () => {
  const parts = cutByStartLines(DOC, [
    { title: 'עוגת גבינה', first_line: 'עוגת גבינה' },
    { title: 'מרק עדשים', first_line: 'מרק עדשים' },
    { title: 'לא קיים', first_line: 'שורה שלא קיימת' },
    { title: 'סלט טונה', first_line: 'סלט טונה' },
  ]);
  assert.equal(parts.length, 3);
  assert.match(parts[1].text, /^מרק עדשים[\s\S]*מבשלים שעה\.$/);
  assert.match(parts[2].text, /^סלט טונה/);
});

test('a document with a single recipe and no headings stays one recipe', () => {
  const parts = splitRecipesHeuristic('פשטידה\nמערבבים הכל ואופים 40 דקות');
  assert.equal(parts.length, 1);
  assert.equal(parts[0].title, 'פשטידה');
});

test('Word-style text with blank lines between paragraphs', () => {
  const doc = DOC.split('\n').join('\n\n');
  const parts = splitRecipesHeuristic(doc);
  assert.deepEqual(parts.map((p) => p.title), ['עוגת גבינה', 'מרק עדשים', 'סלט טונה']);
});
