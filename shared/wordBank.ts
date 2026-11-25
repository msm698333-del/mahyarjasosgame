// بانک کلمات «بازی جاسوس» — ۱۷ دسته، هر دسته حداقل ۳۰ کلمه
// ساختار خوشه‌ای (groups): کلمه‌های یک خوشه به هم نزدیک‌اند و برای «کلمهٔ جاسوس» در سطح‌های سخت‌تر استفاده می‌شوند.
// افزودن دسته/کلمهٔ جدید: فقط دادهٔ این فایل را گسترش دهید — موتور و تست‌ها خودکار سازگار می‌شوند.

import { Rng } from './ids';

export type WordCategoryId =
  | 'public-place' | 'fun-place' | 'home' | 'food' | 'drink'
  | 'animal' | 'job' | 'vehicle' | 'tech' | 'sport'
  | 'game' | 'nature' | 'clothing' | 'school' | 'historic'
  | 'character' | 'everyday';

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface WordGroupDef {
  id: string;
  words: string[];
  /** خوشه‌های نزدیک همین دسته — منبع کلمهٔ جاسوس در سطح «متوسط» */
  near?: string[];
}

export interface WordCategoryDef {
  id: WordCategoryId;
  name: string;
  icon: string;
  groups: WordGroupDef[];
}

