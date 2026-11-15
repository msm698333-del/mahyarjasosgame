// ─── درایور ربات برای تست بصری ───
// یک لابی می‌سازد (کد چاپ می‌شود)، تعداد ربات مشخص می‌کند و بازی را تا پایان پیش می‌برد.
// بازیکن مرورگر می‌تواند با کد وارد شود و در نوبت‌های خودش دستی بازی کند.
// اجرا: node scripts/room_driver.js [تعداد‌ربات] [هزینه]
const { io } = require('socket.io-client');

const BASE = process.env.SPY_URL || 'http://localhost:3003';
const codeArg = process.argv[2] || '';
const botCount = parseInt(process.argv[3] || '3', 10);
const fee = parseInt(process.argv[4] || '0', 10);
const startDelay = parseInt(process.argv[5] || '800', 10);
const randOf = (a) => a[Math.floor(Math.random() * a.length)];

function emitP(socket, ev, data) {
  return new Promise((resolve) => {
    socket.emit(ev, data, (res) => resolve(res || { ok: true }));
    setTimeout(() => resolve({ ok: false, code: 'ack_timeout' }), 6000);
  });
}

async function register(name) {
  return (await fetch(BASE + '/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })).json();
}

function attach(socket, b) {
  socket.on('game:init', (d) => { b.me = d.me; b.players = d.players; b.phase = 'deal'; b.role = d.me.role; });
  socket.on('game:term', (d) => { b.phase = 'day'; b.sub = 'floor'; b.askerId = d.askerId; b.targetId = d.targetId; b.question = null; b.answer = null; b.stickerSent = false; b.term = d.term; });
  socket.on('game:question', (d) => { b.sub = 'answer'; b.question = d.text; b.askerId = d.from; b.targetId = d.to; });
  socket.on('game:answer', (d) => { b.answer = d.text || null; });
  socket.on('game:challenge', (d) => { b.sub = 'challenge'; });
  socket.on('game:vote', (d) => { b.phase = 'vote'; b.candidates = d.candidates.map((c) => c.id); b.myVote = null; });
  socket.on('game:revote', (d) => { b.candidates = d.candidates.map((c) => c.id); b.myVote = null; });
  socket.on('game:night', (d) => { b.phase = 'night'; b.nightIsSpy = !!d.isSpy; b.candidates = (d.candidates || []).map((c) => c.id); b.nightPicksMine = null; });
  socket.on('game:guessPrompt', (d) => { b.guessPrompt = true; b.guessSent = false; });
  socket.on('game:guessStart', (d) => { b.phase = 'guess'; });
  socket.on('game:eliminated', (d) => { const p = b.players.find((x) => x.id === d.player.id); if (p) p.alive = false; });
  socket.on('game:dawn', (d) => { const p = b.players.find((x) => x.id === d.eliminated.id); if (p) p.alive = false; });
  socket.on('game:over', (d) => { b.over = d; console.log(`[bot] over — winner=${d.winner} word=${d.word}`); });
  socket.on('vote:ok', (d) => { b.myVote = d.targetId; });
}

async function main() {
  let code = codeArg;
  const bots = [];

  if (!code) {
    const host = await register('میزبان‌ربات');
    const socket = io(BASE, { path: '/spy-ws', transports: ['websocket', 'polling'], auth: { token: host.token } });
    const b = { socket, me: null, players: [], phase: null };
    attach(socket, b);
    bots.push(b);
    await new Promise((r) => socket.on('connect', r));
    const cr = await emitP(socket, 'room:create', { slots: botCount + 2, fee });
    if (!cr.ok) {
      console.error('create failed', cr);
      process.exit(1);
    }
    code = cr.code;
    console.log('ROOM_CODE=' + code);
  }

  for (let i = 0; i < botCount; i++) {
    const reg = await register('هم‌بازی' + (i + 1) + '-' + Math.floor(Math.random() * 999));
    const socket = io(BASE, { path: '/spy-ws', transports: ['websocket', 'polling'], auth: { token: reg.token } });
    const b = { socket, me: null, players: [], phase: null, candidates: [], myVote: null };
    attach(socket, b);
    bots.push(b);
    await new Promise((r) => socket.on('connect', r));
    await emitP(socket, 'room:join', { code });
    await emitP(socket, 'room:ready', { ready: true });
    console.log(`[bot${i}] joined`);
  }

  // شروع بازی اگر میزبان ربات است (وقتی کد از قبل داده شده، میزبان انسانی است و شروع را نمی‌زنیم)
  if (!codeArg) {
    await new Promise((r) => setTimeout(r, startDelay));
    const st = await emitP(bots[0].socket, 'room:start', {});
    console.log('[host] start:', st.ok);
  }

  // حلقهٔ بازی ربات‌ها
  const start = Date.now();
  const tick = setInterval(async () => {
    for (const b of bots) {
      if (b.over || !b.me || !b.socket.connected) continue;
      const alive = b.players.filter((p) => p.alive && p.id !== b.me.id);
      try {
        if (b.phase === 'day' && b.sub === 'floor' && b.askerId === b.me.id && !b.question && alive.length) {
          await emitP(b.socket, 'game:ask', { targetId: randOf(alive).id, text: 'به نظرت این انتخاب بیشتر شبیه چیست؟' });
        } else if (b.phase === 'day' && b.sub === 'answer' && b.targetId === b.me.id && b.question && !b.answer) {
          await emitP(b.socket, 'game:answer', { text: 'راستش برایم جالب و کمی عجیب است.' });
        } else if (b.phase === 'day' && b.sub === 'challenge' && b.targetId === b.me.id && alive.length) {
          await emitP(b.socket, 'game:challenge', { targetId: randOf(alive).id });
        } else if (b.phase === 'day' && b.term === 1 && !b.stickerSent) {
          const r = await emitP(b.socket, 'game:sticker', { id: 's01' });
          if (r.ok) b.stickerSent = true;
        } else if (b.phase === 'vote' && b.candidates.length && !b.myVote) {
          const t = randOf(b.candidates.filter((id) => id !== b.me.id));
          await emitP(b.socket, 'vote:cast', { targetId: t });
        } else if (b.phase === 'night' && b.nightIsSpy && b.nightPicksMine === null && alive.length) {
          const r = await emitP(b.socket, 'night:pick', { targetId: randOf(alive).id });
          if (r.ok) b.nightPicksMine = true;
        } else if (b.phase === 'guess' && b.guessPrompt && !b.guessSent) {
          await emitP(b.socket, 'game:guess', { word: 'قورباغه' });
          b.guessSent = true;
        }
      } catch (e) {
        /* continue */
      }
    }
    if (Date.now() - start > 600000) {
      console.log('driver timeout');
      clearInterval(tick);
      process.exit(0);
    }
  }, 500);

  console.log('DRIVER_RUNNING (code=' + code + ')');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
