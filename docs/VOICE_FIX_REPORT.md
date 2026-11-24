# گزارش عیب‌یابی گفتگوی صوتی (WebRTC) — علت واقعی خرابی و رفع آن

**پروژه:** بازی جاسوس (mahyarjasosgame) — لابی ابری Cloudflare Workers + Durable Object
**علائم گزارش‌شده:** بازیکنان وارد لابی می‌شوند، WebSocket وصل است، اما صدای بازیکنان از هم پخش نمی‌شود.
**روش کار:** بررسی واقعی کد (بدون حدس)، ردیابی کامل زنجیرهٔ صدا، رفع با کمترین تغییر، تست واقعی.

---

## ۱. مسیر صوتی که بررسی شد

```
میکروفن بازیکن A
  → getUserMedia (app/net/voice.ts: join)
  → addTrack به RTCPeerConnection (createPeer)
  → Offer/Answer از طریق پیام {t:'vsig'} روی WebSocket لابی
      → GameRoomDO (worker/do.ts، Hibernation API) → room.ts (رلهٔ فقط-به-مقصد)
  → ICE candidates (STUN/TURN از /api/ice → worker/ice.ts)
  → مسیر مستقیم صوت A↔B (SRTP)
  → pc.ontrack → audio.srcObject → audio.play()
  → بلندگوی بازیکن B
```

## ۲. علت‌های واقعی خرابی

### علت اصلی ۱ — `hasVoice` هرگز `true` نمی‌شد ⇒ هیچ PeerConnectionی هرگز ساخته نمی‌شد
این علت «قاتل» بود و با علامت گزارش‌شده دقیقاً سازگار است:

1. کاربر «ورود به گفتگوی صوتی» را می‌زد → `voice.join()` موفق می‌شد → `onVoiceUpdate(true)`.
2. `App.tsx` پیام `{t:'voice', micOn:true, speaking:false}` می‌فرستاد.
3. `setVoice` در `shared/engine.ts` فقط `micOn` و `speaking` را تنظیم می‌کرد — **`hasVoice` در هیچ مسیری از کد `true` نمی‌شد** (مقدار اولیهٔ `false`، در قطع اتصال `false`، هیچ‌جا `true` نبود).
4. `voice.syncPeers(state)` در کلاینت برای ساخت peerها روی `p.hasVoice` فیلتر می‌کند ⇒ مجموعهٔ همیشه‌خالی ⇒ **بدون PC، بدون Offer/Answer، بدون ICE، بدون ontrack**.

یعنی صدا قبل از آن‌که WebRTC اصلاً شروع شود می‌مرد؛ WebSocket سالم می‌ماند و «همه‌چیز وصل به‌نظر می‌رسید».

### علت اصلی ۲ — `fetchIceServers()` هرگز فراخوانی نمی‌شد ⇒ PCها بدون STUN/TURN ساخته می‌شدند
- `createPeer` از `iceCache?.servers ?? []` می‌خواند، اما `fetchIceServers` (که cache را پر می‌کند) در کل کدبیس **هیچ‌جا صدا زده نمی‌شد**.
- نتیجه: `new RTCPeerConnection({ iceServers: [] })` — حتی اگر علت ۱ رفع می‌شد، ICE فقط host candidate می‌گرفت و اتصال بین دو شبکهٔ متفاوت (اینترنت واقعی) هرگز برقرار نمی‌شد.

### علت سوم (پنهان‌کنندهٔ علامت) — خطای `audio.play()` بی‌صدا بلعیده می‌شد
- `audio.play().catch(() => {})` خطای سیاست autoplay را نابود می‌کرد؛ UI «متصل» را نشان می‌داد اما صدایی نبود و هیچ ردی باقی نمی‌ماند.
- اکنون خطا ثبت می‌شود (در پنل عیب‌یابی دیده می‌شود) و با اولین کلیک کاربر، پخش به‌طور خودکار تلاش مجدد می‌شود.

## ۳. نتیجهٔ چک‌لیست ۱۲گانهٔ بررسی

