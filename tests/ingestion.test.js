'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { normalizeRecord, parseAmount, parseDate, contentHash } = require('../services/ingestion/normalize');
const { parseRobots, isAllowedByRules, selectGroup, pathMatches } = require('../services/ingestion/robots');
const { parseCsv } = require('../services/ingestion/sources/file');

// ── Normalizatsiya ───────────────────────────────────────────────────
test('parseAmount — turli formatlarni o\'qiydi', () => {
  assert.strictEqual(parseAmount('4 200 000 000'), 4200000000);
  assert.strictEqual(parseAmount('4,200,000,000'), 4200000000);
  assert.strictEqual(parseAmount("450 000 000 so'm"), 450000000);
  assert.strictEqual(parseAmount(650000000), 650000000);
  assert.strictEqual(parseAmount('bo\'sh'), null);
  assert.strictEqual(parseAmount(''), null);
  assert.strictEqual(parseAmount(-5), null);
});

test('parseDate — ISO va DD.MM.YYYY', () => {
  assert.strictEqual(parseDate('2027-03-15'), '2027-03-15');
  assert.strictEqual(parseDate('15.03.2027'), '2027-03-15');
  assert.strictEqual(parseDate('5/3/2027'), '2027-03-05');
  assert.strictEqual(parseDate('nomalum'), null);
  assert.strictEqual(parseDate(''), null);
});

test('Normalizatsiya — to\'liq yozuvni qabul qiladi', () => {
  const result = normalizeRecord({
    sourceId: 'X-1', title: 'Parta yetkazib berish', org: 'Hokimiyat',
    category: 'ta\'lim', region: 'Toshkent', budget: '450 000 000', deadline: '2027-03-15',
  }, { sourceName: 'test' });

  assert.ok(result.ok);
  assert.strictEqual(result.tender.soha, 'talim');
  assert.strictEqual(result.tender.hudud, 'toshkent');
  assert.strictEqual(result.tender.budgetRaw, 450000000);
  assert.strictEqual(result.tender.sourceName, 'test');
});

test('Normalizatsiya — soxta raqam QO\'YMAYDI', () => {
  const { tender } = normalizeRecord({
    sourceId: 'X-1', title: 'Test', org: 'Org', budget: '1000000', deadline: '2027-01-01',
  }, { sourceName: 'test' });

  // Bu qiymatlar manbada yo'q — o'ylab topilmasligi kerak
  assert.strictEqual(tender.probability, null);
  assert.strictEqual(tender.competitors, null);
  // Va tashqi yozuv avtomatik "tasdiqlangan" bo'lib qolmasligi kerak
  assert.strictEqual(tender.isVerified, false);
  assert.strictEqual(tender.isDemo, false);
});

test('Normalizatsiya — majburiy maydon yetishmasa rad etadi', () => {
  const result = normalizeRecord({ title: 'Faqat nomi' }, { sourceName: 'test' });
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('org')));
  assert.ok(result.errors.some(e => e.includes('byudjet')));
  assert.ok(result.errors.some(e => e.includes('sourceId')));
});

test('Normalizatsiya — lot bo\'lmasa bittasini yaratadi', () => {
  const { tender } = normalizeRecord({
    sourceId: 'X-2', title: 'Yagona ish', org: 'Org', budget: '5000000', deadline: '2027-05-01',
  }, { sourceName: 'test' });

  assert.strictEqual(tender.lots.length, 1);
  assert.strictEqual(tender.lots[0].lotNumber, 1);
  assert.strictEqual(tender.lots[0].startPrice, 5000000);
});

test('Normalizatsiya — bir nechta lotni saqlaydi', () => {
  const { tender } = normalizeRecord({
    sourceId: 'X-3', title: 'Mebel', org: 'Org', budget: '450000000', deadline: '2027-03-15',
    lots: [
      { lotNumber: 1, title: 'Partalar', startPrice: '270 000 000', quantity: 300, unit: 'dona' },
      { lotNumber: 2, title: 'Stullar', startPrice: '180 000 000', quantity: 600, unit: 'dona' },
    ],
  }, { sourceName: 'test' });

  assert.strictEqual(tender.lots.length, 2);
  assert.strictEqual(tender.lots[0].startPrice, 270000000);
  assert.strictEqual(tender.lots[1].quantity, 600);
  // Har bir lotda o'z sourceId si — dedupe uchun
  assert.notStrictEqual(tender.lots[0].sourceId, tender.lots[1].sourceId);
});

test('contentHash — mazmun o\'zgarsa o\'zgaradi, vaqt tamg\'asidan mustaqil', () => {
  const base = { title: 'A', org: 'B', description: '', budgetRaw: 100, deadline: '2027-01-01', status: 'active', lots: [] };
  assert.strictEqual(contentHash(base), contentHash({ ...base }));
  assert.notStrictEqual(contentHash(base), contentHash({ ...base, budgetRaw: 200 }));
  assert.strictEqual(contentHash(base), contentHash({ ...base, createdAt: new Date() }));
});

// ── robots.txt ───────────────────────────────────────────────────────
test('robots.txt — Disallow qoidasi hurmat qilinadi', () => {
  const rules = parseRobots(`
User-agent: *
Disallow: /Trade/Offer
Disallow: /Search/Index
Allow: /
  `);
  const group = selectGroup(rules, 'TenderMind-Bot/1.0');

  assert.strictEqual(isAllowedByRules(group, '/Trade/Offer'), false);
  assert.strictEqual(isAllowedByRules(group, '/Search/Index'), false);
  assert.strictEqual(isAllowedByRules(group, '/pages/about'), true);
});

test('robots.txt — eng uzun mos qoida g\'olib', () => {
  const rules = parseRobots(`
User-agent: *
Disallow: /api
Allow: /api/public
  `);
  const group = selectGroup(rules, 'TenderMind-Bot');

  assert.strictEqual(isAllowedByRules(group, '/api/private'), false);
  assert.strictEqual(isAllowedByRules(group, '/api/public/list'), true);
});

test('robots.txt — bizga atalgan guruh ustunroq', () => {
  const rules = parseRobots(`
User-agent: *
Disallow: /

User-agent: tendermind-bot
Allow: /
  `);
  const group = selectGroup(rules, 'TenderMind-Bot/1.0 (+https://tendermind.uz/bot)');
  assert.strictEqual(isAllowedByRules(group, '/anything'), true);
});

test('robots.txt — shablon belgilari', () => {
  assert.ok(pathMatches('/private/*', '/private/data'));
  assert.ok(pathMatches('/*.pdf$', '/files/report.pdf'));
  assert.ok(!pathMatches('/*.pdf$', '/files/report.pdf.html'));
});

// ── CSV ──────────────────────────────────────────────────────────────
test('CSV — qo\'shtirnoq ichidagi vergul buzilmaydi', () => {
  const rows = parseCsv(
    'sourceId,title,budget\n'
    + 'X-1,"Parta, stul va doska",450000000\n'
    + 'X-2,Reaktivlar,180000000'
  );

  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows[0].title, 'Parta, stul va doska');
  assert.strictEqual(rows[1].budget, '180000000');
});

test('CSV — qochirilgan qo\'shtirnoq', () => {
  const rows = parseCsv('a,b\n"u ""kotirovka"" deydi",2');
  assert.strictEqual(rows[0].a, 'u "kotirovka" deydi');
});
