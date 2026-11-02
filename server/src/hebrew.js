// Hebrew text helpers: ingredient categories, normalization and a heuristic recipe parser
// used when no AI key is configured.

export const INGREDIENT_CATEGORIES = [
  'ירקות ופירות',
  'בשר ועוף',
  'דגים',
  'מוצרי חלב וביצים',
  'לחם ומאפים',
  'קמח ואפייה',
  'דגנים, פסטה ואורז',
  'קטניות',
  'שימורים ורטבים',
  'תבלינים',
  'שמנים וחומץ',
  'אגוזים ופירות יבשים',
  'מתוקים',
  'קפואים',
  'משקאות',
  'אחר',
];

export const RECIPE_CATEGORIES = [
  'ארוחת בוקר', 'מנות ראשונות', 'סלטים', 'מרקים', 'עיקריות', 'תוספות',
  'מאפים', 'קינוחים', 'עוגות', 'משקאות', 'רטבים וממרחים', 'אחר',
];

export const DIFFICULTIES = ['קל', 'בינוני', 'מאתגר'];

// Basic staples that are usually at home; ignored by default in "what can I cook".
export const STAPLES = ['מלח', 'פלפל שחור', 'פלפל', 'מים', 'שמן', 'שמן זית', 'סוכר'];

const KEYWORD_CATEGORY = [
  [/רסק|רוטב|שימורי|קטשופ|מיונז|חרדל|סויה|טחינה|ציר |אבקת מרק|חלב קוקוס|קופסה|קופסת/, 'שימורים ורטבים'],
  [/פלפל שחור|פלפל לבן|פפריקה|צ'ילי גרוס/, 'תבלינים'],
  [/עגבני|מלפפו|בצל|שום|גזר|תפוח|לימון|פטרוזיל|כוסבר|שמיר|נענע|חסה|כרוב|פלפל (אדום|ירוק|צהוב)|גמב|קישוא|חציל|תפו"?א|תפוחי אדמה|בטטה|פטריו|תרד|סלרי|אבוקדו|בננה|תות|ענב|מנגו|אגס|דלעת|ברוקולי|כרובית|ג'ינג'ר|צנון|סלק|תמר(?!ים יבש)|רימון|ליים|תפוז/, 'ירקות ופירות'],
  [/עוף|בקר|בשר|כבש|הודו|שניצל|כבד|נקניק|פרגית|חזה|שוקיים|כנפיים|טחון/, 'בשר ועוף'],
  [/סלמון|טונה|דג|אמנון|לברק|דניס|בקלה|שרימפס/, 'דגים'],
  [/חלב|גבינ|חמאה|שמנת|יוגורט|ביצ|לבנה|קוטג'|מוצרל|פרמזן|ריקוטה|צפתית|פטה|שמנת/, 'מוצרי חלב וביצים'],
  [/לחם|פיתה|לחמני|בצק|טורטי|פירורי לחם|פרורי לחם|חלה/, 'לחם ומאפים'],
  [/קמח|שמרים|אבקת אפייה|סודה לשתייה|וניל|קקאו|קורנפלור|עמילן|ג'לטין/, 'קמח ואפייה'],
  [/אורז|פסטה|ספגטי|פתיתים|קוסקוס|בורגול|קינואה|שיבולת|אטריות|פנה|לזניה|ניוקי/, 'דגנים, פסטה ואורז'],
  [/חומוס|עדשים|שעועית|אפונה|פול|גרגירי/, 'קטניות'],
  [/רסק|רוטב|שימורי|קטשופ|מיונז|חרדל|סויה|טחינה|ציר|אבקת מרק|חלב קוקוס/, 'שימורים ורטבים'],
  [/מלח|פלפל שחור|פפריקה|כמון|כורכום|קינמון|אורגנו|בזיליקום יבש|טימין|הל|זעתר|בהרט|ציפורן|אגוז מוסקט|צ'ילי|זרעי|עלי דפנה|ראס אל|חוואיג'/, 'תבלינים'],
  [/שמן|חומץ/, 'שמנים וחומץ'],
  [/אגוז|שקד|בוטנ|קשיו|פקאן|צימוק|תמרים יבש|חמוציות|פיסטוק|שומשום/, 'אגוזים ופירות יבשים'],
  [/סוכר|דבש|סילאן|שוקולד|ריבה|מייפל|ממתיק/, 'מתוקים'],
  [/קפוא/, 'קפואים'],
  [/יין|בירה|מיץ|סודה|קפה|תה/, 'משקאות'],
];

export function guessCategory(name = '') {
  for (const [re, cat] of KEYWORD_CATEGORY) if (re.test(name)) return cat;
  return 'אחר';
}

const EMOJI_MAP = [
  [/עגבני/, '🍅'], [/מלפפו/, '🥒'], [/בצל/, '🧅'], [/שום/, '🧄'], [/גזר/, '🥕'],
  [/תפוח אדמה|תפוחי אדמה|תפו"?א/, '🥔'], [/תפוח/, '🍎'], [/לימון|ליים/, '🍋'],
  [/פלפל/, '🫑'], [/חציל/, '🍆'], [/אבוקדו/, '🥑'], [/ברוקולי/, '🥦'], [/בננה/, '🍌'],
  [/תות/, '🍓'], [/פטריו/, '🍄'], [/חסה|תרד|פטרוזיל|כוסבר|שמיר|נענע|בזיליקום/, '🌿'],
  [/ביצ/, '🥚'], [/חלב|שמנת/, '🥛'], [/גבינ|פרמזן|מוצרל/, '🧀'], [/חמאה/, '🧈'],
  [/עוף|פרגית|הודו/, '🍗'], [/בשר|בקר|טחון/, '🥩'], [/דג|סלמון|טונה/, '🐟'],
  [/לחם|פיתה|חלה/, '🍞'], [/קמח/, '🌾'], [/אורז/, '🍚'], [/פסטה|ספגטי|אטריות/, '🍝'],
  [/שוקולד|קקאו/, '🍫'], [/סוכר/, '🧂'], [/מלח/, '🧂'], [/דבש|סילאן/, '🍯'],
  [/שמן|חומץ/, '🫒'], [/אגוז|שקד|בוטנ/, '🥜'], [/חומוס|עדשים|שעועית/, '🫘'],
  [/יין/, '🍷'], [/מים/, '💧'], [/תפוז/, '🍊'], [/מנגו/, '🥭'], [/קוקוס/, '🥥'],
  [/תירס/, '🌽'], [/ג'ינג'ר/, '🫚'], [/צ'ילי/, '🌶️'],
];

export function guessEmoji(name = '') {
  for (const [re, e] of EMOJI_MAP) if (re.test(name)) return e;
  return '🥄';
}

/** Normalize a Hebrew ingredient name for matching: drop niqqud, punctuation, and common modifiers. */
export function normalizeName(s = '') {
  return s
    .replace(/[֑-ׇ]/g, '')
    .replace(/["'`״׳().,\-–]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const PLURALS = [[/ים$/, ''], [/ות$/, 'ה'], [/ות$/, '']];

/** Rough Hebrew stemming: returns a set of variants for a single word. */
function wordVariants(w) {
  const out = new Set([w]);
  if (w.length > 2 && w.startsWith('ה')) out.add(w.slice(1));
  for (const [re, rep] of PLURALS) if (re.test(w) && w.length > 3) out.add(w.replace(re, rep));
  if (w.endsWith('ה') && w.length > 2) out.add(w.slice(0, -1));
  if (w.endsWith('ת') && w.length > 3) out.add(w.slice(0, -1));
  return [...out];
}

/** Does pantry item `have` satisfy ingredient `need`? */
export function ingredientMatches(need, have) {
  const a = normalizeName(need);
  const b = normalizeName(have);
  if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  const aw = a.split(' ').flatMap(wordVariants);
  const bw = b.split(' ').flatMap(wordVariants);
  // first (head) word of the pantry item must match one of the ingredient words
  const head = normalizeName(have).split(' ')[0];
  return wordVariants(head).some((h) => aw.includes(h)) && bw.some((x) => aw.includes(x));
}

const FRACTIONS = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 };
const WORD_NUMBERS = {
  'חצי': 0.5, 'רבע': 0.25, 'שליש': 1 / 3, 'אחד': 1, 'אחת': 1, 'שתיים': 2, 'שניים': 2, 'שתי': 2, 'שני': 2,
  'שלוש': 3, 'שלושה': 3, 'ארבע': 4, 'ארבעה': 4, 'חמש': 5, 'חמישה': 5, 'שש': 6, 'שישה': 6,
};
export const UNITS = [
  'כוסות', 'כוס', 'כפות', 'כף', 'כפיות', 'כפית', 'גרם', 'ג\'', 'ק"ג', 'קילו', 'קילוגרם', 'מ"ל', 'ליטר', 'ליטרים',
  'יחידות', 'יחידה', 'חבילות', 'חבילה', 'שקיות', 'שקית', 'קופסאות', 'קופסה', 'קופסת', 'פחית', 'פחיות', 'שיני', 'שן', 'צרור', 'צרורות',
  'קורט', 'קמצוץ', 'פרוסות', 'פרוסה', 'ענפים', 'ענף', 'עלים', 'מיכל', 'גביע', 'גביעים', 'בקבוק', 'כוסית',
];

function parseNumber(tok) {
  if (!tok) return null;
  if (FRACTIONS[tok] != null) return FRACTIONS[tok];
  if (WORD_NUMBERS[tok] != null) return WORD_NUMBERS[tok];
  let m = tok.match(/^(\d+)([½¼¾⅓⅔⅛])$/);
  if (m) return Number(m[1]) + FRACTIONS[m[2]];
  m = tok.match(/^(\d+)\/(\d+)$/);
  if (m) return Number(m[1]) / Number(m[2]);
  m = tok.match(/^\d+(\.\d+)?$/);
  if (m) return Number(tok);
  return null;
}

/** Parse a single ingredient line like "2 כוסות קמח מנופה" into parts. */
export function parseIngredientLine(line) {
  let s = line.replace(/^[\s•\-*·–\d]+[.)]\s+/, '').replace(/^[•\-*·–]\s*/, '').trim();
  let note = '';
  const paren = s.match(/\(([^)]*)\)/);
  if (paren) {
    note = paren[1].trim();
    s = s.replace(paren[0], ' ').trim();
  }
  const tokens = s.split(/\s+/);
  let quantity = null;
  // "1 1/2", "1.5", "½", "חצי"
  const q1 = parseNumber(tokens[0]);
  if (q1 != null) {
    quantity = q1;
    tokens.shift();
    const q2 = parseNumber(tokens[0]);
    if (q2 != null && q2 < 1) {
      quantity += q2;
      tokens.shift();
    }
  } else {
    const range = tokens[0]?.match(/^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/);
    if (range) {
      quantity = Number(range[2]);
      tokens.shift();
    }
  }
  let unit = '';
  const rest = tokens.join(' ');
  for (const u of UNITS) {
    if (rest === u || rest.startsWith(u + ' ')) {
      unit = u;
      tokens.splice(0, u.split(' ').length);
      break;
    }
  }
  let name = tokens.join(' ').replace(/^של\s+/, '').trim();
  const comma = name.indexOf(',');
  if (comma > 0) {
    note = [name.slice(comma + 1).trim(), note].filter(Boolean).join(', ');
    name = name.slice(0, comma).trim();
  }
  if (!name) name = line.trim();
  return { name, quantity, unit, note, category: guessCategory(name), emoji: guessEmoji(name), search_term: name, section: '' };
}

const ING_HEAD = /^(מצרכים|רכיבים|חומרים|מרכיבים|ingredients)\s*:?\s*$/i;
const STEP_HEAD = /^(אופן ההכנה|אופן הכנה|הוראות הכנה|הוראות|הכנה|שלבי הכנה|instructions|directions|method)\s*:?\s*$/i;

/**
 * Heuristic, no-AI recipe parser for pasted Hebrew text. Expects (loosely) a title line,
 * an ingredients section and an instructions section.
 */
export function heuristicParse(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const recipe = {
    title: '', description: '', emoji: '🍽️', category: 'עיקריות', cuisine: '', prep_minutes: null, cook_minutes: null,
    servings: 4, difficulty: 'בינוני', tags: [], notes: '', ingredients: [], steps: [],
  };
  let mode = 'head';
  let section = '';
  for (const line of lines) {
    if (ING_HEAD.test(line)) { mode = 'ing'; continue; }
    if (STEP_HEAD.test(line)) { mode = 'steps'; continue; }
    const servings = line.match(/(\d+)\s*(מנות|סועדים|יחידות)/);
    if (mode === 'head') {
      if (!recipe.title) recipe.title = line.replace(/^#+\s*/, '');
      else if (servings && line.length < 40) recipe.servings = Number(servings[1]);
      else if (/^(\d|[½¼¾]|חצי|רבע)/.test(line) && line.length < 60) { mode = 'ing'; recipe.ingredients.push(parseIngredientLine(line)); }
      else recipe.description += (recipe.description ? ' ' : '') + line;
      continue;
    }
    if (mode === 'ing') {
      if (/:$/.test(line) && line.length < 40) { section = line.replace(/:$/, ''); continue; }
      const ing = parseIngredientLine(line);
      ing.section = section;
      recipe.ingredients.push(ing);
    } else {
      recipe.steps.push({ text: line.replace(/^\d+[.)]\s*/, ''), tip: '', minutes: null });
    }
  }
  if (!recipe.title) recipe.title = 'מתכון חדש';
  // If no explicit instructions header, long sentences are probably steps.
  if (!recipe.steps.length) {
    const moved = recipe.ingredients.filter((i) => i.name.length > 45);
    recipe.ingredients = recipe.ingredients.filter((i) => i.name.length <= 45);
    recipe.steps = moved.map((m) => ({ text: m.name, tip: '', minutes: null }));
  }
  recipe.category = guessRecipeCategory(recipe.title);
  return recipe;
}

function guessRecipeCategory(title) {
  if (/עוג/.test(title)) return 'עוגות';
  if (/סלט/.test(title)) return 'סלטים';
  if (/מרק/.test(title)) return 'מרקים';
  if (/עוגי|בורקס|פשטיד|לחם|חלה|מאפ/.test(title)) return 'מאפים';
  if (/קינוח|מוס|פודינג|גלידה/.test(title)) return 'קינוחים';
  if (/שקשוק|חביתה|פנקייק/.test(title)) return 'ארוחת בוקר';
  return 'עיקריות';
}

/**
 * Cut a document into recipe chunks given the line each recipe starts with
 * (found in order; unmatched markers are skipped).
 */
export function cutByStartLines(text, starts) {
  const positions = [];
  let from = 0;
  for (const s of starts) {
    const needle = String(s.first_line || '').trim();
    let pos = needle ? text.indexOf(needle, from) : -1;
    if (pos === -1 && s.title) pos = text.indexOf(String(s.title).trim(), from);
    if (pos === -1) continue;
    // start at the beginning of that line
    const lineStart = text.lastIndexOf('\n', pos) + 1;
    positions.push({ pos: lineStart, title: s.title });
    from = pos + needle.length;
  }
  return positions.map((p, i) => ({
    title: p.title || '',
    text: text.slice(p.pos, i + 1 < positions.length ? positions[i + 1].pos : undefined).trim(),
  })).filter((c) => c.text);
}

/**
 * No-AI fallback: split a document into recipes. Every "מצרכים:" heading marks a recipe;
 * the recipe starts at the short title/description lines just above it (blank lines are
 * ignored, since Word exports put one between every paragraph).
 */
export function splitRecipesHeuristic(text) {
  const lines = text.split(/\r?\n/);
  const headings = lines.map((l, i) => (ING_HEAD.test(l.trim()) ? i : -1)).filter((i) => i >= 0);
  if (!headings.length) {
    return text.trim() ? [{ title: lines.find((l) => l.trim())?.trim() || '', text: text.trim() }] : [];
  }
  const looksLikeHeader = (l) => {
    const t = l.trim();
    return t && t.length <= 80 && !/[.:!?]$/.test(t) && !ING_HEAD.test(t) && !STEP_HEAD.test(t);
  };
  // Word exports put a blank line between every paragraph; then blank lines carry no meaning.
  const spaced = lines.filter((l) => !l.trim()).length / lines.length > 0.35;
  const maxTake = spaced ? 2 : 3;
  const starts = headings.map((h, k) => {
    const floor = k ? headings[k - 1] + 1 : 0;
    let start = h;
    let taken = 0;
    for (let j = h - 1; j >= floor && taken < maxTake; j--) {
      if (!lines[j].trim()) {
        if (!spaced && taken) break;
        continue;
      }
      if (!looksLikeHeader(lines[j])) break;
      start = j;
      taken++;
    }
    return start;
  });
  if (lines.slice(0, starts[0]).join('').trim() === '') starts[0] = 0;
  return starts.map((st, k) => {
    const chunk = lines.slice(st, k + 1 < starts.length ? starts[k + 1] : undefined).join('\n').replace(/\n{3,}/g, '\n\n').trim();
    return { title: chunk.split('\n')[0].replace(/^#+\s*/, '').trim(), text: chunk };
  }).filter((c) => c.text);
}
