(async () => {
  const p = await SPY.requireAuth();
  if (!p) return;
  SPY.topbar();
  const box = document.getElementById('hist-box');

  const r = await SPY.api('/api/history');
  const rows = (r.data && r.data.history) || [];
  if (!rows.length) {
    box.innerHTML = `<div class="card"><div class="empty-state">
      <svg class="es-icon" viewBox="0 0 24 24" fill="none" stroke="#8d84a8" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>
      <div>هنوز مسابقه‌ای بازی نکرده‌ای.</div>
      <a class="btn btn-primary" href="create.html" style="margin-top:12px">ساخت اولین لابی</a>
    </div></div>`;
    return;
  }
  const card = SPY.el('div', 'card anim-in');
  rows.forEach((m) => {
    const win = m.result === 'win';
    const row = SPY.el('div', 'hist-row');
    row.innerHTML = `
      <span class="result-badge ${win ? 'win' : 'loss'}">${win ? 'برد' : 'باخت'}</span>
      <div class="h-main">
        <div class="h-title">${m.role === 'spy' ? 'نقش جاسوس' : 'نقش شهروند'} · ${SPY.fa(m.players_count)} بازیکن · کد لابی <span dir="ltr">${SPY.esc(m.room_code)}</span></div>
        <div class="h-sub">${SPY.faDate(m.ended_at)} · ${SPY.faTime(m.ended_at)}${m.word ? ' · کلمه: ' + SPY.esc(m.word) : ''}</div>
      </div>
      <span class="coin-delta">+${SPY.fa(m.coins_delta)}</span>`;
    card.appendChild(row);
  });
  box.appendChild(card);
})();