| # | مورد | نتیجه |
|---|------|-------|
| ۱ | `addTrack` واقعاً اجرا می‌شود؟ | کد درست بود ولی هرگز به آن نمی‌رسید (بدون peer) — اکنون با تست رگرسیون پوشش داده شده |
| ۲ | رلهٔ Offer/Answer به peer درست | ✅ درست بود (`worker/room.ts` → vsig فقط به مقصد؛ تست دود: «vsig به مقصد رسید» / «نشت نکرد») |
| ۳ | مسیر ICE candidateها | ✅ همان رلهٔ اختصاصی؛ گم/مسیر اشتباه ندارد |
| ۴ | صف candidate زودرس قبل از RemoteDescription | ✅ از قبل درست بود + تست رگرسیون جدید |
| ۵ | PC متناظر برای هر دو بازیکن | ✅ پس از رفع علت ۱ — هر دو طرف در broadcast state هم‌زمان peer می‌سازند (تست چرخهٔ کامل A↔B) |
| ۶ | `ontrack` → `srcObject` → پخش | ✅ بود؛ خطای play اکنون ثبت و مدیریت می‌شود |
| ۷ | mute تصادفی | بررسی شد — `muted` فقط از `userMuted/deafened` می‌آید (پیش‌فرض false) |
| ۸ | lifecycle و پاکسازی PC | ✅ `teardownPeer` + حذف از `syncPeers` + اطلاع `joined=false` هنگام خروج |
| ۹ | Hibernation در GameRoomDO | بررسی شد — vsig پس از بیدار شدن DO رله می‌شود؛ پاسخ خودکار فقط برای ping سبک است؛ سوکت‌های خوابیده با `getWebSockets()` در دسترس‌اند؛ نشتی سیگنال به غیرمقصد در تست دود رد شد |
| ۱۰ | پیکربندی ICE | 🔴 رفع شد — `join` اکنون `await fetchIceServers()` قبل از ساخت هر PC |
| ۱۱ | `hasVoice` سمت سرور | 🔴 رفع شد — پیام voice فیلد اختیاری `joined` دارد؛ `setVoice` آن را روی `hasVoice` می‌نویسد |
| ۱۲ | اطلاع خروج از صوت به سرور | 🔴 رفع شد — `voice.leave()` اکنون `joined=false` می‌فرستد تا peerها در بقیه پاکسازی شوند |

## ۴. فایل‌های اصلاح‌شده (کمترین تغییر)

| فایل | تغییر |
|------|-------|
| `shared/types.ts` | فیلد اختیاری `joined?: boolean` در پیام `voice` |
| `shared/engine.ts` | `setVoice(..., joined?)` → تنظیم `hasVoice`؛ دیسپچر `apply` پارامتر را پاس می‌دهد |
| `app/net/voice.ts` | `join` اکنون ICE را می‌گیرد؛ ثبت `lastAudioError`؛ `retryPlayback` با gesture؛ همگام‌سازی `micOn` هم‌بازی از state؛ اطلاع `joined` در join/leave؛ متد `diagnostics()` (getStats)؛ export `VoiceManager` برای تست |
| `app/App.tsx` | سیم‌کشی `onVoiceUpdate(micOn, joined)` → ارسال مشروط `joined` |
| `app/components/VoiceBar.tsx` | دکمهٔ «عیب‌یابی»؛ خروج تمیز از صوت |
| `app/components/VoiceDiagnostics.tsx` | **پنل عیب‌یابی موقت (جدید)** |
| `scripts/smoke_e2e_cloudflare.mjs` | ۳ چک جدید: `joined=true→hasVoice=true`، `joined=false→hasVoice=false` |
| `tests/voice.test.ts` | **۱۰ تست رگرسیون (جدید)** |

### پنل عیب‌یابی (سیستم Diagnostic موقت)
در نوار صوت، دکمهٔ «عیب‌یابی» پنلی زنده (هر ۱ ثانیه از `getStats`) باز می‌کند و برای **هر بازیکن** نشان می‌دهد:
- دسترسی میکروفن (permission) و وضعیت تراک محلی (live/live-muted/ended)
- تعداد و نوع سرورهای ICE (STUN/TURN)
- برای هر هم‌بازی: وضعیت PeerConnection، ICE، Signaling، تعداد تراک صوتی دریافتی زنده
- **`bytesSent` و `bytesReceived` صوت** (اگر صدا واقعاً جاری باشد افزایش می‌یابند)
- نوع جفت candidate انتخاب‌شده (host/srflx/relay) و تعداد candidateهای در صف
- آخرین خطای پخش صدا

