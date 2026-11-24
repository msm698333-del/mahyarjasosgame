import { useState } from 'react';
import { socket, useStore } from '../net/store';
import { Btn, Chip, faNum } from '../components/ui';
import { Avatar } from '../data/avatars';
import { StickerOverlay } from '../components/StickerPanel';
import { ChatPanel } from '../components/ChatPanel';
import { TimerBar } from '../components/TimerBar';

/** صفحه رأی‌گیری محرمانه */
export function Voting() {
  const st = useStore((s) => s.state)!;
  const me = useStore((s) => s.you)!;
  const stickers = useStore((s) => s.stickers);
  const [sel, setSel] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  if (!st || !me) return null;

  const tied = st.tiedIds;
  const candidates = st.players.filter((p) => (tied ? tied.includes(p.id) : p.id !== me.id) && p.connected);
  const canAbstain = true;
  const voted = st.votesSubmitted;
  const connectedCount = st.players.filter((p) => p.connected).length;

  const submit = (target: string | null) => {
    socket.send({ t: 'vote', targetId: target });
    setConfirm(false);
  };

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
        {canAbstain && <Btn variant="ghost" onClick={() => submit(null)}>رأی نمی‌دهم (ابستین)</Btn>}
      </div>
      <p className="muted small">رأی شما تا پایان شمارش مخفی می‌ماند و فقط شمارش کلی نمایش داده می‌شود.</p>
      <div className="card side-card">
        <ChatPanel compact />
      </div>

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
