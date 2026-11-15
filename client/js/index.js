(async () => {
  SPY.topbar();
  SPY_AUDIO.playMusic('menu');

  const p = await SPY.loadMe().catch(() => null);
  if (p) {
    location.href = 'home.html';
    return;
  }
  // اگر کاربر پیش‌تر مهمان بوده و صفحه را با پارامتر خطا باز کرده
  const params = new URLSearchParams(location.search);
  if (params.get('e') || params.get('need')) {
    document.getElementById('enter-msg').textContent = 'نشست قبلی منقضی شده؛ فقط یک بار نامت را وارد کن.';
  }

  const input = document.getElementById('name-input');
  const btn = document.getElementById('enter-btn');
  const msg = document.getElementById('enter-msg');

  async function go() {
    const name = input.value.trim();
    if (name.length < 2) {
      msg.textContent = 'نام باید حداقل ۲ حرف باشد.';
      input.focus();
      return;
    }
    btn.disabled = true;
    btn.textContent = 'در حال ورود…';
    try {
      await SPY.register(name);
      location.href = 'home.html';
    } catch (e) {
      btn.disabled = false;
      btn.textContent = 'ورود به بازی';
      msg.textContent = (e && e.msg) || 'خطا در ورود؛ دوباره تلاش کن.';
    }
  }
  btn.onclick = go;
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') go();
  });
  input.focus();
})();
