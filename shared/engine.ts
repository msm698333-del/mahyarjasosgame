  }
  return { changed: true };
}

/* ---------- تنظیمات ---------- */

export function updateSettings(s: RoomState, actorId: string, patch: Partial<GameSettings>): ApplyOk {
  if (actorId !== s.hostId) return { changed: false, err: ERR.NOT_HOST };
  if (s.phase !== 'waiting') return { changed: false, err: ERR.WRONG_PHASE };
  const st = { ...s.settings };
  if (patch.maxPlayers !== undefined) st.maxPlayers = clamp(patch.maxPlayers | 0, 3, 12);
  if (patch.spyCount !== undefined) st.spyCount = clamp(patch.spyCount | 0, 1, 2);
  if (patch.discussionSeconds !== undefined) st.discussionSeconds = clamp(patch.discussionSeconds | 0, 180, 900);
  if (patch.voteSeconds !== undefined) st.voteSeconds = clamp(patch.voteSeconds | 0, 15, 120);
  if (patch.guessSeconds !== undefined) st.guessSeconds = clamp(patch.guessSeconds | 0, 30, 90);
  if (patch.turnSeconds !== undefined) st.turnSeconds = clamp(patch.turnSeconds | 0, 15, 120);
  if (patch.skipPerPlayer !== undefined) st.skipPerPlayer = clamp(patch.skipPerPlayer | 0, 0, 5);
  if (patch.spyWord !== undefined && (patch.spyWord === 'nearby' || patch.spyWord === 'none')) st.spyWord = patch.spyWord;
  if (patch.categories !== undefined && Array.isArray(patch.categories)) {
    const valid = new Set(['public', 'education', 'fun', 'food', 'health', 'historic', 'sport', 'travel', 'fantasy']);
    st.categories = patch.categories.filter((c) => valid.has(c)).slice(0, 9);
  }
  if (st.spyCount === 2 && st.maxPlayers < 6) st.maxPlayers = 6;
  s.settings = st;
  for (const p of s.players) p.skipLeft = st.skipPerPlayer;
  return { changed: true };
}

/* ---------- شروع دور ---------- */

/** فازهایی که بازی در جریان است (برای بررسی برد/باخت هنگام خروج بازیکن) */
const MATCH_PHASES: Set<Phase> = new Set(['revealing', 'discussion', 'voting', 'spyGuess', 'roundResult']);

/** کلمهٔ نزدیک برای جاسوس — ترجیحاً از همان دستهٔ مکان شهروندها، ولی متفاوت */
function pickDecoyWord(base: LocationDef, rng: Rng): string {
  const sameCat = LOCATIONS.filter((l) => l.cat === base.cat && l.id !== base.id);
  const pool = sameCat.length > 0 ? sameCat : LOCATIONS.filter((l) => l.id !== base.id);
  return pool[Math.floor(rng() * pool.length)].name;
}

