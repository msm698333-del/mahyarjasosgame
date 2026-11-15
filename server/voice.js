// ─── ویس زنده: سیگنالینگ WebRTC داخل هر اتاق ───
// صدا به‌صورت مستقیم (P2P) بین بازیکنان منتقل می‌شود؛ سرور فقط پیام‌های راه‌اندازی اتصال را رله می‌کند.
module.exports = function createVoice(ctx) {
  const { lobby, util } = ctx;
  const joined = new Map(); // code → Set<playerId>

  function setFor(code) {
    let s = joined.get(code);
    if (!s) {
      s = new Set();
      joined.set(code, s);
    }
    return s;
  }

  function drop(playerId) {
    const room = lobby.roomOf(playerId);
    if (!room) return;
    const s = joined.get(room.code);
    if (!s || !s.has(playerId)) return;
    s.delete(playerId);
    if (s.size === 0) joined.delete(room.code);
    else ctx.emit.toRoomSame(room, 'voice:left', { id: playerId });
  }

  return {
    // ورود به گفتگوی صوتی اتاق — فهرست بازیکنانی که از قبل در گفتگو هستند برمی‌گردد
    join(playerId) {
      const room = lobby.roomOf(playerId);
      if (!room) throw util.err('no_room', 'اتاق فعالی نداری.');
      const s = setFor(room.code);
      const fresh = !s.has(playerId);
      if (fresh && s.size >= (ctx.cfg.MAX_PLAYERS || 12)) throw util.err('voice_full', 'ظرفیت گفتگوی صوتی پر است.');
      const peers = [...s];
      s.add(playerId);
      if (fresh) {
        const p = room.players.find((x) => x.id === playerId) || {};
        ctx.emit.toRoomSame(room, 'voice:joined', { id: playerId, name: p.name || '', avatar: p.avatar || '' });
      }
      return { peers, count: s.size };
    },

    // رلهٔ امن پیام‌های SDP/ICE فقط بین اعضای همان اتاق که در گفتگو هستند
    signal(playerId, data) {
      const to = data && data.to;
      const payload = data && data.data;
      if (!to || typeof to !== 'string' || !payload || typeof payload !== 'object') throw util.err('bad_input');
      const room = lobby.roomOf(playerId);
      if (!room) throw util.err('no_room');
      const s = joined.get(room.code);
      if (!s || !s.has(playerId) || !s.has(to)) throw util.err('no_peer', 'این بازیکن در گفتگو نیست.');
      if (!room.players.some((x) => x.id === to)) throw util.err('no_peer');
      const d = payload.desc;
      const c = payload.cand;
      const safe = {};
      if (d && typeof d.type === 'string' && typeof d.sdp === 'string') {
        if (d.sdp.length > 40000) throw util.err('bad_input');
        safe.desc = { type: d.type === 'offer' ? 'offer' : 'answer', sdp: d.sdp };
      } else if (c && typeof c.candidate === 'string') {
        if (c.candidate.length > 2000) throw util.err('bad_input');
        safe.cand = {
          candidate: c.candidate,
          sdpMid: c.sdpMid == null ? null : String(c.sdpMid).slice(0, 16),
          sdpMLineIndex: Number(c.sdpMLineIndex) || 0,
        };
      } else throw util.err('bad_input');
      ctx.emit.toPlayer(to, 'voice:signal', { from: playerId, data: safe });
    },

    leave(playerId) {
      drop(playerId);
    },

    onDisconnect(playerId) {
      drop(playerId);
    },
  };
};
