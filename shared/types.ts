// پروتکل مشترک کلاینت/سرور «بازی جاسوس»
// قانون امنیتی: اطلاعات نقش (RoleInfo) هرگز داخل PublicState پخش نمی‌شود؛ فقط به صورت پیام خصوصی به صاحب نقش می‌رود.

import { Difficulty } from './wordBank';

export type Phase = 'waiting' | 'revealing' | 'discussion' | 'voting' | 'spyGuess' | 'roundResult' | 'ended';

/** مدت نمایش صفحهٔ «حذف‌شدهٔ دور» قبل از شروع خودکار دور بعد */
export const ROUND_RESULT_SECONDS = 12;

/** نشانگر «حدس با نوشتن کلمه» در نتایج دور (به‌جای شناسهٔ مکان) */
export const SPY_WORD_GUESS = '__word__';

export interface GameSettings {
  maxPlayers: number;        // 3..12
  spyCount: number;          // 1..2
  discussionSeconds: number; // سقف احتیاطی کل بحث (رأی‌گیری بعد از یک دور کامل صحبت شروع می‌شود)
  voteSeconds: number;       // مدت رأی‌گیری
  guessSeconds: number;      // فرصت حدس جاسوس
  turnSeconds: number;       // مدت هر نوبت — ثابت روی ۱۰ ثانیه قفل است و تغییر نمی‌کند
  skipPerPlayer: number;     // تعداد Skip Turn هر بازیکن در هر دور
  spyWord: 'nearby' | 'none'; // کلمهٔ جاسوس: نزدیک به کلمهٔ شهروندها یا بدون کلمه
  difficulty: Difficulty;    // سطح سختی: آسان/متوسط/سخت — فاصلهٔ کلمهٔ جاسوس تا کلمهٔ شهروندها
  categories: string[];      // دسته‌های فعال بانک کلمات؛ خالی = همه
}

export const DEFAULT_SETTINGS: GameSettings = {
  maxPlayers: 8,
  spyCount: 1,
  discussionSeconds: 480,
  voteSeconds: 30,
  guessSeconds: 45,
  turnSeconds: 10, // قانون تایمر: هر نوبت دقیقاً ۱۰ ثانیه — قفل سراسری
  skipPerPlayer: 2,
  spyWord: 'nearby',
  difficulty: 'medium',
  categories: []
};

export interface PlayerPublic {
  id: string;
  name: string;
  avatar: number;
  isHost: boolean;
  connected: boolean;
  micOn: boolean;
  speaking: boolean;
  hasVoice: boolean;
  forceMuted: boolean;
  ready: boolean;      // وضعیت آمادگی — برای همه قابل مشاهده
  eliminated: boolean; // حذف‌شده در رأی‌گیری‌های این بازی
  skipLeft: number;
  score: number;
  joinedAt: number;
}

export interface RoleInfo {
  isSpy: boolean;
  locationId?: string;
  locationName?: string;
  locationCategory?: string;
  roleName?: string;
}

export interface TallyInfo {
  accusedId: string | null;
  counts: Record<string, number>;
  spyCaught: boolean;
}

/** نتیجهٔ حذف آخرین رأی‌گیری — برای نمایش «افشای نقش حذف‌شده» به همه */
export interface EliminationInfo {
  playerId: string;
  name: string;
  wasSpy: boolean;
}

export interface RoundResult {
  spyIds: string[];
  locationId: string;
  locationName: string;
  locationCategory: string;
  accusedId: string | null;
  votes: Record<string, string | null>;
  spyWon: boolean;
  spyGuessId?: string | null;
  reason: string;
  scores: Record<string, number>;
}

/** سهمیهٔ زمانی روزانهٔ خودِ بیننده — فقط به خودش نمایش داده می‌شود */
export interface QuotaInfo {
  remaining: number; // ثانیهٔ باقی‌ماندهٔ امروز
  total: number;     // کل سهمیهٔ روزانه (۶۰ ثانیه)
  day: string;       // کلید روز تهران مثل «2026-01-01» — بازنشانی ۰۰:۰۰ تهران
}

