// GameRoomDO — هر لابی یک نمونهٔ این Durable Object است (نام DO = کد لابی)
// از WebSocket Hibernation API استفاده می‌شود تا DO بین پیام‌ها بخوابد و هزینهٔ پایین بماند.
//
// الگوی مهم: هیچ Session/state ای بین رویدادها کش نمی‌شود؛ در هر رویداد (پیام/بستن/آلارم)
// وضعیت تازه از Storage خوانده، تغییر داده و بلافاصله نوشته می‌شود تا هیچ به‌روزرسانی گم نشود.

import { DurableObject } from 'cloudflare:workers';
import { RoomState, publicState } from '../shared/engine';
import { genRoomCode } from '../shared/ids';
import { RoomSession, welcomeFor } from './room';

export interface Env {
  GAME_ROOM: DurableObjectNamespace;
  PLAYER_QUOTA: DurableObjectNamespace;
  ASSETS: Fetcher;
  DB?: D1Database;
  TURN_URLS?: string;
  TURN_USERNAME?: string;
  TURN_CREDENTIAL?: string;
}

const ROOM_KEY = 'room';

// rng امن سمت سرور (crypto) — سازگار با امضای Rng موتور بازی
function cryptoRng(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] / 4294967296;
}

export class GameRoomDO extends DurableObject<Env> {
  // خروجی‌های جانبی آخرین جهش (بلافاصله بعد از هر رویداد مصرف و خالی می‌شوند)
  private lastState: RoomState | null = null;
  private matchToRecord: RoomState | null = null;
  private alarmRequest: number | null = null;

  /** ساخت Session تازه از Storage — هر بار */
  private async newSession(): Promise<RoomSession> {
    const raw = await this.ctx.storage.get<unknown>(ROOM_KEY);
    this.lastState = null;
    this.matchToRecord = null;
    this.alarmRequest = null;
    const session = new RoomSession(
      this.transport(),
      (s) => { this.lastState = s; },
      cryptoRng,
      (s) => { this.matchToRecord = s; },
      true // سهمیهٔ روزانه فعال است — اعتبارسنجی کامل سمت سرور
    );
    session.alarmCb = (at) => { this.alarmRequest = at; };
    if (raw) session.load(raw);
    return session;
  }

  /** نوشتن وضعیت + ثبت بازی در D1 + زمان‌بندی آلارم درخواست‌شده */
  private async commit(): Promise<void> {
    const s = this.lastState;
    if (s && s.players.length > 0) {
      await this.ctx.storage.put(ROOM_KEY, s);
    } else if (s && s.players.length === 0) {
      // لابی خالی شد — حذف کامل تا کد در آینده قابل استفاده مجدد باشد
      await this.ctx.storage.deleteAll();
    }
    if (this.matchToRecord) {
      await this.recordMatch(this.matchToRecord);
      this.matchToRecord = null;
    }
    const at = this.alarmRequest;
    this.alarmRequest = null;
    if (at != null) await this.scheduleAlarm(at);
  }

  private async scheduleAlarm(at: number): Promise<void> {
    const current = await this.ctx.storage.getAlarm();
    if (current == null || at < current - 200) {
      await this.ctx.storage.setAlarm(Math.max(at, Date.now() + 300));
    }
  }

  private transport() {
    return {
      sendTo: (playerId: string, msg: unknown) => this.sendToPlayer(playerId, msg),
      broadcast: (msg: unknown) => this.broadcast(msg),
      close: (playerId: string) => this.closePlayer(playerId)
    };
  }

  private socketsFor(playerId: string): WebSocket[] {
    return this.ctx.getWebSockets().filter((ws) => {
      try {
        const att = ws.deserializeAttachment() as { pid?: string } | null;
        return att?.pid === playerId;
      } catch {
        return false;
      }
    });
  }

  private sendToPlayer(playerId: string, msg: unknown): void {
    const data = JSON.stringify(msg);
    for (const ws of this.socketsFor(playerId)) {
      try { ws.send(data); } catch { /* سوکت مرده؛ close بعداً می‌آید */ }
    }
  }

