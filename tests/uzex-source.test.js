'use strict';

/**
 * xarid.uzex.uz adapteri — moslashtirish mantiqi.
 *
 * Tarmoqqa chiqmaydi: portal API si o'zini tanitgan mijozlarni rad
 * etadi, shuning uchun bu yerda faqat xom yozuvni TenderMind
 * shakliga o'tkazish tekshiriladi. Ruxsat olingan kunda kod tayyor
 * turishi uchun.
 */

const test = require('node:test');
const assert = require('node:assert');
const uzex = require('../services/ingestion/sources/uzex');

// ── Hudud ─────────────────────────────────────────────────────────────
test('Hudud to\'liq nomdan aniqlanadi', () => {
  // Portal qisqa kalit emas, to'liq nom beradi
  assert.strictEqual(uzex.regionKey('Сырдарьинская область'), 'sirdaryo');
  assert.strictEqual(uzex.regionKey('город Ташкент'), 'toshkent');
  assert.strictEqual(uzex.regionKey('Ташкентская область'), 'toshkent');
  assert.strictEqual(uzex.regionKey('Республика Каракалпакстан'), 'qoraqalpogiston');
  assert.strictEqual(uzex.regionKey('Ферганская область'), 'fargona');
});

test('Noma\'lum hudud "boshqa" bo\'ladi, taxmin qilinmaydi', () => {
  assert.strictEqual(uzex.regionKey('Неизвестный регион'), 'boshqa');
  assert.strictEqual(uzex.regionKey(''), 'boshqa');
  assert.strictEqual(uzex.regionKey(null), 'boshqa');
});

// ── Soha ──────────────────────────────────────────────────────────────
test('Soha kategoriya nomidan aniqlanadi', () => {
  assert.strictEqual(uzex.sectorKey('Компьютерное оборудование'), 'it');
  assert.strictEqual(uzex.sectorKey('Строительные материалы'), 'qurilish');
  assert.strictEqual(uzex.sectorKey('Медицинское оборудование'), 'tibbiyot');
  assert.strictEqual(uzex.sectorKey('Продукты питания'), 'oziq');
});

test('Mos kelmagan kategoriya "boshqa" bo\'ladi', () => {
  // Soxta tasniflashdan ko'ra halol "boshqa" yaxshiroq
  assert.strictEqual(uzex.sectorKey('Изделия резиновые и пластмассовые'), 'boshqa');
  assert.strictEqual(uzex.sectorKey(undefined), 'boshqa');
});

// ── Yozuvni o'tkazish ─────────────────────────────────────────────────
const sampleLot = {
  id: 411697,
  display_no: '26111007411697',
  category_name: 'Компьютерное оборудование',
  customer_name: 'Жиззах бош насос станцияси бошкармаси',
  start_cost: 11695000.0,
  min_cost: 10057700.0,
  start_date: '2026-08-13T15:26:28',
  end_date: '2026-08-28T10:48:00',
  region_name: 'Сырдарьинская область',
  district_name: 'Хавасский район',
  delivery_days: 7,
  description: 'malumot uchun 993029807',
  phone: '725121404',
  email: null,
  js_details: [{ product_name: 'Noutbuk', amount: 12, measure_name: 'dona' }],
  js_conditions: [{ condition_name: 'Mahsulot yetkazib berish manzili' }],
};

test('Lot tafsiloti TenderMind yozuviga o\'tadi', () => {
  const raw = uzex.toRawRecord(sampleLot);

  assert.strictEqual(raw.id, 'uzex-411697');
  assert.strictEqual(raw.sourceId, '26111007411697', 'manba raqami saqlanadi — dedupe shunga tayanadi');
  assert.strictEqual(raw.title, 'Noutbuk', 'sarlavha mahsulot nomidan');
  assert.strictEqual(raw.org, 'Жиззах бош насос станцияси бошкармаси');
  assert.strictEqual(raw.category, 'it');
  assert.strictEqual(raw.region, 'sirdaryo');
  assert.strictEqual(raw.budget, 11695000);
  assert.strictEqual(raw.deadline, '2026-08-28', 'sana YYYY-MM-DD bo\'lishi shart');
  assert.strictEqual(raw.postedDate, '2026-08-13');
  assert.ok(raw.sourceUrl.includes('411697'), 'manbaga qaytish havolasi bo\'lsin');
});

test('Miqdor va yetkazib berish tavsifga tushadi', () => {
  const raw = uzex.toRawRecord(sampleLot);
  assert.ok(raw.description.includes('12 dona'));
  assert.ok(raw.description.includes('7 kun'));
});

test('Shartlar talablarga aylanadi', () => {
  const raw = uzex.toRawRecord(sampleLot);
  assert.deepStrictEqual(raw.requirements, ['Mahsulot yetkazib berish manzili']);
});

test('Sarlavhasiz lot ham yozuv beradi', () => {
  // Mahsulot ro'yxati bo'sh bo'lsa ham yozuv yo'qolmasin
  const raw = uzex.toRawRecord({ ...sampleLot, js_details: [], category_name: null });
  assert.ok(raw.title.includes('26111007411697'));
});

test('Yaroqsiz sana bo\'sh qoladi, "Invalid Date" emas', () => {
  const raw = uzex.toRawRecord({ ...sampleLot, end_date: 'buzuq' });
  assert.strictEqual(raw.deadline, '');
});

test('Bir nechta mahsulot bo\'lsa soni aytiladi', () => {
  const raw = uzex.toRawRecord({
    ...sampleLot,
    js_details: [
      { product_name: 'Noutbuk', amount: 12 },
      { product_name: 'Printer', amount: 3 },
    ],
  });
  assert.ok(raw.description.includes('2 ta turdagi'));
});

// ── Reyestr ───────────────────────────────────────────────────────────
test('Adapter manbalar reyestriga qo\'shilgan', () => {
  const sources = require('../services/ingestion/sources');
  assert.ok(sources.list().includes('uzex'));
  assert.strictEqual(typeof sources.get('uzex').fetchRecords, 'function');
});
