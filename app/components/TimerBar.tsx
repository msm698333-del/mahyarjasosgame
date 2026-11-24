import { PublicState } from '../../shared/types';
import { fmtClock } from './ui';
import { useStore } from '../net/store';
import { sfx } from '../sounds';

export function TimerBar({ st, label }: { st: PublicState; label: string }) {
  const serverNow = useStore((s) => s.serverNow());
  const deadline = st.deadline;
  const total = deadline && st.phase === 'discussion' ? st.settings.discussionSeconds * 1000
    : deadline && st.phase === 'voting' ? st.settings.voteSeconds * 1000
      : deadline && st.phase === 'spyGuess' ? st.settings.guessSeconds * 1000
        : 1;
  const left = deadline ? Math.max(0, deadline - serverNow) : 0;
  const ratio = Math.min(1, left / total);
  const sec = Math.ceil(left / 1000);
  const urgent = sec <= 10 && left > 0;

  // تیک صوتی ده ثانیه آخر
  if (urgent && sec <= 10) {
    // تشخیص تغییر ثانیه برای صدای تیک
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
        {deadline && <span className="timer-clock">{fmtClock(left / 1000)}</span>}
      </div>
      <div className="timer-bar">
        <div className="timer-fill" style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  );
}

const tickRef: { sec: number } = { sec: 0 };

export function TurnBanner({ st, meId }: { st: PublicState; meId: string }) {
  const speakerId = st.turnOrder[st.currentTurnIdx];
  const speaker = st.players.find((p) => p.id === speakerId);
  const target = st.players.find((p) => p.id === st.targetId);
  const mine = speakerId === meId;
  return (
    <div className={`turn-banner ${mine ? 'mine' : ''}`}>
      {mine ? (
        <>
          <span className="tb-big">نوبت شماست</span>
          {target && <span className="tb-sub">پرسش از: {target.name}</span>}
          {!target && <span className="tb-sub">یک بازیکن را برای پرسش انتخاب کنید</span>}
        </>
      ) : (
        <>
          <span className="tb-big">نوبت: {speaker?.name ?? '—'}</span>
          {target && <span className="tb-sub">پرسش از: {target.name}</span>}
        </>
      )}
    </div>
  );
}