export function startRound(s: RoomState, d: Deps): ApplyOk & { err?: string } {
  if (s.phase !== 'waiting' && s.phase !== 'roundResult') return { changed: false, err: ERR.WRONG_PHASE };
  const active = s.players.filter((p) => p.connected && !p.eliminated);
  if (active.length < 3) return { changed: false, err: 'need_players' };

  // بازی تازه یا ادامه؟ جاسوس‌ها در طول یک بازی ثابت می‌مانند و فقط کلمه عوض می‌شود
  const freshMatch = s.spyIds.length === 0;
  if (freshMatch) {
    for (const p of s.players) p.eliminated = false;
  }
  const spyCount = Math.min(s.settings.spyCount, Math.floor(active.length / 3) || 1);
  const loc = pickLocation(s.settings.categories.length ? s.settings.categories : null, d.rng);
  if (!loc) return { changed: false, err: 'no_location' };

  let spyIds = s.spyIds.filter((id) => active.some((p) => p.id === id));
  if (freshMatch) {
    const pick = shuffle(active.map((p) => p.id), d.rng);
    spyIds = pick.slice(0, spyCount);
  }
  if (spyIds.length === 0) {
    // جاسوس بازی را ترک کرده — بدون شروع دور جدید، شهروندها برنده‌اند
    return endRound(s, d, false, null, 'جاسوس بازی را ترک کرد؛ شهروندها برنده شدند.');
  }
  s.spyIds = spyIds;

  s.location = loc;
  s.round += 1;
  s.phase = 'revealing';
  s.revealedAt = d.now;
  s.results = null;
  s.tally = null;
  s.tiedIds = null;
  s.votes = {};
  s.voteRound = 1;
  s.spyGuessId = null;
  s.targetId = null;
  s.deadline = null;
  s.readyIds = [];
  s.lastElimination = null;
  s.roundNote = null;

  const order = shuffle(active.map((p) => p.id), d.rng);
  const spySet = new Set(spyIds);
  // کلمهٔ جاسوس: نزدیک به کلمهٔ اصلی (تنظیم‌شدنی) — یا هیچ
  const decoyWord = s.settings.spyWord === 'nearby' ? pickDecoyWord(loc, d.rng) : null;

  // تخصیص کلمه: همهٔ شهروندها دقیقاً یک کلمهٔ یکسان می‌گیرند؛ فقط جاسوس متفاوت است
  for (const p of s.players) {
    p.skipLeft = s.settings.skipPerPlayer;
    p.role = null;
    if (!order.includes(p.id)) continue; // بازیکن قطع‌شده در این دور شرکت نمی‌کند
    if (spySet.has(p.id)) {
      p.role = decoyWord ? { isSpy: true, roleName: decoyWord } : { isSpy: true };
    } else {
      p.role = { isSpy: false, locationId: loc.id, locationName: loc.name, locationCategory: loc.cat };
    }
  }

  s.turnOrder = order;
  s.currentTurnIdx = -1;
  s.turnEndsAt = null;
  return { changed: true };
}

function allReady(s: RoomState): boolean {
  return s.players.filter((p) => p.connected && p.role).every((p) => s.readyIds.includes(p.id));
}

/** در فاز نقش‌نمایی، بازیکن قطع‌شدهٔ طولانی‌مدت از دور کنار گذاشته می‌شود تا بازی قفل نشود */
export function pruneReveal(s: RoomState, now: number, d: Deps): ApplyOk {
  if (s.phase !== 'revealing') return { changed: false };
  const cutoff = now - REVEAL_TIMEOUT_MS;
  const force = s.revealedAt != null && now - s.revealedAt > REVEAL_FORCE_MS;
  let changed = false;
  for (const p of [...s.players]) {
    const stuckDisconnected = p.role && !p.connected && p.lastSeen < cutoff;
    const stuckAtForce = force && p.role && !p.connected;
    if (stuckDisconnected || stuckAtForce) {
      p.role = null;
      s.turnOrder = s.turnOrder.filter((id) => id !== p.id);
      s.readyIds = s.readyIds.filter((id) => id !== p.id);
      changed = true;
    }
  }
  const allReadyNow = s.players.filter((p) => p.connected && p.role).length > 0
    && s.players.filter((p) => p.connected && p.role).every((p) => s.readyIds.includes(p.id));
  if ((force || allReadyNow) && s.turnOrder.length >= 2) {
    const r = startDiscussion(s, d);
    return { changed: true, alarmAt: r.alarmAt };
  }
  // اگر بعد از شروع اجباری کمتر از ۲ بازیکن باقی ماند، دور به لابی برمی‌گردد
  if (force && s.turnOrder.length < 2) {
    s.phase = 'waiting';
    s.location = null;
    s.turnOrder = [];
    s.currentTurnIdx = -1;
    s.revealedAt = null;
    for (const p of s.players) p.role = null;
    return { changed: true };
  }
  return { changed };
}

const REVEAL_TIMEOUT_MS = 60_000;
const REVEAL_FORCE_MS = 90_000;

/**
 * آمادگی بازیکن — در دو نقطه:
 * ۱) صفحه انتظار (waiting): با آماده شدن همه، بازی خودکار و بدون تأیید میزبان شروع می‌شود.
 * ۲) پروندهٔ نقش (revealing): با آماده شدن همه، بحث شروع می‌شود.
 * value=false آمادگی را لغو می‌کند تا شروعِ ناقص رخ ندهد.
 */
