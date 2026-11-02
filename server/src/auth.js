// Authentication helpers: password hashing, signed session tokens and Google ID-token
// verification. Uses only node:crypto (no external services besides Google's public keys).

import crypto from 'node:crypto';

// ------------------------------------------------------------------ passwords (scrypt)

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password, stored) {
  const [kind, n, saltB64, hashB64] = String(stored || '').split('$');
  if (kind !== 'scrypt') return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = crypto.scryptSync(String(password), Buffer.from(saltB64, 'base64'), expected.length, { N: Number(n), r: SCRYPT.r, p: SCRYPT.p });
  return crypto.timingSafeEqual(actual, expected);
}

export function passwordProblem(password) {
  if (String(password || '').length < 8) return 'הסיסמה צריכה להכיל לפחות 8 תווים';
  return null;
}

export const normalizeEmail = (email) => String(email || '').trim().toLowerCase();
export const validEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

// ------------------------------------------------------------------ sessions

const b64url = (buf) => Buffer.from(buf).toString('base64url');

/** Signed, stateless session token: base64url(payload).signature */
export function signSession(payload, secret, maxAgeDays = 60) {
  const body = b64url(JSON.stringify({ ...payload, exp: Date.now() + maxAgeDays * 864e5 }));
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifySession(token, secret) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    return payload.exp > Date.now() ? payload : null;
  } catch {
    return null;
  }
}

export function readCookie(header, name) {
  const part = String(header || '').split(/;\s*/).find((c) => c.startsWith(`${name}=`));
  return part ? decodeURIComponent(part.slice(name.length + 1)) : '';
}

// ------------------------------------------------------------------ Google sign-in

const GOOGLE_ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];
let jwksCache = { keys: null, at: 0 };

async function googleKeys() {
  const url = process.env.GOOGLE_JWKS_URL || 'https://www.googleapis.com/oauth2/v3/certs';
  if (jwksCache.keys && Date.now() - jwksCache.at < 3600e3 && jwksCache.url === url) return jwksCache.keys;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Google keys ${res.status}`);
  const { keys } = await res.json();
  jwksCache = { keys, at: Date.now(), url };
  return keys;
}

/**
 * Verify a Google Identity Services ID token (JWT, RS256) and return its claims
 * ({ sub, email, name, picture }). Throws on any problem.
 */
export async function verifyGoogleIdToken(idToken, clientId) {
  const [h, p, s] = String(idToken || '').split('.');
  if (!h || !p || !s) throw new Error('bad token');
  const header = JSON.parse(Buffer.from(h, 'base64url').toString());
  if (header.alg !== 'RS256') throw new Error('bad alg');
  const jwk = (await googleKeys()).find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('unknown key');
  const ok = crypto.verify('RSA-SHA256', Buffer.from(`${h}.${p}`), crypto.createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(s, 'base64url'));
  if (!ok) throw new Error('bad signature');
  const claims = JSON.parse(Buffer.from(p, 'base64url').toString());
  if (!GOOGLE_ISSUERS.includes(claims.iss)) throw new Error('bad issuer');
  if (claims.aud !== clientId) throw new Error('bad audience');
  if (claims.exp * 1000 < Date.now()) throw new Error('expired');
  if (!claims.email || claims.email_verified === false) throw new Error('email not verified');
  return claims;
}

/** Is this email allowed to register? ALLOWED_EMAILS: comma list of emails and/or "@domain.com". */
export function emailAllowed(email) {
  const list = String(process.env.ALLOWED_EMAILS || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
  if (!list.length) return true;
  return list.some((rule) => (rule.startsWith('@') ? email.endsWith(rule) : email === rule));
}