export const WORD_CATEGORIES: WordCategoryDef[] = [
  {
    id: 'public-place', name: 'مکان‌های عمومی', icon: 'public-place', groups: [
      { id: 'shopping', words: ['فروشگاه', 'پاساژ', 'سوپرمارکت', 'بازار روز', 'داروخانه'], near: ['services'] },
      { id: 'transport-hub', words: ['ایستگاه اتوبوس', 'ایستگاه مترو', 'پمپ بنزین', 'پارکینگ', 'پایانه مسافربری'], near: ['services'] },
      { id: 'services', words: ['بانک', 'دفتر پست', 'شهرداری', 'آتش‌نشانی', 'کلانتری'], near: ['shopping'] },
      { id: 'health-places', words: ['بیمارستان', 'درمانگاه', 'دندان‌پزشکی', 'آزمایشگاه', 'اورژانس'], near: ['services'] },
      { id: 'culture', words: ['کتابخانه', 'موزه', 'سینما', 'مسجد', 'حسینیه'], near: ['stay-food'] },
      { id: 'stay-food', words: ['هتل', 'مهمانسرا', 'رستوران', 'کافی‌شاپ', 'تالار پذیرایی'], near: ['culture'] }
    ]
  },
  {
    id: 'fun-place', name: 'مکان‌های تفریحی', icon: 'fun-place', groups: [
      { id: 'parks', words: ['شهربازی', 'پارک آبی', 'باغ وحش', 'آکواریوم', 'باغ پرندگان'], near: ['rides'] },
      { id: 'rides', words: ['چرخ‌وفلک', 'ترن هوایی', 'قایق پدالی', 'ترامپولین', 'سرسرهٔ آبی'], near: ['parks'] },
      { id: 'indoor', words: ['بولینگ', 'بیلیارد', 'کافه بازی', 'اتاق فرار', 'سالن تئاتر'], near: ['shows'] },
      { id: 'sport-fun', words: ['استخر', 'پیست اسکیت', 'پیست کارتینگ', 'پاتیناژ', 'زمین گلف'], near: ['parks'] },
      { id: 'shows', words: ['کارناوال', 'سیرک', 'نمایشگاه', 'جشنوارهٔ فیلم', 'سالن کنسرت'], near: ['indoor'] },
      { id: 'eco', words: ['اردوگاه', 'اقامتگاه بوم‌گردی', 'پارک جنگلی', 'باغ گیاه‌شناسی', 'تالار قایق‌رانی'], near: ['parks'] }
    ]
  },
  {
    id: 'home', name: 'خانه و وسایل خانه', icon: 'home', groups: [
      { id: 'rooms', words: ['آشپزخانه', 'اتاق خواب', 'اتاق نشیمن', 'حمام', 'انباری'], near: ['furniture'] },
      { id: 'big-appliances', words: ['یخچال', 'ماشین لباسشویی', 'ماشین ظرفشویی', 'اجاق گاز', 'جاروبرقی'], near: ['small-appliances'] },
      { id: 'small-appliances', words: ['اتو', 'چای‌ساز', 'مایکروویو', 'سشوار', 'آبمیوه‌گیری'], near: ['big-appliances'] },
      { id: 'furniture', words: ['مبل', 'تخت', 'کمد', 'میز ناهارخوری', 'صندلی'], near: ['rooms'] },
      { id: 'small-items', words: ['قابلمه', 'کتری', 'سینی', 'پرده', 'آینه'], near: ['furniture'] },
      { id: 'spaces', words: ['بالکن', 'حیاط', 'پله', 'پنجره', 'درِ ورودی'], near: ['rooms'] }
    ]
  },
  {
    id: 'food', name: 'غذاها', icon: 'food', groups: [
      { id: 'persian', words: ['قورمه‌سبزی', 'فسنجان', 'چلوکباب', 'آبگوشت', 'کشک‌بادمجان'], near: ['simple'] },
      { id: 'fastfood', words: ['پیتزا', 'برگر', 'ساندویچ', 'هات‌داگ', 'سیب‌زمینی سرخ‌کرده'], near: ['snacks'] },
      { id: 'breakfast', words: ['املت', 'نان‌وپنیر', 'حلیم', 'عدسی', 'عسل'], near: ['simple'] },
      { id: 'sweets', words: ['کیک', 'بستنی', 'دونات', 'شله‌زرد', 'حلوا'], near: ['snacks'] },
      { id: 'simple', words: ['کته', 'کوکو', 'ماکارونی', 'سوپ', 'کوفته'], near: ['persian'] },
      { id: 'snacks', words: ['چیپس', 'پفک', 'آجیل', 'ذرت بوداده', 'پاپ‌کورن'], near: ['fastfood'] }
    ]
  },
  {
    id: 'drink', name: 'نوشیدنی‌ها', icon: 'drink', groups: [
      { id: 'hot', words: ['چای', 'قهوه', 'اسپرسو', 'لاته', 'هات‌چاکلت'], near: ['dairy'] },
      { id: 'fizzy', words: ['نوشابه', 'ماءالشعیر', 'نوشیدنی انرژی‌زا', 'آب گازدار', 'لیموناد'], near: ['traditional'] },
      { id: 'dairy', words: ['شیر تازه', 'دوغ', 'آبدوغ‌خیار', 'شیر کاکائو', 'میلک‌شیک'], near: ['hot'] },
      { id: 'traditional', words: ['آبمیوه', 'شربت', 'خاکشیر', 'عرق نعنا', 'آبلیمو'], near: ['fizzy'] },
      { id: 'plain', words: ['آب معدنی', 'آب', 'چای سبز', 'دمنوش', 'شربت بیدمشک'], near: ['traditional'] },
      { id: 'coffeeshop', words: ['آمریکانو', 'موکا', 'ماکیاتو', 'چای سیاه', 'آیس‌کافی'], near: ['hot'] }
    ]
  },
  {
    id: 'animal', name: 'حیوانات', icon: 'animal', groups: [
      { id: 'predators', words: ['شیر', 'ببر', 'گرگ', 'خرس', 'روباه'], near: ['domestic'] },
      { id: 'domestic', words: ['گربه', 'سگ', 'اسب', 'گاو', 'گوسفند'], near: ['predators'] },
      { id: 'birds', words: ['عقاب', 'جغد', 'طوطی', 'گنجشک', 'کبوتر'], near: ['reptiles'] },
      { id: 'sea', words: ['کوسه', 'دلفین', 'نهنگ', 'خرچنگ', 'ماهی قرمز'], near: ['reptiles'] },
      { id: 'reptiles', words: ['مار', 'لاک‌پشت', 'قورباغه', 'کروکودیل', 'سوسمار'], near: ['birds'] },
      { id: 'wild-others', words: ['فیل', 'زرافه', 'میمون', 'خرگوش', 'پنگوئن'], near: ['predators'] }
    ]
  },
  {
    id: 'job', name: 'مشاغل', icon: 'job', groups: [
      { id: 'medical', words: ['پزشک', 'پرستار', 'دندان‌پزشک', 'داروساز', 'فیزیوتراپیست'], near: ['services'] },
      { id: 'education', words: ['معلم', 'استاد دانشگاه', 'مربی', 'مشاور', 'کتابدار'], near: ['office'] },
      { id: 'technical', words: ['مکانیک', 'برق‌کار', 'لوله‌کش', 'نجار', 'جوشکار'], near: ['services'] },
      { id: 'art-media', words: ['خواننده', 'بازیگر', 'عکاس', 'روزنامه‌نگار', 'کارگردان'], near: ['office'] },
      { id: 'services', words: ['آرایشگر', 'گارسون', 'نانوا', 'آشپز', 'پلیس'], near: ['medical'] },
      { id: 'office', words: ['خلبان', 'وکیل', 'حسابدار', 'کشاورز', 'آتش‌نشان'], near: ['education'] }
    ]
  },
  {
    id: 'vehicle', name: 'وسایل نقلیه', icon: 'vehicle', groups: [
      { id: 'city', words: ['ماشین', 'تاکسی', 'اتوبوس', 'مترو', 'اسکوتر'], near: ['rail'] },
      { id: 'two-wheel', words: ['دوچرخه', 'موتورسیکلت', 'سه‌چرخه', 'اسکیت‌برد'], near: ['city'] },
      { id: 'heavy', words: ['کامیون', 'وانت', 'تراکتور', 'لودر', 'ون'], near: ['emergency'] },
      { id: 'emergency', words: ['آمبولانس', 'ماشین آتش‌نشانی', 'گشت پلیس'], near: ['heavy'] },
      { id: 'air', words: ['هواپیما', 'هلیکوپتر', 'بالن', 'گلایدر', 'جنگنده'], near: ['sea'] },
      { id: 'sea', words: ['کشتی اقیانوس‌پیما', 'قایق', 'لنج', 'قایق بادی', 'زیردریایی'], near: ['air'] },
      { id: 'rail', words: ['قطار', 'ترام', 'لوکوموتیو', 'واگن'], near: ['city'] }
    ]
  },
  {
    id: 'tech', name: 'تکنولوژی', icon: 'tech', groups: [
      { id: 'computing', words: ['موبایل', 'لپ‌تاپ', 'تبلت', 'رایانه', 'کیبورد'], near: ['accessories'] },
      { id: 'av', words: ['تلویزیون', 'هدفون', 'اسپیکر', 'میکروفن', 'دوربین'], near: ['accessories'] },
      { id: 'accessories', words: ['شارژر', 'پاوربانک', 'ریموت', 'فلش', 'مودم'], near: ['computing'] },
      { id: 'smart', words: ['ربات', 'ساعت هوشمند', 'چاپگر', 'لیزر', 'پهپاد'], near: ['computing'] },
      { id: 'peripherals', words: ['مانیتور', 'جوی‌استیک', 'اسکنر', 'وبکم', 'پروژکتور'], near: ['av'] },
      { id: 'gadgets', words: ['آداپتور', 'کابل', 'هارد اکسترنال', 'سی‌دی', 'مودم همراه'], near: ['accessories'] }
    ]
  },
  {
    id: 'sport', name: 'ورزش‌ها', icon: 'sport', groups: [
      { id: 'ball-team', words: ['فوتبال', 'والیبال', 'بسکتبال', 'هندبال', 'واترپلو'], near: ['racket'] },
      { id: 'combat', words: ['کاراته', 'تکواندو', 'جودو', 'بوکس', 'کشتی'], near: ['strength'] },
      { id: 'water', words: ['شنا', 'شیرجه', 'قایق‌رانی', 'اسکی روی آب', 'موج‌سواری'], near: ['ball-team'] },
      { id: 'mountain-winter', words: ['اسکی', 'اسنوبورد', 'کوه‌نوردی', 'سنگ‌نوردی', 'سورتمه‌سواری'], near: ['strength'] },
      { id: 'racket', words: ['تنیس', 'پینگ‌پنگ', 'بدمینتون', 'اسکواش', 'گلف'], near: ['ball-team'] },
      { id: 'strength', words: ['وزنه‌برداری', 'ژیمناستیک', 'ماراتن', 'اسکیت‌سواری', 'پارکور'], near: ['combat'] }
    ]
  },
  {
    id: 'game', name: 'بازی‌ها', icon: 'game', groups: [
      { id: 'board-classic', words: ['شطرنج', 'منچ', 'مارپله', 'تخته‌نرد', 'دومینو'], near: ['cards'] },
      { id: 'cards', words: ['پاسور', 'حکم', 'یونو', 'پوکر', 'بلک‌جک', 'شلم'], near: ['board-classic'] },
      { id: 'video', words: ['فیفا', 'پابجی', 'ماینکرفت', 'تتریس', 'پکمن', 'کانتر'], near: ['puzzle'] },
      { id: 'kids', words: ['هفت‌سنگ', 'وسطی', 'الک‌دولک', 'گرگم‌به‌هوا', 'لی‌لی', 'قایم‌باشک', 'دوز'], near: ['puzzle'] },
      { id: 'puzzle', words: ['پازل', 'جدول', 'سودوکو', 'مکعب روبیک', 'کلمات متقاطع', 'پانتومیم'], near: ['video'] }
    ]
  },
  {
    id: 'nature', name: 'طبیعت', icon: 'nature', groups: [
      { id: 'land', words: ['کوه', 'تپه', 'دره', 'دشت', 'بیابان'], near: ['geo'] },
      { id: 'water-bodies', words: ['رودخانه', 'دریاچه', 'آبشار', 'دریا', 'تالاب'], near: ['weather'] },
      { id: 'plants', words: ['جنگل', 'مرغزار', 'نخلستان', 'مزرعه', 'چمنزار'], near: ['land'] },
      { id: 'events', words: ['آتشفشان', 'سیل', 'طوفان', 'رعد و برق', 'زلزله'], near: ['weather'] },
      { id: 'weather', words: ['باران', 'برف', 'مه', 'ابر', 'تگرگ'], near: ['water-bodies'] },
      { id: 'geo', words: ['غار', 'صخره', 'چشمه', 'آب‌گرم', 'معدن'], near: ['land'] }
    ]
  },
  {
    id: 'clothing', name: 'پوشاک', icon: 'clothing', groups: [
      { id: 'top', words: ['پیراهن', 'تی‌شرت', 'سویشرت', 'هودی', 'ژاکت'], near: ['outer'] },
      { id: 'bottom', words: ['شلوار', 'شلوارک', 'دامن', 'جین', 'لگ'], near: ['top'] },
      { id: 'outer', words: ['کت', 'کاپشن', 'پالتو', 'بارانی', 'پونچو'], near: ['top'] },
      { id: 'head-neck', words: ['کلاه', 'روسری', 'شال', 'مقنعه', 'شالگردن'], near: ['accessories'] },
      { id: 'feet', words: ['جوراب', 'کفش', 'کتانی', 'بوت', 'دمپا'], near: ['accessories'] },
      { id: 'accessories', words: ['دستکش', 'کمربند', 'عینک آفتابی', 'پاپیون', 'کروات'], near: ['head-neck'] }
    ]
  },
  {
    id: 'school', name: 'مدرسه', icon: 'school', groups: [
      { id: 'stationery', words: ['مداد', 'خودکار', 'پاک‌کن', 'تراش', 'خط‌کش'], near: ['class-tools'] },
      { id: 'class-tools', words: ['تخته', 'گچ', 'نیمکت', 'پرگار', 'گونیا', 'تخته‌پاک‌کن'], near: ['stationery'] },
      { id: 'exam', words: ['امتحان', 'نمره', 'کارنامه', 'تست', 'جزوه'], near: ['school-life'] },
      { id: 'school-life', words: ['زنگ تفریح', 'صبحگاه', 'تکلیف', 'کتاب درسی', 'دفتر'], near: ['exam'] },
      { id: 'bag-tools', words: ['کوله‌پشتی', 'جامدادی', 'گیره', 'چسب', 'قیچی'], near: ['stationery'] },
      { id: 'places-people', words: ['سرصفحه', 'ناظم', 'راهرو', 'بوفه', 'آبدارخانه'], near: ['school-life'] }
    ]
  },
  {
    id: 'historic', name: 'تاریخ و مکان‌های تاریخی', icon: 'historic', groups: [
      { id: 'ancient-sites', words: ['تخت‌جمشید', 'چغازنبیل', 'پاسارگاد', 'تخت‌سلیمان'], near: ['architecture'] },
      { id: 'architecture', words: ['کاخ', 'قلعه', 'مناره', 'گنبد', 'بادگیر', 'معبد'], near: ['old-infra'] },
      { id: 'old-infra', words: ['آب‌انبار', 'کاروان‌سرا', 'حمام قدیمی', 'بازار قدیمی', 'قنات'], near: ['architecture'] },
      { id: 'isfahan', words: ['میدان نقش‌جهان', 'سی‌وسه‌پل', 'پل خواجو', 'چهلستون', 'مسجد شیخ‌لطف‌الله'], near: ['shiraz-others'] },
      { id: 'shiraz-others', words: ['ارگ کریم‌خان', 'باغ ارم', 'باغ فین', 'برج قابوس', 'گنبد سلطانیه'], near: ['isfahan'] },
      { id: 'artifacts', words: ['کتیبه', 'سنگ‌نگاره', 'سفال', 'سکهٔ قدیمی', 'ابزار سنگی'], near: ['ancient-sites'] }
    ]
  },
  {
    id: 'character', name: 'شخصیت‌ها', icon: 'character', groups: [
      { id: 'poets', words: ['حافظ', 'سعدی', 'فردوسی', 'مولانا', 'خیام'], near: ['legends'] },
      { id: 'historical', words: ['کوروش', 'داریوش', 'امیرکبیر', 'نادرشاه', 'کاوه آهنگر'], near: ['legends'] },
      { id: 'fiction-foreign', words: ['هری‌پاتر', 'شرلوک‌هلمز', 'پینوکیو', 'سوپرمن', 'بتمن'], near: ['cartoon'] },
      { id: 'legends', words: ['رستم', 'سهراب', 'آرش', 'سیاوش', 'سیمرغ'], near: ['poets'] },
      { id: 'cartoon', words: ['تام و جری', 'میکی‌ماوس', 'باب‌اسفنجی', 'هالک', 'مرد عنکبوتی'], near: ['fiction-foreign'] },
      { id: 'scientists', words: ['ادیسون', 'انیشتین', 'نیوتن', 'داوینچی', 'گراهام‌بل'], near: ['historical'] }
    ]
  },
  {
    id: 'everyday', name: 'وسایل روزمره', icon: 'everyday', groups: [
      { id: 'hygiene', words: ['مسواک', 'خمیردندان', 'شامپو', 'صابون', 'شانه'], near: ['cleaning'] },
      { id: 'carry', words: ['کلید', 'کیف', 'جاسوئیچی', 'چتر', 'کارت بانکی'], near: ['shopping'] },
      { id: 'cleaning', words: ['اسفنج', 'دستمال', 'حوله', 'لیف', 'سطل'], near: ['hygiene'] },
      { id: 'tableware', words: ['قاشق', 'چنگال', 'چاقو', 'لیوان', 'بشقاب'], near: ['cleaning'] },
      { id: 'shopping', words: ['سبد', 'اسکناس', 'سکه', 'فاکتور', 'بارکد'], near: ['carry'] },
      { id: 'misc', words: ['باتری', 'چراغ‌قوه', 'سوزن', 'دکمه', 'ساعت دیواری'], near: ['carry'] }
    ]
  }
];

