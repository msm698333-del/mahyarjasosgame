// تست‌های لایهٔ پروتکل سرور (RoomSession) — شبیه‌سازی کامل جریان WebSocket
import { describe, it, expect, vi } from 'vitest';
import { RoomSession, Transport, welcomeFor, ERROR_TEXT } from '../worker/room';
import { S2C } from '../shared/types';

let seed = 999;
const rng = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};
const T0 = 1_700_000_000_000;

interface Client {
  id: string;
  token: string;
  inbox: S2C[];
}

function mkSession() {
  const clients = new Map<string, Client>();
  const transport: Transport = {
    sendTo: (pid, msg) => clients.get(pid)?.inbox.push(msg),
    broadcast: (msg) => { for (const c of clients.values()) c.inbox.push(msg); },
    close: (pid) => { clients.delete(pid); }
  };
  const persist = vi.fn();
  const recordMatch = vi.fn();
  const session = new RoomSession(transport, persist, rng, recordMatch);
  const alarms: number[] = [];
  session.alarmCb = (at) => alarms.push(at);
  return { session, clients, transport, persist, recordMatch, alarms };
}

function join(session: RoomSession, clients: Map<string, Client>, name: string, avatar = 0, t = T0): Client {
  const r = session.hello(null, null, name, avatar, t);
  if ('err' in r) throw new Error('join failed: ' + r.err);
  const c: Client = { id: r.playerId, token: r.token, inbox: [] };
  clients.set(c.id, c);
  return c;
}

/** میزبان با playerId+token که هنگام /api/lobby گرفته می‌شود وصل می‌شود */
function joinHost(session: RoomSession, clients: Map<string, Client>, t = T0): Client {
  const hp = session.s!.players[0];
  const r = session.hello(hp.id, hp.token, hp.name, hp.avatar, t);
  if ('err' in r) throw new Error('host join failed: ' + r.err);
  const c: Client = { id: r.playerId, token: r.token, inbox: [] };
  clients.set(c.id, c);
  return c;
}

function msg(session: RoomSession, clients: Map<string, Client>, c: Client, m: object, t = T0): void {
  const before = clients.get(c.id);
  session.onMessage(c.id, JSON.stringify(m), t);
  void before;
}

function statesOf(c: Client) {
  return c.inbox.filter((m) => m.t === 'state');
}

describe('RoomSession — hello و welcome', () => {
  it('لابی تازه پیام خطای not_found می‌دهد', () => {
    const { session, transport } = mkSession();
    void transport;
    const r = session.hello(null, null, 'علی', 1, T0);
    expect('err' in r && r.err).toBe('lobby_not_found');
  });

  it('ساخت لابی و خوش‌آمد میزبان', () => {
    const { session, clients } = mkSession();
    session.initRoom('TEST', 'میزبان', 0, T0);
    const host = joinHost(session, clients);
    const w = welcomeFor(session.s!, host.id, T0);
    expect(w?.you.isHost).toBe(true);
    expect(w?.role).toBeNull();
  });

  it('join بازیکن دوم و هم‌زمانی state', () => {
    const { session, clients } = mkSession();
    session.initRoom('TEST', 'میزبان', 0, T0);
    const host = joinHost(session, clients);
    const p2 = join(session, clients, 'دوم');
    msg(session, clients, host, { t: 'ping' }, T0);
    expect(host.inbox.some((m) => m.t === 'pong')).toBe(true);
    expect(clients.size).toBe(2);
    void p2;
  });

  it('هلو با token غلط رد می‌شود', () => {
    const { session, clients } = mkSession();
    session.initRoom('TEST', 'میزبان', 0, T0);
    joinHost(session, clients);
    const r = session.hello('pid-not-exists', 'bad-token', 'میزبان', 0, T0);
    expect('err' in r && r.err).toBe('bad_token');
  });
});

