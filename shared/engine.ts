// موتور بازی «جاسوس» — منطق خالص و قابل‌تست، بدون وابستگی به Workers یا DOM
// همهٔ اعتبارسنجی‌ها سمت سرور همین‌جا انجام می‌شود؛ کلاینت هیچ‌وقت منبع حقیقت نیست.

import { C2S, ERR, GameSettings, Phase, PublicState, RoleInfo, RoundResult, S2C, TallyInfo, YouInfo, DEFAULT_SETTINGS, EliminationInfo, ROUND_RESULT_SECONDS, SPY_WORD_GUESS } from './types';
import { Difficulty, pickWord, pickSpyWord, wordById, wordPoolSize, wordCategoryIds } from './wordBank';
import { DAILY_QUOTA_SECONDS, TURN_COST_SECONDS, tehranDayKey } from './quota';
import { genToken, newPlayerId, Rng } from './ids';

export interface Player {
  id: string;
  name: string;
  avatar: number;
  token: string;
  isHost: boolean;
  connected: boolean;
  micOn: boolean;
  speaking: boolean;
  hasVoice: boolean;
  forceMuted: boolean;
  eliminated: boolean; // حذف‌شده با رأی‌گیری در بازی جاری؛ تماشاچی می‌ماند
  skipLeft: number;
  score: number;
  joinedAt: number;
  lastSeen: number;
  reports: number;
  reportedBy: Set<string>;
  role: RoleInfo | null;
  deviceId?: string; // شناسهٔ پایدار دستگاه — برای سهمیهٔ روزانهٔ سراسری؛ هرگز به کلاینت‌ها پخش نمی‌شود
}

/** کلمهٔ فعال دور — از بانک کلمات می‌آید؛ شکل قدیمی location حفظ شده تا کلاینت و نتایج سازگار بمانند */
export interface RoundWord { id: string; name: string; cat: string }

export interface RoomState {
  code: string;
  createdAt: number;
  phase: Phase;
  settings: GameSettings;
  players: Player[];
  hostId: string;
  round: number;
  location: RoundWord | null;
  revealedAt: number | null;
  turnOrder: string[];
  currentTurnIdx: number;
  turnEndsAt: number | null;
  deadline: number | null;
  targetId: string | null;
  spyIds: string[];             // جاسوس‌های بازی جاری — بین دورها ثابت می‌مانند
  readyIds: string[];
  votes: Record<string, string | null>;
  voteRound: number;
  tiedIds: string[] | null;
  tally: TallyInfo | null;
  lastElimination: EliminationInfo | null;
  roundNote: string | null;
  results: RoundResult | null;
  spyGuessId: string | null;
  lastStickerAt: Record<string, number>;
  lastChatAt: Record<string, number>;
  chainReturnIdx: number | null; // ادامهٔ چرخهٔ نوبت از این صندلی، بعد از پایان زنجیرهٔ چالش/واگذاری
  challengedIds: string[];       // بازیکنانی که با چالش/واگذاری وارد نوبت شده‌اند (حق واگذاری دارند)
  usedLocationIds: string[];     // کلمه‌های اعلام‌شده در این لابی — قانون تکرارنشدن کلمه‌ها
  quotaLeft: Record<string, number>; // سهمیهٔ روزانهٔ باقی‌ماندهٔ هر بازیکن (ثانیه) — کش سرور؛ منبع حقیقت در QuotaDO ذخیره می‌شود
  turnNote: string | null;           // یادداشت گذرای نوبت (مثل ردّ خودکار به‌خاطر پایان سهمیه)
}

/** عملیات سهمیهٔ روزانه — روی کش سرور (quotaLeft) کار می‌کند؛ مصرف واقعی به QuotaDO منتقل و ذخیره می‌شود */
export interface QuotaOps {
  left: (playerId: string) => number;
  consume: (playerId: string, seconds: number) => void;
}

export interface Deps {
  rng: Rng;
  now: number;
  quota?: QuotaOps;
}

