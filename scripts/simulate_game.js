// ─── شبیه‌سازی کامل بازی چندنفره SPY ───
// ۸ ربات: لابی → آماده → شروع → ترم‌ها (سؤال/پاسخ/چالش/استیکر) → رأی → شب → پایان + تست امنیت و دوز
// اجرا: node scripts/simulate_game.js   (سرور باید روی localhost:3003 باشد)
const { io } = require('socket.io-client');

const BASE = process.env.SPY_URL || 'http://localhost:3003';
const WS_PATH = '/spy-ws';
const TAG = 'ب' + Math.floor(Math.random() * 9000);

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

function emitP(socket, ev, data) {
  return new Promise((resolve) => {
    socket.emit(ev, data, (res) => resolve(res || { ok: true }));
    setTimeout(() => resolve({ ok: false, code: 'ack_timeout' }), 6000);
  });
}

function waitForEvent(socket, ev, ms = 4000) {
  return new Promise((resolve) => {
    const h = (d) => {
      socket.off(ev, h);
      resolve(d);
    };
    socket.on(ev, h);
    setTimeout(() => {
      socket.off(ev, h);
      resolve(null);
    }, ms);
  });
}

function attachBot(socket, bot) {
  socket.on('connect', () => { bot.connected = true; });
  socket.on('disconnect', () => { bot.connected = false; });
  socket.on('connect_error', (e) => bot.errors.push('connect:' + String(e && e.message)));
  socket.on('err', (e) => bot.errors.push(e.code));
  socket.onAny((ev, data) => {
    if (ev === 'game:over') bot.overAt = bot.payloads.length;
    if (ev !== 'game:presence') bot.payloads.push({ ev, data: JSON.stringify(data || {}) });
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
    bot.question = null; bot.answer = null; bot.stickerSent = false; bot.term = d.term; bot.termsTotal = d.termsTotal;
  });
  socket.on('game:question', (d) => { bot.sub = 'answer'; bot.question = d.text; bot.askerId = d.from; bot.targetId = d.to; });
  socket.on('game:answer', (d) => { bot.answer = d.text || null; });
  socket.on('game:challenge', (d) => { bot.sub = 'challenge'; });
  socket.on('game:note', () => {});
  socket.on('game:termEnd', () => {});
  socket.on('game:vote', (d) => { bot.phase = 'vote'; bot.revote = false; bot.candidates = d.candidates.map((c) => c.id); bot.myVote = null; bot.voteTotal = d.total; bot.voteResult = null; });
  socket.on('game:revote', (d) => { bot.phase = 'vote'; bot.revote = true; bot.candidates = d.candidates.map((c) => c.id); bot.myVote = null; });
  socket.on('vote:ok', (d) => { bot.myVote = d.targetId; });
  socket.on('game:voteResult', (d) => { bot.voteResult = d; });
  socket.on('game:eliminated', (d) => {
    const p = bot.players.find((x) => x.id === d.player.id);
    if (p) p.alive = false;
  });
  socket.on('game:guessStart', (d) => { bot.phase = 'guess'; bot.guessSpy = d.spy; bot.guessSent = false; });
  socket.on('game:guessPrompt', (d) => { bot.guessPrompt = d; bot.guessSent = false; });
  socket.on('game:guessResult', (d) => { bot.guessResult = d; bot.guessPrompt = null; });
  socket.on('game:night', (d) => { bot.phase = 'night'; bot.nightIsSpy = !!d.isSpy; bot.candidates = (d.candidates || []).map((c) => c.id); bot.nightPicksMine = null; bot.voteResult = null; });
  socket.on('game:nightProgress', () => {});
  socket.on('game:dawn', (d) => {
    const p = bot.players.find((x) => x.id === d.eliminated.id);
    if (p) p.alive = false;
    bot.dawn = d;
  });
  socket.on('game:daybreak', () => {});
  socket.on('game:sticker', () => { bot.stickersSeen++; });
  socket.on('game:presence', () => {});
  socket.on('game:resume', (d) => { bot.resumed++; bot.resumeState = d; });
  socket.on('game:over', (d) => { bot.over = d; bot.phase = 'over'; bot.realWord = d.word; bot.winner = d.winner; });
  socket.on('me:update', (d) => { bot.coins = d.coins; bot.coinLog.push(d.coins); });
  return socket;
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
    term: 0, termsTotal: 0,
    candidates: [], myVote: null, voteTotal: 0, voteResult: null,
    nightIsSpy: false, nightPicksMine: null, dawn: null,
    guessPrompt: null, guessSent: false,
    stickerSent: false, stickersSeen: 0,
    over: null, realWord: null, winner: null, resumed: 0,
    coins: null, coinLog: [],
    payloads: [], overAt: null, errors: [],
    guessSpy: null,
  };
  attachBot(socket, bot);
  return bot;
}

