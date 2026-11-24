// GameSocket — کلاینت WebSocket با اتصال مجدد خودکار و hello دوباره
import { C2S, S2C } from '../../shared/types';
import { Identity } from './store';

type Status = 'open' | 'reconnecting' | 'closed';

interface Handlers {
  onMessage: (msg: S2C) => void;
  onStatus: (status: Status, detail?: string | null) => void;
}

export class GameSocket {
  private ws: WebSocket | null = null;
  private code = '';
  private identity: Identity | null = null;
  private playerId: string | undefined;
  private token: string | undefined;
  private handlers: Handlers;
  private retry = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private closedByUser = false;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private sendQueue: string[] = [];

  constructor(handlers: Handlers) {
    this.handlers = handlers;
  }

  connect(code: string, identity: Identity, playerId?: string, token?: string): Promise<void> {
    this.code = code;
    this.identity = identity;
    this.playerId = playerId;
    this.token = token;
    this.closedByUser = false;
    this.retry = 0;
    return this.open();
  }

  private open(): Promise<void> {
    return new Promise((resolve, reject) => {
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${proto}//${location.host}/ws?code=${encodeURIComponent(this.code)}`;
      let settled = false;
      const ws = new WebSocket(url);
      this.ws = ws;

      const fail = (err: unknown) => {
        if (settled) return;
        settled = true;
        reject(err);
      };

      ws.onopen = () => {
        this.sendRaw(JSON.stringify({
          t: 'hello',
          name: this.identity?.name ?? '',
          avatar: this.identity?.avatar ?? 0,
          ...(this.playerId && this.token ? { playerId: this.playerId, token: this.token } : {})
        }));
        this.startPing();
        // صف پیام‌های مانده
        for (const m of this.sendQueue) this.sendRaw(m);
        this.sendQueue = [];
        if (!settled) { settled = true; resolve(); }
        else { this.handlers.onStatus('open'); } // بعد از هر اتصال مجدد موفق
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data));
          if (msg?.t === 'hello-ok') return; // پیام اولیه DO
          if (msg?.t === 'p') return;       // pong خودکار
          this.handlers.onMessage(msg);
        } catch { /* ignore */ }
      };

      ws.onclose = (ev) => {
        this.stopPing();
        if (this.closedByUser) {
          this.handlers.onStatus('closed');
          return;
        }
        if (!settled) {
          // اتصال اول ناموفق (مثلاً لابی وجود ندارد)
          fail(new Error(this.closeReason(ev.code) ?? 'اتصال به لابی ناموفق بود.'));
          this.handlers.onStatus('closed', this.closeReason(ev.code));
          return;
        }
        // اتصال مجدد خودکار با backoff
        this.handlers.onStatus('reconnecting');
        const delay = Math.min(1000 * 2 ** this.retry, 8000);
        this.retry += 1;
        this.timer = setTimeout(() => {
          this.open().catch(() => { /* حلقهٔ onclose ادامه می‌دهد */ });
        }, delay);
      };

      ws.onerror = () => { /* onclose ادامه می‌دهد */ };
    });
  }

  private closeReason(code: number): string | null {
    if (code === 4001) return 'لابی با این کد پیدا نشد.';
    if (code === 4002) return 'نشست شما معتبر نیست؛ دوباره تلاش کنید.';
    return null;
  }

  send(msg: C2S): void {
    const data = JSON.stringify(msg);
    if (this.ws?.readyState === WebSocket.OPEN) this.sendRaw(data);
    else if (this.sendQueue.length < 20) this.sendQueue.push(data);
  }

  private sendRaw(data: string): void {
    try { this.ws?.send(data); } catch { /* ignore */ }
  }

  close(): void {
    this.closedByUser = true;
    if (this.timer) clearTimeout(this.timer);
    this.stopPing();
    try { this.ws?.close(1000); } catch { /* ignore */ }
    this.ws = null;
  }

  private startPing(): void {
    this.stopPing();
    let n = 0;
    this.pingTimer = setInterval(() => {
      n++;
      if (n % 2 === 0) {
        // پینگ واقعی: DO را بیدار می‌کند و اگر اتصال سمت سرور بی‌سروصدا قطع شده بود، بازیکن را دوباره وصل می‌کند
        this.sendRaw(JSON.stringify({ t: 'ping' }));
      } else {
        // پینگ سبک: پاسخ خودکار DO بدون بیدار کردن آن
        this.sendRaw(JSON.stringify({ t: 'p' }));
      }
    }, 15000);
  }

  private stopPing(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }
}
