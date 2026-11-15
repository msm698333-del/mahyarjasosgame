(async () => {
  const p = await SPY.requireAuth();
  if (!p) return;
  SPY.topbar();
  SPY_AUDIO.playMusic('menu');

  if (new URLSearchParams(location.search).get('ref') === 'entry') {
    document.getElementById('ref-note').style.display = '';
  }

  let mode = 'ai';
  let diff = 'normal';
  let mySymbol = null;
  let board = [null, null, null, null, null, null, null, null, null];
  let turn = null;
  let gameOver = false;
  let sessionKind = null; // 'ai' | 'pvp'
  let opponent = null;
  let rewardInfo = null;

  const boardCard = document.getElementById('board-card');
  const boardEl = document.getElementById('board');
  const statusEl = document.getElementById('board-status');
  const resultEl = document.getElementById('board-result');
  const leaveBtn = document.getElementById('board-leave');

  document.getElementById('mode-tabs').addEventListener('click', (e) => {
    const c = e.target.closest('.chip');
    if (!c) return;
    document.querySelectorAll('#mode-tabs .chip').forEach((x) => x.classList.remove('active'));
    c.classList.add('active');
    mode = c.dataset.mode;
    document.getElementById('ai-setup').style.display = mode === 'ai' ? '' : 'none';
    document.getElementById('pvp-setup').style.display = mode === 'pvp' ? '' : 'none';
  });
  document.getElementById('diff-chips').addEventListener('click', (e) => {
    const c = e.target.closest('.chip');
    if (!c) return;
    document.querySelectorAll('#diff-chips .chip').forEach((x) => x.classList.remove('active'));
    c.classList.add('active');
    diff = c.dataset.diff;
  });

  const LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
  ];
  function winLine(b, sym) {
    for (const L of LINES) if (L.every((i) => b[i] === sym)) return L;
    return null;
  }
  function markSvg(sym) {
    return sym === 'X'
      ? '<svg viewBox="0 0 100 100"><g class="x-mark"><line x1="18" y1="18" x2="82" y2="82"/><line x1="82" y1="18" x2="18" y2="82"/></g></svg>'
      : '<svg viewBox="0 0 100 100"><circle class="o-mark" cx="50" cy="50" r="33" fill="none"/></svg>';
  }

  function renderBoard() {
    boardEl.innerHTML = '';
    const line = gameOver ? winLine(board, turn === 'X' ? 'O' : 'X') || winLine(board, turn === 'X' ? 'X' : 'O') : null;
    // اگر بازی تمام شده، خط برنده را پیدا کن (سمت برنده)
    let wl = null;
    if (gameOver) {
      for (const L of LINES) {
        const s = board[L[0]];
        if (s && L.every((i) => board[i] === s)) {
          wl = L;
          break;
        }
      }
    }
    board.forEach((cell, i) => {
      const b = document.createElement('button');
      b.className = 'ttt-cell' + (wl && wl.includes(i) ? ' win' : '');
      b.disabled = !!cell || gameOver || (sessionKind && turn && turn !== mySymbol);
      if (cell) b.innerHTML = markSvg(cell);
      b.onclick = () => move(i);
      boardEl.appendChild(b);
    });
  }

  function setStatus(text) {
    statusEl.textContent = text;
  }

  function showReward(r, note) {
    if (r) SPY.updateCoins((SPY.state.player.coins || 0) + r);
    if (note) SPY.toast(note, r ? 'ok' : '');
  }

  function renderCapInfo(info) {
    if (!info) return;
    document.getElementById('cap-info').textContent =
      `برد امروز: ${SPY.fa(Math.min(info.playedToday, info.cap))} از ${SPY.fa(info.cap)} — بعد از سقف، بردها پاداش ندارند (ضد فارم‌کردن سکه).`;
  }

  // ── هوش مصنوعی ──
  document.getElementById('ai-start').onclick = async () => {
    const res = await SPY.emit('ttt:ai', { difficulty: diff });
    if (!res || !res.ok) {
      SPY.toast((res && res.msg) || 'خطا در شروع بازی', 'err');
      return;
    }
    sessionKind = 'ai';
    board = res.board;
    turn = res.turn;
    mySymbol = res.symbol;
    gameOver = false;
    opponent = { name: 'هوش مصنوعی', avatar: null };
    rewardInfo = res.rewardInfo;
    renderCapInfo(rewardInfo);
    boardCard.style.display = '';
    resultEl.innerHTML = '';
    leaveBtn.style.display = 'none';
    renderBoard();
    setStatus(`تو X هستی و شروع می‌کنی — سطح: ${diff === 'easy' ? 'آسان' : diff === 'normal' ? 'متوسط' : 'سخت'}`);
  };

  async function move(i) {
    if (gameOver || (sessionKind && turn && turn !== mySymbol) || board[i]) return;
    if (sessionKind === 'ai') {
      const res = await SPY.emit('ttt:ai_move', { index: i });
      if (!res || !res.ok) {
        SPY.toast((res && res.msg) || 'حرکت نامعتبر', 'err');
        return;
      }
      board = res.board;
      turn = res.turn;
      if (res.result) {
        gameOver = true;
        showAiResult(res);
      }
      renderBoard();
    } else if (sessionKind === 'pvp') {
      const res = await SPY.emit('ttt:pvp_move', { index: i });
      if (!res || !res.ok) SPY.toast((res && res.msg) || 'حرکت نامعتبر', 'err');
    }
  }

  function showAiResult(res) {
    const r = res.result;
    SPY_AUDIO.playSfx(r === 'win' ? 'end' : r === 'loss' ? 'eliminate' : 'vote');
    resultEl.innerHTML =
      r === 'win'
        ? `<div class="good">بردی! +${SPY.fa(res.reward)} سکه ${res.note ? '· ' + SPY.esc(res.note) : ''}</div>`
        : r === 'loss'
          ? '<div class="bad">باختی! دوباره تلاش کن.</div>'
          : '<div class="panel-hint">مساوی شد.</div>';
    if (r !== 'win' || res.reward) SPY.updateCoins(undefined);
    renderCapInfo(res.rewardInfo);
    const again = SPY.el('button', 'btn btn-primary btn-block', 'بازی دوباره');
    again.style.marginTop = '10px';
    again.onclick = async () => {
      const res2 = await SPY.emit('ttt:ai_restart', {});
      if (res2 && res2.ok) {
        board = res2.board;
        turn = res2.turn;
        gameOver = false;
        resultEl.innerHTML = '';
        renderBoard();
        setStatus('دور جدید — تو شروع می‌کنی');
      }
    };
    resultEl.appendChild(again);
    if (r === 'win' && res.reward) {
      SPY.refreshOwned().then(() => SPY.updateCoins(SPY.state.player.coins));
    }
  }

  // ── آنلاین ──
  document.getElementById('pvp-queue').onclick = async () => {
    const btn = document.getElementById('pvp-queue');
    btn.disabled = true;
    btn.textContent = 'در حال ورود به صف…';
    const res = await SPY.emit('ttt:pvp_queue', {});
    btn.disabled = false;
    btn.textContent = 'ورود به صف بازی آنلاین';
    if (!res || !res.ok) {
      SPY.toast((res && res.msg) || 'خطا', 'err');
      return;
    }
    if (res.waiting) {
      boardCard.style.display = '';
      sessionKind = 'pvp-waiting';
      board = Array(9).fill(null);
      renderBoard();
      setStatus('در صف هم‌ترازی… منتظر حریف! (برای خروج، «اتمام بازی» را بزن)');
      leaveBtn.style.display = '';
      resultEl.innerHTML = '';
    }
  };

  leaveBtn.onclick = async () => {
    if (sessionKind === 'pvp' || sessionKind === 'pvp-waiting') {
      await SPY.emit('ttt:pvp_leave', {});
    }
    sessionKind = null;
    boardCard.style.display = 'none';
    resultEl.innerHTML = '';
    leaveBtn.style.display = 'none';
  };

  SPY.on('ttt:pvp_start', (d) => {
    sessionKind = 'pvp';
    mySymbol = d.symbol;
    board = d.board;
    turn = d.turn;
    gameOver = false;
    opponent = d.opponent;
    renderCapInfo(d.rewardInfo);
    boardCard.style.display = '';
    leaveBtn.style.display = '';
    resultEl.innerHTML = '';
    renderBoard();
    setStatus(`حریف: ${d.opponent.name} — تو ${d.symbol === 'X' ? 'X (شروع‌کننده)' : 'O'} هستی`);
    SPY_AUDIO.playSfx('join');
  });
  SPY.on('ttt:pvp_state', (d) => {
    board = d.board;
    turn = d.turn;
    opponent = d.opponent;
    renderBoard();
    if (d.result) {
      gameOver = true;
      SPY_AUDIO.playSfx(d.result === 'win' ? 'end' : d.result === 'loss' ? 'eliminate' : 'vote');
      resultEl.innerHTML =
        d.result === 'win'
          ? `<div class="good">بردی مقابل ${SPY.esc(d.opponent.name)}! +${SPY.fa(5)} سکه${d.note ? ' · ' + SPY.esc(d.note) : ''}</div>`
          : d.result === 'loss'
            ? `<div class="bad">${SPY.esc(d.opponent.name)} برد.</div>`
            : '<div class="panel-hint">مساوی شد.</div>';
      const again = SPY.el('button', 'btn btn-primary btn-block', 'درخواست بازی مجدد');
      again.style.marginTop = '10px';
      again.onclick = async () => {
        const res = await SPY.emit('ttt:pvp_rematch', {});
        if (res && res.ok && res.waiting) {
          setStatus('درخواست فرستاده شد؛ منتظر حریف…');
        }
      };
      resultEl.appendChild(again);
      SPY.refreshOwned().then(() => SPY.updateCoins(SPY.state.player.coins));
      setStatus('بازی تمام شد.');
    } else {
      setStatus(`حریف: ${d.opponent.name} — نوبت ${turn === mySymbol ? 'تو' : 'حریف'}`);
      if (d.by && d.by !== mySymbol) SPY_AUDIO.playSfx('vote');
    }
  });
  SPY.on('ttt:pvp_rematch_req', () => SPY.toast('حریف بازی مجدد را خواست!'));
  SPY.on('ttt:pvp_left', () => {
    SPY.toast('حریف بازی را ترک کرد.', 'err');
    sessionKind = null;
    boardCard.style.display = 'none';
    resultEl.innerHTML = '';
  });

  SPY.connectSocket();
})();
