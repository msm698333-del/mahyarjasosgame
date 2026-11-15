// ─── سیستم لابی ───
// ساخت لابی با کد تصادفی، ورود با کد، آماده‌باش، شروع توسط سازنده،
// مدیریت قطع اتصال و اتصال مجدد، بازپرداخت هزینه ورود اگر بازی شروع نشود.
module.exports = function createLobby(ctx) {
  const { cfg, db, util, emit, rooms, playerRoom, sockets } = ctx;

  function persist(room) {
    const g = room.game ? { ...room.game, timers: {} } : null;
    const payload = {
      roster: room.players.map((p) => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        ready: !!p.ready,
        connected: !!p.connected,
        paid: p.paid || null,
      })),
      game: g,
    };
    ctx.db.saveRoom(room.code, room.status, room.hostId, { slots: room.slots, fee: room.fee }, payload);
  }
  ctx.persistRoom = persist;

  function codeUnique() {
    for (let i = 0; i < 50; i++) {
      const c = util.rid(6);
      if (!rooms.has(c)) return c;
    }
    return util.rid(7);
  }

  function rosterPayload(room) {
    return {
      code: room.code,
      status: room.status,
      hostId: room.hostId,
      slots: room.slots,
      fee: room.fee,
      players: room.players.map((p) => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        ready: !!p.ready,
        connected: !!p.connected,
        isHost: p.id === room.hostId,
      })),
    };
  }

  function broadcastState(room) {
    persist(room);
    emit.toRoom(room, 'room:state', (me) => {
      const dbp = db.getPlayer(me.id);
      const mine = room.players.find((p) => p.id === me.id);
      return {
        ...rosterPayload(room),
        canStart: room.players.length >= cfg.MIN_PLAYERS,
        me: dbp
          ? {
              coins: dbp.coins,
              freeEntries: dbp.free_entries,
              ready: mine ? !!mine.ready : false,
              paid: mine ? mine.paid : null,
              isHost: me.id === room.hostId,
            }
          : null,
      };
    });
  }

  // خروج خودکار از لابی/مسابقه قبلی (قبل از ساخت یا ورود به لابی جدید)
  function autoLeave(playerId) {
    const room = roomOf(playerId);
    if (!room) return;
    if (room.status === 'lobby') leaveRoom(playerId, room, true);
    else {
      // وسط مسابقه: صندلی به‌صورت آفلاین علامت می‌خورد؛ مسابقه ادامه پیدا می‌کند
      ctx.engine.setConnected(room, playerId, false);
      playerRoom.delete(playerId);
      emit.presence(room);
    }
  }

  function roomOf(playerId) {
    const code = playerRoom.get(playerId);
    return code ? rooms.get(code) || null : null;
  }

  function leaveRoom(playerId, room, refund) {
    const idx = room.players.findIndex((p) => p.id === playerId);
    if (idx === -1) return;
    const p = room.players[idx];
    if (refund && room.status === 'lobby' && p.paid) {
      db.refundEntry(playerId, p.paid.charged, p.paid.free);
      emit.meUpdate(playerId);
    }
    room.players.splice(idx, 1);
    playerRoom.delete(playerId);
    if (room.hostId === playerId) {
      const next = room.players.find((x) => x.connected) || room.players[0];
      room.hostId = next ? next.id : null;
    }
    if (room.players.length === 0) {
      rooms.delete(room.code);
      db.deleteRoom(room.code);
      return;
    }
    broadcastState(room);
  }

  // ── ساخت لابی ──
  function create(socket, data) {
    const playerId = socket.data.playerId;
    const player = db.getPlayer(playerId);
    if (!player) throw util.err('no_player', 'هویت پیدا نشد؛ دوباره وارد شو.');
    autoLeave(playerId);
    let slots = Math.floor(Number(data && data.slots));
    if (!Number.isFinite(slots)) slots = 8;
    slots = Math.max(cfg.MIN_PLAYERS, Math.min(cfg.MAX_PLAYERS, slots));
    let fee = Math.floor(Number(data && data.fee));
    if (!Number.isFinite(fee)) fee = cfg.ENTRY_FEE_DEFAULT;
    fee = Math.max(cfg.ENTRY_FEE_MIN, Math.min(cfg.ENTRY_FEE_MAX, fee));
    const paid = db.consumeEntry(playerId, fee); // سازنده هم مثل بقیه ورود می‌پردازد
    const room = {
      code: codeUnique(),
      hostId: playerId,
      slots,
      fee,
      status: 'lobby',
      players: [
        {
          id: playerId,
          name: player.name,
          avatar: player.avatar,
          ready: false,
          connected: true,
          paid,
          graceTimer: null,
        },
      ],
      createdAt: util.now(),
      lobbyTimers: {},
    };
    rooms.set(room.code, room);
    playerRoom.set(playerId, room.code);
    socket.join(room.code);
    broadcastState(room);
    emit.meUpdate(playerId);
    return { code: room.code, paid };
  }

  // ── اطلاعات عمومی لابی برای صفحه ورود با کد ──
  function info(playerId, rawCode) {
    const code = String(rawCode || '').trim().toUpperCase();
    const room = rooms.get(code);
    const me = db.getPlayer(playerId);
    if (!room) return { exists: false };
    if (!me) throw util.err('no_player');
    const cost = me.free_entries > 0 ? 0 : room.fee;
    return {
      exists: true,
      code: room.code,
      status: room.status,
      slots: room.slots,
      count: room.players.length,
      fee: room.fee,
      cost,
      freeLeft: me.free_entries,
      coins: me.coins,
      canAfford: me.free_entries > 0 || me.coins >= room.fee,
      open: room.status === 'lobby' && room.players.length < room.slots,
    };
  }

  // ── ورود به لابی با کد ──
  function join(socket, rawCode) {
    const playerId = socket.data.playerId;
    const player = db.getPlayer(playerId);
    if (!player) throw util.err('no_player', 'هویت پیدا نشد.');
    const code = String(rawCode || '').trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) throw util.err('bad_code', 'لابی با این کد پیدا نشد.');
    if (room.status !== 'lobby') throw util.err('started', 'این بازی شروع شده است؛ ورود بازیکن جدید ممکن نیست.');
    if (playerRoom.get(playerId) === code) {
      // قبلاً عضو است — فقط اتصال مجدد
      onReconnected(playerId, socket, room);
      return { code: room.code, rejoined: true };
    }
    autoLeave(playerId);
    if (room.players.length >= room.slots) throw util.err('full', 'ظرفیت لابی پر است.');
    const paid = db.consumeEntry(playerId, room.fee);
    const member = {
      id: playerId,
      name: player.name,
      avatar: player.avatar,
      ready: false,
      connected: true,
      paid,
      graceTimer: null,
    };
    room.players.push(member);
    playerRoom.set(playerId, room.code);
    socket.join(room.code);
    broadcastState(room);
    emit.meUpdate(playerId);
    return { code: room.code, paid };
  }

  // ── اتصال مجدد بدون پرداخت ──
  function rejoin(socket, rawCode) {
    const playerId = socket.data.playerId;
    const code = String(rawCode || '').trim().toUpperCase();
    const room = rooms.get(code);
    if (!room || !room.players.some((p) => p.id === playerId)) {
      throw util.err('gone', 'این لابی دیگر فعال نیست.');
    }
    onReconnected(playerId, socket, room);
    return { code: room.code };
  }

  function onReconnected(playerId, socket, room) {
    playerRoom.set(playerId, room.code);
    socket.join(room.code);
    const member = room.players.find((p) => p.id === playerId);
    if (member) member.connected = true;
    if (room.lobbyTimers[playerId]) {
      clearTimeout(room.lobbyTimers[playerId]);
      delete room.lobbyTimers[playerId];
    }
    if (room.status === 'playing' || room.status === 'over') {
      ctx.engine.setConnected(room, playerId, true);
      emit.presence(room);
      const snap = ctx.engine.snapshot(room, playerId);
      emit.toPlayer(playerId, 'game:resume', { room: rosterPayload(room), state: snap, status: room.status });
    }
    broadcastState(room);
  }

  // ── خروج ──
  function leave(socket) {
    const playerId = socket.data.playerId;
    const room = roomOf(playerId);
    if (!room) return { ok: true };
    if (room.status === 'lobby') {
      leaveRoom(playerId, room, true);
      return { ok: true };
    }
    // وسط مسابقه: خروج = قطع حضور؛ مسابقه ادامه پیدا می‌کند
    ctx.engine.setConnected(room, playerId, false);
    emit.presence(room);
    return { ok: true };
  }

  // ── آماده‌باش و تنظیمات میزبان ──
  function setReady(socket, data) {
    const playerId = socket.data.playerId;
    const room = roomOf(playerId);
    if (!room || room.status !== 'lobby') throw util.err('phase', 'لابی فعال نیست.');
    const me = room.players.find((p) => p.id === playerId);
    if (!me) throw util.err('no_member');
    me.ready = !!(data && data.ready);
    broadcastState(room);
    return { ok: true, ready: me.ready };
  }

  function setSlots(socket, data) {
    const playerId = socket.data.playerId;
    const room = roomOf(playerId);
    if (!room || room.status !== 'lobby') throw util.err('phase');
    if (room.hostId !== playerId) throw util.err('not_host', 'فقط سازنده لابی می‌تواند تنظیم کند.');
    let slots = Math.floor(Number(data && data.slots));
    if (!Number.isFinite(slots)) throw util.err('bad_input');
    slots = Math.max(Math.max(cfg.MIN_PLAYERS, room.players.length), Math.min(cfg.MAX_PLAYERS, slots));
    room.slots = slots;
    broadcastState(room);
    return { ok: true, slots };
  }

  function setFee(socket, data) {
    const playerId = socket.data.playerId;
    const room = roomOf(playerId);
    if (!room || room.status !== 'lobby') throw util.err('phase');
    if (room.hostId !== playerId) throw util.err('not_host', 'فقط سازنده لابی می‌تواند تنظیم کند.');
    let fee = Math.floor(Number(data && data.fee));
    if (!Number.isFinite(fee)) throw util.err('bad_input');
    fee = Math.max(cfg.ENTRY_FEE_MIN, Math.min(cfg.ENTRY_FEE_MAX, fee));
    room.fee = fee;
    broadcastState(room);
    return { ok: true, fee };
  }

  // ── شروع بازی (فقط سازنده) ──
  function start(socket) {
    const playerId = socket.data.playerId;
    const room = roomOf(playerId);
    if (!room) throw util.err('no_room');
    if (room.hostId !== playerId) throw util.err('not_host', 'شروع بازی فقط با سازنده لابی است.');
    if (room.status !== 'lobby') throw util.err('phase', 'بازی قبلاً شروع شده است.');
    if (room.players.length < cfg.MIN_PLAYERS)
      throw util.err('min_players', `حداقل ${cfg.MIN_PLAYERS} بازیکن لازم است.`);
    ctx.engine.startMatch(room);
    persist(room);
    return { ok: true };
  }

  // ── بازی مجدد در همان لابی (ورود دوباره محاسبه می‌شود تا ضد فارم باشد) ──
  function rematch(socket) {
    const playerId = socket.data.playerId;
    const room = roomOf(playerId);
    if (!room) throw util.err('no_room');
    if (room.hostId !== playerId) throw util.err('not_host', 'بازی مجدد فقط با سازنده لابی است.');
    if (room.status !== 'over') throw util.err('phase', 'بازی هنوز تمام نشده است.');
    const keep = [];
    for (const p of room.players) {
      try {
        const paid = db.consumeEntry(p.id, room.fee);
        keep.push({
          id: p.id,
          name: p.name,
          avatar: p.avatar,
          ready: false,
          connected: !!p.connected,
          paid,
          graceTimer: null,
        });
      } catch (e) {
        if (e.code === 'no_coins') {
          emit.toPlayer(p.id, 'room:kicked', {
            reason: 'no_coins',
            msg: 'برای بازی مجدد سکه کافی نداشتی؛ می‌توانی با بازی دوز سکه جمع کنی.',
          });
          playerRoom.delete(p.id);
        } else throw e;
      }
    }
    room.players = keep;
    room.game = null;
    room.status = 'lobby';
    room.overAt = null;
    if (!keep.some((p) => p.id === room.hostId)) room.hostId = keep.length ? keep[0].id : null;
    if (keep.length === 0) {
      rooms.delete(room.code);
      db.deleteRoom(room.code);
      return { ok: true, closed: true };
    }
    for (const p of keep) {
      if (p.connected) emit.meUpdate(p.id);
    }
    broadcastState(room);
    return { ok: true };
  }

  // ── قطع اتصال ──
  function onDisconnect(playerId) {
    const room = roomOf(playerId);
    if (!room) return;
    const member = room.players.find((p) => p.id === playerId);
    if (member) member.connected = false;
    if (room.status === 'lobby') {
      // مهلت برای اتصال مجدد؛ بعد از آن از لابی حذف و هزینه برگردانده می‌شود
      if (room.lobbyTimers[playerId]) clearTimeout(room.lobbyTimers[playerId]);
      room.lobbyTimers[playerId] = setTimeout(() => {
        const m = room.players.find((p) => p.id === playerId);
        if (m && !m.connected) {
          const cur = roomOf(playerId);
          if (cur && cur.code === room.code && room.status === 'lobby') leaveRoom(playerId, room, true);
        }
      }, cfg.RECONNECT_GRACE_MS);
      broadcastState(room);
    } else {
      ctx.engine.setConnected(room, playerId, false);
      emit.presence(room);
      persist(room);
    }
  }

  function onConnect(playerId, socket) {
    const room = roomOf(playerId);
    if (!room) return;
    const member = room.players.find((p) => p.id === playerId);
    if (member) member.connected = true;
    if (room.lobbyTimers[playerId]) {
      clearTimeout(room.lobbyTimers[playerId]);
      delete room.lobbyTimers[playerId];
    }
    if (room.status === 'playing' || room.status === 'over') {
      ctx.engine.setConnected(room, playerId, true);
      emit.presence(room);
      const snap = ctx.engine.snapshot(room, playerId);
      emit.toPlayer(playerId, 'game:resume', { room: rosterPayload(room), state: snap, status: room.status });
    }
    broadcastState(room);
  }

  // ── پاکسازی دوره‌ای ──
  function prune() {
    const t = util.now();
    for (const [code, room] of rooms) {
      if (room.status === 'lobby') {
        if (room.players.length === 0) {
          rooms.delete(code);
          db.deleteRoom(code);
          continue;
        }
        const anyConnected = room.players.some((p) => p.connected);
        if (!anyConnected && t - room.createdAt > cfg.LOBBY_EMPTY_TTL_MS) {
          for (const p of room.players) {
            if (p.paid) db.refundEntry(p.id, p.paid.charged, p.paid.free);
            playerRoom.delete(p.id);
          }
          rooms.delete(code);
          db.deleteRoom(code);
        }
      } else if (room.status === 'over') {
        if (room.overAt && t - room.overAt > cfg.ROOM_OVER_TTL_MS) {
          for (const p of room.players) playerRoom.delete(p.id);
          rooms.delete(code);
          db.deleteRoom(code);
        }
      } else if (room.status === 'playing') {
        const anyConnected = room.players.some((p) => p.connected);
        if (!anyConnected && t - room.createdAt > cfg.ROOM_ABORT_MS) {
          // همه رفته‌اند؛ مسابقه لغو و ورودها برگردانده می‌شود
          for (const p of room.players) {
            if (p.paid) db.refundEntry(p.id, p.paid.charged, p.paid.free);
            emit.meUpdate(p.id);
            playerRoom.delete(p.id);
          }
          rooms.delete(code);
          db.deleteRoom(code);
        }
      }
    }
  }

  // ── بازیابی اتاق‌ها پس از ری‌استارت سرور ──
  function loadAll() {
    let n = 0;
    for (const r of db.loadRooms()) {
      if (!r.state || !Array.isArray(r.state.roster)) continue;
      const room = {
        code: r.code,
        hostId: r.hostId,
        slots: r.config.slots || 8,
        fee: r.config.fee != null ? r.config.fee : cfg.ENTRY_FEE_DEFAULT,
        status: r.status,
        players: (r.state.roster || []).map((p) => ({
          id: p.id,
          name: p.name,
          avatar: p.avatar,
          ready: !!p.ready,
          connected: false,
          paid: p.paid || null,
          graceTimer: null,
        })),
        createdAt: r.updatedAt || util.now(),
        lobbyTimers: {},
        game: null,
        overAt: r.status === 'over' ? r.updatedAt : null,
      };
      if (r.state.game && r.status !== 'lobby') {
        room.game = r.state.game;
        room.game.timers = {};
        for (const gp of room.game.players || []) gp.connected = false;
        if (r.status === 'playing') ctx.engine.resume(room);
      }
      rooms.set(room.code, room);
      for (const p of room.players) playerRoom.set(p.id, room.code);
      n++;
    }
    return n;
  }

  return {
    create,
    join,
    rejoin,
    info,
    leave,
    setReady,
    setSlots,
    setFee,
    start,
    rematch,
    onConnect,
    onDisconnect,
    prune,
    loadAll,
    broadcastState,
    roomOf,
    rosterPayload,
  };
};
