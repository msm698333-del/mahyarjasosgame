(async () => {
  const p = await SPY.requireAuth();
  if (!p) return;
  SPY.topbar();
  SPY_AUDIO.playMusic('lobby');
  const me = SPY.state.player;

  const SLOTS_MIN = 4, SLOTS_MAX = 12;
  const FEES = [0, 5, 10, 15, 25, 50, 100];
  let slots = 8;
  let fee = SPY.CFG_DEFAULT_FEE != null ? SPY.CFG_DEFAULT_FEE : 10;

  function chipRow(elId, values, current, onPick) {
    const box = document.getElementById(elId);
    box.innerHTML = '';
    values.forEach((v) => {
      const c = SPY.el('button', 'chip' + (v === current ? ' active' : ''), SPY.fa(v));
      c.onclick = () => {
        box.querySelectorAll('.chip').forEach((x) => x.classList.remove('active'));
        c.classList.add('active');
        onPick(v);
      };
      box.appendChild(c);
    });
  }

  function renderCost() {
    const box = document.getElementById('cost-preview');
    if (me.freeEntries > 0) {
      box.innerHTML = `<span class="good">ورود تو به این لابی رایگان است — ${SPY.fa(me.freeEntries)} ورود رایگان باقی مانده.</span>`;
    } else if (me.coins >= fee) {
      box.innerHTML = `<span class="good">هزینه ورود تو: <b class="gold-text">${SPY.fa(fee)}</b> سکه — موجودی: ${SPY.fa(me.coins)} سکه.</span>`;
    } else {
      box.innerHTML = `<span class="bad">ورود این لابی ${SPY.fa(fee)} سکه است و موجودی تو ${SPY.fa(me.coins)} سکه است. از «بازی دوز» سکه جمع کن.</span>`;
    }
  }

  chipRow('slots-chips', Array.from({ length: SLOTS_MAX - SLOTS_MIN + 1 }, (_, i) => i + SLOTS_MIN), slots, (v) => { slots = v; });
  chipRow('fee-chips', FEES, fee, (v) => { fee = v; renderCost(); });
  renderCost();

  const btn = document.getElementById('create-btn');
  const msg = document.getElementById('create-msg');

  btn.onclick = () => {
    if (me.freeEntries === 0 && me.coins < fee) {
      location.href = 'ttt.html?ref=entry';
      return;
    }
    btn.disabled = true;
    btn.textContent = 'در حال ساخت…';
    SPY.connectSocket();
    SPY.on('connect', async () => {
      const res = await SPY.emit('room:create', { slots, fee });
      if (res && res.ok) {
        SPY.saveRoom(res.code);
        location.href = 'lobby.html?code=' + res.code;
      } else {
        btn.disabled = false;
        btn.textContent = 'ساخت لابی';
        if (res && res.code === 'no_coins') {
          location.href = 'ttt.html?ref=entry';
          return;
        }
        msg.textContent = (res && res.msg) || 'خطا در ساخت لابی.';
        SPY.toast(msg.textContent, 'err');
      }
    });
  };
})();
