// ─── صفحه اصلی مسابقه: ترم‌ها، سؤال/پاسخ، چالش، رأی‌گیری، شب، حدس کلمه ───
(async () => {
  const p = await SPY.requireAuth();
  if (!p) return;
  SPY.topbar();

  const params = new URLSearchParams(location.search);
  const code = params.get('code') || SPY.loadRoom();
  if (!code) {
    location.href = 'home.html';
    return;
  }
  SPY.saveRoom(code);

  // ── وضعیت محلی ──
  const G = {
    players: [], me: null, mates: [], category: null, myWord: null,
    phase: null, sub: null, dayNo: 1, termsTotal: 0, termsUsed: 0,
    askerId: null, targetId: null, question: null, answer: null,
    deadline: null, deadlineKey: null, deadlineTotal: 60,
    candidates: [], revote: false, myVote: null, voteCount: 0, voteTotal: 0,
    nightIsSpy: false, nightPicksMine: null, nightProgress: { picked: 0, needed: 1 },
    guessMine: false, guessSpy: null,
    stickerUsed: false, log: [], eliminated: [],
    selected: null, actionBusy: false,
  };

  const isSpy = () => !!(G.me && G.me.role === 'spy');
  const meAlive = () => !!(G.me && G.me.alive);
  const byId = (id) => G.players.find((x) => x.id === id);
  const byNum = (n) => G.players.find((x) => x.number === n);

  const connEl = document.getElementById('conn');
  const connText = document.getElementById('conn-text');
  const setConn = (on) => {
    connEl.classList.toggle('on', !!on);
    connText.textContent = on ? 'متصل' : 'در حال اتصال مجدد…';
  };

  // ── تایمر ──
  let curTimer = null;
  function setTimer(deadline, total) {
    const slot = document.getElementById('timer-slot');
    if (curTimer) curTimer.stop();
    slot.innerHTML = '';
    if (!deadline) return;
    curTimer = SPY.timerRing(deadline, { total: total || 60 });
    slot.appendChild(curTimer.el);
  }

  // ── بازیکن‌ها ──
  function canSelect() {
    if (!G.phase) return false;
    if (G.phase === 'day' && G.sub === 'floor' && G.askerId === p.id && !G.question) return true;
    if (G.phase === 'day' && G.sub === 'challenge' && G.targetId === p.id && G.answer) return true;
    if (G.phase === 'vote' && meAlive()) return true;
    if (G.phase === 'night' && G.nightIsSpy && meAlive()) return true;
    return false;
  }
  function selectableIds() {
    const alive = G.players.filter((x) => x.alive && x.id !== p.id).map((x) => x.id);
    if (G.phase === 'vote') return G.candidates.filter((id) => id !== p.id);
    if (G.phase === 'night') return alive;
    return alive;
  }

  function renderPlayers() {
    const grid = document.getElementById('players');
    const sel = canSelect();
    const allowed = new Set(sel ? selectableIds() : []);
    grid.className = 'players-grid' + (G.players.length === 4 ? ' n4' : '');
    grid.innerHTML = '';
    document.getElementById('pg-hint').textContent = sel ? '— روی یک بازیکن بزن' : '';
    G.players.forEach((pl) => {
      const isMe = pl.id === p.id;
      const card = SPY.el('div', 'player-card' + (pl.alive ? '' : ' dead') + (allowed.has(pl.id) ? ' selectable' : '') + (G.selected === pl.id ? ' selected' : ''));
      const frame = SPY.avatar(pl.avatar, 50, { num: pl.number, status: pl.connected, dead: !pl.alive, off: !pl.connected, selected: G.selected === pl.id });
      card.appendChild(frame);
      const nm = SPY.el('div', 'pc-name');
      nm.textContent = isMe ? `${pl.name} (تو)` : pl.name;
      card.appendChild(nm);
      const tag = SPY.el('div', 'pc-tag');
      if (G.askerId === pl.id && G.phase === 'day') tag.appendChild(SPY.el('span', '', 'پرسشگر'));
      else if (G.targetId === pl.id && G.phase === 'day') tag.appendChild(SPY.el('span', '', 'پاسخ‌دهنده'));
      else if (!pl.alive) tag.appendChild(SPY.el('span', 'role-pill elim', 'حذف‌شده'));
      if (pl.connected === false) tag.appendChild(SPY.el('span', '', '· آفلاین'));
      card.appendChild(tag);
      if (allowed.has(pl.id)) {
        card.onclick = () => {
          if (G.phase === 'vote' || G.phase === 'night') {
            G.selected = pl.id;
            renderPlayers();
            renderAction();
          } else {
            G.selected = pl.id;
            renderPlayers();
            renderAction();
          }
        };
      }
      grid.appendChild(card);
    });

    // خط اطلاعات خصوصی
    const line = document.getElementById('private-line');
    if (G.phase === 'over' && G.over) {
      const meRole = (G.over.roles.find((r) => r.id === p.id) || {}).role;
      line.innerHTML = isSpy() || meRole === 'spy'
        ? '<span class="role-pill spy">جاسوس</span> نقش تو در این مسابقه'
        : '<span class="role-pill citizen">شهروند</span> نقش تو در این مسابقه';
    } else if (isSpy()) {
      line.innerHTML = `تو <span class="role-pill spy">جاسوس</span> هستی — کلمه مخفی را نمی‌دانی${G.mates.length ? ` · هم‌تیم‌ها: شماره ${G.mates.map(SPY.fa).join(' و ')}` : ' · جاسوس تنها'}`;
    } else if (G.me) {
      line.innerHTML = `کلمه مخفی تو: <b class="gold-text">${SPY.esc(G.myWord)}</b> · دسته: ${SPY.esc(G.category)}`;
    } else {
      line.textContent = '';
    }
  }

  // ── حباب‌های گفتگو ──
  function pushBubble(b) {
    G.log.push(b);
    const box = document.getElementById('bubbles');
    while (box.children.length > 14) box.removeChild(box.firstChild);
    box.appendChild(bubbleEl(b));
    box.scrollTop = box.scrollHeight;
  }
  function bubbleEl(b) {
    const w = SPY.el('div', 'bubble' + (b.kind === 'a' ? ' answer' : '') + (b.mine ? ' me' : ''));
    const num = b.fromNum || (b.from ? (byId(b.from) || {}).number : null);
    w.appendChild(SPY.avatar(b.fromAvatar || 'a01', 34));
    const body = SPY.el('div', 'b-body');
    const meta = SPY.el('div', 'b-meta');
    if (b.kind === 'q') meta.textContent = `پرسش: شماره ${SPY.fa(b.fromNum)} ← شماره ${SPY.fa(b.toNum)} · ترم ${SPY.fa(b.term)}`;
    else if (b.kind === 'a') meta.textContent = `پاسخ شماره ${SPY.fa(b.fromNum)}${b.timeout ? ' (بدون پاسخ)' : ''}`;
    else if (b.kind === 'note') meta.textContent = 'سیستم';
    body.appendChild(meta);
    const txt = SPY.el('div');
    txt.textContent = b.kind === 'a' && b.timeout ? 'پاسخی داده نشد' : b.text; // امن با textContent
    body.appendChild(txt);
    w.appendChild(body);
    return w;
  }
  function renderLogBubbles() {
    const box = document.getElementById('bubbles');
    box.innerHTML = '';
    G.log.slice(-14).forEach((b) => box.appendChild(bubbleEl(b)));
    box.scrollTop = box.scrollHeight;
  }

  // ── پنل عملیات ──
  function renderAction() {
    const ap = document.getElementById('action-panel');
    ap.innerHTML = '';
    if (G.phase === 'over') return;
    if (G.phase === 'deal') return;
    if (G.phase === 'vote') return renderVotePanel(ap);
    if (G.phase === 'night') return renderNightPanel(ap);
    if (G.phase === 'guess') {
      ap.appendChild(SPY.el('div', 'panel-hint', 'جاسوس حذف‌شده فرصت دارد کلمه مخفی را حدس بزند…'));
      return;
    }
    if (G.phase !== 'day') return;
    if (!meAlive()) {
      ap.appendChild(SPY.el('div', 'panel-hint', 'تو حذف شده‌ای؛ فقط تماشا می‌کنی. راز بازی را لو نده!'));
      return;
    }

    if (G.sub === 'floor' && G.askerId === p.id && !G.question) {
      const hint = SPY.el('div', 'panel-hint', `تو پرسشگر این ترمی — ${G.selected ? `شماره ${SPY.fa((byId(G.selected) || {}).number)} را انتخاب کردی` : 'از روی کارت‌ها یکی را انتخاب کن'}.`);
      ap.appendChild(hint);
      const ta = document.createElement('textarea');
      ta.className = 'input';
      ta.id = 'ask-text';
      ta.placeholder = 'سؤالت را بنویس… (هر چیزی که جاسوس را لو بدهد، ولی خودت را فاش نکند)';
      ta.maxLength = 200;
      ap.appendChild(ta);
      const btn = SPY.el('button', 'btn btn-primary btn-block', 'پرسیدن سؤال');
      btn.disabled = !G.selected;
      btn.onclick = async () => {
        const text = ta.value.trim();
        if (text.length < 2) {
          SPY.toast('متن سؤال خیلی کوتاه است.', 'err');
          return;
        }
        btn.disabled = true;
        const res = await SPY.emit('game:ask', { targetId: G.selected, text });
        btn.disabled = false;
        if (!res.ok) SPY.toast(res.msg || 'خطا', 'err');
      };
      ap.appendChild(btn);
      return;
    }

    if (G.sub === 'answer' && G.targetId === p.id && !G.answer && G.question) {
      const hint = SPY.el('div', 'panel-hint', 'سؤال برای توست — پاسخ بده. صادقانه ولی نه‌چنان که کلمه لو برود!');
      ap.appendChild(hint);
      const ta = document.createElement('textarea');
      ta.className = 'input';
      ta.id = 'answer-text';
      ta.placeholder = 'پاسخ تو…';
      ta.maxLength = 200;
      ap.appendChild(ta);
      const btn = SPY.el('button', 'btn btn-primary btn-block', 'ثبت پاسخ');
      btn.onclick = async () => {
        const text = ta.value.trim();
        if (!text) {
          SPY.toast('پاسخ خالی است.', 'err');
          return;
        }
        btn.disabled = true;
        const res = await SPY.emit('game:answer', { text });
        btn.disabled = false;
        if (!res.ok) SPY.toast(res.msg || 'خطا', 'err');
      };
      ap.appendChild(btn);
      return;
    }

    if (G.sub === 'challenge' && G.targetId === p.id && G.answer) {
      const hint = SPY.el(
        'div',
        'panel-hint',
        G.selected
          ? `چالش شماره ${SPY.fa((byId(G.selected) || {}).number)} — تأیید می‌کنی؟`
          : '۱۵ ثانیه داری انتخاب کنی که چالش به کدام شماره برود (از روی کارت‌ها).'
      );
      ap.appendChild(hint);
      const btn = SPY.el('button', 'btn btn-gold btn-block', G.selected ? 'چالش این بازیکن' : 'اول یک بازیکن انتخاب کن');
      btn.disabled = !G.selected;
      btn.onclick = async () => {
        btn.disabled = true;
        const res = await SPY.emit('game:challenge', { targetId: G.selected });
        if (!res.ok) {
          btn.disabled = false;
          SPY.toast(res.msg || 'خطا', 'err');
        }
      };
      ap.appendChild(btn);
      return;
    }

    // حالت تماشا
    let txt = '';
    if (G.sub === 'floor') txt = G.askerId ? `${(byId(G.askerId) || {}).name || ''} در حال انتخاب سؤال…` : 'در حال شروع ترم…';
    else if (G.sub === 'answer') txt = 'در انتظار پاسخ…';
    else if (G.sub === 'challenge') txt = `${(byId(G.targetId) || {}).name || ''} دارد چالش بعدی را انتخاب می‌کند…`;
    ap.appendChild(SPY.el('div', 'panel-hint', txt));
  }

  // ── رأی‌گیری ──
  function renderVotePanel(ap) {
    if (!meAlive()) {
      ap.appendChild(SPY.el('div', 'panel-hint', 'تو حذف شده‌ای؛ در رأی‌گیری شرکت نمی‌کنی.'));
      return;
    }
    const hint = SPY.el('div', 'panel-hint', G.revote
      ? 'تساوی پیش آمد! فقط بین بازیکنان با رأی مساوی دوباره رأی بده. تغییر رأی تا پایان زمان آزاد است.'
      : 'یک نفر را برای حذف انتخاب کن. رأی تو محرمانه است و تا پایان زمان می‌توانی عوضش کنی.');
    ap.appendChild(hint);
    const btn = SPY.el('button', 'btn btn-danger btn-block', G.myVote && G.myVote === G.selected
      ? 'این رأی ثبت شده است'
      : G.selected
        ? `ثبت رأی به شماره ${SPY.fa((byId(G.selected) || {}).number)}`
        : 'اول یک بازیکن انتخاب کن');
    btn.disabled = !G.selected || G.myVote === G.selected;
    btn.onclick = async () => {
      btn.disabled = true;
      SPY_AUDIO.playSfx('vote');
      const res = await SPY.emit('vote:cast', { targetId: G.selected });
      if (!res.ok) {
        SPY.toast(res.msg || 'خطا', 'err');
        btn.disabled = false;
      }
    };
    ap.appendChild(btn);
    if (G.myVote) ap.appendChild(SPY.el('div', 'hint', 'رأی فعلی تو ثبت شده؛ با انتخاب بازیکن دیگر می‌توانی عوضش کنی.'));
  }

  function renderVoteProgress() {
    const box = document.getElementById('pb-sub');
    if (G.phase === 'vote') {
      box.textContent = `${SPY.fa(G.voteCount)} از ${SPY.fa(G.voteTotal)} رأی ثبت شده`;
    }
  }

  // ── شب ──
  function renderNightPanel(ap) {
    if (G.nightIsSpy && meAlive()) {
      ap.appendChild(SPY.el('div', 'panel-hint', `شب است — یک قربانی انتخاب کن.${G.nightProgress.needed > 1 ? ` (انتخاب جاسوس‌ها: ${SPY.fa(G.nightProgress.picked)}/${SPY.fa(G.nightProgress.needed)})` : ''}`));
      const btn = SPY.el('button', 'btn btn-danger btn-block', G.nightPicksMine && G.nightPicksMine === G.selected ? 'این هدف ثبت شده' : G.selected ? `انتخاب شماره ${SPY.fa((byId(G.selected) || {}).number)} به‌عنوان هدف` : 'اول یک بازیکن انتخاب کن');
      btn.disabled = !G.selected || G.nightPicksMine === G.selected;
      btn.onclick = async () => {
        btn.disabled = true;
        const res = await SPY.emit('night:pick', { targetId: G.selected });
        if (!res.ok) {
          btn.disabled = false;
          SPY.toast(res.msg || 'خطا', 'err');
        }
      };
      ap.appendChild(btn);
      if (G.nightProgress.needed > 1) ap.appendChild(SPY.el('div', 'hint', 'اگر جاسوس‌ها اختلاف داشته باشند، اکثریت می‌برد و در تساوی قرعه کشیده می‌شود.'));
    } else if (meAlive()) {
      ap.appendChild(SPY.el('div', 'panel-hint', 'شب است… جاسوس‌ها در حال انتخاب هستند. چشم‌هایت باز نگه دار!'));
    } else {
      ap.appendChild(SPY.el('div', 'panel-hint', 'شب است و تو حذف شده‌ای؛ فقط تماشا کن.'));
    }
  }

  // ── کارت نقش ──
  function renderRoleCard() {
    const box = document.getElementById('role-card-box');
    const wrap = document.getElementById('role-card-wrap');
    box.style.display = '';
    wrap.innerHTML = '';
    const inner = SPY.el('div', 'role-card');
    const face = SPY.el('div', 'rc ' + (isSpy() ? 'rc-spy' : 'rc-citizen'));
    face.appendChild(SPY.el('div', 'rc-role', isSpy() ? 'تو جاسوسی!' : 'تو شهروندی'));
    if (isSpy()) {
      face.appendChild(SPY.el('div', 'rc-cat', 'کلمه مخفی را نمی‌بینی'));
      face.appendChild(SPY.el('div', 'muted small', G.mates.length ? `هم‌تیم‌های تو: شماره ${G.mates.map(SPY.fa).join(' و ')}` : 'جاسوس تنها هستی'));
    } else {
      face.appendChild(SPY.el('div', 'rc-word', G.myWord));
    }
    face.appendChild(SPY.el('div', 'rc-cat', `دسته: ${G.category}`));
    inner.appendChild(face);
    wrap.appendChild(inner);
  }

  // ── نوار فاز ──
  function renderBanner() {
    const t = document.getElementById('pb-title');
    const s = document.getElementById('pb-sub');
    const banner = document.getElementById('phase-banner');
    banner.classList.remove('night', 'vote');
    if (G.phase === 'deal') {
      t.textContent = 'توزیع نقش‌ها';
      s.textContent = 'کارت نقشت را ببین!';
    } else if (G.phase === 'day') {
      t.textContent = `روز ${SPY.fa(G.dayNo)} · ترم ${SPY.fa(G.termsUsed + 1)} از ${SPY.fa(G.termsTotal)}`;
      if (G.sub === 'floor') s.textContent = 'پرسشگر سؤال می‌پرسد…';
      else if (G.sub === 'answer') s.textContent = 'در انتظار پاسخ…';
      else if (G.sub === 'challenge') s.textContent = 'انتخاب چالش بعدی (۱۵ ثانیه)';
      else s.textContent = '';
    } else if (G.phase === 'vote') {
      banner.classList.add('vote');
      t.textContent = 'رأی‌گیری' + (G.revote ? ' مجدد' : '');
      s.textContent = `${SPY.fa(G.voteCount)} از ${SPY.fa(G.voteTotal)} رأی ثبت شده`;
    } else if (G.phase === 'night') {
      banner.classList.add('night');
      t.textContent = 'شب جاسوس';
      s.textContent = G.nightIsSpy && meAlive() ? 'هدف بعدی را انتخاب کن' : 'جاسوس‌ها در حال انتخاب…';
    } else if (G.phase === 'guess') {
      banner.classList.add('vote');
      t.textContent = 'حدس کلمه مخفی!';
      s.textContent = G.guessMine ? 'فرصت داری کلمه را حدس بزنی' : `${(G.guessSpy || {}).name || 'جاسوس'} دارد حدس می‌زند…`;
    } else if (G.phase === 'over') {
      t.textContent = 'پایان مسابقه';
      s.textContent = 'در حال انتقال به صفحه نتیجه…';
    }
  }

  // ── استیکرها ──
  const STICKERS = ['s01', 's02', 's03', 's04', 's05', 's06', 's07', 's08', 's09', 's10', 's11', 's12'];
  function renderStickers() {
    const cardEl = document.getElementById('sticker-card');
    if (G.phase !== 'day' || !meAlive()) {
      cardEl.style.display = 'none';
      return;
    }
    cardEl.style.display = '';
    document.getElementById('sticker-note').textContent = G.stickerUsed ? '(امروزه در این ترم استفاده کردی)' : '';
    const bar = document.getElementById('sticker-bar');
    bar.innerHTML = '';
    STICKERS.forEach((id) => {
      const b = document.createElement('button');
      b.title = 'استیکر';
      b.disabled = G.stickerUsed;
      const img = document.createElement('img');
      img.src = SPY.stickerUrl(id);
      img.alt = 'استیکر';
      b.appendChild(img);
      b.onclick = async () => {
        b.disabled = true;
        const res = await SPY.emit('game:sticker', { id });
        if (!res.ok) {
          SPY.toast(res.msg || 'خطا', 'err');
          b.disabled = false;
        } else {
          G.stickerUsed = true;
          renderStickers();
        }
      };
      bar.appendChild(b);
    });
  }

  function showStickerFloat(fromPlayer, stickerId) {
    const f = SPY.el('div', 'sticker-float');
    f.style.left = 12 + Math.random() * 62 + '%';
    f.style.top = 22 + Math.random() * 26 + '%';
    const img = document.createElement('img');
    img.src = SPY.stickerUrl(stickerId);
    img.alt = 'استیکر'; // استیکر فقط تصویری است و صدایی ندارد
    f.appendChild(img);
    document.body.appendChild(f);
    setTimeout(() => f.remove(), 2700);
  }

  // ── مودال‌های نتیجه ──
  function elimModal(pl, by, role) {
    const m = SPY.modal(
      `<h3>${by === 'night' ? 'شب تمام شد…' : 'نتیجه رأی‌گیری'}</h3>
       <div class="center" style="padding:8px 0">
         <div style="display:inline-block">${''}</div>
         <div id="em-ava" style="display:flex;justify-content:center"></div>
         <div style="font-weight:900;font-size:16px;margin-top:8px">${SPY.esc(pl.name)} حذف شد</div>
         <div style="margin-top:6px"><span class="role-pill ${role === 'spy' ? 'spy' : 'citizen'}">${role === 'spy' ? 'جاسوس بود!' : 'شهروند بود'}</span></div>
       </div>
       <button class="btn btn-block" id="em-ok">ادامه</button>`,
      { lock: true }
    );
    m.el.querySelector('#em-ava').appendChild(SPY.avatar(pl.avatar, 64, { dead: true }));
    m.el.querySelector('#em-ok').onclick = () => m.close();
  }

  function voteResultModal(data) {
    const rows = Object.entries(data.tally || {})
      .sort((a, b) => b[1] - a[1])
      .map(([id, count]) => {
        const pl = byId(id) || {};
        const maxc = Math.max(1, ...Object.values(data.tally || { x: 1 }));
        return `<div class="tally-row">
          <span class="t-name">${SPY.esc(pl.name || '?')} (${SPY.fa(pl.number)})</span>
          <div class="t-bar"><div class="t-fill" style="width:${Math.round((count / maxc) * 100)}%"></div></div>
          <span class="t-count">${SPY.fa(count)}</span>
        </div>`;
      })
      .join('');
    const elimLine = data.eliminated
      ? `<div class="center" style="margin-top:12px">
           <div id="vr-ava" style="display:flex;justify-content:center"></div>
           <div style="font-weight:900">${SPY.esc(data.eliminated.name)} حذف شد — <span class="role-pill ${data.role === 'spy' ? 'spy' : 'citizen'}">${data.role === 'spy' ? 'جاسوس بود' : 'شهروند بود'}</span></div>
           ${data.note ? `<div class="hint">${SPY.esc(data.note)}</div>` : ''}
         </div>`
      : `<div class="center" style="margin-top:12px">${SPY.esc(data.note || 'کسی حذف نشد.')}</div>`;
    const m = SPY.modal(`<h3>نتیجه رأی‌گیری</h3>${rows || '<p class="muted">رأیی ثبت نشد.</p>'}${elimLine}
      <button class="btn btn-block" id="vr-ok" style="margin-top:12px">ادامه</button>`, { lock: true });
    if (data.eliminated) m.el.querySelector('#vr-ava').appendChild(SPY.avatar(data.eliminated.avatar, 60, { dead: true }));
    m.el.querySelector('#vr-ok').onclick = () => m.close();
  }

  function guessModal(deadline) {
    const m = SPY.modal(
      `<h3>حدس کلمه مخفی</h3>
       <p class="muted small">اگر کلمه را درست حدس بزنی، جاسوس‌ها می‌برند! (${Math.round((deadline - Date.now()) / 1000)} ثانیه)</p>
       <input class="input" id="guess-input" maxlength="60" placeholder="کلمه را بنویس…"/>
       <button class="btn btn-gold btn-block" id="guess-send" style="margin-top:10px">ثبت حدس</button>`,
      { lock: true }
    );
    m.el.querySelector('#guess-send').onclick = async () => {
      const word = m.el.querySelector('#guess-input').value.trim();
      if (!word) return;
      const res = await SPY.emit('game:guess', { word });
      if (!res.ok) SPY.toast(res.msg || 'خطا', 'err');
      else m.close();
    };
    const inp = m.el.querySelector('#guess-input');
    inp.focus();
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') m.el.querySelector('#guess-send').click();
    });
  }

  // ── اعمال اسنپ‌شات/رویدادها به وضعیت ──
  function applyCommon(s) {
    G.players = s.players || [];
    G.me = s.me || null;
    G.mates = s.mates || [];
    if (s.category !== undefined) G.category = s.category;
    if (s.me && s.me.word !== undefined) G.myWord = s.me.word;
    G.phase = s.phase;
    G.sub = s.sub;
    G.dayNo = s.dayNo;
    G.termsTotal = s.termsTotal;
    G.termsUsed = s.termsUsed;
    G.askerId = s.askerId;
    G.targetId = s.targetId;
    G.question = s.question;
    G.answer = s.answer;
    G.deadline = s.deadline;
    G.deadlineKey = s.deadlineKey;
    G.stickerUsed = !!s.stickerUsed;
    G.eliminated = s.eliminated || [];
    G.selected = null;
    if (s.log) G.log = s.log.map((l) => ({ kind: l.t === 'q' ? 'q' : l.t === 'a' ? 'a' : 'note', text: l.text, fromNum: l.from, toNum: l.to, term: l.term, mine: false, timeout: l.text === '(بدون پاسخ)' }));
  }

  function fullRender() {
    renderBanner();
    setTimer(G.deadline, G.deadlineTotal);
    renderPlayers();
    renderLogBubbles();
    renderAction();
    renderStickers();
    const qa = document.getElementById('qa-card');
    qa.style.display = G.phase === 'deal' ? 'none' : '';
    const rc = document.getElementById('role-card-box');
    rc.style.display = G.phase === 'deal' ? '' : 'none';
  }

  // ── ورود به بازی ──
  SPY.connectSocket();
  SPY.on('connect', async () => {
    setConn(true);
    const res = await SPY.emit('room:rejoin', { code });
    if (!res || !res.ok) {
      SPY.clearRoom();
      SPY.toast((res && res.msg) || 'این بازی دیگر فعال نیست.', 'err');
      setTimeout(() => (location.href = 'home.html'), 900);
    }
  });
  SPY.on('disconnect', () => setConn(false));
  SPY.on('connect_error', () => setConn(false));

  SPY.on('game:resume', (d) => {
    if (d.status === 'over' && d.state && d.state.over) {
      sessionStorage.setItem('spy_last_over', JSON.stringify(d.state.over));
      location.href = 'result.html?code=' + code;
      return;
    }
    if (d.status === 'lobby') {
      location.href = 'lobby.html?code=' + code;
      return;
    }
    const st = d.state;
    applyCommon(st);
    G.candidates = (st.candidates || []).map((c) => c.id);
    G.revote = !!st.revote;
    G.myVote = st.myVote || null;
    G.voteCount = st.voteCount || 0;
    G.voteTotal = st.voteTotal || 0;
    G.nightIsSpy = !!st.nightIsSpy;
    G.nightPicksMine = st.nightPicksMine || null;
    G.nightProgress = st.nightProgress || { picked: 0, needed: 1 };
    G.over = st.over || null;
    if (G.phase === 'deal') renderRoleCard();
    fullRender();
  });

  SPY.on('game:init', (d) => {
    G.players = d.players;
    G.me = d.me;
    G.mates = d.me.mates || [];
    G.myWord = d.me.word;
    G.category = d.me.category;
    G.phase = 'deal';
    G.dayNo = 1;
    G.termsTotal = d.termsTotal;
    G.termsUsed = 0;
    G.log = [];
    G.eliminated = [];
    G.selected = null;
    SPY_AUDIO.playSfx('start');
    SPY_AUDIO.playMusic('start');
    setTimeout(() => SPY_AUDIO.playMusic('lobby'), 3600);
    renderRoleCard();
    renderBanner();
    renderPlayers();
    document.getElementById('qa-card').style.display = 'none';
    renderStickers();
  });

  // ── رویدادهای سرور ──
  SPY.on('game:term', (d) => {
    G.phase = 'day';
    G.sub = 'floor';
    G.dayNo = d.dayNo;
    G.termsUsed = d.term - 1;
    G.termsTotal = d.termsTotal;
    G.askerId = d.askerId;
    G.targetId = d.targetId;
    G.question = null;
    G.answer = null;
    G.deadline = d.deadline;
    G.deadlineKey = 'floor';
    G.deadlineTotal = 45;
    G.stickerUsed = false;
    G.selected = null;
    SPY_AUDIO.playMusic('lobby');
    fullRender();
  });
  SPY.on('game:question', (d) => {
    G.sub = 'answer';
    G.question = d.text;
    G.deadline = d.deadline;
    G.deadlineKey = 'answer';
    G.deadlineTotal = 60;
    G.selected = null;
    pushBubble({ kind: 'q', text: d.text, fromNum: (byId(d.from) || {}).number, toNum: (byId(d.to) || {}).number, fromAvatar: (byId(d.from) || {}).avatar, term: G.termsUsed + 1, mine: d.from === p.id });
    fullRender();
  });
  SPY.on('game:answer', (d) => {
    pushBubble({ kind: 'a', text: d.text, fromNum: (byId(d.from) || {}).number, fromAvatar: (byId(d.from) || {}).avatar, timeout: d.timeout, mine: d.from === p.id });
    if (d.text) G.answer = d.text;
  });
  SPY.on('game:challenge', (d) => {
    G.sub = 'challenge';
    G.deadline = d.deadline;
    G.deadlineKey = 'challenge';
    G.deadlineTotal = d.seconds || 15;
    G.selected = null;
    fullRender();
  });
  SPY.on('game:note', (d) => {
    pushBubble({ kind: 'note', text: d.text });
    SPY.toast(d.text);
  });
  SPY.on('game:termEnd', (d) => {
    G.termsUsed = d.used;
  });
  SPY.on('game:vote', (d) => {
    G.phase = 'vote';
    G.sub = null;
    G.candidates = d.candidates.map((c) => c.id);
    G.revote = false;
    G.myVote = null;
    G.voteCount = 0;
    G.voteTotal = d.total;
    G.deadline = d.deadline;
    G.deadlineKey = 'vote';
    G.deadlineTotal = 90;
    G.selected = null;
    SPY_AUDIO.playSfx('vote');
    SPY_AUDIO.playMusic('vote');
    fullRender();
  });
  SPY.on('game:revote', (d) => {
    G.phase = 'vote';
    G.candidates = d.candidates.map((c) => c.id);
    G.revote = true;
    G.myVote = null;
    G.voteCount = 0;
    G.voteTotal = d.total;
    G.deadline = d.deadline;
    G.deadlineTotal = 45;
    G.selected = null;
    SPY.toast(d.note || 'رأی‌گیری مجدد!');
    fullRender();
  });
  SPY.on('vote:ok', (d) => {
    G.myVote = d.targetId;
    G.voteCount = Math.min(G.voteCount + 1, G.voteTotal);
    renderAction();
    renderVoteProgress();
    renderBanner();
    renderPlayers();
  });
  SPY.on('game:voteProgress', (d) => {
    G.voteCount = d.count;
    G.voteTotal = d.total;
    renderVoteProgress();
    renderBanner();
  });
  SPY.on('game:voteResult', (d) => {
    if (d.eliminated) {
      const pl = byId(d.eliminated.id);
      if (pl) pl.alive = false;
      G.eliminated.push({ id: d.eliminated.id, name: d.eliminated.name, avatar: d.eliminated.avatar, role: d.role, by: 'vote' });
    }
    voteResultModal(d);
  });
  SPY.on('game:eliminated', (d) => {
    const pl = byId(d.player.id);
    if (pl) pl.alive = false;
    SPY_AUDIO.playSfx('eliminate');
    renderPlayers();
  });
  SPY.on('game:guessStart', (d) => {
    G.phase = 'guess';
    G.guessSpy = d.spy;
    G.guessMine = !!d.mine;
    G.deadline = d.deadline;
    G.deadlineTotal = 30;
    G.selected = null;
    renderBanner();
    renderPlayers();
    renderAction();
    renderStickers();
  });
  SPY.on('game:guessPrompt', (d) => {
    G.deadline = d.deadline;
    guessModal(d.deadline);
  });
  SPY.on('game:guessResult', (d) => {
    if (d.correct) SPY.toast('حدس جاسوس درست بود!', 'err');
    else SPY.toast(d.timeout ? 'جاسوس فرصت حدس را از دست داد.' : 'حدس جاسوس اشتباه بود.', 'ok');
  });
  SPY.on('game:night', (d) => {
    G.phase = 'night';
    G.sub = null;
    G.nightIsSpy = !!d.isSpy;
    G.nightPicksMine = null;
    G.nightProgress = { picked: 0, needed: d.needed };
    G.deadline = d.deadline;
    G.deadlineKey = 'night';
    G.deadlineTotal = 45;
    G.selected = null;
    SPY_AUDIO.playMusic('night');
    fullRender();
  });
  SPY.on('game:nightProgress', (d) => {
    G.nightProgress = { picked: d.picked, needed: d.needed };
    renderBanner();
    renderAction();
  });
  SPY.on('game:dawn', (d) => {
    const pl = byId(d.eliminated.id);
    if (pl) pl.alive = false;
    elimModal(d.eliminated, 'night', d.role);
  });
  SPY.on('game:daybreak', (d) => {
    G.dayNo = d.dayNo;
    G.termsUsed = 0;
    G.termsTotal = d.termsTotal;
    SPY.toast(`روز ${SPY.fa(d.dayNo)} شروع شد!`);
    SPY_AUDIO.playMusic('lobby');
  });
  SPY.on('game:sticker', (d) => {
    showStickerFloat(d.from, d.sticker);
    if (d.from.id === p.id) {
      G.stickerUsed = true;
      renderStickers();
    }
  });
  SPY.on('game:presence', (d) => {
    (d.players || []).forEach((x) => {
      const pl = byId(x.id);
      if (pl) pl.connected = x.connected;
    });
    renderPlayers();
  });
  SPY.on('game:over', (d) => {
    G.over = d;
    G.phase = 'over';
    SPY_AUDIO.playSfx('end');
    SPY_AUDIO.playMusic('end');
    sessionStorage.setItem('spy_last_over', JSON.stringify(d));
    setTimeout(() => (location.href = 'result.html?code=' + code), 1600);
    renderBanner();
  });
  SPY.on('me:update', (d) => SPY.updateCoins(d.coins));
  SPY.on('err', (e) => SPY.toast((e && e.msg) || 'خطا', 'err'));

  document.getElementById('leave-btn').onclick = async () => {
    const ok = await SPY.confirmBox('از بازی خارج می‌شوی؟ مسابقه بدون تو ادامه پیدا می‌کند.', 'خروج', true);
    if (!ok) return;
    SPY.emit('room:leave', {});
    SPY.clearRoom();
    location.href = 'home.html';
  };
})();
