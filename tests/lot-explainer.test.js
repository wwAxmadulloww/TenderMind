'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { buildBasicExplanation, analyzeFit } = require('../services/lotExplainer');

const inDays = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

const lot = {
  title: 'Maktablar uchun parta yetkazib berish',
  description: '500 ta o\'quvchi partasi',
  quantity: 500,
  unit: 'dona',
  startPrice: 450000000,
  deadline: inDays(20),
  requirements: ['3+ yil tajriba', 'ISO sertifikati'],
};
const tender = { org: 'Toshkent shahar hokimiyati', soha: 'talim', hudud: 'toshkent' };

test('AI ulanmagan bo\'lsa ham tushuntirish to\'liq yaratiladi', () => {
  const e = buildBasicExplanation(lot, tender);
  // Mahsulotning yadrosi — AI siz ham ishlashi shart
  assert.ok(e.nima.includes('500 dona'));
  assert.ok(e.kim.length > 0);
  assert.ok(e.hujjatlar.length >= 3);
  assert.ok(e.pul.includes('450'));
  assert.ok(e.muddat.includes('20 kun'));
  assert.ok(e.xulosa.includes('Toshkent shahar hokimiyati'));
});

test('Muddati tugagan lot — tushuntirishda ochiq aytiladi', () => {
  const e = buildBasicExplanation({ ...lot, deadline: inDays(-5) }, tender);
  assert.ok(e.muddat.includes('tugagan'));
  assert.ok(e.xulosa.includes('muddat tugagan'));
});

test('Moslik — tajriba yetarli bo\'lsa mos deb baholanadi', () => {
  const fit = analyzeFit(lot, tender, { experience: 5, soha: 'talim', hudud: 'toshkent' });
  assert.strictEqual(fit.verdict, 'mos');
  assert.strictEqual(fit.blockers.length, 0);
  assert.ok(fit.reasons.some(r => r.includes('sohangizga')));
});

test('Moslik — tajriba yetmasa to\'siq sifatida ko\'rsatiladi', () => {
  const fit = analyzeFit(lot, tender, { experience: 1 });
  assert.strictEqual(fit.verdict, 'mos_emas');
  assert.ok(fit.blockers.some(b => b.includes('Tajriba talabi 3 yil')));
});

test('Moslik — muddat tugagan bo\'lsa to\'siq', () => {
  const fit = analyzeFit({ ...lot, deadline: inDays(-1) }, tender, { experience: 10 });
  assert.strictEqual(fit.verdict, 'mos_emas');
  assert.ok(fit.blockers.some(b => b.includes('Muddat tugagan')));
});

test('Moslik — vaqt kam bo\'lsa shoshilinch deb belgilanadi', () => {
  const fit = analyzeFit({ ...lot, deadline: inDays(2) }, tender, { experience: 10 });
  assert.strictEqual(fit.verdict, 'shoshilinch');
});

test('Moslik — litsenziya talabi ogohlantirish sifatida chiqadi', () => {
  const fit = analyzeFit(lot, tender, { experience: 10 });
  assert.ok(fit.reasons.some(r => r.includes('Litsenziya')));
});
