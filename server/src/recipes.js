import { db, tx } from './db.js';
import { guessCategory, guessEmoji, ingredientMatches, normalizeName, STAPLES } from './hebrew.js';
import { mergeTags, updateExclusions, TAGS_VERSION } from './tagging.js';

const num = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v));

function rowToRecipe(r) {
  return { ...r, tags: JSON.parse(r.tags || '[]'), tags_excluded: JSON.parse(r.tags_excluded || '[]'), favorite: !!r.favorite };
}

export function listRecipes({ q, category, tag, tags, favorite } = {}) {
  let sql = `SELECT r.*, (SELECT COUNT(*) FROM recipe_ingredients i WHERE i.recipe_id = r.id) AS ingredient_count
             FROM recipes r WHERE 1=1`;
  const params = [];
  if (category) { sql += ' AND r.category = ?'; params.push(category); }
  if (favorite) sql += ' AND r.favorite = 1';
  for (const t of [tag, ...String(tags || '').split(',')].filter(Boolean)) { sql += ' AND r.tags LIKE ?'; params.push(`%"${t}"%`); }
  if (q) {
    sql += ` AND (r.title LIKE ? OR r.description LIKE ? OR r.tags LIKE ?
             OR EXISTS (SELECT 1 FROM recipe_ingredients i WHERE i.recipe_id = r.id AND i.name LIKE ?))`;
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }
  sql += ' ORDER BY r.favorite DESC, r.updated_at DESC';
  return db.prepare(sql).all(...params).map(rowToRecipe);
}

export function getRecipe(id) {
  const r = db.prepare('SELECT * FROM recipes WHERE id = ?').get(id);
  if (!r) return null;
  const recipe = rowToRecipe(r);
  recipe.ingredients = db.prepare('SELECT * FROM recipe_ingredients WHERE recipe_id = ? ORDER BY position').all(id);
  recipe.steps = db.prepare('SELECT * FROM recipe_steps WHERE recipe_id = ? ORDER BY position').all(id);
  return recipe;
}

