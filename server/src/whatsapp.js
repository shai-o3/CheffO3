// WhatsApp integration.
//
// Outgoing: format a recipe / shopping list as a WhatsApp-friendly message (used by the
//   client for wa.me share links, and by the bot for replies).
// Incoming: a WhatsApp Business Cloud API webhook. Send the bot a recipe as text, a
//   screenshot/photo (with optional caption) or a forwarded message – it extracts the
//   recipe with AI, saves it and replies with a link. Text commands:
//     "רשימה" / "רשימת קניות"  -> replies with the current shopping list
//     "עזרה"                   -> help
//
// Required env for the bot: WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_VERIFY_TOKEN.
// Optional: WHATSAPP_ALLOWED_NUMBERS (comma separated, e.g. 972501234567), APP_PUBLIC_URL.

import { extractRecipe } from './ai.js';
import { createRecipe } from './recipes.js';
import { listItems } from './shopping.js';

const GRAPH = 'https://graph.facebook.com/v21.0';
const fmtQty = (q) => (q == null ? '' : String(Math.round(q * 100) / 100));

export const whatsappConfigured = () =>
  !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_VERIFY_TOKEN);

/** Strip WhatsApp chat-export artifacts ("[1.11.26, 10:05] Dana: ...", "<Media omitted>") and *bold* markers. */
export function cleanWhatsAppText(text = '') {
  return text
    .split(/\r?\n/)
    .map((l) => l
      .replace(/^‎?\[?\d{1,2}[./]\d{1,2}[./]\d{2,4},?\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s?[AP]M)?\]?\s*(?:-\s*)?[^:]{1,40}:\s*/, '')
      .replace(/<(?:Media omitted|המדיה לא נכללה)>|‎?(?:image|תמונה) omitted/gi, '')
      .replace(/(^|\s)[*_~]([^*_~\n]+)[*_~](?=\s|$|[:.,])/g, '$1$2')
      .replace(/^\s*(?:Forwarded|הועבר)\s*$/i, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function recipeToWhatsApp(recipe, { servings, url } = {}) {
  const factor = servings && recipe.servings ? servings / recipe.servings : 1;
  const lines = [`*${recipe.emoji || '🍽️'} ${recipe.title}*`];
  if (recipe.description) lines.push(`_${recipe.description}_`);
  const meta = [
    (servings || recipe.servings) && `🍽️ ${servings || recipe.servings} מנות`,
    recipe.prep_minutes && `⏱️ הכנה ${recipe.prep_minutes} דק'`,
    recipe.cook_minutes && `🔥 בישול ${recipe.cook_minutes} דק'`,
  ].filter(Boolean);
  if (meta.length) lines.push(meta.join(' | '));
  lines.push('', '*🧺 מצרכים:*');
  let section = '';
  for (const i of recipe.ingredients || []) {
    if (i.section && i.section !== section) { section = i.section; lines.push(`_${section}:_`); }
    const q = i.quantity != null ? fmtQty(i.quantity * factor) : '';
    lines.push(`• ${[q, i.unit, i.name].filter(Boolean).join(' ')}${i.note ? ` (${i.note})` : ''}`);
  }
  lines.push('', '*👩‍🍳 אופן ההכנה:*');
  (recipe.steps || []).forEach((s, idx) => lines.push(`${idx + 1}. ${s.text}`));
  if (recipe.notes) lines.push('', `📝 ${recipe.notes}`);
  if (url) lines.push('', url);
  return lines.join('\n');
}

export function shoppingListToWhatsApp(items) {
  const open = items.filter((i) => !i.checked);
  if (!open.length) return '🛒 רשימת הקניות ריקה';
  const lines = ['*🛒 רשימת קניות*'];
  let cat = '';
  for (const i of open) {
    if (i.category !== cat) { cat = i.category; lines.push('', `*${cat}*`); }
    lines.push(`☐ ${i.name}${i.quantity != null || i.unit ? ` – ${[fmtQty(i.quantity), i.unit].filter(Boolean).join(' ')}` : ''}`);
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------- Cloud API bot

async function graph(path, init = {}) {
  const res = await fetch(`${GRAPH}/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, ...(init.headers || {}) },
  });
  if (!res.ok) throw new Error(`WhatsApp API ${res.status}: ${await res.text()}`);
  return res;
}

export async function sendText(to, body) {
  await graph(`${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: body.slice(0, 4000), preview_url: true } }),
  });
}

async function downloadMedia(mediaId) {
  const meta = await (await graph(mediaId)).json();
  const res = await fetch(meta.url, { headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` } });
  if (!res.ok) throw new Error(`WhatsApp media download failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return { media_type: meta.mime_type?.split(';')[0] || 'image/jpeg', data: buf.toString('base64') };
}

/** GET verification handshake. */
export function verifyWebhook(query) {
  if (query['hub.mode'] === 'subscribe' && query['hub.verify_token'] === process.env.WHATSAPP_VERIFY_TOKEN) {
    return query['hub.challenge'];
  }
  return null;
}

const HELP = `👋 שלום! אני CheffO3 – ספר המתכונים שלך.
• שלחו לי מתכון כטקסט, העבירו הודעה עם מתכון, או שלחו צילום מסך / תמונה – ואשמור אותו מסודר באפליקציה.
• כתבו "רשימה" כדי לקבל את רשימת הקניות.`;

// Group a burst of messages from the same sender (e.g. a few screenshots + caption) into one recipe.
const pending = new Map();
const BURST_MS = 4000;

function allowed(from) {
  const list = (process.env.WHATSAPP_ALLOWED_NUMBERS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return !list.length || list.includes(from);
}

/** Handle POSTed webhook payload. Returns immediately; processing is async. */
export function handleWebhook(body) {
  const messages = body?.entry?.flatMap((e) => e.changes?.flatMap((c) => c.value?.messages || []) || []) || [];
  for (const msg of messages) {
    const from = msg.from;
    if (!allowed(from)) continue;
    const text = msg.text?.body?.trim() || '';
    if (msg.type === 'text' && /^(רשימה|רשימת קניות|קניות)$/.test(text)) {
      sendText(from, shoppingListToWhatsApp(listItems())).catch(console.error);
      continue;
    }
    if (msg.type === 'text' && /^(עזרה|help|היי|שלום|hi)$/i.test(text)) {
      sendText(from, HELP).catch(console.error);
      continue;
    }
    const entry = pending.get(from) || { texts: [], mediaIds: [], timer: null };
    if (msg.type === 'text') entry.texts.push(text);
    if (msg.type === 'image' || (msg.type === 'document' && /^image\//.test(msg.document?.mime_type || ''))) {
      const m = msg.image || msg.document;
      entry.mediaIds.push(m.id);
      if (m.caption) entry.texts.push(m.caption);
    }
    if (!entry.texts.length && !entry.mediaIds.length) continue;
    clearTimeout(entry.timer);
    entry.timer = setTimeout(() => { pending.delete(from); processRecipe(from, entry).catch(console.error); }, BURST_MS);
    pending.set(from, entry);
  }
}

async function processRecipe(from, { texts, mediaIds }) {
  try {
    await sendText(from, '⏳ קיבלתי! מפענח את המתכון...');
    const images = [];
    for (const id of mediaIds.slice(0, 5)) images.push(await downloadMedia(id));
    const parsed = await extractRecipe({ text: cleanWhatsAppText(texts.join('\n\n')), images });
    const recipe = createRecipe({ ...parsed, source: 'WhatsApp' });
    const base = process.env.APP_PUBLIC_URL?.replace(/\/$/, '');
    await sendText(from, `✅ המתכון "${recipe.title}" נשמר (${recipe.ingredients.length} מצרכים, ${recipe.steps.length} שלבים).${base ? `\n${base}/recipes/${recipe.id}` : ''}`);
  } catch (e) {
    await sendText(from, `😕 לא הצלחתי לשמור את המתכון: ${e.message}`).catch(() => {});
  }
}