/* ---------- دادهٔ مسطح و ابزارها ---------- */

export interface WordDef {
  id: string;       // مثل «food.fastfood.0»
  word: string;
  cat: WordCategoryId;
  group: string;
}

export const WORDS: WordDef[] = WORD_CATEGORIES.flatMap((c) =>
  c.groups.flatMap((g) =>
    g.words.map((word, i) => ({ id: `${c.id}.${g.id}.${i}`, word, cat: c.id, group: g.id }))
  )
);

export function wordById(id: string): WordDef | undefined {
  return WORDS.find((w) => w.id === id);
}

export function wordCategoryName(id: string): string {
  return WORD_CATEGORIES.find((c) => c.id === id)?.name ?? id;
}

export function wordCategoryIds(): WordCategoryId[] {
  return WORD_CATEGORIES.map((c) => c.id);
}

export const ALL_WORD_IDS: string[] = WORDS.map((w) => w.id);

/**
 * تعداد کلمه‌های موجود در دسته‌های فعال (خالی = همه) — برای ریست فهرست کلمه‌های استفاده‌شده
 */
export function wordPoolSize(catIds: string[] | null): number {
  if (!catIds || catIds.length === 0) return WORDS.length;
  const allowed = new Set(catIds);
  return WORDS.filter((w) => allowed.has(w.cat)).length;
}

