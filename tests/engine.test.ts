// تست‌های موتور بازی «جاسوس»
import { describe, it, expect } from 'vitest';
import {
  RoomState, addPlayer, apply, castVote, createRoom, endRound, markReady,
  onDeadline, publicState, removePlayer, restartRound, skipTurn, spyGuess,
  startRound, updateSettings, currentSpeakerId, playerById, setTarget, endTurn
} from '../shared/engine';
import { DEFAULT_SETTINGS, ERR } from '../shared/types';
import { LOCATIONS, locationById } from '../shared/locations';

let seed = 12345;
const rng = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};
const now = () => 1_700_000_000_000;
const deps = () => ({ rng, now: now() });

function mkRoom(n = 6, code = 'TEST'): RoomState {
  seed = 42;
  const d = deps();
  const s = createRoom(code, 'میزبان', 0, d);
  for (let i = 1; i < n; i++) addPlayer(s, `player-${i}`, i % 12, d);
  for (const p of s.players) p.connected = true;
  return s;
}

function start(s: RoomState): void {
  const r = startRound(s, deps());
  expect(r.err).toBeUndefined();
  expect(s.phase).toBe('revealing');
  for (const p of s.players) if (p.role) markReady(s, p.id, deps());
}

describe('ساخت لابی و بازیکنان', () => {
  it('اتاق با میزبان ساخته می‌شود', () => {
    seed = 7;
    const s = createRoom('ABCD', 'میزبان', 3, deps());
    expect(s.players).toHaveLength(1);
    expect(s.players[0].isHost).toBe(true);
    expect(s.hostId).toBe(s.players[0].id);
    expect(s.phase).toBe('waiting');
  });

  it('بازیکن جدید اضافه می‌شود و token دارد', () => {
    const s = mkRoom(1);
    const r = addPlayer(s, 'بازیکن۲', 2, deps());
    expect(r.err).toBeUndefined();
    const p = playerById(s, r.playerId!);
    expect(p?.token).toHaveLength(26);
    expect(p?.connected).toBe(true);
  });

  it('نام تکراری رد می‌شود', () => {
    const s = mkRoom(2);
    const r = addPlayer(s, 'میزبان', 1, deps());
    expect(r.err).toBe('duplicate_name');
  });

  it('نام خیلی کوتاه رد می‌شود', () => {
    const s = mkRoom(2);
    const r = addPlayer(s, 'a', 1, deps());
    expect(r.err).toBe(ERR.BAD_NAME);
  });

  it('ظرفیت کامل رد می‌شود', () => {
    const s = mkRoom(1);
    updateSettings(s, s.hostId, { maxPlayers: 3 });
    addPlayer(s, 'p2', 1, deps());
    addPlayer(s, 'p3', 2, deps());
    const r = addPlayer(s, 'p4', 3, deps());
    expect(r.err).toBe(ERR.FULL);
  });

  it('خروج بازیکن انجام و میزبانی منتقل می‌شود', () => {
    const s = mkRoom(4);
    const hostId = s.hostId;
    removePlayer(s, hostId, deps());
    expect(s.players.some((p) => p.id === hostId)).toBe(false);
    expect(s.players[0].isHost).toBe(true);
    expect(s.hostId).toBe(s.players[0].id);
  });
});

