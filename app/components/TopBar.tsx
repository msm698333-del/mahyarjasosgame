import { useState } from 'react';
import { socket, useStore } from '../net/store';
import { Btn, Chip, faNum } from './ui';
import { IconCopy, IconExit, IconGear, IconUsers } from './Icons';
import { faNum as fa } from './ui';

const TITLE = 'بازی جاسوس';

export function TopBar({ onSettings, showLeave = true }: { onSettings?: () => void; showLeave?: boolean }) {
  const state = useStore((s) => s.state);
  const connStatus = useStore((s) => s.connStatus);
  const leave = useStore((s) => s.leave);
  const toastNow = useStore((s) => s.toastNow);
  const [copied, setCopied] = useState(false);

  const copyCode = async () => {
    if (!state) return;
    const text = `کد لابی: ${state.code} — بازی جاسوس ${location.origin}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toastNow('کپی نشد؛ کد را دستی بردارید.');
    }
  };

  const statusChip = connStatus === 'open'
    ? <Chip tone="teal">متصل</Chip>
    : connStatus === 'reconnecting'
      ? <Chip tone="gold">اتصال مجدد…</Chip>
      : connStatus === 'connecting'
        ? <Chip tone="muted">در حال اتصال…</Chip>
        : <Chip tone="danger">قطع</Chip>;

  return (
    <header className="topbar">
      <div className="tb-brand">
        <LogoMark />
        <span className="tb-title">{TITLE}</span>
        {state && (
          <button className="code-chip" onClick={copyCode} title="کپی کد و لینک لابی">
            <span className="code-text">{state.code}</span>
            <IconCopy size={15} />
            {copied && <span className="copied-pop">کپی شد!</span>}
          </button>
        )}
        {statusChip}
      </div>
      <div className="tb-actions">
        {state && (
          <span className="tb-count" title="بازیکنان">
            <IconUsers size={16} /> {fa(state.players.length)}/{fa(state.settings.maxPlayers)}
          </span>
        )}
        {onSettings && <button className="icon-btn" onClick={onSettings} title="تنظیمات"><IconGear /></button>}
        {showLeave && <Btn variant="ghost" size="sm" onClick={leave}><IconExit size={16} /> خروج</Btn>}
      </div>
    </header>
  );
}

export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="27" cy="27" r="13" fill="none" stroke="#f2b23e" strokeWidth="4" />
      <circle cx="27" cy="27" r="7" fill="#101b2e" />
      <circle cx="24" cy="24" r="2.6" fill="#f2b23e" opacity="0.55" />
      <path d="M37 37 L48 48" stroke="#f2b23e" strokeWidth="6" strokeLinecap="round" />
      <circle cx="41" cy="16" r="2" fill="#39d4c3" />
    </svg>
  );
}

export { faNum };
