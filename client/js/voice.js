// ─── ویس زنده داخل لابی و مسابقه — نسخهٔ ۲ (رله از طریق سرور) ───
// صدا روی همان اتصالی رد و بدل می‌شود که خود بازی روی آن کار می‌کند؛
// پس روی هر اپراتور و هر شبکه‌ای — حتی پشت NAT — بدون نیاز به اتصال مستقیم کار می‌کند.
// صدای هر کس برای «همهٔ» اعضای اتاق پخش می‌شود.
(() => {
  const S = window.SPY;
  const card = document.getElementById('voice-card');
  if (!S || !card) return;

  const joinBtn = document.getElementById('voice-join');
  const micBtn = document.getElementById('voice-mic');
  const countEl = document.getElementById('voice-count');
  const meDot = document.getElementById('voice-me');
  const hintEl = document.getElementById('voice-hint');

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    joinBtn.disabled = true;
    joinBtn.style.display = 'none';
    if (countEl) countEl.textContent = 'گفتگوی صوتی در این مرورگر پشتیبانی نمی‌شود';
    return;
  }

  const myId = () => (S.state.player && S.state.player.id) || null;

  // ─── پارامترهای صدا ───
  const RATE = 16000; // نرخ نمونهٔ ارسالی (پهنای باند خوب برای گفتار)
  const FRAME = 2048; // ۱۲۸ میلی‌ثانیه در هر فریم
  const VAD_THR = 0.028; // آستانهٔ تشخیص صحبت
  const HANGOVER = 800; // ms — بعد از سکوت هم کمی ادامه بده تا بریده نشود
  const PREROLL = 2; // دو فریم آخر قبل از شروع حرف هم بفرست

  // ─── وضعیت ───
  let stream = null;
  let ctx = null; // AudioContext مشترک برای ضبط و پخش
  let active = false;
  let muted = false;
  let wantVoice = false;
  let myAna = null;
  let myBuf = null;
  let watchTimer = null;
  let infoTimer = null;

  const members = new Map(); // id → {id, name, avatar} — چه کسانی در گفتگو هستند
  const cap = { acc: null, len: 0, need: 0, node: null, src: null, sink: null };
  const preRoll = [];
  let lastTalk = 0;
  const play = new Map(); // id → {q: [Int16Array], nextT}
  let drainTimer = null;
  const WANT_KEY = 'spy_voice_on';
  try {
    if (sessionStorage.getItem(WANT_KEY) === '1') wantVoice = true;
  } catch (e) { /* ignore */ }

  // ─── نشانگر دکمه (تا کاربر متوجه شود باید بزند) ───
  const pulseStyle = document.createElement('style');
  pulseStyle.textContent =
    '.btn.pulse{animation:spypulse 1.5s infinite}@keyframes spypulse{0%,100%{box-shadow:0 0 0 0 rgba(245,197,66,.5)}55%{box-shadow:0 0 0 10px rgba(245,197,66,0)}}';
  document.head.appendChild(pulseStyle);

  function namesOf() {
    const me = myId();
    return [...members.keys()].filter((id) => id !== me).map((id) => (members.get(id) || {}).name || 'بازیکن');
  }

  // ─── نوار وضعیت — همیشه چیزی مشخص می‌کند ───
  function renderStatus() {
    if (!countEl) return;
    const others = namesOf();
    if (!active) {
      if (others.length) {
        countEl.textContent = `در گفتگو: ${others.join('، ')} — برای شنیدن صدا، دکمه را بزن`;
        countEl.style.color = 'var(--gold, #f5c542)';
      } else {
        countEl.textContent = 'گفتگوی صوتی خاموش است — دکمه را بزن تا صدای همه شنیده شود';
        countEl.style.color = '';
      }
      joinBtn.classList.add('pulse');
    } else {
      joinBtn.classList.remove('pulse');
      countEl.style.color = '';
      if (muted) countEl.textContent = 'میکروفون قطع است — صدای بقیه را می‌شنوی ولی خودت شنیده نمی‌شوی';
      else if (!others.length) countEl.textContent = 'تو در گفتگویی — منتظر ورود بقیه…';
      else countEl.textContent = `در گفتگو: ${others.join('، ')} — صدا وصل است ✓`;
    }
  }

  function markSpeaking(pid, on) {
    document.querySelectorAll(`.player-card[data-pid="${pid}"]`).forEach((c) => {
      c.classList.toggle('speaking', !!on);
    });
  }

  function setHint() {
    if (!hintEl) return;
    hintEl.style.display = '';
    hintEl.textContent =
      'صدای هر کس برای همهٔ اعضای اتاق پخش می‌شود (از طریق سرور بازی — روی هر اینترنتی وصل می‌شود). اگر صدای کسی را نمی‌شنوی، یعنی او هنوز دکمه را نزده یا اجازهٔ میکروفون نداده.';
  }

  // ─── اندازه‌گیری سطح صدای خودم (نقطهٔ سبز کنار دکمه) ───
  function watchLevels() {
    if (watchTimer) return;
    watchTimer = setInterval(() => {
      if (myAna && meDot) meDot.classList.toggle('on', !muted && level(myAna, myBuf) > 0.055);
      renderStatus();
    }, 300);
  }
  function stopWatch() {
    if (watchTimer) {
      clearInterval(watchTimer);
      watchTimer = null;
    }
  }

  function level(ana, buf) {
    if (!ana || !buf) return 0;
    ana.getByteTimeDomainData(buf);
    let s = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = (buf[i] - 128) / 128;
      s += v * v;
    }
    return Math.sqrt(s / buf.length);
  }

  // ─── ارسال: ضبط میکروفون → فریم ۱۲۸ms → فقط وقتی حرف می‌زنی ───
  async function startCapture() {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false,
    });
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    await ctx.resume().catch(() => {});
    cap.src = ctx.createMediaStreamSource(stream);
    cap.need = Math.round((FRAME / RATE) * ctx.sampleRate); // تعداد نمونهٔ ۱۲۸ms با نرخ خود مرورگر
    cap.acc = new Float32Array(cap.need * 2);
    cap.len = 0;
    const ingest = (chunk) => {
      let i = 0;
      while (i < chunk.length) {
        const n = Math.min(cap.acc.length - cap.len, chunk.length - i);
        cap.acc.set(chunk.subarray(i, i + n), cap.len);
        cap.len += n;
        i += n;
        if (cap.len >= cap.need) {
          emitFrame(resample(cap.acc.subarray(0, cap.need), FRAME));
          cap.len = 0;
        }
      }
    };
    if (ctx.audioWorklet) {
      const code =
        'class C extends AudioWorkletProcessor{process(i){const c=i[0]&&i[0][0];if(c)this.port.postMessage(c.slice(0));return true}}registerProcessor("spy-cap",C)';
      const url = URL.createObjectURL(new Blob([code], { type: 'application/javascript' }));
      await ctx.audioWorklet.addModule(url);
      cap.node = new AudioWorkletNode(ctx, 'spy-cap');
      cap.node.port.onmessage = (e) => ingest(e.data);
      cap.src.connect(cap.node); // به خروجی وصل نمی‌شود تا اکو نشود
    } else {
      cap.node = ctx.createScriptProcessor(2048, 1, 1);
      cap.node.onaudioprocess = (e) => ingest(e.inputBuffer.getChannelData(0));
      cap.src.connect(cap.node);
      cap.sink = ctx.createGain();
      cap.sink.gain.value = 0; // بی‌صدا — فقط برای فعال ماندن پردازش
      cap.node.connect(cap.sink);
      cap.sink.connect(ctx.destination);
    }
    const ana = ctx.createAnalyser();
    ana.fftSize = 512;
    cap.src.connect(ana);
    myAna = ana;
    myBuf = new Uint8Array(ana.frequencyBinCount);
  }

  function resample(f, out) {
    const o = new Float32Array(out);
    const ratio = (f.length - 1) / (out - 1);
    for (let i = 0; i < out; i++) {
      const p = i * ratio;
      const i0 = Math.floor(p);
      const i1 = Math.min(f.length - 1, i0 + 1);
      const fr = p - i0;
      o[i] = f[i0] * (1 - fr) + f[i1] * fr;
    }
    return o;
  }

  function toInt16(f) {
    const a = new Int16Array(f.length);
    for (let i = 0; i < f.length; i++) {
      const v = Math.max(-1, Math.min(1, f[i]));
      a[i] = v < 0 ? v * 32768 : v * 32767;
    }
    return a;
  }

  function emitFrame(f32) {
    if (!active) return;
    let s = 0;
    for (let i = 0; i < f32.length; i++) s += f32[i] * f32[i];
    const rms = Math.sqrt(s / f32.length);
    const now = Date.now();
    if (rms > VAD_THR) lastTalk = now;
    const talking = !muted && now - lastTalk < HANGOVER;
    if (talking) {
      while (preRoll.length) sendFrame(preRoll.shift());
      sendFrame(toInt16(f32));
    } else {
      if (muted) preRoll.length = 0;
      const i16 = toInt16(f32);
      preRoll.push(i16);
      if (preRoll.length > PREROLL) preRoll.shift();
    }
  }

  function sendFrame(i16) {
    if (!active || !S.socketGet() || !S.socketGet().connected) return;
    S.socketGet().emit('voice:audio', { a: i16.buffer });
  }

  // ─── پخش: صف هر گوینده با زمان‌بندی نرم ───
  function startDrain() {
    if (drainTimer) return;
    drainTimer = setInterval(() => {
      if (!ctx) return;
      for (const [pid, st] of play) {
        while (st.q.length) {
          if (st.q.length > 12) st.q.splice(0, st.q.length - 3); // عقب افتاد خیلی → جلو بپر
          const t = Math.max(st.nextT || 0, ctx.currentTime + 0.06);
          const f = st.q.shift();
          const buf = ctx.createBuffer(1, f.length, RATE);
          const ch = buf.getChannelData(0);
          for (let i = 0; i < f.length; i++) ch[i] = f[i] / 32768;
          const src = ctx.createBufferSource();
          src.buffer = buf;
          src.connect(ctx.destination);
          src.start(t);
          st.nextT = t + f.length / RATE;
          markSpeaking(pid, true);
          clearTimeout(st.sTo);
          st.sTo = setTimeout(() => markSpeaking(pid, false), 260);
        }
      }
    }, 40);
  }

  function onAudioFrame(d) {
    if (!ctx || !d || !d.a) return;
    const from = d.from;
    if (from === myId()) return;
    let st = play.get(from);
    if (!st) {
      st = { q: [], nextT: 0, sTo: null };
      play.set(from, st);
    }
    st.q.push(new Int16Array(d.a));
    startDrain();
  }

  function stopAudio() {
    for (const [, st] of play) {
      st.q.length = 0;
      clearTimeout(st.sTo);
    }
    play.clear();
    if (drainTimer) {
      clearInterval(drainTimer);
      drainTimer = null;
    }
    document.querySelectorAll('.player-card.speaking').forEach((c) => c.classList.remove('speaking'));
  }

  // ─── ورود / خروج ───
  async function joinVoice(silent) {
    if (active) return;
    joinBtn.disabled = true;
    try {
      if (!ctx || !stream) await startCapture();
      const res = await S.emit('voice:join', {});
      if (!res || !res.ok) {
        if (!silent) S.toast((res && res.msg) || 'ورود به گفتگو ناموفق بود.', 'err');
        else wantVoice = false;
        return;
      }
      active = true;
      wantVoice = true;
      muted = false;
      try { sessionStorage.setItem(WANT_KEY, '1'); } catch (e) { /* ignore */ }
      members.set(myId(), { id: myId(), name: (S.state.player || {}).name || '' });
      (res.peers || []).forEach((p) => members.set(p.id, p));
      lastTalk = 0;
      preRoll.length = 0;
      joinBtn.textContent = 'خروج از گفتگو';
      micBtn.style.display = '';
      micBtn.textContent = 'قطع میکروفون';
      setHint();
      watchLevels();
      startDrain();
      renderStatus();
      if (!silent) S.toast('به گفتگوی صوتی وصل شدی — صدایت برای همه پخش می‌شود.', 'ok');
    } catch (e) {
      const denied = e && (e.name === 'NotAllowedError' || e.name === 'SecurityError' || e.name === 'PermissionDeniedError');
      wantVoice = false;
      try { sessionStorage.removeItem(WANT_KEY); } catch (e2) { /* ignore */ }
      if (hintEl) {
        hintEl.style.display = '';
        hintEl.textContent = denied
          ? 'اجازهٔ میکروفون داده نشد! روی آیکون قفل کنار آدرس مرورگر بزن و میکروفون را «Allow» کن، بعد دکمه را دوباره بزن.'
          : 'میکروفون در دسترس نیست — دوباره تلاش کن.';
        hintEl.style.color = 'var(--danger, #ff5d6c)';
      }
      if (!silent) S.toast(denied ? 'اجازهٔ میکروفون داده نشد — از تنظیمات مرورگر فعالش کن.' : 'میکروفون در دسترس نیست.', 'err');
    } finally {
      joinBtn.disabled = false;
      renderStatus();
    }
  }

  function stopCapture() {
    try { if (cap.node && cap.node.port) cap.node.port.onmessage = null; } catch (e) { /* ignore */ }
    try { if (cap.node) cap.node.disconnect(); } catch (e) { /* ignore */ }
    try { if (cap.src) cap.src.disconnect(); } catch (e) { /* ignore */ }
    try { if (cap.sink) cap.sink.disconnect(); } catch (e) { /* ignore */ }
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    if (ctx) {
      ctx.close().catch(() => {});
      ctx = null;
    }
    cap.node = null;
    cap.src = null;
    cap.sink = null;
    myAna = null;
    myBuf = null;
  }

  function leaveVoice(showToast) {
    wantVoice = false;
    try { sessionStorage.removeItem(WANT_KEY); } catch (e) { /* ignore */ }
    if (active) S.emit('voice:leave', {});
    active = false;
    muted = false;
    members.clear();
    stopAudio();
    stopCapture();
    preRoll.length = 0;
    lastTalk = 0;
    stopWatch();
    if (meDot) meDot.classList.remove('on');
    joinBtn.textContent = 'ورود به گفتگوی صوتی';
    micBtn.style.display = 'none';
    setHint();
    renderStatus();
    if (showToast) S.toast('از گفتگوی صوتی خارج شدی.');
  }

  joinBtn.addEventListener('click', () => (active ? leaveVoice(true) : joinVoice(false)));
  micBtn.addEventListener('click', () => {
    if (!stream) return;
    muted = !muted;
    stream.getAudioTracks().forEach((t) => (t.enabled = !muted));
    micBtn.textContent = muted ? 'وصل کردن میکروفون' : 'قطع میکروفون';
    micBtn.classList.toggle('btn-warn', muted);
    renderStatus();
  });

  // ─── رویدادهای سرور ───
  S.on('voice:joined', (d) => {
    if (!d || !d.id) return;
    members.set(d.id, d);
    renderStatus();
  });
  S.on('voice:left', (d) => {
    if (!d) return;
    members.delete(d.id);
    const st = play.get(d.id);
    if (st) {
      st.q.length = 0;
      clearTimeout(st.sTo);
      play.delete(d.id);
    }
    markSpeaking(d.id, false);
    renderStatus();
  });
  S.on('voice:audio', onAudioFrame);
  S.on('disconnect', () => {
    // سوکت قطع شد؛ برای این تب صدا بسته می‌شود و پس از وصل‌شدن دوباره خودکار برمی‌گردد
    active = false;
    members.clear();
    stopAudio();
    stopCapture();
    stopWatch();
    if (meDot) meDot.classList.remove('on');
    setHint();
    renderStatus();
  });
  S.on('connect', () => {
    if (wantVoice && !active) {
      setTimeout(() => {
        if (wantVoice && !active) joinVoice(true);
      }, 1200);
    }
    askInfo();
  });

  // چه کسانی الان در گفتگو هستند؟ (هر چند ثانیه پرسیده می‌شود تا کارت همیشه دقیق باشد)
  async function askInfo() {
    try {
      const r = await S.emit('voice:info', {});
      if (r && r.ok && Array.isArray(r.members) && !active) {
        members.clear();
        r.members.forEach((m) => members.set(m.id, m));
        renderStatus();
      }
    } catch (e) { /* ignore */ }
  }
  infoTimer = setInterval(() => {
    if (S.socketGet() && S.socketGet().connected && !active) askInfo();
  }, 4000);

  // ─── وصل خودکار: اگر قبلاً اجازهٔ میکروفون داده شده یا دکمه را زده بودی ───
  (async () => {
    try {
      const perm = await navigator.permissions.query({ name: 'microphone' });
      if (perm && perm.state === 'granted') wantVoice = true;
    } catch (e) { /* سافاری این API را ندارد — با دکمه وارد شو */ }
    if (wantVoice && !active && S.socketGet() && S.socketGet().connected) {
      setTimeout(() => {
        if (wantVoice && !active) joinVoice(true);
      }, 1500);
    }
  })();

  // وضعیت اولیه — از همان لحظهٔ ورود به صفحه مشخص است
  setHint();
  renderStatus();

  // اگر صفحه بسته شد، دیگران خبردار شوند
  window.addEventListener('pagehide', () => {
    if (active) S.emit('voice:leave', {});
  });
})();