describe('شروع دور و تخصیص نقش‌ها', () => {
  it('نقش‌ها درست تخصیص می‌یابند و جاسوس مکان را نمی‌بیند', () => {
    const s = mkRoom(6);
    start(s);
    const spies = s.players.filter((p) => p.role?.isSpy);
    expect(spies.length).toBe(1);
    const citizens = s.players.filter((p) => p.role && !p.role.isSpy);
    expect(citizens.length).toBe(5);
    expect(s.location).not.toBeNull();
    for (const c of citizens) {
      expect(c.role?.locationId).toBe(s.location!.id);
      expect(c.role?.roleName).toBeTruthy();
    }
    for (const sp of spies) {
      expect(sp.role?.locationId).toBeUndefined();
      expect(sp.role?.locationName).toBeUndefined();
    }
    // PublicState هرگز نقش ندارد
    const ps = publicState(s, now());
    expect(JSON.stringify(ps)).not.toContain('"role"');
    expect(JSON.stringify(ps)).not.toContain(s.location!.name);
  });

  it('با کمتر از ۳ بازیکن شروع نمی‌شود', () => {
    const s = mkRoom(2);
    const r = startRound(s, deps());
    expect(r.err).toBe('need_players');
  });

  it('فقط میزبان می‌تواند شروع کند', () => {
    const s = mkRoom(4);
    const other = s.players.find((p) => !p.isHost)!;
    const r = apply(s, other.id, { t: 'start' }, deps());
    expect(r.err).toBe(ERR.NOT_HOST);
  });

  it('دو جاسوس در تنظیمات ۲ → دقیقاً ۲ جاسوس', () => {
    const s = mkRoom(8);
    updateSettings(s, s.hostId, { spyCount: 2 });
    start(s);
    expect(s.players.filter((p) => p.role?.isSpy)).toHaveLength(2);
  });

  it('دور جدید نقش‌ها را از نو می‌چیند', () => {
    const s = mkRoom(6);
    start(s);
    // پایان دستی دور
    endRound(s, deps(), true, null, 'تست');
    expect(s.phase).toBe('ended');
    const r = restartRound(s, s.hostId, deps());
    expect(r.err).toBeUndefined();
    expect(s.phase).toBe('revealing');
    expect(s.round).toBe(2);
  });
});

describe('فاز آماده‌سازی و بحث', () => {
  it('وقتی همه ready شدند بحث شروع می‌شود', () => {
    const s = mkRoom(5);
    startRound(s, deps());
    expect(s.phase).toBe('revealing');
    for (const p of s.players) if (p.role) markReady(s, p.id, deps());
    expect(s.phase).toBe('discussion');
    expect(s.currentTurnIdx).toBe(0);
    expect(s.deadline).not.toBeNull();
  });

  it('ترتیب نوبت شامل همهٔ متصل‌ها و بدون تکرار است', () => {
    const s = mkRoom(6);
    start(s);
    expect(s.turnOrder).toHaveLength(6);
    expect(new Set(s.turnOrder).size).toBe(6);
  });

  it('Skip Turn فقط در نوبت خودِ بازیکن کار می‌کند', () => {
    const s = mkRoom(4);
    start(s);
    const speaker = currentSpeakerId(s)!;
    const other = s.players.find((p) => p.id !== speaker)!;
    const r = skipTurn(s, other.id, deps());
    expect(r.err).toBe(ERR.NOT_YOUR_TURN);
  });

  it('Skip Turn سهمیه را کم می‌کند و نوبت می‌رود جلو؛ ترتیب خراب نمی‌شود', () => {
    const s = mkRoom(5);
    start(s);
    const speaker = playerById(s, currentSpeakerId(s))!;
    const beforeIdx = s.currentTurnIdx;
    const r = skipTurn(s, speaker.id, deps());
    expect(r.err).toBeUndefined();
    expect(speaker.skipLeft).toBe(DEFAULT_SETTINGS.skipPerPlayer - 1);
    expect(s.currentTurnIdx).toBe((beforeIdx + 1) % s.turnOrder.length);
    // سهمیهٔ تمام‌شده → خطا؛ ولی endTurn بدون سهمیه کار می‌کند
    const sp = playerById(s, currentSpeakerId(s))!;
    sp.skipLeft = 0;
    const r2 = skipTurn(s, sp.id, deps());
    expect(r2.err).toBe(ERR.NO_SKIPS);
    const r3 = endTurn(s, sp.id, deps());
    expect(r3.err).toBeUndefined();
  });

  it('انتخاب هدف فقط از خود نوبت‌دار و برای دیگران', () => {
    const s = mkRoom(4);
    start(s);
    const speaker = currentSpeakerId(s)!;
    const other = s.players.find((p) => p.id !== speaker)!;
    const r = setTarget(s, speaker, other.id);
    expect(r.err).toBeUndefined();
    expect(s.targetId).toBe(other.id);
    const r2 = setTarget(s, speaker, speaker);
    expect(r2.err).toBe(ERR.BAD_TARGET);
  });

  it('پیشروی خودکار نوبت بعد از turnSeconds با آلارم', () => {
    const s = mkRoom(4);
    start(s);
    const idx0 = s.currentTurnIdx;
    const t = s.turnEndsAt!;
    const r = onDeadline(s, { rng, now: t + 1 });
    expect(r.changed).toBe(true);
    expect(s.currentTurnIdx).toBe((idx0 + 1) % s.turnOrder.length);
    expect(s.turnEndsAt!).toBeGreaterThan(t);
  });

  it('پایان زمان بحث → رأی‌گیری', () => {
    const s = mkRoom(4);
    start(s);
    const r = onDeadline(s, { rng, now: s.deadline! + 1 });
    expect(s.phase).toBe('voting');
    expect(s.deadline).not.toBeNull();
    expect(r.alarmAt).toBe(s.deadline);
  });
});