function writeChildren(id, data) {
  db.prepare('DELETE FROM recipe_ingredients WHERE recipe_id = ?').run(id);
  db.prepare('DELETE FROM recipe_steps WHERE recipe_id = ?').run(id);
  const insIng = db.prepare(`INSERT INTO recipe_ingredients
    (recipe_id, position, section, name, quantity, unit, note, category, search_term, emoji)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  (data.ingredients || []).forEach((ing, i) => {
    const name = String(ing.name || '').trim();
    if (!name) return;
    insIng.run(id, i, ing.section || '', name, num(ing.quantity), ing.unit || '', ing.note || '',
      ing.category || guessCategory(name), ing.search_term || name, ing.emoji || guessEmoji(name));
  });
  const insStep = db.prepare('INSERT INTO recipe_steps (recipe_id, position, text, tip, minutes) VALUES (?, ?, ?, ?, ?)');
  (data.steps || []).forEach((s, i) => {
    const text = String(typeof s === 'string' ? s : s.text || '').trim();
    if (!text) return;
    insStep.run(id, i, text, s.tip || '', num(s.minutes));
  });
}

const FIELDS = ['title', 'description', 'emoji', 'image', 'category', 'cuisine', 'prep_minutes', 'cook_minutes',
  'servings', 'difficulty', 'source', 'notes'];

function fieldValues(data) {
  return FIELDS.map((f) => {
    if (['prep_minutes', 'cook_minutes', 'servings'].includes(f)) return num(data[f]);
    return data[f] ?? null;
  });
}

export function createRecipe(data) {
  if (!data.title?.trim()) throw Object.assign(new Error('חסרה כותרת למתכון'), { status: 400 });
  return tx(() => {
    const vals = fieldValues(data);
    const res = db.prepare(`INSERT INTO recipes (${FIELDS.join(', ')}, tags, favorite)
      VALUES (${FIELDS.map(() => '?').join(', ')}, ?, ?)`).run(...vals, JSON.stringify(data.tags || []), data.favorite ? 1 : 0);
    const id = Number(res.lastInsertRowid);
    writeChildren(id, data);
    return applyTags(id, []);
  });
}

export function updateRecipe(id, data) {
  const existing = getRecipe(id);
  if (!existing) return null;
  const merged = { ...existing, ...data };
  return tx(() => {
    db.prepare(`UPDATE recipes SET ${FIELDS.map((f) => `${f} = ?`).join(', ')}, tags = ?, favorite = ?,
      updated_at = datetime('now') WHERE id = ?`)
      .run(...fieldValues(merged), JSON.stringify(merged.tags || []), merged.favorite ? 1 : 0, id);
    if (data.ingredients || data.steps) {
      writeChildren(id, { ingredients: data.ingredients || existing.ingredients, steps: data.steps || existing.steps });
    }
    const excluded = Array.isArray(data.tags) ? updateExclusions(existing, data.tags, existing.tags_excluded) : existing.tags_excluded;
    return applyTags(id, excluded);
  });
}

/** Recompute a saved recipe's tags (user tags + automatic tags − excluded). */
function applyTags(id, excluded) {
  const r = getRecipe(id);
  const tags = mergeTags(r, { excluded });
  db.prepare('UPDATE recipes SET tags = ?, tags_excluded = ? WHERE id = ?').run(JSON.stringify(tags), JSON.stringify(excluded), id);
  return { ...r, tags, tags_excluded: excluded };
}

/** One-time automatic tagging of existing recipes (tracked with SQLite's user_version). */
export function retagAll() {
  const { user_version: v } = db.prepare('PRAGMA user_version').get();
  if (v >= TAGS_VERSION) return 0;
  const ids = db.prepare('SELECT id FROM recipes').all().map((r) => r.id);
  tx(() => ids.forEach((id) => applyTags(id, getRecipe(id).tags_excluded)));
  db.exec(`PRAGMA user_version = ${TAGS_VERSION}`);
  return ids.length;
}

export function setFavorite(id, favorite) {
  db.prepare('UPDATE recipes SET favorite = ? WHERE id = ?').run(favorite ? 1 : 0, id);
  return getRecipe(id);
}

export function deleteRecipe(id) {
  return db.prepare('DELETE FROM recipes WHERE id = ?').run(id).changes > 0;
}

export function allTags() {
  const tags = new Map();
  for (const { tags: t } of db.prepare('SELECT tags FROM recipes').all()) {
    for (const tag of JSON.parse(t || '[]')) tags.set(tag, (tags.get(tag) || 0) + 1);
  }
  return [...tags.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
}

/** Distinct ingredient names across all recipes – used for pantry autocomplete. */
export function knownIngredients() {
  return db.prepare('SELECT name, COUNT(*) AS c FROM recipe_ingredients GROUP BY name ORDER BY c DESC, name').all()
    .map((r) => r.name);
}

/**
 * Rank saved recipes by how well the given pantry covers their ingredients.
 */
export function matchByIngredients(have, { ignoreStaples = true } = {}) {
  const haveList = have.map((h) => h.trim()).filter(Boolean);
  const isStaple = (name) => STAPLES.some((s) => normalizeName(name) === normalizeName(s));
  const recipes = db.prepare('SELECT * FROM recipes').all().map(rowToRecipe);
  const ingStmt = db.prepare('SELECT * FROM recipe_ingredients WHERE recipe_id = ? ORDER BY position');
  const results = [];
  for (const r of recipes) {
    const ings = ingStmt.all(r.id).filter((i) => !(ignoreStaples && isStaple(i.name)));
    if (!ings.length) continue;
    const matched = [];
    const missing = [];
    for (const ing of ings) {
      (haveList.some((h) => ingredientMatches(ing.name, h)) ? matched : missing).push(ing);
    }
    if (!matched.length) continue;
    results.push({
      recipe: { ...r, ingredient_count: ings.length },
      score: matched.length / ings.length,
      matched: matched.map((i) => i.name),
      missing: missing.map((i) => ({ name: i.name, quantity: i.quantity, unit: i.unit, category: i.category, emoji: i.emoji, search_term: i.search_term })),
    });
  }
  return results.sort((a, b) => b.score - a.score || a.missing.length - b.missing.length);
}
