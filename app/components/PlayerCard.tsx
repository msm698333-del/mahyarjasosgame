import { PlayerPublic, PublicState } from '../../shared/types';
import { Avatar } from '../data/avatars';
import { IconCrown, IconFlag, IconMic, IconMicOff, IconVolumeOff, IconExit } from './Icons';
import { Chip, faNum } from './ui';
import { voice } from '../net/voice';
import { useStore, socket } from '../net/store';
import { useState } from 'react';

export function PlayerCard({ p, st, me }: { p: PlayerPublic; st: PublicState; me: PlayerPublic }) {
  const [, setMenu] = useState(false);
  const isSpeaker = st.phase === 'discussion' && st.turnOrder[st.currentTurnIdx] === p.id;
  const isTarget = st.targetId === p.id;
  const mic = voice.status();
  const speaking = p.id === me.id ? mic.speaking && mic.micOn : mic.peerSpeaking[p.id];
  const micOn = p.id === me.id ? mic.micOn && p.micOn : p.micOn;
  const mutedByMe = voice.isPeerMuted(p.id);
  const isHost = me.isHost && p.id !== me.id;

  return (
    <div className={[
      'player-card',
      !p.connected ? 'offline' : '',
      p.eliminated ? 'eliminated' : '',
      speaking ? 'speaking' : '',
      isSpeaker ? 'on-turn' : '',
      isTarget ? 'is-target' : ''
    ].filter(Boolean).join(' ')}
      onClick={() => setMenu((v) => !v)}>
      <div className="avatar-wrap">
        <Avatar id={p.avatar} size={46} />
        <span className={`conn-dot ${p.connected ? 'on' : 'off'}`} />
        {p.isHost && <span className="crown"><IconCrown size={14} /></span>}
      </div>
      <div className="pc-info">
        <div className="pc-name">
          {p.name}
          {p.id === me.id && <span className="muted"> (شما)</span>}
        </div>
        <div className="pc-badges">
          <Chip tone="muted">{faNum(p.score)} امتیاز</Chip>
          {(st.phase === 'waiting' || st.phase === 'revealing') && p.ready && (
            <Chip tone="teal">آماده</Chip>
          )}
          {p.eliminated && <Chip tone="danger">حذف‌شده</Chip>}
          {st.phase === 'discussion' && p.skipLeft >= 0 && p.id === me.id && (
            <Chip tone="gold">رد کردن: {faNum(p.skipLeft)}</Chip>
          )}
          {p.forceMuted && <Chip tone="danger">بی‌صدا اجباری</Chip>}
          {!p.connected && <Chip tone="danger">قطع</Chip>}
          {mutedByMe && <Chip tone="muted">بی‌صدا برای شما</Chip>}
          {st.hostView && (st.hostView.reports[p.id] ?? 0) > 0 && <Chip tone="danger">گزارش: {faNum(st.hostView.reports[p.id])}</Chip>}
        </div>
      </div>
      <div className="pc-actions">
        <span className={`mic-ind ${micOn ? 'on' : 'off'}`} title={micOn ? 'میکروفن روشن' : 'میکروفن خاموش'}>
          {micOn ? <IconMic size={15} /> : <IconMicOff size={15} />}
        </span>
        {(isHost || p.id !== me.id) && (
          <MenuPlayer p={p} me={me} />
        )}
      </div>
    </div>
  );
}

function MenuPlayer({ p, me }: { p: PlayerPublic; me: PlayerPublic }) {
  const [open, setOpen] = useState(false);
  const toastNow = useStore((s) => s.toastNow);
  return (
    <div className="p-menu-wrap" onClick={(e) => e.stopPropagation()}>
      <button className="icon-btn small" onClick={() => setOpen((v) => !v)} aria-label="گزینه‌ها">
        <span className="dots">⋯</span>
      </button>
      {open && (
        <div className="p-menu" onMouseLeave={() => setOpen(false)}>
          <button onClick={() => {
            voice.setPeerMuted(p.id, !voice.isPeerMuted(p.id));
            setOpen(false);
          }}>
            <IconVolumeOff size={15} /> {voice.isPeerMuted(p.id) ? 'باصدا کردن برای من' : 'بی‌صدا کردن برای من'}
          </button>
          <button onClick={() => {
            socket.send({ t: 'report', targetId: p.id });
            toastNow('گزارش شما ثبت شد.', 'info');
            setOpen(false);
          }}>
            <IconFlag size={15} /> گزارش تخلف
          </button>
          {me.isHost && p.id !== me.id && (
            <button className="danger" onClick={() => {
              socket.send({ t: 'kick', targetId: p.id });
              setOpen(false);
            }}>
              <IconExit size={15} /> حذف از لابی
            </button>
          )}
          {me.isHost && p.id !== me.id && (
            <button className="danger" onClick={() => {
              socket.send({ t: 'mute', targetId: p.id, muted: !p.forceMuted });
              setOpen(false);
            }}>
              {p.forceMuted ? 'رفع بی‌صدایی اجباری' : 'بی‌صدای اجباری (میزبان)'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
