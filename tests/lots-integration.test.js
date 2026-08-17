'use strict';

/**
 * Lot oqimining to'liq integratsion testi — haqiqiy MongoDB (xotirada)
 * bilan ishlaydi, tashqi klasterga ulanmaydi.
 */

const test = require('node:test');
const assert = require('node:assert');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongod;
let server;
let base;
let db;
let lotRepository;
let token;

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri('tendermind_test');
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-secret-uzun-va-xavfsiz-qiymat-1234567890';

  db = require('../db');
  lotRepository = require('../repositories/lotRepository');
  const tenderRepository = require('../repositories/tenderRepository');
  const { app } = require('../server');

  await db.connectDB({ required: true });
  await tenderRepository.ensureSeeded();
  await lotRepository.backfillFromTenders();

  await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;

  // Test foydalanuvchisi
  const reg = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Test Foydalanuvchi',
      phone: '+998901112233',
      password: 'test1234',
      company: 'Test MChJ',
    }),
  });
  token = (await reg.json()).token;
});

test.after(async () => {
  if (server) server.close();
  if (db) await db.mongoose.disconnect();
  if (mongod) await mongod.stop();
});

test('Seed tenderlar DEMO deb belgilanadi', async () => {
  const r = await fetch(`${base}/api/tenders?limit=3`);
  assert.strictEqual(r.status, 200);
  const data = await r.json();
  assert.ok(data.items.length > 0);
  for (const t of data.items) {
    assert.strictEqual(t.isDemo, true, 'seed yozuvi demo deb belgilanishi kerak');
    assert.ok(t.dataNote.includes('Namunaviy'));
  }
});

test('Har bir tender uchun lot yaratilgan', async () => {
  const list = await fetch(`${base}/api/tenders?limit=1`);
  const { items } = await list.json();
  const tenderId = items[0].id;

  const r = await fetch(`${base}/api/tenders/${tenderId}/lots`);
  assert.strictEqual(r.status, 200);
  const data = await r.json();
  assert.ok(data.lots.length >= 1);
  assert.strictEqual(data.lots[0].lotNumber, 1);
  assert.strictEqual(data.lots[0].tenderId, tenderId);
});

test('Lotlarni ko\'rish ochiq — token talab qilinmaydi', async () => {
  const list = await fetch(`${base}/api/tenders?limit=1`);
  const { items } = await list.json();
  const lots = await (await fetch(`${base}/api/tenders/${items[0].id}/lots`)).json();

  const r = await fetch(`${base}/api/lots/${lots.lots[0].id}`);
  assert.strictEqual(r.status, 200);
  const data = await r.json();
  assert.ok(data.lot);
  assert.ok(data.tender);
});

test('"Menga mos keladimi?" — tokensiz ishlaydi va sabab qaytaradi', async () => {
  const list = await fetch(`${base}/api/tenders?limit=1`);
  const { items } = await list.json();
  const lots = await (await fetch(`${base}/api/tenders/${items[0].id}/lots`)).json();

  const r = await fetch(`${base}/api/lots/${lots.lots[0].id}/fit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ experience: 10 }),
  });
  assert.strictEqual(r.status, 200);
  const data = await r.json();
  assert.ok(['mos', 'shoshilinch', 'mos_emas'].includes(data.fit.verdict));
  assert.ok(data.fit.reasons.length > 0);
});

test('Tushuntirish — tokensiz 401, token bilan yaratiladi va keshlanadi', async () => {
  const list = await fetch(`${base}/api/tenders?limit=1`);
  const { items } = await list.json();
  const lots = await (await fetch(`${base}/api/tenders/${items[0].id}/lots`)).json();
  const lotId = lots.lots[0].id;

  // Tokensiz — rad etiladi
  const anon = await fetch(`${base}/api/lots/${lotId}/explain`, { method: 'POST' });
  assert.strictEqual(anon.status, 401);

  // Token bilan — AI ulanmagan bo'lsa ham to'liq tushuntirish qaytadi
  const first = await fetch(`${base}/api/lots/${lotId}/explain`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.strictEqual(first.status, 200);
  const firstData = await first.json();
  assert.strictEqual(firstData.cached, false);
  assert.ok(firstData.explanation.xulosa.length > 0, 'AI siz ham xulosa bo\'lishi shart');
  assert.ok(firstData.explanation.hujjatlar.length >= 3);

  // Ikkinchi marta — keshdan
  const second = await fetch(`${base}/api/lots/${lotId}/explain`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  const secondData = await second.json();
  assert.strictEqual(secondData.cached, true, 'ikkinchi so\'rov keshdan kelishi kerak');
});

test('Kesh urilganda kunlik limit sarflanmaydi', async () => {
  const list = await fetch(`${base}/api/tenders?limit=1`);
  const { items } = await list.json();
  const lots = await (await fetch(`${base}/api/tenders/${items[0].id}/lots`)).json();
  const lotId = lots.lots[0].id;

  const before = await db.User.findOne({ phone: '+998901112233' });
  const usedBefore = before.quotaUsed('chat');

  await fetch(`${base}/api/lots/${lotId}/explain`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });

  const after = await db.User.findOne({ phone: '+998901112233' });
  assert.strictEqual(after.quotaUsed('chat'), usedBefore,
    'keshdan qaytgan javob uchun limit olinmasligi kerak');
});

test('Mavjud bo\'lmagan lot — 404', async () => {
  const r = await fetch(`${base}/api/lots/mavjud-emas-12345`);
  assert.strictEqual(r.status, 404);
});
