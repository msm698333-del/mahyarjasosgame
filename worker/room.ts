// RoomSession — لایهٔ پروتکل بین سوکت‌ها و موتور بازی
// مستقل از runtime (Node/Workers) و کاملاً قابل تست با Transport تزریقی.

import {
  C2S, ERR, PublicState, RoleInfo, S2C, YouInfo
} from '../shared/types';
import {
  ApplyOk, Deps, QuotaOps, RoomState, addPlayer, apply, canJoin, createRoom, nextDeadline,
  onDeadline, playerById, pruneReveal, publicState, reattach, removePlayer, roleFor
} from '../shared/engine';
import { DAILY_QUOTA_SECONDS } from '../shared/quota';
import { wordCategoryIds } from '../shared/wordBank';
import { Rng } from '../shared/ids';

export interface Transport {
  sendTo(playerId: string, msg: S2C): void;
  broadcast(msg: S2C): void;
  close(playerId: string, code?: string): void;
}

const MAX_MSG_BYTES = 8000;
export const DISCONNECT_TIMEOUT_MS = 90_000;
export const GAME_END_KEEP_MS = 180_000;

export const ERROR_TEXT: Record<string, string> = {
  lobby_not_found: 'لابی پیدا نشد؛ کد را بررسی کنید.',
  lobby_full: 'لابی پر است.',
  game_started: 'بازی در جریان است؛ امکان ورود وجود ندارد.',
  bad_name: 'نام باید حداقل ۲ حرف باشد.',
  bad_token: 'نشست شما معتبر نیست؛ دوباره وارد شوید.',
  not_host: 'این کار فقط از دست میزبان برمی‌آید.',
  wrong_phase: 'این عملیات در این مرحله از بازی مجاز نیست.',
  not_your_turn: 'الان نوبت شما نیست.',
  not_challenged: 'فقط بازیکن به‌چالش‌کشیده‌شده می‌تواند نوبت را واگذار کند.',
  no_skips: 'سهمیهٔ رد کردن نوبت شما تمام شده است.',
  chat_locked: 'در طول بازی چت متنی غیرفعال است؛ ارتباط فقط صوتی و در نوبت خودتان است.',
  mic_forced_off: 'الان نوبت شما نیست؛ میکروفن فقط در نوبت شما باز می‌شود.',
  bad_target: 'این بازیکن در دسترس نیست.',
  already_voted: 'شما قبلاً رأی داده‌اید.',
  bad_vote: 'این گزینه برای رأی معتبر نیست.',
  not_spy: 'شما جاسوس نیستید.',
  bad_guess: 'این حدس معتبر نیست.',
  rate_limit: 'کمی آهسته‌تر! چند لحظه صبر کنید.',
  bad_message: 'پیام نامعتبر.',
  duplicate_name: 'این نام قبلاً در لابی استفاده شده.',
  need_players: 'برای شروع حداقل ۳ بازیکن متصل لازم است.',
  no_location: 'کلمهٔ فعالی برای انتخاب وجود ندارد.',
  lobby_broken: 'وضعیت لابی نامعتبر است.',
  no_quota: 'سهمیهٔ زمانی روزانهٔ این بازیکن تمام شده؛ نوبت به او نمی‌رسد.'
};

export class RoomSession {
  s: RoomState | null = null;
  lastPhase = '';
  alarmCb: ((at: number) => void) | null = null;
  /** مصرف‌های سهمیهٔ این رویداد — GameRoomDO بعد از هر رویداد آن را به QuotaDO می‌فرستد */
  readonly consumedLog: { pid: string; seconds: number }[] = [];

  constructor(
    private t: Transport,
    private persist: (s: RoomState) => void,
    private rng: Rng,
    private recordMatch?: (s: RoomState) => void,
    private quotaEnabled = false
  ) {}

  private d(now: number): Deps {
    return {
      rng: this.rng,
      now,
      ...(this.quotaEnabled ? { quota: this.quotaOps() } : {})
    };
  }