function aliveOf(bot) {
  return bot.players.filter((p) => p.alive && p.id !== bot.me.id);
}
function randOf(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function main() {
  console.log('── SPY شبیه‌سازی بازی جاسوس ──');
  // ۰) سلامت سرور
  const health = await (await fetch(BASE + '/api/health')).json();
  check('health endpoint', health && health.ok === true, JSON.stringify(health).slice(0, 80));

  // ۱) ثبت‌نام ۸ بازیکن
  const bots = [];
  for (let i = 0; i < 8; i++) {
    const reg = await register(`${TAG}-${i + 1}`);
    check(`register player ${i + 1}`, reg.ok === true && reg.player && reg.player.coins === 60 && reg.player.freeEntries === 4);
    bots.push(makeBot(reg.token));
    bots[i].reg = reg;
  }
  await sleep(600);

  // ۲) ساخت لابی توسط ربات ۰
  const cr = await emitP(bots[0].socket, 'room:create', { slots: 8, fee: 0 });
  check('create lobby', cr.ok === true && /^[A-Z0-9]{6}$/.test(cr.code || ''), 'code=' + cr.code);
  const code = cr.code;
  bots[0].socket.on('room:state', () => {});

  // ۳) اطلاعات لابی قبل از ورود
  const info = await emitP(bots[1].socket, 'room:info', { code });
  check('room info', info.ok === true && info.info && info.info.exists && info.info.cost === 0, 'cost=0 (free entry)');

  // ۴) ورود بقیه
  for (let i = 1; i < 8; i++) {
    const r = await emitP(bots[i].socket, 'room:join', { code });
    check(`join lobby p${i + 1}`, r.ok === true, r.msg || '');
  }
  const dup = await emitP(bots[7].socket, 'room:join', { code });
  // ورود دوباره = اتصال مجدد (عضو قبلی) — نباید خطا بدهد
  check('duplicate join treated as rejoin', dup.ok === true || dup.code === 'started');

  // ۵) آماده و شروع
  for (let i = 1; i < 8; i++) await emitP(bots[i].socket, 'room:ready', { ready: true });
  const notHost = await emitP(bots[1].socket, 'room:start', {});
  check('non-host cannot start', notHost.ok === false && notHost.code === 'not_host');
  const st = await emitP(bots[0].socket, 'room:start', {});
  check('host starts game', st.ok === true, st.msg || '');

  // ۶) انتظار برای game:init همه
  const t0 = Date.now();
  while (Date.now() - t0 < 15000 && bots.some((b) => !b.me)) await sleep(200);
  check('all bots received game:init', bots.every((b) => !!b.me));

  // ۷) بررسی نقش‌ها و کلمه
  const spyCount = bots.filter((b) => b.role === 'spy').length;
  check('spy count for 8 players = 1', spyCount === 1, `got ${spyCount}`);
  const citizens = bots.filter((b) => b.role === 'citizen');
  const spies = bots.filter((b) => b.role === 'spy');
  check('citizens received secret word', citizens.every((b) => typeof b.word === 'string' && b.word.length > 1));
  check('spy did NOT receive word', spies.every((b) => b.word == null));
  check('spy knows category only', spies.every((b) => typeof b.category === 'string'));
  const words = new Set(citizens.map((b) => b.word));
  check('all citizens share same word', words.size === 1, [...words].join(','));

  // ۸) رانندگی بازی تا پایان + تست‌های امنیتی حین بازی
  const security = { notAskTried: false, notAskErr: false, selfVoteErr: false, dupeStickerErr: false, notSpyNightErr: false, citizenPickTries: 0 };
  // تست امنیت نقش شب: بلافاصله پس از رسیدن game:night، یک شهروند تلاش می‌کند هدف انتخاب کند
  bots[1].socket.on('game:night', () => {
    if (bots[1].nightIsSpy || security.citizenPickTries > 0) return;
    security.citizenPickTries++;
    const aliveN = bots[1].players.filter((q) => q.alive && q.id !== bots[1].me.id);
    if (!aliveN.length) return;
    emitP(bots[1].socket, 'night:pick', { targetId: aliveN[0].id }).then((r) => {
      if (r.ok === false && r.code === 'not_spy') security.notSpyNightErr = true;
      else if (r.ok === false && r.code === 'rate') security.citizenPickTries = 0;
    });
  });
  const done = () => bots.every((b) => b.over);
  const startT = Date.now();
  let rejoinTested = false;
  let disconnectedBot = null;
  while (!done() && Date.now() - startT < 240000) {
    for (const b of bots) {
      if (b.over) continue;
      if (!b.connected) continue;
      const alive = aliveOf(b);
      // پرسش
      if (b.phase === 'day' && b.sub === 'floor' && b.askerId === b.me.id && !b.question && alive.length) {
        const target = randOf(alive);
        await emitP(b.socket, 'game:ask', { targetId: target.id, text: 'آیا انتخاب مورد علاقه‌ات طبیعت است؟' });
        // تست امنیت: پرسش توسط غیرپرسشگر (یک بازیکن زنده دیگر)
        if (!security.notAskTried) {
          security.notAskTried = true;
          const other = bots.find(
            (x) => x.me && x.me.id !== b.me.id && x.connected && (x.players.find((q) => q.id === x.me.id) || {}).alive
          );
          if (other) {
            const r = await emitP(other.socket, 'game:ask', { targetId: b.me.id, text: 'هک؟' });
            if (r.ok === false && (r.code === 'not_asker' || r.code === 'phase')) security.notAskErr = true;
          }
        }
        continue;
      }
      // پاسخ
      if (b.phase === 'day' && b.sub === 'answer' && b.targetId === b.me.id && b.question && b.answer === undefined) {
        await emitP(b.socket, 'game:answer', { text: 'بله برایم جالب است.' });
        continue;
      }
      if (b.phase === 'day' && b.sub === 'answer' && b.targetId === b.me.id && b.question && b.answer === null) {
        // پاسخ داده نشده (برادر پاسخ timeout)
        await emitP(b.socket, 'game:answer', { text: 'نمی‌دانم.' });
        continue;
      }
      // چالش
      if (b.phase === 'day' && b.sub === 'challenge' && b.targetId === b.me.id && alive.length) {
        await emitP(b.socket, 'game:challenge', { targetId: randOf(alive).id });
        continue;
      }
      // استیکر (ترم ۱) + تست استیکر دوم
      if (b.phase === 'day' && b.term === 1 && !b.stickerSent && b.stickersSeen === 0) {
        const r1 = await emitP(b.socket, 'game:sticker', { id: 's03' });
        if (r1.ok) b.stickerSent = true;
        const r2 = await emitP(b.socket, 'game:sticker', { id: 's04' });
        if (r2.ok === false && r2.code === 'dupe') security.dupeStickerErr = true;
        continue;
      }
      // رأی: اول رأی به خود (باید رد شود) بعد رأی معتبر
      if (b.phase === 'vote' && b.candidates.length && b.myVote === null && !b.voteResult) {
        const selfRes = await emitP(b.socket, 'vote:cast', { targetId: b.me.id });
        if (selfRes.ok === false && selfRes.code === 'self_vote') security.selfVoteErr = true;
        const target = randOf(b.candidates.filter((id) => id !== b.me.id));
        await emitP(b.socket, 'vote:cast', { targetId: target });
        continue;
      }
      // شب: شهروند نباید بتواند انتخاب کند
      if (b.phase === 'night') {
        if (!b.nightIsSpy && !security.citizenPickNightTried) {
          security.citizenPickNightTried = true;
          const r = await emitP(b.socket, 'night:pick', { targetId: randOf(alive).id });
          if (r.ok === false && r.code === 'not_spy') security.notSpyNightErr = true;
        }
        if (!b.nightIsSpy && security.citizenPickTries < 4 && alive.length) {
          security.citizenPickTries++;
          const r = await emitP(b.socket, 'night:pick', { targetId: randOf(alive).id });
          if (r.ok === false && r.code === 'not_spy') security.notSpyNightErr = true;
          if (r.ok === false && r.code === 'rate') security.citizenPickTries--;
        }
        if (b.nightIsSpy && b.nightPicksMine === null && alive.length) {
          const r = await emitP(b.socket, 'night:pick', { targetId: randOf(alive).id });
          if (r.ok) b.nightPicksMine = true;
        }
        continue;
      }
      // حدس کلمه جاسوس (عمداً اشتباه)
      if (b.phase === 'guess' && b.guessPrompt && !b.guessSent) {
        await emitP(b.socket, 'game:guess', { word: 'قورباغه' });
        b.guessSent = true;
        continue;
      }
      // تست اتصال مجدد: ربات ۳ بعد از ترم ۲ قطع و وصل می‌شود
      if (!rejoinTested && b === bots[3] && b.term >= 2 && b.phase === 'day') {
        rejoinTested = true;
        disconnectedBot = b;
        b.socket.disconnect();
        await sleep(1200);
        const s2 = io(BASE, { path: WS_PATH, transports: ['websocket', 'polling'], auth: { token: b.token }, reconnection: false });
        attachBot(s2, b); // رویدادها دوباره به همان state وصل می‌شوند
        b.socket = s2;
        b.connected = false;
        s2.on('connect', async () => {
          await sleep(100);
          await emitP(s2, 'room:rejoin', { code });
        });
        const t2 = Date.now();
        while (Date.now() - t2 < 8000 && b.resumed === 0) await sleep(150);
      }
    }
    await sleep(220);
  }

  check('match finished (all bots have game:over)', done(), `${Math.round((Date.now() - startT) / 1000)}s`);
  if (done()) {
    check('winner is valid', bots.every((b) => b.winner === 'citizens' || b.winner === 'spies'), bots[0].winner);
    check('secret word revealed at end', typeof bots[0].realWord === 'string' && bots[0].realWord.length > 1, bots[0].realWord);
    check('same word for everyone at end', new Set(bots.map((b) => b.realWord)).size === 1);
    // امنیت: جاسوس هرگز کلمه را قبل از پایان دریافت نکرده است
    let leak = false;
    for (const spy of spies) {
      const upto = spy.overAt == null ? spy.payloads.length : spy.overAt;
      const w = spy.realWord;
      for (let i = 0; i < upto; i++) {
        const p = spy.payloads[i];
        if (p.ev === 'game:guessPrompt') continue;
        if (w && p.data && p.data.includes && p.data.includes(w)) {
          leak = true;
          console.log('   leak in event:', p.ev, p.data.slice(0, 120));
        }
      }
    }
    check('no word leak to spy before game over', !leak);
    // جوایز
    const winnersAreSpies = bots[0].winner === 'spies';
    const correctRewards = bots.every((b) => {
      const expected = (b.role === 'spy') === winnersAreSpies ? 60 + 50 : 60 + 10;
      return b.coins === expected;
    });
    check('rewards applied correctly (+50 win / +10 lose)', correctRewards, bots.map((b) => `${b.role}:${b.coins}`).join(' '));
  }
  check('reconnect mid-game restored state', disconnectedBot && disconnectedBot.resumed >= 1, `resumed=${disconnectedBot ? disconnectedBot.resumed : 'n/a'}`);

  // نتیجه امنیت
  check('non-asker cannot ask', security.notAskErr);
  check('self-vote rejected', security.selfVoteErr);
  check('second sticker in same term rejected', security.dupeStickerErr);
  check('citizen cannot act at night', security.notSpyNightErr);

  // تاریخچه
  const hist = await (await fetch(BASE + '/api/history', { headers: { Authorization: 'Bearer ' + bots[0].token } })).json();
  check('match history recorded', hist.ok && hist.history.length >= 1, `rows=${hist.history.length}`);

  // ۸.۵) ویس: سیگنالینگ WebRTC داخل اتاق
  const b0id = bots[0].me.id, b1id = bots[1].me.id, b2id = bots[2].me.id;
  const r1 = await emitP(bots[0].socket, 'voice:join', {});
  check('voice join self (no peers yet)', r1.ok && r1.peers.length === 0);
  const vj1Ev = waitForEvent(bots[0].socket, 'voice:joined');
  const r2 = await emitP(bots[1].socket, 'voice:join', {});
  check('voice join second sees first as peer', r2.ok && r2.peers.length === 1 && r2.peers[0] === b0id, JSON.stringify(r2));
  const vj1 = await vj1Ev;
  check('voice:joined broadcast to room', vj1 && vj1.id === b1id, JSON.stringify(vj1));
  const sigEv = waitForEvent(bots[0].socket, 'voice:signal');
  const sr = await emitP(bots[1].socket, 'voice:signal', { to: b0id, data: { desc: { type: 'offer', sdp: 'v=0-fake-test' } } });
  const sig = await sigEv;
  check('voice signal relayed to target', sr.ok && sig && sig.from === b1id && sig.data && sig.data.desc && sig.data.desc.type === 'offer');
  const sigBad = await emitP(bots[1].socket, 'voice:signal', { to: b2id, data: { desc: { type: 'offer', sdp: 'x' } } }); // bots[2] در گفتگو نیست
  check('voice signal to non-voice member rejected', sigBad.ok === false && sigBad.code === 'no_peer', sigBad.code);
  const vlEv = waitForEvent(bots[0].socket, 'voice:left');
  await emitP(bots[1].socket, 'voice:leave', {});
  const vl = await vlEv;
  check('voice:left broadcast on leave', vl && vl.id === b1id);

  // ۹) تست ورود لابی با هزینه (پس از مصرف یک ورود رایگان)
  const freeLeft = bots[0].reg.player.freeEntries - 1; // یکی برای ساخت لابی مصرف شد
  const cr2 = await emitP(bots[0].socket, 'room:create', { slots: 8, fee: 25 });
  check('second lobby created (fee 25)', cr2.ok === true, 'code=' + cr2.code);
  const info2 = await emitP(bots[1].socket, 'room:info', { code: cr2.code });
  check('info shows fee when free entries exhausted', info2.ok && info2.info.cost === (freeLeft > 0 ? 0 : 25), `freeLeft=${freeLeft} cost=${info2.info && info2.info.cost}`);
  bots[0].socket.emit('room:leave', {});

  // ۱۰) دوز مقابل هوش مصنوعی + سقف پاداش
  const aiBot = bots[6];
  const prefs = [4, 0, 8, 2, 6, 1, 3, 5, 7];
  let aiWins = 0;
  let rewardsPaid = [];
  let guard = 0;
  while (aiWins < 5 && guard < 60) {
    guard++;
    const s = await emitP(aiBot.socket, 'ttt:ai', { difficulty: 'easy' });
    if (!s.ok) { console.log('   ai start failed:', s.code, s.msg); await sleep(1200); continue; }
    let done2 = false;
    let myMoves = 0;
    while (!done2 && myMoves < 6) {
      const idx = prefs.find((i) => s.board[i] == null);
      if (idx === undefined) break;
      const r = await emitP(aiBot.socket, 'ttt:ai_move', { index: idx });
      if (!r.ok) break;
      s.board = r.board;
      myMoves++;
      if (r.result) {
        done2 = true;
        if (r.result === 'win') {
          aiWins++;
          rewardsPaid.push(r.reward);
        }
      }
    }
    if (!done2) await emitP(aiBot.socket, 'ttt:ai_restart', {});
    await sleep(350);
  }
  check('AI tic-tac-toe wins recorded', aiWins >= 5, `wins=${aiWins} in ${guard} games`);
  const paidCount = rewardsPaid.filter((x) => x > 0).length;
  check('daily reward cap enforced (max 3 paid wins)', paidCount === 3, `paid=${paidCount}/${rewardsPaid.length}`);

  // ۱۱) دوز آنلاین دو‌نفره
  const [pa, pb] = [bots[4], bots[5]];
  let pvpA = null;
  let pvpB = null;
  pa.socket.on('ttt:pvp_start', (d) => { pvpA = d; });
  pb.socket.on('ttt:pvp_start', (d) => { pvpB = d; });
  const qa = emitP(pa.socket, 'ttt:pvp_queue', {});
  const qb = emitP(pb.socket, 'ttt:pvp_queue', {});
  await Promise.all([qa, qb]);
  // منتظر matched
  const t3 = Date.now();
  while (Date.now() - t3 < 8000 && !(pvpA && pvpB)) await sleep(150);
  check('pvp matched', !!(pvpA && pvpB) && pvpA.symbol !== pvpB.symbol, `${pvpA ? pvpA.symbol : '?'} vs ${pvpB ? pvpB.symbol : '?'}`);
  if (pvpA && pvpB) {
    const xBot = pvpA.symbol === 'X' ? pa : pb;
    const oBot = pvpA.symbol === 'X' ? pb : pa;
    const script = [
      [xBot, 0], [oBot, 4], [xBot, 1], [oBot, 3], [xBot, 2],
    ];
    let resultX = null;
    xBot.socket.on('ttt:pvp_state', (d) => { if (d.result) resultX = d.result; });
    let resultO = null;
    oBot.socket.on('ttt:pvp_state', (d) => { if (d.result) resultO = d.result; });
    for (const [b, idx] of script) {
      await emitP(b.socket, 'ttt:pvp_move', { index: idx });
      await sleep(150);
    }
    const t4 = Date.now();
    while (Date.now() - t4 < 5000 && resultX == null) await sleep(150);
    check('pvp X win detected', resultX === 'win' && resultO === 'loss', `X:${resultX} O:${resultO}`);
  }

  // خلاصه
  console.log('──────────────────────');
  console.log(`PASS: ${pass}  FAIL: ${fail}`);
  if (fail > 0) process.exit(1);
  process.exit(0);
}

main().catch((e) => {
  console.error('SIM CRASH:', e);
  process.exit(1);
});