export function markReady(s: RoomState, playerId: string, d: Deps, value = true): ApplyOk {
  const p = playerById(s, playerId);
  if (!p) return { changed: false, err: ERR.BAD_TARGET };
  if (s.phase === 'waiting') {
    const was = s.readyIds.includes(playerId);
    if (value && !was) s.readyIds.push(playerId);
    if (!value && was) s.readyIds = s.readyIds.filter((x) => x !== playerId);
    const connected = s.players.filter((x) => x.connected);
    const allIn = connected.length >= 3 && connected.every((x) => s.readyIds.includes(x.id));
    if (allIn) return startRound(s, d);
    return { changed: was !== s.readyIds.includes(playerId) };
  }
  if (s.phase !== 'revealing') return { changed: false, err: ERR.WRONG_PHASE };
  if (!p.role) return { changed: false, err: ERR.WRONG_PHASE };
  const was = s.readyIds.includes(playerId);
  if (value && !was) s.readyIds.push(playerId);
  if (!value && was) s.readyIds = s.readyIds.filter((x) => x !== playerId);
  if (allReady(s)) return startDiscussion(s, d);
  return { changed: was !== s.readyIds.includes(playerId) };
}

/**
 * کنترل سروری میکروفون (مکانیزم نوبتی مثل مافیا):
 * — در بحث فقط نوبت‌دار میکروفن باز دارد؛ بقیه به‌طور خودکار بسته می‌شوند.
 * — در رأی‌گیری و حدس جاسوس میکروفن همه بسته است.
 * — در صفحات انتظار/نقش/نتیجه گفت‌وگوی آزاد است.
 */
export function syncTurnMics(s: RoomState): void {
  if (s.phase === 'discussion') {
    const sp = currentSpeakerId(s);
    for (const p of s.players) {
      const should = p.id === sp && !p.forceMuted && p.hasVoice;
      if (p.micOn !== should) p.micOn = should;
      if (!should && p.speaking) p.speaking = false;
    }
  } else if (s.phase === 'voting' || s.phase === 'spyGuess') {
    for (const p of s.players) {
      if (p.micOn || p.speaking) {
        p.micOn = false;
        p.speaking = false;
      }
    }
  }
}

export function startDiscussion(s: RoomState, d: Deps): ApplyOk {
  s.phase = 'discussion';
  s.deadline = d.now + s.settings.discussionSeconds * 1000; // سقف احتیاطی
  s.currentTurnIdx = 0;
  s.turnEndsAt = d.now + s.settings.turnSeconds * 1000;
  s.targetId = null;
  syncTurnMics(s);
  return { changed: true, alarmAt: Math.min(s.deadline, s.turnEndsAt) };
}

/* ---------- نوبت‌ها ---------- */

/**
 * نوبت بعدی. اگر یک دور کامل صحبت تمام شود (چرخش به ابتدای لیست)،
 * رأی‌گیری خودکار شروع می‌شود — دیگر نیازی به پایان‌زمان کل بحث نیست.
 */
function advanceTurn(s: RoomState, d: Deps): ApplyOk {
  if (s.phase !== 'discussion' || s.turnOrder.length === 0) return { changed: false };
  const oldIdx = s.currentTurnIdx;
  let newIdx = oldIdx;
  for (let i = 0; i < s.turnOrder.length; i++) {
    newIdx = (newIdx + 1) % s.turnOrder.length;
    const pid = s.turnOrder[newIdx];
    const p = playerById(s, pid);
    if (p && p.connected && !p.eliminated) break;
    // بازیکن قطع‌شده/حذف‌شده → نوبتش خودکار رد می‌شود
  }
  if (newIdx <= oldIdx) {
    // دور صحبت کامل شد → فاز رأی‌گیری
    return beginVoting(s, d, null);
  }
  s.currentTurnIdx = newIdx;
  s.turnEndsAt = d.now + s.settings.turnSeconds * 1000;
  s.targetId = null;
  syncTurnMics(s);
  return { changed: true };
}