/**
 * انتخاب تصادفی کلمه از دسته‌های فعال (خالی = همه دسته‌ها).
 * قانون تکرارنشدن: کلمه‌های داخل exclude (اعلام‌شده‌های قبلی) تا وقتی گزینهٔ تازه هست انتخاب نمی‌شوند؛
 * فقط وقتی بانک دسته تمام شود اجازهٔ تکرار دارد.
 */
export function pickWord(catIds: string[] | null, rng: Rng, exclude: string[] = []): WordDef | null {
  let pool = WORDS;
  if (catIds && catIds.length > 0) {
    const allowed = new Set(catIds);
    const filtered = WORDS.filter((w) => allowed.has(w.cat));
    if (filtered.length > 0) pool = filtered;
  }
  const fresh = pool.filter((w) => !exclude.includes(w.id));
  const finalPool = fresh.length > 0 ? fresh : pool;
  return finalPool[Math.floor(rng() * finalPool.length)] ?? null;
}

/**
 * کلمهٔ جاسوس بر اساس سطح سختی (قانون ۲):
 * — hard: از همان خوشهٔ کلمهٔ اصلی (بسیار نزدیک) → تشخیص جاسوس سخت می‌شود
 * — medium: از خوشه‌های نزدیک همان دسته
 * — easy: از خوشه‌های دور همان دسته (مرتبط ولی کاملاً متفاوت)
 * خروجی هرگز برابر کلمهٔ اصلی نیست؛ جاسوس هرگز کلمهٔ اصلی را نمی‌بیند.
 */
