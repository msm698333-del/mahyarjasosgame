import { useState } from 'react';
import { PublicState } from '../../shared/types';
import { socket, useStore } from '../net/store';
import { Btn, faNum } from '../components/ui';
import { PlayerCard } from '../components/PlayerCard';
import { StickerOverlay } from '../components/StickerPanel';
import { VoiceBar } from '../components/VoiceBar';
import { TimerBar, TurnBanner } from '../components/TimerBar';
import { IconSkip, IconMicOff } from '../components/Icons';

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
        {role?.isSpy ? <SpyGuessTyping /> : <WaitingPanel text={`${speaker?.name ?? 'جاسوس'} متهم شد! حالا جاسوس یک فرصت دارد کلمهٔ مخفی را بنویسد…`} />}
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
                <ChallengeControls st={st} meId={me.id} />
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
              <li>هر بازیکن یک نوبت ۱۵ ثانیه‌ای صحبت دارد و ترتیب نوبت‌ها دقیقاً حفظ می‌شود.</li>
              <li>در نوبت خود می‌توانید بازیکن دیگری را به چالش بکشید؛ به‌چالش‌کشیده‌شده می‌تواند نوبت را به بازیکن دیگر واگذار کند.</li>
              <li>میکروفن فقط در نوبت شما باز است و با پایان زمان خودکار بسته می‌شود.</li>
              <li>کلمه را مستقیم نگویید و دستهٔ کلمه را لو ندهید؛ فقط سرنخ بدهید.</li>
              <li>چت متنی در طول بازی غیرفعال است؛ ارتباط فقط صوتی در نوبت خود.</li>
              <li>بعد از آخرین نوبت، رأی‌گیری شروع می‌شود؛ جاسوسِ متهم‌شده با نوشتن درست کلمه برنده می‌شود.</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}

/**
 * چالش و واگذاری نوبت (قانون ۱):
 * نوبت‌دار هر بازیکن دیگر را می‌تواند به چالش بکشد؛
 * به‌چالش‌کشیده‌شده حق واگذاری نوبت به بازیکن دیگر را هم دارد.
 */
function ChallengeControls({ st, meId }: { st: PublicState; meId: string }) {
  const targets = st.players.filter((p) => p.id !== meId && p.connected && !p.eliminated);
  const [sel, setSel] = useState<string>('');
  const selOk = targets.some((p) => p.id === sel) ? sel : (targets[0]?.id ?? '');
  const challenged = st.challengedIds.includes(meId);
  if (targets.length === 0) return null;
  return (
    <div className="challenge-row">
      <select value={selOk} onChange={(e) => setSel(e.target.value)} aria-label="انتخاب بازیکن">
        {targets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <Btn variant="warn" size="lg" disabled={!selOk}
        onClick={() => socket.send({ t: 'challenge', targetId: selOk })}
        title="نوبت را به این بازیکن بده">
        به چالش کشیدن
      </Btn>
      {challenged && (
        <Btn variant="primary" size="lg" disabled={!selOk}
          onClick={() => socket.send({ t: 'passTurn', targetId: selOk })}
          title="نوبت خود را به این بازیکن واگذار کن">
          واگذاری نوبت
        </Btn>
      )}
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

/**
 * حدس جاسوس با نوشتن کلمه (قانون ۲):
 * کلمه باید دقیقاً و با املای درست نوشته شود؛ نوشتن با خط‌فاصله (مثل «کوه-نورد»)
 * یا نیم‌فاصله یا فاصله — همگی بدون خطا و هشدار پذیرفته می‌شوند.
 */
function SpyGuessTyping() {
  const [word, setWord] = useState('');
  const [confirm, setConfirm] = useState(false);
  const toastNow = useStore((s) => s.toastNow);
  const clean = word.trim();
  return (
    <div className="card guess-panel">
      <h3>کلمهٔ مخفی را بنویسید — فقط یک فرصت!</h3>
      <p className="muted small">املای درست کافی است؛ نوشتن با خط‌فاصله (مثل «کوه-نورد») یا بدون آن پذیرفته می‌شود.</p>
      <input
        className="guess-input"
        dir="rtl"
        placeholder="کلمهٔ مخفی…"
        value={word}
        maxLength={60}
        onChange={(e) => setWord(e.target.value)}
      />
      <div className="guess-actions">
        <Btn variant="danger" size="lg" disabled={clean.length < 2} onClick={() => setConfirm(true)}>
          ثبت حدس کلمه
        </Btn>
      </div>
      {confirm && (
        <div className="modal-backdrop" onClick={() => setConfirm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head"><h3>مطمئن هستید؟</h3></div>
            <div className="modal-body">
              <p>حدس شما <b>{clean}</b> است. فقط یک فرصت دارید و بعد از تأیید، نتیجه اعلام می‌شود.</p>
              <div className="row-actions">
                <Btn variant="ghost" onClick={() => setConfirm(false)}>نه، برگرد</Btn>
                <Btn variant="danger" onClick={() => {
                  socket.send({ t: 'spyGuessWord', word: clean });
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
