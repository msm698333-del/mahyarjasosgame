// ─── کاتالوگ آواتارها و استیکرها ───
// a01..a24 — هشت آواتار اول رایگان؛ بقیه با سکه قابل خرید.
// فایل‌های SVG در client/assets/avatars/ با همین شناسه‌ها قرار دارند.
const AVATARS = [];
for (let i = 1; i <= 24; i++) {
  const id = 'a' + String(i).padStart(2, '0');
  let price = 0;
  if (i > 8 && i <= 14) price = 25;
  else if (i > 14 && i <= 19) price = 40;
  else if (i > 19) price = 60;
  AVATARS.push({ id, price });
}

const FREE_AVATARS = AVATARS.filter((a) => a.price === 0).map((a) => a.id);

// s01..s12 — استیکرهای تصویری خنثی و طنز؛ بدون معنای جاسوسی/راهنمای استراتژیک
const STICKERS = ['s01', 's02', 's03', 's04', 's05', 's06', 's07', 's08', 's09', 's10', 's11', 's12'];

const STICKER_NAMES = {
  s01: 'می‌خندم',
  s02: 'خنده‌دار بود',
  s03: 'شوکه‌ام',
  s04: 'خفنم',
  s05: 'خسته‌ام',
  s06: 'پاپ‌کورن گرفتم',
  s07: 'قهوه می‌خورم',
  s08: 'دارم فکر می‌کنم',
  s09: 'عصبانی‌ام',
  s10: 'آفرین!',
  s11: 'دلشوره دارم',
  s12: 'چایی بخور',
};

function avatarById(id) {
  return AVATARS.find((a) => a.id === id) || null;
}

// آیا بازیکن اجازه استفاده از این آواتار را دارد؟ (رایگان یا خریده‌شده)
function canUse(ownedSet, id) {
  const a = avatarById(id);
  if (!a) return false;
  return a.price === 0 || ownedSet.has(id);
}

module.exports = { AVATARS, FREE_AVATARS, STICKERS, STICKER_NAMES, avatarById, canUse };
