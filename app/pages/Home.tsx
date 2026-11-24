import { useState } from 'react';
import { useStore } from '../net/store';
import { Btn, Chip, faNum } from '../components/ui';
import { Avatar, AVATAR_NAMES } from '../data/avatars';
import { IconEye, IconEyeOff, IconSearch } from '../components/Icons';
import { LogoMark } from '../components/TopBar';

const TITLE = 'بازی جاسوس';

export function Home() {
  const setScreen = useStore((s) => s.setScreen);
  const [showGuide, setShowGuide] = useState(false);

  return (
    <div className="page home">
      <div className="home-hero">
        <div className="hero-logo"><LogoMark size={72} /></div>
        <h1 className="hero-title">{TITLE}</h1>
        <p className="hero-sub">یکی از میان دوستان جاسوس را پیدا کن؛ قبل از آن‌که او تو را بفهمد.</p>
        <div className="home-actions">
          <Btn size="lg" onClick={() => setScreen('create')}>ساخت لابی جدید</Btn>
          <Btn size="lg" variant="ghost" onClick={() => setScreen('join')}>ورود با کد لابی</Btn>
        </div>
        <button className="guide-toggle" onClick={() => setShowGuide((v) => !v)}>
          {showGuide ? <IconEyeOff size={16} /> : <IconEye size={16} />} {showGuide ? 'بستن راهنما' : 'چطور بازی کنیم؟'}
        </button>
        {showGuide && <Guide />}
      </div>
      <footer className="home-foot muted">برای تجربهٔ کامل از هدفون استفاده کنید · صدای زنده P2P است و ذخیره نمی‌شود</footer>
    </div>
  );
}

function Guide() {
  return (
    <div className="guide card">
      <ol className="guide-list">
        <li>میزبان یک لابی می‌سازد و کد ۴ حرفی را با دوستان به اشتراک می‌گذارد.</li>
        <li>در شروع بازی، یک مکان مخفی تصادفی انتخاب می‌شود؛ همه نقش خود در آن مکان را می‌بینند، به‌جز <b>جاسوس</b>.</li>
        <li>جاسوس فقط می‌داند جاسوس است و دستهٔ مکان را می‌بیند — نه نام مکان را، نه نقش را.</li>
        <li>به نوبت، بازیکنان از همدیگر سؤال می‌پرسند و جواب می‌دهند؛ جاسوس باید خودش را پنهان کند و تا حد امکان مکان را از جواب‌ها حدس بزند.</li>
        <li>هر بازیکن در هر دور می‌تواند نوبت خود را چند بار (قابل تنظیم) با دکمهٔ «رد کردن نوبت» رد کند.</li>
        <li>پایان بحث: همه رأی می‌دهند. اگر بیشترین رأی به جاسوس برسد، او یک فرصت برای حدس مکان دارد: حدس درست = برد جاسوس، حدس غلط = برد شهروندها.</li>
        <li>اگر رأی‌ها به کسی دیگر برسد، جاسوس برنده است!</li>
      </ol>
      <div className="guide-cats muted">
        <IconSearch size={14} /> بانک بازی شامل {faNum(9)} دسته و ده‌ها مکان با نقش‌های اختصاصی است و آینده افزودنی است.
      </div>
      <div className="guide-avatars">
        {AVATAR_NAMES.slice(0, 6).map((n, i) => (
          <span key={i} className="guide-avatar"><Avatar id={i} size={26} /> {n}</span>
        ))}
      </div>
      <div className="muted small">هیچ سیستم لایک/دیسلایک یا امتیازدهی واکنشی در بازی وجود ندارد؛ فقط استیکر و گفت‌وگو.</div>
    </div>
  );
}

export function ChipRow() {
  return <Chip tone="gold">دمو</Chip>;
}