describe('رأی‌گیری و نتیجه', () => {
  function toVoting(s: RoomState): void {
    start(s);
    onDeadline(s, { rng, now: s.deadline! + 1 });
    expect(s.phase).toBe('voting');
  }

  it('رأی معتبر ثبت می‌شود و رأی تکراری رد می‌شود', () => {
    const s = mkRoom(4);
    toVoting(s);
    const [a, b] = s.players;
    const r = castVote(s, a.id, b.id, deps());
    expect(r.err).toBeUndefined();
    expect(s.votes[a.id]).toBe(b.id);
    const r2 = castVote(s, a.id, b.id, deps());
    expect(r2.err).toBe(ERR.ALREADY_VOTED);
  });

  it('رأی به خود ممنوع است (بدون revote)', () => {
    const s = mkRoom(4);
    toVoting(s);
    const [a] = s.players;
    const r = castVote(s, a.id, a.id, deps());
    expect(r.err).toBe(ERR.BAD_VOTE);
  });

  it('اگر جاسوس بیشترین رأی را بگیرد → فاز حدس جاسوس', () => {
    const s = mkRoom(4);
    toVoting(s);
    const spy = s.players.find((p) => p.role?.isSpy)!;
    const citizens = s.players.filter((p) => !p.role?.isSpy);
    for (const c of citizens) castVote(s, c.id, spy.id, deps());
    castVote(s, spy.id, null, deps());
    expect(s.phase).toBe('spyGuess');
    expect(s.tally?.spyCaught).toBe(true);
  });

  it('حدس درست جاسوس → برد جاسوس', () => {
    const s = mkRoom(4);
    toVoting(s);
    const spy = s.players.find((p) => p.role?.isSpy)!;
    const citizens = s.players.filter((p) => !p.role?.isSpy);
    for (const c of citizens) castVote(s, c.id, spy.id, deps());
    castVote(s, spy.id, null, deps());
    const r = spyGuess(s, spy.id, s.location!.id, deps());
    expect(r.err).toBeUndefined();
    expect(s.phase).toBe('ended');
    expect(s.results?.spyWon).toBe(true);
    expect(s.results?.spyGuessId).toBe(s.location!.id);
    // امتیازها
    expect(s.results?.scores[spy.id]).toBe(1);
    for (const c of citizens) expect(s.results?.scores[c.id]).toBe(0);
  });

  it('حدس غلط جاسوس → برد شهروندها', () => {
    const s = mkRoom(4);
    toVoting(s);
    const spy = s.players.find((p) => p.role?.isSpy)!;
    const citizens = s.players.filter((p) => !p.role?.isSpy);
    for (const c of citizens) castVote(s, c.id, spy.id, deps());
    castVote(s, spy.id, null, deps());
    // یک مکان که حتماً غیر از مکان فعلی است
    const wrong = LOCATIONS.find((l) => l.id !== s.location!.id)!.id;
    spyGuess(s, spy.id, wrong, deps());
    expect(s.phase).toBe('ended');
    expect(s.results?.spyWon).toBe(false);
    for (const c of citizens) expect(s.results?.scores[c.id]).toBe(1);
  });

  it('حدس فقط از جاسوس پذیرفته می‌شود', () => {
    const s = mkRoom(4);
    toVoting(s);
    const spy = s.players.find((p) => p.role?.isSpy)!;
    const c = s.players.find((p) => !p.role?.isSpy)!;
    for (const cc of s.players.filter((x) => !x.role?.isSpy && x.id !== c.id)) castVote(s, cc.id, spy.id, deps());
    castVote(s, spy.id, null, deps());
    castVote(s, c.id, spy.id, deps());
    expect(s.phase).toBe('spyGuess');
    const r = spyGuess(s, c.id, s.location!.id, deps());
    expect(r.err).toBe(ERR.NOT_SPY);
  });

  it('متهم کردن شهروند اشتباه → برد جاسوس', () => {
    const s = mkRoom(4);
    toVoting(s);
    const citizens = s.players.filter((p) => !p.role?.isSpy);
    const target = citizens[0];
    for (const p of s.players) {
      if (p.id === target.id) castVote(s, p.id, null, deps());
      else castVote(s, p.id, target.id, deps());
    }
    expect(s.phase).toBe('ended');
    expect(s.results?.spyWon).toBe(true);
    expect(s.results?.accusedId).toBe(target.id);
  });

  it('تساوی → رأی‌گیری مجدد بین متساوی‌ها؛ تساوی دوم → برد جاسوس', () => {
    const s = mkRoom(4);
    toVoting(s);
    const [a, b, c, d] = s.players;
    castVote(s, a.id, b.id, deps());
    castVote(s, b.id, a.id, deps());
    castVote(s, c.id, null, deps());
    castVote(s, d.id, null, deps());
    expect(s.phase).toBe('voting');
    expect(s.tiedIds).not.toBeNull();
    expect(s.tiedIds!.sort()).toEqual([a.id, b.id].sort());
    // در رأی دوم فقط متساوی‌ها قابل انتخاب‌اند
    const r = castVote(s, a.id, c.id, deps());
    expect(r.err).toBe(ERR.BAD_VOTE);
    // تساوی دوم
    castVote(s, a.id, b.id, deps());
    castVote(s, b.id, a.id, deps());
    castVote(s, c.id, a.id, deps());
    castVote(s, d.id, b.id, deps());
    expect(s.phase).toBe('ended');
    expect(s.results?.spyWon).toBe(true);
  });

  it('ابستین همه → برد جاسوس', () => {
    const s = mkRoom(4);
    toVoting(s);
    for (const p of s.players) castVote(s, p.id, null, deps());
    expect(s.phase).toBe('ended');
    expect(s.results?.spyWon).toBe(true);
  });
});

