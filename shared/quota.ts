// سهمیهٔ زمانی روزانه — تمام محاسبات سمت سرور انجام می‌شود؛ کلاینت فقط نمایش می‌دهد.
// ساعت رسمی ایران از سال ۱۴۰۱ دیگر تغییر نمی‌کند (بدون ساعت تابستانی) → آفست ثابت UTC+03:30.

import { Rng } from './ids';

/** کل سهمیهٔ روزانهٔ هر بازیکن (ثانیه) */
export const DAILY_QUOTA_SECONDS = 60;

/** هزینهٔ ثابت هر نوبت صحبت (ثانیه) — هر نوبت دقیقاً ۱۰ ثانیه است */
export const TURN_COST_SECONDS = 10;

/** آفست ثابت ایران: UTC+03:30 (میلی‌ثانیه) */
const TEHRAN_OFFSET_MS = 3.5 * 60 * 60 * 1000;

/**
 * کلید روز تهران برای یک لحظهٔ UTC (epoch ms).
 * بازنشانی سهمیه در ساعت ۰۰:۰۰ تهران — یعنی ۲۰:۳۰ UTC روز قبل.
 * خروجی مثل «2026-01-01»؛ چون کلید در storage ذخیره می‌شود، روز جدید به‌طور خودکار سهمیهٔ تازه می‌گیرد.
 */
export function tehranDayKey(nowMs: number): string {
  return new Date(nowMs + TEHRAN_OFFSET_MS).toISOString().slice(0, 10);
}

/** سهمیهٔ باقی‌مانده از رکورد مصرف؛ اگر روز عوض شده باشد، سهمیهٔ کامل امروز برمی‌گردد */
export function remainingFromRecord(rec: { day: string; used: number } | undefined, nowMs: number): number {
  const today = tehranDayKey(nowMs);
  if (!rec || rec.day !== today) return DAILY_QUOTA_SECONDS;
  return Math.max(0, DAILY_QUOTA_SECONDS - Math.max(0, rec.used | 0));
}

/** وسیلهٔ تست: تاس شبه‌تصادفی قطعی برای اجرای موتور در Node */
export function seededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

/** نوع رکورد ذخیره‌شده در QuotaDO */
export interface QuotaRecord { day: string; used: number; updated: number }

/** نتیجهٔ مصرف اتمیک سهمیه */
export interface ConsumeResult { ok: boolean; remaining: number; day: string }

/**
 * منطق خالص مصرف سهمیه — هم در QuotaDO سرور و هم در تست‌های Node استفاده می‌شود.
 * ورودی‌ها check-then-write هستند؛ در QuotaDO فراخوانی‌ها با Input Gates ترتیبی می‌شوند
 * تا چند درخواست هم‌زمان نتوانند بیش از سهمیه مصرف کنند.
 */
export function consumeFromRecord(
  rec: QuotaRecord | undefined, nowMs: number, seconds: number
): { record: QuotaRecord; result: ConsumeResult } {
  const day = tehranDayKey(nowMs);
  const current = rec && rec.day === day
    ? rec
    : { day, used: 0, updated: nowMs };
  const remaining = Math.max(0, DAILY_QUOTA_SECONDS - Math.max(0, current.used | 0));
  if (seconds <= 0 || seconds > remaining) {
    return {
      record: { ...current, updated: nowMs },
      result: { ok: false, remaining, day }
    };
  }
  const record: QuotaRecord = { day, used: (current.used | 0) + seconds, updated: nowMs };
  return {
    record,
    result: { ok: true, remaining: Math.max(0, DAILY_QUOTA_SECONDS - record.used), day }
  };
}
