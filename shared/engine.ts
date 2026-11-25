// موتور بازی «جاسوس» — منطق خالص و قابل‌تست، بدون وابستگی به Workers یا DOM
// همهٔ اعتبارسنجی‌ها سمت سرور همین‌جا انجام می‌شود؛ کلاینت هیچ‌وقت منبع حقیقت نیست.

import { C2S, ERR, GameSettings, Phase, PublicState, RoleInfo, RoundResult, S2C, TallyInfo, YouInfo, DEFAULT_SETTINGS, EliminationInfo, ROUND_RESULT_SECONDS } from './types';
import { LocationDef, LOCATIONS, locationById, pickLocation } from './locations';
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
    eliminated: false, skipLeft: DEFAULT_SETTINGS.skipPerPlayer, score: 0, joinedAt: d.now, lastSeen: d.now,
    reports: 0, reportedBy: new Set(), role: null
  };
  return {
    code, createdAt: d.now, phase: 'waiting', settings: { ...DEFAULT_SETTINGS },
    players: [host], hostId: host.id, round: 0, location: null, revealedAt: null,
    turnOrder: [], currentTurnIdx: -1, turnEndsAt: null, deadline: null, targetId: null,
    spyIds: [], readyIds: [], votes: {}, voteRound: 1, tiedIds: null, tally: null,
    lastElimination: null, roundNote: null, results: null,
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
    ready: s.readyIds.includes(p.id), eliminated: p.eliminated,
    skipLeft: p.skipLeft, score: p.score, joinedAt: p.joinedAt
  }));
  const ps: PublicState = {
    code: s.code, phase: s.phase, settings: { ...s.settings }, players,
    hostId: s.hostId, createdAt: s.createdAt, round: s.round, serverNow: now,
    deadline: s.deadline ?? undefined, turnOrder: s.turnOrder, currentTurnIdx: s.currentTurnIdx,
    turnEndsAt: s.turnEndsAt ?? undefined, targetId: s.targetId,
    readyCount: s.readyIds.length, votesSubmitted: Object.keys(s.votes).length,
    voteRound: s.voteRound, tiedIds: s.tiedIds, tally: s.tally,
    elimination: s.lastElimination, roundNote: s.roundNote, results: s.results
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