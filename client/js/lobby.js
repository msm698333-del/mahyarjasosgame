(async () => {
  const p = await SPY.requireAuth();
  if (!p) return;
  SPY.topbar();
  SPY_AUDIO.playMusic('lobby');

  const params = new URLSearchParams(location.search);
  const code = params.get('code') || SPY.loadRoom();
  if (!code) {
    location.href = 'home.html';
    return;
  }
  SPY.saveRoom(code);

  const SLOTS_MIN = 4, SLOTS_MAX = 12;
  const FEES = [0, 5, 10, 15, 25, 50, 100];
  let lastCount = 0;
  let myReady = false;

  const connEl = document.getElementById('conn');
  const connText = document.getElementById('conn-text');
  const setConn = (on) => {
    connEl.classList.toggle('on', !!on);
    connText.textContent = on ? 'متصل' : 'در حال اتصال مجدد…';
  };

  document.getElementById('lobby-code').textContent = code;
  document.getElementById('copy-btn').onclick = async () => {
    try {
      await navigator.clipboard.writeText(code);
      SPY.toast('کد لابی کپی شد — برای دوستانت بفرست!', 'ok');
    } catch (e) {
      SPY.toast('کد: ' + code);
    }
  };

  function chipRow(elId, values, current, onPick) {
    const box = document.getElementById(elId);
    box.innerHTML = '';
    values.forEach((v) => {
      const c = SPY.el('button', 'chip' + (v === current ? ' active' : ''), SPY.fa(v));
      c.onclick = () => onPick(v);
      box.appendChild(c);
    });
  }

  function render(S) {
    document.getElementById('count-info').textContent =
      `${SPY.fa(S.players.length)} از ${SPY.fa(S.slots)} بازیکن حاضر${S.players.length >= SLOTS_MIN ? ' — می‌شود شروع کرد' : ''}`;
    document.getElementById('fee-info').textContent =
      S.fee === 0 ? 'ورود رایگان' : `هزینه ورود: ${SPY.fa(S.fee)} سکه (رایگان‌ها مستثنا)`;

    const grid = document.getElementById('players');
    grid.className = 'players-grid' + (S.players.length === 4 ? ' n4' : '');
    grid.innerHTML = '';
    S.players.forEach((pl) => {
      const card = SPY.el('div', 'player-card' + (pl.connected ? '' : ' dead'));
      const frame = SPY.avatar(pl.avatar, 52, { status: pl.connected });
      card.appendChild(frame);
      const nm = SPY.el('div', 'pc-name');
      nm.textContent = pl.name; // امن: textContent
      card.appendChild(nm);
      const tag = SPY.el('div', 'pc-tag');
      if (pl.isHost) tag.appendChild(SPY.el('span', 'crown', 'میزبان'));
      tag.appendChild(SPY.el('span', '', pl.ready ? 'آماده' : 'در انتظار'));
      card.appendChild(tag);
      grid.appendChild(card);
    });

    if (S.players.length > lastCount) SPY_AUDIO.playSfx('join');
    lastCount = S.players.length;

    const me = S.me || {};
    myReady = !!me.ready;
    const readyBtn = document.getElementById('ready-btn');
    readyBtn.textContent = myReady ? 'آماده شدم — لغو آمادگی' : 'آماده‌ام!';
    readyBtn.className = 'btn btn-lg btn-block ' + (myReady ? 'btn-ghost' : 'btn-gold');

    const isHost = S.hostId === (SPY.state.player && SPY.state.player.id);
    document.getElementById('host-settings').style.display = isHost ? '' : 'none';
    document.getElementById('host-panel').style.display = isHost ? '' : 'none';
    if (isHost) {
      chipRow('slots-chips', Array.from({ length: SLOTS_MAX - SLOTS_MIN + 1 }, (_, i) => i + SLOTS_MIN), S.slots, (v) => SPY.emit('room:slots', { slots: v }));
      chipRow('fee-chips', FEES, S.fee, (v) => SPY.emit('room:fee', { fee: v }));
      const startBtn = document.getElementById('start-btn');
      startBtn.disabled = !S.canStart;
      startBtn.textContent = S.canStart ? 'شروع بازی' : 'منتظر بازیکن‌های بیشتر…';
    }
  }

  document.getElementById('ready-btn').onclick = () => SPY.emit('room:ready', { ready: !myReady });
  document.getElementById('start-btn').onclick = () => SPY.emit('room:start', {});
  document.getElementById('leave-btn').onclick = async () => {
    const ok = await SPY.confirmBox('از لابی خارج می‌شوی؟', 'خروج', true);
    if (!ok) return;
    SPY.emit('room:leave', {});
    SPY.clearRoom();
    location.href = 'home.html';
  };

  SPY.connectSocket();
  SPY.on('connect', async () => {
    setConn(true);
    const res = await SPY.emit('room:rejoin', { code });
    if (!res || !res.ok) {
      SPY.clearRoom();
      SPY.toast((res && res.msg) || 'این لابی دیگر فعال نیست.', 'err');
      setTimeout(() => (location.href = 'home.html'), 900);
    }
  });
  SPY.on('disconnect', () => setConn(false));
  SPY.on('connect_error', () => setConn(false));

  SPY.on('room:state', (S) => {
    if (!S) return;
    render(S);
    if (S.status === 'playing' || S.status === 'over') {
      location.href = 'game.html?code=' + S.code;
    }
  });

  // شروع بازی: برو به صفحه بازی
  SPY.on('game:init', () => {
    location.href = 'game.html?code=' + code;
  });
  SPY.on('game:resume', () => {
    location.href = 'game.html?code=' + code;
  });
  SPY.on('room:kicked', (d) => {
    SPY.toast((d && d.msg) || 'از لابی خارج شدی.', 'err');
    SPY.clearRoom();
    location.href = 'home.html';
  });
  SPY.on('err', (e) => SPY.toast((e && e.msg) || 'خطا', 'err'));
})();
