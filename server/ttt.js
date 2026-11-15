// ─── بازی دوز: مقابل هوش مصنوعی (سه سطح) و آنلاین دو‌نفره ───
// همه مهره‌ها و نتایج سمت سرور اعتبارسنجی می‌شوند؛ پاداش‌ها سقف روزانه دارند (ضد فارم).
module.exports = function createTtt(ctx) {
  const { cfg, db, util, emit } = ctx;

  const LINES = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
  ];

  function winnerOf(b) {
    for (const [a, c, d] of LINES) {
      if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a];
    }
    return b.every(Boolean) ? 'draw' : null;
  }

  function minimax(b, aiSym, humanSym, turn, depth) {
    const w = winnerOf(b);
    if (w === aiSym) return { score: 10 - depth };
    if (w === humanSym) return { score: depth - 10 };
    if (w === 'draw') return { score: 0 };
    let best = null;
    for (let i = 0; i < 9; i++) {
      if (!b[i]) {
        b[i] = turn;
        const r = minimax(b, aiSym, humanSym, turn === aiSym ? humanSym : aiSym, depth + 1);
        b[i] = null;
        if (!best || (turn === aiSym ? r.score > best.score : r.score < best.score)) {
          best = { score: r.score, move: i };
        }
      }
    }
    return best;
  }

  function emptyCells(b) {
    const out = [];
    for (let i = 0; i < 9; i++) if (!b[i]) out.push(i);
    return out;
  }

  function aiMove(b, diff, aiSym) {
    const humanSym = aiSym === 'X' ? 'O' : 'X';
    const empties = emptyCells(b);
    if (empties.length === 0) return -1;
    if (diff === 'easy') return util.pick(empties);
    if (diff === 'normal' && Math.random() < 0.4) return util.pick(empties);
    const best = minimax(b.slice(), aiSym, humanSym, aiSym, 0);
    return best ? best.move : util.pick(empties);
  }

  // ── مقابل هوش مصنوعی ──
  const aiSessions = new Map(); // socket.id → session

  function aiStart(socket, data) {
    const diff = ['easy', 'normal', 'hard'].includes(data && data.difficulty) ? data.difficulty : 'normal';
    aiSessions.set(socket.id, {
      playerId: socket.data.playerId,
      board: Array(9).fill(null),
      me: 'X',
      ai: 'O',
      diff,
      turn: 'X',
      over: false,
    });
    return {
      board: Array(9).fill(null),
      symbol: 'X',
      turn: 'X',
      difficulty: diff,
      rewardInfo: {
        perWin: cfg.TTT_AI_REWARDS[diff],
        playedToday: db.getDailyCounter(socket.data.playerId, 'ttt_ai_wins'),
        cap: cfg.TTT_AI_DAILY_WIN_CAP,
      },
    };
  }

  function aiMove_(socket, data) {
    const s = aiSessions.get(socket.id);
    if (!s) throw util.err('no_game', 'اول یک بازی شروع کن.');
    if (s.over) throw util.err('phase', 'این بازی تمام شده؛ بازی جدید بگیر.');
    if (s.turn !== s.me) throw util.err('turn', 'الان نوبت تو نیست.');
    const i = Math.floor(Number(data && data.index));
    if (!Number.isInteger(i) || i < 0 || i > 8) throw util.err('bad_input');
    if (s.board[i]) throw util.err('cell', 'این خانه پر است.');
    const playerId = socket.data.playerId;
    s.board[i] = s.me;
    s.turn = s.ai;
    let w = winnerOf(s.board);
    let aiIdx = -1;
    if (!w) {
      aiIdx = aiMove(s.board, s.diff, s.ai);
      if (aiIdx >= 0) s.board[aiIdx] = s.ai;
      w = winnerOf(s.board);
      s.turn = s.me;
    }
    let result = null;
    let reward = 0;
    let note = null;
    if (w) {
      s.over = true;
      result = w === s.me ? 'win' : w === 'draw' ? 'draw' : 'loss';
      if (result === 'win') {
        const played = db.getDailyCounter(playerId, 'ttt_ai_wins');
        if (played < cfg.TTT_AI_DAILY_WIN_CAP) {
          const cnt = db.bumpDailyCounter(playerId, 'ttt_ai_wins');
          reward = cfg.TTT_AI_REWARDS[s.diff];
          db.addCoins(playerId, reward, 'ttt_ai', { diff: s.diff });
          db.recordTtt('ai', playerId, null, playerId);
          if (cnt >= cfg.TTT_AI_DAILY_WIN_CAP) note = 'این آخرین پاداشِ امروز بود؛ فردا دوباره!';
          emit.meUpdate(playerId);
        } else {
          db.recordTtt('ai', playerId, null, playerId);
          note = 'سقف پاداش روزانه پر شده است؛ بردهای بعدی امروز پاداش ندارند.';
        }
      } else {
        db.recordTtt('ai', playerId, null, result === 'draw' ? null : 'ai');
      }
    }
    return {
      board: s.board.slice(),
      turn: s.over ? null : s.turn,
      aiMoveIndex: aiIdx,
      result,
      reward,
      note,
      rewardInfo: {
        perWin: cfg.TTT_AI_REWARDS[s.diff],
        playedToday: db.getDailyCounter(playerId, 'ttt_ai_wins'),
        cap: cfg.TTT_AI_DAILY_WIN_CAP,
      },
    };
  }

  function aiRestart(socket) {
    const s = aiSessions.get(socket.id);
    if (!s) throw util.err('no_game');
    s.board = Array(9).fill(null);
    s.turn = s.me;
    s.over = false;
    return { board: s.board.slice(), turn: s.turn, result: null };
  }

  // ── آنلاین دو‌نفره (صف هم‌ترازی) ──
  const queue = [];
  const pvpBySocket = new Map(); // socket.id → session

  function pvpStart(sess) {
    sess.over = false;
    sess.board = Array(9).fill(null);
    sess.turn = 'X';
    sess.rematch = new Set();
    for (const pl of sess.players) {
      const other = sess.players.find((x) => x !== pl);
      emit.toPlayer(pl.socket.data.playerId, 'ttt:pvp_start', {
        symbol: pl.sym,
        board: sess.board.slice(),
        turn: sess.turn,
        opponent: { name: other.name, avatar: other.avatar },
        rewardInfo: {
          perWin: cfg.TTT_PVP_WIN_REWARD,
          playedToday: db.getDailyCounter(pl.socket.data.playerId, 'ttt_pvp_wins'),
          cap: cfg.TTT_PVP_DAILY_WIN_CAP,
        },
      });
    }
  }

  function pvpQueue(socket) {
    const playerId = socket.data.playerId;
    if (pvpBySocket.has(socket.id)) throw util.err('in_game', 'الان در یک بازی هستی.');
    if (queue.some((s) => s.id === socket.id)) return { queued: true, waiting: true };
    const p = db.getPlayer(playerId);
    socket.data.tttName = p ? p.name : 'بازیکن';
    socket.data.tttAvatar = p ? p.avatar : 'a01';
    // حذف سوکت‌های مرده از صف
    for (let i = queue.length - 1; i >= 0; i--) if (!queue[i].connected) queue.splice(i, 1);
    queue.push(socket);
    if (queue.length >= 2) {
      const a = queue.shift();
      const b = queue.shift();
      const sess = {
        id: 't' + util.rid(8),
        players: [
          { socket: a, sym: 'X', pid: a.data.playerId, name: a.data.tttName, avatar: a.data.tttAvatar },
          { socket: b, sym: 'O', pid: b.data.playerId, name: b.data.tttName, avatar: b.data.tttAvatar },
        ],
        board: Array(9).fill(null),
        turn: 'X',
        over: false,
        rematch: new Set(),
      };
      for (const pl of sess.players) pvpBySocket.set(pl.socket.id, sess);
      pvpStart(sess);
      return { queued: false, matched: true };
    }
    return { queued: true, waiting: true };
  }

  function pvpMove(socket, data) {
    const sess = pvpBySocket.get(socket.id);
    if (!sess || sess.over) throw util.err('no_game', 'بازی فعالی نداری.');
    const me = sess.players.find((p) => p.socket.id === socket.id);
    if (sess.turn !== me.sym) throw util.err('turn', 'الان نوبت تو نیست.');
    const i = Math.floor(Number(data && data.index));
    if (!Number.isInteger(i) || i < 0 || i > 8) throw util.err('bad_input');
    if (sess.board[i]) throw util.err('cell', 'این خانه پر است.');
    sess.board[i] = me.sym;
    const w = winnerOf(sess.board);
    sess.turn = me.sym === 'X' ? 'O' : 'X';
    let result = null;
    if (w) {
      sess.over = true;
      sess.turn = null;
      result = w === 'draw' ? 'draw' : w === me.sym ? 'win' : 'loss';
      for (const pl of sess.players) {
        const won = result === 'win' && pl.sym === me.sym;
        const lost = result === 'loss' && pl.sym !== me.sym;
        if (won) {
          const played = db.getDailyCounter(pl.pid, 'ttt_pvp_wins');
          if (played < cfg.TTT_PVP_DAILY_WIN_CAP) {
            const cnt = db.bumpDailyCounter(pl.pid, 'ttt_pvp_wins');
            const reward = cfg.TTT_PVP_WIN_REWARD;
            db.addCoins(pl.pid, reward, 'ttt_pvp', {});
            emit.meUpdate(pl.pid);
            if (cnt >= cfg.TTT_PVP_DAILY_WIN_CAP) sess.note = 'سقف پاداش امروز پر شد؛ برد بعدی پاداش ندارد.';
          } else {
            sess.note = 'سقف پاداش روزانه پر شده است.';
          }
        }
      }
      db.recordTtt('pvp', sess.players[0].pid, sess.players[1].pid, result === 'draw' ? null : (result === 'win' ? me.pid : sess.players.find((p) => p.sym !== me.sym).pid));
    }
    for (const pl of sess.players) {
      const other = sess.players.find((x) => x !== pl);
      emit.toPlayer(pl.socket.data.playerId, 'ttt:pvp_state', {
        board: sess.board.slice(),
        turn: sess.turn,
        result: result ? (result === 'win' ? (me.sym === pl.sym ? 'win' : 'loss') : 'draw') : null,
        note: sess.note || null,
        lastMove: i,
        by: me.sym,
        opponent: { name: other.name, avatar: other.avatar },
      });
    }
    sess.note = null;
  }

  function pvpRematch(socket) {
    const sess = pvpBySocket.get(socket.id);
    if (!sess) throw util.err('no_game');
    if (!sess.over) throw util.err('phase', 'بازی هنوز تمام نشده.');
    sess.rematch.add(socket.id);
    if (sess.rematch.size >= 2) pvpStart(sess);
    else {
      const other = sess.players.find((p) => p.socket.id !== socket.id);
      emit.toPlayer(other.socket.data.playerId, 'ttt:pvp_rematch_req', {});
      return { waiting: true };
    }
    return { ok: true };
  }

  function pvpLeave(socket, silent) {
    const sess = pvpBySocket.get(socket.id);
    if (!sess) return;
    pvpBySocket.delete(socket.id);
    const other = sess.players.find((p) => p.socket.id !== socket.id);
    if (other && !silent) emit.toPlayer(other.socket.data.playerId, 'ttt:pvp_left', {});
  }

  function onDisconnect(socket) {
    aiSessions.delete(socket.id);
    const qi = queue.indexOf(socket);
    if (qi >= 0) queue.splice(qi, 1);
    pvpLeave(socket, false);
  }

  return { aiStart, aiMove: aiMove_, aiRestart, pvpQueue, pvpMove, pvpRematch, pvpLeave, onDisconnect };
};
