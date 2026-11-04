// "Send to Grok": opens the phone's mail app with the shopping list addressed to the
// user's Grok email. A web page can't send mail from the user's mailbox by itself,
// so the message is prepared and the user taps Send.

const KEY = 'cheffo3-grok-email';

/** The saved Grok email: from the account, or (no accounts: local server/demo) this browser. */
export function getGrokEmail(user) {
  if (user) return user.grokEmail || '';
  try { return localStorage.getItem(KEY) || ''; } catch { return ''; }
}

export function saveLocalGrokEmail(email) {
  try { localStorage.setItem(KEY, email); } catch { /* storage blocked */ }
}

export const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || '').trim());

export function grokMailto(email, list) {
  const subject = encodeURIComponent('רשימת קניות');
  const body = encodeURIComponent(list);
  return `mailto:${encodeURIComponent(email.trim())}?subject=${subject}&body=${body}`;
}
