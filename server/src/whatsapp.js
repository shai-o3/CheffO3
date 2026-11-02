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
import { cleanWhatsAppText, shoppingListToWhatsApp } from './whatsappFormat.js';

export { cleanWhatsAppText, recipeToWhatsApp, shoppingListToWhatsApp } from './whatsappFormat.js';
import { sendText, downloadMedia, HELP, allowed, incomingMessages } from './whatsappCloud.js';

export { whatsappConfigured, verifyWebhook } from './whatsappCloud.js';

// Group a burst of messages from the same sender (e.g. a few screenshots + caption) into one recipe.
const pending = new Map();
const BURST_MS = 4000;

/** Handle POSTed webhook payload. Returns immediately; processing is async. */
export function handleWebhook(body) {
  const messages = incomingMessages(body);
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
