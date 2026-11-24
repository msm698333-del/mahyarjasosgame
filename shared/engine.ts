// موتور بازی «جاسوس» — منطق خالص و قابل‌تست، بدون وابستگی به Workers یا DOM
// همهٔ اعتبارسنجی‌ها سمت سرور همین‌جا انجام می‌شود؛ کلاینت هیچ‌وقت منبع حقیقت نیست.

import { C2S, ERR, GameSettings, Phase, PublicState, RoleInfo, RoundResult, S2C, TallyInfo, YouInfo, DEFAULT_SETTINGS } from './types';
import { FALLBACK_ROLES, LocationDef, locationById, pickLocation } from './locations';
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
  skipLeft: number;
  score: number;
  joinedAt: number;
  lastSeen: number;
  reports: number;
  reportedBy: Set<string>;
  role: RoleInfo | null;
}

export interface RoomState {
  code: string;
  createdAt: number;
  phase: Phase;
  settings: GameSettings;
  players: Player[];
  hostId: string;
  round: number;
  location: LocationDef | null;
  revealedAt: number | null;
  turnOrder: string[];
  currentTurnIdx: number;
  turnEndsAt: number | null;
  deadline: number | null;
  targetId: string | null;
  readyIds: string[];
  votes: Record<string, string | null>;
  voteRound: number;
  tiedIds: string[] | null;
  tally: TallyInfo | null;
  results: RoundResult | null;
  spyGuessId: string | null;
  lastStickerAt: Record<string, number>;
  lastChatAt: Record<string, number>;
}

export interface Deps {
  rng: Rng;
  now: number;
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
    skipLeft: DEFAULT_SETTINGS.skipPerPlayer, score: 0, joinedAt: d.now, lastSeen: d.now,
    reports: 0, reportedBy: new Set(), role: null
  };
  return {
    code, createdAt: d.now, phase: 'waiting', settings: { ...DEFAULT_SETTINGS },
    players: [host], hostId: host.id, round: 0, location: null, revealedAt: null,
    turnOrder: [], currentTurnIdx: -1, turnEndsAt: null, deadline: null, targetId: null,
    readyIds: [], votes: {}, voteRound: 1, tiedIds: null, tally: null, results: null,
    spyGuessId: null, lastStickerAt: {}, lastChatAt: {}
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
    skipLeft: p.skipLeft, score: p.score, joinedAt: p.joinedAt
  }));
  const ps: PublicState = {
    code: s.code, phase: s.phase, settings: { ...s.settings }, players,
    hostId: s.hostId, createdAt: s.createdAt, round: s.round, serverNow: now,
    deadline: s.deadline ?? undefined, turnOrder: s.turnOrder, currentTurnIdx: s.currentTurnIdx,
    turnEndsAt: s.turnEndsAt ?? undefined, targetId: s.targetId,
    readyCount: s.readyIds.length, votesSubmitted: Object.keys(s.votes).length,
    voteRound: s.voteRound, tiedIds: s.tiedIds, tally: s.tally, results: s.results
  };
  if (viewerId && viewerId === s.hostId) {
    ps.hostView = { reports: Object.fromEntries(s.players.map((p) => [p.id, p.reports])) };
  }
  return ps;
}

export function roleFor(s: RoomState, playerId: string): RoleInfo | null {
  const p = playerById(s, playerId);
  if (!p || !p.role) return null;
  const r = p.role;
  if (r.isSpy) return { isSpy: true, locationCategory: s.location?.cat };
  return r;
}

function youInfo(s: RoomState, p: Player): YouInfo {
  return { id: p.id, token: p.token, name: p.name, avatar: p.avatar, isHost: p.id === s.hostId, skipLeft: p.skipLeft };
}

