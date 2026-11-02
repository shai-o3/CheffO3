// Automatic recipe tags from a fixed Hebrew vocabulary, derived from the recipe itself
// (category, ingredients, steps, times). Rule-based: free, instant, deterministic.
// Used on every save, and once on existing recipes (TAGS_VERSION).

export const TAGS_VERSION = 1;

export const TAG_GROUPS = [
  { name: 'סוג מנה', tags: ['מנה עיקרית', 'מנה ראשונה', 'תוספת', 'סלט', 'מרק', 'קינוח', 'עוגה', 'מאפה', 'ארוחת בוקר', 'ממרח', 'משקה'] },
  { name: 'כשרות', tags: ['בשרי', 'חלבי', 'פרווה'] },
  { name: 'תזונה', tags: ['טבעוני', 'צמחוני', 'ללא גלוטן'] },
  { name: 'מרכיב עיקרי', tags: ['עוף', 'בקר', 'טלה', 'דגים', 'קטניות', 'פסטה', 'אורז', 'ירקות'] },
  { name: 'סגנון', tags: ['ממולאים', 'תבשיל', 'תנור', 'ללא אפייה', 'מהיר', 'בישול ארוך', 'חגיגי'] },
];

// Tags in these groups are facts about the recipe: contradicting ones are removed.
const KASHRUT = ['בשרי', 'חלבי', 'פרווה'];
const DIET = ['טבעוני', 'צמחוני', 'ללא גלוטן'];

const SYNONYMS = {
  'עיקרית': 'מנה עיקרית', 'עיקריות': 'מנה עיקרית', 'מנות עיקריות': 'מנה עיקרית',
  'ראשונה': 'מנה ראשונה', 'מנות ראשונות': 'מנה ראשונה',
  'קינוחים': 'קינוח', 'עוגות': 'עוגה', 'מרקים': 'מרק', 'סלטים': 'סלט', 'תוספות': 'תוספת', 'מאפים': 'מאפה',
  'בשר': 'בשרי', 'טבעונית': 'טבעוני', 'טבעוניות': 'טבעוני', 'צמחונית': 'צמחוני', 'vegan': 'טבעוני',
  'ללא-גלוטן': 'ללא גלוטן', 'בלי גלוטן': 'ללא גלוטן', 'גלוטן פרי': 'ללא גלוטן',
  'דג': 'דגים', 'ממולא': 'ממולאים', 'ממולאות': 'ממולאים', 'מהירה': 'מהיר', 'מהירים': 'מהיר',
  'אפייה': 'תנור', 'אפוי': 'תנור', 'בתנור': 'תנור',
};

const CATEGORY_TAGS = {
  'עיקריות': ['מנה עיקרית'], 'מנות ראשונות': ['מנה ראשונה'], 'סלטים': ['סלט'], 'מרקים': ['מרק'],
  'תוספות': ['תוספת'], 'קינוחים': ['קינוח'], 'עוגות': ['עוגה', 'קינוח'], 'מאפים': ['מאפה'],
  'ארוחת בוקר': ['ארוחת בוקר'], 'רטבים וממרחים': ['ממרח'], 'משקאות': ['משקה'],
};

// Ingredient patterns (matched on the ingredient name).
const CHICKEN = /עוף|שוקיים|שוקי|כרעיים|כרעי|פרגית|כנפיים|הודו/;
const OTHER_MEAT = /אווז|ברווז|כבד|קורנדביף|סלמי/;
const BEEF = /בקר|בשר טחון|בשר מספר|סינטה|אנטריקוט|פילה בקר|צלעות בקר|כתף|אסאדו|שייטל|צלי|קבב|נקניק|פסטרמה|סטייק|^בשר/;
const LAMB = /טלה|כבש/;
const FISH = /דג|סלמון|טונה|אמנון|לברק|דניס|בקלה|מושט|פילה|שרימפס|סרדינ|הרינג|אנשובי/;
const DAIRY = /^חלב(?!ון)|[^א-ת]חלב(?!ון)|גבינ|חמאה(?! בוטנים)|שמנת|יוגורט|^לבנה|קוטג|מוצרל|פרמזן|ריקוטה|צפתית|^פטה|מסקרפונה|רוקפור|קשקבל/;
const EGG = /ביצ/;
const HONEY = /דבש/;
const GLUTEN = /קמח(?! (תירס|אורז|שקדים|כוסמין ללא|חומוס|קוקוס))|לחם|פירורי|פרורי|פסטה|ספגטי|מקרונ|אטריות|לזניה|קוסקוס|בורגול|סולת|פתיתים|שיבולת|מצה|ביסקוו|עוגיות|בצק|פיתה|לחמני|חלה|טורטיי|סויה|בירה|אבקת מרק|ציר (עוף|בקר)|קרקר|פנקו|גריסים|כוסמין|שעורה|שיפון|קרוטונים/;
const LEGUMES = /שעועית|חומוס|עדשים|אפונה|פול|גרגירי/;
const PASTA = /פסטה|ספגטי|מקרונ|אטריות|לזניה|^פנה|ניוקי|פתיתים/;
const RICE = /אורז/;
const VEG_MAIN = /במיה|כרובית|ברוקולי|חציל|קישוא|ארטישוק|פלפל(ים)? (אדום|אדומים|ממולא)|בצלים|דלעת|תרד|פטריות|תפוחי אדמה|בטטה|כרוב/;

