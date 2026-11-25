// تست‌های موتور بازی «جاسوس»
import { describe, it, expect } from 'vitest';
import {
  RoomState, addPlayer, apply, castVote, createRoom, endRound, markReady,
  onDeadline, publicState, removePlayer, restartRound, skipTurn, spyGuess,
  startRound, updateSettings, currentSpeakerId, playerById, setTarget, endTurn, setVoice
} from '../shared/engine';
import { DEFAULT_SETTINGS, ERR, ROUND_RESULT_SECONDS } from '../shared/types';
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

describe('شروع دور و تخصیص کلمه', () => {
  it('همهٔ شهروندها کلمهٔ یکسان می‌گیرند و جاسوس کلمهٔ نزدیک (یا هیچ) دارد', () => {
    const s = mkRoom(6);
    start(s);
    const spies = s.players.filter((p) => p.role?.isSpy);
    expect(spies.length).toBe(1);
    const citizens = s.players.filter((p) => p.role && !p.role.isSpy);
    expect(citizens.length).toBe(5);
    expect(s.location).not.toBeNull();
    // نقطص اصلی قبلی اصلاح شده: کلمهٔ همهٔ شهروندها دقیقاً یکسان است
    const words = new Set(citizens.map((c) => c.role?.locationName));
    expect(words.size).toBe(1);
    expect(citizens.every((c) => c.role?.locationId === s.location!.id)).toBe(true);
    expect(citizens.every((c) => c.role?.locationName === s.location!.name)).toBe(true);
    // جاسوس مکان را نمی‌بیند؛ کلمهٔ نزدیک او هرگز برابر کلمهٔ شهروندها نیست
    for (const sp of spies) {
      expect(sp.role?.locationId).toBeUndefined();
      expect(sp.role?.locationName).toBeUndefined();
      expect(sp.role?.roleName).toBeTruthy();
      expect(sp.role?.roleName).not.toBe(s.location!.name);
    }
    // PublicState هرگز نقش ندارد
    const ps = publicState(s, now());
    expect(JSON.stringify(ps)).not.toContain('"role"');
    expect(JSON.stringify(ps)).not.toContain(s.location!.name);
  });

  it('با تنظیم spyWord=none جاسوس هیچ کلمه‌ای نمی‌گیرد', () => {
    const s = mkRoom(5);
    updateSettings(s, s.hostId, { spyWord: 'none' });
    start(s);
    const spy = s.players.find((p) => p.role?.isSpy)!;
    expect(spy.role?.isSpy).toBe(true);
    expect(spy.role?.roleName).toBeUndefined();
    expect(spy.role?.locationId).toBeUndefined();
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

describe('آمادگی در لابی و شروع خودکار', () => {
  it('وقتی همهٔ متصل‌ها در لابی ready شدند بازی خودکار شروع می‌شود (بدون میزبان)', () => {
    const s = mkRoom(4);
    expect(s.phase).toBe('waiting');
    // همه به‌جز میزبان آماده می‌شوند — هنوز شروع نشده
    for (const p of s.players.slice(1)) markReady(s, p.id, deps());
    expect(s.phase).toBe('waiting');
    // آمادگی آخرین نفر (میزبان) → شروع خودکار
    markReady(s, s.hostId, deps());
    expect(s.phase).toBe('revealing');
    expect(s.round).toBe(1);
  });

  it('اگر کسی آماده نباشد بازی شروع نمی‌شود و وضعیت آمادگی برای همه قابل مشاهده است', () => {
    const s = mkRoom(4);
    // سه نفر آماده می‌شوند — بازی هنوز شروع نشده
    for (const p of s.players.slice(0, 3)) markReady(s, p.id, deps());
    expect(s.phase).toBe('waiting');
    // لغو آمادگی یکی → همچنان شروع نمی‌شود
    markReady(s, s.players[0].id, deps(), false);
    expect(s.phase).toBe('waiting');
    const ps = publicState(s, now());
    const pub = ps.players.find((p) => p.id === s.players[0].id)!;
    expect(pub.ready).toBe(false);
    expect(ps.players.filter((p) => p.ready)).toHaveLength(2);
    // دوباره آماده می‌شود؛ ولی نفر چهارم هنوز آماده نیست → شروع نمی‌شود
    markReady(s, s.players[0].id, deps(), true);
    expect(s.phase).toBe('waiting');
    // آمادگی چهارم → شروع خودکار
    markReady(s, s.players[3].id, deps());
    expect(s.phase).toBe('revealing');
  });

  it('آمادگی در لابی با کمتر از ۳ بازیکن شروع نمی‌کند', () => {
    const s = mkRoom(2);
    for (const p of s.players) markReady(s, p.id, deps());
    expect(s.phase).toBe('waiting');
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
    onDeadline(s, { rng, now: s.deadline! + 1 });
    expect(s.phase).toBe('voting');
    expect(s.deadline).not.toBeNull();
  });

  it('پس از تکمیل یک دور کامل صحبت، رأی‌گیری خودکار شروع می‌شود', () => {
    const s = mkRoom(3);
    start(s);
    expect(s.phase).toBe('discussion');
    // هر بازیکن به ترتیب نوبت را تمام می‌کند
    for (let i = 0; i < 3; i++) {
      const sp = currentSpeakerId(s)!;
      const r = endTurn(s, sp, deps());
      expect(r.err).toBeUndefined();
    }
    // بعد از آخرین نفر → رأی‌گیری
    expect(s.phase).toBe('voting');
  });

  it('کنترل سروری میکروفون: فقط نوبت‌دار میکروفن باز دارد؛ بقیه خودکار بسته می‌شوند', () => {
    const s = mkRoom(4);
    start(s);
    // همه به گفتگو پیوسته‌اند و میکروفن روشن کرده‌اند
    for (const p of s.players) setVoice(s, p.id, true, false, true);
    expect(s.phase).toBe('discussion');
    const speaker = currentSpeakerId(s)!;
    const others = s.players.filter((p) => p.id !== speaker);
    // فقط نوبت‌دار میکروفن باز است
    expect(s.players.find((p) => p.id === speaker)!.micOn).toBe(true);
    for (const o of others) expect(o.micOn).toBe(false);
    // درخواست میکروفن خارج از نوبت → رد + هشدار خصوصی
    const r = setVoice(s, others[0].id, true, false);
    expect(others[0].micOn).toBe(false);
    expect(r.direct?.[0]?.msg).toMatchObject({ t: 'error', code: 'mic_forced_off' });
    // با رفتن نوبت، میکروفن نوبت‌دار قبلی بسته و نوبت‌دار جدید باز می‌شود
    endTurn(s, speaker, deps());
    const sp2 = currentSpeakerId(s)!;
    expect(s.players.find((p) => p.id === sp2)!.micOn).toBe(true);
    expect(s.players.find((p) => p.id === speaker)!.micOn).toBe(false);
  });

  it('در رأی‌گیری و حدس جاسوس میکروفن همه بسته است', () => {
    const s = mkRoom(4);
    start(s);
    for (const p of s.players) setVoice(s, p.id, true, false, true);
    onDeadline(s, { rng, now: s.deadline! + 1 });
    expect(s.phase).toBe('voting');
    for (const p of s.players) {
      const r = setVoice(s, p.id, true, false);
      expect(p.micOn).toBe(false);
      expect(r.direct?.[0]?.msg).toMatchObject({ t: 'error', code: 'mic_forced_off' });
    }
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

  it('متهم شدن شهروند → حذف، افشای نقش و دور بعد (چرخهٔ مافیا)', () => {
    const s = mkRoom(4);
    toVoting(s);
    const citizens = s.players.filter((p) => !p.role?.isSpy);
    const target = citizens[0];
    for (const p of s.players) {
      if (p.id === target.id) castVote(s, p.id, null, deps());
      else castVote(s, p.id, target.id, deps());
    }
    // بازی تمام نشده: صفحهٔ نتیجهٔ دور با افشای نقش
    expect(s.phase).toBe('roundResult');
    expect(s.lastElimination).toEqual({ playerId: target.id, name: target.name, wasSpy: false });
    expect(target.eliminated).toBe(true);
    expect(s.turnOrder).not.toContain(target.id);
    // حذف‌شده حق رأی ندارد
    const r = castVote(s, target.id, citizens[1].id, deps());
    expect(r.err).toBe(ERR.WRONG_PHASE);
    // دور بعد خودکار شروع می‌شود؛ همان جاسوس، کلمهٔ جدید
    const spyBefore = s.spyIds[0];
    onDeadline(s, { rng, now: s.deadline! + 1 });
    expect(s.phase).toBe('revealing');
    expect(s.round).toBe(2);
    expect(s.spyIds).toEqual([spyBefore]);
    expect(s.players.find((p) => p.id === spyBefore)!.role?.isSpy).toBe(true);
  });

  it('رسیدن شهروندها به حد بحرانی → برد جاسوس', () => {
    const s = mkRoom(4);
    // دور ۱: حذف یک شهروند
    toVoting(s);
    const spy = s.players.find((p) => p.role?.isSpy)!;
    let civ = s.players.filter((p) => !p.role?.isSpy)[0];
    for (const p of s.players) castVote(s, p.id, p.id === civ.id ? null : civ.id, deps());
    expect(s.phase).toBe('roundResult');
    onDeadline(s, { rng, now: s.deadline! + 1 });
    // دور ۲: همه ready → بحث → همه نوبت را تمام → رأی‌گیری → حذف دومین شهروند
    for (const p of s.players) if (p.role) markReady(s, p.id, deps());
    expect(s.phase).toBe('discussion');
    while (s.phase === 'discussion') {
      const sp = currentSpeakerId(s)!;
      endTurn(s, sp, deps());
    }
    expect(s.phase).toBe('voting');
    civ = s.players.filter((p) => !p.role?.isSpy && !p.eliminated)[0];
    for (const p of s.players.filter((x) => x.connected && !x.eliminated)) {
      castVote(s, p.id, p.id === civ.id ? null : civ.id, deps());
    }
    // با ۱ شهروند و ۱ جاسوس، شهروندها به حد بحرانی رسیده‌اند
    expect(s.phase).toBe('ended');
    expect(s.results?.spyWon).toBe(true);
    expect(s.results?.spyIds).toEqual([spy.id]);
  });

  it('ابستین همه → بدون حذف به دور بعد می‌رویم', () => {
    const s = mkRoom(4);
    toVoting(s);
    for (const p of s.players) castVote(s, p.id, null, deps());
    expect(s.phase).toBe('roundResult');
    expect(s.roundNote).toBeTruthy();
    expect(s.lastElimination).toBeNull();
    expect(s.deadline).toBe(now() + ROUND_RESULT_SECONDS * 1000);
    onDeadline(s, { rng, now: s.deadline! + 1 });
    expect(s.phase).toBe('revealing');
    expect(s.round).toBe(2);
  });

  it('حذف جاسوس با حدس غلط → وقتی جاسوس دیگری نیست بازی تمام می‌شود', () => {
    const s = mkRoom(4);
    toVoting(s);
    const spy = s.players.find((p) => p.role?.isSpy)!;
    const citizens = s.players.filter((p) => !p.role?.isSpy);
    for (const c of citizens) castVote(s, c.id, spy.id, deps());
    castVote(s, spy.id, null, deps());
    expect(s.phase).toBe('spyGuess');
    const wrong = LOCATIONS.find((l) => l.id !== s.location!.id)!.id;
    spyGuess(s, spy.id, wrong, deps());
    expect(s.phase).toBe('ended');
    expect(s.results?.spyWon).toBe(false);
    expect(s.lastElimination).toEqual({ playerId: spy.id, name: spy.name, wasSpy: true });
    for (const c of citizens) expect(s.results?.scores[c.id]).toBe(1);
  });

  it('تساوی دوم در رأی‌گیری مجدد → برد جاسوس', () => {
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
    // تساوی دوم → پایان بازی با برد جاسوس
    castVote(s, a.id, b.id, deps());
    castVote(s, b.id, a.id, deps());
    castVote(s, c.id, a.id, deps());
    castVote(s, d.id, b.id, deps());
    expect(s.phase).toBe('ended');
    expect(s.results?.spyWon).toBe(true);
  });
});

describe('قفل چت متنی در طول بازی', () => {
  it('چت در فازهای بحث/رأی‌گیری/حدس رد می‌شود و در انتظار آزاد است', () => {
    const s = mkRoom(4);
    const pid = s.players[0].id;
    const r0 = apply(s, pid, { t: 'chat', text: 'سلام' }, deps());
    expect(r0.emits?.[0]?.t).toBe('chat');
    startRound(s, deps());
    for (const p of s.players) if (p.role) markReady(s, p.id, deps());
    expect(s.phase).toBe('discussion');
    const r1 = apply(s, pid, { t: 'chat', text: 'موقع بازی' }, { rng, now: now() + 5000 });
    expect(r1.err).toBe(ERR.CHAT_LOCKED);
    const r2 = apply(s, pid, { t: 'sticker', id: 'spy-ok' }, { rng, now: now() + 5000 });
    expect(r2.err).toBe(ERR.CHAT_LOCKED);
    onDeadline(s, { rng, now: s.deadline! + 1 });
    expect(s.phase).toBe('voting');
    const r3 = apply(s, pid, { t: 'chat', text: 'موقع رأی' }, { rng, now: now() + 6000 });
    expect(r3.err).toBe(ERR.CHAT_LOCKED);
    // در نتیجهٔ دور باز می‌شود
    onDeadline(s, { rng, now: s.deadline! + 1 });
    expect(s.phase).toBe('roundResult');
    const r4 = apply(s, pid, { t: 'chat', text: 'بین دورها' }, { rng, now: now() + 7000 });
    expect(r4.emits?.[0]?.t).toBe('chat');
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