  private broadcast(msg: unknown): void {
    const data = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(data); } catch { /* ignore */ }
    }
  }

  private closePlayer(playerId: string): void {
    for (const ws of this.socketsFor(playerId)) {
      try { ws.close(1000, 'closed'); } catch { /* ignore */ }
    }
  }

  /* ---------- HTTP ---------- */

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/create') {
      return this.handleCreate(request);
    }
    if (url.pathname === '/ws' && request.headers.get('Upgrade') === 'websocket') {
      return this.handleUpgrade();
    }
    return new Response('Not Found', { status: 404 });
  }

  private async handleCreate(request: Request): Promise<Response> {
    const existing = await this.ctx.storage.get(ROOM_KEY);
    if (existing) {
      // کد تکراری — Worker با کد جدید دوباره تلاش می‌کند
      return Response.json({ codeTaken: true }, { status: 409 });
    }
    const body = await request.json<{ name?: string; avatar?: number }>().catch(() => ({}) as { name?: string; avatar?: number });
    const session = await this.newSession();
    const code = this.ctx.id.name ?? genRoomCode(cryptoRng);
    session.initRoom(code, String(body.name ?? 'میزبان').slice(0, 18), Number(body.avatar ?? 0), Date.now());
    await this.commit();
    await this.scheduleAlarm(Date.now() + 60_000); // پاکسازی خودکار لابی رهاشده
    const p = session.s!.players[0];
    return Response.json({ code, playerId: p.id, token: p.token });
  }

  private handleUpgrade(): Response {
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    // پاسخ خودکار ping سبک بدون بیدارکردن DO
    this.ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair(JSON.stringify({ t: 'p' }), JSON.stringify({ t: 'p' }))
    );

    this.ctx.acceptWebSocket(server);
    server.send(JSON.stringify({ t: 'hello-ok' }));

    return new Response(null, { status: 101, webSocket: client });
  }

  /* ---------- WebSocket handlers ---------- */

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string') return;
    let parsed: { t?: string };
    try { parsed = JSON.parse(message); } catch { return; }

    const session = await this.newSession();
    const att = safeAttachment(ws);

    if (parsed.t === 'hello') {
      const body = parsed as { t: 'hello'; name?: string; avatar?: number; playerId?: string; token?: string; deviceId?: string };
      const r = session.hello(
        body.playerId ?? null, body.token ?? null,
        String(body.name ?? ''), Number(body.avatar ?? 0), Date.now(),
        typeof body.deviceId === 'string' && body.deviceId ? body.deviceId.slice(0, 64) : undefined
      );
      if ('err' in r) {
        ws.send(JSON.stringify({ t: 'error', code: r.err, message: 'ورود ناموفق بود.' }));
        if (r.err === 'lobby_not_found' || r.err === 'bad_token') ws.close(4001, r.err);
        return;
      }
      ws.serializeAttachment({ pid: r.playerId });
      // سهمیهٔ روزانهٔ بازیکنان از QuotaDO تازه می‌شود — قبل از ساخت welcome/state
      await this.refreshQuota(session);
      const w = welcomeFor(session.s!, r.playerId, Date.now());
      if (w) {
        ws.send(JSON.stringify({
          t: 'welcome', code: this.ctx.id.name ?? session.s!.code, you: w.you,
          state: w.state, role: w.role
        }));
        // وضعیت به‌روز برای همه — شخصی‌سازی‌شده (سهمیهٔ هر بازیکن فقط برای خودش)
        session.broadcastStates(Date.now());
      }
      await this.commit();
      return;
    }

    if (!att?.pid) return;
    session.onMessage(att.pid, message, Date.now());
    // مصرف سهمیهٔ نوبت‌های شروع‌شده در QuotaDO ثبت و کش همگام می‌شود
    await this.flushConsumes(session);
    await this.commit();
  }

  async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    const session = await this.newSession();
    const att = safeAttachment(ws);
    if (!att?.pid) return;
    // اگر بازیکن سوکت زندهٔ دیگری دارد، قطع حساب نمی‌شود
    const stillConnected = this.socketsFor(att.pid).some((x) => x !== ws);
    if (!stillConnected) {
      session.onDisconnect(att.pid, Date.now());
    }
    await this.commit();
    void code;
  }

  /* ---------- آلارم: تایمرهای بازی + پاکسازی ---------- */

  async alarm(): Promise<void> {
    const session = await this.newSession();
    if (!session.exists) {
      // لابی رهاشده/نیمه‌ساخته — حذف کامل
      await this.ctx.storage.deleteAll();
      return;
    }
    // کش سهمیهٔ روزانه قبل از تیک تازه می‌شود تا ردّ خودکار با دادهٔ درست انجام شود
    // (بازنشانی ۰۰:۰۰ تهران هم همین‌جا خودکار اعمال می‌شود)
    await this.refreshQuota(session);
    session.tick(Date.now());
    const empty = session.isEmpty();
    await this.flushConsumes(session);
    await this.commit();
    if (empty) {
      await this.ctx.storage.deleteAll();
      return;
    }
    // اگر آلارم بعدی درخواست نشده بود، دوباره برای پاکسازی/تایمر زمان‌بندی کن
    const current = await this.ctx.storage.getAlarm();
    if (current == null) {
      await this.scheduleAlarm(Date.now() + 30_000);
    }
  }

  /* ---------- سهمیهٔ روزانه (QuotaDO) ---------- */

  /** خواندن سهمیهٔ همهٔ بازیکنان دارای deviceId از QuotaDO و به‌روزرسانی کش RoomState.quotaLeft */
  private async refreshQuota(session: RoomSession): Promise<void> {
    if (!this.env.PLAYER_QUOTA || !session.s) return;
    const targets = session.s.players.filter((p) => p.deviceId && p.connected);
    if (targets.length === 0) return;
    await Promise.all(targets.map(async (p) => {
      try {
        const id = this.env.PLAYER_QUOTA.idFromName('q:' + p.deviceId);
        const res = await this.env.PLAYER_QUOTA.get(id).fetch('https://quota/check', { method: 'POST', body: '{}' });
        if (!res.ok || !session.s) return;
        const j = await res.json<{ remaining: number }>();
        session.s.quotaLeft[p.id] = Math.max(0, j.remaining | 0);
      } catch { /* خطای موقت — کش با refresh بعدی همگام می‌شود */ }
    }));
  }

  /** ثبت مصرف‌های نوبت‌های شروع‌شده در QuotaDO و اصلاح کش با پاسخ معتبر */
  private async flushConsumes(session: RoomSession): Promise<void> {
    if (!this.env.PLAYER_QUOTA || !session.s) return;
    const consumed = session.takeConsumed();
    for (const c of consumed) {
      const p = session.s.players.find((x) => x.id === c.pid);
      if (!p?.deviceId) continue; // بازیکن بدون deviceId — سهمیه فقط در همین لابی محاسبه می‌شود
      try {
        const id = this.env.PLAYER_QUOTA.idFromName('q:' + p.deviceId);
        const res = await this.env.PLAYER_QUOTA.get(id).fetch('https://quota/consume', {
          method: 'POST',
          body: JSON.stringify({ seconds: c.seconds })
        });
        if (res.ok && session.s) {
          const j = await res.json<{ ok: boolean; remaining: number }>();
          session.s.quotaLeft[p.id] = Math.max(0, j.remaining | 0);
        }
      } catch { /* خطای موقت — کش با refresh بعدی همگام می‌شود */ }
    }
  }

  private async recordMatch(rec: RoomState): Promise<void> {
    if (!this.env.DB) return;
    try {
      const spyWon = rec.results?.spyWon ? 1 : 0;
      await this.env.DB.prepare(
        'INSERT INTO matches (code, location_name, spy_won, players_count, ended_at) VALUES (?, ?, ?, ?, ?)'
      ).bind(rec.code, rec.results?.locationName ?? '', spyWon, rec.players.length, rec.results ? Date.now() : Date.now()).run();
    } catch {
      // D1 اختیاری است؛ خطای آن بازی را نمی‌شکند
    }
  }
}

function safeAttachment(ws: WebSocket): { pid?: string } | null {
  try {
    return ws.deserializeAttachment() as { pid?: string } | null;
  } catch {
    return null;
  }
}
