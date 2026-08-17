'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { GLOSSARY, findTerm } = require('../data/glossary');
const { STEPS, TOTAL_STEPS } = require('../data/onboarding');

test('Lug\'atda asosiy atamalar bor', () => {
  const terms = GLOSSARY.map(t => t.term.toLowerCase());
  for (const kerakli of ['tender', 'lot', 'kotirovka', 'qqs', 'vakolatnoma']) {
    assert.ok(terms.some(t => t.includes(kerakli)), `"${kerakli}" atamasi yo'q`);
  }
});

test('Har bir atamada qisqa ta\'rif va misol bor', () => {
  for (const entry of GLOSSARY) {
    assert.ok(entry.short && entry.short.length > 20, `${entry.term}: ta'rif juda qisqa`);
    assert.ok(entry.example && entry.example.length > 20, `${entry.term}: misol yo'q`);
    assert.ok(entry.aliases.length > 0, `${entry.term}: alias yo'q`);
  }
});

test('findTerm — qo\'shimchali shakllarni ham topadi', () => {
  assert.strictEqual(findTerm('lot').term, 'Lot');
  assert.strictEqual(findTerm('lotga').term, 'Lot');
  assert.strictEqual(findTerm('LOTLARNI').term, 'Lot');
  assert.strictEqual(findTerm('tenderda').term, 'Tender');
  assert.strictEqual(findTerm('bunday-soz-yoq'), null);
});

test('Alias larda takror yo\'q — biri ikkinchisini bosib ketmasligi kerak', () => {
  const seen = new Map();
  for (const entry of GLOSSARY) {
    for (const alias of entry.aliases) {
      const key = alias.toLowerCase();
      assert.ok(!seen.has(key), `"${alias}" ikki atamada: ${seen.get(key)} va ${entry.term}`);
      seen.set(key, entry.term);
    }
  }
});

test('Yo\'riqnoma qadamlari to\'liq va tartibli', () => {
  assert.strictEqual(STEPS.length, TOTAL_STEPS);
  assert.ok(STEPS.length >= 5, 'kamida 5 qadam bo\'lishi kerak');

  STEPS.forEach((step, i) => {
    assert.strictEqual(step.order, i + 1, `${step.id}: tartib raqami noto'g'ri`);
    assert.ok(step.title, `${step.id}: sarlavha yo'q`);
    assert.ok(step.body.length > 0, `${step.id}: matn yo'q`);
    assert.ok(step.keyPoint, `${step.id}: asosiy xulosa yo'q`);
  });
});

test('Qadam id lari takrorlanmaydi', () => {
  const ids = STEPS.map(s => s.id);
  assert.strictEqual(new Set(ids).size, ids.length);
});

test('Yo\'riqnoma "lot" tushunchasini alohida tushuntiradi', () => {
  const lotStep = STEPS.find(s => s.id === 'lot-nima');
  assert.ok(lotStep, 'lot haqida qadam bo\'lishi shart — bu loyihaning yadro g\'oyasi');
  assert.ok(lotStep.body.join(' ').toLowerCase().includes('lot'));
});
