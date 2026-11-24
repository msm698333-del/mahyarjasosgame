// تولید شناسه‌های امن — همه ورودی‌ها از طریق rng تزریقی تا موتور بازی در Node و Workers هر دو قابل تست باشد.

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // بدون I, O, 0, 1 برای خوانایی
const HEX = '0123456789abcdef';

export type Rng = () => number;

function pick(rng: Rng, alphabet: string, len: number): string {
  let out = '';
  for (let i = 0; i < len; i++) out += alphabet[Math.floor(rng() * alphabet.length)];
  return out;
}

/** کد لابی ۴ حرفی مثل K7XM */
export function genRoomCode(rng: Rng): string {
  return pick(rng, CODE_ALPHABET, 4);
}

/** شناسه داخلی بازیکن */
export function newPlayerId(rng: Rng): string {
  return 'p' + pick(rng, HEX, 10);
}

/** توکن احراز بازیکن — فقط برای اتصال مجدد؛ در کلاینت ذخیره و هرگز پخش نمی‌شود */
export function genToken(rng: Rng): string {
  return pick(rng, 'abcdefghijklmnopqrstuvwxyz0123456789', 26);
}
