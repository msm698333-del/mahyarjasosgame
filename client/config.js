// ─── تنظیمات اتصال کلاینت ───
// سه حالت پشتیبانی‌شده:
// ۱) self     — فرانت و بک روی یک دامنه (سرور خودش فرانت را ارائه می‌کند) → پیش‌فرض
// ۲) gateway  — داخل سندباکس/پلتفرم با Gateway (درخواست‌ها با XTransformPort مسیریابی می‌شوند)
// ۳) tiiny    — فرانت استاتیک روی Tiiny Host + بک‌اند روی سرویس ابری جدا
window.SPY_CONFIG = {
  MODE: 'auto', // "auto" | "self" | "gateway" | "tiiny"
  // فقط برای حالت tiiny: آدرس کامل بک‌اند، مثال: https://spy-backend.onrender.com
  BACKEND_URL: '',
  // پورت سرویس در حالت gateway (پیش‌فرض 3003)
  GATEWAY_PORT: 3003,
};
