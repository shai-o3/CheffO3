// AI features powered by Claude (Anthropic API):
//  - extract a structured recipe from free text and/or screenshots/photos
//  - suggest new recipes from what's in the pantry
//  - answer questions about a recipe ("ask the chef")
//  - adapt a recipe (vegan, gluten-free, halve, ...)
// Without ANTHROPIC_API_KEY the text parser falls back to a heuristic parser.

import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { INGREDIENT_CATEGORIES, RECIPE_CATEGORIES, DIFFICULTIES, heuristicParse, guessCategory, guessEmoji } from './hebrew.js';

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-5-5';

export const aiEnabled = () => !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

let client;
function getClient() {
  if (!client) {
    client = new Anthropic({
      ...(process.env.ANTHROPIC_TIMEOUT_MS && { timeout: Number(process.env.ANTHROPIC_TIMEOUT_MS) }),
      ...(process.env.ANTHROPIC_MAX_RETRIES && { maxRetries: Number(process.env.ANTHROPIC_MAX_RETRIES) }),
    });
  }
  return client;
}

const IngredientSchema = z.object({
  section: z.string().describe('תת-קבוצה במתכון, למשל "לבצק" או "לציפוי". ריק אם אין'),
  name: z.string().describe('שם המצרך בלבד, בעברית, בלי כמות ויחידה. למשל "קמח תופח"'),
  quantity: z.number().nullable().describe('כמות מספרית (1.5 עבור כוס וחצי). null אם "לפי הטעם" או לא צוין'),
  unit: z.string().describe('יחידת מידה בעברית: כוס, כף, כפית, גרם, ק"ג, מ"ל, ליטר, יחידות, שיני, קורט, חבילה... ריק אם אין'),
  note: z.string().describe('הערה: אופן החיתוך/הכנה, "לפי הטעם", "בטמפ\' החדר" וכו\'. ריק אם אין'),
  category: z.string().describe(`מחלקה בסופרמרקט – אחת מ: ${INGREDIENT_CATEGORIES.join(' | ')}`),
  search_term: z.string().describe('שם מוצר גנרי לחיפוש בסופרמרקט אונליין (שופרסל), למשל "שמנת מתוקה 38%" או "בצל יבש"'),
  emoji: z.string().describe('אימוג\'י אחד שמייצג את המצרך'),
});

const StepSchema = z.object({
  text: z.string().describe('הוראת הכנה אחת ברורה, בעברית'),
  tip: z.string().describe('טיפ קצר לשלב, או ריק'),
  minutes: z.number().nullable().describe('זמן משוער לשלב בדקות, או null'),
});

const RecipeSchema = z.object({
  is_recipe: z.boolean().describe('false אם הקלט אינו מתכון'),
  title: z.string(),
  description: z.string().describe('תיאור מזמין של 1-2 משפטים'),
  emoji: z.string().describe('אימוג\'י אחד שמייצג את המנה'),
  category: z.string().describe(`אחת מ: ${RECIPE_CATEGORIES.join(' | ')}`),
  cuisine: z.string().describe('סגנון מטבח, למשל "ישראלי", "איטלקי". ריק אם לא ידוע'),
  prep_minutes: z.number().nullable(),
  cook_minutes: z.number().nullable(),
  servings: z.number().nullable(),
  difficulty: z.string().describe(`אחת מ: ${DIFFICULTIES.join(' | ')}`),
  tags: z.array(z.string()).describe('2-6 תגיות קצרות: "צמחוני", "ללא גלוטן", "מהיר", "חלבי", "בשרי", "פרווה"...'),
  notes: z.string().describe('הערות כלליות, אחסון, וריאציות. ריק אם אין'),
  ingredients: z.array(IngredientSchema),
  steps: z.array(StepSchema),
});

const SYSTEM = `אתה שף ועורך מתכונים מקצועי באפליקציית מתכונים ישראלית.
המשימה: להפוך קלט (טקסט חופשי, צילומי מסך מאתרים/אינסטגרם/ספרי בישול, או תמונה של מנה) למתכון מובנה ואחיד.
כללים:
- הכל בעברית תקנית. אם המקור בשפה אחרת – תרגם, והמר יחידות אמריקאיות ליחידות מקובלות בישראל (גרם, מ"ל, מעלות צלזיוס).
- הפרד כל מצרך לשורה משלו: שם, כמות מספרית, יחידה והערה. אל תשאיר כמויות בתוך השם.
- כל שלב הכנה – פעולה אחת או שתיים קשורות. שמור על סדר המקור.
- אם התמונה מראה מנה מוכנה ללא מתכון כתוב – שחזר מתכון סביר ומקובל למנה, וציין זאת בהערות.
- אל תמציא מצרכים שלא הופיעו במקור כשהמתכון כתוב במלואו.
- אם הקלט אינו מתכון בכלל, החזר is_recipe=false.`;

function check(response) {
  if (response.stop_reason === 'refusal') {
    throw Object.assign(new Error('הבקשה נדחתה על ידי מנוע הבינה'), { status: 422 });
  }
}

async function parseWithSchema({ system, content, schema, maxTokens = 16000, effort = process.env.AI_EFFORT || 'medium' }) {
  const response = await getClient().beta.messages.parse({
    model: MODEL,
    max_tokens: maxTokens,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort, format: betaZodOutputFormat(schema) },
    system,
    messages: [{ role: 'user', content }],
  });
  check(response);
  if (!response.parsed_output) throw Object.assign(new Error('לא הצלחנו לפענח את תשובת הבינה'), { status: 502 });
  return response.parsed_output;
}

