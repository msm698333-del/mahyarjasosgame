import { useState } from 'react';
import { socket, useStore } from '../net/store';
import { Btn, Chip, faNum } from '../components/ui';
import { Avatar } from '../data/avatars';
import { StickerOverlay } from '../components/StickerPanel';
import { TimerBar } from '../components/TimerBar';
import { IconMicOff } from '../components/Icons';

/** صفحه رأی‌گیری محرمانه — بدون چت و بدون میکروفن */
export function Voting() {
  const st = useStore((s) => s.state)!;
  const me = useStore((s) => s.you)!;
  const stickers = useStore((s) => s.stickers);
  const [sel, setSel] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  if (!st || !me) return null;

  const tied = st.tiedIds;
  const candidates = st.players.filter((p) => (tied ? tied.includes(p.id) : p.id !== me.id) && p.connected && !p.eliminated);
  const mePlayer = st.players.find((p) => p.id === me.id);
  const voted = st.votesSubmitted;
  const connectedCount = st.players.filter((p) => p.connected && !p.eliminated).length;

  const submit = (target: string | null) => {
    socket.send({ t: 'vote', targetId: target });
    setConfirm(false);
  };

  if (mePlayer?.eliminated) {
    return (
      <div className="page voting">
        <StickerOverlay items={stickers} />
        <TimerBar st={st} label={tied ? `رأی‌گیری مجدد (دور ${faNum(st.voteRound)})` : 'رأی‌گیری محرمانه'} />
        <div className="card waiting-panel">
          <div className="pulse-dot" />
          <p>شما در این بازی حذف شده‌اید؛ به‌عنوان تماشاچی نتایج رأی‌گیری را دنبال کنید.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page voting">
      <StickerOverlay items={stickers} />
      <TimerBar st={st} label={tied ? `رأی‌گیری مجدد (دور ${faNum(st.voteRound)})` : 'رأی‌گیری محرمانه'} />
      <div className="voting-head">
        <h2>جاسوس کیست؟</h2>
        <Chip tone="muted">{faNum(voted)}/{faNum(connectedCount)} رأی ثبت شده</Chip>
        {tied && <Chip tone="gold">فقط بین متساوی‌ها انتخاب کنید</Chip>}
      </div>
      <div className="vote-grid">
        {candidates.map((p) => (
          <button key={p.id} className={`vote-card ${sel === p.id ? 'sel' : ''}`} onClick={() => setSel(p.id)}>
            <Avatar id={p.avatar} size={44} />
            <span>{p.name}</span>
          </button>
        ))}
      </div>
      <div className="vote-actions">
        <Btn size="lg" variant="danger" disabled={!sel} onClick={() => setConfirm(true)}>
          رأی محرمانه به: {sel ? st.players.find((p) => p.id === sel)?.name : '—'}
        </Btn>
        <Btn variant="ghost" onClick={() => submit(null)}>رأی نمی‌دهم (ابستین)</Btn>
      </div>
      <p className="muted small mic-off-note">
        <IconMicOff size={14} /> در فاز رأی‌گیری میکروفن همه بسته است و چت متنی غیرفعال است — بیشترین رأی حذف می‌شود و نقشش افشا می‌شود.
      </p>

      {confirm && sel && (
        <div className="modal-backdrop" onClick={() => setConfirm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head"><h3>تأیید رأی</h3></div>
            <div className="modal-body">
              <p>رأی شما به <b>{st.players.find((p) => p.id === sel)?.name}</b> ثبت شود؟</p>
              <div className="row-actions">
                <Btn variant="ghost" onClick={() => setConfirm(false)}>نه</Btn>
                <Btn variant="danger" onClick={() => submit(sel)}>ثبت رأی</Btn>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
