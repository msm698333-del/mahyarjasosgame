// استیکرهای اختصاصی SVG بازی جاسوس — ۴ دسته، بدون فایل خارجی
import type { ReactElement } from 'react';

interface StickerProps { id: string; size?: number }

const P = '#f2b23e'; // طلایی
const T = '#39d4c3'; // فیروزه‌ای
const R = '#e5484d';
const BG = '#101b2e';

const STICKER_SVGS: Record<string, (p: { s: number }) => ReactElement> = {
  /* ---------- سلام و واکنش ---------- */
  'wave': ({ s }) => (
    <svg width={s} height={s} viewBox="0 0 64 64">
      <circle cx="32" cy="32" r="30" fill={BG} />
      <path d="M20 38 Q18 26 24 18 M20 38 Q22 44 30 46 Q42 48 48 38" fill="none" stroke={P} strokeWidth="5" strokeLinecap="round" />
      <path d="M24 18 L20 14 M30 15 L28 9 M37 14 L38 8 M43 18 L47 14" stroke={P} strokeWidth="4" strokeLinecap="round" />
      <circle cx="49" cy="16" r="3" fill={T} />
    </svg>
  ),
  'ok': ({ s }) => (
    <svg width={s} height={s} viewBox="0 0 64 64">
      <circle cx="32" cy="32" r="30" fill={BG} />
      <circle cx="32" cy="32" r="18" fill="none" stroke={T} strokeWidth="4" />
      <path d="M24 32 L30 38 L41 26" fill="none" stroke={T} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  'no': ({ s }) => (
    <svg width={s} height={s} viewBox="0 0 64 64">
      <circle cx="32" cy="32" r="30" fill={BG} />
      <circle cx="32" cy="32" r="18" fill="none" stroke={R} strokeWidth="4" />
      <path d="M22 22 L42 42 M42 22 L22 42" stroke={R} strokeWidth="5" strokeLinecap="round" />
    </svg>
  ),
  'question': ({ s }) => (
    <svg width={s} height={s} viewBox="0 0 64 64">
      <circle cx="32" cy="32" r="30" fill={BG} />
      <path d="M24 24 Q24 14 32 14 Q41 14 41 23 Q41 30 33 32 L33 38" fill="none" stroke={P} strokeWidth="6" strokeLinecap="round" />
      <circle cx="33" cy="47" r="4" fill={P} />
    </svg>
  ),
  /* ---------- کارآگاهی ---------- */
  'magnifier': ({ s }) => (
    <svg width={s} height={s} viewBox="0 0 64 64">
      <circle cx="32" cy="32" r="30" fill={BG} />
      <circle cx="28" cy="28" r="12" fill="none" stroke={P} strokeWidth="5" />
      <circle cx="28" cy="28" r="7" fill={P} opacity="0.2" />
      <path d="M37 37 L48 48" stroke={P} strokeWidth="7" strokeLinecap="round" />
    </svg>
  ),
  'fingerprint': ({ s }) => (
    <svg width={s} height={s} viewBox="0 0 64 64">
      <circle cx="32" cy="32" r="30" fill={BG} />
      {[20, 25, 30, 35, 40].map((r, i) => (
        <path key={i} d={`M ${32 - r / 2} 44 Q ${32 - r} 32 ${32 - r / 2} 22 Q 32 ${22 - r / 3} ${32 + r / 2} 22 Q ${32 + r} 32 ${32 + r / 2} 44`} fill="none" stroke={T} strokeWidth="2.4" opacity={0.4 + i * 0.14} />
      ))}
    </svg>
  ),
  'footprint': ({ s }) => (
    <svg width={s} height={s} viewBox="0 0 64 64">
      <circle cx="32" cy="32" r="30" fill={BG} />
      <ellipse cx="26" cy="38" rx="9" ry="13" fill={T} opacity="0.9" />
      <ellipse cx="40" cy="24" rx="8" ry="11" fill={P} opacity="0.85" />
      <circle cx="20" cy="20" r="3.4" fill={T} opacity="0.7" />
      <circle cx="28" cy="16" r="3.4" fill={T} opacity="0.7" />
    </svg>
  ),
  'camera': ({ s }) => (
    <svg width={s} height={s} viewBox="0 0 64 64">
      <circle cx="32" cy="32" r="30" fill={BG} />
      <rect x="14" y="22" width="36" height="24" rx="6" fill="none" stroke={P} strokeWidth="4" />
      <path d="M24 22 L27 16 L37 16 L40 22" fill="none" stroke={P} strokeWidth="4" strokeLinejoin="round" />
      <circle cx="32" cy="34" r="8" fill="none" stroke={T} strokeWidth="4" />
      <circle cx="32" cy="34" r="3" fill={T} />
    </svg>
  ),
  /* ---------- احساسات ---------- */
  'sweat': ({ s }) => (
    <svg width={s} height={s} viewBox="0 0 64 64">
      <circle cx="32" cy="32" r="30" fill={BG} />
      <circle cx="28" cy="34" r="14" fill="none" stroke={P} strokeWidth="3.4" />
      <circle cx="23" cy="32" r="1.8" fill={P} />
      <circle cx="33" cy="32" r="1.8" fill={P} />
      <path d="M22 39 Q28 43 34 39" stroke={P} strokeWidth="2.6" fill="none" strokeLinecap="round" />
      <path d="M48 18 Q44 26 48 30 Q53 26 48 18 Z" fill={T} />
    </svg>
  ),
  'laugh': ({ s }) => (
    <svg width={s} height={s} viewBox="0 0 64 64">
      <circle cx="32" cy="32" r="30" fill={BG} />
      <circle cx="32" cy="32" r="16" fill="none" stroke={P} strokeWidth="3.4" />
      <path d="M22 30 Q26 26 30 30 M34 30 Q38 26 42 30" stroke={P} strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M23 36 Q32 46 41 36 Q32 40 23 36 Z" fill={P} />
    </svg>
  ),
  'heart': ({ s }) => (
    <svg width={s} height={s} viewBox="0 0 64 64">
      <circle cx="32" cy="32" r="30" fill={BG} />
      <path d="M32 46 Q14 34 20 24 Q25 17 32 24 Q39 17 44 24 Q50 34 32 46 Z" fill={R} />
    </svg>
  ),
  'star': ({ s }) => (
    <svg width={s} height={s} viewBox="0 0 64 64">
      <circle cx="32" cy="32" r="30" fill={BG} />
      <path d="M32 12 L38 26 L52 27 L41 36 L45 50 L32 42 L19 50 L23 36 L12 27 L26 26 Z" fill={P} />
    </svg>
  ),
  /* ---------- طنز و مخصوص بازی ---------- */
  'spy-mask': ({ s }) => (
    <svg width={s} height={s} viewBox="0 0 64 64">
      <circle cx="32" cy="32" r="30" fill={BG} />
      <rect x="12" y="24" width="40" height="14" rx="7" fill="#0a0e17" stroke={P} strokeWidth="3" />
      <circle cx="24" cy="31" r="3.6" fill={T} />
      <circle cx="40" cy="31" r="3.6" fill={T} />
    </svg>
  ),
  'sneaky': ({ s }) => (
    <svg width={s} height={s} viewBox="0 0 64 64">
      <circle cx="32" cy="32" r="30" fill={BG} />
      <path d="M14 30 Q32 18 50 30 Q32 40 14 30 Z" fill="none" stroke={P} strokeWidth="3.4" />
      <circle cx="26" cy="29" r="3" fill={P} />
      <circle cx="38" cy="29" r="3" fill={P} />
      <path d="M50 24 Q58 28 50 34" stroke={T} strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  ),
  'skull': ({ s }) => (
    <svg width={s} height={s} viewBox="0 0 64 64">
      <circle cx="32" cy="32" r="30" fill={BG} />
      <path d="M32 12 Q46 12 46 26 Q46 34 40 38 L40 44 L24 44 L24 38 Q18 34 18 26 Q18 12 32 12 Z" fill="#e8eef7" opacity="0.9" />
      <circle cx="26" cy="27" r="4.4" fill={BG} />
      <circle cx="38" cy="27" r="4.4" fill={BG} />
      <path d="M28 44 L28 49 M32 44 L32 50 M36 44 L36 49" stroke={BG} strokeWidth="2.4" />
    </svg>
  ),
  'trophy': ({ s }) => (
    <svg width={s} height={s} viewBox="0 0 64 64">
      <circle cx="32" cy="32" r="30" fill={BG} />
      <path d="M22 16 L42 16 L40 30 Q38 38 32 38 Q26 38 24 30 Z" fill={P} />
      <path d="M22 18 L14 20 Q15 30 24 30 M42 18 L50 20 Q49 30 40 30" fill="none" stroke={P} strokeWidth="3" />
      <path d="M30 38 L30 46 L26 50 L38 50 L34 46 L34 38" fill={T} />
    </svg>
  )
};

export interface StickerDef { id: string; name: string; cat: string }
export const STICKER_CATS = [
  { id: 'greet', name: 'سلام و واکنش' },
  { id: 'detect', name: 'کارآگاهی' },
  { id: 'feel', name: 'احساسات' },
  { id: 'fun', name: 'مخصوص بازی' }
];
export const STICKERS: StickerDef[] = [
  { id: 'wave', name: 'سلام', cat: 'greet' },
  { id: 'ok', name: 'باشه', cat: 'greet' },
  { id: 'no', name: 'نه', cat: 'greet' },
  { id: 'question', name: 'سؤال؟', cat: 'greet' },
  { id: 'magnifier', name: 'تحقیق می‌کنم', cat: 'detect' },
  { id: 'fingerprint', name: 'رد پا', cat: 'detect' },
  { id: 'footprint', name: 'رد یاب', cat: 'detect' },
  { id: 'camera', name: 'گرفتمت!', cat: 'detect' },
  { id: 'sweat', name: 'استرس', cat: 'feel' },
  { id: 'laugh', name: 'خنده', cat: 'feel' },
  { id: 'heart', name: 'عالی بود', cat: 'feel' },
  { id: 'star', name: 'ستاره‌ای', cat: 'feel' },
  { id: 'spy-mask', name: 'من جاسوسم؟', cat: 'fun' },
  { id: 'sneaky', name: 'زیرکانه', cat: 'fun' },
  { id: 'skull', name: 'حذف شدی', cat: 'fun' },
  { id: 'trophy', name: 'قهرمان', cat: 'fun' }
];

export function Sticker({ id, size = 56 }: StickerProps) {
  const C = STICKER_SVGS[id];
  if (!C) return null;
  return <C s={size} />;
}
