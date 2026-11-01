import { db, tx } from './db.js';
import { getRecipe } from './recipes.js';
import { guessCategory, guessEmoji, INGREDIENT_CATEGORIES, normalizeName } from './hebrew.js';

const rowToItem = (r) => ({ ...r, checked: !!r.checked, recipes: JSON.parse(r.recipes || '[]') });

export function listItems() {
  const items = db.prepare('SELECT * FROM shopping_items ORDER BY checked, created_at').all().map(rowToItem);
  const order = (c) => {
    const i = INGREDIENT_CATEGORIES.indexOf(c);
    return i === -1 ? 999 : i;
  };
  return items.sort((a, b) => a.checked - b.checked || order(a.category) - order(b.category));
}

/**
 * Add an item, merging with an existing unchecked item of the same name & unit
 * (quantities are summed).
 */
export function addItem({ name, quantity = null, unit = '', category, emoji, search_term, recipe }) {
  name = String(name || '').trim();
  if (!name) throw Object.assign(new Error('חסר שם מוצר'), { status: 400 });
  const existing = db.prepare('SELECT * FROM shopping_items WHERE checked = 0').all()
    .find((i) => normalizeName(i.name) === normalizeName(name) && (i.unit || '') === (unit || ''));
  if (existing) {
    const recipes = JSON.parse(existing.recipes || '[]');
    if (recipe && !recipes.some((r) => r.id === recipe.id)) recipes.push(recipe);
    const q = existing.quantity != null || quantity != null
      ? (existing.quantity || 0) + (quantity != null ? Number(quantity) : 0)
      : null;
    db.prepare('UPDATE shopping_items SET quantity = ?, recipes = ? WHERE id = ?')
      .run(q, JSON.stringify(recipes), existing.id);
    return rowToItem(db.prepare('SELECT * FROM shopping_items WHERE id = ?').get(existing.id));
  }
  const res = db.prepare(`INSERT INTO shopping_items (name, quantity, unit, category, emoji, search_term, recipes)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
    name, quantity != null && quantity !== '' ? Number(quantity) : null, unit || '',
    category || guessCategory(name), emoji || guessEmoji(name), search_term || name,
    JSON.stringify(recipe ? [recipe] : []),
  );
  return rowToItem(db.prepare('SELECT * FROM shopping_items WHERE id = ?').get(Number(res.lastInsertRowid)));
}

/** Add all (or selected) ingredients of a recipe, scaled to `servings`. */
export function addFromRecipe(recipeId, { servings, ingredientIds } = {}) {
  const recipe = getRecipe(recipeId);
  if (!recipe) return null;
  const factor = servings && recipe.servings ? Number(servings) / recipe.servings : 1;
  const ref = { id: recipe.id, title: recipe.title };
  return tx(() => {
    let added = 0;
    for (const ing of recipe.ingredients) {
      if (ingredientIds && !ingredientIds.includes(ing.id)) continue;
      addItem({
        name: ing.name,
        quantity: ing.quantity != null ? Math.round(ing.quantity * factor * 100) / 100 : null,
        unit: ing.unit, category: ing.category, emoji: ing.emoji, search_term: ing.search_term, recipe: ref,
      });
      added++;
    }
    return { added, items: listItems() };
  });
}

export function updateItem(id, patch) {
  const cur = db.prepare('SELECT * FROM shopping_items WHERE id = ?').get(id);
  if (!cur) return null;
  const next = { ...cur, ...patch };
  db.prepare('UPDATE shopping_items SET name = ?, quantity = ?, unit = ?, category = ?, checked = ? WHERE id = ?')
    .run(next.name, next.quantity === '' ? null : next.quantity, next.unit || '', next.category, next.checked ? 1 : 0, id);
  return rowToItem(db.prepare('SELECT * FROM shopping_items WHERE id = ?').get(id));
}

export function deleteItem(id) {
  db.prepare('DELETE FROM shopping_items WHERE id = ?').run(id);
}

export function clearItems({ onlyChecked = false } = {}) {
  db.prepare(onlyChecked ? 'DELETE FROM shopping_items WHERE checked = 1' : 'DELETE FROM shopping_items').run();
}

// ---- pantry ----
export const listPantry = () => db.prepare('SELECT name FROM pantry ORDER BY added_at DESC').all().map((r) => r.name);
export function addPantry(names) {
  const st = db.prepare('INSERT OR IGNORE INTO pantry (name) VALUES (?)');
  for (const n of names) if (String(n).trim()) st.run(String(n).trim());
  return listPantry();
}
export function removePantry(name) {
  db.prepare('DELETE FROM pantry WHERE name = ?').run(name);
  return listPantry();
}
export function clearPantry() {
  db.prepare('DELETE FROM pantry').run();
  return [];
}
