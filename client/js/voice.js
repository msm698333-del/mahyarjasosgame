// ─── ویس زنده داخل لابی و مسابقه (WebRTC) ───
// صدا مستقیماً بین بازیکنان رد و بدل می‌شود؛ سرور فقط پیام‌های راه‌اندازی اتصال را رله می‌کند.
(() => {
  const S = window.SPY;
  const card = document.getElementById('voice-card');
  if (!S || !card) return;

  const joinBtn = document.getElementById('voice-join');
  const micBtn = document.getElementById('voice-mic');
  const countEl = document.getElementById('voice-count');
  const meDot = document.getElementById('voice-me');
  const hintEl = document.getElementById('voice-hint');

  const unsupported =
    !window.RTCPeerConnection || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia;
  if (unsupported) {
    joinBtn.disabled = true;
    joinBtn.style.display = 'none';
    if (countEl) countEl.textContent = 'گفتگوی صوتی در این مرورگر پشتیبانی نمی‌شود';
    return;
  }

  const ICE = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' }];

  let myId = (S.state.player && S.state.player.id) || null;
  let stream = null; // میکروفون من
  let active = false; // در گفتگو هستم
  let muted = false;
  let wantVoice = false; // بعد از قطع اتصال، خودکار برگرد
  let audioCtx = null;
  let watchTimer = null;
  let myAna = null;
  let myBuf = null;
  const peers = new Map(); // id → {pc, audio, polite, makingOffer, ignoreOffer, ana, buf}
  const speaking = new Map(); // id → true/false (آخرین وضعیت، برای رندر دوبارهٔ کارت‌ها)

  // هنگام گفتگوی صوتی، موسیقی پس‌زمینه پخش نشود
  if (window.SPY_AUDIO && typeof SPY_AUDIO.playMusic === 'function') {
    const origPlay = SPY_AUDIO.playMusic.bind(SPY_AUDIO);
    SPY_AUDIO.playMusic = (name) => {
      if (!active) origPlay(name);
    };
  }

  function setCount(n) {
    if (countEl) countEl.textContent = n > 0 ? `${S.fa(n)} نفر در گفتگو` : '';
  }

  function markSpeaking(pid, on) {
    speaking.set(pid, on);
    document.querySelectorAll(`.player-card[data-pid="${pid}"]`).forEach((c) => {
      c.classList.toggle('speaking', !!on);
    });
  }

  // ─── اندازه‌گیری سطح صدا (نشانگر صحبت‌کردن) ───
  function makeMeter(mediaStream) {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const src = audioCtx.createMediaStreamSource(mediaStream);
      const ana = audioCtx.createAnalyser();
      ana.fftSize = 512;
      src.connect(ana);
      return { ana, buf: new Uint8Array(ana.frequencyBinCount) };
    } catch (e) {
      return null;
    }
  }

  function level(m) {
    if (!m) return 0;
    m.ana.getByteTimeDomainData(m.buf);
    let s = 0;
    for (let i = 0; i < m.buf.length; i++) {
      const v = (m.buf[i] - 128) / 128;
      s += v * v;
    }
    return Math.sqrt(s / m.buf.length);
  }

  function watchLevels() {
    if (watchTimer) return;
    watchTimer = setInterval(() => {
      if (myAna && meDot) meDot.classList.toggle('on', !muted && level({ ana: myAna, buf: myBuf }) > 0.055);
      for (const [pid, st] of peers) {
        const on = st.pc.connectionState === 'connected' && level(st) > 0.045;
        markSpeaking(pid, on);
      }
    }, 220);
  }

  function stopWatch() {
    if (watchTimer) {
      clearInterval(watchTimer);
      watchTimer = null;
    }
  }

  // ─── اتصال به یک هم‌گفتگو (Perfect Negotiation) ───
  function ensurePC(pid) {
    let st = peers.get(pid);
    if (st) return st;
    const pc = new RTCPeerConnection({ iceServers: ICE });
    const audio = new Audio();
    audio.autoplay = true;
    st = { pc, audio, polite: String(myId) < String(pid), makingOffer: false, ignoreOffer: false };
    peers.set(pid, st);
    if (stream) stream.getTracks().forEach((t) => pc.addTrack(t, stream));
    pc.ontrack = (ev) => {
      try {
        st.audio.srcObject = ev.streams[0];
        st.audio.play().catch(() => {});
        Object.assign(st, makeMeter(ev.streams[0]) || {});
      } catch (e) { /* ignore */ }
    };
    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        S.emit('voice:signal', {
          to: pid,
          data: {
            cand: {
              candidate: ev.candidate.candidate,
              sdpMid: ev.candidate.sdpMid,
              sdpMLineIndex: ev.candidate.sdpMLineIndex,
            },
          },
        });
      }
    };
    pc.onnegotiationneeded = async () => {
      try {
        st.makingOffer = true;
        await pc.setLocalDescription();
        S.emit('voice:signal', {
          to: pid,
          data: { desc: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } },
        });
      } catch (e) {
        /* ignore */
      } finally {
        st.makingOffer = false;
      }
    };
    return st;
  }

  function closePeer(pid) {
    const st = peers.get(pid);
    if (!st) return;
    try {
      st.pc.close();
    } catch (e) { /* ignore */ }
    try {
      st.audio.pause();
      st.audio.srcObject = null;
    } catch (e) { /* ignore */ }
    peers.delete(pid);
    markSpeaking(pid, false);
  }

  async function handleSignal(from, data) {
    if (from === myId || !active) return;
    const st = ensurePC(from);
    try {
      if (data.desc) {
        const collision = data.desc.type === 'offer' && (st.makingOffer || st.pc.signalingState !== 'stable');
        st.ignoreOffer = !st.polite && collision;
        if (st.ignoreOffer) return;
        await st.pc.setRemoteDescription(data.desc);
        if (data.desc.type === 'offer') {
          await st.pc.setLocalDescription();
          S.emit('voice:signal', {
            to: from,
            data: { desc: { type: st.pc.localDescription.type, sdp: st.pc.localDescription.sdp } },
          });
        }
      } else if (data.cand) {
        try {
          await st.pc.addIceCandidate(data.cand);
        } catch (e) {
          /* کاندیدِ نامرتبط پس از رد پیشنهاد — عادی است */
        }
      }
    } catch (e) {
      console.warn('voice signal error', e);
    }
  }

  // ─── ورود / خروج ───
  async function joinVoice(silent) {
    if (active) return;
    joinBtn.disabled = true;
    try {
      if (!stream) {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: false,
        });
      }
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      await audioCtx.resume().catch(() => {});
      const res = await S.emit('voice:join', {});
      if (!res || !res.ok) {
        S.toast((res && res.msg) || 'ورود به گفتگو ناموفق بود.', 'err');
        return;
      }
      active = true;
      wantVoice = true;
      muted = false;
      const m = makeMeter(stream);
      if (m) {
        myAna = m.ana;
        myBuf = m.buf;
      }
      (res.peers || []).forEach((pid) => ensurePC(pid));
      setCount((res.peers || []).length + 1);
      joinBtn.textContent = 'خروج از گفتگو';
      micBtn.style.display = '';
      micBtn.textContent = 'قطع میکروفون';
      if (hintEl) hintEl.style.display = '';
      watchLevels();
      if (!silent) S.toast('به گفتگوی صوتی وصل شدی.', 'ok');
    } catch (e) {
      const denied = e && (e.name === 'NotAllowedError' || e.name === 'SecurityError' || e.name === 'PermissionDeniedError');
      S.toast(denied ? 'اجازهٔ میکروفون داده نشد — از تنظیمات مرورگر فعالش کن.' : 'میکروفون در دسترس نیست.', 'err');
    } finally {
      joinBtn.disabled = false;
    }
  }

  function leaveVoice(showToast) {
    wantVoice = false;
    if (active) S.emit('voice:leave', {});
    for (const pid of [...peers.keys()]) closePeer(pid);
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    active = false;
    muted = false;
    myAna = null;
    myBuf = null;
    stopWatch();
    document.querySelectorAll('.player-card.speaking').forEach((c) => c.classList.remove('speaking'));
    if (meDot) meDot.classList.remove('on');
    joinBtn.textContent = 'ورود به گفتگوی صوتی';
    micBtn.style.display = 'none';
    if (hintEl) hintEl.style.display = 'none';
    setCount(0);
    if (showToast) S.toast('از گفتگوی صوتی خارج شدی.');
  }

  joinBtn.addEventListener('click', () => (active ? leaveVoice(true) : joinVoice(false)));
  micBtn.addEventListener('click', () => {
    if (!stream) return;
    muted = !muted;
    stream.getAudioTracks().forEach((t) => (t.enabled = !muted));
    micBtn.textContent = muted ? 'وصل کردن میکروفون' : 'قطع میکروفون';
    micBtn.classList.toggle('btn-warn', muted);
  });

  // ─── رویدادهای سرور ───
  S.on('voice:joined', (d) => {
    if (!d || d.id === myId) return;
    setCount(peers.size + (active ? 1 : 0));
    if (active) ensurePC(d.id);
  });
  S.on('voice:left', (d) => {
    if (!d) return;
    closePeer(d.id);
    setCount(peers.size + (active ? 1 : 0));
  });
  S.on('voice:signal', (d) => {
    if (d && d.from) handleSignal(d.from, d.data || {});
  });
  S.on('disconnect', () => {
    // سوکت قطع شد؛ برای این تب صدا بسته می‌شود و پس از وصل‌شدن دوباره خودکار برمی‌گردد
    for (const pid of [...peers.keys()]) closePeer(pid);
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    active = false;
    myAna = null;
    myBuf = null;
    stopWatch();
    setCount(0);
  });
  S.on('connect', () => {
    if (wantVoice && !active) {
      setTimeout(() => {
        if (wantVoice && !active) joinVoice(true);
      }, 1200);
    }
  });

  // کارت‌های بازیکن با هر تغییر وضعیت دوباره ساخته می‌شوند؛ نشانگرها را دوباره اعمال کن
  const grid = document.getElementById('players');
  if (grid) {
    new MutationObserver(() => {
      for (const [pid, on] of speaking) markSpeaking(pid, on);
    }).observe(grid, { childList: true });
  }

  // اگر صفحه بسته شد، دیگران خبردار شوند
  window.addEventListener('pagehide', () => {
    if (active) S.emit('voice:leave', {});
  });
})();
