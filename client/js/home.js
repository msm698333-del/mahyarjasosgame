(async () => {
  const p = await SPY.requireAuth();
  if (!p) return;
  SPY.topbar();
  SPY_AUDIO.playMusic('menu');

  const card = document.getElementById('welcome-card');
  card.style.display = '';
  document.getElementById('hello-name').textContent = `سلام ${p.name}!`;
  document.getElementById('hello-avatar').appendChild(SPY.avatar(p.avatar, 56, { status: true }));
  const ent = document.getElementById('entries-info');
  ent.innerHTML = p.freeEntries > 0
    ? `${SPY.fa(p.freeEntries)} ورود رایگان لابی داری`
    : `ورود بعدی به لابی ${SPY.fa(10)} سکه (مقدار را میزبان لابی تعیین می‌کند)`;

  document.getElementById('menu').addEventListener('click', (e) => {
    const item = e.target.closest('.menu-item');
    if (item && item.dataset.go) location.href = item.dataset.go;
  });

  // اگر وسط بازی بودیم، کاربر را به همان بازی برگردان
  const code = SPY.loadRoom();
  if (code) {
    SPY.toast('یک لابی باز داری؛ اگر ادامه‌اش نمی‌خواهی از صفحه لابی خارج شو.');
  }
})();