export interface ApplyOk {
  changed: boolean;          // وضعیت عمومی تغییر کرد؟ → broadcast state
  mutated?: boolean;         // وضعیت داخلی تغییر کرد (مثل lastStickerAt)؟ → فقط persist
  err?: string;              // کد خطا برای فرستنده
  playerId?: string;         // خروجی addPlayer
  emits?: S2C[];             // پیام‌های broadcast اضافه (chat/sticker…)
  direct?: { to: string; msg: S2C }[]; // پیام خصوصی
  closePlayer?: string;      // اخراج/خروج: بستن سوکت‌ها
  alarmAt?: number | null;   // زمان‌بندی جدید آلارم
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const shuffle = <T,>(arr: T[], rng: Rng): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export function createRoom(code: string, hostName: string, hostAvatar: number, d: Deps): RoomState {
  const host: Player = {
    id: newPlayerId(d.rng), name: hostName, avatar: hostAvatar, token: genToken(d.rng),
    isHost: true, connected: false, micOn: false, speaking: false, hasVoice: false, forceMuted: false,
    eliminated: false, skipLeft: DEFAULT_SETTINGS.skipPerPlayer, score: 0, joinedAt: d.now, lastSeen: d.now,
    reports: 0, reportedBy: new Set(), role: null
  };
  return {
    code, createdAt: d.now, phase: 'waiting', settings: { ...DEFAULT_SETTINGS },
    players: [host], hostId: host.id, round: 0, location: null, revealedAt: null,
    turnOrder: [], currentTurnIdx: -1, turnEndsAt: null, deadline: null, targetId: null,
    spyIds: [], readyIds: [], votes: {}, voteRound: 1, tiedIds: null, tally: null,
    lastElimination: null, roundNote: null, results: null,
    spyGuessId: null, lastStickerAt: {}, lastChatAt: {},
    chainReturnIdx: null, challengedIds: [], usedLocationIds: [],
    quotaLeft: {}, turnNote: null
  };
}

/* ---------- helperها ---------- */

export function playerById(s: RoomState, id: string | null | undefined): Player | undefined {
  if (!id) return undefined;
  return s.players.find((p) => p.id === id);
}

function findByName(s: RoomState, name: string): Player | undefined {
  return s.players.find((p) => p.name === name);
}

export function canJoin(s: RoomState): string | null {
  if (s.players.length >= s.settings.maxPlayers) return ERR.FULL;
  if (s.phase !== 'waiting' && s.phase !== 'ended') return ERR.STARTED;
  return null;
}

export function publicState(s: RoomState, now: number, viewerId?: string): PublicState {
  const players = s.players.map((p) => ({
    id: p.id, name: p.name, avatar: p.avatar, isHost: p.isHost, connected: p.connected,
    micOn: p.micOn, speaking: p.speaking, hasVoice: p.hasVoice, forceMuted: p.forceMuted,
    ready: s.readyIds.includes(p.id), eliminated: p.eliminated,
    skipLeft: p.skipLeft, score: p.score, joinedAt: p.joinedAt
  }));
  const ps: PublicState = {
    code: s.code, phase: s.phase, settings: { ...s.settings }, players,
    hostId: s.hostId, createdAt: s.createdAt, round: s.round, serverNow: now,
    deadline: s.deadline ?? undefined, turnOrder: s.turnOrder, currentTurnIdx: s.currentTurnIdx,
    turnEndsAt: s.turnEndsAt ?? undefined, targetId: s.targetId, challengedIds: [...s.challengedIds],
    readyCount: s.readyIds.length, votesSubmitted: Object.keys(s.votes).length,
    voteRound: s.voteRound, tiedIds: s.tiedIds, tally: s.tally,
    elimination: s.lastElimination, roundNote: s.roundNote, turnNote: s.turnNote, results: s.results
  };
  // سهمیهٔ روزانه فقط برای خودِ بیننده محاسبه و ارسال می‌شود
  if (viewerId && s.quotaLeft[viewerId] != null) {
    ps.quota = {
      remaining: Math.max(0, s.quotaLeft[viewerId] | 0),
      total: DAILY_QUOTA_SECONDS,
      day: tehranDayKey(now)
    };
  }
  if (viewerId && viewerId === s.hostId) {
    ps.hostView = { reports: Object.fromEntries(s.players.map((p) => [p.id, p.reports])) };
  }
  return ps;
}

export function roleFor(s: RoomState, playerId: string): RoleInfo | null {
  const p = playerById(s, playerId);
  if (!p || !p.role) return null;
  const r = p.role;
  if (r.isSpy) {
    return { isSpy: true, locationCategory: s.location?.cat, ...(r.roleName ? { roleName: r.roleName } : {}) };
  }
  return r;
}

function youInfo(s: RoomState, p: Player): YouInfo {
  return { id: p.id, token: p.token, name: p.name, avatar: p.avatar, isHost: p.id === s.hostId, skipLeft: p.skipLeft };
}

export function currentSpeakerId(s: RoomState): string | null {
  if (s.phase !== 'discussion' || s.currentTurnIdx < 0) return null;
  return s.turnOrder[s.currentTurnIdx] ?? null;
}

/* ---------- سهمیهٔ روزانه ---------- */

/** آیا بازیکن می‌تواند نوبت جدیدی شروع کند؟ (متصل، حذف‌نشده، سهمیهٔ کافی) — اعتبارسنجی کاملاً سمت سرور */
function canTakeTurn(s: RoomState, pid: string, d: Deps): boolean {
  const p = playerById(s, pid);
  if (!p || !p.connected || p.eliminated) return false;
  if (d.quota && d.quota.left(pid) < TURN_COST_SECONDS) return false; // پایان سهمیهٔ روزانه → نوبت جدید ممنوع
  return true;
}

/* ---------- ورود / خروج ---------- */

export function addPlayer(s: RoomState, name: string, avatar: number, d: Deps): ApplyOk & { playerId?: string; err?: string } {
  const err = canJoin(s);
  if (err) return { changed: false, err };
  const clean = name.trim().slice(0, 18);
  if (clean.length < 2) return { changed: false, err: ERR.BAD_NAME };
  if (findByName(s, clean)) return { changed: false, err: 'duplicate_name' };
  const p: Player = {
    id: newPlayerId(d.rng), name: clean, avatar: clamp(avatar | 0, 0, 11), token: genToken(d.rng),
    isHost: false, connected: true, micOn: false, speaking: false, hasVoice: false, forceMuted: false,
    eliminated: false, skipLeft: s.settings.skipPerPlayer, score: 0, joinedAt: d.now, lastSeen: d.now,
    reports: 0, reportedBy: new Set(), role: null
  };
  s.players.push(p);
  return { changed: true, playerId: p.id };
}

export function reattach(s: RoomState, playerId: string, token: string, d: Deps): ApplyOk & { err?: string } {
  const p = playerById(s, playerId);
  if (!p || p.token !== token) return { changed: false, err: ERR.BAD_TOKEN };
  if (!p.connected) {
    p.connected = true;
    p.lastSeen = d.now;
    return { changed: true };
  }
  p.lastSeen = d.now; // سوکت دوم همان بازیکن
  return { changed: false };
}

function transferHostIfNeeded(s: RoomState, d: Deps): void {
  if (s.hostId && playerById(s, s.hostId)) return;
  const next = [...s.players].sort((a, b) => a.joinedAt - b.joinedAt)[0];
  if (next) {
    next.isHost = true;
    s.hostId = next.id;
  }
}

export function removePlayer(s: RoomState, playerId: string, d: Deps): ApplyOk {
  const i = s.players.findIndex((p) => p.id === playerId);
  if (i < 0) return { changed: false };
  const [p] = s.players.splice(i, 1);
  void p;
  s.turnOrder = s.turnOrder.filter((id) => id !== playerId);
  if (s.currentTurnIdx >= s.turnOrder.length) s.currentTurnIdx = s.turnOrder.length - 1;
  if (s.targetId === playerId) s.targetId = null;
  s.readyIds = s.readyIds.filter((id) => id !== playerId);
  s.spyIds = s.spyIds.filter((id) => id !== playerId);
  transferHostIfNeeded(s, d);
  if (s.phase === 'revealing' && allReady(s)) return startDiscussion(s, d);
  // اگر در میانهٔ بازی جاسوس یا تعداد بحرانی شهروندها از دست رفت → پایان بازی
  if (MATCH_PHASES.has(s.phase) && s.round > 0 && s.spyIds.length > 0) {
    const roster = s.turnOrder.length > 0 ? s.turnOrder : s.players.filter((x) => x.connected).map((x) => x.id);
    const spiesAlive = roster.filter((id) => s.spyIds.includes(id)).length;
    const civAlive = roster.filter((id) => !s.spyIds.includes(id)).length;
    if (spiesAlive === 0) {
      return endRound(s, d, false, null, 'جاسوس بازی را ترک کرد؛ شهروندها برنده شدند.');
    }
    if (civAlive <= spiesAlive) {
      return endRound(s, d, true, null, 'با خروج بازیکن‌ها، شهروندها به حد بحرانی رسیدند؛ جاسوس برنده شد.');
    }
  }
  return { changed: true };
}

/* ---------- تنظیمات ---------- */

export function updateSettings(s: RoomState, actorId: string, patch: Partial<GameSettings>): ApplyOk {
  if (actorId !== s.hostId) return { changed: false, err: ERR.NOT_HOST };
  if (s.phase !== 'waiting') return { changed: false, err: ERR.WRONG_PHASE };
  const st = { ...s.settings };
  if (patch.maxPlayers !== undefined) st.maxPlayers = clamp(patch.maxPlayers | 0, 3, 12);
  if (patch.spyCount !== undefined) st.spyCount = clamp(patch.spyCount | 0, 1, 2);
  if (patch.discussionSeconds !== undefined) st.discussionSeconds = clamp(patch.discussionSeconds | 0, 180, 900);
  if (patch.voteSeconds !== undefined) st.voteSeconds = clamp(patch.voteSeconds | 0, 15, 120);
  if (patch.guessSeconds !== undefined) st.guessSeconds = clamp(patch.guessSeconds | 0, 30, 90);
  // قانون تایمر: هر نوبت دقیقاً ۱۰ ثانیه است — قفل سراسری؛ هیچ بازیکنی نمی‌تواند تایمر را متوقف یا تمدید کند
  st.turnSeconds = 10;
  if (patch.skipPerPlayer !== undefined) st.skipPerPlayer = clamp(patch.skipPerPlayer | 0, 0, 5);
  if (patch.spyWord !== undefined && (patch.spyWord === 'nearby' || patch.spyWord === 'none')) st.spyWord = patch.spyWord;
  if (patch.difficulty !== undefined && (patch.difficulty === 'easy' || patch.difficulty === 'medium' || patch.difficulty === 'hard')) {
    st.difficulty = patch.difficulty;
  }
  if (patch.categories !== undefined && Array.isArray(patch.categories)) {
    const valid = new Set<string>(wordCategoryIds());
    st.categories = patch.categories.filter((c) => valid.has(c)).slice(0, wordCategoryIds().length);
  }
  if (st.spyCount === 2 && st.maxPlayers < 6) st.maxPlayers = 6;
  s.settings = st;
  for (const p of s.players) p.skipLeft = st.skipPerPlayer;
  return { changed: true };
}

/* ---------- شروع دور ---------- */

/** فازهایی که بازی در جریان است (برای بررسی برد/باخت هنگام خروج بازیکن) */
const MATCH_PHASES: Set<Phase> = new Set(['revealing', 'discussion', 'voting', 'spyGuess', 'roundResult']);

export function startRound(s: RoomState, d: Deps): ApplyOk & { err?: string } {
  if (s.phase !== 'waiting' && s.phase !== 'roundResult') return { changed: false, err: ERR.WRONG_PHASE };
  const active = s.players.filter((p) => p.connected && !p.eliminated);
  if (active.length < 3) return { changed: false, err: 'need_players' };

  // بازی تازه یا ادامه؟ جاسوس‌ها در طول یک بازی ثابت می‌مانند و فقط کلمه عوض می‌شود
  const freshMatch = s.spyIds.length === 0;
  if (freshMatch) {
    for (const p of s.players) p.eliminated = false;
  }
  const spyCount = Math.min(s.settings.spyCount, Math.floor(active.length / 3) || 1);
  // قانون تکرارنشدن کلمه‌ها: کلمهٔ اعلام‌شدهٔ قبلی دوباره انتخاب نمی‌شود تا بانک دسته‌ها تمام شود
  const catIds = s.settings.categories.length ? s.settings.categories : null;
  if (s.usedLocationIds.length >= wordPoolSize(catIds)) s.usedLocationIds = [];
  const w = pickWord(catIds, d.rng, s.usedLocationIds);
  if (!w) return { changed: false, err: 'no_location' };
  s.usedLocationIds.push(w.id);

  let spyIds = s.spyIds.filter((id) => active.some((p) => p.id === id));
  if (freshMatch) {
    const pick = shuffle(active.map((p) => p.id), d.rng);
    spyIds = pick.slice(0, spyCount);
  }
  if (spyIds.length === 0) {
    // جاسوس بازی را ترک کرده — بدون شروع دور جدید، شهروندها برنده‌اند
    return endRound(s, d, false, null, 'جاسوس بازی را ترک کرد؛ شهروندها برنده شدند.');
  }
  s.spyIds = spyIds;

  s.location = { id: w.id, name: w.word, cat: w.cat };
  s.round += 1;
  s.phase = 'revealing';
  s.revealedAt = d.now;
  s.results = null;
  s.tally = null;
  s.tiedIds = null;
  s.votes = {};
  s.voteRound = 1;
  s.spyGuessId = null;
  s.targetId = null;
  s.deadline = null;
  s.readyIds = [];
  s.lastElimination = null;
  s.roundNote = null;
  s.turnNote = null;
  s.chainReturnIdx = null;
  s.challengedIds = [];

  const order = shuffle(active.map((p) => p.id), d.rng);
  const spySet = new Set(spyIds);
  // کلمهٔ جاسوس: نزدیک به کلمهٔ اصلی بر اساس سطح سختی (آسان/متوسط/سخت) — یا هیچ؛ جاسوس هرگز کلمهٔ اصلی را نمی‌بیند
  const decoyWord = s.settings.spyWord === 'nearby' ? pickSpyWord(w, s.settings.difficulty, d.rng) : null;

  // تخصیص کلمه: همهٔ شهروندها دقیقاً یک کلمهٔ یکسان می‌گیرند؛ فقط جاسوس متفاوت است
  for (const p of s.players) {
    p.skipLeft = s.settings.skipPerPlayer;
    p.role = null;
    if (!order.includes(p.id)) continue; // بازیکن قطع‌شده در این دور شرکت نمی‌کند
    if (spySet.has(p.id)) {
      p.role = decoyWord ? { isSpy: true, roleName: decoyWord } : { isSpy: true };
    } else {
      p.role = { isSpy: false, locationId: w.id, locationName: w.word, locationCategory: w.cat };
    }
  }

  s.turnOrder = order;
  s.currentTurnIdx = -1;
  s.turnEndsAt = null;
  return { changed: true };
}

function allReady(s: RoomState): boolean {
  return s.players.filter((p) => p.connected && p.role).every((p) => s.readyIds.includes(p.id));
}

/** در فاز نقش‌نمایی، بازیکن قطع‌شدهٔ طولانی‌مدت از دور کنار گذاشته می‌شود تا بازی قفل نشود */
export function pruneReveal(s: RoomState, now: number, d: Deps): ApplyOk {
  if (s.phase !== 'revealing') return { changed: false };
  const cutoff = now - REVEAL_TIMEOUT_MS;
  const force = s.revealedAt != null && now - s.revealedAt > REVEAL_FORCE_MS;
  let changed = false;
  for (const p of [...s.players]) {
    const stuckDisconnected = p.role && !p.connected && p.lastSeen < cutoff;
    const stuckAtForce = force && p.role && !p.connected;
    if (stuckDisconnected || stuckAtForce) {
      p.role = null;
      s.turnOrder = s.turnOrder.filter((id) => id !== p.id);
      s.readyIds = s.readyIds.filter((id) => id !== p.id);
      changed = true;
    }
  }
  const allReadyNow = s.players.filter((p) => p.connected && p.role).length > 0
    && s.players.filter((p) => p.connected && p.role).every((p) => s.readyIds.includes(p.id));
  if ((force || allReadyNow) && s.turnOrder.length >= 2) {
    const r = startDiscussion(s, d);
    return { changed: true, alarmAt: r.alarmAt };
  }
  // اگر بعد از شروع اجباری کمتر از ۲ بازیکن باقی ماند، دور به لابی برمی‌گردد
  if (force && s.turnOrder.length < 2) {
    s.phase = 'waiting';
    s.location = null;
    s.turnOrder = [];
    s.currentTurnIdx = -1;
    s.revealedAt = null;
    for (const p of s.players) p.role = null;
    return { changed: true };
  }
  return { changed };
}

const REVEAL_TIMEOUT_MS = 60_000;
const REVEAL_FORCE_MS = 90_000;

/**
 * آمادگی بازیکن — در دو نقطه:
 * ۱) صفحه انتظار (waiting): با آماده شدن همه، بازی خودکار و بدون تأیید میزبان شروع می‌شود.
 * ۲) پروندهٔ نقش (revealing): با آماده شدن همه، بحث شروع می‌شود.
 * value=false آمادگی را لغو می‌کند تا شروعِ ناقص رخ ندهد.
 */
export function markReady(s: RoomState, playerId: string, d: Deps, value = true): ApplyOk {
  const p = playerById(s, playerId);
  if (!p) return { changed: false, err: ERR.BAD_TARGET };
  if (s.phase === 'waiting') {
    const was = s.readyIds.includes(playerId);
    if (value && !was) s.readyIds.push(playerId);
    if (!value && was) s.readyIds = s.readyIds.filter((x) => x !== playerId);
    const connected = s.players.filter((x) => x.connected);
    const allIn = connected.length >= 3 && connected.every((x) => s.readyIds.includes(x.id));
    if (allIn) return startRound(s, d);
    return { changed: was !== s.readyIds.includes(playerId) };
  }
  if (s.phase !== 'revealing') return { changed: false, err: ERR.WRONG_PHASE };
  if (!p.role) return { changed: false, err: ERR.WRONG_PHASE };
  const was = s.readyIds.includes(playerId);
  if (value && !was) s.readyIds.push(playerId);
  if (!value && was) s.readyIds = s.readyIds.filter((x) => x !== playerId);
  if (allReady(s)) return startDiscussion(s, d);
  return { changed: was !== s.readyIds.includes(playerId) };
}

/**
 * کنترل سروری میکروفون (مکانیزم نوبتی مثل مافیا):
 * — در بحث فقط نوبت‌دار میکروفن باز دارد؛ بقیه به‌طور خودکار بسته می‌شوند.
 * — در رأی‌گیری و حدس جاسوس میکروفن همه بسته است.
 * — در صفحات انتظار/نقش/نتیجه گفت‌وگوی آزاد است.
 */
export function syncTurnMics(s: RoomState): void {
  if (s.phase === 'discussion') {
    const sp = currentSpeakerId(s);
    for (const p of s.players) {
      const should = p.id === sp && !p.forceMuted && p.hasVoice;
      if (p.micOn !== should) p.micOn = should;
      if (!should && p.speaking) p.speaking = false;
    }
  } else if (s.phase === 'voting' || s.phase === 'spyGuess') {
    for (const p of s.players) {
      if (p.micOn || p.speaking) {
        p.micOn = false;
        p.speaking = false;
      }
    }
  }
}

export function startDiscussion(s: RoomState, d: Deps): ApplyOk {
  s.phase = 'discussion';
  s.deadline = d.now + s.settings.discussionSeconds * 1000; // سقف احتیاطی
  s.targetId = null;
  s.chainReturnIdx = null;
  s.challengedIds = [];
  s.turnNote = null;
  // نخستین بازیکنی که سهمیهٔ کافی دارد نوبت می‌گیرد؛ اگر هیچ‌کس سهمیه نداشت مستقیم رأی‌گیری
  let idx = -1;
  for (let i = 0; i < s.turnOrder.length; i++) {
    if (canTakeTurn(s, s.turnOrder[i], d)) { idx = i; break; }
  }
  if (idx < 0) return beginVoting(s, d, null);
  s.currentTurnIdx = idx;
  d.quota?.consume(s.turnOrder[idx], TURN_COST_SECONDS); // هر نوبت دقیقاً ۱۰ ثانیه از سهمیهٔ روزانه کم می‌کند
  s.turnEndsAt = d.now + s.settings.turnSeconds * 1000;
  syncTurnMics(s);
  return { changed: true, alarmAt: Math.min(s.deadline, s.turnEndsAt) };
}

/* ---------- نوبت‌ها ---------- */

/**
 * نوبت بعدی. اگر یک دور کامل صحبت تمام شود (چرخش به ابتدای لیست)،
 * رأی‌گیری خودکار شروع می‌شود — دیگر نیازی به پایان‌زمان کل بحث نیست.
 */
function advanceTurn(s: RoomState, d: Deps): ApplyOk {
  if (s.phase !== 'discussion' || s.turnOrder.length === 0) return { changed: false };
  // پایان زنجیرهٔ چالش/واگذاری: چرخهٔ اصلی دقیقاً از نوبتِ بعد از چالش‌کنندهٔ اصلی ادامه پیدا می‌کند
  let oldIdx = s.currentTurnIdx;
  if (s.chainReturnIdx != null) {
    if (s.chainReturnIdx >= s.turnOrder.length) s.chainReturnIdx = 0;
    oldIdx = (s.chainReturnIdx - 1 + s.turnOrder.length) % s.turnOrder.length;
    s.challengedIds = [];
    s.chainReturnIdx = null;
  }
  let newIdx = oldIdx;
  const quotaSkipped: string[] = [];
  for (let i = 0; i < s.turnOrder.length; i++) {
    newIdx = (newIdx + 1) % s.turnOrder.length;
    const pid = s.turnOrder[newIdx];
    const p = playerById(s, pid);
    if (!p || !p.connected || p.eliminated) continue; // بازیکن قطع‌شده/حذف‌شده → نوبتش خودکار رد می‌شود
    if (d.quota && d.quota.left(pid) < TURN_COST_SECONDS) {
      // پایان سهمیهٔ روزانه → ردّ خودکار و انتقال نوبت به بازیکن بعدی
      quotaSkipped.push(p.name);
      continue;
    }
    break;
  }
  if (newIdx <= oldIdx) {
    // دور صحبت کامل شد → فاز رأی‌گیری
    return beginVoting(s, d, null);
  }
  s.currentTurnIdx = newIdx;
  d.quota?.consume(s.turnOrder[newIdx], TURN_COST_SECONDS); // هر نوبت دقیقاً ۱۰ ثانیه از سهمیهٔ روزانه
  s.turnEndsAt = d.now + s.settings.turnSeconds * 1000;
  s.targetId = null;
  s.turnNote = quotaSkipped.length > 0
    ? `${quotaSkipped.join(' و ')} به‌خاطر پایان سهمیهٔ روزانه رد شد${quotaSkipped.length > 1 ? 'ند' : ''}.`
    : null;
  syncTurnMics(s);
  return { changed: true };
}

export function skipTurn(s: RoomState, playerId: string, d: Deps): ApplyOk {
  if (s.phase !== 'discussion') return { changed: false, err: ERR.WRONG_PHASE };
  if (currentSpeakerId(s) !== playerId) return { changed: false, err: ERR.NOT_YOUR_TURN };
  const p = playerById(s, playerId);
  if (!p) return { changed: false, err: ERR.BAD_TARGET };
  if (p.skipLeft <= 0) return { changed: false, err: ERR.NO_SKIPS };
  p.skipLeft -= 1;
  advanceTurn(s, d);
  return { changed: true, alarmAt: nextDeadline(s) };
}

export function endTurn(s: RoomState, playerId: string, d: Deps): ApplyOk {
  if (s.phase !== 'discussion') return { changed: false, err: ERR.WRONG_PHASE };
  if (currentSpeakerId(s) !== playerId) return { changed: false, err: ERR.NOT_YOUR_TURN };
  advanceTurn(s, d);
  return { changed: true, alarmAt: nextDeadline(s) };
}

export function setTarget(s: RoomState, playerId: string, targetId: string): ApplyOk {
  if (s.phase !== 'discussion') return { changed: false, err: ERR.WRONG_PHASE };
  if (currentSpeakerId(s) !== playerId) return { changed: false, err: ERR.NOT_YOUR_TURN };
  const t = playerById(s, targetId);
  if (!t || t.id === playerId) return { changed: false, err: ERR.BAD_TARGET };
  s.targetId = targetId;
  return { changed: true };
}

/* ---------- چالش و واگذاری نوبت ---------- */

/**
 * قانون چرخهٔ نوبت: هر بازیکن در نوبت خود می‌تواند بازیکن دیگری را به چالش بکشد؛
 * نوبت بلافاصله به او می‌رسد و تایمر نوبتش از نو شروع می‌شود.
 * به‌چالش‌کشیده‌شده می‌تواند نوبت را به بازیکن دیگری واگذار کند و زنجیره به همین شکل ادامه پیدا می‌کند.
 * ترتیب اصلی حفظ می‌شود: بعد از پایان زنجیره، چرخه از نوبتِ بعد از چالش‌کنندهٔ اول ادامه می‌یابد.
 */
function takeTurnViaChain(s: RoomState, targetId: string, d: Deps): ApplyOk | { err: string; changed: false } {
  const t = playerById(s, targetId);
  if (!t || t.id === s.turnOrder[s.currentTurnIdx] || !t.connected || t.eliminated) {
    return { changed: false, err: ERR.BAD_TARGET };
  }
  if (d.quota && d.quota.left(targetId) < TURN_COST_SECONDS) {
    return { changed: false, err: ERR.NO_QUOTA }; // سهمیهٔ روزانهٔ هدف تمام شده — نوبت جدید به او نمی‌رسد
  }
  const idx = s.turnOrder.indexOf(targetId);
  if (idx < 0) return { changed: false, err: ERR.BAD_TARGET };
  if (s.chainReturnIdx == null) {
    s.chainReturnIdx = (s.currentTurnIdx + 1) % s.turnOrder.length;
  }
  s.currentTurnIdx = idx;
  d.quota?.consume(targetId, TURN_COST_SECONDS); // هر نوبت دقیقاً ۱۰ ثانیه از سهمیهٔ روزانه
  if (!s.challengedIds.includes(targetId)) s.challengedIds.push(targetId);
  s.turnEndsAt = d.now + s.settings.turnSeconds * 1000;
  s.targetId = null;
  s.turnNote = null;
  syncTurnMics(s);
  return { changed: true, alarmAt: nextDeadline(s) };
}

/** نوبت‌دار: به چالش کشیدن بازیکن دیگر */
export function challenge(s: RoomState, playerId: string, targetId: string, d: Deps): ApplyOk {
  if (s.phase !== 'discussion') return { changed: false, err: ERR.WRONG_PHASE };
  if (currentSpeakerId(s) !== playerId) return { changed: false, err: ERR.NOT_YOUR_TURN };
  return takeTurnViaChain(s, targetId, d);
}

/** به‌چالش‌کشیده‌شده: واگذاری نوبت به بازیکن دیگر */
export function passTurn(s: RoomState, playerId: string, targetId: string, d: Deps): ApplyOk {
  if (s.phase !== 'discussion') return { changed: false, err: ERR.WRONG_PHASE };
  if (currentSpeakerId(s) !== playerId) return { changed: false, err: ERR.NOT_YOUR_TURN };
  if (!s.challengedIds.includes(playerId)) return { changed: false, err: ERR.NOT_CHALLENGED };
  return takeTurnViaChain(s, targetId, d);
}

/* ---------- رأی‌گیری ---------- */

function beginVoting(s: RoomState, d: Deps, tiedIds: string[] | null): ApplyOk {
  s.phase = 'voting';
  s.voteRound = tiedIds ? s.voteRound + 1 : 1;
  s.tiedIds = tiedIds;
  s.votes = {};
  s.tally = null;
  s.deadline = d.now + s.settings.voteSeconds * 1000;
  s.chainReturnIdx = null;
  s.challengedIds = [];
  s.turnNote = null;
  syncTurnMics(s); // در رأی‌گیری میکروفن همه بسته است
  return { changed: true, alarmAt: s.deadline };
}

export function castVote(s: RoomState, voterId: string, targetId: string | null, d: Deps): ApplyOk {
  if (s.phase !== 'voting') return { changed: false, err: ERR.WRONG_PHASE };
  const voter = playerById(s, voterId);
  if (!voter || voter.eliminated) return { changed: false, err: ERR.WRONG_PHASE };
  if (voterId in s.votes) return { changed: false, err: ERR.ALREADY_VOTED };
  if (targetId !== null) {
    const t = playerById(s, targetId);
    if (!t || t.eliminated) return { changed: false, err: ERR.BAD_VOTE };
    if (s.tiedIds && !s.tiedIds.includes(targetId)) return { changed: false, err: ERR.BAD_VOTE };
    if (!s.tiedIds && t.id === voterId) return { changed: false, err: ERR.BAD_VOTE };
  }
  s.votes[voterId] = targetId;
  // حذف‌شدگان و قطع‌شدگان در شمارش «همه رأی دادند» وارد نمی‌شوند
  const eligible = s.players.filter((p) => p.connected && !p.eliminated).map((p) => p.id);
  const allVoted = eligible.every((id) => id in s.votes);
  if (allVoted) return resolveVotes(s, d);
  return { changed: true, alarmAt: s.deadline };
}

/** حذف‌شدهٔ رأی‌گیری را کنار می‌گذارد و وضعیت برد/ادامهٔ بازی را برمی‌گرداند */
function eliminatePlayer(s: RoomState, playerId: string | null, wasSpy: boolean): void {
  const p = playerById(s, playerId);
  if (!p) return;
  p.eliminated = true;
  s.turnOrder = s.turnOrder.filter((id) => id !== playerId);
  s.readyIds = s.readyIds.filter((id) => id !== playerId);
  if (wasSpy) s.spyIds = s.spyIds.filter((id) => id !== playerId);
  if (s.targetId === playerId) s.targetId = null;
  s.lastElimination = { playerId: p.id, name: p.name, wasSpy };
}

/** انتقال به صفحهٔ «نتیجهٔ دور» — چند ثانیه نمایش، بعد دور بعدی */
function gotoRoundResult(s: RoomState, d: Deps, note: string | null): ApplyOk {
  s.phase = 'roundResult';
  s.roundNote = note;
  s.deadline = d.now + ROUND_RESULT_SECONDS * 1000;
  s.turnEndsAt = null;
  s.chainReturnIdx = null;
  s.challengedIds = [];
  s.turnNote = null;
  syncTurnMics(s);
  return { changed: true, alarmAt: s.deadline };
}

export function resolveVotes(s: RoomState, d: Deps): ApplyOk {
  const counts: Record<string, number> = {};
  for (const target of Object.values(s.votes)) {
    if (target) counts[target] = (counts[target] ?? 0) + 1;
  }
  let max = 0;
  for (const c of Object.values(counts)) max = Math.max(max, c);
  const top = Object.entries(counts).filter(([, c]) => c === max && max > 0).map(([id]) => id);

  if (top.length === 0) {
    // هیچ‌کس متهم نشد — بدون حذف، دور بعد (مثل مافیا)
    s.tally = { accusedId: null, counts, spyCaught: false };
    return gotoRoundResult(s, d, 'هیچ رأی مؤثری ثبت نشد؛ بدون حذف به دور بعد می‌رویم.');
  }
  if (top.length > 1) {
    if (s.tiedIds) {
      return endRound(s, d, true, null, 'در رأی‌گیری مجدد هم تساوی پیش آمد؛ جاسوس فرار کرد.');
    }
    return beginVoting(s, d, top);
  }
  const accused = top[0];
  const accusedP = playerById(s, accused);
  const spyCaught = !!accusedP?.role?.isSpy;
  s.tally = { accusedId: accused, counts, spyCaught };
  if (spyCaught) {
    s.phase = 'spyGuess';
    s.deadline = d.now + s.settings.guessSeconds * 1000;
    syncTurnMics(s);
    return { changed: true, alarmAt: s.deadline };
  }
  // شهروند اشتباه حذف شد — نقش او افشا می‌شود؛ اگر به حد بحرانی رسید جاسوس برنده است
  eliminatePlayer(s, accused, false);
  const spiesAlive = s.turnOrder.filter((id) => s.spyIds.includes(id)).length;
  const civAlive = s.turnOrder.filter((id) => !s.spyIds.includes(id)).length;
  if (civAlive <= spiesAlive) {
    return endRound(s, d, true, accused, `${accusedP?.name ?? 'بازیکن'} اشتباهاً حذف شد؛ شهروندها به حد بحرانی رسیدند و جاسوس برنده شد.`);
  }
  return gotoRoundResult(s, d, null);
}

/* ---------- حدس جاسوس ---------- */

/** بعد از متهم شدن جاسوس: حدس درست = برد جاسوس؛ وگرنه حذف او و بررسی ادامهٔ بازی */
function afterCaughtSpy(s: RoomState, d: Deps, correctGuess: boolean, reason: string): ApplyOk {
  const spyId = s.tally?.accusedId ?? null;
  const spyP = playerById(s, spyId);
  if (correctGuess) {
    return endRound(s, d, true, spyId, reason);
  }
  eliminatePlayer(s, spyId, true); // افشای نقش: جاسوس بود
  const spiesAlive = s.turnOrder.filter((id) => s.spyIds.includes(id)).length;
  if (spiesAlive === 0) {
    return endRound(s, d, false, spyId, reason);
  }
  // جاسوس دیگری هنوز در بازی است → دور بعد
  return gotoRoundResult(s, d, null);
}

export function spyGuess(s: RoomState, playerId: string, locationId: string, d: Deps): ApplyOk {
  if (s.phase !== 'spyGuess') return { changed: false, err: ERR.WRONG_PHASE };
  const p = playerById(s, playerId);
  if (!p?.role?.isSpy) return { changed: false, err: ERR.NOT_SPY };
  if (s.spyGuessId) return { changed: false, err: ERR.BAD_GUESS };
  if (!wordById(locationId)) return { changed: false, err: ERR.BAD_GUESS };
  s.spyGuessId = locationId;
  if (locationId === s.location?.id) {
    return afterCaughtSpy(s, d, true, `${p.name} متهم شد اما کلمهٔ مخفی را درست حدس زد؛ جاسوس‌ها برنده شدند!`);
  }
  return afterCaughtSpy(s, d, false, `${p.name} متهم و حذف شد و کلمهٔ نوشته‌شده هم غلط بود؛ ${s.turnOrder.filter((id) => s.spyIds.includes(id)).length > 0 ? 'بازی ادامه دارد.' : 'شهروندها برنده شدند!'}`);
}

/**
 * یکسان‌سازی املا برای مقایسهٔ کلمه‌ها:
 * خط‌فاصله، نیم‌فاصله، فاصله و اعراب حذف؛ «ي/ك» عربی به «ی/ک» فارسی تبدیل.
 * بنابراین نوشتن کلمه با خط‌فاصله (مثل «کوه-نورد») یا نیم‌فاصله یا بدون آن، همگی پذیرفته می‌شود.
 */
export function normalizeWord(s0: string): string {
  return String(s0 ?? '')
    .replace(/[\u064B-\u065F\u0670]/g, '')            // اعراب
    .replace(/[\u200B-\u200F\u202A-\u202E]/g, '')     // نیم‌فاصله و کاراکترهای کنترلی جهت
    .replace(/[\u064A\u0649]/g, '\u06CC')              // ي/ى عربی → ی
    .replace(/\u0643/g, '\u06A9')                       // ك عربی → ک
    .replace(/[\u0623\u0625\u0671]/g, '\u0627')        // أ/إ/ٱ → ا
    .replace(/[\u002D\u2010-\u2015\u0640]/g, '')       // خط‌فاصله و کشیده
    .replace(/[\s\u00A0]/g, '')
    .trim();
}

/**
 * حدس جاسوس با نوشتن کلمه (قانون ۲):
 * جاسوس کلمه را دقیقاً و با املای درست می‌نویسد — نوشتن با خط‌فاصله (مثل «کلمه-کلمه»)
 * بدون هیچ خطا یا هشدار پذیرفته می‌شود. درست = برد جاسوس؛ غلط = حذف او.
 */
export function spyGuessWord(s: RoomState, playerId: string, word0: string, d: Deps): ApplyOk {
  if (s.phase !== 'spyGuess') return { changed: false, err: ERR.WRONG_PHASE };
  const p = playerById(s, playerId);
  if (!p?.role?.isSpy) return { changed: false, err: ERR.NOT_SPY };
  if (s.spyGuessId) return { changed: false, err: ERR.BAD_GUESS };
  const word = normalizeWord(String(word0 ?? ''));
  if (!word || word.length < 2) return { changed: false, err: ERR.BAD_GUESS };
  s.spyGuessId = SPY_WORD_GUESS;
  const target = normalizeWord(s.location?.name ?? '');
  if (target && word === target) {
    return afterCaughtSpy(s, d, true, `${p.name} متهم شد اما کلمهٔ مخفی را دقیق نوشت؛ جاسوس‌ها برنده شدند!`);
  }
  return afterCaughtSpy(s, d, false, `${p.name} متهم و حذف شد و کلمهٔ نوشته‌شده هم غلط بود؛ ${s.turnOrder.filter((id) => s.spyIds.includes(id)).length > 0 ? 'بازی ادامه دارد.' : 'شهروندها برنده شدند!'}`);
}

export function endRound(s: RoomState, d: Deps, spyWon: boolean, accusedId: string | null, reason: string): ApplyOk {
  s.phase = 'ended';
  s.deadline = null;
  s.turnEndsAt = null;
  s.roundNote = null;
  // افشای کامل: نقش‌های همین دور — جاسوسِ حذف‌شده هم نقشش هنوز set است
  const spyIds = s.players.filter((p) => p.role?.isSpy).map((p) => p.id);
  const scores: Record<string, number> = {};
  for (const p of s.players) {
    const win = spyIds.includes(p.id) ? spyWon : !spyWon;
    if (win) p.score += 1;
    scores[p.id] = p.score;
  }
  s.results = {
    spyIds,
    locationId: s.location?.id ?? '',
    locationName: s.location?.name ?? '',
    locationCategory: s.location?.cat ?? '',
    accusedId,
    votes: s.tally?.counts ? { ...s.votes } : { ...s.votes },
    spyWon,
    spyGuessId: s.spyGuessId,
    reason,
    scores
  };
  return { changed: true };
}

export function restartRound(s: RoomState, actorId: string, d: Deps): ApplyOk {
  if (actorId !== s.hostId) return { changed: false, err: ERR.NOT_HOST };
  if (s.phase !== 'ended') return { changed: false, err: ERR.WRONG_PHASE };
  // بازی کاملاً تازه: جاسوس‌ها و حذف‌شدگان از نو
  s.phase = 'waiting';
  s.spyIds = [];
  s.lastElimination = null;
  s.roundNote = null;
  for (const p of s.players) {
    p.role = null;
    p.eliminated = false;
  }
  s.location = null;
  return startRound(s, d);
}

/* ---------- مدیریت اعضا ---------- */

export function kickPlayer(s: RoomState, actorId: string, targetId: string, d: Deps): ApplyOk {
  if (actorId !== s.hostId) return { changed: false, err: ERR.NOT_HOST };
  if (targetId === actorId) return { changed: false, err: ERR.BAD_TARGET };
  const t = playerById(s, targetId);
  if (!t) return { changed: false, err: ERR.BAD_TARGET };
  const r = removePlayer(s, targetId, d);
  return { ...r, closePlayer: targetId };
}

export function reportPlayer(s: RoomState, actorId: string, targetId: string): ApplyOk {
  const a = playerById(s, actorId);
  const t = playerById(s, targetId);
  if (!a || !t || a.id === t.id) return { changed: false, err: ERR.BAD_TARGET };
  if (t.reportedBy.has(actorId)) return { changed: false };
  t.reportedBy.add(actorId);
  t.reports += 1;
  return { changed: true };
}

export function forceMute(s: RoomState, actorId: string, targetId: string, muted: boolean): ApplyOk {
  if (actorId !== s.hostId) return { changed: false, err: ERR.NOT_HOST };
  const t = playerById(s, targetId);
  if (!t) return { changed: false, err: ERR.BAD_TARGET };
  t.forceMuted = muted;
  return { changed: true };
}

/* ---------- چت و استیکر ---------- */

/** فازهایی که چت متنی در آن‌ها قفل است — ارتباط فقط صوتی و در نوبت خود */
const CHAT_LOCKED_PHASES: Set<Phase> = new Set(['discussion', 'voting', 'spyGuess']);

export function sendChat(s: RoomState, playerId: string, text: string, d: Deps): ApplyOk {
  if (CHAT_LOCKED_PHASES.has(s.phase)) return { changed: false, err: ERR.CHAT_LOCKED };
  const p = playerById(s, playerId);
  if (!p) return { changed: false, err: ERR.BAD_TARGET };
  const clean = text.trim().slice(0, 200);
  if (!clean) return { changed: false };
  const last = s.lastChatAt[playerId] ?? 0;
  if (d.now - last < 1200) return { changed: false, err: ERR.RATE_LIMIT };
  s.lastChatAt[playerId] = d.now;
  return {
    changed: false,
    mutated: true,
    emits: [{ t: 'chat', from: playerId, name: p.name, text: clean, ts: d.now }]
  };
}

export function sendSticker(s: RoomState, playerId: string, id: string, d: Deps): ApplyOk {
  if (CHAT_LOCKED_PHASES.has(s.phase)) return { changed: false, err: ERR.CHAT_LOCKED };
  const p = playerById(s, playerId);
  if (!p) return { changed: false, err: ERR.BAD_TARGET };
  if (!/^[a-z0-9-]{1,32}$/.test(id)) return { changed: false, err: ERR.BAD_MSG };
  const last = s.lastStickerAt[playerId] ?? 0;
  if (d.now - last < 3000) return { changed: false, err: ERR.RATE_LIMIT };
  s.lastStickerAt[playerId] = d.now;
  return { changed: false, mutated: true, emits: [{ t: 'sticker', from: playerId, id, ts: d.now }] };
}

export function setVoice(s: RoomState, playerId: string, micOn: boolean, speaking: boolean, joined?: boolean): ApplyOk {
  const p = playerById(s, playerId);
  if (!p) return { changed: false };
  // کنترل نوبتی میکروفون: درخواست میکروفن خارج از نوبت رد و با هشدار خصوصی همراه می‌شود
  let allowed = true;
  if (micOn) {
    if (s.phase === 'discussion') allowed = currentSpeakerId(s) === playerId;
    else if (s.phase === 'voting' || s.phase === 'spyGuess') allowed = false;
  }
  const mic = allowed ? (micOn && !p.forceMuted) : false;
  let changed = false;
  // پیوستن/ترک گفتگوی صوتی — تعیین‌کنندهٔ hasVoice برای همگام‌سازی peerهای WebRTC
  if (joined === true && !p.hasVoice) { p.hasVoice = true; changed = true; }
  if (joined === false && p.hasVoice) { p.hasVoice = false; changed = true; }
  if (joined === false) {
    // خروج کامل: میکروفن و گفتار هم خاموش می‌شود
    if (p.micOn !== false || p.speaking !== false) { p.micOn = false; p.speaking = false; changed = true; }
  } else if (p.micOn !== mic || p.speaking !== (allowed ? speaking : false)) {
    p.micOn = mic;
    // گفتار خارج از نوبت هرگز پخش نمی‌شود
    p.speaking = allowed ? speaking : false;
    changed = true;
  }
  if (!allowed && micOn) {
    return {
      changed,
      direct: [{
        to: playerId,
        msg: { t: 'error', code: 'mic_forced_off', message: 'الان نوبت شما نیست؛ میکروفن فقط در نوبت شما باز می‌شود.' }
      }]
    };
  }
  return { changed };
}

/* ---------- آلارم‌ها و زمان‌بندی ---------- */

export function nextDeadline(s: RoomState): number | null {
  const candidates: number[] = [];
  if (s.deadline) candidates.push(s.deadline);
  if (s.turnEndsAt) candidates.push(s.turnEndsAt);
  return candidates.length ? Math.min(...candidates) : null;
}

export function onDeadline(s: RoomState, d: Deps): ApplyOk {
  const now = d.now;
  let res: ApplyOk = { changed: false };
  if (s.turnEndsAt && s.turnEndsAt <= now && s.phase === 'discussion') {
    advanceTurn(s, d);
    res = { changed: true, alarmAt: nextDeadline(s) };
  }
  if (s.deadline && s.deadline <= now) {
    if (s.phase === 'discussion') {
      const r = beginVoting(s, d, null);
      return { changed: true, alarmAt: r.alarmAt };
    }
    if (s.phase === 'voting') {
      const r = resolveVotes(s, d);
      return { ...r, alarmAt: nextDeadline(s) };
    }
    if (s.phase === 'spyGuess') {
      const spyName = s.players.find((p) => s.spyIds.includes(p.id))?.name ?? 'جاسوس';
      return afterCaughtSpy(s, d, false, `${spyName} در فرصت حدس کلمه، زمان را از دست داد؛ ${s.turnOrder.filter((id) => s.spyIds.includes(id)).length > 0 ? 'بازی ادامه دارد.' : 'شهروندها برنده شدند!'}`);
    }
    if (s.phase === 'roundResult') {
      // شروع خودکار دور بعد با کلمهٔ جدید؛ اگر ممکن نبود به لابی برمی‌گردیم
      const r = startRound(s, d);
      if (r.err) {
        s.phase = 'waiting';
        s.location = null;
        s.deadline = null;
        s.turnEndsAt = null;
        for (const p of s.players) {
          p.role = null;
          p.eliminated = false;
        }
        return { changed: true, alarmAt: null };
      }
      return { changed: true, alarmAt: nextDeadline(s) };
    }
  }
  return res;
}

/* ---------- دیسپچر اصلی ---------- */

export function apply(s: RoomState, playerId: string | null, msg: C2S, d: Deps): ApplyOk {
  switch (msg.t) {
    case 'ready':
      if (!playerId) return { changed: false, err: ERR.BAD_MSG };
      return markReady(s, playerId, d, msg.value !== false);
    case 'start': {
      if (!playerId || playerId !== s.hostId) return { changed: false, err: ERR.NOT_HOST };
      return startRound(s, d);
    }
    case 'restart': {
      if (!playerId) return { changed: false, err: ERR.BAD_MSG };
      return restartRound(s, playerId, d);
    }
    case 'updateSettings':
      if (!playerId) return { changed: false, err: ERR.BAD_MSG };
      return updateSettings(s, playerId, msg.patch ?? {});
    case 'chat':
      if (!playerId) return { changed: false, err: ERR.BAD_MSG };
      return sendChat(s, playerId, String(msg.text ?? ''), d);
    case 'sticker':
      if (!playerId) return { changed: false, err: ERR.BAD_MSG };
      return sendSticker(s, playerId, String(msg.id ?? ''), d);
    case 'skipTurn':
      if (!playerId) return { changed: false, err: ERR.BAD_MSG };
      return skipTurn(s, playerId, d);
    case 'endTurn':
      if (!playerId) return { changed: false, err: ERR.BAD_MSG };
      return endTurn(s, playerId, d);
    case 'challenge':
      if (!playerId) return { changed: false, err: ERR.BAD_MSG };
      return challenge(s, playerId, String(msg.targetId ?? ''), d);
    case 'passTurn':
      if (!playerId) return { changed: false, err: ERR.BAD_MSG };
      return passTurn(s, playerId, String(msg.targetId ?? ''), d);
    case 'target':
      if (!playerId) return { changed: false, err: ERR.BAD_MSG };
      return setTarget(s, playerId, String(msg.targetId ?? ''));
    case 'vote': {
      if (!playerId) return { changed: false, err: ERR.BAD_MSG };
      const t = msg.targetId === null ? null : String(msg.targetId);
      return castVote(s, playerId, t, d);
    }
    case 'spyGuess':
      if (!playerId) return { changed: false, err: ERR.BAD_MSG };
      return spyGuess(s, playerId, String(msg.locationId ?? ''), d);
    case 'spyGuessWord':
      if (!playerId) return { changed: false, err: ERR.BAD_MSG };
      return spyGuessWord(s, playerId, String(msg.word ?? ''), d);
    case 'voice': {
      if (!playerId) return { changed: false, err: ERR.BAD_MSG };
      return setVoice(s, playerId, !!msg.micOn, !!msg.speaking, msg.joined === undefined ? undefined : !!msg.joined);
    }
    case 'report':
      if (!playerId) return { changed: false, err: ERR.BAD_MSG };
      return reportPlayer(s, playerId, String(msg.targetId ?? ''));
    case 'kick':
      if (!playerId) return { changed: false, err: ERR.BAD_MSG };
      return kickPlayer(s, playerId, String(msg.targetId ?? ''), d);
    case 'mute':
      if (!playerId) return { changed: false, err: ERR.BAD_MSG };
      return forceMute(s, playerId, String(msg.targetId ?? ''), !!msg.muted);
    case 'leave': {
      if (!playerId) return { changed: false };
      const r = removePlayer(s, playerId, d);
      return { ...r, closePlayer: playerId };
    }
    case 'ping':
      return { changed: false };
    default:
      return { changed: false, err: ERR.BAD_MSG };
  }
}
