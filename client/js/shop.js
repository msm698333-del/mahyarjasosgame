(async () => {
  const p = await SPY.requireAuth();
  if (!p) return;
  SPY.topbar();
  const grid = document.getElementById('shop-grid');

  async function load() {
    await SPY.refreshOwned();
    const r = await SPY.api('/api/avatars');
    const avatars = (r.data && r.data.avatars) || [];
    const me = SPY.state.player;
    grid.innerHTML = '';
    avatars.forEach((a) => {
      const equipped = a.id === me.avatar;
      const item = SPY.el(
        'div',
        'shop-item' + (a.owned ? ' owned' : '') + (equipped ? ' equipped' : '')
      );
      const img = document.createElement('img');
      img.src = SPY.avatarUrl(a.id);
      img.alt = 'آواتار ' + a.id;
      item.appendChild(img);
      if (a.price === 0) {
        item.appendChild(SPY.el('div', 'price free', 'رایگان'));
      } else if (a.owned) {
        item.appendChild(SPY.el('div', 'price free', 'خریده‌شده'));
        item.appendChild(SPY.el('span', 'owned-tag', 'مالک'));
      } else {
        const pr = SPY.el('div', 'price');
        pr.innerHTML = `<span class="coin-dot"></span>${SPY.fa(a.price)}`;
        item.appendChild(pr);
      }
      item.onclick = () => openItem(a);
      grid.appendChild(item);
    });
  }

  function openItem(a) {
    const me = SPY.state.player;
    const isEquipped = a.id === me.avatar;
    let actions = '';
    if (isEquipped) actions = '<div class="good center">این آواتار الان پوشیده شده است.</div>';
    else if (a.owned) actions = '<button class="btn btn-gold btn-block" id="act">پوشیدن</button>';
    else if (a.price === 0)
      actions = '<button class="btn btn-gold btn-block" id="act">انتخاب (رایگان)</button>';
    else
      actions =
        me.coins >= a.price
          ? `<button class="btn btn-gold btn-block" id="act">خرید با ${SPY.fa(a.price)} سکه</button><div class="hint">موجودی: ${SPY.fa(me.coins)} سکه</div>`
          : `<div class="bad">برای این آواتار ${SPY.fa(a.price)} سکه لازم است؛ موجودی تو ${SPY.fa(me.coins)} است. با مسابقه‌ها و بازی دوز سکه جمع کن.</div><a class="btn btn-block" href="ttt.html" style="margin-top:8px">رفتن به بازی دوز</a>`;

    const m = SPY.modal(
      `<h3>آواتار ${SPY.esc(a.id.replace('a', 'شماره '))}</h3>
       <div class="center"><img src="${SPY.avatarUrl(a.id)}" alt="پیش‌نمایش آواتار" style="width:120px;height:120px"/></div>
       <div style="margin-top:12px">${actions}</div>`
    );
    const btn = m.el.querySelector('#act');
    if (btn) {
      btn.onclick = async () => {
        btn.disabled = true;
        if (a.owned || a.price === 0) {
          const r = await SPY.api('/api/me/avatar', { method: 'POST', body: JSON.stringify({ avatarId: a.id }) });
          if (r.status === 200) {
            SPY.state.player = r.data.player;
            m.close();
            load();
            SPY.toast('آواتار پوشیده شد!', 'ok');
          } else {
            btn.disabled = false;
            SPY.toast((r.data && r.data.msg) || 'خطا', 'err');
          }
        } else {
          const r = await SPY.api('/api/shop/buy', { method: 'POST', body: JSON.stringify({ avatarId: a.id }) });
          if (r.status === 200) {
            SPY.state.player = r.data.player;
            SPY.updateCoins(r.data.player.coins);
            m.close();
            load();
            SPY.toast('خرید موفق — آواتار مال تو شد!', 'ok');
            SPY_AUDIO.playSfx('end');
          } else {
            btn.disabled = false;
            SPY.toast((r.data && r.data.msg) || 'خطا در خرید', 'err');
          }
        }
      };
    }
  }

  load();
})();
