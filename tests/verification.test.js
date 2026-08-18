'use strict';

/**
 * Telefon tasdiqlash va parolni tiklash oqimi.
 * SMS konsol provayderi bilan — haqiqiy SMS yuborilmaydi.
 */

const test = require('node:test');
const assert = require('node:assert');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongod, server, base, db, sms;
let sentMessages = [];

const post = (path, body, token) => fetch(`${base}${path}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(body || {}),
});
const get = (path, token) => fetch(`${base}${path}`, {
  headers: token ? { Authorization: `Bearer ${token}` } : {},
});

const register = async (phone, name) =>
  (await post('/api/auth/register', { name, phone, password: 'test1234', company: 'Test MChJ' })).json();

/** Yuborilgan xabardan kodni ajratib olish */
const lastCode = () => sentMessages.at(-1)?.match(/\b(\d{6})\b/)?.[1];

/** Cooldown ni chetlab o'tish — vaqt o'tganini taqlid qilamiz */
async function clearCooldown(phone) {
  await db.User.updateOne({ phone }, { $set: { 'verification.lastSentAt': new Date(Date.now() - 120000) } });
}

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri('tendermind_verify_test');
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'verify-test-uchun-uzun-tasodifiy-qiymat-98765';
  process.env.SMS_CONSOLE = 'true';

  db = require('../db');
  sms = require('../services/sms');
  const { app } = require('../server');

  // Yuborilgan SMS larni ushlab qolamiz
  const provider = sms.smsManager.provider;
  provider.send = async (phone, text) => { sentMessages.push(text); return true; };

  await db.connectDB({ required: true });
  await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (server) server.close();
  if (db) await db.mongoose.disconnect();
  if (mongod) await mongod.stop();
});

test.beforeEach(() => { sentMessages = []; });

// ── Sozlanganlik holati ───────────────────────────────────────────────
test('SMS holati interfeys uchun ochiq', async () => {
  const data = await (await get('/api/auth/sms-status')).json();
  assert.strictEqual(data.available, true);
});

test('Kod xabarida 6 xonali son bo\'ladi', async () => {
  const { token } = await register('+998901330001', 'Tasdiqlovchi');
  await post('/api/auth/send-code', {}, token);
  assert.ok(lastCode(), 'xabarda kod bo\'lishi kerak');
  assert.strictEqual(lastCode().length, 6);
});

// ── Telefonni tasdiqlash ──────────────────────────────────────────────
test('To\'g\'ri kod telefonni tasdiqlaydi', async () => {
  const { token, user } = await register('+998901330002', 'Ikkinchi');
  await post('/api/auth/send-code', {}, token);

  const r = await post('/api/auth/verify-phone', { code: lastCode() }, token);
  assert.strictEqual(r.status, 200);

  const stored = await db.User.findOne({ id: user.id });
  assert.strictEqual(stored.phoneVerified, true);
  assert.strictEqual(stored.verification.codeHash, '', 'kod ishlatilgach tozalanishi kerak');
});

test('Noto\'g\'ri kod rad etiladi va urinish sanaladi', async () => {
  const { token, user } = await register('+998901330003', 'Uchinchi');
  await post('/api/auth/send-code', {}, token);

  const r = await post('/api/auth/verify-phone', { code: '000000' }, token);
  assert.strictEqual(r.status, 400);
  assert.ok((await r.json()).error.includes('urinish'));

  const stored = await db.User.findOne({ id: user.id });
  assert.strictEqual(stored.phoneVerified, false);
  assert.strictEqual(stored.verification.attempts, 1);
});

test('Urinishlar tugagach kod bloklanadi', async () => {
  const { token, user } = await register('+998901330004', 'To\'rtinchi');
  await post('/api/auth/send-code', {}, token);
  const correct = lastCode();

  for (let i = 0; i < 5; i += 1) {
    await post('/api/auth/verify-phone', { code: '111111' }, token);
  }

  // To'g'ri kod ham endi qabul qilinmaydi
  const r = await post('/api/auth/verify-phone', { code: correct }, token);
  assert.strictEqual(r.status, 400);
  assert.ok((await r.json()).error.includes('urinish'));

  const stored = await db.User.findOne({ id: user.id });
  assert.strictEqual(stored.phoneVerified, false);
});

test('Muddati o\'tgan kod ishlamaydi', async () => {
  const { token, user } = await register('+998901330005', 'Beshinchi');
  await post('/api/auth/send-code', {}, token);
  const code = lastCode();

  await db.User.updateOne({ id: user.id },
    { $set: { 'verification.expiresAt': new Date(Date.now() - 1000) } });

  const r = await post('/api/auth/verify-phone', { code }, token);
  assert.strictEqual(r.status, 400);
  assert.ok((await r.json()).error.includes('muddati'));
});

test('Kod juda tez qayta so\'ralmaydi', async () => {
  const { token } = await register('+998901330006', 'Oltinchi');
  assert.strictEqual((await post('/api/auth/send-code', {}, token)).status, 200);

  const second = await post('/api/auth/send-code', {}, token);
  assert.strictEqual(second.status, 429);
  assert.ok((await second.json()).error.includes('soniya'));
});

// ── Parolni tiklash ───────────────────────────────────────────────────
test('Tiklash kodi bilan yangi parol o\'rnatiladi', async () => {
  const phone = '+998901330007';
  await register(phone, 'Unutgan');
  await clearCooldown(phone);

  await post('/api/auth/forgot-password', { phone });
  const code = lastCode();
  assert.ok(code);

  const reset = await post('/api/auth/reset-password', { phone, code, newPassword: 'yangiParol9' });
  assert.strictEqual(reset.status, 200);
  const data = await reset.json();
  assert.ok(data.token, 'darhol kirish uchun token berilishi kerak');

  // Eski parol ishlamaydi, yangisi ishlaydi
  assert.strictEqual((await post('/api/auth/login', { phone, password: 'test1234' })).status, 401);
  assert.strictEqual((await post('/api/auth/login', { phone, password: 'yangiParol9' })).status, 200);
});

test('Tiklash eski sessiyalarni yopadi', async () => {
  const phone = '+998901330008';
  const { token: oldSession } = await register(phone, 'Sessiyali');
  await clearCooldown(phone);

  assert.strictEqual((await get('/api/auth/me', oldSession)).status, 200);

  await post('/api/auth/forgot-password', { phone });
  await post('/api/auth/reset-password', { phone, code: lastCode(), newPassword: 'boshqaParol7' });

  assert.strictEqual((await get('/api/auth/me', oldSession)).status, 401,
    'hisob egallangan bo\'lsa, buzg\'unchining tokeni ham o\'lishi kerak');
});

test('Tiklash telefonni tasdiqlangan deb belgilaydi', async () => {
  const phone = '+998901330009';
  const { user } = await register(phone, 'Tasdiqsiz');
  await clearCooldown(phone);

  await post('/api/auth/forgot-password', { phone });
  await post('/api/auth/reset-password', { phone, code: lastCode(), newPassword: 'parolYangi5' });

  const stored = await db.User.findOne({ id: user.id });
  assert.strictEqual(stored.phoneVerified, true,
    'SMS ni olgan bo\'lsa, raqam unga tegishli ekani isbotlangan');
});

test('Mavjud bo\'lmagan raqam oshkor qilinmaydi', async () => {
  const known = '+998901330010';
  await register(known, 'Mavjud');
  await clearCooldown(known);

  const forKnown = await post('/api/auth/forgot-password', { phone: known });
  const forUnknown = await post('/api/auth/forgot-password', { phone: '+998909999999' });

  assert.strictEqual(forKnown.status, forUnknown.status);
  assert.deepStrictEqual(await forKnown.json(), await forUnknown.json(),
    'javob bir xil bo\'lishi kerak — aks holda raqamlarni tekshirish vositasiga aylanadi');
});

test('Noto\'g\'ri tiklash kodi parolni o\'zgartirmaydi', async () => {
  const phone = '+998901330011';
  await register(phone, 'Himoyalangan');
  await clearCooldown(phone);
  await post('/api/auth/forgot-password', { phone });

  const r = await post('/api/auth/reset-password', { phone, code: '999999', newPassword: 'buzgunchi1' });
  assert.strictEqual(r.status, 400);

  assert.strictEqual((await post('/api/auth/login', { phone, password: 'test1234' })).status, 200,
    'eski parol amal qilishi kerak');
});

test('Kodsiz parol tiklab bo\'lmaydi', async () => {
  const phone = '+998901330012';
  await register(phone, 'Kodsiz');

  const r = await post('/api/auth/reset-password', { phone, code: '', newPassword: 'yangi12345' });
  assert.strictEqual(r.status, 400);
});

test('Zaif yangi parol qabul qilinmaydi', async () => {
  const phone = '+998901330013';
  await register(phone, 'Zaif');
  await clearCooldown(phone);
  await post('/api/auth/forgot-password', { phone });

  const r = await post('/api/auth/reset-password', { phone, code: lastCode(), newPassword: '123' });
  assert.strictEqual(r.status, 400);
});
