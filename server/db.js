// ─── لایه دیتابیس (SQLite) ───
// با تشخیص خودکار درایور: node:sqlite (Node ≥ 22.5) یا bun:sqlite (Bun)
const fs = require('fs');
const path = require('path');
const CFG = require('./config');
const { pid, now } = require('./util');

fs.mkdirSync(path.dirname(CFG.DB_PATH), { recursive: true });

let db;
let impl;
try {
  const { DatabaseSync } = require('node:sqlite');
  db = new DatabaseSync(CFG.DB_PATH);
  impl = 'node:sqlite';
} catch (e) {
  const { Database } = require('bun:sqlite');
  db = new Database(CFG.DB_PATH);
  impl = 'bun:sqlite';
}

db.exec('PRAGMA journal_mode = WAL;');
db.exec(`
CREATE TABLE IF NOT EXISTS players(
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  avatar TEXT NOT NULL DEFAULT 'a01',
  coins INTEGER NOT NULL,
  free_entries INTEGER NOT NULL,
  matches INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS player_avatars(
  player_id TEXT NOT NULL,
  avatar_id TEXT NOT NULL,
  acquired_at INTEGER NOT NULL,
  PRIMARY KEY(player_id, avatar_id)
);
CREATE TABLE IF NOT EXISTS matches(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL,
  room_code TEXT,
  players_count INTEGER,
  role TEXT,
  result TEXT,
  word TEXT,
  coins_delta INTEGER,
  ended_at INTEGER
);
CREATE TABLE IF NOT EXISTS ledger(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  amount INTEGER NOT NULL,
  meta TEXT,
  at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS daily_counters(
  player_id TEXT NOT NULL,
  day TEXT NOT NULL,
  ttt_ai_wins INTEGER NOT NULL DEFAULT 0,
  ttt_pvp_wins INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(player_id, day)
);
CREATE TABLE IF NOT EXISTS ttt_games(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mode TEXT NOT NULL,
  p1 TEXT,
  p2 TEXT,
  winner TEXT,
  at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS rooms(
  code TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  host_id TEXT,
  config TEXT,
  state TEXT,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_matches_player ON matches(player_id, ended_at);
CREATE INDEX IF NOT EXISTS idx_ledger_player ON ledger(player_id, at);
`);

const FREE_AVATARS = ['a01', 'a02', 'a03', 'a04', 'a05', 'a06', 'a07', 'a08'];

// ─── بازیکنان ───
function createPlayer(name) {
  const id = pid();
  const t = now();
  db.prepare(
    'INSERT INTO players(id, name, avatar, coins, free_entries, created_at, last_seen) VALUES(?,?,?,?,?,?,?)'
  ).run(id, name, 'a01', CFG.START_COINS, CFG.FREE_ENTRIES, t, t);
  const stmt = db.prepare('INSERT INTO player_avatars(player_id, avatar_id, acquired_at) VALUES(?,?,?)');
  for (const a of FREE_AVATARS) stmt.run(id, a, t);
  return getPlayer(id);
}

function getPlayer(id) {
  const r = db.prepare('SELECT * FROM players WHERE id = ?').get(id);
  return r || null;
}

function touch(id) {
  db.prepare('UPDATE players SET last_seen = ? WHERE id = ?').run(now(), id);
}

function setName(id, name) {
  db.prepare('UPDATE players SET name = ? WHERE id = ?').run(name, id);
}

function setAvatar(id, avatarId) {
  db.prepare('UPDATE players SET avatar = ? WHERE id = ?').run(avatarId, id);
}

function ownedAvatars(id) {
  const rows = db.prepare('SELECT avatar_id FROM player_avatars WHERE player_id = ?').all(id);
  return new Set(rows.map((r) => r.avatar_id));
}

function grantAvatar(id, avatarId) {
  db.prepare('INSERT OR IGNORE INTO player_avatars(player_id, avatar_id, acquired_at) VALUES(?,?,?)').run(
    id,
    avatarId,
    now()
  );
}

// ─── اقتصاد ───
function addCoins(id, delta, kind, meta) {
  const p = getPlayer(id);
  if (!p) return null;
  const next = Math.max(0, p.coins + delta);
  db.prepare('UPDATE players SET coins = ? WHERE id = ?').run(next, id);
  db.prepare('INSERT INTO ledger(player_id, kind, amount, meta, at) VALUES(?,?,?,?,?)').run(
    id,
    kind,
    delta,
    meta ? JSON.stringify(meta).slice(0, 500) : null,
    now()
  );
  return next;
}