describe('RoomSession — جریان کامل بازی', () => {
  it('میزبان شروع می‌کند → نقش خصوصی به هرکس می‌رسد؛ نقش به دیگران نمی‌رسد', () => {
    const { session, clients } = mkSession();
    session.initRoom('TEST', 'میزبان', 0, T0);
    const host = joinHost(session, clients);
    const p2 = join(session, clients, 'دو');
    const p3 = join(session, clients, 'سه');
    msg(session, clients, host, { t: 'start' }, T0);
    expect(session.s?.phase).toBe('revealing');
    for (const c of [host, p2, p3]) {
      const w = welcomeFor(session.s!, c.id, T0);
      expect(w).not.toBeNull();
      // role فقط از welcomeFor می‌آید؛ state عمومی نقش ندارد
      const st = statesOf(c)[0];
      if (st) expect(JSON.stringify(st)).not.toContain('roleName');
    }
    expect(JSON.stringify(welcomeFor(session.s!, p2.id, T0))).not.toContain('"roleName":"میزبان"');
  });

  it('خطای عملیات غیرمجاز برای فرستنده برمی‌گردد', () => {
    const { session, clients } = mkSession();
    session.initRoom('TEST', 'میزبان', 0, T0);
    const host = joinHost(session, clients);
    const p2 = join(session, clients, 'دو');
    const p3 = join(session, clients, 'سه');
    msg(session, clients, p2, { t: 'start' }, T0); // غیر میزبان
    const err = p2.inbox.find((m) => m.t === 'error');
    expect(err).toMatchObject({ t: 'error', code: 'not_host' });
    expect(ERROR_TEXT['not_host']).toBeTruthy();
    void host; void p3;
  });

  it('جریان کامل: start → ready → skip → vote → guess → ended + recordMatch', () => {
    const { session, clients, recordMatch } = mkSession();
    session.initRoom('TEST', 'میزبان', 0, T0);
    const host = joinHost(session, clients);
    const p2 = join(session, clients, 'دو');
    const p3 = join(session, clients, 'سه');

    msg(session, clients, host, { t: 'start' }, T0);
    // همهٔ نقش‌دارها ready
    for (const c of [host, p2, p3]) {
      if (session.s!.players.find((x) => x.id === c.id)!.role) {
        msg(session, clients, c, { t: 'ready' }, T0);
      }
    }
    expect(session.s?.phase).toBe('discussion');

    // نوبت‌دار skip می‌زند (نوبت‌دار = turnOrder[currentTurnIdx]، نه ایندکس players)
    const spId = session.s!.turnOrder[session.s!.currentTurnIdx];
    const sp = session.s!.players.find((x) => x.id === spId)!;
    const owner = [host, p2, p3].find((c) => c.id === sp.id)!;
    msg(session, clients, owner, { t: 'skipTurn' }, T0);
    expect(sp.skipLeft).toBe(1);

    // زمان بحث تمام
    session.tick(session.s!.deadline! + 1);
    expect(session.s?.phase).toBe('voting');

    // رأی‌ها: همه به یک نفر
    const spy = session.s!.players.find((p) => p.role?.isSpy)!;
    const voters = [host, p2, p3];
    let accusedVote = spy.id;
    for (const v of voters) {
      const target = v.id === spy.id ? null : accusedVote;
      msg(session, clients, v, { t: 'vote', targetId: target }, T0);
    }
    if (session.s?.phase === 'spyGuess') {
      msg(session, clients, spy.id === host.id ? host : (spy.id === p2.id ? p2 : p3), { t: 'spyGuess', locationId: 'mall' }, T0);
    }
    expect(session.s?.phase).toBe('ended');
    expect(recordMatch).toHaveBeenCalled();
    expect(session.s?.results).not.toBeNull();
  });

  it('vsig فقط به مقصد می‌رسد', () => {
    const { session, clients } = mkSession();
    session.initRoom('TEST', 'میزبان', 0, T0);
    const host = joinHost(session, clients);
    const p2 = join(session, clients, 'دو');
    const p3 = join(session, clients, 'سه');
    msg(session, clients, host, { t: 'vsig', to: p2.id, data: { sdp: 'x' } }, T0);
    expect(p2.inbox.some((m) => m.t === 'vsig' && (m as { data: unknown }).data && true)).toBe(true);
    expect(p3.inbox.some((m) => m.t === 'vsig')).toBe(false);
  });

  it('kick میزبان → کلاینت اخراجی حذف و close می‌شود', () => {
    const { session, clients } = mkSession();
    session.initRoom('TEST', 'میزبان', 0, T0);
    const host = joinHost(session, clients);
    const p2 = join(session, clients, 'دو');
    const p3 = join(session, clients, 'سه');
    msg(session, clients, host, { t: 'kick', targetId: p2.id }, T0);
    expect(clients.has(p2.id)).toBe(false);
    expect(session.s?.players).toHaveLength(2);
    void p3;
  });

  it('قطع اتصال → connected=false و state پخش می‌شود؛ reconnect بازی می‌ماند', () => {
    const { session, clients } = mkSession();
    session.initRoom('TEST', 'میزبان', 0, T0);
    const host = joinHost(session, clients);
    const p2 = join(session, clients, 'دو');
    const p3 = join(session, clients, 'سه');
    msg(session, clients, host, { t: 'start' }, T0);
    session.onDisconnect(p2.id, T0 + 1000);
    expect(session.s!.players.find((p) => p.id === p2.id)!.connected).toBe(false);
    // اتصال مجدد با token درست
    const r = session.hello(p2.id, p2.token, 'دو', 0, T0 + 5000);
    expect('err' in r).toBe(false);
    expect(session.s!.players.find((p) => p.id === p2.id)!.connected).toBe(true);
    // token غلط
    const r2 = session.hello(p3.id, 'wrong-token', 'سه', 0, T0 + 6000);
    expect('err' in r2).toBe(true);
    void host;
  });

  it('gc بازیکن قطع‌شدهٔ قدیمی را حذف می‌کند', () => {
    const { session, clients } = mkSession();
    session.initRoom('TEST', 'میزبان', 0, T0);
    const host = joinHost(session, clients);
    session.onDisconnect(host.id, T0);
    expect(session.isEmpty()).toBe(false);
    session.gc(T0 + 120_000);
    expect(session.isEmpty()).toBe(true);
  });

  it('alarmCb در پایان بحث زمان رأی‌گیری را می‌دهد', () => {
    const { session, clients, alarms } = mkSession();
    session.initRoom('TEST', 'میزبان', 0, T0);
    const host = joinHost(session, clients);
    const p2 = join(session, clients, 'دو');
    const p3 = join(session, clients, 'سه');
    msg(session, clients, host, { t: 'start' }, T0);
    for (const c of [host, p2, p3]) {
      if (session.s!.players.find((x) => x.id === c.id)!.role) msg(session, clients, c, { t: 'ready' }, T0);
    }
    expect(alarms.length).toBeGreaterThan(0);
  });

  it('پیام JSON خراب سوکت را نمی‌شکند', () => {
    const { session, clients } = mkSession();
    session.initRoom('TEST', 'میزبان', 0, T0);
    const host = joinHost(session, clients);
    session.onMessage(host.id, '{not json', T0);
    session.onMessage(host.id, 'x'.repeat(9000), T0);
    session.onMessage(host.id, JSON.stringify({ t: 123 }), T0);
    expect(session.s).not.toBeNull();
  });

  it('welcomeFor شامل نقش خصوصی صاحبش است ولی state آن را ندارد', () => {
    const { session, clients } = mkSession();
    session.initRoom('TEST', 'میزبان', 0, T0);
    joinHost(session, clients);
    const p2 = join(session, clients, 'دو');
    const p3 = join(session, clients, 'سه');
    const host = clients.get([...session.s!.players].find((p) => p.isHost)!.id)!;
    msg(session, clients, host, { t: 'start' }, T0);
    const w = welcomeFor(session.s!, p2.id, T0);
    expect(w).not.toBeNull();
    if (w && w.role && !w.role.isSpy) {
      // کلمهٔ شهروندها = نام مکان؛ نقش‌های یکتا حذف شده‌اند
      expect(typeof w.role.locationName).toBe('string');
      expect(w.role.roleName).toBeUndefined();
    }
    if (w && w.role && w.role.isSpy) {
      // جاسوس با حالت پیشفرض کلمهٔ نزدیک دارد
      expect(typeof w.role.roleName).toBe('string');
    }
    // state در welcome نقش ندارد
    expect(JSON.stringify(w?.state)).not.toContain('roleName');
    void p3;
  });

  it('چرخهٔ چنددوری کامل: آمادگی لابی → نوبت‌ها → رأی → افشا → دور بعد → حد بحرانی', () => {
    const { session, clients } = mkSession();
    session.initRoom('TEST', 'میزبان', 0, T0);
    const host = joinHost(session, clients);
    const p2 = join(session, clients, 'دو');
    const p3 = join(session, clients, 'سه');
    const p4 = join(session, clients, 'چهار');
    const all = () => [host, p2, p3, p4];
    const byId = (id: string) => all().find((c) => c.id === id)!;

    // ۱) لابی: همه «آماده» → شروع خودکار (بدون پیام start از میزبان)
    for (const c of all()) msg(session, clients, c, { t: 'ready' }, T0);
    expect(session.s?.phase).toBe('revealing');
    // نقش خصوصی به هر چهار نفر رسیده است
    for (const c of all()) {
      expect(c.inbox.some((m) => m.t === 'role')).toBe(true);
    }
    // کلمهٔ همهٔ شهروندها یکسان است (پیام خصوصی role)
    const civWords = all()
      .map((c) => welcomeFor(session.s!, c.id, T0)?.role)
      .filter((r) => r && !r.isSpy)
      .map((r) => r!.locationName);
    expect(new Set(civWords).size).toBe(1);

    // ۲) پروندهٔ نقش: همه آماده → بحث
    for (const c of all()) msg(session, clients, c, { t: 'ready' }, T0);
    expect(session.s?.phase).toBe('discussion');

    // ۳) یک دور کامل نوبت ۱۵ ثانیه‌ای → رأی‌گیری خودکار
    let guard = 0;
    while (session.s!.phase === 'discussion' && guard++ < 10) {
      const spId = session.s!.turnOrder[session.s!.currentTurnIdx];
      msg(session, clients, byId(spId), { t: 'endTurn' }, T0);
    }
    expect(session.s?.phase).toBe('voting');

    // ۴) حذف یک شهروند با رأی — با ۴ بازیکن (۳ شهروند) بازی ادامه دارد
    const spyId = session.s!.spyIds[0];
    const target = session.s!.players.find((p) => !session.s!.spyIds.includes(p.id) && p.connected)!;
    for (const c of all()) {
      msg(session, clients, c, { t: 'vote', targetId: c.id === target.id ? null : target.id }, T0);
    }
    expect(session.s?.phase).toBe('roundResult');
    expect(session.s?.lastElimination?.playerId).toBe(target.id);
    // حذف‌شده حق رأی ندارد
    msg(session, clients, byId(target.id), { t: 'vote', targetId: spyId }, T0);
    expect(byId(target.id).inbox.some((m) => m.t === 'error' && m.code === 'wrong_phase')).toBe(true);

    // ۵) تیک آلارم → دور بعد با کلمهٔ جدید و توزیع دوبارهٔ نقش‌ها از مسیر tick
    const roleCountBefore = all().reduce((n, c) => n + c.inbox.filter((m) => m.t === 'role').length, 0);
    session.tick(session.s!.deadline! + 1);
    expect(session.s?.phase).toBe('revealing');
    expect(session.s?.round).toBe(2);
    expect(session.s?.spyIds).toEqual([spyId]); // همان جاسوس
    const roleCountAfter = all().reduce((n, c) => n + c.inbox.filter((m) => m.t === 'role').length, 0);
    expect(roleCountAfter).toBeGreaterThan(roleCountBefore); // نقش‌های دوباره توزیع‌شده

    // ۶) دور ۲: آماده → نوبت‌ها → رأی → حذف دومین شهروند → حد بحرانی → برد جاسوس
    for (const c of all().filter((c) => c.id !== target.id)) {
      msg(session, clients, c, { t: 'ready' }, T0);
    }
    expect(session.s?.phase).toBe('discussion');
    guard = 0;
    while (session.s!.phase === 'discussion' && guard++ < 10) {
      const spId = session.s!.turnOrder[session.s!.currentTurnIdx];
      msg(session, clients, byId(spId), { t: 'endTurn' }, T0);
    }
    expect(session.s?.phase).toBe('voting');
    const alive = session.s!.players.filter((p) => p.connected && !p.eliminated);
    const civ2 = alive.find((p) => !session.s!.spyIds.includes(p.id))!;
    for (const p of alive) {
      msg(session, clients, byId(p.id), { t: 'vote', targetId: p.id === civ2.id ? null : civ2.id }, T0);
    }
    // ۱ شهروند و ۱ جاسوس → حد بحرانی
    expect(session.s?.phase).toBe('ended');
    expect(session.s?.results?.spyWon).toBe(true);
    expect(session.s?.results?.spyIds).toContain(spyId);
  });

  it('هشدار میکروفن خارج از نوبت به‌صورت پیام خصوصی می‌رسد', () => {
    const { session, clients } = mkSession();
    session.initRoom('TEST', 'میزبان', 0, T0);
    const host = joinHost(session, clients);
    const p2 = join(session, clients, 'دو');
    const p3 = join(session, clients, 'سه');
    // لابی: همه آماده → شروع خودکار
    for (const c of [host, p2, p3]) msg(session, clients, c, { t: 'ready' }, T0);
    expect(session.s?.phase).toBe('revealing');
    // پروندهٔ نقش: همه آماده → بحث
    for (const c of [host, p2, p3]) msg(session, clients, c, { t: 'ready' }, T0);
    expect(session.s?.phase).toBe('discussion');
    for (const c of [host, p2, p3]) msg(session, clients, c, { t: 'voice', micOn: true, joined: true }, T0);
    const speakerId = session.s!.turnOrder[session.s!.currentTurnIdx];
    const nonSpeaker = [host, p2, p3].find((c) => c.id !== speakerId)!;
    msg(session, clients, nonSpeaker, { t: 'voice', micOn: true, speaking: true }, T0);
    const warn = nonSpeaker.inbox.find((m) => m.t === 'error' && m.code === 'mic_forced_off');
    expect(warn).toBeTruthy();
    expect(session.s!.players.find((p) => p.id === nonSpeaker.id)!.micOn).toBe(false);
    expect(session.s!.players.find((p) => p.id === nonSpeaker.id)!.speaking).toBe(false);
  });
});
