// ─── ابزارهای عمومی ───
const crypto = require('crypto');

// حروف/اعداد بدون ابهام برای کد لابی (بدون I, O, 0, 1)
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function rid(len = 6) {
  const b = crypto.randomBytes(len);
  let s = '';
  for (let i = 0; i < len; i++) s += CODE_ALPHABET[b[i] % CODE_ALPHABET.length];
  return s;
}

function pid() {
  return 'p_' + crypto.randomBytes(12).toString('hex');
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function now() {
  return Date.now();
}

// پاکسازی متن ورودی کاربر (کنترل‌کاراکترها حذف + محدود طول)
function cleanText(s, maxLen = 200) {
  if (typeof s !== 'string') return '';
  return s
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

// نرمال‌سازی فارسی برای مقایسه حدس کلمه (ی/ک، اعراب، نیم‌فاصله، فاصله)
function normalizeFa(s) {
  return (s || '')
    .toLowerCase()
    .replace(/\u064A/g, '\u06CC') // ي → ی
    .replace(/\u0643/g, '\u06A9') // ك → ک
    .replace(/[\u200c\u200e\u200f]/g, '')
    .replace(/[\u064B-\u0652\u0670\u0640]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function err(code, msg) {
  const e = new Error(msg || code);
  e.code = code;
  e.msg = msg || code;
  return e;
}

module.exports = { rid, pid, pick, shuffle, now, cleanText, normalizeFa, err };
