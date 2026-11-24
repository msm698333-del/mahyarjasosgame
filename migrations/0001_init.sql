-- تاریخچهٔ بازی‌ها (اختیاری — بازی بدون D1 هم کامل کار می‌کند)
CREATE TABLE IF NOT EXISTS matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,
  location_name TEXT NOT NULL DEFAULT '',
  spy_won INTEGER NOT NULL DEFAULT 0,
  players_count INTEGER NOT NULL DEFAULT 0,
  ended_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_matches_ended ON matches (ended_at DESC);