export function currentSpeakerId(s: RoomState): string | null {
  if (s.phase !== 'discussion' || s.currentTurnIdx < 0) return null;
  return s.turnOrder[s.currentTurnIdx] ?? null;
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
    skipLeft: s.settings.skipPerPlayer, score: 0, joinedAt: d.now, lastSeen: d.now,
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
  transferHostIfNeeded(s, d);
  if (s.phase === 'revealing' && allReady(s)) return startDiscussion(s, d);
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
  if (patch.voteSeconds !== undefined) st.voteSeconds = clamp(patch.voteSeconds | 0, 30, 120);
  if (patch.guessSeconds !== undefined) st.guessSeconds = clamp(patch.guessSeconds | 0, 30, 90);
  if (patch.turnSeconds !== undefined) st.turnSeconds = clamp(patch.turnSeconds | 0, 30, 120);
  if (patch.skipPerPlayer !== undefined) st.skipPerPlayer = clamp(patch.skipPerPlayer | 0, 0, 5);
  if (patch.categories !== undefined && Array.isArray(patch.categories)) {
    const valid = new Set(['public', 'education', 'fun', 'food', 'health', 'historic', 'sport', 'travel', 'fantasy']);
    st.categories = patch.categories.filter((c) => valid.has(c)).slice(0, 9);
  }
  if (st.spyCount === 2 && st.maxPlayers < 6) st.maxPlayers = 6;
  s.settings = st;
  for (const p of s.players) p.skipLeft = st.skipPerPlayer;
  return { changed: true };
}

/* ---------- شروع دور ---------- */

