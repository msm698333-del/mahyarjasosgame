// ─── ویس زنده: رلهٔ صدا از طریق خود سرور (بدون WebRTC) ───
// صدا به‌صورت فریم‌های کوچک صوتی روی «همان اتصال بازی» (Socket.IO) رد و بدل می‌شود؛
// به همین دلیل پشت هر NAT و روی هر اپراتوری — حتی شبکه‌های ایران — کار می‌کند.
module.exports = function createVoice(ctx) {
  const { lobby, util } = ctx;
  const joined = new Map(); // code → Map<playerId, {id, name, avatar}>
  const flood = new Map(); // playerId → {n, t} — ضد ارسال بیش‌ازحد فریم

  function mapFor(code) {
    let m = joined.get(code);
    if (!m) {
      m = new Map();
      joined.set(code, m);
    }
    return m;
  }

  function drop(playerId) {
    const room = lobby.roomOf(playerId);
    if (!room) return;
    const m = joined.get(room.code);
    if (!m || !m.has(playerId)) return;
    m.delete(playerId);
    flood.delete(playerId);
    if (m.size === 0) joined.delete(room.code);
    else ctx.emit.toRoomSame(room, 'voice:left', { id: playerId });
  }

  return {
    // ورود به گفتگوی صوتی اتاق — فهرست اعضای فعلی (با نام) برمی‌گردد
    join(playerId) {
      const room = lobby.roomOf(playerId);
      if (!room) throw util.err('no_room', 'اتاق فعالی نداری.');
      const m = mapFor(room.code);
      const fresh = !m.has(playerId);
      if (fresh && m.size >= (ctx.cfg.MAX_PLAYERS || 12)) throw util.err('voice_full', 'ظرفیت گفتگوی صوتی پر است.');
      const me = room.players.find((x) => x.id === playerId) || {};
      const entry = { id: playerId, name: me.name || '', avatar: me.avatar || '' };
      const peers = [...m.values()];
      m.set(playerId, entry);
      if (fresh) ctx.emit.toRoomSame(room, 'voice:joined', entry);
      return { peers, count: m.size };
    },

    // چه کسانی الان در گفتگو هستند — بدون عضویت (برای نمایش وضعیت روی کارت ویس)
    info(playerId) {
      const room = lobby.roomOf(playerId);
      if (!room) return { members: [] };
      const m = joined.get(room.code);
      return { members: m ? [...m.values()] : [] };
    },

    // رلهٔ فریم صوتی به بقیهٔ اعضای گفتگوی همان اتاق
    audio(playerId, data) {
      const room = lobby.roomOf(playerId);
      if (!room) return false;
      const m = joined.get(room.code);
      if (!m || !m.has(playerId) || m.size < 2) return false;
      // ضد طغیان: حداکثر ۱۴ فریم در ثانیه از هر بازیکن
      const t = util.now();
      let f = flood.get(playerId);
      if (!f || t - f.t > 1000) {
        f = { n: 0, t };
        flood.set(playerId, f);
      }
      f.n++;
      if (f.n > 14) return false;
      let b = data && data.a;
      if (b instanceof ArrayBuffer) b = Buffer.from(b);
      else if (ArrayBuffer.isView(b)) b = Buffer.from(b.buffer, b.byteOffset, b.byteLength);
      if (!b || b.length < 256 || b.length > 8192) return false;
      for (const [pid] of m) {
        if (pid !== playerId) ctx.emit.toPlayer(pid, 'voice:audio', { from: playerId, a: b });
      }
      return true;
    },

    leave(playerId) {
      drop(playerId);
    },

    onDisconnect(playerId) {
      drop(playerId);
    },
  };
};