  /** عملیات سهمیه روی کش RoomState.quotaLeft — منبع حقیقت در QuotaDO است و بعد از هر رویداد همگام می‌شود */
  private quotaOps(): QuotaOps {
    return {
      left: (pid) => {
        const v = this.s?.quotaLeft[pid];
        return v == null ? DAILY_QUOTA_SECONDS : v;
      },
      consume: (pid, seconds) => {
        if (!this.s) return;
        const cur = this.s.quotaLeft[pid] ?? DAILY_QUOTA_SECONDS;
        this.s.quotaLeft[pid] = Math.max(0, cur - seconds);
        this.consumedLog.push({ pid, seconds });
      }
    };
  }

  /** مصرف‌های ثبت‌شدهٔ این رویداد را برمی‌گرداند و فهرست را خالی می‌کند */
  takeConsumed(): { pid: string; seconds: number }[] {
    const out = [...this.consumedLog];
    this.consumedLog.length = 0;
    return out;
  }

  load(raw: unknown): void {
    if (raw && typeof raw === 'object') {
      this.s = raw as RoomState;
      // مهاجرت لابی‌های ساخته‌شده با نسخه‌های قبلی
      if (!Array.isArray(this.s.spyIds)) this.s.spyIds = [];
      if (this.s.lastElimination === undefined) this.s.lastElimination = null;
      if (this.s.roundNote === undefined) this.s.roundNote = null;
      if (!Array.isArray(this.s.challengedIds)) this.s.challengedIds = [];
      if (this.s.chainReturnIdx === undefined) this.s.chainReturnIdx = null;
      if (!Array.isArray(this.s.usedLocationIds)) this.s.usedLocationIds = [];
      if (!this.s.quotaLeft || typeof this.s.quotaLeft !== 'object') this.s.quotaLeft = {};
      if (this.s.turnNote === undefined) this.s.turnNote = null;
      if (this.s.settings) {
        if (!this.s.settings.spyWord) this.s.settings.spyWord = 'nearby';
        // قانون تایمر جدید: هر نوبت دقیقاً ۱۰ ثانیه — لابی‌های قدیمی هم قفل می‌شوند
        this.s.settings.turnSeconds = 10;
        if (this.s.settings.difficulty !== 'easy' && this.s.settings.difficulty !== 'medium' && this.s.settings.difficulty !== 'hard') {
          this.s.settings.difficulty = 'medium';
        }
        // مهاجرت دسته‌های قدیمی مکان‌ها به دسته‌های بانک کلمات — نامعتبرها حذف می‌شوند
        const validCats = new Set<string>(wordCategoryIds());
        if (Array.isArray(this.s.settings.categories)) {
          this.s.settings.categories = this.s.settings.categories.filter((c) => validCats.has(c));
        }
        if (!(this.s.settings.voteSeconds >= 15)) this.s.settings.voteSeconds = Math.max(15, this.s.settings.voteSeconds ?? 30);
      }
      for (const p of this.s.players) {
        if (!(p.reportedBy instanceof Set)) p.reportedBy = new Set(p.reportedBy ?? []);
        if (typeof p.eliminated !== 'boolean') p.eliminated = false;
      }
    }
  }

  initRoom(code: string, hostName: string, hostAvatar: number, now: number): RoomState {
    this.s = createRoom(code, hostName, hostAvatar, this.d(now));
    this.persist(this.s);
    return this.s;
  }

  get exists(): boolean {
    return this.s !== null;
  }

  isEmpty(): boolean {
    return !this.s || this.s.players.length === 0;
  }

  private sendState(now: number, viewerId?: string): void {
    if (!this.s) return;
    if (viewerId) {
      // وضعیت اختصاصی یک بیننده (سهمیهٔ او فقط برای خودش)
      this.t.sendTo(viewerId, { t: 'state', state: publicState(this.s, now, viewerId) });
      return;
    }
    this.broadcastStates(now);
  }

