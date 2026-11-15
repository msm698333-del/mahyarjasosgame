// ─── هسته مشترک کلاینت: API، سوکت، UI، آواتار، تایمر ───
(function () {
  const CFG = window.SPY_CONFIG || {};

  // تشخیص حالت اتصال — اولویت: ?mode= → مقدار ذخیره‌شدهٔ همان دامنه → تشخیص خودکار
  const MODE = (() => {
    const VALID = ['self', 'gateway', 'tiiny'];
    let m = null;
    const q = new URLSearchParams(location.search);
    const forced = q.get('mode');
    if (forced && VALID.includes(forced)) m = forced;
    if (!m) {
      try {
        const stored = JSON.parse(localStorage.getItem('spy_mode') || 'null');
        if (stored && stored.host === location.host && VALID.includes(stored.mode)) m = stored.mode;
      } catch (e) {
        /* ignore */
      }
    }
    if (!m) {
      const cm = document.cookie.match(/(?:^|;\s*)spy_mode=(\w+)/);
      if (cm && VALID.includes(cm[1])) m = cm[1];
    }
    if (!m) {
      const h = location.hostname;
      if (/^preview-/.test(h) || h.endsWith('.space-z.ai')) m = 'gateway';
      else m = 'self';
    }
    try {
      localStorage.setItem('spy_mode', JSON.stringify({ mode: m, host: location.host }));
    } catch (e) {
      /* ignore */
    }
    try {
      document.cookie = 'spy_mode=' + m + '; Path=/; Max-Age=31536000; SameSite=Lax';
    } catch (e) {
      /* ignore */
    }
    return m;
  })();
  const GATEWAY_PORT = String(CFG.GATEWAY_PORT || 3003);

  // هشدار پیکربندی: فرانت روی Tiiny است ولی آدرس بک‌اند تنظیم نشده
  if (/tiiny/i.test(location.hostname) && !(CFG.BACKEND_URL || '').trim() && (CFG.MODE === 'auto' || !CFG.MODE)) {
    window.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => toast('پیکربندی لازم: در client/config.js مقدار BACKEND_URL را با آدرس بک‌اند خود پر کنید (docs/DEPLOY_TIINY_HOST.md).', 'err'), 600);
    });
  }

  const FA = '۰۱۲۳۴۵۶۷۸۹';
  const fa = (v) => String(v).replace(/[0-9]/g, (d) => FA[+d]);
  const faTime = (ts) => new Date(ts).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
  const faDate = (ts) => new Date(ts).toLocaleDateString('fa-IR');
  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const avatarUrl = (id) => `assets/avatars/${id || 'a01'}.svg`;
  const stickerUrl = (id) => `assets/stickers/${id}.svg`;

  // ── توکن هویت ──
  const TOKEN_KEY = 'spy_token';
  let token = localStorage.getItem(TOKEN_KEY) || null;
  function setToken(t) {
    token = t;
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  }

  // ── REST ──
  async function api(path, opts = {}) {
    let url = path;
    if (MODE === 'gateway') url += (url.includes('?') ? '&' : '?') + 'XTransformPort=' + GATEWAY_PORT;
    if (MODE === 'tiiny') url = (CFG.BACKEND_URL || '').replace(/\/$/, '') + path;
    const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    if (token) headers.Authorization = 'Bearer ' + token;
    let res;
    try {
      res = await fetch(url, Object.assign({}, opts, { headers, credentials: 'include' }));
    } catch (e) {
      throw { code: 'network', msg: 'اتصال به سرور برقرار نشد؛ اینترنت یا سرور را بررسی کنید.' };
    }
    let data = {};
    try {
      data = await res.json();
    } catch (e) {
      /* ignore */
    }
    if (res.ok && data && data.token) setToken(data.token);
    return { status: res.status, data: data };
  }

  const state = { player: null, owned: [] };

  async function loadMe() {
    const r = await api('/api/me');
    if (r.status === 200) {
      state.player = r.data.player;
      state.owned = r.data.owned || [];
      return state.player;
    }
    if (r.status === 401) {
      setToken(null);
      state.player = null;
    }
    return null;
  }

  async function register(name) {
    const r = await api('/api/register', { method: 'POST', body: JSON.stringify({ name }) });
    if (r.status !== 200) throw r.data;
    state.player = r.data.player;
    await refreshOwned().catch(() => {});
    return r.data.player;
  }

  async function refreshOwned() {
    const r = await api('/api/me');
    if (r.status === 200) {
      state.player = r.data.player;
      state.owned = r.data.owned || [];
    }
  }

  // ── UI ──
  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  let toastWrap = null;
  function toast(msg, type = '') {
    if (!toastWrap) {
      toastWrap = el('div', 'toast-wrap');
      document.body.appendChild(toastWrap);
    }
    const t = el('div', 'toast ' + type, esc(msg));
    toastWrap.appendChild(t);
    setTimeout(() => {
      t.style.opacity = '0';
      t.style.transition = 'opacity .4s';
      setTimeout(() => t.remove(), 420);
    }, 2800);
  }

  function modal(html, opts = {}) {
    const ov = el('div', 'overlay');
    const m = el('div', 'modal', html);
    ov.appendChild(m);
    document.body.appendChild(ov);
    const close = () => ov.remove();
    if (!opts.lock) ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
    return { el: ov, card: m, close };
  }

  function confirmBox(text, okLabel = 'تأیید', danger = false) {
    return new Promise((resolve) => {
      const m = modal(
        `<h3>تأیید</h3><p style="color:var(--text-2)">${esc(text)}</p>
        <div class="row" style="margin-top:14px">
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok style="flex:1">${esc(okLabel)}</button>
          <button class="btn btn-ghost" data-no style="flex:1">انصراف</button>
        </div>`,
        { lock: true }
      );
      m.el.querySelector('[data-ok]').onclick = () => { m.close(); resolve(true); };
      m.el.querySelector('[data-no]').onclick = () => { m.close(); resolve(false); };
    });
  }

  // ── آواتار ──
  function avatar(id, size, opts = {}) {
    const f = el(
      'div',
      'avatar-frame' + (opts.dead ? ' dead' : '') + (opts.off ? ' off' : '') + (opts.selected ? ' selected' : '') + (opts.suspect ? ' suspect' : '')
    );
    const img = document.createElement('img');
    img.src = avatarUrl(id);
    img.alt = 'آواتار';
    img.style.width = size + 'px';
    img.style.height = size + 'px';
    f.appendChild(img);
    if (opts.num) f.appendChild(el('span', 'num-badge', fa(opts.num)));
    if (opts.status !== undefined) f.appendChild(el('span', 'status-dot' + (opts.status ? '' : ' off')));
    return f;
  }

  // ── تایمر حلقه‌ای ──
  function timerRing(deadline, opts = {}) {
    const wrap = el('div', 'timer-ring');
    const R = 20;
    const C = 2 * Math.PI * R;
    wrap.innerHTML =
      `<svg width="46" height="46" viewBox="0 0 46 46">
        <circle class="tr-bg" cx="23" cy="23" r="${R}"></circle>
        <circle class="tr-fg" cx="23" cy="23" r="${R}" stroke-dasharray="${C}" stroke-dashoffset="0"></circle>
      </svg><div class="tr-num">--</div>`;
    const fg = wrap.querySelector('.tr-fg');
    const num = wrap.querySelector('.tr-num');
    let iv = null;
    function tick() {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      num.textContent = fa(left);
      const total = opts.total || 60;
      const frac = Math.min(1, left / total);
      fg.style.strokeDashoffset = String(C * (1 - frac));
      fg.style.stroke = left <= 5 ? 'var(--danger)' : left <= 10 ? 'var(--gold)' : 'var(--ok)';
      if (left <= 0) {
        stop();
        if (opts.onEnd) opts.onEnd();
      }
    }
    function stop() {
      if (iv) clearInterval(iv);
      iv = null;
    }
    tick();
    iv = setInterval(tick, 250);
    return { el: wrap, stop };
  }

  // ── سوکت ──
  let socket = null;
  const listeners = new Map();
  function emitLocal(ev, data) {
    const arr = listeners.get(ev);
    if (arr) arr.forEach((f) => f(data));
  }
  function connectSocket() {
    if (typeof io === 'undefined') {
      toast('کتابخانه سوکت بارگذاری نشده است.', 'err');
      return null;
    }
    const opts = {
      path: '/spy-ws',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 900,
      reconnectionDelayMax: 4000,
      reconnectionAttempts: 15,
      timeout: 12000,
      auth: { token: token || undefined },
      withCredentials: true,
    };
    if (MODE === 'gateway') opts.query = { XTransformPort: GATEWAY_PORT };
    const url = MODE === 'tiiny' ? (CFG.BACKEND_URL || '').replace(/\/$/, '') : window.location.origin;
    socket = io(url, opts);
    socket.on('connect', () => emitLocal('connect'));
    socket.on('disconnect', (r) => emitLocal('disconnect', r));
    socket.on('connect_error', (e) => {
      const m = String((e && e.message) || '');
      if (m.includes('unauthorized') || m.includes('unregistered')) {
        setToken(null);
        location.href = 'index.html?e=1';
        return;
      }
      emitLocal('connect_error', e);
    });
    // پل رویدادهای سرور → شناسه‌های ثبت‌شده در SPY.on
    socket.onAny((ev, data) => {
      if (ev === 'connect' || ev === 'disconnect' || ev === 'connect_error') return;
      emitLocal(ev, data);
    });
    return socket;
  }
  function on(ev, fn) {
    if (!listeners.has(ev)) listeners.set(ev, []);
    listeners.get(ev).push(fn);
    // اگر سوکت همین حالا متصل است، رویداد connect فوراً صدا زده می‌شود
    if (ev === 'connect' && socket && socket.connected) {
      try {
        fn();
      } catch (e) {
        console.error(e);
      }
    }
    return socket;
  }
  function emit(ev, data, ack) {
    return new Promise((resolve) => {
      if (!socket || !socket.connected) {
        resolve({ ok: false, code: 'offline', msg: 'اتصال به سرور برقرار نیست.' });
        return;
      }
      if (typeof ack === 'function') {
        socket.emit(ev, data, ack);
        return;
      }
      socket.emit(ev, data, (res) => resolve(res || { ok: true }));
    });
  }

  // کد اتاق جاری بین صفحات
  function saveRoom(code) {
    if (code) sessionStorage.setItem('spy_room', code);
  }
  function loadRoom() {
    return sessionStorage.getItem('spy_room') || null;
  }
  function clearRoom() {
    sessionStorage.removeItem('spy_room');
    sessionStorage.removeItem('spy_last_over');
  }

  // ── نوار بالای صفحات ──
  function topbar() {
    const bar = document.querySelector('.topbar');
    if (!bar) return;
    const p = state.player;
    bar.innerHTML = `
      <a class="brand" href="home.html" aria-label="خانه">
        <svg class="logo-hat" viewBox="0 0 208 70" aria-hidden="true">
          <ellipse cx="104" cy="56" rx="66" ry="12" fill="#2b2159"/>
          <path d="M56,54 Q56,12 104,12 Q152,12 152,54 Z" fill="#3b2d6e"/>
          <rect x="56" y="42" width="96" height="12" rx="5" fill="#f5c542"/>
        </svg>
        <span class="brand-name">SPY</span>
      </a>
      <div class="top-actions">
        ${
          p
            ? `<span class="coin-pill" title="موجودی سکه"><span class="coin-dot"></span><span id="coins-num">${fa(p.coins)}</span></span>
        <a class="me-chip" href="profile.html" aria-label="پروفایل"><span class="me-name">${esc(p.name)}</span><img src="${avatarUrl(p.avatar)}" alt="آواتار من"></a>`
            : ''
        }
      </div>`;
  }
  function updateCoins(coins) {
    const n = document.getElementById('coins-num');
    if (n && coins != null) n.textContent = fa(coins);
    if (state.player && coins != null) state.player.coins = coins;
    if (state.player && coins != null) { state.player.coins = coins; }
  }

  async function requireAuth() {
    const p = await loadMe();
    if (!p) {
      location.href = 'index.html?need=1';
      return null;
    }
    return p;
  }

  window.SPY = {
    CFG, MODE, GATEWAY_PORT,
    fa, faTime, faDate, esc,
    avatarUrl, stickerUrl,
    api, state, loadMe, register, refreshOwned,
    el, toast, modal, confirmBox, avatar, timerRing,
    connectSocket, on, emit, socketGet: () => socket,
    saveRoom, loadRoom, clearRoom,
    topbar, updateCoins, requireAuth, setToken, getToken: () => token,
  };
})();
