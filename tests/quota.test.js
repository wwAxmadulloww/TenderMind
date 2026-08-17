'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { User } = require('../db');

const today = () => new Date().toISOString().slice(0, 10);
const yesterday = () => new Date(Date.now() - 86400000).toISOString().slice(0, 10);

// Mongoose hujjatini ulanishsiz yaratish mumkin — metodlar sof mantiq.
const makeUser = (fields) => new User({
  name: 'Test', phone: '+998901234567', passwordHash: 'x', ...fields,
});

test('free tarif — kuniga 1 ta hujjat', () => {
  const user = makeUser({ plan: 'free' });
  assert.strictEqual(user.getPlanLimits().docPerDay, 1);
  assert.ok(user.canUse('doc'));

  user.aiDocUsedToday = 1;
  user.aiDocResetDate = today();
  assert.ok(!user.canUse('doc'), 'limit tugagandan keyin rad etilishi kerak');
});

test('yangi kun — limit avtomatik tiklanadi', () => {
  const user = makeUser({ plan: 'free', aiDocUsedToday: 5, aiDocResetDate: yesterday() });
  assert.strictEqual(user.quotaUsed('doc'), 0);
  assert.ok(user.canUse('doc'));
});

test('chat limiti doc limitidan alohida hisoblanadi', () => {
  const user = makeUser({ plan: 'free', aiDocUsedToday: 1, aiDocResetDate: today() });
  assert.ok(!user.canUse('doc'));
  assert.ok(user.canUse('chat'), 'hujjat limiti chatga ta\'sir qilmasligi kerak');
});

test('pro tarif faol bo\'lsa — kengaytirilgan limit', () => {
  const user = makeUser({
    plan: 'pro',
    planExpiresAt: new Date(Date.now() + 30 * 86400000),
    aiDocUsedToday: 10,
    aiDocResetDate: today(),
  });
  assert.ok(user.isPlanActive());
  assert.ok(user.canUse('doc'), 'pro da 10 ta hujjatdan keyin ham imkon bor');
});

test('pro muddati tugagan bo\'lsa — free limitlariga qaytadi', () => {
  const user = makeUser({
    plan: 'pro',
    planExpiresAt: new Date(Date.now() - 86400000),  // kecha tugagan
    aiDocUsedToday: 1,
    aiDocResetDate: today(),
  });
  assert.ok(!user.isPlanActive());
  assert.ok(!user.canUse('doc'), 'muddati tugagan pro free kabi cheklanishi kerak');
});
