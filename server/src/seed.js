import './env.js';
import { fileURLToPath } from 'node:url';
import { db } from './db.js';
import { createRecipe } from './recipes.js';
import { SAMPLE_RECIPES } from './sampleRecipes.js';

export function seedIfEmpty({ force = false } = {}) {
  const { c } = db.prepare('SELECT COUNT(*) AS c FROM recipes').get();
  if (c > 0 && !force) return 0;
  if (process.env.SEED === '0') return 0;
  for (const r of SAMPLE_RECIPES) createRecipe({ ...r, source: 'מתכוני דוגמה' });
  return SAMPLE_RECIPES.length;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const n = seedIfEmpty({ force: process.argv.includes('--force') });
  console.log(n ? `נוספו ${n} מתכוני דוגמה` : 'המסד אינו ריק – לא נוסף דבר (השתמשו ב--force)');
}
