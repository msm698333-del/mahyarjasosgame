// ─── لایه Socket.IO: احراز هویت هندشیک، مسیریابی رویدادها، محدودیت نرخ ───
module.exports = function attach(io, ctx) {
  const { db, lobby, engine, ttt, shop, util } = ctx;
  const globalLimiter = ctx.makeLimiter();
  const textLimiter = ctx.makeLimiter();
  const heavyLimiter = ctx.makeLimiter();
  const voiceLimiter = ctx.makeLimiter();

  // احراز هویت هندشیک: توکن از auth یا کوکی
  io.use((socket, next) => {
    let token = socket.handshake.auth && socket.handshake.auth.token;
    if (!token && socket.handshake.headers && socket.handshake.headers.cookie) {
      const cookies = require('./auth').parseCookies(socket.handshake.headers.cookie);
      token = cookies['spy_token'];
    }
    const playerId = ctx.verifyToken(token);
    if (!playerId) return next(new Error('unauthorized'));
    const player = db.getPlayer(playerId);
    if (!player) return next(new Error('unregistered'));
    socket.data.playerId = playerId;
    next();
  });

  io.on('connection', (socket) => {
    const playerId = socket.data.playerId;
    db.touch(playerId);

    const sendErr = (ack, e) => {
      const payload = { ok: false, code: e.code || 'server', msg: e.msg || 'خطای سرور', need: e.need, have: e.have };
      if (typeof ack === 'function') ack(payload);
      else socket.emit('err', payload);
    };

    // روی هر رویداد: محدودیت نرخ + مدیریت خطا
    const on = (event, handler, opts = {}) => {
      socket.on(event, (data, ackArg) => {
        let acked = false;
        const ack = (payload) => {
          if (typeof ackArg === 'function' && !acked) {
            acked = true;
            ackArg(payload);
          }
        };
        if (!globalLimiter('g:' + socket.id, opts.heavy ? 15 : 40, 10000)) {
          return sendErr(ack, util.err('rate', 'درخواست‌ها زیادی فرستادی؛ چند لحظه صبر کن.'));
        }
        if (opts.text && !textLimiter('t:' + playerId, 12, 10000)) {
          return sendErr(ack, util.err('rate', 'متن‌ها را آرام‌تر بفرست.'));
        }
        if (opts.heavy && !heavyLimiter('h:' + playerId, 10, 10000)) {
          return sendErr(ack, util.err('rate', 'کمی صبر کن…'));
        }
        try {
          const result = handler(data, ack);
          ack({ ok: true, ...(result || {}) });
        } catch (e) {
          if (e && e.code) sendErr(ack, e);
          else {
            console.error('socket handler error', event, e);
            sendErr(ack, util.err('server', 'خطای سرور'));
          }
        }
      });
    };

    const roomOf = () => lobby.roomOf(playerId);
    const memberOf = (room) => room && room.players.some((p) => p.id === playerId);
    const player = () => db.getPlayer(playerId);

    // ─── لابی ───
    on('room:create', (data) => lobby.create(socket, data), { heavy: true });
    on('room:info', (data, ack) => {
      const info = lobby.info(playerId, data && data.code);
      if (typeof ack === 'function') ack({ ok: true, info });
    });
    on('room:join', (data) => lobby.join(socket, data && data.code), { heavy: true });
    on('room:rejoin', (data) => lobby.rejoin(socket, data && data.code), { heavy: true });
    on('room:leave', () => lobby.leave(socket));
    on('room:ready', (data) => lobby.setReady(socket, data));
    on('room:slots', (data) => lobby.setSlots(socket, data), { heavy: true });
    on('room:fee', (data) => lobby.setFee(socket, data), { heavy: true });
    on('room:start', () => lobby.start(socket), { heavy: true });
    on('room:rematch', () => lobby.rematch(socket), { heavy: true });

    // ─── بازی جاسوس (همه اعتبارسنجی‌ها داخل موتور انجام می‌شود) ───
    on(
      'game:ask',
      (data) => {
        const room = roomOf();
        if (!room || !memberOf(room)) throw util.err('no_room');
        engine.ask(room, player(), data);
      },
      { text: true }
    );
    on(
      'game:answer',
      (data) => {
        const room = roomOf();
        if (!room || !memberOf(room)) throw util.err('no_room');
        engine.answer(room, player(), data);
      },
      { text: true }
    );
    on('game:challenge', (data) => {
      const room = roomOf();
      if (!room || !memberOf(room)) throw util.err('no_room');
      engine.challenge(room, player(), data);
    });
    on('game:sticker', (data) => {
      const room = roomOf();
      if (!room || !memberOf(room)) throw util.err('no_room');
      engine.sticker(room, player(), data);
    });
    on(
      'vote:cast',
      (data) => {
        const room = roomOf();
        if (!room || !memberOf(room)) throw util.err('no_room');
        engine.voteCast(room, player(), data);
      },
      { heavy: true }
    );
    on('night:pick', (data) => {
      const room = roomOf();
      if (!room || !memberOf(room)) throw util.err('no_room');
      engine.nightPick(room, player(), data);
    });
    on(
      'game:guess',
      (data) => {
        const room = roomOf();
        if (!room || !memberOf(room)) throw util.err('no_room');
        engine.guessWord(room, player(), data);
      },
      { text: true }
    );
    on(
      'game:declare',
      (data) => {
        const room = roomOf();
        if (!room || !memberOf(room)) throw util.err('no_room');
        engine.spyDeclare(room, player(), data);
      },
      { text: true }
    );
    on('game:shot', (data) => {
      const room = roomOf();
      if (!room || !memberOf(room)) throw util.err('no_room');
      engine.shotPick(room, player(), data);
    });
    on('game:shotSkip', () => {
      const room = roomOf();
      if (!room || !memberOf(room)) throw util.err('no_room');
      engine.shotSkip(room, player());
    });

    // ─── ویس زنده (رلهٔ صدا از طریق خود سرور — روی هر شبکه‌ای کار می‌کند) ───
    on('voice:join', () => ctx.voice.join(playerId));
    on('voice:leave', () => ctx.voice.leave(playerId));
    on('voice:info', () => ctx.voice.info(playerId));
    // فریم‌های صدا پرتعدادند — بدون ack و با محدودکنندهٔ اختصاصی سبک
    socket.on('voice:audio', (data) => {
      if (!voiceLimiter('v:' + playerId, 120, 10000)) return;
      try {
        ctx.voice.audio(playerId, data);
      } catch (e) {
        /* فریم نامعتبر — نادیده گرفته می‌شود */
      }
    });

    // ─── دوز ───
    on('ttt:ai', (data) => ttt.aiStart(socket, data), { heavy: true });
    on('ttt:ai_move', (data) => ttt.aiMove(socket, data));
    on('ttt:ai_restart', () => ttt.aiRestart(socket));
    on('ttt:pvp_queue', () => ttt.pvpQueue(socket), { heavy: true });
    on('ttt:pvp_move', (data) => ttt.pvpMove(socket, data));
    on('ttt:pvp_rematch', () => ttt.pvpRematch(socket), { heavy: true });
    on('ttt:pvp_leave', () => ttt.pvpLeave(socket, false));

    socket.on('disconnect', () => {
      ctx.removeSocket(playerId, socket);
      // ویس فقط وقتی قطع می‌شود که هیچ سوکت دیگری از این بازیکن باقی نمانده باشد
      if (ctx.socketsFor(playerId).length === 0) ctx.voice.onDisconnect(playerId);
      lobby.onDisconnect(playerId);
      ttt.onDisconnect(socket);
    });

    ctx.addSocket(playerId, socket);
    lobby.onConnect(playerId, socket);
  });
};
