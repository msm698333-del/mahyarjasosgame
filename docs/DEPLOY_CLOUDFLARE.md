# راهنمای کامل انتشار بازی جاسوس روی Cloudflare

این بازی یک **Cloudflare Worker** است (بک‌اند + فرانت React در یک Worker، با Durable Object برای هر لابی). انتشار آن فقط چند دقیقه طول می‌کشد و **بدون هیچ تنظیم اضافه‌ای** کار می‌کند — D1 و TURN همه اختیاری‌اند.

---

## روش ۱ — اتصال GitHub به Cloudflare (بدون ترمینال — پیشنهادی)

این روش ساده‌ترین است: بعد از یک‌بار تنظیم، هر push به GitHub خودکار منتشر می‌شود.

1. وارد [dash.cloudflare.com](https://dash.cloudflare.com) شوید (اگر حساب ندارید، ثبت‌نام رایگان).
2. از منوی کنار: **Compute & AI → Workers & Pages → Create** (در نمای‌های قدیمی‌تر: Workers & Pages → Create application).
3. **Workers → Import a repository** را بزنید و **Connect GitHub** را تأیید کنید؛ سپس ریپوی `mahyarjasosgame` را انتخاب کنید.
4. در تنظیمات Build:
   - **Deployment/Build command:** `npm run build`
   - **Deploy command:** پیش‌فرض بماند (`npx wrangler deploy`)
   - **Root directory:** پیش‌فرض (خالی)
5. **Create and deploy** را بزنید. ۱ تا ۲ دقیقه صبر کنید.
6. آدرس بازی: `https://mahyarjasos.<نام-اکانت>.workers.dev`
   (در صفحهٔ Worker، بخش *Domains & Routes* قابل مشاهده است.)

از این به بعد هر تغییری که در GitHub کامیت شود، Cloudflare خودش build و منتشر می‌کند.

> **نکته:** Workers Builds ماهانه ۳۰۰۰ دقیقه build رایگان دارد — برای این پروژه بسیار بیش از کافی است.

---

## روش ۲ — انتشار از کامپیوتر خودتان با Wrangler CLI

پیش‌نیاز: **Node.js نسخهٔ ۲۰ یا بالاتر** روی سیستم شما نصب باشد.

```bash
# ۱) دریافت کد
git clone https://github.com/msm698333-del/mahyarjasosgame.git
cd mahyarjasosgame

# ۲) نصب وابستگی‌ها
npm install

# ۳) ورود به حساب Cloudflare (یک مرورگر باز می‌شود؛ روی Allow بزنید)
npx wrangler login

# ۴) انتشار (build فرانت + آپلود Worker)
npm run deploy
```

پس از اتمام، Wrangler آدرس `https://mahyarjasos.<نام-اکانت>.workers.dev` را چاپ می‌کند.

برای تست محلی قبل از انتشار: `npm run dev` → آدرس `http://localhost:8787`

---

## گام اختیاری ۱ — فعال‌سازی D1 (تاریخچهٔ بازی‌ها)

بدون D1 بازی کامل کار می‌کند؛ D1 فقط نتایج بازی‌ها را ذخیره می‌کند.

```bash
# ساخت دیتابیس
npx wrangler d1 create spy-game-db
```

شناسهٔ `database_id` در خروجی را کپی کنید. سپس در فایل `wrangler.jsonc` بلوک کامنت‌شدهٔ `d1_databases` را از کامنت خارج کنید و به‌جای `DATABASE_ID_HERE` شناسه را بگذارید. بعد:

```bash
# اجرای اسکیمای جدول‌ها روی دیتابیس ابری
npx wrangler d1 execute spy-game-db --remote --file migrations/0001_init.sql

# انتشار مجدد
npm run deploy
```

---

## گام اختیاری ۲ — TURN برای شبکه‌های سخت‌گیر

صوت بازی WebRTC مستقیم (P2P) است و با STUN عمومی در اکثر شبکه‌ها وصل می‌شود. اگر کاربری پشت NAT/فایروال سخت بود، TURN واقعی (مثلاً [Cloudflare Calls TURN](https://developers.cloudflare.com/calls/turn/)) اضافه کنید:

```bash
npx wrangler secret put TURN_URLS        # مثل: turn:turn.cloudflare.com:3478?transport=udp
npx wrangler secret put TURN_USERNAME
npx wrangler secret put TURN_CREDENTIAL
```

در روش ۱ (Git) هم می‌توانید Secrets را از داشبورد وارد کنید: صفحهٔ Worker → **Settings → Variables and Secrets → Add**.

---

## تأیید پس از انتشار

1. `https://<آدرس-Worker>/api/health` را باز کنید → باید `{"ok":true,...}` برگردد.
2. بازی را در **دو مرورگر** (یا یک مرورگر معمولی + یک پنجرهٔ ناشناس) باز کنید، یکی لابی بسازد و دیگری با کد ۴ حرفی وارد شود.
3. شروع بازی، صوت، استیکر، رد کردن نوبت و رأی‌گیری را با هر دو مرورگر امتحان کنید.

## دامنهٔ اختصاصی (اختیاری)

صفحهٔ Worker در داشبورد → **Settings → Domains & Routes → Add → Custom domain**؛ اگر دامنهٔ خودتان روی همان حساب Cloudflare است، یک CNAME خودکار ساخته می‌شود.

---

## عیب‌یابی رایج

| خطا | علت و راه‌حل |
|---|---|
| `database_id` invalid در هنگام deploy | بلوک `d1_databases` را در `wrangler.jsonc` کامنت کنید یا شناسهٔ واقعی D1 را بگذارید. |
| خطای build در Workers Builds | مطمئن شوید Build command دقیقاً `npm run build` است و Node نسخهٔ ۲۰+ تنظیم شده (متغیر `NODE_VERSION`). |
| WebSocket وصل نمی‌شود | آدرس باید `https://…workers.dev` باشد و مسیر `/ws` از Worker عبور کند؛ آدرس محلی ۵۱۷۳ فقط برای dev است. |
| صوت در بعضی شبکه‌ها قطع می‌شود | TURN اختیاری را طبق بالا تنظیم کنید. |
| صفحهٔ خالی بعد از deploy | یک بار دیگر `npm run deploy` بزنید یا در Workers Builds دکمهٔ **Retry deployment**؛ چون Assets باید پس از build موجود باشد. |

---

## هزینه

Worker رایگان (Free plan) برای این بازی کافی است: روزانه ۱۰۰٬۰۰۰ درخواست، Durable Objects و WebSocket در پلن رایگان پشتیبانی می‌شوند. برای گردش دوستان و خانواده هزینه‌ای ندارید.
