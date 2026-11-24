// ۱۲ آواتار SVG اختصاصی با تم کارآگاهی/جاسوسی — بدون فایل خارجی
interface AvatarProps { id: number; size?: number; className?: string }

const HUES = ['#f2b23e', '#39d4c3', '#e5484d', '#8f7ff2', '#5fa8f5', '#46d17e', '#f56fa1', '#f5875f', '#7fd4f5', '#c9f56f', '#f5c95f', '#b28ff2'];

export const AVATAR_NAMES = ['کارآگاه', 'جاسوس سایه', 'مأمور شب', 'پایپ‌کش', 'نظاره‌گر', 'مخفی‌کار', 'مأمور کلاه‌دار', 'جاسوس کلاسیک', 'شبح', 'دزد حرفه‌ای', 'رمزگشا', 'نفوذی'];

export function Avatar({ id, size = 44, className }: AvatarProps) {
  const n = ((id % 12) + 12) % 12;
  const hue = HUES[n];
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden="true">
      <circle cx="32" cy="32" r="30" fill="#0d1420" stroke="#1c2637" strokeWidth="2" />
      {/* بدن */}
      <path d="M12 56 Q14 42 32 42 Q50 42 52 56 Z" fill={hue} opacity="0.85" />
      {/* سر */}
      <circle cx="32" cy="26" r="13" fill="#f4d7b0" />
      {/* چشم‌ها */}
      {n === 4 || n === 6 || n === 10 ? (
        // عینک‌دارها
        <>
          <circle cx="27" cy="25" r="4.5" fill="none" stroke="#101b2e" strokeWidth="2" />
          <circle cx="37" cy="25" r="4.5" fill="none" stroke="#101b2e" strokeWidth="2" />
          <path d="M31.5 25 L32.5 25" stroke="#101b2e" strokeWidth="2" />
          <circle cx="27" cy="25" r="1.4" fill="#101b2e" />
          <circle cx="37" cy="25" r="1.4" fill="#101b2e" />
        </>
      ) : n === 1 || n === 8 || n === 11 ? (
        // نقاب / سایه روی چشم‌ها
        <>
          <rect x="19" y="20" width="26" height="8" rx="4" fill="#101b2e" />
          <circle cx="27" cy="24" r="1.8" fill={hue} />
          <circle cx="37" cy="24" r="1.8" fill={hue} />
        </>
      ) : (
        <>
          <circle cx="27" cy="25" r="1.8" fill="#101b2e" />
          <circle cx="37" cy="25" r="1.8" fill="#101b2e" />
        </>
      )}
      {/* دهان */}
      {n === 5 || n === 9 ? (
        <path d="M28 33 Q32 30 36 33" stroke="#101b2e" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      ) : n === 2 ? (
        <path d="M28 34 L36 34" stroke="#101b2e" strokeWidth="1.6" strokeLinecap="round" />
      ) : (
        <path d="M28 32 Q32 35 36 32" stroke="#101b2e" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      )}
      {/* کلاه‌ها و تزئینات */}
      {n === 0 && ( // کارآگاه: کلاه لبه‌دار
        <>
          <ellipse cx="32" cy="13" rx="16" ry="3.5" fill={hue} />
          <path d="M22 13 Q22 4 32 4 Q42 4 42 13 Z" fill={hue} />
          <rect x="21.5" y="12" width="21" height="3" rx="1.5" fill="#101b2e" opacity="0.4" />
        </>
      )}
      {n === 1 && ( // جاسوس سایه: نقاب نینجا
        <path d="M19 21 Q32 12 45 21 L45 26 Q32 20 19 26 Z" fill={hue} opacity="0.9" />
      )}
      {n === 2 && ( // مأمور شب: کلاه بیس‌بال
        <>
          <path d="M20 16 Q32 6 44 16 Z" fill={hue} />
          <path d="M44 16 Q54 16 54 21 Q48 19 44 19 Z" fill={hue} opacity="0.8" />
        </>
      )}
      {n === 3 && ( // پایپ‌کش: کلاه فدورا + پایپ
        <>
          <ellipse cx="32" cy="14" rx="17" ry="3" fill="#101b2e" />
          <path d="M23 14 L25 5 Q32 3 39 5 L41 14 Z" fill="#101b2e" />
          <rect x="23.5" y="12.5" width="17" height="3" rx="1.5" fill={hue} />
          <circle cx="40" cy="34" r="2.4" fill="#101b2e" />
          <path d="M40 36.4 L37 40" stroke="#101b2e" strokeWidth="1.8" strokeLinecap="round" />
        </>
      )}
      {n === 6 && ( // کلاه‌دار: کلاه توپاک
        <>
          <rect x="20" y="8" width="24" height="8" rx="3" fill={hue} />
          <ellipse cx="32" cy="17" rx="18" ry="3.5" fill={hue} opacity="0.85" />
        </>
      )}
      {n === 7 && ( // جاسوس کلاسیک: ماسک بر کوکی
        <path d="M20 21 Q32 10 44 21 L44 25 L20 25 Z" fill={hue} opacity="0.85" />
      )}
      {n === 8 && ( // شبح: نقاب شبح‌وار
        <path d="M20 18 Q32 8 44 18 L44 30 Q40 27 36 30 L32 28 L28 30 Q24 27 20 30 Z" fill={hue} opacity="0.6" />
      )}
      {n === 9 && ( // دزد: نقاب چشم‌بند
        <>
          <path d="M20 22 L44 22 L43 27 Q32 24 21 27 Z" fill={hue} />
          <circle cx="27" cy="24.5" r="1.6" fill="#101b2e" />
          <circle cx="37" cy="24.5" r="1.6" fill="#101b2e" />
        </>
      )}
      {n === 10 && ( // رمزگشا: هدفون
        <>
          <path d="M18 26 Q18 10 32 10 Q46 10 46 26" stroke={hue} strokeWidth="3" fill="none" />
          <rect x="14" y="24" width="7" height="9" rx="3" fill={hue} />
          <rect x="43" y="24" width="7" height="9" rx="3" fill={hue} />
        </>
      )}
      {n === 11 && ( // نفوذی: سبیل
        <path d="M26 31 Q29 29 32 31 Q35 29 38 31" stroke="#101b2e" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      )}
      {/* یقه */}
      <path d="M24 42 L32 50 L40 42" fill="#f4d7b0" opacity="0.7" />
    </svg>
  );
}
