// تست‌های تاب‌آوری موتور — pruneReveal، شروع اجباری و بازگشت به لابی
import { describe, it, expect } from 'vitest';
import {
  RoomState, addPlayer, createRoom, markReady, pruneReveal, startRound, startDiscussion
} from '../shared/engine';

let seed = 777;
const rng = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};
const T0 = 1_700_000_000_000;

function mkStarted(n = 4, now = T0): RoomState {
  seed = 31;
  const d = { rng, now };
  const s = createRoom('TEST', 'میزبان', 0, d);
  for (let i = 1; i < n; i++) addPlayer(s, `player-${i}`, i % 12, d);
  for (const p of s.players) p.connected = true;
  const r = startRound(s, d);
  expect(r.err).toBeUndefined();
  expect(s.phase).toBe('revealing');
  return s;
}

describe('pruneReveal — جلوگیری از قفل‌شدن فاز نقش‌نمایی', () => {
  it('بازیکن قطع‌شده بعد از ۶۰ ثانیه از دور کنار گذاشته می‌شود', () => {
    const s = mkStarted(4);
    const quitter = s.players[3];
    quitter.connected = false;
    // قبل از ۶۰ ثانیه: هیچ اتفاقی نمی‌افتد
    const early = pruneReveal(s, T0 + 30_000, deps(T0 + 30_000));
    expect(early.changed).toBe(false);
    expect(s.phase).toBe('revealing');
    expect(quitter.role).not.toBeNull();
    // بعد از ۶۰ ثانیه: کنار گذاشته می‌شود
    quitter.lastSeen = T0;
    const r = pruneReveal(s, T0 + 61_000, deps(T0 + 61_000));
    expect(r.changed).toBe(true);
    expect(quitter.role).toBeNull();
    expect(s.turnOrder).not.toContain(quitter.id);
  });

  it('وقتی باقی‌مانده‌ها ready شدند بحث شروع می‌شود', () => {
    const s = mkStarted(4);
    const quitter = s.players[3];
    quitter.connected = false;
    quitter.lastSeen = T0;
    pruneReveal(s, T0 + 61_000, deps(T0 + 61_000));
    // میزبان و دو نفر آماده
    for (const p of s.players) {
      if (p.role) markReady(s, p.id, deps(T0 + 62_000));
    }
    expect(s.phase).toBe('discussion');
    expect(s.turnOrder).toHaveLength(3);
  });

  it('شروع اجباری بعد از ۹۰ ثانیه حتی با بازیکن ناشنوا', () => {
    const s = mkStarted(4);
    // نرگس ناشنوا: وصل است ولی هرگز ready نمی‌شود
    const deaf = s.players[2];
    deaf.connected = true;
    for (const p of s.players) {
      if (p.id !== deaf.id && p.role) markReady(s, p.id, deps(T0 + 10_000));
    }
    expect(s.phase).toBe('revealing');
    const r = pruneReveal(s, T0 + 91_000, deps(T0 + 91_000));
    expect(s.phase).toBe('discussion');
    expect(r.alarmAt).not.toBeNull();
    expect(s.turnOrder).toHaveLength(4); // ناشنوا هم در نوبت می‌ماند؛ تایمر نوبت ردش می‌کند
  });

  it('شروع اجباری با همه قطع → بازگشت به لابی', () => {
    const s = mkStarted(4);
    for (const p of s.players.slice(1)) {
      p.connected = false;
      p.lastSeen = T0;
    }
    const r = pruneReveal(s, T0 + 91_000, deps(T0 + 91_000));
    expect(r.changed).toBe(true);
    expect(s.phase).toBe('waiting');
    expect(s.location).toBeNull();
    for (const p of s.players) expect(p.role).toBeNull();
  });

  it('در فازهای دیگر pruneReveal کاری نمی‌کند', () => {
    const s = mkStarted(4);
    for (const p of s.players) if (p.role) markReady(s, p.id, deps(T0 + 1000));
    expect(s.phase).toBe('discussion');
    const r = pruneReveal(s, T0 + 500_000, deps(T0 + 500_000));
    expect(r.changed).toBe(false);
    expect(s.phase).toBe('discussion');
  });
});

describe('startDiscussion — جزئیات', () => {
  it('deadline بحث و پایان نوبت تنظیم می‌شود', () => {
    const s = mkStarted(4);
    for (const p of s.players) if (p.role) markReady(s, p.id, deps(T0 + 1000));
    expect(s.deadline).toBe(T0 + 1000 + s.settings.discussionSeconds * 1000);
    expect(s.turnEndsAt).toBe(T0 + 1000 + s.settings.turnSeconds * 1000);
    expect(s.currentTurnIdx).toBe(0);
  });
});

function deps(now: number) {
  return { rng, now };
}
