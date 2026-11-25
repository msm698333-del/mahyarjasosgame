// تست‌های سهمیهٔ زمانی روزانه (قانون ۴) + تایمر ۱۰ ثانیه‌ای نوبت (قانون ۳)
// همهٔ سناریوها سمت موتور بازی (سرور) شبیه‌سازی می‌شوند — کلاینت هرگز منبع حقیقت نیست.
import { describe, it, expect, beforeEach } from 'vitest';
import {
  RoomState, Deps, QuotaOps, addPlayer, challenge, castVote, createRoom, currentSpeakerId,
  endTurn, markReady, onDeadline, playerById, publicState, startRound, updateSettings
} from '../shared/engine';
import { DAILY_QUOTA_SECONDS, TURN_COST_SECONDS, consumeFromRecord, remainingFromRecord } from '../shared/quota';

let seed = 777;
const rng = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};
const T0 = 1_760_000_000_000; // یک لحظهٔ ثابت UTC
const deps = () => ({ rng, now: T0 });

/** سهمیهٔ شبیه‌سازی‌شده — مثل RoomSession روی کش RoomState.quotaLeft کار می‌کند */
function mkQuota(s: RoomState, initial: Record<string, number> = {}) {
  const log: { pid: string; seconds: number }[] = [];
  for (const p of s.players) s.quotaLeft[p.id] = initial[p.id] ?? DAILY_QUOTA_SECONDS;
  const quota = {
    left: (pid: string) => s.quotaLeft[pid] ?? DAILY_QUOTA_SECONDS,
    consume: (pid: string, seconds: number) => {
      const cur = s.quotaLeft[pid] ?? DAILY_QUOTA_SECONDS;
      s.quotaLeft[pid] = Math.max(0, cur - seconds);
      log.push({ pid, seconds });
    }
  };
  return { quota, log };
}

function mkRoom(n = 4): RoomState {
  seed = 99;
  const s = createRoom('QUOT', 'میزبان', 0, deps());
  for (let i = 1; i < n; i++) addPlayer(s, `player-${i}`, i % 12, deps());
  for (const p of s.players) p.connected = true;
  return s;
}

function startDiscussionPhase(s: RoomState, d: Deps = { rng, now: T0 }): void {
  const r = startRound(s, d);
  expect(r.err).toBeUndefined();
  for (const p of s.players) if (p.role) markReady(s, p.id, d);
  expect(s.phase).toBe('discussion');
}

beforeEach(() => { seed = 99; });

describe('تایمر ۱۰ ثانیه‌ای نوبت (قانون ۳)', () => {
  it('هر نوبت دقیقاً ۱۰ ثانیه است و در تنظیمات قفل می‌ماند', () => {
    const s = mkRoom(4);
    expect(s.settings.turnSeconds).toBe(10);
    updateSettings(s, s.hostId, { turnSeconds: 45 as never });
    expect(s.settings.turnSeconds).toBe(10);
    startDiscussionPhase(s);
    expect(s.turnEndsAt).toBe(T0 + 10 * 1000);
  });

  it('با رسیدن تایمر به صفر نوبت خودکار به بازیکن بعدی می‌رسد', () => {
    const s = mkRoom(4);
    startDiscussionPhase(s);
    const first = currentSpeakerId(s)!;
    const t1 = s.turnEndsAt!;
    onDeadline(s, { rng, now: s.turnEndsAt! + 1 });
    expect(s.phase).toBe('discussion');
    expect(currentSpeakerId(s)).not.toBe(first);
    // تایمر نوبت جدید از همان لحظهٔ تغییر نوبت دوباره ۱۰ ثانیه می‌شود
    expect(s.turnEndsAt).toBe(t1 + 1 + 10 * 1000);
  });

  it('پایان کامل یک دور صحبت → رأی‌گیری خودکار', () => {
    const s = mkRoom(3);
    startDiscussionPhase(s);
    let guard = 0;
    while (s.phase === 'discussion' && guard++ < 20) {
      onDeadline(s, { rng, now: s.turnEndsAt! + 1 });
    }
    expect(s.phase).toBe('voting');
  });
});