export function skipTurn(s: RoomState, playerId: string, d: Deps): ApplyOk {
  if (s.phase !== 'discussion') return { changed: false, err: ERR.WRONG_PHASE };
  if (currentSpeakerId(s) !== playerId) return { changed: false, err: ERR.NOT_YOUR_TURN };
  const p = playerById(s, playerId);
  if (!p) return { changed: false, err: ERR.BAD_TARGET };
  if (p.skipLeft <= 0) return { changed: false, err: ERR.NO_SKIPS };
  p.skipLeft -= 1;
  advanceTurn(s, d);
  return { changed: true, alarmAt: nextDeadline(s) };
}

export function endTurn(s: RoomState, playerId: string, d: Deps): ApplyOk {
  if (s.phase !== 'discussion') return { changed: false, err: ERR.WRONG_PHASE };
  if (currentSpeakerId(s) !== playerId) return { changed: false, err: ERR.NOT_YOUR_TURN };
  advanceTurn(s, d);
  return { changed: true, alarmAt: nextDeadline(s) };
}

export function setTarget(s: RoomState, playerId: string, targetId: string): ApplyOk {
  if (s.phase !== 'discussion') return { changed: false, err: ERR.WRONG_PHASE };
  if (currentSpeakerId(s) !== playerId) return { changed: false, err: ERR.NOT_YOUR_TURN };
  const t = playerById(s, targetId);
  if (!t || t.id === playerId) return { changed: false, err: ERR.BAD_TARGET };
  s.targetId = targetId;
  return { changed: true };
}

/* ---------- رأی‌گیری ---------- */

function beginVoting(s: RoomState, d: Deps, tiedIds: string[] | null): ApplyOk {
  s.phase = 'voting';
  s.voteRound = tiedIds ? s.voteRound + 1 : 1;
  s.tiedIds = tiedIds;
  s.votes = {};
  s.tally = null;
  s.deadline = d.now + s.settings.voteSeconds * 1000;
  syncTurnMics(s); // در رأی‌گیری میکروفن همه بسته است
  return { changed: true, alarmAt: s.deadline };
}

export function castVote(s: RoomState, voterId: string, targetId: string | null, d: Deps): ApplyOk {
  if (s.phase !== 'voting') return { changed: false, err: ERR.WRONG_PHASE };
  const voter = playerById(s, voterId);
  if (!voter || voter.eliminated) return { changed: false, err: ERR.WRONG_PHASE };
  if (voterId in s.votes) return { changed: false, err: ERR.ALREADY_VOTED };
  if (targetId !== null) {
    const t = playerById(s, targetId);
    if (!t || t.eliminated) return { changed: false, err: ERR.BAD_VOTE };
    if (s.tiedIds && !s.tiedIds.includes(targetId)) return { changed: false, err: ERR.BAD_VOTE };
    if (!s.tiedIds && t.id === voterId) return { changed: false, err: ERR.BAD_VOTE };
  }
  s.votes[voterId] = targetId;
  // حذف‌شدگان و قطع‌شدگان در شمارش «همه رأی دادند» وارد نمی‌شوند
  const eligible = s.players.filter((p) => p.connected && !p.eliminated).map((p) => p.id);
  const allVoted = eligible.every((id) => id in s.votes);
  if (allVoted) return resolveVotes(s, d);
  return { changed: true, alarmAt: s.deadline };
}

/** حذف‌شدهٔ رأی‌گیری را کنار می‌گذارد و وضعیت برد/ادامهٔ بازی را برمی‌گرداند */
function eliminatePlayer(s: RoomState, playerId: string | null, wasSpy: boolean): void {
  const p = playerById(s, playerId);
  if (!p) return;
  p.eliminated = true;
  s.turnOrder = s.turnOrder.filter((id) => id !== playerId);
  s.readyIds = s.readyIds.filter((id) => id !== playerId);
  if (wasSpy) s.spyIds = s.spyIds.filter((id) => id !== playerId);
  if (s.targetId === playerId) s.targetId = null;
  s.lastElimination = { playerId: p.id, name: p.name, wasSpy };
}

