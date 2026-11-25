import { socket, useStore } from '../net/store';
import { Btn, Chip, faNum } from '../components/ui';
import { Avatar } from '../data/avatars';
import { categoryName } from '../../shared/locations';
import { StickerButton, StickerOverlay } from '../components/StickerPanel';
import { VoiceBar } from '../components/VoiceBar';
import { TimerBar } from '../components/TimerBar';
import { PublicState, SPY_WORD_GUESS } from '../../shared/types';

/** صفحهٔ بین‌دوری: افشای نقش حذف‌شده + شمارش معکوس کوتاه تا دور بعد */
export function RoundTransition({ st }: { st: PublicState }) {
  const serverNow = useStore((s) => s.serverNow());
  const stickers = useStore((s) => s.stickers);
  const el = st.elimination;
  const left = st.deadline ? Math.max(0, st.deadline - serverNow) : 0;
  const alive = st.players.filter((p) => p.connected && !p.eliminated);
  const eliminatedList = st.players.filter((p) => p.eliminated);

  return (
    <div className="page results round-transition">
      <StickerOverlay items={stickers} />
      <TimerBar st={st} label="تا شروع دور بعد" />
      <div className={`result-banner ${el?.wasSpy ? 'win' : 'neutral'}`}>
        <h2>{el ? `${el.name} حذف شد` : 'این دور بدون حذف تمام شد'}</h2>
        <div className="result-line">
          {el
            ? (el.wasSpy ? 'نقش او افشا شد: جاسوس بود! باقی بازی ادامه دارد…' : 'نقش او افشا شد: شهروند بود — جاسوس هنوز آزاد است!')
            : (st.roundNote ?? 'به دور بعد می‌رویم…')}
        </div>
      </div>

      <div className="result-grid">
        <div className="card result-card">
          <h4>بازیکنان باقی‌مانده ({faNum(alive.length)})</h4>
          <div className="score-list">
            {alive.map((p) => (
              <div key={p.id} className="score-row">
                <Avatar id={p.avatar} size={30} />
                <span className="sr-name">{p.name}</span>
                <Chip tone="teal">در بازی</Chip>
              </div>
            ))}
          </div>
        </div>
        <div className="card result-card">
          <h4>حذف‌شده‌ها ({faNum(eliminatedList.length)})</h4>
          <div className="score-list">
            {eliminatedList.length === 0 && <span className="muted small">هنوز کسی حذف نشده است.</span>}
            {eliminatedList.map((p) => (
              <div key={p.id} className="score-row">
                <Avatar id={p.avatar} size={30} />
                <span className="sr-name">{p.name}</span>
                <Chip tone="danger">حذف‌شده</Chip>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="result-actions">
        <span className="muted">دور بعد با کلمهٔ جدید تا {faNum(Math.ceil(left / 1000))} ثانیه دیگر خودکار شروع می‌شود…</span>
        <StickerButton />
      </div>
      <VoiceBar />
    </div>
  );
}

/** صفحه اعلام نتیجهٔ نهایی + امتیازها + بازی جدید */
export function Results() {
  const st = useStore((s) => s.state)!;
  const role = useStore((s) => s.role);
  const me = useStore((s) => s.you)!;
  if (!st?.results) return null;
  const r = st.results;
  const iAmSpy = !!role?.isSpy;
  const spyWon = r.spyWon;
  const iWon = iAmSpy === spyWon;

  return (
    <div className="page results">
      <div className={`result-banner ${iWon ? 'win' : 'lose'}`}>
        <h2>{iWon ? 'شما برنده شدید!' : 'شما باختید'}</h2>
        <div className="result-line">
          {spyWon ? 'جاسوس‌ها برنده شدند' : 'شهروندها جاسوس را شکار کردند'} — {r.reason}
        </div>
      </div>

      <div className="result-grid">
        <div className="card result-card">
          <h4>پروندهٔ این دور</h4>
          <div className="res-row"><span className="muted">مکان مخفی:</span><b>{r.locationName}</b></div>
          <div className="res-row"><span className="muted">دسته:</span><span>{categoryName(r.locationCategory)}</span></div>
          <div className="res-row"><span className="muted">جاسوس:</span>
            <span className="spy-chips">
              {st.players.filter((p) => r.spyIds.includes(p.id)).map((p) => (
                <Chip key={p.id} tone="danger">{p.name}</Chip>
              ))}
            </span>
          </div>
          {r.accusedId && (
            <div className="res-row"><span className="muted">متهم‌شده:</span>
              <span>{st.players.find((p) => p.id === r.accusedId)?.name ?? '—'}</span>
            </div>
          )}
          {r.spyGuessId && (
            <div className="res-row"><span className="muted">حدس جاسوس:</span>
              <span className={r.spyGuessId === r.locationId || r.spyGuessId === SPY_WORD_GUESS ? 'good' : 'bad'}>
                {r.spyGuessId === SPY_WORD_GUESS ? 'کلمهٔ مخفی را درست نوشت'
                  : r.spyGuessId === r.locationId ? 'درست بود' : 'غلط بود'}
              </span>
            </div>
          )}
          <div className="res-votes">
            <span className="muted">رأی‌ها:</span>
            {Object.entries(r.votes).map(([voter, target]) => {
              const v = st.players.find((p) => p.id === voter);
              const t = st.players.find((p) => p.id === target);
              return <span key={voter} className="vote-pair">{v?.name} → {t?.name ?? 'ابستین'}</span>;
            })}
          </div>
        </div>

        <div className="card result-card">
          <h4>جدول امتیازها</h4>
          <div className="score-list">
            {[...st.players].sort((a, b) => b.score - a.score).map((p, i) => (
              <div key={p.id} className="score-row">
                <span className="rank">{faNum(i + 1)}</span>
                <Avatar id={p.avatar} size={30} />
                <span className="sr-name">{p.name}{p.id === me.id ? ' (شما)' : ''}</span>
                <Chip tone={p.score > 0 ? 'gold' : 'muted'}>{faNum(p.score)} برد</Chip>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="result-actions">
        {me.isHost ? (
          <>
            <Btn size="lg" variant="success" onClick={() => socket.send({ t: 'restart' })}>بازی جدید (همه از نو)</Btn>
            <Btn size="lg" variant="ghost" onClick={() => socket.send({ t: 'leave' })}>بازگشت به خانه</Btn>
          </>
        ) : (
          <span className="muted">میزبان بازی جدید را شروع می‌کند…</span>
        )}
        <StickerButton />
      </div>
      <VoiceBar />
    </div>
  );
}