export function pickSpyWord(main: WordDef, difficulty: Difficulty, rng: Rng): string {
  const cat = WORD_CATEGORIES.find((c) => c.id === main.cat);
  const mainGroup = cat?.groups.find((g) => g.id === main.group);
  const notMain = (list: string[]) => list.filter((w) => w !== main.word);
  const sameGroupWords = notMain(mainGroup?.words ?? []);
  const nearWords = notMain((cat?.groups ?? [])
    .filter((g) => g.id !== main.group && (mainGroup?.near?.includes(g.id) ?? false))
    .flatMap((g) => g.words));
  const farWords = notMain((cat?.groups ?? [])
    .filter((g) => g.id !== main.group && !(mainGroup?.near?.includes(g.id) ?? false))
    .flatMap((g) => g.words));
  const catWords = notMain((cat?.groups ?? []).filter((g) => g.id !== main.group).flatMap((g) => g.words));
  const allWords = notMain(WORDS.map((w) => w.word));
  const pick = (pool: string[]): string =>
    pool.length > 0 ? pool[Math.floor(rng() * pool.length)] : '';
  if (difficulty === 'hard') return pick(sameGroupWords) || pick(nearWords) || pick(catWords) || pick(allWords);
  if (difficulty === 'medium') return pick(nearWords) || pick(catWords) || pick(allWords);
  return pick(farWords) || pick(catWords) || pick(allWords); // easy
}
