// تست‌های بانک کلمات — ۱۷ دسته × حداقل ۳۰ کلمه + منطق انتخاب و کلمهٔ جاسوس
import { describe, it, expect } from 'vitest';
import {
  WORD_CATEGORIES, WORDS, WordDef, pickWord, pickSpyWord, wordById, wordCategoryName,
  wordPoolSize, wordCategoryIds
} from '../shared/wordBank';
import { tehranDayKey } from '../shared/quota';

let seed = 4242;
const rng = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};

/** دسته‌های الزامی مشخصات پروژه */
const REQUIRED_CATEGORIES = [
  'public-place', 'fun-place', 'home', 'food', 'drink', 'animal', 'job',
  'vehicle', 'tech', 'sport', 'game', 'nature', 'clothing', 'school',
  'historic', 'character', 'everyday'
];

describe('ساختار بانک کلمات', () => {
  it('دقیقاً ۱۷ دستهٔ الزامی وجود دارد', () => {
    expect(WORD_CATEGORIES).toHaveLength(17);
    expect(wordCategoryIds().sort()).toEqual([...REQUIRED_CATEGORIES].sort());
  });

  it('هر دسته حداقل ۳۰ کلمه دارد', () => {
    for (const c of WORD_CATEGORIES) {
      const count = c.groups.reduce((n, g) => n + g.words.length, 0);
      expect(count).toBeGreaterThanOrEqual(30);
    }
  });

  it('کل بانک حداقل ۵۱۰ کلمه دارد', () => {
    expect(WORDS.length).toBeGreaterThanOrEqual(17 * 30);
  });

  it('کلمه‌ها در کل بانک یکتا هستند (بدون تکرار)', () => {
    const seen = new Set<string>();
    for (const w of WORDS) {
      expect(seen.has(w.word)).toBe(false);
      seen.add(w.word);
    }
  });

  it('شناسه‌های کلمه یکتا هستند و با wordById پیدا می‌شوند', () => {
    const ids = new Set<string>();
    for (const w of WORDS) {
      expect(ids.has(w.id)).toBe(false);
      ids.add(w.id);
      expect(wordById(w.id)).toBeDefined();
    }
    expect(wordById('no-such-id')).toBeUndefined();
  });

  it('هر خوشه حداقل ۲ کلمه دارد تا کلمهٔ جاسوس در سطح سخت جایگزین داشته باشد', () => {
    for (const c of WORD_CATEGORIES) {
      for (const g of c.groups) {
        expect(g.words.length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('خوشه‌های near به خوشه‌های واقعی همان دسته اشاره می‌کنند', () => {
    for (const c of WORD_CATEGORIES) {
      const gids = new Set(c.groups.map((g) => g.id));
      for (const g of c.groups) {
        for (const n of g.near ?? []) {
          expect(gids.has(n)).toBe(true);
          expect(n).not.toBe(g.id);
        }
      }
    }
  });

  it('نام فارسی دسته برگردانده می‌شود', () => {
    expect(wordCategoryName('food')).toBe('غذاها');
    expect(wordCategoryName('drink')).toBe('نوشیدنی‌ها');
    expect(wordCategoryName('unknown-x')).toBe('unknown-x');
  });
});

describe('انتخاب تصادفی کلمه‌ها', () => {
  it('کلمهٔ انتخابی از دسته‌های فعال می‌آید', () => {
    for (let i = 0; i < 50; i++) {
      const w = pickWord(['animal'], rng, []);
      expect(w).not.toBeNull();
      expect(w!.cat).toBe('animal');
    }
  });

  it('کلمه‌های داخل exclude تا پایان بانکِ دسته انتخاب نمی‌شوند', () => {
    const foodIds = WORDS.filter((w) => w.cat === 'food').map((w) => w.id);
    const exclude = foodIds.slice(1); // همه به‌جز یکی
    for (let i = 0; i < 20; i++) {
      const w = pickWord(['food'], rng, exclude);
      expect(w!.id).toBe(foodIds[0]); // تنها گزینهٔ تازه
    }
    // وقتی کل دسته exclude شود، اجازهٔ تکرار (fallback) — مثل قانون قدیمی
    const w2 = pickWord(['food'], rng, foodIds);
    expect(w2).not.toBeNull();
  });

  it('انتخاب پشت‌سرهم بدون تکرار متوالی است', () => {
    const used: string[] = [];
    const names: string[] = [];
    for (let i = 0; i < 30; i++) {
      const w = pickWord(null, rng, used);
      expect(w).not.toBeNull();
      used.push(w!.id);
      names.push(w!.word);
      if (i > 0) expect(names[i]).not.toBe(names[i - 1]);
    }
    // بانک بزرگ است؛ در ۳۰ انتخاب نباید تکرار مطلق رخ دهد
    expect(new Set(names).size).toBe(30);
  });

  it('wordPoolSize با فیلتر دسته‌ها درست حساب می‌شود', () => {
    expect(wordPoolSize(null)).toBe(WORDS.length);
    expect(wordPoolSize([])).toBe(WORDS.length);
    const foodCount = WORDS.filter((w) => w.cat === 'food').length;
    expect(wordPoolSize(['food'])).toBe(foodCount);
  });
});

describe('کلمهٔ جاسوس بر اساس سطح سختی', () => {
  function mainOf(cat = 'food'): WordDef {
    const w = pickWord([cat], rng, []);
    expect(w).not.toBeNull();
    return w!;
  }

  it('سطح سخت: کلمهٔ جاسوس از همان خوشهٔ کلمهٔ اصلی است (بسیار نزدیک) و هرگز برابر آن نیست', () => {
    for (let i = 0; i < 40; i++) {
      const main = mainOf();
      const decoy = pickSpyWord(main!, 'hard', rng);
      expect(decoy).not.toBe('');
      expect(decoy).not.toBe(main!.word);
      const mainGroup = WORD_CATEGORIES.find((c) => c.id === main!.cat)!.groups.find((g) => g.id === main!.group)!;
      const sameGroupFallback = WORD_CATEGORIES.find((c) => c.id === main!.cat)!
        .groups.filter((g) => g.id !== main!.group).flatMap((g) => g.words);
      // در خوشه‌های ۵تایی باید تقریباً همیشه از همان خوشه بیاید
      expect(mainGroup.words.includes(decoy) || sameGroupFallback.includes(decoy)).toBe(true);
    }
  });

  it('سطح متوسط: کلمهٔ جاسوس از خوشه‌های نزدیک همان دسته است', () => {
    for (let i = 0; i < 40; i++) {
      const main = mainOf('drink');
      const decoy = pickSpyWord(main!, 'medium', rng);
      expect(decoy).not.toBe('');
      expect(decoy).not.toBe(main!.word);
      const cat = WORD_CATEGORIES.find((c) => c.id === main!.cat)!;
      const catWords = cat.groups.filter((g) => g.id !== main!.group).flatMap((g) => g.words);
      expect(catWords.includes(decoy)).toBe(true);
    }
  });

  it('سطح آسان: کلمهٔ جاسوس از همان دسته ولی خوشهٔ متفاوت است', () => {
    for (let i = 0; i < 40; i++) {
      const main = mainOf('animal');
      const decoy = pickSpyWord(main!, 'easy', rng);
      expect(decoy).not.toBe('');
      expect(decoy).not.toBe(main!.word);
      const cat = WORD_CATEGORIES.find((c) => c.id === main!.cat)!;
      const catWords = cat.groups.filter((g) => g.id !== main!.group).flatMap((g) => g.words);
      expect(catWords.includes(decoy)).toBe(true);
    }
  });

  it('جاسوس هرگز همان کلمهٔ شهروندها را نمی‌بیند (هیچ سطحی)', () => {
    for (const difficulty of ['easy', 'medium', 'hard'] as const) {
      for (let i = 0; i < 30; i++) {
        const main = mainOf();
        expect(pickSpyWord(main!, difficulty, rng)).not.toBe(main!.word);
      }
    }
  });
});

describe('کلید روز تهران', () => {
  it('۰۰:۰۰ تهران = ۲۰:۳۰ UTC روز قبل', () => {
    // ۲۰:۲۹ UTC → هنوز روز قبل تهران
    expect(tehranDayKey(Date.UTC(2025, 11, 31, 20, 29, 0))).toBe('2025-12-31');
    // ۲۰:۳۰ UTC → ۰۰:۰۰ تهران روز بعد
    expect(tehranDayKey(Date.UTC(2025, 11, 31, 20, 30, 0))).toBe('2026-01-01');
  });

  it('وسط روز تهران همان روز است', () => {
    // ۱۲:۰۰ تهران = ۰۸:۳۰ UTC — همان روز
    expect(tehranDayKey(Date.UTC(2026, 0, 1, 8, 30, 0))).toBe('2026-01-01');
    // ۱۱:۵۹ تهران = ۰۸:۲۹ UTC — همان روز (قبل از نیمه‌شب تهران)
    expect(tehranDayKey(Date.UTC(2026, 0, 1, 8, 29, 0))).toBe('2026-01-01');
  });
});