/** Keep model output inside our fixed vocabularies. */
export function normalizeRecipe(r) {
  return {
    ...r,
    category: RECIPE_CATEGORIES.includes(r.category) ? r.category : 'אחר',
    difficulty: DIFFICULTIES.includes(r.difficulty) ? r.difficulty : 'בינוני',
    servings: r.servings || 4,
    ingredients: (r.ingredients || []).map((i) => ({
      ...i,
      category: INGREDIENT_CATEGORIES.includes(i.category) ? i.category : guessCategory(i.name),
      emoji: i.emoji || guessEmoji(i.name),
      search_term: i.search_term || i.name,
    })),
  };
}

/**
 * Extract a structured recipe.
 * @param {{text?: string, images?: {media_type: string, data: string}[], url?: string}} input
 */
export async function extractRecipe({ text = '', images = [] }) {
  if (!aiEnabled()) {
    if (images.length) {
      throw Object.assign(new Error('קריאת מתכון מתמונה דורשת הגדרת ANTHROPIC_API_KEY בשרת'), { status: 400 });
    }
    return { ...heuristicParse(text), _engine: 'heuristic' };
  }
  const content = [
    ...images.map((img) => ({ type: 'image', source: { type: 'base64', media_type: img.media_type, data: img.data } })),
    {
      type: 'text',
      text: text.trim()
        ? `הנה המתכון${images.length ? ' (בנוסף לתמונות המצורפות)' : ''}:\n\n${text}`
        : 'חלץ את המתכון מהתמונות המצורפות.',
    },
  ];
  const recipe = await parseWithSchema({ system: SYSTEM, content, schema: RecipeSchema });
  if (!recipe.is_recipe) throw Object.assign(new Error('לא זוהה מתכון בקלט ששלחת'), { status: 422 });
  const { is_recipe: _ignored, ...rest } = recipe;
  return { ...normalizeRecipe(rest), _engine: 'ai' };
}

const SuggestionsSchema = z.object({
  suggestions: z.array(RecipeSchema.omit({ is_recipe: true }).extend({
    why: z.string().describe('משפט קצר: למה המתכון מתאים למה שיש במקרר'),
    missing: z.array(z.string()).describe('מצרכים שחסרים למשתמש (אם יש)'),
  })),
});

/** Generate new recipe ideas from the user's pantry. */
export async function suggestRecipes({ pantry, preferences = '', count = 3, existingTitles = [] }) {
  if (!aiEnabled()) throw Object.assign(new Error('הצעות מתכונים חכמות דורשות הגדרת ANTHROPIC_API_KEY בשרת'), { status: 400 });
  const text = `מה שיש לי במטבח: ${pantry.join(', ')}.
${preferences ? `העדפות: ${preferences}.` : ''}
הצע ${count} מתכונים מגוונים ומעשיים שמשתמשים בעיקר במה שיש לי (מותר להניח מלח, פלפל, שמן, מים ותבלינים בסיסיים).
${existingTitles.length ? `כבר יש לי את המתכונים האלה, אל תחזור עליהם: ${existingTitles.slice(0, 60).join(', ')}.` : ''}
כל מתכון מלא: מצרכים מפורקים והוראות.`;
  const out = await parseWithSchema({ system: SYSTEM, content: [{ type: 'text', text }], schema: SuggestionsSchema, maxTokens: 32000 });
  return out.suggestions.map(normalizeRecipe);
}

/** Adapt an existing recipe according to an instruction (vegan, gluten free, double, ...). */
export async function adaptRecipe(recipe, instruction) {
  if (!aiEnabled()) throw Object.assign(new Error('התאמת מתכון דורשת הגדרת ANTHROPIC_API_KEY בשרת'), { status: 400 });
  const text = `המתכון המקורי (JSON):\n${JSON.stringify(stripRecipe(recipe))}\n\nבקשת ההתאמה: ${instruction}\n
צור גרסה מותאמת מלאה של המתכון. עדכן כותרת, תגיות והערות בהתאם (ציין בהערות מה שונה).`;
  const { is_recipe: _ignored, ...out } = await parseWithSchema({ system: SYSTEM, content: [{ type: 'text', text }], schema: RecipeSchema });
  return normalizeRecipe(out);
}

/** Free-form Q&A about a recipe. */
export async function askChef(recipe, question, history = []) {
  if (!aiEnabled()) throw Object.assign(new Error('"שאל את השף" דורש הגדרת ANTHROPIC_API_KEY בשרת'), { status: 400 });
  const messages = [
    ...history.slice(-10).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content) })),
    { role: 'user', content: question },
  ];
  const response = await getClient().beta.messages.create({
    model: MODEL,
    max_tokens: 4000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low' },
    system: `אתה שף ביתי ידידותי שעונה בעברית, בקצרה ובאופן מעשי (עד 150 מילים), על שאלות לגבי המתכון הבא:
${JSON.stringify(stripRecipe(recipe))}
תוכל להציע תחליפים, להסביר טכניקות, לחשב כמויות ולתת טיפים. אל תשתמש בכותרות Markdown.`,
    messages,
  });
  check(response);
  return response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
}

function stripRecipe(r) {
  return {
    title: r.title, description: r.description, servings: r.servings, category: r.category, tags: r.tags,
    prep_minutes: r.prep_minutes, cook_minutes: r.cook_minutes, notes: r.notes,
    ingredients: (r.ingredients || []).map(({ section, name, quantity, unit, note }) => ({ section, name, quantity, unit, note })),
    steps: (r.steps || []).map((s) => s.text),
  };
}
