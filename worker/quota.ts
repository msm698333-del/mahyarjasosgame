// PlayerQuotaDO — سهمیهٔ زمانی روزانهٔ هر بازیکن (قانون ۴)
// یک نمونهٔ DO به‌ازای هر deviceId (نام DO = «q:<deviceId>»):
//  — ذخیره در Storage → مصرف پس از خروج و ورود مجدد بازیابی نمی‌شود و تا فردا می‌ماند.
//  — کلید روز تهران → بازنشانی خودکار سهمیه در ۰۰:۰۰ تهران (روز جدید = رکورد تازه).
//  — Input Gates این DO فراخوانی‌ها را ترتیبی می‌کند → چند درخواست هم‌زمان نمی‌توانند
//    بیش از سهمیه مصرف کنند (check-then-write اتمیک).
//  — محاسبه با ساعت سرور انجام می‌شود؛ زمان سیستم کاربر هرگز استفاده نمی‌شود.

import { DurableObject } from 'cloudflare:workers';
import { QuotaRecord, consumeFromRecord, remainingFromRecord, tehranDayKey, DAILY_QUOTA_SECONDS } from '../shared/quota';
import type { Env } from './do';

const KEY = 'q';

export class PlayerQuotaDO extends DurableObject<Env> {
  private async read(): Promise<QuotaRecord | undefined> {
    return this.ctx.storage.get<QuotaRecord>(KEY);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const now = Date.now(); // ساعت سرور — تنها مبنای محاسبهٔ سهمیه

    // خواندن سهمیهٔ باقی‌ماندهٔ امروز
    if (request.method === 'POST' && url.pathname === '/check') {
      const rec = await this.read();
      return Response.json({
        remaining: remainingFromRecord(rec, now),
        total: DAILY_QUOTA_SECONDS,
        day: tehranDayKey(now)
      });
    }

    // مصرف اتمیک سهمیه (هر نوبت ۱۰ ثانیه)
    if (request.method === 'POST' && url.pathname === '/consume') {
      const body = await request.json<{ seconds?: number }>().catch(() => ({}) as { seconds?: number });
      const seconds = Math.max(0, Math.min(DAILY_QUOTA_SECONDS, Number(body.seconds ?? 0) | 0));
      const rec = await this.read();
      const { record, result } = consumeFromRecord(rec, now, seconds);
      // رکورد روز جاری ذخیره می‌شود (روز جدید را هم ایجاد می‌کند؛ مصرف ناموفق ذخیره نمی‌شود)
      if (result.ok || record.day === tehranDayKey(now)) {
        await this.ctx.storage.put(KEY, record);
      }
      return Response.json(result);
    }

    return new Response('Not Found', { status: 404 });
  }
}
