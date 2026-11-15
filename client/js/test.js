// ─── بخش تست: میکروفون/ویس، صداهای بازی، اتاق آزمایشی ۲ نفره ───
(async () => {
  const p = await SPY.requireAuth();
  if (!p) return;
  SPY.topbar();

  const supported = !!(window.RTCPeerConnection && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  const rtcEl = document.getElementById('rtc-status');
  rtcEl.textContent = supported
    ? 'مرورگر از گفتگوی زنده (WebRTC) پشتیبانی می‌کند. ✓'
    : 'این مرورگر از گفتگوی زنده (WebRTC) پشتیبانی نمی‌کند — کروم/سافاری جدید را امتحان کن.';
  rtcEl.style.color = supported ? 'var(--ok)' : 'var(--danger)';

  // ── ۱) میکروفون ──
  let micStream = null;
  let audioCtx = null;
  let ana = null;
  let buf = null;
  let meterTimer = null;
  let recorder = null;
  let chunks = [];

  const micBtn = document.getElementById('mic-btn');
  const recBtn = document.getElementById('rec-btn');
  const micMeter = document.getElementById('mic-meter');
  const micStatus = document.getElementById('mic-status');

  micBtn.onclick = async () => {
    if (micStream) {
      micStream.getTracks().forEach((t) => t.stop());
      micStream = null;
      if (meterTimer) clearInterval(meterTimer);
      meterTimer = null;
      micMeter.style.width = '0%';
      micBtn.textContent = 'روشن کردن میکروفون';
      micStatus.textContent = 'میکروفون خاموش است.';
      recBtn.disabled = true;
      return;
    }
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
      micBtn.textContent = 'خاموش کردن میکروفون';
      micStatus.textContent = 'میکروفون روشن است — حرف بزن تا نوار سبز بالا برود.';
      recBtn.disabled = false;
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      await audioCtx.resume().catch(() => {});
      const src = audioCtx.createMediaStreamSource(micStream);
      ana = audioCtx.createAnalyser();
      ana.fftSize = 512;
      src.connect(ana);
      buf = new Uint8Array(ana.frequencyBinCount);
      meterTimer = setInterval(() => {
        ana.getByteTimeDomainData(buf);
        let s = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128;
          s += v * v;
        }
        const lvl = Math.sqrt(s / buf.length);
        micMeter.style.width = Math.min(100, Math.round(lvl * 260)) + '%';
      }, 120);
    } catch (e) {
      micStatus.textContent = 'اجازهٔ میکروفون داده نشد — از تنظیمات مرورگر فعالش کن (صفحه باید HTTPS باشد).';
      micStatus.style.color = 'var(--danger)';
    }
  };

  recBtn.onclick = async () => {
    if (!micStream) return;
    if (!window.MediaRecorder) {
      SPY.toast('این مرورگر ضبط صدا را پشتیبانی نمی‌کند.', 'err');
      return;
    }
    try {
      chunks = [];
      recorder = new MediaRecorder(micStream);
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        const a = new Audio(URL.createObjectURL(blob));
        a.play().catch(() => {});
        micStatus.textContent = 'در حال پخش ضبط… صدای خودت را می‌شنوی؟';
      };
      recBtn.disabled = true;
      recBtn.textContent = 'در حال ضبط…';
      micStatus.textContent = 'ضبط شروع شد — چیزی بگو!';
      recorder.start();
      setTimeout(() => {
        try {
          recorder.stop();
        } catch (e) { /* ignore */ }
        recBtn.textContent = 'ضبط ۳ ثانیه و پخش';
        recBtn.disabled = false;
      }, 3000);
    } catch (e) {
      SPY.toast('ضبط ممکن نشد.', 'err');
    }
  };

  // ── ۲) صداهای بازی ──
  const sfxGrid = document.getElementById('sfx-grid');
  const musicGrid = document.getElementById('music-grid');
  const NAME_FA = { join: 'ورود به لابی', start: 'شروع بازی', vote: 'رأی‌گیری', eliminate: 'حذف', end: 'پایان', menu: 'منو', lobby: 'لابی', night: 'شب' };
  Object.keys(SPY_AUDIO.SFX || {}).forEach((k) => {
    const b = SPY.el('button', 'chip sound-btn', NAME_FA[k] || k);
    b.onclick = () => {
      SPY_AUDIO.unlock();
      SPY_AUDIO.playSfx(k);
    };
    sfxGrid.appendChild(b);
  });
  Object.keys(SPY_AUDIO.MUSIC || {}).forEach((k) => {
    const b = SPY.el('button', 'chip sound-btn', 'موسیقی ' + (NAME_FA[k] || k));
    b.onclick = () => {
      SPY_AUDIO.unlock();
      SPY_AUDIO.playMusic(k);
    };
    musicGrid.appendChild(b);
  });

  // ── ۳) اتاق آزمایشی ۲ نفره ──
  SPY.connectSocket();
  const btn = document.getElementById('test-game-btn');
  const st = document.getElementById('test-game-status');
  btn.onclick = async () => {
    btn.disabled = true;
    btn.textContent = 'در حال ساخت…';
    const res = await SPY.emit('room:create', { slots: 2, fee: 0, test: true });
    btn.disabled = false;
    btn.textContent = 'ساخت اتاق آزمایشی ۲ نفره';
    if (res && res.ok) {
      SPY.saveRoom(res.code);
      SPY.toast('اتاق آزمایشی ساخته شد.', 'ok');
      location.href = 'lobby.html?code=' + res.code;
    } else {
      st.textContent = (res && res.msg) || 'ساخت اتاق ناموفق بود.';
      SPY.toast(st.textContent, 'err');
    }
  };
})();
