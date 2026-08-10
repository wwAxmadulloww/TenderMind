'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { normalizeUzbekPhone, validators, validate } = require('../validators');

test('normalizeUzbekPhone — 9 xonali raqamni to\'liq formatga keltiradi', () => {
  assert.strictEqual(normalizeUzbekPhone('901234567'), '+998901234567');
  assert.strictEqual(normalizeUzbekPhone('88 123 45 67'), '+998881234567');
  assert.strictEqual(normalizeUzbekPhone('771234567'), '+998771234567');
  assert.strictEqual(normalizeUzbekPhone('331234567'), '+998331234567');
  assert.strictEqual(normalizeUzbekPhone('201234567'), '+998201234567');
});

test('normalizeUzbekPhone — 998 prefiksli variantlar', () => {
  assert.strictEqual(normalizeUzbekPhone('+998901234567'), '+998901234567');
  assert.strictEqual(normalizeUzbekPhone('998901234567'), '+998901234567');
  assert.strictEqual(normalizeUzbekPhone('+998 90 123 45 67'), '+998901234567');
});

test('normalizeUzbekPhone — yaroqsiz kiritmalar', () => {
  assert.strictEqual(normalizeUzbekPhone(null), '');
  assert.strictEqual(normalizeUzbekPhone(undefined), '');
  assert.strictEqual(normalizeUzbekPhone(12345), '');
});

test('validators.phone — aynan 9 raqam talab qiladi', () => {
  assert.ok(validators.phone('+998901234567'));
  assert.ok(validators.phone('+998881234567'));
  assert.ok(!validators.phone('+99890123456'));    // 8 ta raqam
  assert.ok(!validators.phone('+9989012345678'));  // 10 ta raqam
  assert.ok(!validators.phone('901234567'));       // prefiksiz
});

test('validators.password — bo\'shliqsiz, kamida 6 belgi', () => {
  assert.ok(validators.password('abc123'));
  assert.ok(!validators.password('abc12'));
  assert.ok(!validators.password('abc 123'));
});

test('validate — majburiy maydon yetishmasa xato qaytaradi', () => {
  const rules = {
    phone: { required: true, format: 'phone', errorMsg: 'Telefon xato' },
    name: { required: true, format: 'name', errorMsg: 'Ism xato' },
  };
  const errors = validate({ phone: '+998901234567' }, rules);
  assert.ok(errors);
  assert.ok(errors.name);
  assert.ok(!errors.phone);
});

test('validate — hammasi to\'g\'ri bo\'lsa null qaytaradi', () => {
  const rules = { phone: { required: true, format: 'phone' } };
  assert.strictEqual(validate({ phone: '+998901234567' }, rules), null);
});