  /** وضعیت شخصی‌سازی‌شده برای همهٔ بازیکنان متصل — سهمیهٔ روزانهٔ هر کس فقط در نسخهٔ خودش می‌آید */
  broadcastStates(now: number): void {
    if (!this.s) return;
    for (const p of this.s.players) {
      if (!p.connected) continue;
      this.t.sendTo(p.id, { t: 'state', state: publicState(this.s, now, p.id) });
    }
  }

  /** hello: بازیکن جدید یا اتصال مجدد با token — deviceId برای سهمیهٔ روزانهٔ سراسری */
  hello(
    playerIdHint: string | null, tokenHint: string | null,
    name: string, avatar: number, now: number, deviceId?: string
  ): { playerId: string; token: string; reattached: boolean } | { err: string } {
    if (!this.s) return { err: ERR.NOT_FOUND };

    if (playerIdHint && tokenHint) {
      const r = reattach(this.s, playerIdHint, tokenHint, this.d(now));
      if (r.err) return { err: r.err };
      const p = playerById(this.s, playerIdHint)!;
      if (deviceId) p.deviceId = deviceId;
      this.persist(this.s);
      return { playerId: p.id, token: p.token, reattached: true };
    }

    const r = addPlayer(this.s, String(name ?? ''), Number(avatar ?? 0), this.d(now));
    if (r.err || !r.playerId) return { err: r.err ?? ERR.BAD_NAME };
    const p = playerById(this.s, r.playerId)!;
    if (deviceId) p.deviceId = deviceId;
    this.persist(this.s);
    return { playerId: p.id, token: p.token, reattached: false };
  }

  /** نقش خصوصی هر بازیکن فقط به خودش می‌رسد (شروع هر دور) */
  private dealRoles(): void {
    if (!this.s || this.s.phase !== 'revealing') return;
    for (const p of this.s.players) {
      const role = p.connected ? roleFor(this.s, p.id) : null;
      if (role) {
        this.t.sendTo(p.id, { t: 'role', role });
      }
    }
  }

  /** پیام خام از سوکت متصل به playerId */
  onMessage(playerId: string, raw: string, now: number): void {
    if (!this.s) return;
    if (typeof raw !== 'string' || raw.length > MAX_MSG_BYTES) return;
    let msg: C2S;
    try { msg = JSON.parse(raw); } catch { return; }
    if (!msg || typeof msg !== 'object' || typeof (msg as { t?: string }).t !== 'string') return;

    const p = playerById(this.s, playerId);
    if (!p) return;
    p.lastSeen = now;

    // سیگنالینگ WebRTC فقط برای اعضای همین لابی رله می‌شود
    if (msg.t === 'vsig') {
      const to = String((msg as { to?: string }).to ?? '');
      if (to && playerById(this.s, to)) {
        this.t.sendTo(to, { t: 'vsig', from: playerId, data: (msg as { data?: unknown }).data });
      }
      return;
    }

    if (msg.t === 'ping') {
      this.t.sendTo(playerId, { t: 'pong' });
      // self-healing: اگر سوکت سمت سرور بی‌سروصدا بسته شده ولی بازیکن هنوز پینگ می‌دهد، وصلش کن
      if (!p.connected) {
        p.connected = true;
        this.persist(this.s);
        this.sendState(now);
      }
      return;
    }

    const r: ApplyOk = apply(this.s, playerId, msg, this.d(now));
    if (r.err) {
      this.t.sendTo(playerId, { t: 'error', code: r.err, message: ERROR_TEXT[r.err] ?? 'عملیات نامعتبر است.' });
      return;
    }

    if (r.emits) for (const m of r.emits) this.t.broadcast(m);
    if (r.direct) for (const dm of r.direct) this.t.sendTo(dm.to, dm.msg);

    // شروع دور جدید: نقش خصوصی هر بازیکن فقط به خودش می‌رود
    if (this.s.phase === 'revealing' && this.lastPhase !== 'revealing') {
      this.dealRoles();
    }

    if (this.s.phase === 'ended' && this.lastPhase !== 'ended') {
      this.recordMatch?.(this.s);
      this.sendState(now);
    }
    this.lastPhase = this.s.phase;

    if (r.changed || r.mutated) {
      this.persist(this.s);
      if (r.changed) this.sendState(now);
      // گزارش‌ها فقط برای خود میزبان دیده می‌شود؛ اگر گزارش‌دهنده میزبان است، state اختصاصی او هم می‌رود
      if (msg.t === 'report' && playerId === this.s.hostId) {
        this.t.sendTo(playerId, { t: 'state', state: publicState(this.s, now, playerId) });
      }
    }
    if (r.alarmAt != null && this.alarmCb) this.alarmCb(r.alarmAt);
    if (r.closePlayer) this.t.close(r.closePlayer, 'closed');
  }