describe('تنظیمات', () => {
  it('فقط میزبان تنظیمات را عوض می‌کند', () => {
    const s = mkRoom(3);
    const other = s.players.find((p) => !p.isHost)!;
    const r = updateSettings(s, other.id, { maxPlayers: 5 });
    expect(r.err).toBe(ERR.NOT_HOST);
  });

  it('مقادیر خارج از محدوده clamp می‌شوند', () => {
    const s = mkRoom(3);
    updateSettings(s, s.hostId, { maxPlayers: 99, skipPerPlayer: 10, discussionSeconds: 10 });
    expect(s.settings.maxPlayers).toBe(12);
    expect(s.settings.skipPerPlayer).toBe(5);
    expect(s.settings.discussionSeconds).toBe(180);
  });

  it('دستهٔ نامعتبر فیلتر می‌شود', () => {
    const s = mkRoom(3);
    updateSettings(s, s.hostId, { categories: ['public', 'hacked', 'food'] });
    expect(s.settings.categories).toEqual(['public', 'food']);
  });
});

describe('قطع اتصال و اخراج', () => {
  it('بازیکن قطع‌شده seat خود را حفظ می‌کند', () => {
    const s = mkRoom(5);
    start(s);
    const p = s.players[2];
    p.connected = false; // قطع؛ نه خروج
    expect(s.turnOrder).toContain(p.id);
    expect(s.players).toHaveLength(5);
  });

  it('kick فقط توسط میزبان', () => {
    const s = mkRoom(4);
    const other = s.players.find((p) => !p.isHost)!;
    const r = apply(s, other.id, { t: 'kick', targetId: s.players[0].id }, deps());
    expect(r.err).toBe(ERR.NOT_HOST);
  });

  it('kick میزبان کار می‌کند و سوکت بسته می‌شود', () => {
    const s = mkRoom(4);
    const target = s.players.find((p) => !p.isHost)!;
    const r = apply(s, s.hostId, { t: 'kick', targetId: target.id }, deps());
    expect(r.err).toBeUndefined();
    expect(r.closePlayer).toBe(target.id);
    expect(playerById(s, target.id)).toBeUndefined();
  });

  it('گزارش تکراری شمرده نمی‌شود؛ گزارش فقط برای میزبان در state است', () => {
    const s = mkRoom(4);
    const a = s.players.find((p) => !p.isHost)!;
    const b = s.players.find((p) => p.id !== a.id && !p.isHost)!;
    apply(s, a.id, { t: 'report', targetId: b.id }, deps());
    apply(s, a.id, { t: 'report', targetId: b.id }, deps());
    expect(b.reports).toBe(1);
    const psHost = publicState(s, now(), s.hostId);
    expect(psHost.hostView?.reports[b.id]).toBe(1);
    const psOther = publicState(s, now(), a.id);
    expect(psOther.hostView).toBeUndefined();
  });
});