export function startRound(s: RoomState, d: Deps): ApplyOk & { err?: string } {
  if (s.phase !== 'waiting') return { changed: false, err: ERR.WRONG_PHASE };
  const active = s.players.filter((p) => p.connected);
  if (active.length < 3) return { changed: false, err: 'need_players' };
  const spyCount = Math.min(s.settings.spyCount, Math.floor(active.length / 3) || 1);
  const loc = pickLocation(s.settings.categories.length ? s.settings.categories : null, d.rng);
  if (!loc) return { changed: false, err: 'no_location' };

  s.location = loc;
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

  const order = shuffle(active.map((p) => p.id), d.rng);
  const spies = new Set(order.slice(0, spyCount));
  const roles = shuffle(loc.roles, d.rng);
  const fallbacks = shuffle(FALLBACK_ROLES, d.rng);
  let fi = 0;
  const usedRoles = new Set<string>();

  for (const p of s.players) {
    p.skipLeft = s.settings.skipPerPlayer;
    p.role = null;
    if (spies.has(p.id)) {
      p.role = { isSpy: true };
    } else if (order.includes(p.id)) {
      let role = roles.pop();
      while (role && usedRoles.has(role)) role = roles.pop();
      if (!role) role = fallbacks[fi++ % fallbacks.length] + (fi > FALLBACK_ROLES.length ? ' ' + (Math.floor(fi / FALLBACK_ROLES.length) + 1) : '');
      usedRoles.add(role);
      p.role = { isSpy: false, locationId: loc.id, roleName: role };
    } else {
      p.role = null; // بازیکن قطع‌شده در این دور شرکت نمی‌کند
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

export function markReady(s: RoomState, playerId: string, d: Deps): ApplyOk {
  if (s.phase !== 'revealing') return { changed: false, err: ERR.WRONG_PHASE };
  const p = playerById(s, playerId);
  if (!p || !p.role) return { changed: false, err: ERR.WRONG_PHASE };
  if (!s.readyIds.includes(playerId)) s.readyIds.push(playerId);
  if (allReady(s)) return startDiscussion(s, d);
  return { changed: true };
}

export function startDiscussion(s: RoomState, d: Deps): ApplyOk {
  s.phase = 'discussion';
  s.deadline = d.now + s.settings.discussionSeconds * 1000;
  s.currentTurnIdx = 0;
  s.turnEndsAt = d.now + s.settings.turnSeconds * 1000;
  s.targetId = null;
  return { changed: true, alarmAt: Math.min(s.deadline, s.turnEndsAt) };
}

/* ---------- نوبت‌ها ---------- */

function advanceTurn(s: RoomState, d: Deps): void {
  if (s.phase !== 'discussion' || s.turnOrder.length === 0) return;
  for (let i = 0; i <= s.turnOrder.length; i++) {
    s.currentTurnIdx = (s.currentTurnIdx + 1) % s.turnOrder.length;
    const pid = s.turnOrder[s.currentTurnIdx];
    const p = playerById(s, pid);
    if (p && p.connected) break;
    // بازیکن قطع‌شده → نوبتش خودکار رد می‌شود
  }
  s.turnEndsAt = d.now + s.settings.turnSeconds * 1000;
  s.targetId = null;
}

export function skipTurn(s: RoomState, playerId: string, d: Deps): ApplyOk {
  if (s.phase !== 'discussion') return { changed: false, err: ERR.WRONG_PHASE };
  if (currentSpeakerId(s) !== playerId) return { changed: false, err: ERR.NOT_YOUR_TURN };
  const p = playerById(s, playerId);
  if (!p) return { changed: false, err: ERR.BAD_TARGET };
  if (p.skipLeft <= 0) return { changed: false, err: ERR.NO_SKIPS };
  p.skipLeft -= 1;
  advanceTurn(s, d);
  return { changed: true, alarmAt: Math.min(s.deadline ?? Infinity, s.turnEndsAt ?? Infinity) };
}

export function endTurn(s: RoomState, playerId: string, d: Deps): ApplyOk {
  if (s.phase !== 'discussion') return { changed: false, err: ERR.WRONG_PHASE };
  if (currentSpeakerId(s) !== playerId) return { changed: false, err: ERR.NOT_YOUR_TURN };
  advanceTurn(s, d);
  return { changed: true, alarmAt: Math.min(s.deadline ?? Infinity, s.turnEndsAt ?? Infinity) };
}

export function setTarget(s: RoomState, playerId: string, targetId: string): ApplyOk {
  if (s.phase !== 'discussion') return { changed: false, err: ERR.WRONG_PHASE };
  if (currentSpeakerId(s) !== playerId) return { changed: false, err: ERR.NOT_YOUR_TURN };
  const t = playerById(s, targetId);
  if (!t || t.id === playerId) return { changed: false, err: ERR.BAD_TARGET };
  s.targetId = targetId;
  return { changed: true };
}

/* ---------- رأی‌گیری ---------- */

function beginVoting(s: RoomState, d: Deps, tiedIds: string[] | null): ApplyOk {
  s.phase = 'voting';
  s.voteRound = tiedIds ? s.voteRound + 1 : 1;
  s.tiedIds = tiedIds;
  s.votes = {};
  s.tally = null;
  s.deadline = d.now + s.settings.voteSeconds * 1000;
  return { changed: true, alarmAt: s.deadline };
}

export function castVote(s: RoomState, voterId: string, targetId: string | null, d: Deps): ApplyOk {
  if (s.phase !== 'voting') return { changed: false, err: ERR.WRONG_PHASE };
  const voter = playerById(s, voterId);
  if (!voter) return { changed: false, err: ERR.BAD_TARGET };
  if (voterId in s.votes) return { changed: false, err: ERR.ALREADY_VOTED };
  if (targetId !== null) {
    const t = playerById(s, targetId);
    if (!t) return { changed: false, err: ERR.BAD_VOTE };
    if (s.tiedIds && !s.tiedIds.includes(targetId)) return { changed: false, err: ERR.BAD_VOTE };
    if (!s.tiedIds && t.id === voterId) return { changed: false, err: ERR.BAD_VOTE };
  }
  s.votes[voterId] = targetId;
  const connectedIds = s.players.filter((p) => p.connected).map((p) => p.id);
  const allVoted = connectedIds.every((id) => id in s.votes);
  if (allVoted) return resolveVotes(s, d);
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
    return endRound(s, d, true, null, 'هیچ‌کس متهم نشد؛ جاسوس موفق به فرار شد.');
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
    return { changed: true, alarmAt: s.deadline };
  }
  return endRound(s, d, true, accused, `${accusedP?.name ?? 'بازیکن'} اشتباهاً متهم شد؛ جاسوس موفق به فرار شد.`);
}

/* ---------- حدس جاسوس ---------- */

export function spyGuess(s: RoomState, playerId: string, locationId: string, d: Deps): ApplyOk {
  if (s.phase !== 'spyGuess') return { changed: false, err: ERR.WRONG_PHASE };
  const p = playerById(s, playerId);
  if (!p?.role?.isSpy) return { changed: false, err: ERR.NOT_SPY };
  if (s.spyGuessId) return { changed: false, err: ERR.BAD_GUESS };
  if (!locationById(locationId)) return { changed: false, err: ERR.BAD_GUESS };
  s.spyGuessId = locationId;
  if (locationId === s.location?.id) {
    return endRound(s, d, true, s.tally?.accusedId ?? null, `${p.name} متهم شد اما مکان مخفی را درست حدس زد؛ جاسوس‌ها برنده شدند!`);
  }
  return endRound(s, d, false, s.tally?.accusedId ?? null, `${p.name} متهم و حذف شد و حدس مکان هم غلط بود؛ شهروندها برنده شدند!`);
}

export function endRound(s: RoomState, d: Deps, spyWon: boolean, accusedId: string | null, reason: string): ApplyOk {
  s.phase = 'ended';
  s.deadline = null;
  s.turnEndsAt = null;
  const spyIds = s.players.filter((p) => p.role?.isSpy).map((p) => p.id);
  const scores: Record<string, number> = {};
  for (const p of s.players) {
    const win = p.role?.isSpy ? spyWon : !spyWon;
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
  s.phase = 'waiting';
  for (const p of s.players) p.role = null;
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

export function sendChat(s: RoomState, playerId: string, text: string, d: Deps): ApplyOk {
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
  const p = playerById(s, playerId);
  if (!p) return { changed: false, err: ERR.BAD_TARGET };
  if (!/^[a-z0-9-]{1,32}$/.test(id)) return { changed: false, err: ERR.BAD_MSG };
  const last = s.lastStickerAt[playerId] ?? 0;
  if (d.now - last < 3000) return { changed: false, err: ERR.RATE_LIMIT };
  s.lastStickerAt[playerId] = d.now;
  return { changed: false, mutated: true, emits: [{ t: 'sticker', from: playerId, id, ts: d.now }] };
}

export function setVoice(s: RoomState, playerId: string, micOn: boolean, speaking: boolean): ApplyOk {
  const p = playerById(s, playerId);
  if (!p) return { changed: false };
  const mic = micOn && !p.forceMuted;
  if (p.micOn === mic && p.speaking === speaking) return { changed: false };
  p.micOn = mic;
  p.speaking = speaking;
  return { changed: true };
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
      const spyName = s.players.find((p) => p.role?.isSpy)?.name ?? 'جاسوس';
      return endRound(s, d, false, s.tally?.accusedId ?? null, `${spyName} در فرصت حدس مکان، زمان را از دست داد؛ شهروندها برنده شدند!`);
    }
  }
  return res;
}

/* ---------- دیسپچر اصلی ---------- */

export function apply(s: RoomState, playerId: string | null, msg: C2S, d: Deps): ApplyOk {
  switch (msg.t) {
    case 'ready':
      if (!playerId) return { changed: false, err: ERR.BAD_MSG };
      return markReady(s, playerId, d);
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
    case 'voice': {
      if (!playerId) return { changed: false, err: ERR.BAD_MSG };
      return setVoice(s, playerId, !!msg.micOn, !!msg.speaking);
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
