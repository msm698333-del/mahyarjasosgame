// ─── مدیریت صدا: موسیقی بخش‌ها + افکت‌ها ───
// نکته: استیکرها عمداً بی‌صدا هستند (طبق طراحی بازی).
(function () {
  const SET_KEY = 'spy_audio';
  let settings;
  try {
    settings = Object.assign({ music: true, sfx: true, musicVol: 0.55, sfxVol: 0.9 }, JSON.parse(localStorage.getItem(SET_KEY) || '{}'));
  } catch (e) {
    settings = { music: true, sfx: true, musicVol: 0.55, sfxVol: 0.9 };
  }
  function save() {
    localStorage.setItem(SET_KEY, JSON.stringify(settings));
  }

  const MUSIC = {
    menu: 'assets/audio/music_menu.wav',
    lobby: 'assets/audio/music_lobby.wav',
    start: 'assets/audio/music_start.wav',
    night: 'assets/audio/music_night.wav',
    vote: 'assets/audio/music_vote.wav',
    end: 'assets/audio/music_end.wav',
  };
  const SFX = {
    join: 'assets/audio/sfx_join.wav',
    start: 'assets/audio/sfx_start.wav',
    eliminate: 'assets/audio/sfx_eliminate.wav',
    vote: 'assets/audio/sfx_vote.wav',
    end: 'assets/audio/sfx_end.wav',
  };

  let musicEl = null;
  let current = null;
  let unlocked = false;

  function ensureMusicEl() {
    if (!musicEl) {
      musicEl = new Audio();
      musicEl.loop = true;
      musicEl.preload = 'none';
    }
    return musicEl;
  }

  function playMusic(name) {
    if (!settings.music || !MUSIC[name]) return;
    const a = ensureMusicEl();
    if (current === name) {
      if (a.paused) a.play().catch(() => {});
      return;
    }
    current = name;
    a.src = MUSIC[name];
    a.volume = settings.musicVol;
    a.play().catch(() => {}); // تا پیش از اولین لمس ممکن است مرورگر اجازه ندهد؛ unlock بعداً پخش می‌کند
  }

  function stopMusic() {
    current = null;
    if (musicEl) musicEl.pause();
  }

  function playSfx(name) {
    if (!settings.sfx || !SFX[name]) return;
    try {
      const a = new Audio(SFX[name]);
      a.volume = settings.sfxVol;
      a.play().catch(() => {});
    } catch (e) {
      /* ignore */
    }
  }

  function unlock() {
    if (unlocked) return;
    unlocked = true;
    if (current && musicEl && musicEl.paused) musicEl.play().catch(() => {});
  }
  document.addEventListener('pointerdown', unlock);
  document.addEventListener('keydown', unlock);

  function set(k, v) {
    settings[k] = v;
    save();
    if (k === 'musicVol' && musicEl) musicEl.volume = v;
    if (k === 'music' && !v) stopMusic();
  }
  function get() {
    return Object.assign({}, settings);
  }

  window.SPY_AUDIO = { playMusic, stopMusic, playSfx, unlock, set, get, MUSIC, SFX };
})();
