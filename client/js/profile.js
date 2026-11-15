(async () => {
  const p = await SPY.requireAuth();
  if (!p) return;
  SPY.topbar();
  const box = document.getElementById('profile-box');

  function rate(wins, matches) {
    if (!matches) return '—';
    return SPY.fa(Math.round((wins / matches) * 100)) + '٪';
  }

  function render() {
    const pl = SPY.state.player;
    const owned = SPY.state.owned;
    const wins = pl.stats.wins;
    const matches = pl.stats.matches;
    box.innerHTML = `
      <div class="card anim-in center">
        <div style="display:flex;justify-content:center" id="big-avatar"></div>
        <div style="font-size:19px;font-weight:900;margin-top:8px" id="pname">${SPY.esc(pl.name)}</div>
        <div class="muted small">شناسه: <span dir="ltr">${pl.id.slice(0, 10)}…</span></div>
        <div class="divider"></div>
        <div class="row" style="justify-content:center">
          <button class="btn btn-sm" id="edit-name-btn">تغییر نام</button>
          <a class="btn btn-sm btn-gold" href="shop.html">فروشگاه آواتار</a>
        </div>
      </div>
      <div class="card anim-in">
        <div class="card-title"><span class="dot"></span>آمار مسابقه‌ها</div>
        <div class="stat-grid">
          <div class="stat-box"><div class="s-num">${SPY.fa(matches)}</div><div class="s-label">مسابقه</div></div>
          <div class="stat-box"><div class="s-num">${SPY.fa(wins)}</div><div class="s-label">برد</div></div>
          <div class="stat-box"><div class="s-num">${SPY.fa(pl.stats.losses)}</div><div class="s-label">باخت</div></div>
        </div>
        <div class="center muted small" style="margin-top:8px">نرخ برد: ${rate(wins, matches)}</div>
      </div>
      <div class="card anim-in">
        <div class="card-title"><span class="dot"></span>آواتارهای من (${SPY.fa(owned.length)})</div>
        <div class="shop-grid" id="owned-grid"></div>
        <div class="hint">برای پوشیدن، روی آواتار بزن. آواتارهای بیشتر در فروشگاه.</div>
      </div>`;

    document.getElementById('big-avatar').appendChild(SPY.avatar(pl.avatar, 96, { status: true }));

    const grid = document.getElementById('owned-grid');
    owned.forEach((id) => {
      const item = SPY.el('div', 'shop-item' + (id === pl.avatar ? ' equipped' : ' owned'));
      const img = document.createElement('img');
      img.src = SPY.avatarUrl(id);
      img.alt = 'آواتار';
      item.appendChild(img);
      item.appendChild(SPY.el('div', id === pl.avatar ? 'price' : 'price free', id === pl.avatar ? 'پوشیده شده' : 'انتخاب'));
      item.onclick = async () => {
        if (id === pl.avatar) return;
        const r = await SPY.api('/api/me/avatar', { method: 'POST', body: JSON.stringify({ avatarId: id }) });
        if (r.status === 200) {
          SPY.state.player = r.data.player;
          SPY.topbar();
          render();
          SPY.toast('آواتار عوض شد!', 'ok');
        } else {
          SPY.toast((r.data && r.data.msg) || 'خطا', 'err');
        }
      };
      grid.appendChild(item);
    });

    document.getElementById('edit-name-btn').onclick = () => {
      const m = SPY.modal(
        `<h3>تغییر نام</h3>
         <input class="input" id="new-name" maxlength="16" value="${SPY.esc(pl.name)}"/>
         <button class="btn btn-primary btn-block" id="save-name" style="margin-top:10px">ذخیره</button>`
      );
      m.el.querySelector('#save-name').onclick = async () => {
        const name = m.el.querySelector('#new-name').value.trim();
        const r = await SPY.api('/api/me/name', { method: 'POST', body: JSON.stringify({ name }) });
        if (r.status === 200) {
          SPY.state.player = r.data.player;
          SPY.topbar();
          render();
          m.close();
          SPY.toast('نام ذخیره شد.', 'ok');
        } else {
          SPY.toast((r.data && r.data.msg) || 'نام نامعتبر است.', 'err');
        }
      };
    };
  }

  await SPY.refreshOwned();
  render();
})();
