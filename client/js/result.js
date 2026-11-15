(async () => {
  const p = await SPY.requireAuth();
  if (!p) return;
  SPY.topbar();
  SPY_AUDIO.playMusic('end');

  const params = new URLSearchParams(location.search);
  const code = params.get('code') || SPY.loadRoom();
  const box = document.getElementById('result-box');

  let over = null;
  try {
    over = JSON.parse(sessionStorage.getItem('spy_last_over') || 'null');
  } catch (e) {
    over = null;
  }

  let isHost = false;

  function render() {
    if (!over) return;
    const win = over.winner === 'citizens';
    const meRole = (over.roles.find((r) => r.id === p.id) || {}).role;
    const iWon = meRole === 'spy' ? !win : win;
    const reward = (over.rewards.find((r) => r.id === p.id) || {}).delta || 0;
    const grid = over.roles
      .map(
        (r) => `<div class="player-card ${r.alive ? '' : 'dead'}">
          <div class="avatar-frame ${r.alive ? '' : 'dead'}"><img src="${SPY.avatarUrl(r.avatar)}" alt="" style="width:46px;height:46px;border-radius:50%"/><span class="num-badge">${SPY.fa(r.number)}</span></div>
          <div class="pc-name">${SPY.esc(r.name)}</div>
          <div class="pc-tag"><span class="role-pill ${r.role === 'spy' ? 'spy' : 'citizen'}">${r.role === 'spy' ? 'جاسوس' : 'شهروند'}</span></div>
        </div>`
      )
      .join('');
    const order = (over.order || [])
      .map((e) => {
        const byTxt = e.by === 'night' ? 'حذف شبانه' : e.by === 'shot' ? 'شات جاسوس' : e.by === 'declare' ? 'اعلام اشتباه جاسوس' : 'رأی بازیکن‌ها';
        return `<div class="hist-row"><span class="result-badge ${e.role === 'spy' ? 'loss' : 'win'}">${e.role === 'spy' ? 'جاسوس' : 'شهروند'}</span>
          <div class="h-main"><div class="h-title">${SPY.esc(e.name)} حذف شد</div><div class="h-sub">روز ${SPY.fa(e.day)} · ${byTxt}</div></div></div>`;
      })
      .join('');
    box.innerHTML = `
      <div class="card anim-in center" style="border-color:${win ? 'rgba(52,211,153,0.5)' : 'rgba(251,113,133,0.5)'}">
        <div style="font-size:24px;font-weight:900;color:${win ? 'var(--ok)' : 'var(--danger)'}">${win ? 'شهروندها بردند!' : 'جاسوس‌ها بردند!'}</div>
        <div class="muted small" id="over-reason"></div>
        <div style="margin:12px 0">
          <span class="rc-cat" style="display:inline-block;background:var(--glass-2);border:1px solid var(--line);padding:6px 16px;border-radius:999px;font-size:15px">کلمه مخفی: <b class="gold-text">${SPY.esc(over.word)}</b></span>
        </div>
        <div class="muted small">دسته: ${SPY.esc(over.category || '')}</div>
      </div>
      <div class="card anim-in">
        <div class="card-title"><span class="dot"></span>نقش همه بازیکن‌ها</div>
        <div class="players-grid">${grid}</div>
        <div class="divider"></div>
        <div class="row-between">
          <span class="muted small">نقش تو: ${meRole === 'spy' ? 'جاسوس' : 'شهروند'}</span>
          <span class="coin-pill"><span class="coin-dot"></span>${iWon ? '+' : '+'}${SPY.fa(reward)} سکه</span>
        </div>
      </div>
      ${order ? `<div class="card anim-in"><div class="card-title"><span class="dot"></span>ترتیب حذف‌ها</div>${order}</div>` : ''}
      <div class="card anim-in stack">
        ${isHost ? '<button class="btn btn-gold btn-lg btn-block" id="rematch-btn">بازی مجدد (ورود دوباره محاسبه می‌شود)</button><div class="hint">ورود رایگان‌ها اول مصرف می‌شوند؛ بازیکنانی که سکه کافی نداشته باشند از لابی جدید خارج می‌شوند.</div>' : '<div class="panel-hint">میزبان می‌تواند «بازی مجدد» را راه بیندازد؛ منتظر بمان یا به خانه برگرد.</div>'}
        <a class="btn btn-primary btn-lg btn-block" href="home.html">بازگشت به خانه</a>
      </div>`;
    const reasons = {
      all_spies_caught: 'همه جاسوس‌ها شناسایی و حذف شدند.',
      parity: 'جاسوس‌ها به تعداد شهروندها رسیده و کنترل بازی را گرفتند.',
      word_guessed: 'جاسوس کلمه مخفی را درست حدس زد.',
    };
    document.getElementById('over-reason').textContent = (reasons[over.reason] || '') + (over.test ? ' · اتاق آزمایشی بود — بدون سکه و آمار' : '');
    const rb = document.getElementById('rematch-btn');
    if (rb) {
      rb.onclick = async () => {
        const ok = await SPY.confirmBox('بازی جدید با همین بازیکن‌ها ساخته شود؟ (ورود هر بازیکن دوباره محاسبه می‌شود)', 'بازی مجدد');
        if (!ok) return;
        rb.disabled = true;
        const res = await SPY.emit('room:rematch', {});
        if (!res || !res.ok) {
          rb.disabled = false;
          SPY.toast((res && res.msg) || 'خطا', 'err');
        }
      };
    }
  }

  SPY.connectSocket();
  SPY.on('connect', async () => {
    if (!code) return;
    const res = await SPY.emit('room:rejoin', { code });
    if (res && res.ok && res.info !== false) {
      // اسنپ‌شات کامل بازی برای وقتی که sessionStorage خالی است
      if (!over && res.state && res.state.over) {
        over = res.state.over;
        render();
      }
      if (res.room && res.room.hostId === p.id) {
        isHost = true;
        render();
      }
    }
  });
  SPY.on('room:state', (S) => {
    if (S && S.status === 'lobby') {
      location.href = 'lobby.html?code=' + S.code;
    }
  });
  SPY.on('room:kicked', (d) => {
    SPY.toast((d && d.msg) || '', 'err');
  });

  render();
})();
