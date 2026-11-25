import { PublicState, ROUND_RESULT_SECONDS } from '../../shared/types';
import { TURN_COST_SECONDS } from '../../shared/quota';
import { fmtClock, faNum } from './ui';
import { useStore } from '../net/store';
import { sfx } from '../sounds';

/**
 * نوار تایمر — برای همهٔ بازیکنان یکسان و هماهنگ (مبنای زمان: سرور):
 * mode="turn": شمارش معکوس نوبت جاری — دقیقاً ۱۰ ثانیه، از ۱۰ تا صفر
 * mode="phase": زمان کل فاز (رأی‌گیری/حدس/نتیجهٔ دور)
 */
export function TimerBar({ st, label, mode = 'phase' }: { st: PublicState; label: string; mode?: 'phase' | 'turn' }) {
  const serverNow = useStore((s) => s.serverNow());
  let deadline: number | undefined;
  let total = 1;
  if (mode === 'turn' && st.phase === 'discussion') {
    deadline = st.turnEndsAt;
    total = st.settings.turnSeconds * 1000;
  } else {
    deadline = st.deadline;
    total = deadline && st.phase === 'discussion' ? st.settings.discussionSeconds * 1000
      : deadline && st.phase === 'voting' ? st.settings.voteSeconds * 1000
        : deadline && st.phase === 'spyGuess' ? st.settings.guessSeconds * 1000
          : deadline && st.phase === 'roundResult' ? ROUND_RESULT_SECONDS * 1000
            : 1;
  }
  const left = deadline ? Math.max(0, deadline - serverNow) : 0;
  const ratio = Math.min(1, left / total);
  const sec = Math.ceil(left / 1000);
  // نوبت ۱۰ ثانیه‌ای: ۵ ثانیهٔ آخر بحرانی است؛ فازهای طولانی: ۱۰ ثانیهٔ آخر
  const urgentLimit = mode === 'turn' ? 5 : 10;
  const urgent = sec <= urgentLimit && left > 0;

  // تیک صوتی ثانیه‌های بحرانی
  if (urgent) {
    const prev = tickRef.sec;
    if (prev !== sec) {
      tickRef.sec = sec;
      sfx.play('tick');
    }
  } else if (tickRef.sec !== 0) {
    tickRef.sec = 0;
  }

  return (
    <div className={`timer-wrap ${urgent ? 'urgent' : ''}`}>
      <div className="timer-info">
        <span className="timer-label">{label}</span>
        {deadline && (
          <span className="timer-clock">
            {mode === 'turn'
              ? <span className="timer-count">{faNum(Math.max(0, sec))} ثانیه</span>
              : fmtClock(left / 1000)}
          </span>
        )}
      </div>
      <div className="timer-bar">
        <div className="timer-fill" style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  );
}

const tickRef: { sec: number } = { sec: 0 };

/** نمایش سهمیهٔ زمانی روزانهٔ خود بازیکن — فقط از دیتای سرور (QuotaInfo) */
export function QuotaChip({ st }: { st: PublicState }) {
  const q = st.quota;
  if (!q) return null;
  const low = q.remaining < TURN_COST_SECONDS;
  return (
    <div className={`quota-chip ${low ? 'low' : ''}`} title="سهمیهٔ روزانه — بازنشانی در ۰۰:۰۰ تهران">
      <span className="quota-label">زمان امروز:</span>
      <span className="quota-value">{faNum(q.remaining)} از {faNum(q.total)} ثانیه</span>
      {low && <span className="quota-warn">سهمیهٔ شما برای نوبت جدید کافی نیست؛ نوبت شما رد می‌شود.</span>}
    </div>
  );
}

export function TurnBanner({ st, meId }: { st: PublicState; meId: string }) {
  const speakerId = st.turnOrder[st.currentTurnIdx];
  const speaker = st.players.find((p) => p.id === speakerId);
  const mine = speakerId === meId;
  const turnNo = st.currentTurnIdx + 1;
  return (
    <>
      <div className={`turn-banner ${mine ? 'mine' : ''}`}>
        {mine ? (
          <>
            <span className="tb-big">نوبت شماست ({faNum(turnNo)} از {faNum(st.turnOrder.length)})</span>
            <span className="tb-sub">میکروفن شما باز است — سرنخ بدهید؛ با پایان زمان نوبت بعدی شروع می‌شود</span>
          </>
        ) : (
          <>
            <span className="tb-big">نوبت: {speaker?.name ?? '—'} ({faNum(turnNo)} از {faNum(st.turnOrder.length)})</span>
            <span className="tb-sub">میکروفن‌های دیگران بسته است؛ گوش دهید تا سرنخ‌ها را بشنوید</span>
          </>
        )}
      </div>
      {st.turnNote && <div className="turn-note">{st.turnNote}</div>}
    </>
  );
}
