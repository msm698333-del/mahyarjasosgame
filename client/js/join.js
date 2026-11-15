(async () => {
  const p = await SPY.requireAuth();
  if (!p) return;
  SPY.topbar();
  SPY_AUDIO.playMusic('lobby');

  const input = document.getElementById('code-input');
  const infoBox = document.getElementById('room-info');
  const joinBtn = document.getElementById('join-btn');
  const msg = document.getElementById('join-msg');
  let info = null;
  let lookupTimer = null;

  input.addEventListener('input', () => {
    input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    info = null;
    joinBtn.disabled = true;
    infoBox.innerHTML = '<span class="muted small">…</span>';
    clearTimeout(lookupTimer);
    lookupTimer = setTimeout(lookup, 400);
  });

  async function lookup() {
    const code = input.value.trim();
    if (code.length < 6) {
      infoBox.innerHTML = '<span class="muted small">کد ۶ حرفی را کامل وارد کن.</span>';
      return;
    }
    const res = await SPY.emit('room:info', { code });
    if (!res || !res.ok) {
      infoBox.innerHTML = '<span class="muted small">بررسی کد…</span>';
      return;
    }
    info = res.info;
    if (!info.exists) {
      infoBox.innerHTML = '<span class="bad" style="display:block">لابی با این کد پیدا نشد؛ کد را دوباره چک کن.</span>';
      return;
    }
    if (!info.open) {
      infoBox.innerHTML = `<span class="bad" style="display:block">${info.status !== 'lobby' ? 'بازی این لابی شروع شده و ورود ممکن نیست.' : 'ظرفیت لابی پر است.'}</span>`;
      return;
    }
    const costLine = info.cost === 0
      ? `ورود رایگان (${SPY.fa(info.freeLeft)} ورود رایگان مانده)`
      : `هزینه ورود: <b class="gold-text">${SPY.fa(info.cost)}</b> سکه`;
    infoBox.innerHTML = `<span class="good" style="display:block">لابی پیدا شد — ${SPY.fa(info.count)} از ${SPY.fa(info.slots)} نفر حاضرند · ${costLine}</span>`;
    joinBtn.disabled = false;
  }

  joinBtn.onclick = async () => {
    if (!info) return;
    joinBtn.disabled = true;
    joinBtn.textContent = 'در حال ورود…';
    const res = await SPY.emit('room:join', { code: info.code });
    if (res && res.ok) {
      SPY.saveRoom(res.code);
      location.href = 'lobby.html?code=' + res.code;
    } else {
      joinBtn.disabled = false;
      joinBtn.textContent = 'ورود به لابی';
      if (res && res.code === 'no_coins') {
        const go = await SPY.confirmBox(
          `برای ورود به این لابی ${SPY.fa(res.need || info.fee)} سکه لازم است و موجودی تو ${SPY.fa(res.have || 0)} سکه است. می‌خواهی با بازی دوز سکه جمع کنی؟`,
          'رفتن به بازی دوز'
        );
        if (go) location.href = 'ttt.html?ref=entry';
        return;
      }
      msg.textContent = (res && res.msg) || 'خطا در ورود به لابی.';
      SPY.toast(msg.textContent, 'err');
      lookup();
    }
  };

  input.focus();
  // اتصال سوکت برای استعلام کد
  SPY.connectSocket();
  SPY.on('connect', () => { if (input.value.length === 6) lookup(); });
})();
