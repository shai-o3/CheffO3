// WhatsApp Business Cloud API calls (fetch only – shared by the Express server and the Netlify function).
import crypto from 'node:crypto';

const GRAPH = 'https://graph.facebook.com/v21.0';

export const whatsappConfigured = () =>
  !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_VERIFY_TOKEN);

// ---------------------------------------------------------------- Cloud API bot

export async function graph(path, init = {}) {
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

export async function downloadMedia(mediaId) {
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

export const HELP = `👋 שלום! אני CheffO3 – ספר המתכונים שלך.
• שלחו לי מתכון כטקסט, העבירו הודעה עם מתכון, או שלחו צילום מסך / תמונה – ואשמור אותו מסודר באפליקציה.
• כתבו "רשימה" כדי לקבל את רשימת הקניות.`;

export function allowed(from) {
  const list = (process.env.WHATSAPP_ALLOWED_NUMBERS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return !list.length || list.includes(from);
}


/**
 * Verify Meta's X-Hub-Signature-256 header (only when WHATSAPP_APP_SECRET is set).
 * @param {string} rawBody exact request body
 */
export function signatureValid(rawBody, header) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return true;
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(String(header || ''));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Pull the incoming messages out of a webhook payload. */
export const incomingMessages = (body) =>
  body?.entry?.flatMap((e) => e.changes?.flatMap((c) => c.value?.messages || []) || []) || [];
