// ─── تست قابلیت‌های جدید نسخه ۱.۱: شات جاسوس، حدس دقیق، اعلام پایان بازی، اتاق آزمایشی ۲ نفره، ویس ───
// اجرا: سرور باید با DB_PATH مشخص روی localhost:3003 بالا باشد؛
//       DB_PATH را هم در متغیر SPY_DB_PATH بده تا تست بتواند نقش/کلمه را از دیتابیس بخواند (فقط برای تست).
//   DB_PATH=/tmp/spy-test.db SPY_DB_PATH=/tmp/spy-test.db node scripts/sim_update_test.js
const { io } = require('socket.io-client');
const { DatabaseSync } = require('node:sqlite');

const BASE = process.env.SPY_URL || 'http://localhost:3003';
const WS_PATH = '/spy-ws';
const DB_PATH = process.env.SPY_DB_PATH || '';
const TAG = 'ت' + Math.floor(Math.random() * 9000);

let pass = 0;
let fail = 0;
function check(name, cond, extra) {
  if (cond) {
    pass++;
    console.log(`PASS | ${name}${extra ? ' | ' + extra : ''}`);
  } else {
    fail++;
    console.log(`FAIL | ${name}${extra ? ' | ' + extra : ''}`);
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function register(name) {
  const res = await fetch(BASE + '/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  return res.json();
}

async function meOf(token) {
  const res = await fetch(BASE + '/api/me', { headers: { Authorization: 'Bearer ' + token } });
  return res.json();
}

function emitP(socket, ev, data) {
  return new Promise((resolve) => {
    socket.emit(ev, data, (res) => resolve(res || { ok: true }));
    setTimeout(() => resolve({ ok: false, code: 'ack_timeout' }), 6000);
  });
}

// نقش‌ها و کلمهٔ مخفی را مستقیم از دیتابیس می‌خوانیم — فقط ابزار تست است، بخشی از بازی نیست
function peekRoom(code) {
  if (!DB_PATH) return null;
  const db = new DatabaseSync(DB_PATH, { readOnly: false });
  const row = db.prepare('SELECT state FROM rooms WHERE code = ?').get(code);
  db.close();
  if (!row) return null;
  try {
    return JSON.parse(row.state);
  } catch (e) {
    return null;
  }
}

function makeBot(token) {
  const socket = io(BASE, {
    path: WS_PATH,
    transports: ['websocket', 'polling'],
    auth: { token },
    reconnection: false,
  });
  const bot = {
    socket, token, connected: false,
    me: null, players: [], word: null, category: null, role: null,
    phase: null, sub: null, askerId: null, targetId: null, question: null, answer: null,
    candidates: [], myVote: null, revote: false,
    nightIsSpy: false, nightPicksMine: null,
    guessPrompt: null, guessSent: false, guessResult: null,
    shotStart: null, shotResult: null, shotPicked: false, shotSkipped: false,
    declareResult: null, declared: false,
    over: null, winner: null, realWord: null, testFlag: null,
    payloads: [],
  };
  socket.on('connect', () => { bot.connected = true; });
  socket.on('disconnect', () => { bot.connected = false; });
  socket.onAny((ev, data) => {
    if (ev === 'game:presence') return;
    bot.payloads.push({ ev, data: JSON.stringify(data || {}) });
  });
  socket.on('game:init', (d) => {
    bot.me = d.me;
    bot.players = d.players;
    bot.role = d.me.role;
    bot.word = d.me.word;
    bot.category = d.me.category;
    bot.phase = 'deal';
  });
  socket.on('game:term', (d) => {
    bot.phase = 'day'; bot.sub = 'floor'; bot.askerId = d.askerId; bot.targetId = d.targetId;
    bot.question = null; bot.answer = null; bot.declared = false;
  });
  socket.on('game:question', (d) => { bot.sub = 'answer'; bot.question = d.text; bot.askerId = d.from; bot.targetId = d.to; });
  socket.on('game:answer', (d) => { bot.answer = d.text || null; });
  socket.on('game:challenge', (d) => { bot.sub = 'challenge'; });
  socket.on('game:vote', (d) => { bot.phase = 'vote'; bot.revote = false; bot.candidates = d.candidates.map((c) => c.id); bot.myVote = null; });
  socket.on('game:revote', (d) => { bot.phase = 'vote'; bot.revote = true; bot.candidates = d.candidates.map((c) => c.id); bot.myVote = null; });
  socket.on('vote:ok', (d) => { bot.myVote = d.targetId; });
  socket.on('game:shotStart', (d) => { bot.phase = 'shot'; bot.shotStart = d; bot.shotPicked = false; bot.shotSkipped = false; });
  socket.on('game:shotResult', (d) => { bot.shotResult = d; });
  socket.on('game:guessStart', (d) => { bot.phase = 'guess'; bot.guessSent = false; });
  socket.on('game:guessPrompt', (d) => { bot.guessPrompt = d; bot.guessSent = false; });
  socket.on('game:guessResult', (d) => { bot.guessResult = d; bot.guessPrompt = null; });
  socket.on('game:declareResult', (d) => { bot.declareResult = d; });
  socket.on('game:night', (d) => { bot.phase = 'night'; bot.nightIsSpy = !!d.isSpy; bot.nightPicksMine = null; });
  socket.on('game:eliminated', (d) => {
    const p = bot.players.find((x) => x.id === d.player.id);
    if (p) p.alive = false;
  });
  socket.on('game:over', (d) => { bot.over = d; bot.phase = 'over'; bot.winner = d.winner; bot.realWord = d.word; bot.testFlag = d.test; });
  return bot;
}

function aliveOf(bot) {
  return bot.players.filter((p) => p.alive && p.id !== bot.me.id);
}
function randOf(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// موتور رانندگی مشترک ترم‌ها برای همه سناریوها
async function driveTerm(bots, code, opts = {}) {
  const spyInfo = opts.spyInfo || null; // {id} از دیتابیس
  for (const b of bots) {
    if (b.over || !b.connected) continue;
    const alive = aliveOf(b);
    if (b.phase === 'day' && b.sub === 'floor' && b.askerId === b.me.id && !b.question && alive.length) {
      await emitP(b.socket, 'game:ask', { targetId: randOf(alive).id, text: 'آیا انتخاب مورد علاقه‌ات طبیعت است؟' });
      continue;
    }
    if (b.phase === 'day' && b.sub === 'answer' && b.targetId === b.me.id && b.question && b.answer === undefined) {
      await emitP(b.socket, 'game:answer', { text: 'بله برایم جالب است.' });
      continue;
    }
    if (b.phase === 'day' && b.sub === 'challenge' && b.targetId === b.me.id && alive.length) {
      await emitP(b.socket, 'game:challenge', { targetId: randOf(alive).id });
      continue;
    }
    // رأی: اگر spyInfo داریم همه به جاسوس رأی می‌دهند؛ وگرنه به اولین زندهٔ دیگر
    if (b.phase === 'vote' && b.myVote === null && alive.length) {
      let target = null;
      if (spyInfo && b.candidates.includes(spyInfo.id) && spyInfo.id !== b.me.id) target = spyInfo.id;
      else target = b.candidates.find((id) => id !== b.me.id);
      if (target) await emitP(b.socket, 'vote:cast', { targetId: target });
      continue;
    }
    // شب: جاسوس یک هدف می‌گیرد
    if (b.phase === 'night' && b.nightIsSpy && b.nightPicksMine === null && alive.length) {
      const r = await emitP(b.socket, 'night:pick', { targetId: randOf(alive).id });
      if (r.ok) b.nightPicksMine = true;
      continue;
    }
    // شات: جاسوسِ حذف‌شده در سناریو ۶+ به اولین زنده شات می‌زند (یا اگر گفته باشد رد می‌شود)
    if (b.phase === 'shot' && b.shotStart && b.shotStart.mine && !b.shotPicked && !b.shotSkipped && alive.length) {
      if (opts.shotSkip) {
        await emitP(b.socket, 'game:shotSkip', {});
        b.shotSkipped = true;
      } else {
        const r = await emitP(b.socket, 'game:shot', { targetId: alive[0].id });
        if (r.ok) b.shotPicked = true;
      }
      continue;
    }
    // حدسِ بعد از رأی: عمداً اشتباه (برای تست مسیر afterCaught)
    if (b.phase === 'guess' && b.guessPrompt && !b.guessSent && opts.guessWrong !== false) {
      await emitP(b.socket, 'game:guess', { word: 'قورباغه' });
      b.guessSent = true;
      continue;
    }
  }
}

async function waitFor(bots, pred, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (pred(bots)) return true;
    await sleep(150);
  }
  return pred(bots);
}

async function createAndFillRoom(host, others, slots, isTest) {
  const cr = await emitP(host.socket, 'room:create', { slots, fee: 0, test: !!isTest });
  if (!cr.ok) throw new Error('create failed: ' + JSON.stringify(cr));
  for (const b of others) {
    const r = await emitP(b.socket, 'room:join', { code: cr.code });
    if (!r.ok) throw new Error('join failed: ' + JSON.stringify(r));
  }
  for (const b of [host, ...others]) await emitP(b.socket, 'room:ready', { ready: true });
  const st = await emitP(host.socket, 'room:start', {});
  if (!st.ok) throw new Error('start failed: ' + JSON.stringify(st));
  await waitFor([host, ...others], (r) => r.every ? r.every((b) => !!b.me) : true, 8000);
  return cr.code;
}

async function main() {
  console.log('── SPY تست نسخه ۱.۱ (شات/حدس دقیق/اعلام/آزمایشی ۲ نفره) ──');
  const health = await (await fetch(BASE + '/api/health')).json();
  check('health endpoint', health && health.ok === true);

  // ── سناریو A: اتاق آزمایشی ۲ نفره + اعلام اشتباه جاسوس ──
  {
    const [b0, b1] = [makeBot((await register(`${TAG}-A0`)).token), makeBot((await register(`${TAG}-A1`)).token)];
    await sleep(500);
    const coinsBefore = (await meOf(b0.token)).player.coins;
    const freeBefore = (await meOf(b0.token)).player.freeEntries;
    const code = await createAndFillRoom(b0, [b1], 2, true);
    check('A: 2-player test room started', !!b0.me && !!b1.me);
    await waitFor([b0, b1], () => b0.phase === 'day' && b1.phase === 'day', 10000);
    check('A: day phase reached', b0.phase === 'day');
    const me = await meOf(b0.token);
    check('A: test room consumed NO coins/free entries', me.player.coins === coinsBefore && me.player.freeEntries === freeBefore, `coins=${me.player.coins} free=${me.player.freeEntries}`);
    const peek = peekRoom(code);
    check('A: room persisted as test', peek && peek.game && peek.game.startCount === 2);
    // اعلام اشتباه در اولین ترم توسط جاسوس
    const spyBot = b0.role === 'spy' ? b0 : b1;
    const civBot = spyBot === b0 ? b1 : b0;
    // امنیت: شهروند حق اعلام ندارد
    const decCiv = await emitP(civBot.socket, 'game:declare', { word: 'هرچه' });
    check('A: citizen declare rejected (not_spy)', decCiv.ok === false && decCiv.code === 'not_spy', decCiv.code);
    const decBad = await emitP(spyBot.socket, 'game:declare', { word: 'چیزی که مطمئناً کلمه نیست ۱۲۳' });
    check('A: spy wrong declare accepted', decBad.ok === true, JSON.stringify(decBad).slice(0, 80));
    await waitFor([b0, b1], () => b0.over && b1.over, 8000);
    check('A: wrong declare → citizens win', b0.winner === 'citizens' && b1.winner === 'citizens', b0.winner);
    check('A: declareResult correct=false received', b0.declareResult && b0.declareResult.correct === false);
    check('A: test flag in game over', b0.testFlag === true);
    check('A: zero rewards in test room', b0.over.rewards.every((r) => r.delta === 0));
    const me2 = await meOf(b0.token);
    check('A: coins unchanged after match', me2.player.coins === coinsBefore, `coins=${me2.player.coins}`);
    const spyElim = b0.over.order.find((e) => e.by === 'declare');
    check('A: elimination reason = declare', !!spyElim);
    b0.socket.disconnect(); b1.socket.disconnect();
  }

  // ── سناریو A2: اعلام درست با نوشتن دقیق کلمه (با فاصلهٔ اضافه و حروف عربی اگر بود) ──
  {
    const [b0, b1] = [makeBot((await register(`${TAG}-A2a`)).token), makeBot((await register(`${TAG}-A2b`)).token)];
    await sleep(400);
    const code = await createAndFillRoom(b0, [b1], 2, true);
    const peek = peekRoom(code);
    const realWord = peek && peek.game ? peek.game.word : null;
    check('A2: secret word readable from DB (test harness)', typeof realWord === 'string' && realWord.length > 1, realWord || '?');
    const spyBot = b0.role === 'spy' ? b0 : b1;
    await waitFor([b0, b1], () => b0.phase === 'day' && b1.phase === 'day', 10000);
    // کلمهٔ دقیق + فاصلهٔ ابتدایی (فقط فاصله‌های اضافی بخشیده می‌شود)
    const dec = await emitP(spyBot.socket, 'game:declare', { word: '  ' + realWord + '  ' });
    check('A2: exact-word declare accepted', dec.ok === true, JSON.stringify(dec).slice(0, 80));
    await waitFor([b0, b1], () => b0.over && b1.over, 8000);
    check('A2: correct declare → spies win (word_guessed)', b0.winner === 'spies' && b0.over.reason === 'word_guessed', `${b0.winner}/${b0.over.reason}`);
    check('A2: declareResult correct=true', b0.declareResult && b0.declareResult.correct === true);
    b0.socket.disconnect(); b1.socket.disconnect();
  }

  // ── سناریو B: ۶ نفره — شات بعد از رأی‌گیری ──
  {
    const bots = [];
    for (let i = 0; i < 6; i++) bots.push(makeBot((await register(`${TAG}-B${i}`)).token));
    await sleep(500);
    const code = await createAndFillRoom(bots[0], bots.slice(1), 6, true);
    const peek = peekRoom(code);
    const spyId = peek.game.players.find((x) => x.role === 'spy').id;
    check('B: 6-player match started (1 spy)', peek.game.players.filter((x) => x.role === 'spy').length === 1);
    // رانندگی حلقه‌ای تا پایان
    const t0 = Date.now();
    while (!bots.every((b) => b.over) && Date.now() - t0 < 150000) {
      await driveTerm(bots, code, { spyInfo: { id: spyId } });
      await sleep(220);
    }
    check('B: match finished', bots.every((b) => b.over), `${Math.round((Date.now() - t0) / 1000)}s`);
    const spyBot = bots.find((b) => b.me.id === spyId);
    check('B: shotStart received (6+ rule)', !!spyBot.shotStart && spyBot.shotStart.mine === true);
    check('B: others saw shotStart (not mine)', bots.filter((b) => b.me.id !== spyId).every((b) => b.shotStart && b.shotStart.mine === false));
    check('B: shotResult received (spy shot someone)', !!spyBot.shotResult && !!spyBot.shotResult.target);
    const shotOrder = bots[0].over.order.find((e) => e.by === 'shot');
    check('B: order includes shot elimination', !!shotOrder && shotOrder.id === spyBot.shotResult.target.id);
    check('B: guess phase came after shot', !!spyBot.guessPrompt || spyBot.guessResult != null);
    check('B: wrong guess → citizens win', bots.every((b) => b.winner === 'citizens'), bots[0].winner);
    check('B: spy voted out first (vote elimination)', bots[0].over.order[0].id === spyId && bots[0].over.order[0].by === 'vote');
    bots.forEach((b) => b.socket.disconnect());
  }

  // ── سناریو B2: ۶ نفره با رد شات (timeout مسیر شات) — کوتاه: فقط ساختار زمانی ──
  {
    const bots = [];
    for (let i = 0; i < 6; i++) bots.push(makeBot((await register(`${TAG}-B2x${i}`)).token));
    await sleep(400);
    const code = await createAndFillRoom(bots[0], bots.slice(1), 6, true);
    const peek = peekRoom(code);
    const spyId = peek.game.players.find((x) => x.role === 'spy').id;
    const t0 = Date.now();
    while (!bots.every((b) => b.over) && Date.now() - t0 < 150000) {
      await driveTerm(bots, code, { spyInfo: { id: spyId }, shotSkip: true });
      await sleep(220);
    }
    const spyBot = bots.find((b) => b.me.id === spyId);
    check('B2: shot skipped → still guess phase then over', bots.every((b) => b.over) && !!spyBot.shotStart, `${bots[0].winner}`);
    check('B2: no shotResult when skipped', !spyBot.shotResult);
    bots.forEach((b) => b.socket.disconnect());
  }

  // ── سناریو C: ۴ نفره — بدون شات (سناریوی زیر ۶ نفر) ──
  {
    const bots = [];
    for (let i = 0; i < 4; i++) bots.push(makeBot((await register(`${TAG}-C${i}`)).token));
    await sleep(400);
    const code = await createAndFillRoom(bots[0], bots.slice(1), 4, true);
    // امنیت ویس: ورود دو بازیکن و رلهٔ سیگنال داخل اتاق آزمایشی
    const rj0 = await emitP(bots[0].socket, 'voice:join', {});
    const rj1 = await emitP(bots[1].socket, 'voice:join', {});
    check('C: voice join (2nd sees 1st as peer)', rj0.ok && rj1.ok && rj1.peers.length === 1 && rj1.peers[0] === bots[0].me.id);
    let sig = null;
    bots[0].socket.on('voice:signal', (d) => { sig = d; });
    const sr = await emitP(bots[1].socket, 'voice:signal', { to: bots[0].me.id, data: { desc: { type: 'offer', sdp: 'v=0-test' } } });
    check('C: voice signal relayed in test room', sr.ok && sig && sig.from === bots[1].me.id && sig.data.desc.type === 'offer');
    await emitP(bots[1].socket, 'voice:leave', {});
    const peek = peekRoom(code);
    const spyId = peek.game.players.find((x) => x.role === 'spy').id;
    const spyBot0 = bots.find((b) => b.me.id === spyId);
    // امنیت: شات توسط شهروند در فاز روز رد می‌شود
    const civBot0 = bots.find((b) => b.me.id !== spyId);
    const shotCiv = await emitP(civBot0.socket, 'game:shot', { targetId: spyId });
    check('C: citizen shot rejected', shotCiv.ok === false, shotCiv.code);
    const t0 = Date.now();
    while (!bots.every((b) => b.over) && Date.now() - t0 < 120000) {
      await driveTerm(bots, code, { spyInfo: { id: spyId } });
      await sleep(220);
    }
    check('C: match finished (4 players)', bots.every((b) => b.over), `${Math.round((Date.now() - t0) / 1000)}s`);
    check('C: NO shot phase below 6 players', !spyBot0.shotStart && bots.every((b) => !b.shotStart));
    check('C: caught spy went straight to guess', !!spyBot0.guessPrompt || spyBot0.guessResult != null);
    check('C: wrong guess → citizens win', bots.every((b) => b.winner === 'citizens'), bots[0].winner);
    bots.forEach((b) => b.socket.disconnect());
  }

  console.log('──────────────────────');
  console.log(`PASS: ${pass}  FAIL: ${fail}`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('SIM CRASH:', e);
  process.exit(1);
});
