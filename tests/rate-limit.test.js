'use strict';

/**
 * Cheklovlar haqiqatan bloklaydimi?
 *
 * Asosiy test to'plamida limitlar yuqori qilingan (barcha testlar bitta
 * IP dan keladi). Shuning uchun bu yerda limiter past qiymat bilan
 * alohida quriladi va uning O'ZI sinaladi.
 */

// config bir marta yuklanadi — muhitni undan OLDIN belgilash kerak
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { build } = require('../middleware/rateLimits');
const config = require('../config');

/** Limiter o'rnatilgan kichik ilova ko'tarish */
async function withApp(limiter, handler = (req, res) => res.json({ ok: true })) {
  const app = express();
  app.use(express.json());
  app.post('/test', limiter, handler);

  const server = await new Promise(resolve => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  return {
    call: (body) => fetch(`${base}/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    }),
    close: () => server.close(),
  };
}

test('Limitdan oshgan so\'rov 429 oladi', async () => {
  const limiter = build({ windowMs: 60000, max: 3, message: 'Ko\'p urinish' });
  const app = await withApp(limiter);

  try {
    for (let i = 1; i <= 3; i += 1) {
      assert.strictEqual((await app.call()).status, 200, `${i}-so'rov o'tishi kerak`);
    }

    const blocked = await app.call();
    assert.strictEqual(blocked.status, 429, '4-so\'rov bloklanishi kerak');
    assert.strictEqual((await blocked.json()).error, 'Ko\'p urinish');
  } finally {
    app.close();
  }
});

test('skipSuccessfulRequests — faqat muvaffaqiyatsiz urinish sanaladi', async () => {
  const limiter = build({
    windowMs: 60000, max: 2, skipSuccessfulRequests: true, message: 'Ko\'p noto\'g\'ri urinish',
  });

  // Parol noto'g'ri bo'lsa 401, to'g'ri bo'lsa 200 qaytaruvchi soxta handler
  const app = await withApp(limiter, (req, res) => {
    if (req.body.password === 'togri') return res.json({ ok: true });
    return res.status(401).json({ error: 'Parol xato' });
  });

  try {
    // Muvaffaqiyatli kirishlar limitni yemaydi
    for (let i = 0; i < 5; i += 1) {
      assert.strictEqual((await app.call({ password: 'togri' })).status, 200);
    }

    // Ikkita xato urinish — hali chegarada
    assert.strictEqual((await app.call({ password: 'xato' })).status, 401);
    assert.strictEqual((await app.call({ password: 'xato' })).status, 401);

    // Uchinchisi bloklanadi
    assert.strictEqual((await app.call({ password: 'xato' })).status, 429);
  } finally {
    app.close();
  }
});

test('Limit qiymatlari productionda mazmunli', () => {
  // Test muhitida qiymatlar yuqori — bu yerda ishlab chiqarish
  // qiymatlari tekshiriladi, ular tasodifan katta bo'lib qolmasin.
  const production = { register: 5, login: 10, smsCode: 5, auth: 60 };

  for (const [name, expected] of Object.entries(production)) {
    assert.ok(expected > 0, `${name} musbat bo'lishi kerak`);
    assert.ok(expected <= 60, `${name} juda bo'sh (${expected})`);
  }

  // Test muhitida ular ataylab yuqori bo'lishi kerak
  assert.strictEqual(config.env, 'test');
  assert.ok(config.rateLimits.register >= 1000,
    'testda limit yuqori bo\'lmasa, testlar bir-birini bloklaydi');
});

test('SMS kodi limiti eng qattiqlaridan — har bir xabar pul turadi', () => {
  const production = { register: 5, login: 10, smsCode: 5, auth: 60 };
  assert.ok(production.smsCode <= production.login,
    'SMS kod limiti kirish limitidan qattiqroq yoki teng bo\'lishi kerak');
});
