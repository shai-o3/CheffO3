// Shopping list in the format of Shufersal's "הזמנה מהירה" (quick order) box:
// one product per line, product names only (no headers, checkboxes or amounts).

// Where the button sends the user. Shufersal's app opens shufersal.co.il links when installed.
export const SHUFERSAL_QUICK_ORDER_URL = 'https://www.shufersal.co.il/online/he/';

// Things that are not bought in a store.
const NOT_BOUGHT = /^(מים|מי בישול|מי ה|מים רותחים|מים קרים|מי קרח|קרח)( |$)/;

export function shufersalQuickList(items) {
  const seen = new Set();
  const lines = [];
  for (const it of items) {
    if (it.checked) continue;
    const full = String(it.search_term || it.name || '').replace(/\s+/g, ' ').trim();
    // "מלח ופלפל שחור" is two products in the store.
    const names = /^מלח ופלפל/.test(full) ? ['מלח', full.replace(/^מלח ו/, '')] : [full];
    for (const name of names) {
      if (!name || NOT_BOUGHT.test(name)) continue;
      const key = name.replace(/[^֐-׿a-z0-9 ]/gi, '');
      if (seen.has(key)) continue;
      seen.add(key);
      lines.push(name);
    }
  }
  return lines.join('\n');
}