describe('چت و استیکر', () => {
  it('چت broadcast می‌شود و محدودیت نرخ دارد', () => {
    const s = mkRoom(3);
    const r = apply(s, s.players[0].id, { t: 'chat', text: 'سلام' }, deps());
    expect(r.emits?.[0]).toMatchObject({ t: 'chat', text: 'سلام', name: 'میزبان' });
    const r2 = apply(s, s.players[0].id, { t: 'chat', text: 'دوباره' }, { rng, now: now() + 500 });
    expect(r2.err).toBe(ERR.RATE_LIMIT);
    const r3 = apply(s, s.players[0].id, { t: 'chat', text: 'دوباره' }, { rng, now: now() + 2000 });
    expect(r3.emits?.[0]?.t).toBe('chat');
  });

  it('استیکر با محدودیت ۳ ثانیه و شناسهٔ معتبر', () => {
    const s = mkRoom(3);
    const r = apply(s, s.players[0].id, { t: 'sticker', id: 'spy-ok' }, deps());
    expect(r.emits?.[0]?.t).toBe('sticker');
    const r2 = apply(s, s.players[0].id, { t: 'sticker', id: 'spy-ok' }, { rng, now: now() + 1000 });
    expect(r2.err).toBe(ERR.RATE_LIMIT);
    const r3 = apply(s, s.players[0].id, { t: 'sticker', id: '../hack' }, { rng, now: now() + 5000 });
    expect(r3.err).toBe(ERR.BAD_MSG);
  });
});

describe('امنیت داده', () => {
  it('در هیچ فازی اسم مکان یا نقش‌ها در state عمومی نیست', () => {
    const s = mkRoom(6);
    const states: string[] = [];
    states.push(JSON.stringify(publicState(s, now())));
    start(s);
    states.push(JSON.stringify(publicState(s, now())));
    onDeadline(s, { rng, now: s.deadline! + 1 });
    states.push(JSON.stringify(publicState(s, now())));
    const spy = s.players.find((p) => p.role?.isSpy)!;
    const citizens = s.players.filter((p) => !p.role?.isSpy);
    for (const c of citizens) castVote(s, c.id, spy.id, deps());
    castVote(s, spy.id, null, deps());
    states.push(JSON.stringify(publicState(s, now())));
    spyGuess(s, spy.id, s.location!.id, deps());
    states.push(JSON.stringify(publicState(s, now())));
    // در ended افشای اسم مکان مجاز است؛ قبل از ended ممنوع
    for (const st of states.slice(0, 4)) {
      expect(st).not.toContain('"roleName"');
      expect(st).not.toContain('"isSpy"');
      expect(st).not.toContain(s.location!.name);
    }
    expect(states[4]).toContain(s.location!.name);
    // token هرگز در state عمومی نیست
    for (const st of states) {
      for (const p of s.players) expect(st).not.toContain(p.token);
    }
  });

  it('مکان انتخابی از دسته‌های فعال می‌آید', () => {
    const s = mkRoom(6);
    updateSettings(s, s.hostId, { categories: ['fantasy'] });
    start(s);
    expect(s.location!.cat).toBe('fantasy');
  });

  it('همهٔ مکان‌های بانک نقش کافی و شناسهٔ یکتا دارند', () => {
    const ids = new Set<string>();
    for (const l of LOCATIONS) {
      expect(l.roles.length).toBeGreaterThanOrEqual(6);
      expect(l.name.length).toBeGreaterThan(1);
      expect(ids.has(l.id)).toBe(false);
      ids.add(l.id);
    }
    expect(locationById('coffee-shop')).toBeDefined();
    expect(LOCATIONS.length).toBeGreaterThanOrEqual(70);
  });
});