  /** قطع سوکت بازیکن */
  onDisconnect(playerId: string, now: number): void {
    if (!this.s) return;
    const p = playerById(this.s, playerId);
    if (!p || !p.connected) return;
    p.connected = false;
    p.speaking = false;
    p.hasVoice = false;
    p.micOn = false;
    this.persist(this.s);
    this.sendState(now);
    if (this.alarmCb) {
      const game = nextDeadline(this.s);
      this.alarmCb(Math.min(game ?? Infinity, now + DISCONNECT_TIMEOUT_MS));
    }
  }

  /** اجرای زمان‌رسیده‌ها؛ آلارم بعدی را برمی‌گرداند (null = آلارم نزدیکی نیست) */
  tick(now: number): number | null {
    if (!this.s) return null;
    const res = onDeadline(this.s, this.d(now));
    if (res.changed) {
      this.persist(this.s);
      this.sendState(now);
    }
    // جلوگیری از قفل‌شدن فاز نقش‌نمایی با بازیکنان قطع‌شده
    const pruned = pruneReveal(this.s, now, this.d(now));
    if (pruned.changed) {
      this.persist(this.s);
      this.sendState(now);
    }
    // اگر تیک آلارم فاز را به «نمایش نقش» برده است (دور بعد)، نقش‌ها از نو توزیع می‌شوند
    if (this.s.phase === 'revealing' && this.lastPhase !== 'revealing') {
      this.dealRoles();
    }
    this.lastPhase = this.s.phase;
    const next = nextDeadline(this.s);
    const gcAt = now + 30_000;
    if (this.isEmpty()) return null;
    if (this.s.phase === 'waiting' || this.s.phase === 'ended') {
      this.gc(now); // پاکسازی بازیکنان قطع‌شدهٔ قدیمی فقط در فازهای غیررقابتی
      return next ? Math.min(next, gcAt) : gcAt;
    }
    return next ?? gcAt;
  }

  /** پاکسازی بازیکنان قطع‌شدهٔ قدیمی؛ true = لابی خالی شد */
  gc(now: number): boolean {
    if (!this.s) return true;
    const timeout = this.s.phase === 'waiting' ? DISCONNECT_TIMEOUT_MS : GAME_END_KEEP_MS;
    if (this.s.phase !== 'waiting' && this.s.phase !== 'ended') return false;
    let removed = false;
    for (const p of [...this.s.players]) {
      if (!p.connected && now - p.lastSeen > timeout) {
        removePlayer(this.s, p.id, this.d(now));
        removed = true;
      }
    }
    if (removed) this.persist(this.s);
    return this.isEmpty();
  }
}

/** محتوای welcome برای یک بازیکن (شامل نقش خصوصی) */
export function welcomeFor(s: RoomState, playerId: string, now: number): { you: YouInfo; state: PublicState; role: RoleInfo | null } | null {
  const p = playerById(s, playerId);
  if (!p) return null;
  const you: YouInfo = {
    id: p.id, token: p.token, name: p.name, avatar: p.avatar,
    isHost: p.id === s.hostId, skipLeft: p.skipLeft
  };
  return { you, state: publicState(s, now, playerId), role: roleFor(s, playerId) };
}

export function canJoinRoom(s: RoomState): string | null {
  return canJoin(s);
}
