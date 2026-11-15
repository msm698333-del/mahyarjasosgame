// ─── هویت بدون ثبت‌نام: توکن امضاشده + کوکی امن ───
// شناسه تصادفی + امضای HMAC سمت سرور؛ موجودی و هویت فقط از طریق سرور تغییر می‌کند.
const crypto = require('crypto');
const CFG = require('./config');

const COOKIE = 'spy_token';
const MAX_AGE = 60 * 60 * 24 * 365; // یک سال

function sign(id) {
  return crypto.createHmac('sha256', CFG.SECRET).update(id).digest('base64url').slice(0, 24);
}

function tokenFor(id) {
  return id + '.' + sign(id);
}

function verifyToken(token) {
  if (typeof token !== 'string') return null;
  const i = token.lastIndexOf('.');
  if (i <= 0) return null;
  const id = token.slice(0, i);
  const sig = token.slice(i + 1);
  const expected = sign(id);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  try {
    return crypto.timingSafeEqual(a, b) ? id : null;
  } catch {
    return null;
  }
}

function parseCookies(header) {
  const out = {};
  (header || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) {
      try {
        out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
      } catch {
        /* ignore */
      }
    }
  });
  return out;
}

function isHttps(req) {
  return req.secure || req.headers['x-forwarded-proto'] === 'https';
}

function setTokenCookie(req, res, token) {
  const parts = [
    `${COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    `Max-Age=${MAX_AGE}`,
    'HttpOnly',
    `SameSite=${isHttps(req) ? 'None' : 'Lax'}`,
  ];
  if (isHttps(req)) parts.push('Secure'); // لازم برای کارکرد بین‌دامنه‌ای (فرانت Tiiny + بک ابری)
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearTokenCookie(req, res) {
  const parts = [`${COOKIE}=`, 'Path=/', 'Max-Age=0', 'HttpOnly', `SameSite=${isHttps(req) ? 'None' : 'Lax'}`];
  if (isHttps(req)) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

// ترتیب اولویت: هدر Bearer (برای فرانت جدا مثل Tiiny) → کوکی (self-host)
function tokenFromReq(req) {
  const h = req.headers.authorization;
  if (h && h.startsWith('Bearer ')) return h.slice(7).trim();
  return parseCookies(req.headers.cookie)[COOKIE] || null;
}

module.exports = { COOKIE, tokenFor, verifyToken, parseCookies, setTokenCookie, clearTokenCookie, tokenFromReq };
