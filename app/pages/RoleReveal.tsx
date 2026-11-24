import { useState } from 'react';
import { socket, useStore } from '../net/store';
import { Btn, Chip, faNum } from '../components/ui';
import { categoryName } from '../../shared/locations';

/** صفحه نمایش نقش مخفی — کارت پرونده‌ای با انیمیشن flip */
export function RoleReveal() {
  const role = useStore((s) => s.role);
  const st = useStore((s) => s.state);
  const me = useStore((s) => s.you);
  const [flipped, setFlipped] = useState(false);
  if (!role || !st || !me) return null;

  const catName = role.isSpy && role.locationCategory ? categoryName(role.locationCategory) : null;
  const ready = st.readyCount;
  const total = st.players.filter((p) => p.connected && (p.id === me.id || st.turnOrder.includes(p.id))).length;
  const isReady = false; // ready خودم در state عمومی نیست؛ count را نشان می‌دهیم

  return (
    <div className="page reveal">
      <h2 className="reveal-title">پروندهٔ محرمانه</h2>
      <div className="reveal-note muted">دور {faNum(st.round)} — این کارت فقط برای شماست؛ نشان ندهید!</div>

      <div className={`case-card ${flipped ? 'flipped' : ''}`} onClick={() => setFlipped(true)}>
        <div className="case-inner">
          <div className="case-front">
            <div className="case-stamp">محرمانه</div>
            <span className="muted">برای دیدن نقش، روی کارت بزنید</span>
          </div>
          <div className={`case-back ${role.isSpy ? 'spy' : 'citizen'}`}>
            {role.isSpy ? (
              <>
                <div className="role-headline">شما جاسوس هستید!</div>
                <div className="role-sub">مکان مخفی را نمی‌دانید. با پرسش و پاسخ خود را پنهان کنید و مکان را حدس بزنید.</div>
                {catName && <div className="role-cat">تنها سرنخ شما — دستهٔ مکان: <b>{catName}</b></div>}
              </>
            ) : (
              <>
                <div className="role-cat">مکان مخفی</div>
                <div className="role-location">{role.locationName}</div>
                <div className="role-sub">نقش شما در این مکان:</div>
                <div className="role-name">{role.roleName}</div>
              </>
            )}
            <div className="role-round muted">دور {faNum(st.round)}</div>
          </div>
        </div>
      </div>

      <div className="reveal-ready">
        <Chip tone="muted">{faNum(ready)} نفر آماده شدند</Chip>
        {!isReady && (
          <Btn size="lg" onClick={() => socket.send({ t: 'ready' })}>
            آماده شدم
          </Btn>
        )}
        <span className="muted small">وقتی همه آماده شوند، بحث شروع می‌شود.</span>
      </div>
    </div>
  );
}