const notStock = (n) => !/אבקת מרק|ציר|בטעם/.test(n);

/** Normalize a free tag to the vocabulary where possible. */
export function normalizeTag(t) {
  const s = String(t || '').trim().replace(/^#/, '').replace(/\s+/g, ' ');
  return SYNONYMS[s] || s;
}

/** Facts about a recipe, computed from its content. */
export function analyzeRecipe(r) {
  const ings = (r.ingredients || []).map((i) => String(i.name || '').trim()).filter(Boolean);
  const steps = (r.steps || []).map((s) => String(typeof s === 'string' ? s : s.text || '')).join(' ');
  const text = `${r.title || ''} ${steps}`;
  const has = (re, filter = () => true) => ings.some((n) => re.test(n) && filter(n));

  const chicken = has(CHICKEN, notStock);
  const lamb = has(LAMB);
  const beef = has(BEEF, (n) => notStock(n) && !CHICKEN.test(n));
  const fish = has(FISH, (n) => !/פילה (עוף|בקר|חזה)/.test(n) && notStock(n)) && !beef && !chicken;
  const meat = chicken || beef || lamb || has(OTHER_MEAT);
  const dairy = has(DAIRY, (n) => !/חלב (סויה|שקדים|שיבולת|אורז|קוקוס)/.test(n));
  const eggs = has(EGG);
  const honey = has(HONEY);
  const gluten = has(GLUTEN);
  const total = (Number(r.prep_minutes) || 0) + (Number(r.cook_minutes) || 0);
  const oven = /(מחממים (את ה)?תנור|לתנור|אופים|האפייה|אפייה ב|בתנור החם|בתנור ל-|בתנור ב)/.test(steps);
  const stuffed = /ממולא/.test(r.title || '') || (r.ingredients || []).some((i) => /למילוי/.test(i.section || ''));

  return { chicken, beef, lamb, fish, meat, dairy, eggs, honey, gluten, total, oven, stuffed, ings, text };
}

/** The automatic tags for a recipe. */
export function autoTags(r) {
  const a = analyzeRecipe(r);
  const tags = [...(CATEGORY_TAGS[r.category] || [])];

  if (a.meat) tags.push('בשרי');
  else if (a.dairy) tags.push('חלבי');
  else if (a.ings.length) tags.push('פרווה');

  if (a.ings.length && !a.meat && !a.fish) tags.push('צמחוני');
  if (a.ings.length && !a.meat && !a.fish && !a.dairy && !a.eggs && !a.honey) tags.push('טבעוני');
  if (a.ings.length && !a.gluten) tags.push('ללא גלוטן');

  if (a.chicken) tags.push('עוף');
  if (a.beef) tags.push('בקר');
  if (a.lamb) tags.push('טלה');
  if (a.fish) tags.push('דגים');
  if (a.ings.some((n) => LEGUMES.test(n) && notStock(n) && !/שעועית ירוקה/.test(n))) tags.push('קטניות');
  if (a.ings.some((n) => PASTA.test(n))) tags.push('פסטה');
  if (a.ings.some((n) => RICE.test(n))) tags.push('אורז');
  if (!a.meat && !a.fish && a.ings.some((n) => VEG_MAIN.test(n))) tags.push('ירקות');

  if (a.stuffed) tags.push('ממולאים');
  if (a.oven) tags.push('תנור');
  if ((r.category === 'עוגות' || r.category === 'קינוחים') && !a.oven) tags.push('ללא אפייה');
  if (r.category === 'עיקריות' && !a.oven && /מבשלים|בישול/.test(a.text) && a.total >= 40) tags.push('תבשיל');
  if (a.total > 0 && a.total <= 30) tags.push('מהיר');
  if (a.total >= 120) tags.push('בישול ארוך');
  return [...new Set(tags)];
}

/**
 * Final tag list for a saved recipe: the user's tags (normalized) plus automatic tags,
 * minus tags the user removed on purpose (`excluded`). Kashrut and diet tags that
 * contradict the ingredients are dropped.
 */
export function mergeTags(recipe, { excluded = [] } = {}) {
  const auto = autoTags(recipe);
  const own = (recipe.tags || []).map(normalizeTag).filter(Boolean);
  const factual = new Set([...KASHRUT, ...DIET]);
  const kept = own.filter((t) => !factual.has(t) || auto.includes(t));
  const all = [...kept, ...auto.filter((t) => !excluded.includes(t))];
  return [...new Set(all)];
}

/**
 * Tags the user removed in the editor: automatic tags of the previous version that are
 * missing from the submitted list. Re-adding a tag clears its exclusion.
 */
export function updateExclusions(prev, submittedTags, prevExcluded = []) {
  const submitted = (submittedTags || []).map(normalizeTag);
  const removed = autoTags(prev).filter((t) => (prev.tags || []).includes(t) && !submitted.includes(t));
  return [...new Set([...prevExcluded, ...removed])].filter((t) => !submitted.includes(t));
}

/** Tag every recipe in a JSON state document once per TAGS_VERSION. Returns true if it changed. */
export function ensureTagged(state) {
  if (state.tagsVersion === TAGS_VERSION) return false;
  for (const r of state.recipes || []) r.tags = mergeTags(r, { excluded: r.tags_excluded || [] });
  state.tagsVersion = TAGS_VERSION;
  return true;
}
