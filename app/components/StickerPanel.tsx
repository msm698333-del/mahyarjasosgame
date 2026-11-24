import { useEffect, useState } from 'react';
import { STICKER_CATS, STICKERS, Sticker } from '../data/stickers';
import { socket, useStore } from '../net/store';
import { Modal, faNum } from './ui';

const COOLDOWN_MS = 3000;

export function StickerButton() {
  const [open, setOpen] = useState(false);
  const stickers = useStore((s) => s.stickers);
  return (
    <>
      <button className="icon-btn" onClick={() => setOpen(true)} title="استیکرها">
        <StickerIcon />
      </button>
      <StickerOverlay items={stickers} />
      <Modal open={open} onClose={() => setOpen(false)} title="استیکرها">
        <StickerGrid onSend={() => setOpen(false)} />
      </Modal>
    </>
  );
}

function StickerIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3a9 9 0 1 0 9 9c-5 1-10-4-9-9z" />
      <path d="M13 3.2A9 9 0 0 1 20.8 11" />
    </svg>
  );
}

export function StickerGrid({ onSend }: { onSend?: () => void }) {
  const [cat, setCat] = useState(STICKER_CATS[0].id);
  const [coolUntil, setCoolUntil] = useState(0);
  const [, force] = useState(0);
  const toastNow = useStore((s) => s.toastNow);

  useEffect(() => {
    if (Date.now() >= coolUntil) return;
    const t = setTimeout(() => force((v) => v + 1), Math.max(1, coolUntil - Date.now()));
    return () => clearTimeout(t);
  }, [coolUntil]);

  const cooling = Date.now() < coolUntil;
  const remain = Math.ceil((coolUntil - Date.now()) / 1000);

  return (
    <div className="sticker-panel">
      <div className="sticker-cats">
        {STICKER_CATS.map((c) => (
          <button key={c.id} className={`st-cat ${cat === c.id ? 'active' : ''}`} onClick={() => setCat(c.id)}>
            {c.name}
          </button>
        ))}
      </div>
      <div className="sticker-grid">
        {STICKERS.filter((s) => s.cat === cat).map((s) => (
          <button
            key={s.id}
            className="st-item"
            disabled={cooling}
            onClick={() => {
              socket.send({ t: 'sticker', id: s.id });
              setCoolUntil(Date.now() + COOLDOWN_MS);
              onSend?.();
            }}
          >
            <Sticker id={s.id} size={52} />
            <span>{s.name}</span>
          </button>
        ))}
      </div>
      {cooling && <div className="st-cooldown">کمی صبر کنید: {faNum(remain)} ثانیه</div>}
    </div>
  );
}

/** استیکرهای شناور که برای همه ارسال شده‌اند */
export function StickerOverlay({ items }: { items: { id: string; from: string; name: string; key: number }[] }) {
  return (
    <div className="sticker-overlay" aria-live="polite">
      {items.map((it) => (
        <div className="sticker-fly" key={it.key}>
          <div className="sf-name">{it.name}</div>
          <Sticker id={it.id} size={86} />
        </div>
      ))}
    </div>
  );
}
