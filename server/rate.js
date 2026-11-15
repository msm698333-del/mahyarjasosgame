// ─── محدودکننده نرخ درخواست‌ها (ضد اسپم) ───
function makeLimiter() {
  const map = new Map();
  let lastSweep = Date.now();

  function allow(key, max, windowMs) {
    const t = Date.now();
    if (t - lastSweep > 60000) {
      for (const [k, arr] of map) {
        const filtered = arr.filter((x) => t - x <= windowMs);
        if (filtered.length === 0) map.delete(k);
        else map.set(k, filtered);
      }
      lastSweep = t;
    }
    let arr = map.get(key);
    if (!arr) {
      arr = [];
      map.set(key, arr);
    }
    while (arr.length && t - arr[0] > windowMs) arr.shift();
    if (arr.length >= max) return false;
    arr.push(t);
    return true;
  }

  return allow;
}

module.exports = { makeLimiter };
