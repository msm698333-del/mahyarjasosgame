// پروتکل مشترک کلاینت/سرور «بازی جاسوس»
// قانون امنیتی: اطلاعات نقش (RoleInfo) هرگز داخل PublicState پخش نمی‌شود؛ فقط به صورت پیام خصوصی به صاحب نقش می‌رود.

export type Phase = 'waiting' | 'revealing' | 'discussion' | 'voting' | 'spyGuess' | 'ended';

export interface GameSettings {
  maxPlayers: number;        // 3..12
  spyCount: number;          // 1..2
  discussionSeconds: number; // مدت بحث
  voteSeconds: number;       // مدت رأی‌گیری
  guessSeconds: number;      // فرصت حدس جاسوس
  turnSeconds: number;       // سقف هر نوبت (پیشروی خودکار)
  skipPerPlayer: number;     // تعداد Skip Turn هر بازیکن در هر دور
  categories: string[];      // دسته‌های فعال مکان‌ها؛ خالی = همه
}

export const DEFAULT_SETTINGS: GameSettings = {
  maxPlayers: 8,
  spyCount: 1,
  discussionSeconds: 480,
  voteSeconds: 60,
  guessSeconds: 45,
  turnSeconds: 60,
  skipPerPlayer: 2,
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
  targetId: string | null;  // بازیکنی که نوبت‌دار از او پرسش می‌کند
  readyCount: number;
  votesSubmitted: number;
  voteRound: number;
  tiedIds: string[] | null;
  tally: TallyInfo | null;
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
  | { t: 'hello'; name: string; avatar: number; playerId?: string; token?: string }
  | { t: 'ready' }
  | { t: 'start' }
  | { t: 'restart' }
  | { t: 'updateSettings'; patch: Partial<GameSettings> }
  | { t: 'chat'; text: string }
  | { t: 'sticker'; id: string }
  | { t: 'skipTurn' }
  | { t: 'endTurn' }
  | { t: 'target'; targetId: string }
  | { t: 'vote'; targetId: string | null }
  | { t: 'spyGuess'; locationId: string }
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
  NO_SKIPS: 'no_skips',
  BAD_TARGET: 'bad_target',
  ALREADY_VOTED: 'already_voted',
  BAD_VOTE: 'bad_vote',
  NOT_SPY: 'not_spy',
  BAD_GUESS: 'bad_guess',
  RATE_LIMIT: 'rate_limit',
  BAD_MSG: 'bad_message',
  LOBBY_BROKEN: 'lobby_broken'
} as const;
