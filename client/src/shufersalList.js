// Shopping list in the format of Shufersal's "הזמנה מהירה" (quick order) box:
// one product per line, product names only (no headers, checkboxes or amounts),
// plus the best way to open Shufersal on the current device.

const SHUFERSAL_WEB_URL = 'https://www.shufersal.co.il/online/he/';
const ANDROID_PACKAGE = 'com.Shufersal'; // Google Play id of the Shufersal app
// iPhone: the Shufersal app's custom URL scheme (confirmed on a real iPhone: Safari opens the app).
// Shufersal web links don't open the app, so the scheme is used instead.
const IOS_APP_URL = 'shufersalapp://';

const isAndroid = () => /Android/i.test(navigator.userAgent);
const isIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/**
 * How to open Shufersal here:
 *  - Android: an intent link that launches the installed app (falls back to the website)
 *  - iPhone: the app's URL scheme if known, otherwise null (open the app manually)
 *  - computer: the website
 */
export function shufersalTarget() {
  if (isAndroid()) {
    const fallback = encodeURIComponent(SHUFERSAL_WEB_URL);
    return {
      kind: 'android',
      href: `intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=${ANDROID_PACKAGE};S.browser_fallback_url=${fallback};end`,
    };
  }
  if (isIOS()) return { kind: 'ios', href: IOS_APP_URL || null, web: SHUFERSAL_WEB_URL };
  return { kind: 'web', href: SHUFERSAL_WEB_URL };
}

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
