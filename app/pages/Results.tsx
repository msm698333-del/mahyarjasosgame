import { socket, useStore } from '../net/store';
import { Btn, Chip, faNum } from '../components/ui';
import { Avatar } from '../data/avatars';
import { categoryName } from '../../shared/locations';
import { StickerButton } from '../components/StickerPanel';
import { VoiceBar } from '../components/VoiceBar';

/** صفحه اعلام نتیجه + امتیازها + شروع دور جدید */
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
              <span className={r.spyGuessId === r.locationId ? 'good' : 'bad'}>
                {r.spyGuessId === r.locationId ? 'درست بود' : 'غلط بود'}
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
            <Btn size="lg" variant="success" onClick={() => socket.send({ t: 'restart' })}>دور جدید</Btn>
            <Btn size="lg" variant="ghost" onClick={() => socket.send({ t: 'leave' })}>بازگشت به خانه</Btn>
          </>
        ) : (
          <span className="muted">میزبان دور بعد را شروع می‌کند…</span>
        )}
        <StickerButton />
      </div>
      <VoiceBar />
    </div>
  );
}