describe('سهمیهٔ روزانه ۶۰ ثانیه — هر نوبت ۱۰ ثانیه (قانون ۴)', () => {
  it('شروع هر نوبت دقیقاً ۱۰ ثانیه از سهمیه کم می‌کند', () => {
    const s = mkRoom(4);
    const q = mkQuota(s);
    startDiscussionPhase(s, { rng, now: T0, quota: q.quota });
    expect(q.log).toEqual([{ pid: currentSpeakerId(s)!, seconds: TURN_COST_SECONDS }]);
    expect(s.quotaLeft[currentSpeakerId(s)!]).toBe(DAILY_QUOTA_SECONDS - 10);
  });

  it('بعد از تمام شدن سهمیه، بازیکن دیگر نوبت نمی‌گیرد و ردّ خودکار ثبت می‌شود', () => {
    const s = mkRoom(4);
    const q = mkQuota(s);
    const weak = s.players[1];
    s.quotaLeft[weak.id] = 0; // سهمیه‌اش از قبل تمام است
    startDiscussionPhase(s, { rng, now: T0, quota: q.quota });
    expect(currentSpeakerId(s)).not.toBe(weak.id);
    let sawSkipNote = false;
    let guard = 0;
    while (s.phase === 'discussion' && guard++ < s.turnOrder.length) {
      const sp = currentSpeakerId(s)!;
      // بازیکن بدون سهمیه هرگز نوبت نمی‌گیرد (اعتبارسنجی سرور)
      expect(sp).not.toBe(weak.id);
      expect(s.quotaLeft[sp]).toBeGreaterThanOrEqual(TURN_COST_SECONDS);
      const r = endTurn(s, sp, { rng, now: T0, quota: q.quota });
      expect(r.err).toBeUndefined();
      if (s.turnNote?.includes(weak.name)) sawSkipNote = true;
    }
    // وقتی چرخه به صندلی او می‌رسد، ردّ خودکار با پیام ثبت شده است
    expect(sawSkipNote).toBe(true);
  });

  it('بازیکن بدون سهمیه هرگز نوبت نمی‌گیرد و چرخه از او می‌پرد', () => {
    const s = mkRoom(4);
    const q = mkQuota(s);
    startDiscussionPhase(s, { rng, now: T0, quota: q.quota });
    const first = currentSpeakerId(s)!;
    s.quotaLeft[s.players[2].id] = 0;
    // نوبت اول را تمام کن؛ چرخه نباید به بازیکن بی‌سهمیه برسد
    endTurn(s, first, { rng, now: T0, quota: q.quota });
    let hops = 0;
    while (currentSpeakerId(s) === s.players[2].id && hops++ < 5) {
      endTurn(s, currentSpeakerId(s)!, { rng, now: T0, quota: q.quota });
    }
    expect(currentSpeakerId(s)).not.toBe(s.players[2].id);
  });

  it('اگر هیچ بازیکنی سهمیه نداشته باشد، مستقیم رأی‌گیری شروع می‌شود', () => {
    const s = mkRoom(4);
    const q = mkQuota(s);
    for (const p of s.players) s.quotaLeft[p.id] = 0;
    const r = startRound(s, deps());
    expect(r.err).toBeUndefined();
    for (const p of s.players) if (p.role) markReady(s, p.id, { rng, now: T0, quota: q.quota });
    expect(s.phase).toBe('voting');
  });

  it('چالش به بازیکنِ بدون سهمیه رد می‌شود (NO_QUOTA) و سهمیه‌ای کم نمی‌شود', () => {
    const s = mkRoom(4);
    const q = mkQuota(s);
    startDiscussionPhase(s, { rng, now: T0, quota: q.quota });
    const first = currentSpeakerId(s)!;
    const target = s.turnOrder[2];
    s.quotaLeft[target] = 0;
    const before = q.log.length;
    const r = challenge(s, first, target, { rng, now: T0, quota: q.quota });
    expect(r.err).toBe('no_quota');
    expect(currentSpeakerId(s)).toBe(first);
    expect(q.log.length).toBe(before);
  });

  it('سهمیهٔ باقی‌مانده فقط برای خودِ بیننده در وضعیت عمومی می‌آید', () => {
    const s = mkRoom(4);
    mkQuota(s);
    startDiscussionPhase(s);
    const me = s.players[0];
    const psMe = publicState(s, T0, me.id);
    expect(psMe.quota).toBeDefined();
    expect(psMe.quota!.total).toBe(60);
    expect(psMe.quota!.remaining).toBe(60);
    // بدون بیننده سهمیه‌ای پخش نمی‌شود
    expect(publicState(s, T0).quota).toBeUndefined();
    // بینندهٔ دیگر سهمیهٔ خودش را می‌بیند نه دیگری را
    const other = s.players[1];
    const psOther = publicState(s, T0, other.id);
    expect(psOther.quota!.remaining).toBe(60);
    // شیء سهمیه فقط کلیدهای خودش را دارد — سهمیهٔ دیگران هیچ‌جا لو نمی‌رود
    expect(Object.keys(psMe.quota!).sort()).toEqual(['day', 'remaining', 'total']);
  });

  it('حذف بازیکن در رأی‌گیری سهمیه‌اش را برنمی‌گرداند و مصرف ثبت‌شده می‌ماند', () => {
    const s = mkRoom(4);
    const q = mkQuota(s);
    startDiscussionPhase(s, { rng, now: T0, quota: q.quota });
    const speaker = currentSpeakerId(s)!;
    expect(s.quotaLeft[speaker]).toBe(50);
    // رفت‌وبرگشت کامل در موتور: مصرف همچنان ۱۰ ثانیه مانده است
    expect(q.log.filter((x) => x.pid === speaker)).toHaveLength(1);
    expect(q.log[0].seconds).toBe(10);
  });
});