export interface PublicState {
  code: string;
  phase: Phase;
  settings: GameSettings;
  players: PlayerPublic[];
  hostId: string;
  createdAt: number;
  round: number;
  serverNow: number;
  deadline?: number;        // پایان فاز جاری (epoch ms)
  turnOrder: string[];
  currentTurnIdx: number;
  turnEndsAt?: number;
  targetId: string | null;          // بازیکنی که نوبت‌دار از او پرسش می‌کند
  challengedIds: string[];          // بازیکنانی که با چالش/واگذاری وارد نوبت شده‌اند (حق واگذاری دارند)
  readyCount: number;
  votesSubmitted: number;
  voteRound: number;
  tiedIds: string[] | null;
  tally: TallyInfo | null;
  elimination: EliminationInfo | null; // حذف‌شدهٔ آخرین رأی‌گیری
  roundNote: string | null;            // یادداشت انتقال دور (مثل «هیچ رأیی ثبت نشد»)
  turnNote: string | null;             // یادداشت گذرای نوبت (مثل ردّ خودکار به‌خاطر پایان سهمیه)
  quota?: QuotaInfo;                   // فقط برای بیننده (هرگز در broadcast بدون viewer نمی‌آید)
  results: RoundResult | null;
  hostView?: { reports: Record<string, number> };
}

export interface YouInfo {
  id: string;
  token: string;
  name: string;
  avatar: number;
  isHost: boolean;
  skipLeft: number;
}

export interface ChatMsg { from: string; name: string; text: string; ts: number }

/* ---------- پیام‌های کلاینت → سرور ---------- */

export type C2S =
  | { t: 'hello'; name: string; avatar: number; playerId?: string; token?: string; deviceId?: string }
  | { t: 'ready'; value?: boolean }
  | { t: 'start' }
  | { t: 'restart' }
  | { t: 'updateSettings'; patch: Partial<GameSettings> }
  | { t: 'chat'; text: string }
  | { t: 'sticker'; id: string }
  | { t: 'skipTurn' }
  | { t: 'endTurn' }
  | { t: 'challenge'; targetId: string }   // نوبت‌دار بازیکن دیگری را به چالش می‌کشد
  | { t: 'passTurn'; targetId: string }    // به‌چالش‌کشیده‌شده نوبت را به دیگری واگذار می‌کند
  | { t: 'target'; targetId: string }
  | { t: 'vote'; targetId: string | null }
  | { t: 'spyGuess'; locationId: string }
  | { t: 'spyGuessWord'; word: string }    // حدس با نوشتن کلمه — املای درست با خط‌فاصله پذیرفته می‌شود
  | { t: 'voice'; micOn: boolean; speaking?: boolean; joined?: boolean }
  | { t: 'vsig'; to: string; data: unknown }
  | { t: 'report'; targetId: string }
  | { t: 'kick'; targetId: string }
  | { t: 'mute'; targetId: string; muted: boolean }
  | { t: 'leave' }
  | { t: 'ping' };

/* ---------- پیام‌های سرور → کلاینت ---------- */

export type S2C =
  | { t: 'welcome'; code: string; you: YouInfo; state: PublicState; role: RoleInfo | null }
  | { t: 'state'; state: PublicState }
  | { t: 'role'; role: RoleInfo }
  | { t: 'chat'; from: string; name: string; text: string; ts: number }
  | { t: 'sticker'; from: string; id: string; ts: number }
  | { t: 'voice'; playerId: string; micOn: boolean; speaking: boolean }
  | { t: 'vsig'; from: string; data: unknown }
  | { t: 'error'; code: string; message: string }
  | { t: 'kicked' }
  | { t: 'pong' };

/* ---------- پیام‌های Transport داخلی سرور ---------- */

export interface Directed { to: 'all' | string[]; msg: S2C }

/* ---------- خطاهای استاندارد ---------- */

export const ERR = {
  NOT_FOUND: 'lobby_not_found',
  FULL: 'lobby_full',
  STARTED: 'game_started',
  BAD_NAME: 'bad_name',
  BAD_TOKEN: 'bad_token',
  NOT_HOST: 'not_host',
  WRONG_PHASE: 'wrong_phase',
  NOT_YOUR_TURN: 'not_your_turn',
  NOT_CHALLENGED: 'not_challenged',
  NO_SKIPS: 'no_skips',
  CHAT_LOCKED: 'chat_locked',
  BAD_TARGET: 'bad_target',
  ALREADY_VOTED: 'already_voted',
  BAD_VOTE: 'bad_vote',
  NOT_SPY: 'not_spy',
  BAD_GUESS: 'bad_guess',
  NO_QUOTA: 'no_quota',
  RATE_LIMIT: 'rate_limit',
  BAD_MSG: 'bad_message',
  LOBBY_BROKEN: 'lobby_broken'
} as const;
