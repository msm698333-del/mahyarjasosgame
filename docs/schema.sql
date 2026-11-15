-- ─── ساختار دیتابیس بازی جاسوس (SQLite) ───
-- این اسکریپت صرفاً مستندسازی است؛ سرور خودش جداول را در نخستین اجرا می‌سازد
-- (server/db.js). فایل دیتابیس: data/spy.db (قابل تغییر با DB_PATH).

-- بازیکنان: هویت بدون ثبت‌نام + اقتصاد + آمار
CREATE TABLE IF NOT EXISTS players(
  id TEXT PRIMARY KEY,            -- شناسه تصادفی 'p_...' (در کوکی/توکن امضا می‌شود)
  name TEXT NOT NULL,             -- نمایشی (۲ تا ۱۶ کاراکتر)
  avatar TEXT NOT NULL DEFAULT 'a01',
  coins INTEGER NOT NULL,         -- موجودی سکه (فقط سرور تغییرش می‌دهد)
  free_entries INTEGER NOT NULL,  -- ورودهای رایگان باقی‌مانده لابی (شروع: ۴)
  matches INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,    -- epoch ms
  last_seen INTEGER NOT NULL
);

-- آواتارهای خریده‌شده (هشت آواتار اول در ثبت‌نام رایگان اعطا می‌شوند)
CREATE TABLE IF NOT EXISTS player_avatars(
  player_id TEXT NOT NULL,
  avatar_id TEXT NOT NULL,        -- a01..a24
  acquired_at INTEGER NOT NULL,
  PRIMARY KEY(player_id, avatar_id)
);

-- تاریخچه مسابقه‌های جاسوس (یک ردیف به‌ازای هر بازیکن در هر مسابقه)
CREATE TABLE IF NOT EXISTS matches(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL,
  room_code TEXT,                 -- کد لابی ۶ حرفی
  players_count INTEGER,
  role TEXT,                      -- 'spy' | 'citizen'
  result TEXT,                    -- 'win' | 'loss'
  word TEXT,                      -- کلمه مخفی (در پایان مسابقه فاش می‌شود)
  coins_delta INTEGER,            -- +۵۰ برد / +۱۰ مشارکت
  ended_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_matches_player ON matches(player_id, ended_at);

-- دفتر کل اقتصاد (هر تغییر سکه لاگ می‌شود — ضد دستکاری و قابل ممیزی)
CREATE TABLE IF NOT EXISTS ledger(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL,
  kind TEXT NOT NULL,             -- entry_fee / refund_entry / match / avatar_buy / ttt_ai / ttt_pvp / refund_free
  amount INTEGER NOT NULL,        -- مثبت = دریافتی، منفی = پرداختی
  meta TEXT,                      -- JSON کوچک (اتاق، نتیجه، سطح دوز…)
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ledger_player ON ledger(player_id, at);

-- شمارنده‌های روزانه برای سقف پاداش دوز (ضد فارم)
CREATE TABLE IF NOT EXISTS daily_counters(
  player_id TEXT NOT NULL,
  day TEXT NOT NULL,              -- 'YYYY-MM-DD' (UTC)
  ttt_ai_wins INTEGER NOT NULL DEFAULT 0,   -- سقف: ۳ برد پاداش‌دار در روز
  ttt_pvp_wins INTEGER NOT NULL DEFAULT 0,  -- سقف: ۴ برد پاداش‌دار در روز
  PRIMARY KEY(player_id, day)
);

-- نتایج بازی دوز
CREATE TABLE IF NOT EXISTS ttt_games(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mode TEXT NOT NULL,             -- 'ai' | 'pvp'
  p1 TEXT,
  p2 TEXT,                        -- در حالت AI مقدار NULL یا 'ai'
  winner TEXT,                    -- player id یا NULL (مساوی)
  at INTEGER NOT NULL
);

-- اتاق‌ها/لابی‌ها: snapshot کامل وضعیت برای بازیابی پس از ری‌استارت سرور
CREATE TABLE IF NOT EXISTS rooms(
  code TEXT PRIMARY KEY,          -- کد لابی ۶ حرفی
  status TEXT NOT NULL,           -- 'lobby' | 'playing' | 'over'
  host_id TEXT,
  config TEXT,                    -- JSON: {slots, fee}
  state TEXT,                     -- JSON: {roster:[...], game:{...}|null} — وضعیت کامل مسابقه
  updated_at INTEGER NOT NULL
);

-- نکته: وضعیت زندهٔ اتاق‌ها در حافظهٔ سرور نگه داشته می‌شود و با هر تغییر
-- در این جدول snapshot می‌گیرد؛ پس از ری‌استارت، engine.resume تایمرهای
-- باقی‌مانده را از deadlines ذخیره‌شده از نو زمان‌بندی می‌کند.