// مصرف یک «ورود لابی»: اول ورودی‌های رایگان، بعد سکه. اگر ناکافی باشد خطا می‌دهد.
function consumeEntry(id, fee) {
  const p = getPlayer(id);
  if (!p) throw Object.assign(new Error('player'), { code: 'no_player' });
  if (p.free_entries > 0) {
    db.prepare('UPDATE players SET free_entries = free_entries - 1 WHERE id = ?').run(id);
    return { free: true, charged: 0, freeLeft: p.free_entries - 1 };
  }
  if (p.coins < fee) {
    throw Object.assign(new Error('insufficient'), { code: 'no_coins', need: fee, have: p.coins });
  }
  const next = addCoins(id, -fee, 'entry_fee', {});
  return { free: false, charged: fee, freeLeft: p.free_entries };
}

// بازپرداخت ورود (حل‌شدن لابی پیش از شروع بازی)
function refundEntry(id, charged, free) {
  if (free) {
    db.prepare('UPDATE players SET free_entries = free_entries + 1 WHERE id = ?').run(id);
    addCoins(id, 0, 'refund_free', {});
  } else if (charged > 0) {
    addCoins(id, charged, 'refund_entry', {});
  }
}

// ─── آمار و تاریخچه ───
function bumpStats(id, result) {
  db.prepare(
    'UPDATE players SET matches = matches + 1, wins = wins + ?, losses = losses + ? WHERE id = ?'
  ).run(result === 'win' ? 1 : 0, result === 'win' ? 0 : 1, id);
}

function recordMatch(playerId, code, count, role, result, word, delta) {
  db.prepare(
    'INSERT INTO matches(player_id, room_code, players_count, role, result, word, coins_delta, ended_at) VALUES(?,?,?,?,?,?,?,?)'
  ).run(playerId, code, count, role, result, word || null, delta, now());
}

function historyFor(id, limit = 40) {
  return db
    .prepare('SELECT * FROM matches WHERE player_id = ? ORDER BY ended_at DESC LIMIT ?')
    .all(id, limit);
}

// ─── شمارنده‌های روزانه (سقف پاداش ضد فارم) ───
function today() {
  return new Date().toISOString().slice(0, 10);
}

function bumpDailyCounter(id, field) {
  const day = today();
  db.prepare(
    `INSERT INTO daily_counters(player_id, day, ${field}) VALUES(?,?,1)
     ON CONFLICT(player_id, day) DO UPDATE SET ${field} = ${field} + 1`
  ).run(id, day);
  return getDailyCounter(id, field);
}

function getDailyCounter(id, field) {
  const row = db
    .prepare(`SELECT ${field} AS v FROM daily_counters WHERE player_id = ? AND day = ?`)
    .get(id, today());
  return row ? row.v : 0;
}

function recordTtt(mode, p1, p2, winner) {
  db.prepare('INSERT INTO ttt_games(mode, p1, p2, winner, at) VALUES(?,?,?,?,?)').run(
    mode,
    p1 || null,
    p2 || null,
    winner || null,
    now()
  );
}

// ─── اتاق‌ها (ذخیره وضعیت برای بازیابی پس از ری‌استارت سرور) ───
function saveRoom(code, status, hostId, config, state) {
  db.prepare(
    `INSERT INTO rooms(code, status, host_id, config, state, updated_at) VALUES(?,?,?,?,?,?)
     ON CONFLICT(code) DO UPDATE SET status = excluded.status, host_id = excluded.host_id,
     config = excluded.config, state = excluded.state, updated_at = excluded.updated_at`
  ).run(code, status, hostId || null, JSON.stringify(config || {}), JSON.stringify(state || {}), now());
}

function deleteRoom(code) {
  db.prepare('DELETE FROM rooms WHERE code = ?').run(code);
}

function loadRooms() {
  const rows = db.prepare('SELECT * FROM rooms').all();
  return rows.map((r) => ({
    code: r.code,
    status: r.status,
    hostId: r.host_id,
    config: safeParse(r.config, {}),
    state: safeParse(r.state, null),
    updatedAt: r.updated_at,
  }));
}

function safeParse(s, def) {
  try {
    return s ? JSON.parse(s) : def;
  } catch {
    return def;
  }
}

module.exports = {
  impl,
  createPlayer,
  getPlayer,
  touch,
  setName,
  setAvatar,
  ownedAvatars,
  grantAvatar,
  addCoins,
  consumeEntry,
  refundEntry,
  bumpStats,
  recordMatch,
  historyFor,
  bumpDailyCounter,
  getDailyCounter,
  recordTtt,
  saveRoom,
  deleteRoom,
  loadRooms,
};
