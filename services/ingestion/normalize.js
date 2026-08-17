'use strict';

const crypto = require('crypto');

/**
 * Tashqi manbadan kelgan yozuvni ichki formatga keltirish va tekshirish.
 *
 * Asosiy tamoyil: TAXMIN QILINMAYDI. Manbada bo'lmagan maydon bo'sh
 * qoladi — o'ylab topilgan "g'alaba ehtimoli" yoki "raqiblar soni"
 * qo'yilmaydi. Demo ma'lumotdagi soxta raqamlar aynan shu sababdan
 * muammo bo'lgan.
 */

const SOHA_MAP = {
  it: 'it', 'axborot texnologiyalari': 'it', 'информационные технологии': 'it',
  qurilish: 'qurilish', 'строительство': 'qurilish',
  tibbiyot: 'tibbiyot', 'meditsina': 'tibbiyot', 'медицина': 'tibbiyot',
  'oziq-ovqat': 'oziq', oziq: 'oziq', 'продукты питания': 'oziq',
  transport: 'transport', 'транспорт': 'transport',
  talim: 'talim', "ta'lim": 'talim', 'образование': 'talim',
  ekologiya: 'ekologiya', 'экология': 'ekologiya',
  'qishloq xo\'jaligi': 'qishloq', qishloq: 'qishloq', 'сельское хозяйство': 'qishloq',
};

const HUDUD_MAP = {
  toshkent: 'toshkent', ташкент: 'toshkent', tashkent: 'toshkent',
  samarqand: 'samarqand', самарканд: 'samarqand',
  buxoro: 'buxoro', бухара: 'buxoro',
  andijon: 'andijon', андижан: 'andijon',
  namangan: 'namangan', наманган: 'namangan',
  "farg'ona": 'fargona', fargona: 'fargona', фергана: 'fargona',
  qashqadaryo: 'qashqadaryo', кашкадарья: 'qashqadaryo',
  surxondaryo: 'surxondaryo', сурхандарья: 'surxondaryo',
  xorazm: 'xorazm', хорезм: 'xorazm',
  navoiy: 'navoiy', навои: 'navoiy',
  jizzax: 'jizzax', джизак: 'jizzax',
  sirdaryo: 'sirdaryo', сырдарья: 'sirdaryo',
  qoraqalpogiston: 'qoraqalpogiston', каракалпакстан: 'qoraqalpogiston',
};

function mapValue(map, value, fallback) {
  const key = String(value || '').trim().toLowerCase();
  return map[key] || fallback;
}

/**
 * Summani o'qish: "4 200 000 000", "4,200,000,000.00", "450000000 so'm".
 *
 * Qiyin joyi — vergul: u ming ajratgichi (4,200,000) ham, o'nlik ajratgichi
 * (1234,56) ham bo'lishi mumkin. Qoida: vergul o'nlik ajratgichi deb faqat
 * BITTA bo'lsa va undan keyin 3 tadan boshqa raqam kelsa hisoblanadi.
 */
function parseAmount(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? Math.round(value) : null;
  if (typeof value !== 'string') return null;

  const cleaned = value.replace(/[^\d.,]/g, '');
  if (!cleaned) return null;

  const commas = (cleaned.match(/,/g) || []).length;
  const dots = (cleaned.match(/\./g) || []).length;

  let normalized;
  if (commas === 1 && dots === 0 && !/,\d{3}$/.test(cleaned)) {
    normalized = cleaned.replace(',', '.');          // 1234,56 → o'nlik
  } else if (dots === 1 && commas > 0) {
    normalized = cleaned.replace(/,/g, '');          // 4,200,000.50 → inglizcha
  } else if (commas > 0 && dots > 1) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.');  // 4.200.000,50 → yevropacha
  } else {
    normalized = cleaned.replace(/,/g, '');          // ming ajratgichlari
  }

  const number = Number(normalized);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : null;
}

/**
 * Sanani o'qish.
 *
 * DD.MM.YYYY / DD/MM/YYYY shabloni `new Date()` dan OLDIN tekshiriladi:
 * JS "5/3/2027" ni amerikacha (3-may) deb o'qiydi, O'zbekistonda esa bu
 * 5-mart. Bundan tashqari sana UTC da quriladi — aks holda vaqt mintaqasi
 * natijani bir kunga surib yuboradi.
 */
function parseDate(value) {
  if (!value) return null;
  const text = String(value).trim();

  const dmy = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (dmy) {
    const [, d, m, y] = dmy;
    const day = Number(d);
    const month = Number(m);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
    return null;
  }

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
    .toISOString().slice(0, 10);
}