/** انتقال به صفحهٔ «نتیجهٔ دور» — چند ثانیه نمایش، بعد دور بعدی */
function gotoRoundResult(s: RoomState, d: Deps, note: string | null): ApplyOk {
  s.phase = 'roundResult';
  s.roundNote = note;
  s.deadline = d.now + ROUND_RESULT_SECONDS * 1000;
  s.turnEndsAt = null;
  syncTurnMics(s);
  return { changed: true, alarmAt: s.deadline };
}

export function resolveVotes(s: RoomState, d: Deps): ApplyOk {
  const counts: Record<string, number> = {};
  for (const target of Object.values(s.votes)) {
    if (target) counts[target] = (counts[target] ?? 0) + 1;
  }
  let max = 0;
  for (const c of Object.values(counts)) max = Math.max(max, c);
  const top = Object.entries(counts).filter(([, c]) => c === max && max > 0).map(([id]) => id);

  if (top.length === 0) {
    // هیچ‌کس متهم نشد — بدون حذف، دور بعد (مثل مافیا)
    s.tally = { accusedId: null, counts, spyCaught: false };
    return gotoRoundResult(s, d, 'هیچ رأی مؤثری ثبت نشد؛ بدون حذف به دور بعد می‌رویم.');
  }
  if (top.length > 1) {
    if (s.tiedIds) {
      return endRound(s, d, true, null, 'در رأی‌گیری مجدد هم تساوی پیش آمد؛ جاسوس فرار کرد.');
    }
    return beginVoting(s, d, top);
  }
  const accused = top[0];
  const accusedP = playerById(s, accused);
  const spyCaught = !!accusedP?.role?.isSpy;
  s.tally = { accusedId: accused, counts, spyCaught };
  if (spyCaught) {
    s.phase = 'spyGuess';
    s.deadline = d.now + s.settings.guessSeconds * 1000;
    syncTurnMics(s);
    return { changed: true, alarmAt: s.deadline };
  }
  // شهروند اشتباه حذف شد — نقش او افشا می‌شود؛ اگر به حد بحرانی رسید جاسوس برنده است
  eliminatePlayer(s, accused, false);
  const spiesAlive = s.turnOrder.filter((id) => s.spyIds.includes(id)).length;
  const civAlive = s.turnOrder.filter((id) => !s.spyIds.includes(id)).length;
  if (civAlive <= spiesAlive) {
    return endRound(s, d, true, accused, `${accusedP?.name ?? 'بازیکن'} اشتباهاً حذف شد؛ شهروندها به حد بحرانی رسیدند و جاسوس برنده شد.`);
  }
  return gotoRoundResult(s, d, null);
}

/* ---------- حدس جاسوس ---------- */

/** بعد از متهم شدن جاسوس: حدس درست = برد جاسوس؛ وگرنه حذف او و بررسی ادامهٔ بازی */
function afterCaughtSpy(s: RoomState, d: Deps, correctGuess: boolean, reason: string): ApplyOk {
  const spyId = s.tally?.accusedId ?? null;
  const spyP = playerById(s, spyId);
  if (correctGuess) {
    return endRound(s, d, true, spyId, reason);
  }
  eliminatePlayer(s, spyId, true); // افشای نقش: جاسوس بود
  const spiesAlive = s.turnOrder.filter((id) => s.spyIds.includes(id)).length;
  if (spiesAlive === 0) {
    return endRound(s, d, false, spyId, reason);
  }
  // جاسوس دیگری هنوز در بازی است → دور بعد
  return gotoRoundResult(s, d, null);
}

export function spyGuess(s: RoomState, playerId: string, locationId: string, d: Deps): ApplyOk {
  if (s.phase !== 'spyGuess') return { changed: false, err: ERR.WRONG_PHASE };
  const p = playerById(s, playerId);
  if (!p?.role?.isSpy) return { changed: false, err: ERR.NOT_SPY };
  if (s.spyGuessId) return { changed: false, err: ERR.BAD_GUESS };
  if (!locationById(locationId)) return { changed: false, err: ERR.BAD_GUESS };
  s.spyGuessId = locationId;
  if (locationId === s.location?.id) {
    return afterCaughtSpy(s, d, true, `${p.name} متهم شد اما مکان مخفی را درست حدس زد؛ جاسوس‌ها برنده شدند!`);
  }
  return afterCaughtSpy(s, d, false, `${p.name} متهم و حذف شد و حدس مکان هم غلط بود؛ ${s.turnOrder.filter((id) => s.spyIds.includes(id)).length > 0 ? 'بازی ادامه دارد.' : 'شهروندها برنده شدند!'}`);
}

