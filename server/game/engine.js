// ─── موتور بازی جاسوس ───
// چرخه کامل: توزیع نقش → ترم‌ها (سؤال/پاسخ/چالش ۱۵ ثانیه‌ای) → رأی‌گیری → شب → روز بعد → پایان
// همه وضعیت سمت سرور نگه داشته می‌شود؛ هیچ اطلاعات خصوصی (نقش/کلمه) به بازیکن اشتباه ارسال نمی‌شود.
module.exports = function createEngine(ctx) {
  const { cfg, db, util, emit, shop } = ctx;

  // ── ابزارهای داخلی ──
  const gPlayer = (g, id) => g.players.find((p) => p.id === id);
  const gNumber = (g, id) => {
    const p = gPlayer(g, id);
    return p ? p.number : null;
  };
  const pubBrief = (g, id) => {
    const p = gPlayer(g, id);
    return p ? { id: p.id, name: p.name, avatar: p.avatar, number: p.number, alive: p.alive } : null;
  };
  const pubFull = (p) => ({ id: p.id, name: p.name, avatar: p.avatar, number: p.number, role: p.role, alive: p.alive });
  const publicPlayers = (g) =>
    g.players.map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, number: p.number, alive: p.alive, connected: p.connected }));

  function schedule(room, key, ms, fn) {
    const g = room.game;
    if (g.timers[key]) clearTimeout(g.timers[key]);
    g.deadlines[key] = util.now() + ms;
    g.timers[key] = setTimeout(() => {
      delete g.timers[key];
      try {
        fn();
      } catch (e) {
        console.error('engine timer error', room.code, key, e);
      }
    }, ms);
  }

  function clearTimer(room, key) {
    const g = room.game;
    if (g.timers[key]) {
      clearTimeout(g.timers[key]);
      delete g.timers[key];
    }
  }

  function clearAllTimers(room) {
    const g = room.game;
    for (const k of Object.keys(g.timers || {})) clearTimeout(g.timers[k]);
    g.timers = {};
  }

  function activeDeadline(g) {
    if (g.phase === 'deal') return { key: 'deal', at: g.deadlines.deal };
    if (g.phase === 'day') {
      if (g.sub === 'floor') return { key: 'floor', at: g.deadlines.floor };
      if (g.sub === 'answer') return { key: 'answer', at: g.deadlines.answer };
      if (g.sub === 'challenge') return { key: 'challenge', at: g.deadlines.challenge };
    }
    if (g.phase === 'vote') return { key: 'vote', at: g.deadlines.vote };
    if (g.phase === 'shot') return { key: 'shot', at: g.deadlines.shot };
    if (g.phase === 'night') return { key: 'night', at: g.deadlines.night };
    if (g.phase === 'guess') return { key: 'guess', at: g.deadlines.guess };
    return null;
  }

  // ── شروع مسابقه ──
  function startMatch(room) {
    const n = room.players.length;
    const g = {};
    room.game = g;
    room.status = 'playing';
    g.phase = 'deal';
    g.dayNo = 1;
    g.startCount = n; // سناریو مسابقه — مبنای قانون شات (۶ نفره یا بالاتر)
    g.termsTotal = n + cfg.TERMS_EXTRA;
    g.termsUsed = 0;
    const { word, category } = ctx.words.pickWord();
    g.word = word;
    g.category = category;
    const ordered = util.shuffle(room.players);
    const spyIds = new Set(util.shuffle(ordered.map((p) => p.id)).slice(0, cfg.spyCount(n)));
    g.players = ordered.map((p, i) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      number: i + 1,
      alive: true,
      role: spyIds.has(p.id) ? 'spy' : 'citizen',
      connected: !!p.connected,
    }));
    g.votes = {};
    g.candidates = null;
    g.revote = false;
    g.nightPicks = {};
    g.guess = null;
    g.shot = null;
    g.stickers = {};
    g.log = [];
    g.eliminated = [];
    g.winner = null;
    g.reason = null;
    g.question = null;
    g.answer = null;
    g.askerId = null;
    g.targetId = null;
    g.sub = null;
    g.challenged = false;
    g.deadlines = {};
    g.timers = {};
    ctx.persistRoom(room);

    emit.toRoom(room, 'game:init', (me) => {
      const p = gPlayer(g, me.id);
      const isSpy = p.role === 'spy';
      const mates = isSpy
        ? g.players.filter((x) => x.role === 'spy' && x.id !== me.id).map((x) => x.number)
        : [];
      return {
        dayNo: 1,
        termsTotal: g.termsTotal,
        players: publicPlayers(g),
        me: { id: p.id, number: p.number, role: p.role, word: isSpy ? null : g.word, category: g.category, mates },
        sfx: 'start',
        music: 'start',
      };
    });
    schedule(room, 'deal', cfg.DEAL_MS, () => dayStart(room));
  }

  // ── بازیابی پس از ری‌استارت سرور ──
  function resume(room) {
    const g = room.game;
    if (!g || g.phase === 'over') return;
    const t = util.now();
    const rem = (key) => Math.max(80, (g.deadlines[key] || 0) - t);
    if (g.phase === 'deal') return schedule(room, 'deal', rem('deal'), () => dayStart(room));
    if (g.phase === 'day') {
      if (g.sub === 'floor') return schedule(room, 'floor', rem('floor'), () => floorTimeout(room));
      if (g.sub === 'answer') return schedule(room, 'answer', rem('answer'), () => answerTimeout(room));
      if (g.sub === 'challenge') return schedule(room, 'challenge', rem('challenge'), () => challengeTimeout(room));
      return dayStart(room);
    }
    if (g.phase === 'vote') return schedule(room, 'vote', rem('vote'), () => resolveVote(room));
    if (g.phase === 'shot') return schedule(room, 'shot', rem('shot'), () => shotTimeout(room));
    if (g.phase === 'night') return schedule(room, 'night', rem('night'), () => resolveNight(room));
    if (g.phase === 'guess') return schedule(room, 'guess', rem('guess'), () => guessTimeout(room));
  }

  // ── روز و ترم‌ها ──
  function dayStart(room, nextAskerId, nextTargetId) {
    const g = room.game;
    if (!g || g.phase === 'over') return;
    if (g.termsUsed >= g.termsTotal) return startVote(room);
    g.phase = 'day';
    g.stickers = {};
    g.question = null;
    g.answer = null;
    g.sub = 'floor';
    g.challenged = false;
    const alive = g.players.filter((p) => p.alive);
    let asker = nextAskerId ? gPlayer(g, nextAskerId) : null;
    if (!asker || !asker.alive) asker = util.pick(alive);
    let target = nextTargetId ? gPlayer(g, nextTargetId) : null;
    if (!target || !target.alive || target.id === asker.id) target = null;
    g.askerId = asker.id;
    g.targetId = target ? target.id : null;
    schedule(room, 'floor', cfg.ASK_MS, () => floorTimeout(room));
    emit.toRoom(room, 'game:term', () => ({
      dayNo: g.dayNo,
      term: g.termsUsed + 1,
      termsTotal: g.termsTotal,
      askerId: g.askerId,
      targetId: g.targetId,
      deadline: g.deadlines.floor,
      music: 'day',
    }));
  }

  function floorTimeout(room) {
    const g = room.game;
    if (!g || g.phase !== 'day' || g.sub !== 'floor') return;
    const asker = gPlayer(g, g.askerId);
    g.log.push({ t: 's', text: `پرسشگر (${asker ? asker.number : '?'}) سؤالی مطرح نکرد`, day: g.dayNo, term: g.termsUsed + 1 });
    emit.toRoom(room, 'game:note', () => ({ text: 'پرسشگر سؤالی مطرح نکرد؛ رفتیم ترم بعد.' }));
    termComplete(room, null);
  }

  function ask(room, player, data) {
    const g = room.game;
    if (!g || g.phase !== 'day' || g.sub !== 'floor') throw util.err('phase', 'الان مرحله پرسش نیست.');
    if (g.askerId !== player.id) throw util.err('not_asker', 'الان نوبت پرسشگری تو نیست.');
    if (g.question) throw util.err('phase', 'سؤال این ترم ثبت شده است.');
    const q = util.cleanText(data && data.text, 200);
    if (q.length < 2) throw util.err('bad_text', 'متن سؤال خیلی کوتاه است.');
    const target = gPlayer(g, data && data.targetId);
    if (!target || !target.alive) throw util.err('bad_target', 'این بازیکن در دسترس نیست.');
    if (target.id === player.id) throw util.err('bad_target', 'نمی‌توانی از خودت سؤال بپرسی.');
    g.targetId = target.id;
    g.question = q;
    g.sub = 'answer';
    schedule(room, 'answer', cfg.ANSWER_MS, () => answerTimeout(room));
    g.log.push({ t: 'q', from: gNumber(g, g.askerId), to: gNumber(g, g.targetId), text: q, day: g.dayNo, term: g.termsUsed + 1 });
    emit.toRoom(room, 'game:question', () => ({ from: g.askerId, to: g.targetId, text: q, deadline: g.deadlines.answer }));
  }

  function answer(room, player, data) {
    const g = room.game;
    if (!g || g.phase !== 'day' || g.sub !== 'answer') throw util.err('phase', 'الان مرحله پاسخ نیست.');
    if (g.targetId !== player.id) throw util.err('not_target', 'پاسخ‌دهنده این ترم تو نیستی.');
    if (g.answer) throw util.err('phase', 'پاسخ این ترم ثبت شده است.');
    const a = util.cleanText(data && data.text, 200);
    if (a.length < 1) throw util.err('bad_text', 'پاسخ خالی است.');
    g.answer = a;
    clearTimer(room, 'answer');
    g.log.push({ t: 'a', from: gNumber(g, player.id), text: a, day: g.dayNo, term: g.termsUsed + 1 });
    emit.toRoom(room, 'game:answer', () => ({ from: player.id, text: a, timeout: false }));
    startChallenge(room);
  }

  function answerTimeout(room) {
    const g = room.game;
    if (!g || g.phase !== 'day' || g.sub !== 'answer') return;
    g.answer = null;
    g.log.push({ t: 'a', from: gNumber(g, g.targetId), text: '(بدون پاسخ)', day: g.dayNo, term: g.termsUsed + 1 });
    emit.toRoom(room, 'game:answer', () => ({ from: g.targetId, text: null, timeout: true }));
    startChallenge(room);
  }

  // پاسخ‌دهنده ۱۵ ثانیه فرصت دارد شماره چالش بعدی را مشخص کند
  function startChallenge(room) {
    const g = room.game;
    g.sub = 'challenge';
    g.challenged = false;
    schedule(room, 'challenge', cfg.CHALLENGE_MS, () => challengeTimeout(room));
    emit.toRoom(room, 'game:challenge', () => ({
      challengerId: g.targetId,
      deadline: g.deadlines.challenge,
      seconds: Math.round(cfg.CHALLENGE_MS / 1000),
    }));
  }

  function challenge(room, player, data) {
    const g = room.game;
    if (!g || g.phase !== 'day' || g.sub !== 'challenge') throw util.err('phase', 'الان مرحله انتخاب چالش نیست.');
    if (g.targetId !== player.id) throw util.err('not_challenger', 'انتخاب چالش با پاسخ‌دهنده است.');
    if (g.challenged) throw util.err('phase', 'چالش این ترم انتخاب شده است.');
    const t = gPlayer(g, data && data.targetId);
    if (!t || !t.alive) throw util.err('bad_target', 'این بازیکن در دسترس نیست.');
    if (t.id === player.id) throw util.err('bad_target', 'نمی‌توانی خودت را چالش کنی.');
    g.challenged = true;
    clearTimer(room, 'challenge');
    termComplete(room, t.id);
  }

  function challengeTimeout(room) {
    const g = room.game;
    if (!g || g.phase !== 'day' || g.sub !== 'challenge' || g.challenged) return;
    g.challenged = true;
    const others = g.players.filter((p) => p.alive && p.id !== g.targetId);
    const t = others.length ? util.pick(others) : null;
    g.log.push({ t: 's', text: 'انتخاب چالش به‌صورت خودکار انجام شد', day: g.dayNo, term: g.termsUsed + 1 });
    emit.toRoom(room, 'game:note', () => ({ text: 'زمان انتخاب چالش تمام شد؛ سیستم خودکار انتخاب کرد.' }));
    termComplete(room, t ? t.id : null);
  }

  function termComplete(room, nextTargetId) {
    const g = room.game;
    g.termsUsed++;
    const challengerId = g.targetId; // پاسخ‌دهنده این ترم → پرسشگر ترم بعد
    emit.toRoom(room, 'game:termEnd', () => ({ used: g.termsUsed, total: g.termsTotal }));
    if (g.termsUsed >= g.termsTotal) return startVote(room);
    dayStart(room, challengerId, nextTargetId);
  }

  // ── استیکرها (تصویری، بی‌صدا، یکی در هر ترم) ──
  function sticker(room, player, data) {
    const g = room.game;
    if (!g || g.phase !== 'day') throw util.err('phase', 'استیکر فقط در مرحله سؤال و پاسخ کار می‌کند.');
    const me = gPlayer(g, player.id);
    if (!me || !me.alive) throw util.err('eliminated', 'بازیکن حذف‌شده نمی‌تواند استیکر بفرستد.');
    if (g.stickers[player.id]) throw util.err('dupe', 'در هر ترم فقط یک استیکر می‌توانی بفرستی.');
    const id = data && data.id;
    if (!shop.STICKERS.includes(id)) throw util.err('bad_sticker', 'استیکر نامعتبر است.');
    g.stickers[player.id] = 1;
    // هیچ صدایی برای استیکر پخش نمی‌شود
    emit.toRoom(room, 'game:sticker', () => ({
      from: { id: me.id, name: me.name, avatar: me.avatar, number: me.number },
      sticker: id,
    }));
  }

  // ── رأی‌گیری ──
  function startVote(room) {
    const g = room.game;
    clearAllTimers(room);
    g.phase = 'vote';
    g.sub = null;
    g.candidates = g.players.filter((p) => p.alive).map((p) => p.id);
    g.votes = {};
    g.revote = false;
    schedule(room, 'vote', cfg.VOTE_MS, () => resolveVote(room));
    emit.toRoom(room, 'game:vote', () => ({
      candidates: g.candidates.map((id) => pubBrief(g, id)),
      deadline: g.deadlines.vote,
      revote: false,
      count: 0,
      total: g.candidates.length,
      sfx: 'vote',
      music: 'vote',
    }));
  }

  function voteCast(room, player, data) {
    const g = room.game;
    if (!g || g.phase !== 'vote') throw util.err('phase', 'الان مرحله رأی‌گیری نیست.');
    const me = gPlayer(g, player.id);
    if (!me || !me.alive) throw util.err('eliminated', 'بازیکن حذف‌شده حق رأی ندارد.');
    const t = data && data.targetId;
    if (!g.candidates.includes(t)) throw util.err('bad_target', 'این بازیکن در فهرست رأی‌گیری نیست.');
    if (t === player.id) throw util.err('self_vote', 'رأی دادن به خودت مجاز نیست.');
    g.votes[player.id] = t; // رأی محرمانه است؛ تا پایان زمان قابل تغییر
    emit.toPlayer(player.id, 'vote:ok', { targetId: t });
    emit.toRoom(room, 'game:voteProgress', { count: Object.keys(g.votes).length, total: g.candidates.length });
    // اگر همه بازیکنان زنده رأی دادند، بدون انتظار برای تایمر تمام کن
    const aliveCount = g.players.filter((x) => x.alive).length;
    if (Object.keys(g.votes).length >= aliveCount) {
      clearTimer(room, 'vote');
      resolveVote(room);
    }
  }

  function resolveVote(room) {
    const g = room.game;
    const tally = {};
    for (const t of Object.values(g.votes)) tally[t] = (tally[t] || 0) + 1;
    const entries = Object.entries(tally);
    if (entries.length === 0) {
      emit.toRoom(room, 'game:voteResult', () => ({
        tally: {},
        eliminated: null,
        tieRandom: false,
        note: 'هیچ رأیی ثبت نشد؛ کسی حذف نشد.',
      }));
      return startNight(room);
    }
    const max = Math.max(...entries.map((e) => e[1]));
    const tied = entries.filter((e) => e[1] === max).map((e) => e[0]);
    if (tied.length > 1 && !g.revote) {
      // قانون تساوی: یک دور رأی‌گیری مجدد فقط بین متساوی‌ها
      g.revote = true;
      g.candidates = tied;
      g.votes = {};
      schedule(room, 'vote', cfg.REVOTE_MS, () => resolveVote(room));
      emit.toRoom(room, 'game:revote', () => ({
        candidates: tied.map((id) => pubBrief(g, id)),
        deadline: g.deadlines.vote,
        revote: true,
        count: 0,
        total: tied.length,
        note: 'تساوی! رأی‌گیری مجدد فقط بین این بازیکنان. اگر باز هم تساوی شود، قرعه کشیده می‌شود.',
      }));
      return;
    }
    let eliminatedId;
    if (tied.length > 1) {
      eliminatedId = util.pick(tied); // تساوی دوم: قرعه
    } else {
      eliminatedId = tied[0];
    }
    const elim = gPlayer(g, eliminatedId);
    emit.toRoom(room, 'game:voteResult', () => ({
      tally,
      eliminated: pubFull(elim),
      role: elim.role,
      tieRandom: tied.length > 1,
      note: tied.length > 1 ? 'بعد از تساوی، با قرعه این بازیکن حذف شد.' : null,
    }));
    applyElimination(room, elim, 'vote');
  }

  // ── حذف بازیکن + شرط‌های پایان ──
  function applyElimination(room, elim, by) {
    const g = room.game;
    elim.alive = false;
    g.eliminated.push({ id: elim.id, name: elim.name, avatar: elim.avatar, role: elim.role, by, day: g.dayNo });
    g.log.push({ t: 'e', text: `${elim.name} حذف شد`, who: elim.number, by, day: g.dayNo });
    emit.toRoom(room, 'game:eliminated', () => ({ player: pubFull(elim), role: elim.role, by, sfx: 'eliminate' }));
    emit.presence(room);
    ctx.persistRoom(room);
    // قانون شات: اگر جاسوس با رأی بازیکن‌ها حذف شده و سناریو ۶ نفره یا بالاتر بوده،
    // او فرصت دارد یک بازیکن دیگر را هم با خودش شات کند (اختیاری). بعد از آن فرصت حدس کلمه دارد.
    if (by === 'vote' && elim.role === 'spy') {
      if (g.startCount >= cfg.SHOT_MIN_PLAYERS && g.players.some((p) => p.alive)) return startShot(room, elim);
      return startGuess(room, elim);
    }
    return afterElimination(room, by);
  }

  // شرط‌های پایان پس از هر حذف (غیر از مسیر شات/حدس جاسوسِ حذف‌شده)
  function afterElimination(room, by) {
    const g = room.game;
    const spiesAlive = g.players.filter((p) => p.alive && p.role === 'spy').length;
    const citizensAlive = g.players.filter((p) => p.alive && p.role !== 'spy').length;
    if (spiesAlive === 0) return gameOver(room, 'citizens', 'all_spies_caught');
    if (spiesAlive >= citizensAlive) return gameOver(room, 'spies', 'parity');
    if (by === 'night') return newDay(room); // حذف شبانه
    return startNight(room);
  }

  // شرط‌های پایان پس از فرصت حدس جاسوسِ حذف‌شده (با رأی)
  function afterCaught(room) {
    const g = room.game;
    const spiesAlive = g.players.filter((p) => p.alive && p.role === 'spy').length;
    const citizensAlive = g.players.filter((p) => p.alive && p.role !== 'spy').length;
    if (spiesAlive === 0) return gameOver(room, 'citizens', 'all_spies_caught');
    if (spiesAlive >= citizensAlive) return gameOver(room, 'spies', 'parity');
    return startNight(room);
  }

  // ── فرصت شات جاسوس (فقط سناریو ۶ نفره یا بالاتر، بعد از رأی‌گیری) ──
  function startShot(room, spy) {
    const g = room.game;
    g.phase = 'shot';
    g.sub = null;
    g.shot = { spyId: spy.id, targetId: null, done: false };
    schedule(room, 'shot', cfg.SHOT_MS, () => shotTimeout(room));
    emit.toRoom(room, 'game:shotStart', (me) => ({
      spy: pubFull(spy),
      deadline: g.deadlines.shot,
      seconds: Math.round(cfg.SHOT_MS / 1000),
      mine: me.id === spy.id,
    }));
  }

  function shotPick(room, player, data) {
    const g = room.game;
    if (!g || g.phase !== 'shot' || !g.shot || g.shot.done) throw util.err('phase', 'الان مرحله شات نیست.');
    if (g.shot.spyId !== player.id) throw util.err('not_spy', 'شات فقط با جاسوسِ حذف‌شده است.');
    const t = gPlayer(g, data && data.targetId);
    if (!t || !t.alive) throw util.err('bad_target', 'این بازیکن در دسترس نیست.');
    g.shot.done = true;
    g.shot.targetId = t.id;
    clearTimer(room, 'shot');
    t.alive = false;
    g.eliminated.push({ id: t.id, name: t.name, avatar: t.avatar, role: t.role, by: 'shot', day: g.dayNo });
    g.log.push({ t: 'e', text: `${t.name} با شات جاسوس حذف شد`, who: t.number, by: 'shot', day: g.dayNo });
    emit.toRoom(room, 'game:shotResult', () => ({
      spy: pubFull(gPlayer(g, g.shot.spyId)),
      target: pubFull(t),
      role: t.role,
      sfx: 'eliminate',
    }));
    emit.toRoom(room, 'game:eliminated', () => ({ player: pubFull(t), role: t.role, by: 'shot', sfx: 'eliminate' }));
    emit.presence(room);
    ctx.persistRoom(room);
    startGuess(room, gPlayer(g, g.shot.spyId));
  }

  function shotSkip(room, player) {
    const g = room.game;
    if (!g || g.phase !== 'shot' || !g.shot || g.shot.done) throw util.err('phase', 'الان مرحله شات نیست.');
    if (g.shot.spyId !== player.id) throw util.err('not_spy', 'شات فقط با جاسوسِ حذف‌شده است.');
    g.shot.done = true;
    clearTimer(room, 'shot');
    emit.toRoom(room, 'game:note', () => ({ text: 'جاسوس از حق شات استفاده نکرد.' }));
    startGuess(room, gPlayer(g, g.shot.spyId));
  }

  function shotTimeout(room) {
    const g = room.game;
    if (!g || g.phase !== 'shot' || !g.shot || g.shot.done) return;
    g.shot.done = true;
    emit.toRoom(room, 'game:note', () => ({ text: 'فرصت شات تمام شد؛ شات استفاده نشد.' }));
    startGuess(room, gPlayer(g, g.shot.spyId));
  }

  // ── حدس کلمه توسط جاسوس حذف‌شده ──
  function startGuess(room, spy) {
    const g = room.game;
    g.phase = 'guess';
    g.guess = { spyId: spy.id, done: false, correct: false };
    schedule(room, 'guess', cfg.GUESS_MS, () => guessTimeout(room));
    emit.toRoom(room, 'game:guessStart', (me) => ({
      spy: pubFull(spy),
      deadline: g.deadlines.guess,
      mine: me.id === spy.id,
    }));
    emit.toPlayer(spy.id, 'game:guessPrompt', {
      deadline: g.deadlines.guess,
      seconds: Math.round(cfg.GUESS_MS / 1000),
    });
  }

  function guessWord(room, player, data) {
    const g = room.game;
    if (!g || g.phase !== 'guess' || !g.guess || g.guess.done) throw util.err('phase', 'الان مرحله حدس نیست.');
    if (g.guess.spyId !== player.id) throw util.err('not_spy', 'حدس کلمه فقط با جاسوس حذف‌شده است.');
    const guess = util.exactNorm(util.cleanText(data && data.word, 60));
    if (!guess) throw util.err('bad_text', 'حدس خالی است.');
    g.guess.done = true;
    clearTimer(room, 'guess');
    // مقایسهٔ کاملاً دقیق — بدون هیچ راهنمایی؛ حتی یک حرف اشتباه یعنی حدس اشتباه
    if (guess === util.exactNorm(g.word)) {
      g.guess.correct = true;
      emit.toRoom(room, 'game:guessResult', () => ({ correct: true, spyId: player.id, sfx: 'eliminate' }));
      return gameOver(room, 'spies', 'word_guessed');
    }
    emit.toRoom(room, 'game:guessResult', () => ({ correct: false, spyId: player.id }));
    return afterCaught(room);
  }

  function guessTimeout(room) {
    const g = room.game;
    if (!g || !g.guess || g.guess.done) return;
    g.guess.done = true;
    emit.toRoom(room, 'game:guessResult', () => ({ correct: false, spyId: g.guess.spyId, timeout: true }));
    return afterCaught(room);
  }

  // ── اعلام پایان بازی توسط جاسوس زنده (در ترم/روز خودش): حدس دقیق کلمه ──
  // اگر درست بگوید جاسوس‌ها برنده‌اند؛ اگر حتی یک حرف اشتباه بنویسد فوراً حذف می‌شود.
  function spyDeclare(room, player, data) {
    const g = room.game;
    if (!g || (g.phase !== 'day' && g.phase !== 'vote'))
      throw util.err('phase', 'اعلام پایان بازی فقط در روز یا رأی‌گیری ممکن است.');
    const me = gPlayer(g, player.id);
    if (!me || !me.alive) throw util.err('eliminated', 'بازیکن حذف‌شده نمی‌تواند اعلام کند.');
    if (me.role !== 'spy') throw util.err('not_spy', 'این امکان فقط برای جاسوس است.');
    const guess = util.exactNorm(util.cleanText(data && data.word, 60));
    if (!guess) throw util.err('bad_text', 'کلمه را دقیق بنویس.');
    emit.toRoom(room, 'game:note', () => ({ text: `${me.name} اعلام پایان بازی کرد: «کلمه را می‌دانم!»` }));
    if (guess === util.exactNorm(g.word)) {
      g.log.push({ t: 's', text: `${me.name} کلمه را دقیق حدس زد`, day: g.dayNo });
      emit.toRoom(room, 'game:declareResult', () => ({ correct: true, spyId: me.id }));
      return gameOver(room, 'spies', 'word_guessed');
    }
    g.log.push({ t: 's', text: `${me.name} اعلام کرد اما کلمه اشتباه بود`, day: g.dayNo });
    emit.toRoom(room, 'game:declareResult', () => ({ correct: false, spyId: me.id }));
    return applyElimination(room, me, 'declare');
  }

  // ── شب جاسوس ──
  function startNight(room) {
    const g = room.game;
    clearAllTimers(room);
    g.phase = 'night';
    g.sub = null;
    g.nightPicks = {};
    g.guess = null;
    schedule(room, 'night', cfg.NIGHT_MS, () => resolveNight(room));
    emit.toRoom(room, 'game:night', (me) => {
      const p = gPlayer(g, me.id);
      const isSpy = p && p.alive && p.role === 'spy';
      return {
        deadline: g.deadlines.night,
        isSpy: !!isSpy,
        candidates: isSpy ? g.players.filter((x) => x.alive).map((x) => pubBrief(g, x.id)) : undefined,
        picked: 0,
        needed: g.players.filter((x) => x.alive && x.role === 'spy').length,
        music: 'night',
      };
    });
  }

  function nightPick(room, player, data) {
    const g = room.game;
    if (!g || g.phase !== 'night') throw util.err('phase', 'الان شب نیست.');
    const me = gPlayer(g, player.id);
    if (!me || !me.alive || me.role !== 'spy') throw util.err('not_spy', 'فقط جاسوس‌ها در شب انتخاب می‌کنند.');
    const t = gPlayer(g, data && data.targetId);
    if (!t || !t.alive) throw util.err('bad_target', 'این بازیکن در دسترس نیست.');
    g.nightPicks[player.id] = t.id; // انتخاب جاسوس‌ها از سایر بازیکنان محرمانه است
    const needed = g.players.filter((x) => x.alive && x.role === 'spy').length;
    const picked = Object.keys(g.nightPicks).length;
    emit.toRoom(room, 'game:nightProgress', { picked, needed });
    if (picked >= needed) resolveNight(room);
  }

  function resolveNight(room) {
    const g = room.game;
    const counts = {};
    for (const t of Object.values(g.nightPicks)) counts[t] = (counts[t] || 0) + 1;
    const entries = Object.entries(counts);
    let targetId;
    if (entries.length === 0) {
      const alive = g.players.filter((p) => p.alive);
      targetId = util.pick(alive).id; // هر شب دقیقاً یک بازیکن حذف می‌شود
    } else {
      const max = Math.max(...entries.map((e) => e[1]));
      const top = entries.filter((e) => e[1] === max).map((e) => e[0]);
      targetId = util.pick(top); // رأی اکثریت جاسوس‌ها؛ تساوی → قرعه
    }
    const elim = gPlayer(g, targetId);
    emit.toRoom(room, 'game:dawn', () => ({ eliminated: pubFull(elim), role: elim.role, dayNo: g.dayNo, sfx: 'eliminate' }));
    applyElimination(room, elim, 'night');
  }

  function newDay(room) {
    const g = room.game;
    g.dayNo++;
    g.termsUsed = 0;
    const alive = g.players.filter((p) => p.alive).length;
    g.termsTotal = Math.max(cfg.DAY_TERMS_MIN, alive);
    emit.toRoom(room, 'game:daybreak', () => ({ dayNo: g.dayNo, termsTotal: g.termsTotal }));
    dayStart(room, null, null);
  }

  // ── پایان مسابقه و جوایز ──
  function gameOver(room, winner, reason) {
    const g = room.game;
    g.phase = 'over';
    g.winner = winner;
    g.reason = reason;
    clearAllTimers(room);
    const isTest = !!room.test; // اتاق آزمایشی: بدون سکه، بدون آمار، بدون تاریخچه
    const rewards = [];
    for (const p of g.players) {
      const won = p.role === 'spy' ? winner === 'spies' : winner === 'citizens';
      if (isTest) {
        rewards.push({ id: p.id, delta: 0, balance: null });
      } else {
        const delta = won ? cfg.MATCH_WIN_REWARD : cfg.MATCH_LOSE_REWARD;
        const balance = db.addCoins(p.id, delta, 'match', { room: room.code, result: won ? 'win' : 'loss' });
        db.bumpStats(p.id, won ? 'win' : 'loss');
        db.recordMatch(p.id, room.code, g.players.length, p.role, won ? 'win' : 'loss', g.word, delta);
        rewards.push({ id: p.id, delta, balance: balance == null ? null : balance });
      }
      emit.meUpdate(p.id);
    }
    room.status = 'over';
    room.overAt = util.now();
    ctx.persistRoom(room);
    emit.toRoom(room, 'game:over', (me) => ({
      winner,
      reason,
      word: g.word,
      category: g.category,
      roles: g.players.map((p) => pubFull(p)),
      order: g.eliminated,
      rewards,
      test: isTest,
      me: rewards.find((r) => r.id === me.id) || null,
      music: 'end',
      sfx: 'end',
    }));
  }

  // ── اسنپ‌شات شخصی‌سازی‌شده برای ورود مجدد وسط بازی ──
  function snapshot(room, playerId) {
    const g = room.game;
    if (!g) return null;
    const me = gPlayer(g, playerId);
    const isSpy = me && me.role === 'spy';
    const dl = activeDeadline(g);
    return {
      phase: g.phase,
      sub: g.sub,
      dayNo: g.dayNo,
      startCount: g.startCount || null,
      termsTotal: g.termsTotal,
      termsUsed: g.termsUsed,
      players: publicPlayers(g),
      askerId: g.askerId,
      targetId: g.targetId,
      question: g.question,
      answer: g.answer,
      deadline: dl ? dl.at : null,
      deadlineKey: dl ? dl.key : null,
      candidates: g.phase === 'vote' ? (g.candidates || []).map((id) => pubBrief(g, id)) : undefined,
      revote: g.phase === 'vote' ? g.revote : undefined,
      myVote: g.votes[playerId] || null,
      voteCount: Object.keys(g.votes).length,
      voteTotal: g.candidates ? g.candidates.length : 0,
      nightPicksMine: g.nightPicks[playerId] || null,
      nightProgress: {
        picked: Object.keys(g.nightPicks).length,
        needed: g.players.filter((p) => p.alive && p.role === 'spy').length,
      },
      mates: isSpy ? g.players.filter((x) => x.role === 'spy' && x.id !== playerId).map((x) => x.number) : [],
      category: g.category,
      nightIsSpy: g.phase === 'night' && me && me.alive && isSpy,
      nightPicksMine: g.nightPicks[playerId] || null,
      guessMine: g.phase === 'guess' && g.guess && g.guess.spyId === playerId && !g.guess.done,
      shotMine: g.phase === 'shot' && g.shot && g.shot.spyId === playerId && !g.shot.done,
      shotSpy: g.phase === 'shot' && g.shot ? pubFull(gPlayer(g, g.shot.spyId) || {}) : null,
      shotDone: g.phase === 'shot' && g.shot ? !!g.shot.done : undefined,
      stickerUsed: !!g.stickers[playerId],
      log: g.log.slice(-40),
      eliminated: g.eliminated,
      over:
        g.phase === 'over'
          ? {
              winner: g.winner,
              reason: g.reason,
              word: g.word,
              category: g.category,
              roles: g.players.map((p) => pubFull(p)),
              order: g.eliminated,
            }
          : null,
      me: me
        ? { id: me.id, number: me.number, role: me.role, word: isSpy ? null : g.word, category: g.category, alive: me.alive }
        : null,
    };
  }

  // ── رویدادهای اتصال/قطع ──
  function setConnected(room, playerId, connected) {
    const g = room.game;
    if (!g) return false;
    const p = gPlayer(g, playerId);
    if (!p) return false;
    p.connected = connected;
    return true;
  }

  return {
    startMatch,
    resume,
    ask,
    answer,
    challenge,
    sticker,
    voteCast,
    nightPick,
    guessWord,
    spyDeclare,
    shotPick,
    shotSkip,
    snapshot,
    setConnected,
    publicPlayers,
    gPlayer,
    isPlaying: (room) => !!room.game && room.game.phase !== 'over',
  };
};