function clean(text, maxLength = 2000) {
  return String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

/**
 * Mazmun bo'yicha barmoq izi — yozuv o'zgarganini aniqlash uchun.
 * Faqat mazmunli maydonlar hisobga olinadi (vaqt tamg'alari emas).
 */
function contentHash(record) {
  const material = JSON.stringify([
    record.title, record.org, record.description,
    record.budgetRaw, record.deadline, record.status,
    (record.lots || []).map(l => [l.title, l.startPrice, l.deadline, l.quantity]),
  ]);
  return crypto.createHash('sha256').update(material).digest('hex').slice(0, 32);
}

/**
 * Xom yozuvni normallashtirish.
 * @returns {{ok: true, tender: object} | {ok: false, errors: string[]}}
 */
function normalizeRecord(raw, { sourceName = 'unknown' } = {}) {
  const errors = [];

  const title = clean(raw.title || raw.name, 500);
  if (!title) errors.push('title yo\'q');

  const org = clean(raw.org || raw.customer || raw.buyer, 300);
  if (!org) errors.push('org (buyurtmachi) yo\'q');

  const budgetRaw = parseAmount(raw.budgetRaw ?? raw.budget ?? raw.amount ?? raw.startPrice);
  if (!budgetRaw) errors.push('byudjet o\'qib bo\'lmadi');

  const deadline = parseDate(raw.deadline || raw.endDate || raw.closingDate);
  if (!deadline) errors.push('muddat o\'qib bo\'lmadi');

  const sourceId = clean(raw.sourceId || raw.id || raw.externalId, 120);
  if (!sourceId) errors.push('sourceId yo\'q — dedupe qilib bo\'lmaydi');

  if (errors.length) return { ok: false, errors, title: title || '(nomsiz)' };

  const lotsInput = Array.isArray(raw.lots) && raw.lots.length ? raw.lots : [{
    title, description: raw.description, startPrice: budgetRaw, deadline,
    quantity: raw.quantity, unit: raw.unit, requirements: raw.requirements,
  }];

  const lots = lotsInput.map((lot, index) => ({
    lotNumber: Number(lot.lotNumber) || index + 1,
    title: clean(lot.title || title, 500),
    description: clean(lot.description || raw.description, 2000),
    startPrice: parseAmount(lot.startPrice ?? lot.price ?? lot.amount) || budgetRaw,
    quantity: Number(lot.quantity) || null,
    unit: clean(lot.unit, 40),
    deliveryTerm: clean(lot.deliveryTerm || raw.deliveryTerm, 300),
    deliveryAddress: clean(lot.deliveryAddress || raw.address, 300),
    requirements: Array.isArray(lot.requirements)
      ? lot.requirements.map(r => clean(r, 300)).filter(Boolean)
      : [],
    deadline: parseDate(lot.deadline) || deadline,
    sourceId: clean(lot.sourceId || `${sourceId}-${index + 1}`, 140),
    sourceUrl: clean(lot.sourceUrl || raw.sourceUrl, 500),
  }));

  const tender = {
    title,
    org,
    soha: mapValue(SOHA_MAP, raw.soha || raw.category, 'boshqa'),
    hudud: mapValue(HUDUD_MAP, raw.hudud || raw.region, 'boshqa'),
    description: clean(raw.description, 2000),
    budgetRaw,
    budget: new Intl.NumberFormat('uz-UZ').format(budgetRaw),
    deadline,
    postedDate: parseDate(raw.postedDate || raw.publishedAt) || new Date().toISOString().slice(0, 10),
    status: ['active', 'urgent', 'closed', 'canceled'].includes(raw.status) ? raw.status : 'active',
    requirements: Array.isArray(raw.requirements)
      ? raw.requirements.map(r => clean(r, 300)).filter(Boolean)
      : [],
    contactEmail: clean(raw.contactEmail, 200),
    contactPhone: clean(raw.contactPhone, 60),
    tags: Array.isArray(raw.tags) ? raw.tags.map(t => clean(t, 50)).filter(Boolean).slice(0, 8) : [],

    sourceId,
    sourceUrl: clean(raw.sourceUrl || raw.url, 500),
    sourceName,

    // Tashqi manbadan kelgan yozuv DEMO emas, lekin hali TEKSHIRILMAGAN —
    // administrator ko'rib chiqqach isVerified true bo'ladi.
    isDemo: false,
    isVerified: false,

    // Bu qiymatlar manbada yo'q. Soxta raqam qo'yilmaydi.
    probability: null,
    competitors: null,

    lots,
  };

  tender.contentHash = contentHash(tender);
  return { ok: true, tender };
}

module.exports = { normalizeRecord, parseAmount, parseDate, contentHash, clean, SOHA_MAP, HUDUD_MAP };