export function endRound(s: RoomState, d: Deps, spyWon: boolean, accusedId: string | null, reason: string): ApplyOk {
  s.phase = 'ended';
  s.deadline = null;
  s.turnEndsAt = null;
  s.roundNote = null;
  // افشای کامل: نقش‌های همین دور — جاسوسِ حذف‌شده هم نقشش هنوز set است
  const spyIds = s.players.filter((p) => p.role?.isSpy).map((p) => p.id);
  const scores: Record<string, number> = {};
  for (const p of s.players) {
    const win = spyIds.includes(p.id) ? spyWon : !spyWon;
    if (win) p.score += 1;
    scores[p.id] = p.score;
  }
  s.results = {
    spyIds,
    locationId: s.location?.id ?? '',
    locationName: s.location?.name ?? '',
    locationCategory: s.location?.cat ?? '',
    accusedId,
    votes: s.tally?.counts ? { ...s.votes } : { ...s.votes },
    spyWon,
    spyGuessId: s.spyGuessId,
    reason,
    scores
  };
  return { changed: true };
}

export function restartRound(s: RoomState, actorId: string, d: Deps): ApplyOk {
  if (actorId !== s.hostId) return { changed: false, err: ERR.NOT_HOST };
  if (s.phase !== 'ended') return { changed: false, err: ERR.WRONG_PHASE };
  // بازی کاملاً تازه: جاسوس‌ها و حذف‌شدگان از نو
  s.phase = 'waiting';
  s.spyIds = [];
  s.lastElimination = null;
  s.roundNote = null;
  for (const p of s.players) {
    p.role = null;
    p.eliminated = false;
  }
  s.location = null;
  return startRound(s, d);
}

/* ---------- مدیریت اعضا ---------- */

export function kickPlayer(s: RoomState, actorId: string, targetId: string, d: Deps): ApplyOk {
  if (actorId !== s.hostId) return { changed: false, err: ERR.NOT_HOST };
  if (targetId === actorId) return { changed: false, err: ERR.BAD_TARGET };
  const t = playerById(s, targetId);
  if (!t) return { changed: false, err: ERR.BAD_TARGET };
  const r = removePlayer(s, targetId, d);
  return { ...r, closePlayer: targetId };
}

export function reportPlayer(s: RoomState, actorId: string, targetId: string): ApplyOk {
  const a = playerById(s, actorId);
  const t = playerById(s, targetId);
  if (!a || !t || a.id === t.id) return { changed: false, err: ERR.BAD_TARGET };
  if (t.reportedBy.has(actorId)) return { changed: false };
  t.reportedBy.add(actorId);
  t.reports += 1;
  return { changed: true };
}

export function forceMute(s: RoomState, actorId: string, targetId: string, muted: boolean): ApplyOk {
  if (actorId !== s.hostId) return { changed: false, err: ERR.NOT_HOST };
  const t = playerById(s, targetId);
  if (!t) return { changed: false, err: ERR.BAD_TARGET };
  t.forceMuted = muted;
  return { changed: true };
}

/* ---------- چت و استیکر ---------- */

/** فازهایی که چت متنی در آن‌ها قفل است — ارتباط فقط صوتی و در نوبت خود */
const CHAT_LOCKED_PHASES: Set<Phase> = new Set(['discussion', 'voting', 'spyGuess']);