## ۵. خروجی تست (اجرای واقعی)

**تست‌های واحد:** `4 فایل — 69/69 پاس` (شامل ۱۰ تست جدید صوت: joined→hasVoice، ساخت peer مشروط به hasVoice، گرفتن ICE در join، صف candidate زودرس، مذاکرهٔ کامل دوطرفهٔ A↔B، اطلاع خروج)

**تست دود E2E روی سرور واقعی wrangler dev:** `32/32 پاس` — بخش صوتی:
```
PASS — vsig به مقصد رسید
PASS — vsig به بقیه نشت نکرد
PASS — وضعیت میکروفن همگام شد
PASS — joined=true → hasVoice=true پخش شد (کلید همگام‌سازی peerها)
PASS — joined=false → hasVoice=false و میکروفن خاموش
```
`typecheck` و `build` هر دو سبز هستند.

## ۶. وضعیت واقعی انتقال صدا بین دو مرورگر — صادقانه

**آنچه در این محیط راستی‌آزمایی شد:**
- زنجیرهٔ کامل منطقی کلاینت تا سطح مذاکرهٔ دوطرفهٔ واقعی (Offer/Answer/ICE-queue) با تست رگرسیون روی VoiceManager واقعی؛
- رلهٔ سیگنالینگ و چرخهٔ hasVoice روی **سرور واقعی wrangler dev** با تست دود E2E؛
- build و typecheck پروژه.

**آنچه در سندباکس قابل تست نبود:** اجرای هم‌زمان دو مرورگر فیزیکی با میکروفن واقعی در دو شبکهٔ متفاوت — سندباکس نه میکروفن دارد و نه RTCPeerConnection واقعی مرورگر. بنابراین **ادعا نمی‌شود «صدا حتماً پخش می‌شود»**؛ چیزی که اثبات می‌شود این است:
1. دو علت **قطعیِ** مرگ صوت حذف شده‌اند (پیش از رفع، صدای بین دو بازیکن به‌طور تعیین‌شده هرگز وجود نداشت — نه روی localhost و نه روی اینترنت).
2. ابزار زندهٔ عیب‌یابی ساخته شده تا تأیید نهایی روی استقرار واقعی در ۳۰ ثانیه انجام شود.

### پروتکل تأیید نهایی روی deploy واقعی (دو مرورگر، دو شبکه)
1. هر دو بازیکن وارد لابی شوند و هر دو «ورود به گفتگوی صوتی» را بزنند.
2. هر دو دکمهٔ **عیب‌یابی** را باز کنند.
3. انتظار در هر دو طرف: `PeerConnection: connected`، `ICE: connected/completed`، `تراک صوتی دریافتی ≥ ۱`.
4. A صحبت کند → در پنل B مقدار `bytesReceived` باید مداوم بالا برود (این «اثبات صوت» است، نه اتصال WS).
5. اگر صدا پخش نمی‌شد ولی PC/bytes سالم بودند → خطای autoplay در پنل دیده می‌شود؛ یک کلیک روی صفحه پخش را فعال می‌کند.
6. اگر `ICE` در `failed` ماند → NAT سخت است؛ به بخش بعد بروید.

## ۷. نکتهٔ باقی‌مانده: TURN

`/api/ice` بدون تنظیم Secret فقط STUN برمی‌گرداند (`worker/ice.ts`). در NATهای سخت (symmetric) اتصال مستقیم ممکن است برقرار نشود؛ راه‌حل استاندارد TURN است:
```bash
npx wrangler secret put TURN_URLS
npx wrangler secret put TURN_USERNAME
npx wrangler secret put TURN_CREDENTIAL
```
پنل عیب‌یابی این را هم شفاف نشان می‌دهد: اگر `hasTurn: ندارد` و جفت candidate به `relay` نرسد، علت دقیقاً همین است.