describe('منطق مصرف اتمیک سهمیه (سرور)', () => {
  it('مفرد مصرف درست محاسبه و مانده درست برمی‌گردد', () => {
    const r1 = consumeFromRecord(undefined, T0, 10);
    expect(r1.result.ok).toBe(true);
    expect(r1.result.remaining).toBe(50);
    const r2 = consumeFromRecord(r1.record, T0, 10);
    expect(r2.result.remaining).toBe(40);
    // ۳ بار دیگر → مجموع ۵ نوبت = ۵۰ ثانیه مصرف
    let rec = r2.record;
    for (let i = 0; i < 3; i++) rec = consumeFromRecord(rec, T0, 10).record;
    const rLast = consumeFromRecord(rec, T0, 10); // نوبت ششم — آخرین سهمیه
    expect(rLast.result.ok).toBe(true);
    expect(rLast.result.remaining).toBe(0);
    // سهمیه تمام → مصرف رد می‌شود
    const rBlocked = consumeFromRecord(rLast.record, T0, 10);
    expect(rBlocked.result.ok).toBe(false);
    expect(rBlocked.result.remaining).toBe(0);
    expect(rBlocked.record.used).toBe(60);
  });

  it('با تغییر روز، سهمیه از نو باز می‌شود (بازنشانی ۰۰:۰۰ تهران)', () => {
    const r1 = consumeFromRecord(undefined, T0, 60);
    expect(r1.result.remaining).toBe(0);
    // فردا (۲۴ ساعت بعد) — سهمیه کامل
    const nextDay = remainingFromRecord(r1.record, T0 + 24 * 3600 * 1000);
    expect(nextDay).toBe(60);
    const r2 = consumeFromRecord(r1.record, T0 + 24 * 3600 * 1000, 10);
    expect(r2.result.ok).toBe(true);
    expect(r2.record.used).toBe(10);
  });

  it('درخواست‌های ترتیبی بیش از مانده مصرف نمی‌کنند (الگوی Input Gates در DO)', () => {
    const rec = consumeFromRecord(undefined, T0, 50).record; // مانده: ۱۰
    // درخواست اول ۱۰ ثانیه — قبول
    const a = consumeFromRecord(rec, T0, 10);
    expect(a.result.ok).toBe(true);
    expect(a.result.remaining).toBe(0);
    // درخواست دوم با رکورد به‌روز (بعد از ترتیب‌شدن در DO) — رد
    const b = consumeFromRecord(a.record, T0, 10);
    expect(b.result.ok).toBe(false);
    expect(b.result.remaining).toBe(0);
    expect(b.record.used).toBe(60);
  });
});