export function sendChat(s: RoomState, playerId: string, text: string, d: Deps): ApplyOk {
  if (CHAT_LOCKED_PHASES.has(s.phase)) return { changed: false, err: ERR.CHAT_LOCKED };
  const p = playerById(s, playerId);
  if (!p) return { changed: false, err: ERR.BAD_TARGET };
  const clean = text.trim().slice(0, 200);
  if (!clean) return { changed: false };
  const last = s.lastChatAt[playerId] ?? 0;
  if (d.now - last < 1200) return { changed: false, err: ERR.RATE_LIMIT };
  s.lastChatAt[playerId] = d.now;
  return {
    changed: false,
    mutated: true,
    emits: [{ t: 'chat', from: playerId, name: p.name, text: clean, ts: d.now }]
  };
}

export function sendSticker(s: RoomState, playerId: string, id: string, d: Deps): ApplyOk {
  if (CHAT_LOCKED_PHASES.has(s.phase)) return { changed: false, err: ERR.CHAT_LOCKED };
  const p = playerById(s, playerId);
  if (!p) return { changed: false, err: ERR.BAD_TARGET };
  if (!/^[a-z0-9-]{1,32}$/.test(id)) return { changed: false, err: ERR.BAD_MSG };
  const last = s.lastStickerAt[playerId] ?? 0;
  if (d.now - last < 3000) return { changed: false, err: ERR.RATE_LIMIT };
  s.lastStickerAt[playerId] = d.now;
  return { changed: false, mutated: true, emits: [{ t: 'sticker', from: playerId, id, ts: d.now }] };
}

export function setVoice(s: RoomState, playerId: string, micOn: boolean, speaking: boolean, joined?: boolean): ApplyOk {
  const p = playerById(s, playerId);
  if (!p) return { changed: false };
  // کنترل نوبتی میکروفون: درخواست میکروفن خارج از نوبت رد و با هشدار خصوصی همراه می‌شود
  let allowed = true;
  if (micOn) {
    if (s.phase === 'discussion') allowed = currentSpeakerId(s) === playerId;
    else if (s.phase === 'voting' || s.phase === 'spyGuess') allowed = false;
  }
  const mic = allowed ? (micOn && !p.forceMuted) : false;
  let changed = false;
  // پیوستن/ترک گفتگوی صوتی — تعیین‌کنندهٔ hasVoice برای همگام‌سازی peerهای WebRTC
  if (joined === true && !p.hasVoice) { p.hasVoice = true; changed = true; }
  if (joined === false && p.hasVoice) { p.hasVoice = false; changed = true; }
  if (joined === false) {
    // خروج کامل: میکروفن و گفتار هم خاموش می‌شود
    if (p.micOn !== false || p.speaking !== false) { p.micOn = false; p.speaking = false; changed = true; }
  } else if (p.micOn !== mic || p.speaking !== (allowed ? speaking : false)) {
    p.micOn = mic;
    // گفتار خارج از نوبت هرگز پخش نمی‌شود
    p.speaking = allowed ? speaking : false;
    changed = true;
  }
  if (!allowed && micOn) {
    return {
      changed,
      direct: [{
        to: playerId,
        msg: { t: 'error', code: 'mic_forced_off', message: 'الان نوبت شما نیست؛ میکروفن فقط در نوبت شما باز می‌شود.' }
      }]
    };
  }
  return { changed };
}

/* ---------- آلارم‌ها و زمان‌بندی ---------- */

export function nextDeadline(s: RoomState): number | null {
  const candidates: number[] = [];
  if (s.deadline) candidates.push(s.deadline);
  if (s.turnEndsAt) candidates.push(s.turnEndsAt);
  return candidates.length ? Math.min(...candidates) : null;
}

