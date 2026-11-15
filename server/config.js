// ─── تنظیمات سرور — همه از متغیرهای محیطی با پیش‌فرض منطقی ───
const path = require('path');

const ROOT = path.join(__dirname, '..');

function num(name, def) {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : def;
}
function int(name, def) {
  return Math.floor(num(name, def));
}

const CFG = {
  ROOT,
  PORT: int('PORT', 3003),
  SECRET: process.env.SECRET || 'spy-dev-secret-please-change-in-production-0192837465',
  DB_PATH: process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : path.join(ROOT, 'data', 'spy.db'),
  SERVE_CLIENT: (process.env.SERVE_CLIENT || 'true') !== 'false',
  CLIENT_DIR: path.join(ROOT, 'client'),
  ALLOWED_ORIGIN: process.env.ALLOWED_ORIGIN || '',

  // ─── اقتصاد ───
  START_COINS: int('START_COINS', 60),
  FREE_ENTRIES: int('FREE_ENTRIES', 4),
  ENTRY_FEE_DEFAULT: int('ENTRY_FEE_DEFAULT', 10),
  ENTRY_FEE_MIN: int('ENTRY_FEE_MIN', 0),
  ENTRY_FEE_MAX: int('ENTRY_FEE_MAX', 100),
  MATCH_WIN_REWARD: int('MATCH_WIN_REWARD', 50),
  MATCH_LOSE_REWARD: int('MATCH_LOSE_REWARD', 10),
  TTT_AI_REWARDS: {
    easy: int('TTT_AI_WIN_EASY', 2),
    normal: int('TTT_AI_WIN_NORMAL', 4),
    hard: int('TTT_AI_WIN_HARD', 6),
  },
  TTT_AI_DAILY_WIN_CAP: int('TTT_AI_DAILY_WIN_CAP', 3),
  TTT_PVP_WIN_REWARD: int('TTT_PVP_WIN_REWARD', 5),
  TTT_PVP_DAILY_WIN_CAP: int('TTT_PVP_DAILY_WIN_CAP', 4),

  // ─── زمان‌بندی‌ها (میلی‌ثانیه) ───
  DEAL_MS: int('DEAL_SECONDS', 8) * 1000,
  ASK_MS: int('ASK_SECONDS', 45) * 1000,
  ANSWER_MS: int('ANSWER_SECONDS', 60) * 1000,
  CHALLENGE_MS: int('CHALLENGE_SECONDS', 15) * 1000,
  VOTE_MS: int('VOTE_SECONDS', 90) * 1000,
  REVOTE_MS: int('REVOTE_SECONDS', 45) * 1000,
  NIGHT_MS: int('NIGHT_SECONDS', 45) * 1000,
  GUESS_MS: int('GUESS_SECONDS', 30) * 1000,
  SHOT_MS: int('SHOT_SECONDS', 12) * 1000, // فرصت شات جاسوس پس از رأی‌گیری
  RECONNECT_GRACE_MS: int('RECONNECT_GRACE_SECONDS', 60) * 1000,
  ROOM_OVER_TTL_MS: 30 * 60 * 1000,
  ROOM_ABORT_MS: 3 * 60 * 1000,

  // ─── قوانین بازی ───
  MIN_PLAYERS: 4,
  MAX_PLAYERS: 12,
  TEST_MIN_PLAYERS: 2, // حداقل بازیکن در اتاق آزمایشی
  SHOT_MIN_PLAYERS: 6, // شات جاسوس فقط در سناریو ۶ نفره یا بالاتر
  // جدول تعداد جاسوس بر اساس تعداد بازیکن — قابل تنظیم/گسترش
  SPY_COUNTS: { 3: 1, 4: 1, 5: 1, 6: 1, 7: 1, 8: 1, 9: 1, 10: 2, 11: 2, 12: 3 },
  TERMS_EXTRA: 2, // تعداد ترم‌های روز اول = تعداد بازیکنان + ۲
  DAY_TERMS_MIN: 3, // روزهای بعدی: تعداد ترم = تعداد بازیکنان زنده (حداقل این)
};

// تعداد جاسوس برای n بازیکن (با مقدار پیش‌فرض منطقی برای تعدادهای دیگر)
CFG.spyCount = function (n) {
  if (CFG.SPY_COUNTS[n] != null) return CFG.SPY_COUNTS[n];
  return Math.max(1, Math.floor(n / 5));
};

module.exports = CFG;
