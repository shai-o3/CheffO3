// WhatsApp message formatting and chat-text cleanup (no Node-specific code; also runs in the browser).

const fmtQty = (q) => (q == null ? '' : String(Math.round(q * 100) / 100));

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
