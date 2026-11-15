// ─── بازی آنلاین جاسوس (SPY) — نقطه ورود سرور ───
// Express (REST) + Socket.IO (بلادرنگ) + SQLite — همه روی یک سرویس
const http = require('http');
const path = require('path');
const express = require('express');
const { Server } = require('socket.io');

const CFG = require('./config');
const db = require('./db');
const auth = require('./auth');
const shop = require('./shop');
const words = require('./words');
const util = require('./util');
const { makeLimiter } = require('./rate');
const createEngine = require('./game/engine');
const createLobby = require('./lobby');
const createTtt = require('./ttt');
const attachRealtime = require('./realtime');
const createVoice = require('./voice');

const app = express();
const httpServer = http.createServer(app);

// مسیر سفارشی WebSocket تا با REST تداخل نکند (از طریق Gateway/پروکسی هم کار می‌کند)
const io = new Server(httpServer, {
  path: '/spy-ws',
  cors: { origin: true, credentials: true },
  pingTimeout: 60000,
  pingInterval: 25000,
  maxHttpBufferSize: 1e5,
});

// ─── زمینه مشترک (Context) ───
const sockets = new Map(); // playerId → Set<socket>
const rooms = new Map(); // code → room
const playerRoom = new Map(); // playerId → code

const ctx = {
  cfg: CFG,
  db,
  shop,
  words,
  util,
  verifyToken: auth.verifyToken,
  makeLimiter,
  sockets,
  rooms,
  playerRoom,
};

function socketsFor(playerId) {
  const set = sockets.get(playerId);
  return set ? [...set] : [];
}

ctx.socketsFor = socketsFor;
ctx.addSocket = (playerId, socket) => {
  let set = sockets.get(playerId);
  if (!set) {
    set = new Set();
    sockets.set(playerId, set);
  }
  set.add(socket);
};
ctx.removeSocket = (playerId, socket) => {
  const set = sockets.get(playerId);
  if (!set) return;
  set.delete(socket);
  if (set.size === 0) sockets.delete(playerId);
};

function recipients(room) {
  if (room.status === 'lobby' || !room.game) return room.players;
  return room.game.players;
}

function publicPresence(room) {
  if (room.status === 'lobby' || !room.game) {
    return room.players.map((p) => ({ id: p.id, connected: !!p.connected, alive: true }));
  }
  return room.game.players.map((p) => ({ id: p.id, connected: !!p.connected, alive: !!p.alive }));
}

ctx.emit = {
  // ارسال شخصی‌سازی‌شده: payloadFn(recipient) خروجی مخصوص همان بازیکن را می‌سازد
  toRoom(room, event, payloadFn) {
    for (const r of recipients(room)) {
      let payload;
      try {
        payload = typeof payloadFn === 'function' ? payloadFn(r) : payloadFn;
      } catch (e) {
        console.error('payload build error', event, e);
        continue;
      }
      for (const s of socketsFor(r.id)) s.emit(event, payload);
    }
  },
  toRoomSame(room, event, payload) {
    for (const r of recipients(room)) for (const s of socketsFor(r.id)) s.emit(event, payload);
  },
  toPlayer(playerId, event, payload) {
    for (const s of socketsFor(playerId)) s.emit(event, payload);
  },
  presence(room) {
    ctx.emit.toRoomSame(room, 'game:presence', { players: publicPresence(room) });
  },
  meUpdate(playerId) {
    const p = db.getPlayer(playerId);
    if (p) ctx.emit.toPlayer(playerId, 'me:update', { coins: p.coins, freeEntries: p.free_entries, name: p.name, avatar: p.avatar });
  },
};

// ─── ماژول‌ها ───
ctx.engine = createEngine(ctx);
ctx.lobby = createLobby(ctx);
ctx.ttt = createTtt(ctx);
ctx.voice = createVoice(ctx);

// ─── REST API ───
const httpLimiter = makeLimiter();
app.use(express.json({ limit: '16kb' }));

app.use((req, res, next) => {
  const ip = req.headers['x-forwarded-for'] ? String(req.headers['x-forwarded-for']).split(',')[0].trim() : req.socket.remoteAddress || 'x';
  if (!httpLimiter('http:' + ip, 90, 60000)) {
    return res.status(429).json({ ok: false, code: 'rate', msg: 'درخواست‌ها زیاد است؛ کمی صبر کن.' });
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});

const CORS_OK = (req, res) => {
  const origin = req.headers.origin;
  if (CFG.ALLOWED_ORIGIN) {
    const list = CFG.ALLOWED_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean);
    if (origin && list.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
  } else if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin); // پشتیبانی از فرانت روی دامنه جدا (Tiiny Host)
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
};

app.all('/api/*', (req, res, next) => {
  CORS_OK(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

function pubPlayer(p) {
  return {
    id: p.id,
    name: p.name,
    avatar: p.avatar,
    coins: p.coins,
    freeEntries: p.free_entries,
    stats: { matches: p.matches, wins: p.wins, losses: p.losses },
    createdAt: p.created_at,
  };
}

const NAME_RE = /^[\u0600-\u06FFA-Za-z0-9_\u200c .-]{2,16}$/u;

function authPlayer(req) {
  const token = auth.tokenFromReq(req);
  const id = auth.verifyToken(token);
  if (!id) return null;
  const p = db.getPlayer(id);
  return p || null;
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'spy-online', impl: db.impl, rooms: rooms.size, uptime: Math.round(process.uptime()) });
});

