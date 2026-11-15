(async () => {
  const p = await SPY.requireAuth();
  if (!p) return;
  SPY.topbar();

  const MOTION_KEY = 'spy_reduce_motion';
  const a = SPY_AUDIO.get();

  const musicToggle = document.getElementById('music-toggle');
  const sfxToggle = document.getElementById('sfx-toggle');
  const musicVol = document.getElementById('music-vol');
  const sfxVol = document.getElementById('sfx-vol');
  const motionToggle = document.getElementById('motion-toggle');

  musicToggle.checked = a.music;
  sfxToggle.checked = a.sfx;
  musicVol.value = Math.round(a.musicVol * 100);
  sfxVol.value = Math.round(a.sfxVol * 100);
  motionToggle.checked = localStorage.getItem(MOTION_KEY) === '1';

  function applyMotion() {
    document.body.classList.toggle('reduce-motion', localStorage.getItem(MOTION_KEY) === '1');
  }
  applyMotion();

  musicToggle.onchange = () => SPY_AUDIO.set('music', musicToggle.checked);
  sfxToggle.onchange = () => SPY_AUDIO.set('sfx', sfxToggle.checked);
  musicVol.oninput = () => SPY_AUDIO.set('musicVol', musicVol.value / 100);
  sfxVol.oninput = () => SPY_AUDIO.set('sfxVol', sfxVol.value / 100);
  motionToggle.onchange = () => {
    localStorage.setItem(MOTION_KEY, motionToggle.checked ? '1' : '0');
    applyMotion();
  };

  document.getElementById('test-music').onclick = () => {
    SPY_AUDIO.set('music', true);
    musicToggle.checked = true;
    SPY_AUDIO.playMusic('menu');
    SPY.toast('موسیقی منو پخش شد.', 'ok');
  };
  document.getElementById('test-sfx').onclick = () => {
    SPY_AUDIO.set('sfx', true);
    sfxToggle.checked = true;
    SPY_AUDIO.playSfx('join');
  };

  document.getElementById('clear-identity').onclick = async () => {
    const ok = await SPY.confirmBox(
      'هویت این دستگاه پاک شود؟ سکه‌ها و آواتارهای حساب فعلی دیگر در دسترس نخواهند بود.',
      'پاک کن',
      true
    );
    if (!ok) return;
    try {
      await SPY.api('/api/identity/clear', { method: 'POST' });
    } catch (e) {
      /* حتی اگر شبکه قطع باشد، محلی پاک می‌کنیم */
    }
    SPY.setToken(null);
    SPY.clearRoom();
    location.href = 'index.html';
  };
})();
