import { useState } from 'react';
import { PublicState } from '../../shared/types';
import { socket, useStore } from '../net/store';
import { Btn, faNum } from '../components/ui';
import { PlayerCard } from '../components/PlayerCard';
import { StickerOverlay } from '../components/StickerPanel';
import { VoiceBar } from '../components/VoiceBar';
import { TimerBar, TurnBanner } from '../components/TimerBar';
import { IconSkip, IconMicOff, IconSearch } from '../components/Icons';
import { LOCATIONS, CATEGORIES, categoryName } from '../../shared/locations';

/** محیط اصلی بازی: نوبت‌های ۱۵ ثانیه‌ای صحبت صوتی (مثل مافیا) — بدون چت متنی */
export function GameRoom({ st, spyGuessMode }: { st: PublicState; spyGuessMode?: boolean }) {
  const me = useStore((s) => s.you);
  const role = useStore((s) => s.role);
  const stickers = useStore((s) => s.stickers);
  if (!me) return null;
  const mePlayer = st.players.find((p) => p.id === me.id)!;
  const isSpeaker = st.turnOrder[st.currentTurnIdx] === me.id;
  const speakerId = st.turnOrder[st.currentTurnIdx];
  const speaker = st.players.find((p) => p.id === speakerId);

  if (spyGuessMode) {
    return (
      <div className="page game">
        <StickerOverlay items={stickers} />
        <TimerBar st={st} label="فرصت حدس جاسوس" />
        {role?.isSpy ? <SpyGuessPicker st={st} /> : <WaitingPanel text={`${speaker?.name ?? 'جاسوس'} متهم شد! حالا جاسوس یک فرصت دارد مکان مخفی را حدس بزند…`} />}
      </div>
    );
  }

  return (
    <div className="page game">
      <StickerOverlay items={stickers} />
      <TimerBar st={st} label="نوبت صحبت" mode="turn" />
      <TurnBanner st={st} meId={me.id} />

      <div className="game-grid">
        <section className="game-main card">
          <div className="players-grid">
            {st.players.map((p) => <PlayerCard key={p.id} p={p} st={st} me={mePlayer} />)}
          </div>

          <div className="game-actions">
            {isSpeaker && (
              <>
                <span className="turn-hint">سرنخ بدهید — کلمه را مستقیم نگویید</span>
                <Btn variant="warn" size="lg" disabled={mePlayer.skipLeft <= 0} onClick={() => socket.send({ t: 'skipTurn' })}
                  title={mePlayer.skipLeft <= 0 ? 'سهمیه تمام شده' : 'نوبت را رد کن و به نفر بعدی بده'}>
                  <IconSkip size={18} /> رد کردن نوبت ({faNum(mePlayer.skipLeft)})
                </Btn>
                <Btn variant="success" size="lg" onClick={() => socket.send({ t: 'endTurn' })}>پایان نوبت</Btn>
              </>
            )}
            {!isSpeaker && (
              <span className="muted mic-locked-note">
                <IconMicOff size={16} /> نوبت {speaker?.name ?? '—'} است؛ میکروفن شما تا نوبتتان خاموش است
              </span>
            )}
          </div>
          <VoiceBar />
        </section>

        <aside className="game-side">
          <div className="card side-card">
            <div className="side-head"><span>یادآوری قوانین</span></div>
            <ul className="mini-rules">
              <li>هر بازیکن در هر دور یک نوبت ۱۵ ثانیه‌ای صحبت دارد.</li>
              <li>میکروفن فقط در نوبت شما باز است و با پایان زمان خودکار بسته می‌شود.</li>
              <li>کلمه را مستقیم نگویید؛ فقط سرنخ بدهید.</li>
              <li>چت متنی در طول بازی غیرفعال است؛ ارتباط فقط صوتی در نوبت خود.</li>
              <li>بعد از آخرین نوبت، رأی‌گیری برای حذف جاسوس شروع می‌شود.</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}

function WaitingPanel({ text }: { text: string }) {
  return (
    <div className="card waiting-panel">
      <div className="pulse-dot" />
      <p>{text}</p>
    </div>
  );
}

/** انتخابگر مکان برای حدس جاسوس */
function SpyGuessPicker({ st }: { st: PublicState }) {
  const [cat, setCat] = useState<string>(CATEGORIES[0].id);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const toastNow = useStore((s) => s.toastNow);

  const list = LOCATIONS.filter((l) => (q ? l.name.includes(q.trim()) : l.cat === cat));

  return (
    <div className="card guess-panel">
      <h3>فرصت حدس مکان مخفی — یک بار و فقط یک بار!</h3>
      <div className="guess-tools">
        <select value={cat} onChange={(e) => setCat(e.target.value)} disabled={!!q}>
          {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div className="guess-search">
          <IconSearch size={16} />
          <input placeholder="جستجوی مکان…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      <div className="guess-list">
        {list.map((l) => (
          <button key={l.id} className={`guess-item ${sel === l.id ? 'sel' : ''}`} onClick={() => setSel(l.id)}>
            {l.name}
            <span className="muted small">{categoryName(l.cat)}</span>
          </button>
        ))}
      </div>
      <div className="guess-actions">
        <Btn variant="danger" size="lg" disabled={!sel} onClick={() => setConfirm(true)}>
          حدس نهایی: {sel ? LOCATIONS.find((l) => l.id === sel)?.name : '—'}
        </Btn>
      </div>
      {confirm && sel && (
        <div className="modal-backdrop" onClick={() => setConfirm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head"><h3>مطمئن هستید؟</h3></div>
            <div className="modal-body">
              <p>حدس شما <b>{LOCATIONS.find((l) => l.id === sel)?.name}</b> است. فقط یک فرصت دارید و بعد از تأیید، نتیجه اعلام می‌شود.</p>
              <div className="row-actions">
                <Btn variant="ghost" onClick={() => setConfirm(false)}>نه، برگرد</Btn>
                <Btn variant="danger" onClick={() => {
                  socket.send({ t: 'spyGuess', locationId: sel });
                  setConfirm(false);
                  toastNow('حدس شما ثبت شد.', 'info');
                }}>بله، حدس نهایی</Btn>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
