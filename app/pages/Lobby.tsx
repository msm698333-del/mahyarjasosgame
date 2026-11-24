import { PublicState } from '../../shared/types';
import { socket, useStore } from '../net/store';
import { Btn, Chip, faNum } from '../components/ui';
import { PlayerCard } from '../components/PlayerCard';
import { StickerButton, StickerOverlay } from '../components/StickerPanel';
import { ChatPanel } from '../components/ChatPanel';
import { VoiceBar } from '../components/VoiceBar';
import { IconPlay, IconShield } from '../components/Icons';
import { CATEGORIES } from '../../shared/locations';
import { useState } from 'react';

export function Lobby({ st }: { st: PublicState }) {
  const me = useStore((s) => s.you);
  const [showSettings, setShowSettings] = useState(false);
  const mePlayer = st.players.find((p) => p.id === me?.id);
  const isHost = me?.isHost;
  const connected = st.players.filter((p) => p.connected).length;

  if (!me) return null;

  return (
    <div className="page lobby">
      <StickerOverlay items={useStore.getState().stickers} />
      <div className="lobby-grid">
        <section className="lobby-main card">
          <div className="lobby-head">
            <h2>اتاق انتظار</h2>
            <Chip tone="gold">کد لابی: {st.code}</Chip>
            <Chip tone="muted">{faNum(connected)} بازیکن متصل</Chip>
          </div>
          <div className="players-grid">
            {st.players.map((p) => <PlayerCard key={p.id} p={p} st={st} me={mePlayer!} />)}
            {Array.from({ length: Math.max(0, st.settings.maxPlayers - st.players.length) }, (_, i) => (
              <div className="player-card empty" key={`e${i}`}>
                <span className="muted">جای خالی</span>
              </div>
            ))}
          </div>
          <div className="lobby-actions">
            {isHost && (
              <Btn size="lg" onClick={() => setShowSettings(true)}>تنظیمات بازی</Btn>
            )}
            {!isHost && (
              <span className="muted">میزبان بازی را شروع می‌کند؛ تا آن موقع صدا و استیکر در دسترس است.</span>
            )}
            {isHost && (
              <Btn
                size="lg"
                variant="success"
                disabled={connected < 3}
                onClick={() => socket.send({ t: 'start' })}
                title={connected < 3 ? 'حداقل ۳ بازیکن لازم است' : 'شروع بازی'}
              >
                <IconPlay size={18} /> شروع بازی
              </Btn>
            )}
          </div>
          <VoiceBar />
        </section>
        <aside className="lobby-side">
          <div className="card side-card">
            <div className="side-head">
              <span>استیکرها</span>
              <StickerButton />
            </div>
            <ChatPanel compact />
          </div>
          <QuickRules />
        </aside>
      </div>
      {showSettings && <SettingsSheet st={st} onClose={() => setShowSettings(false)} />}
    </div>
  );
}

function QuickRules() {
  return (
    <div className="card side-card rules-card">
      <h4><IconShield size={16} /> یادآوری سریع</h4>
      <ul>
        <li>جاسوس مکان را نمی‌بیند؛ فقط دسته را.</li>
        <li>پرسش‌ها باید دربارهٔ مکان‌ها باشد، نه نام مستقیم.</li>
        <li>رد کردن نوبت سهمیه دارد و در نوبت خودت فعال است.</li>
      </ul>
    </div>
  );
}

export function SettingsSheet({ st, onClose }: { st: PublicState; onClose: () => void }) {
  const isHost = useStore((s) => s.you?.isHost);
  const [maxPlayers, setMaxPlayers] = useState(st.settings.maxPlayers);
  const [spyCount, setSpyCount] = useState(st.settings.spyCount);
  const [discussion, setDiscussion] = useState(st.settings.discussionSeconds);
  const [turn, setTurn] = useState(st.settings.turnSeconds);
  const [skip, setSkip] = useState(st.settings.skipPerPlayer);
  const [cats, setCats] = useState<string[]>(st.settings.categories);

  const setPatch = (patch: Record<string, unknown>) => socket.send({ t: 'updateSettings', patch: patch as never });

  const toggleCat = (id: string) => {
    const next = cats.includes(id) ? cats.filter((c) => c !== id) : [...cats, id];
    setCats(next);
    setPatch({ categories: next });
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><h3>تنظیمات بازی</h3></div>
        <div className="modal-body settings-body">
          {!isHost && <div className="muted small">فقط میزبان می‌تواند تنظیمات را تغییر دهد؛ این‌ها وضعیت فعلی است.</div>}
          <div className="set-row">
            <span>حداکثر بازیکنان</span>
            <Stepper value={maxPlayers} min={3} max={12} disabled={!isHost}
              onChange={(v) => { setMaxPlayers(v); setPatch({ maxPlayers: v }); }} />
          </div>
          <div className="set-row">
            <span>تعداد جاسوس</span>
            <Stepper value={spyCount} min={1} max={2} disabled={!isHost}
              onChange={(v) => { setSpyCount(v); setPatch({ spyCount: v }); }} />
          </div>
          <div className="set-row">
            <span>مدت بحث</span>
            <select disabled={!isHost} value={discussion} onChange={(e) => { const v = Number(e.target.value); setDiscussion(v); setPatch({ discussionSeconds: v }); }}>
              {[240, 360, 480, 600, 900].map((v) => <option key={v} value={v}>{faNum(v / 60)} دقیقه</option>)}
            </select>
          </div>
          <div className="set-row">
            <span>سقف هر نوبت</span>
            <select disabled={!isHost} value={turn} onChange={(e) => { const v = Number(e.target.value); setTurn(v); setPatch({ turnSeconds: v }); }}>
              {[30, 45, 60, 90, 120].map((v) => <option key={v} value={v}>{faNum(v)} ثانیه</option>)}
            </select>
          </div>
          <div className="set-row">
            <span>سهمیهٔ رد کردن نوبت (هر بازیکن در هر دور)</span>
            <Stepper value={skip} min={0} max={5} disabled={!isHost}
              onChange={(v) => { setSkip(v); setPatch({ skipPerPlayer: v }); }} />
          </div>
          <div className="set-cats">
            <span className="set-cats-title">دسته‌های فعال مکان‌ها (خالی = همه)</span>
            <div className="cat-grid">
              {CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  disabled={!isHost}
                  className={`cat-toggle ${cats.includes(c.id) ? 'on' : ''}`}
                  onClick={() => toggleCat(c.id)}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
          <Btn onClick={onClose}>بستن</Btn>
        </div>
      </div>
    </div>
  );
}

export function Stepper({ value, min, max, onChange, disabled }: {
  value: number; min: number; max: number; onChange: (v: number) => void; disabled?: boolean;
}) {
  return (
    <div className="stepper">
      <button className="icon-btn small" disabled={disabled || value <= min} onClick={() => onChange(value - 1)}>−</button>
      <span className="stepper-val">{faNum(value)}</span>
      <button className="icon-btn small" disabled={disabled || value >= max} onClick={() => onChange(value + 1)}>+</button>
    </div>
  );
}
