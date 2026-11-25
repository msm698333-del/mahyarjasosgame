import { PublicState } from '../../shared/types';
import { socket, useStore } from '../net/store';
import { Btn, Chip, faNum } from '../components/ui';
import { PlayerCard } from '../components/PlayerCard';
import { StickerButton, StickerOverlay } from '../components/StickerPanel';
import { ChatPanel } from '../components/ChatPanel';
import { VoiceBar } from '../components/VoiceBar';
import { IconShield } from '../components/Icons';
import { WORD_CATEGORIES } from '../../shared/wordBank';
import { useState } from 'react';

export function Lobby({ st }: { st: PublicState }) {
  const me = useStore((s) => s.you);
  const [showSettings, setShowSettings] = useState(false);
  const mePlayer = st.players.find((p) => p.id === me?.id);
  const isHost = me?.isHost;
  const connected = st.players.filter((p) => p.connected);
  const connectedCount = connected.length;
  const readyCount = connected.filter((p) => p.ready).length;
  // شروع خودکار: همهٔ متصل‌ها آماده باشند (حداقل ۳ نفر) — بدون تأیید میزبان و بدون شمارش معکوس
  const allReady = connectedCount >= 3 && readyCount === connectedCount;

  if (!me) return null;

  return (
    <div className="page lobby">
      <StickerOverlay items={useStore.getState().stickers} />
      <div className="lobby-grid">
        <section className="lobby-main card">
          <div className="lobby-head">
            <h2>اتاق انتظار</h2>
            <Chip tone="gold">کد لابی: {st.code}</Chip>
            <Chip tone="muted">{faNum(connectedCount)} بازیکن متصل</Chip>
          </div>
          <div className="players-grid">
            {st.players.map((p) => <PlayerCard key={p.id} p={p} st={st} me={mePlayer!} />)}
            {Array.from({ length: Math.max(0, st.settings.maxPlayers - st.players.length) }, (_, i) => (
              <div className="player-card empty" key={`e${i}`}>
                <span className="muted">جای خالی</span>
              </div>
            ))}
          </div>
          <div className="ready-status">
            <Chip tone="teal">آماده: {faNum(readyCount)}/{faNum(connectedCount)}</Chip>
            {!allReady && <span className="waiting-msg muted">در انتظار آمادگی بازیکنان…</span>}
            {allReady && <span className="waiting-msg go">همه آماده‌اند! بازی خودکار شروع می‌شود…</span>}
          </div>
          <div className="lobby-actions">
            {isHost && (
              <Btn size="lg" onClick={() => setShowSettings(true)}>تنظیمات بازی</Btn>
            )}
            <Btn
              size="lg"
              variant={mePlayer?.ready ? 'ghost' : 'success'}
              onClick={() => socket.send({ t: 'ready', value: !mePlayer?.ready })}
            >
              {mePlayer?.ready ? 'لغو آمادگی' : 'آماده شدم'}
            </Btn>
          </div>
          {!isHost && <span className="muted small">وقتی همه آماده شوند، بازی بدون نیاز به میزبان خودکار شروع می‌شود.</span>}
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
        <li>همهٔ شهروندها کلمهٔ یکسانی دارند؛ فقط جاسوس کلمهٔ نزدیک (یا هیچ) دارد.</li>
        <li>هر نوبت دقیقاً ۱۰ ثانیه است و تایمر سمت سرور کنترل می‌شود؛ پس از صفر، نوبت خودکار جلو می‌رود.</li>
        <li>سهمیهٔ روزانهٔ هر بازیکن ۶۰ ثانیه است (هر نوبت ۱۰ ثانیه) — بازنشانی در ۰۰:۰۰ تهران.</li>
        <li>میکروفن فقط در نوبت شما باز است؛ بقیه خودکار بی‌صدا می‌شوند.</li>
        <li>بعد از یک دور کامل صحبت، رأی‌گیری شروع می‌شود؛ بیشترترین رأی حذف می‌شود.</li>
      </ul>
    </div>
  );
}

export function SettingsSheet({ st, onClose }: { st: PublicState; onClose: () => void }) {
  const isHost = useStore((s) => s.you?.isHost);
  const [maxPlayers, setMaxPlayers] = useState(st.settings.maxPlayers);
  const [spyCount, setSpyCount] = useState(st.settings.spyCount);
  const [discussion, setDiscussion] = useState(st.settings.discussionSeconds);
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>(st.settings.difficulty);
  const [vote, setVote] = useState(st.settings.voteSeconds);
  const [spyWord, setSpyWord] = useState(st.settings.spyWord);
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
            <span>سقف احتیاطی کل بحث (پشتیبان)</span>
            <select disabled={!isHost} value={discussion} onChange={(e) => { const v = Number(e.target.value); setDiscussion(v); setPatch({ discussionSeconds: v }); }}>
              {[240, 360, 480, 600, 900].map((v) => <option key={v} value={v}>{faNum(v / 60)} دقیقه</option>)}
            </select>
          </div>
          <div className="set-row">
            <span>سطح سختی کلمهٔ جاسوس</span>
            <select disabled={!isHost} value={difficulty} onChange={(e) => { setDifficulty(e.target.value as 'easy' | 'medium' | 'hard'); setPatch({ difficulty: e.target.value }); }}>
              <option value="easy">آسان — کلمهٔ جاسوس کم‌شباهت است</option>
              <option value="medium">متوسط — کلمهٔ مرتبط و متمایز</option>
              <option value="hard">سخت — کلمهٔ بسیار نزدیک به کلمهٔ شهروندها</option>
            </select>
          </div>
          <div className="set-row">
            <span>مدت هر نوبت صحبت</span>
            <span className="set-fixed">۱۰ ثانیه (قفل سراسری — تغییر نمی‌کند)</span>
          </div>
          <div className="set-row">
            <span>مدت رأی‌گیری</span>
            <select disabled={!isHost} value={vote} onChange={(e) => { const v = Number(e.target.value); setVote(v); setPatch({ voteSeconds: v }); }}>
              {[15, 30, 45, 60].map((v) => <option key={v} value={v}>{faNum(v)} ثانیه</option>)}
            </select>
          </div>
          <div className="set-row">
            <span>کلمهٔ جاسوس</span>
            <select disabled={!isHost} value={spyWord} onChange={(e) => { setSpyWord(e.target.value as 'nearby' | 'none'); setPatch({ spyWord: e.target.value }); }}>
              <option value="nearby">کلمهٔ نزدیک کلمهٔ شهروندها (بر اساس سختی)</option>
              <option value="none">بدون کلمه — جاسوس فقط دسته را می‌داند</option>
            </select>
          </div>
          <div className="set-row">
            <span>سهمیهٔ رد کردن نوبت (هر بازیکن در هر دور)</span>
            <Stepper value={skip} min={0} max={5} disabled={!isHost}
              onChange={(v) => { setSkip(v); setPatch({ skipPerPlayer: v }); }} />
          </div>
          <div className="set-cats">
            <span className="set-cats-title">دسته‌های فعال بانک کلمات (خالی = همهٔ ۱۷ دسته)</span>
            <div className="cat-grid">
              {WORD_CATEGORIES.map((c) => (
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
