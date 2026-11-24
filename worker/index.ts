// ورودی Cloudflare Worker — مسیریابی REST + ارتقای WebSocket + سرو استاتیک SPA

import { GameRoomDO, Env } from './do';
import { genRoomCode } from '../shared/ids';
import { iceServersFromEnv } from './ice';

export { GameRoomDO };

const MAX_CREATE_RETRIES = 5;

function cryptoRng(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] / 4294967296;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' }
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET, POST, OPTIONS',
          'access-control-allow-headers': 'content-type'
        }
      });
    }

    if (url.pathname === '/api/health') {
      return json({ ok: true, name: 'بازی جاسوس', time: Date.now() });
    }

    if (url.pathname === '/api/ice') {
      return json({ iceServers: iceServersFromEnv(env) });
    }

    // ساخت لابی: کد یکتا تا موفقیت تلاش می‌شود
    if (url.pathname === '/api/lobby' && request.method === 'POST') {
      const body = await request.json<{ name?: string; avatar?: number }>().catch(() => ({}) as { name?: string; avatar?: number });
      const name = String(body.name ?? '').trim().slice(0, 18);
      if (name.length < 2) return json({ error: 'bad_name' }, 400);
      for (let i = 0; i < MAX_CREATE_RETRIES; i++) {
        const code = genRoomCode(cryptoRng);
        const id = env.GAME_ROOM.idFromName(code);
        const stub = env.GAME_ROOM.get(id);
        const res = await stub.fetch('https://do/create', {
          method: 'POST',
          body: JSON.stringify({ name, avatar: Number(body.avatar ?? 0) | 0 })
        });
        if (res.status === 200) {
          const data = await res.json<{ code: string; playerId: string; token: string }>();
          return json(data);
        }
        // 409 = کد تکراری؛ کد جدید
      }
      return json({ error: 'code_exhausted' }, 503);
    }

    // WebSocket: ورود به لابی با کد
    if (url.pathname === '/ws') {
      const upgrade = request.headers.get('Upgrade') === 'websocket';
      if (!upgrade) return json({ error: 'expected_websocket' }, 426);
      const code = (url.searchParams.get('code') ?? '').trim().toUpperCase();
      if (!/^[A-Z0-9]{4}$/.test(code)) return json({ error: 'bad_code' }, 400);
      const id = env.GAME_ROOM.idFromName(code);
      const stub = env.GAME_ROOM.get(id);
      const forward = new Request('https://do/ws', request);
      return stub.fetch(forward);
    }

    // بقیهٔ مسیرها: فایل‌های استاتیک SPA
    return env.ASSETS.fetch(request);
  }
} satisfies ExportedHandler<Env>;