export function onDeadline(s: RoomState, d: Deps): ApplyOk {
  const now = d.now;
  let res: ApplyOk = { changed: false };
  if (s.turnEndsAt && s.turnEndsAt <= now && s.phase === 'discussion') {
    advanceTurn(s, d);
    res = { changed: true, alarmAt: nextDeadline(s) };
  }
  if (s.deadline && s.deadline <= now) {
    if (s.phase === 'discussion') {
      const r = beginVoting(s, d, null);
      return { changed: true, alarmAt: r.alarmAt };
    }
    if (s.phase === 'voting') {
      const r = resolveVotes(s, d);
      return { ...r, alarmAt: nextDeadline(s) };
    }
    if (s.phase === 'spyGuess') {
      const spyName = s.players.find((p) => s.spyIds.includes(p.id))?.name ?? 'جاسوس';
      return afterCaughtSpy(s, d, false, `${spyName} در فرصت حدس مکان، زمان را از دست داد؛ ${s.turnOrder.filter((id) => s.spyIds.includes(id)).length > 0 ? 'بازی ادامه دارد.' : 'شهروندها برنده شدند!'}`);
    }
    if (s.phase === 'roundResult') {
      // شروع خودکار دور بعد با کلمهٔ جدید؛ اگر ممکن نبود به لابی برمی‌گردیم
      const r = startRound(s, d);
      if (r.err) {
        s.phase = 'waiting';
        s.location = null;
        s.deadline = null;
        s.turnEndsAt = null;
        for (const p of s.players) {
          p.role = null;
          p.eliminated = false;
        }
        return { changed: true, alarmAt: null };
      }
      return { changed: true, alarmAt: nextDeadline(s) };
    }
  }
  return res;
}

/* ---------- دیسپچر اصلی ---------- */

export function apply(s: RoomState, playerId: string | null, msg: C2S, d: Deps): ApplyOk {
  switch (msg.t) {
    case 'ready':
      if (!playerId) return { changed: false, err: ERR.BAD_MSG };
      return markReady(s, playerId, d, msg.value !== false);
    case 'start': {
      if (!playerId || playerId !== s.hostId) return { changed: false, err: ERR.NOT_HOST };
      return startRound(s, d);
    }
    case 'restart': {
      if (!playerId) return { changed: false, err: ERR.BAD_MSG };
      return restartRound(s, playerId, d);
    }
    case 'updateSettings':
      if (!playerId) return { changed: false, err: ERR.BAD_MSG };
      return updateSettings(s, playerId, msg.patch ?? {});
    case 'chat':
      if (!playerId) return { changed: false, err: ERR.BAD_MSG };
      return sendChat(s, playerId, String(msg.text ?? ''), d);
    case 'sticker':
      if (!playerId) return { changed: false, err: ERR.BAD_MSG };
      return sendSticker(s, playerId, String(msg.id ?? ''), d);
    case 'skipTurn':
      if (!playerId) return { changed: false, err: ERR.BAD_MSG };
      return skipTurn(s, playerId, d);
    case 'endTurn':
      if (!playerId) return { changed: false, err: ERR.BAD_MSG };
      return endTurn(s, playerId, d);
    case 'target':
      if (!playerId) return { changed: false, err: ERR.BAD_MSG };
      return setTarget(s, playerId, String(msg.targetId ?? ''));
    case 'vote': {
      if (!playerId) return { changed: false, err: ERR.BAD_MSG };
      const t = msg.targetId === null ? null : String(msg.targetId);
      return castVote(s, playerId, t, d);
    }
    case 'spyGuess':
      if (!playerId) return { changed: false, err: ERR.BAD_MSG };
      return spyGuess(s, playerId, String(msg.locationId ?? ''), d);
    case 'voice': {
      if (!playerId) return { changed: false, err: ERR.BAD_MSG };
      return setVoice(s, playerId, !!msg.micOn, !!msg.speaking, msg.joined === undefined ? undefined : !!msg.joined);
    }
    case 'report':
      if (!playerId) return { changed: false, err: ERR.BAD_MSG };
      return reportPlayer(s, playerId, String(msg.targetId ?? ''));
    case 'kick':
      if (!playerId) return { changed: false, err: ERR.BAD_MSG };
      return kickPlayer(s, playerId, String(msg.targetId ?? ''), d);
    case 'mute':
      if (!playerId) return { changed: false, err: ERR.BAD_MSG };
      return forceMute(s, playerId, String(msg.targetId ?? ''), !!msg.muted);
    case 'leave': {
      if (!playerId) return { changed: false };
      const r = removePlayer(s, playerId, d);
      return { ...r, closePlayer: playerId };
    }
    case 'ping':
      return { changed: false };
    default:
      return { changed: false, err: ERR.BAD_MSG };
  }
}
