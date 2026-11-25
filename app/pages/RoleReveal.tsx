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
  const mePlayer = st.players.find((p) => p.id === me.id);
  const isReady = !!mePlayer?.ready;
  const participants = st.players.filter((p) => p.connected && st.turnOrder.includes(p.id));
  const readyCount = participants.filter((p) => p.ready).length;

  return (
    <div className="page reveal">
      <h2 className="reveal-title">پروندهٔ محرمانه</h2>
      <div className="reveal-note muted">دور {faNum(st.round)} — این کارت فقط برای شماست؛ نشان ندهید!</div>

      <div className={`case-card ${flipped ? 'flipped' : ''}`} onClick={() => setFlipped(true)}>
        <div className="case-inner">
          <div className="case-front">
            <div className="case-stamp">محرمانه</div>
            <span className="muted">برای دیدن کلمه، روی کارت بزنید</span>
          </div>
          <div className={`case-back ${role.isSpy ? 'spy' : 'citizen'}`}>
            {role.isSpy ? (
              <>
                <div className="role-headline">شما جاسوس هستید!</div>
                {role.roleName ? (
                  <div className="role-sub">
                    کلمهٔ شما (نزدیک به کلمهٔ شهروندها ولی متفاوت):
                    <div className="role-name decoy">{role.roleName}</div>
                    مراقب باشید: کلمهٔ شهروندها دقیقاً همین نیست. با شنود و bluff خود را پنهان کنید.
                  </div>
                ) : (
                  <div className="role-sub">شما هیچ کلمه‌ای دریافت نمی‌کنید. با شنود به سرنخ‌ها، خود را جای شهروندها جا بزنید.</div>
                )}
                {catName && <div className="role-cat">تنها سرنخ دیگر شما — دستهٔ مکان: <b>{catName}</b></div>}
              </>
            ) : (
              <>
                <div className="role-cat">کلمهٔ مخفی شما</div>
                <div className="role-location">{role.locationName}</div>
                <div className="role-sub">همهٔ شهروندها دقیقاً همین کلمه را دارند. در نوبت خود، سرنخ بدهید — بدون گفتن مستقیم کلمه.</div>
              </>
            )}
            <div className="role-round muted">دور {faNum(st.round)}</div>
          </div>
        </div>
      </div>

      <div className="reveal-ready">
        <Chip tone={isReady ? 'teal' : 'muted'}>آماده: {faNum(readyCount)}/{faNum(participants.length)}</Chip>
        <Btn size="lg" variant={isReady ? 'ghost' : 'success'} onClick={() => socket.send({ t: 'ready', value: !isReady })}>
          {isReady ? 'لغو آمادگی' : 'آماده شدم'}
        </Btn>
        <span className="muted small">وقتی همه آماده شوند، نوبت‌های صحبت شروع می‌شود.</span>
      </div>
    </div>
  );
}