app.post('/api/register', (req, res) => {
  const existing = authPlayer(req);
  if (existing) {
    return res.json({ ok: true, player: pubPlayer(existing), token: auth.tokenFor(existing.id), returning: true });
  }
  const name = util.cleanText(req.body && req.body.name, 16);
  if (!name || !NAME_RE.test(name)) {
    return res.status(400).json({ ok: false, code: 'bad_name', msg: 'نام باید بین ۲ تا ۱۶ کاراکتر و فقط شامل حروف، عدد و خط تیره باشد.' });
  }
  const p = db.createPlayer(name);
  const token = auth.tokenFor(p.id);
  auth.setTokenCookie(req, res, token);
  res.json({ ok: true, player: pubPlayer(p), token, returning: false });
});

app.get('/api/me', (req, res) => {
  const p = authPlayer(req);
  if (!p) return res.status(401).json({ ok: false, code: 'guest' });
  const owned = [...db.ownedAvatars(p.id)];
  res.json({ ok: true, player: pubPlayer(p), owned });
});

app.post('/api/me/name', (req, res) => {
  const p = authPlayer(req);
  if (!p) return res.status(401).json({ ok: false, code: 'guest' });
  const name = util.cleanText(req.body && req.body.name, 16);
  if (!name || !NAME_RE.test(name)) {
    return res.status(400).json({ ok: false, code: 'bad_name', msg: 'نام باید بین ۲ تا ۱۶ کاراکتر باشد.' });
  }
  db.setName(p.id, name);
  res.json({ ok: true, player: pubPlayer(db.getPlayer(p.id)) });
});

app.post('/api/me/avatar', (req, res) => {
  const p = authPlayer(req);
  if (!p) return res.status(401).json({ ok: false, code: 'guest' });
  const id = req.body && req.body.avatarId;
  if (!shop.canUse(db.ownedAvatars(p.id), id)) {
    return res.status(400).json({ ok: false, code: 'locked', msg: 'این آواتار را نداری؛ از فروشگاه بخر.' });
  }
  db.setAvatar(p.id, id);
  res.json({ ok: true, player: pubPlayer(db.getPlayer(p.id)) });
});

app.get('/api/avatars', (req, res) => {
  const p = authPlayer(req);
  const owned = p ? db.ownedAvatars(p.id) : new Set();
  res.json({ ok: true, avatars: shop.AVATARS.map((a) => ({ ...a, owned: a.price === 0 || owned.has(a.id) })), stickers: shop.STICKERS, stickerNames: shop.STICKER_NAMES });
});

app.post('/api/shop/buy', (req, res) => {
  const p = authPlayer(req);
  if (!p) return res.status(401).json({ ok: false, code: 'guest' });
  const id = req.body && req.body.avatarId;
  const a = shop.avatarById(id);
  if (!a) return res.status(400).json({ ok: false, code: 'bad_input', msg: 'آواتار نامعتبر است.' });
  const owned = db.ownedAvatars(p.id);
  if (a.price === 0 || owned.has(id)) {
    return res.json({ ok: true, already: true, player: pubPlayer(db.getPlayer(p.id)) });
  }
  if (p.coins < a.price) {
    return res.status(400).json({ ok: false, code: 'no_coins', msg: `سکه کافی نداری. قیمت این آواتار ${a.price} سکه است.`, need: a.price, have: p.coins });
  }
  const balance = db.addCoins(p.id, -a.price, 'avatar_buy', { avatar: id });
  db.grantAvatar(p.id, id);
  res.json({ ok: true, player: pubPlayer(db.getPlayer(p.id)), balance });
});

app.get('/api/history', (req, res) => {
  const p = authPlayer(req);
  if (!p) return res.status(401).json({ ok: false, code: 'guest' });
  res.json({ ok: true, history: db.historyFor(p.id, 40) });
});

app.post('/api/identity/clear', (req, res) => {
  auth.clearTokenCookie(req, res);
  res.json({ ok: true });
});

app.use('/api', (req, res) => {
  res.status(404).json({ ok: false, code: 'not_found' });
});

// ─── ارائه فرانت‌اند در حالت self-host ───
if (CFG.SERVE_CLIENT) {
  app.use(express.static(CFG.CLIENT_DIR, { extensions: ['html'] }));
}

// ─── Socket.IO ───
attachRealtime(io, ctx);

// ─── بازیابی اتاق‌های ذخیره‌شده و پاکسازی دوره‌ای ───
const restored = ctx.lobby.loadAll();
if (restored) console.log(`[spy] ${restored} room(s) restored from database`);

setInterval(() => {
  try {
    ctx.lobby.prune();
  } catch (e) {
    console.error('prune error', e);
  }
}, 60000);

httpServer.listen(CFG.PORT, () => {
  console.log(`[spy] SPY server listening on :${CFG.PORT} (db: ${db.impl})`);
});

// خاموشی تمیز
function shutdown() {
  console.log('[spy] shutting down…');
  try {
    for (const room of rooms.values()) ctx.persistRoom(room);
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000);
  } catch (e) {
    process.exit(0);
  }
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
