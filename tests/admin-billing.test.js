'use strict';

/**
 * Admin huquqi va to'lov oqimining integratsion testi.
 * Xotiradagi MongoDB — tashqi klaster kerak emas.
 */

const test = require('node:test');
const assert = require('node:assert');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongod, server, base, db;
let userToken, adminToken, userId;

const post = (path, body, token) => fetch(`${base}${path}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(body || {}),
});
const get = (path, token) => fetch(`${base}${path}`, {
  headers: token ? { Authorization: `Bearer ${token}` } : {},
});

async function register(phone, name) {
  const r = await post('/api/auth/register', { name, phone, password: 'test1234', company: 'Test MChJ' });
  return r.json();
}

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri('tendermind_admin_test');
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-secret-uzun-va-xavfsiz-qiymat-0987654321';

  db = require('../db');
  const { app } = require('../server');
  await db.connectDB({ required: true });
  await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;

  const normal = await register('+998901110001', 'Oddiy Foydalanuvchi');
  userToken = normal.token;
  userId = normal.user.id;

  const adminReg = await register('+998901110002', 'Admin Foydalanuvchi');
  adminToken = adminReg.token;
  // Adminlikni faqat baza orqali berish mumkin — API orqali emas
  await db.User.updateOne({ id: adminReg.user.id }, { $set: { role: 'admin' } });
});

test.after(async () => {
  if (server) server.close();
  if (db) await db.mongoose.disconnect();
  if (mongod) await mongod.stop();
});

// ── Huquq ────────────────────────────────────────────────────────────
test('Admin API — tokensiz 401', async () => {
  assert.strictEqual((await get('/api/admin/stats')).status, 401);
});

test('Admin API — oddiy foydalanuvchi 403 oladi', async () => {
  const r = await get('/api/admin/stats', userToken);
  assert.strictEqual(r.status, 403);
});

test('Admin API — administrator kira oladi', async () => {
  const r = await get('/api/admin/stats', adminToken);
  assert.strictEqual(r.status, 200);
  const s = await r.json();
  assert.ok(s.users.total >= 2);
  assert.strictEqual(s.users.admins, 1);
});

test('Foydalanuvchi ro\'yxatida parol hash chiqmaydi', async () => {
  const data = await (await get('/api/admin/users', adminToken)).json();
  for (const u of data.items) {
    assert.strictEqual(u.passwordHash, undefined, 'passwordHash tashqariga chiqmasligi kerak');
  }
});

test('Rol tokendan emas, bazadan o\'qiladi', async () => {
  // Adminlik olib tashlansa — mavjud token bilan ham kira olmasligi kerak
  await db.User.updateOne({ phone: '+998901110002' }, { $set: { role: 'user' } });
  assert.strictEqual((await get('/api/admin/stats', adminToken)).status, 403);

  await db.User.updateOne({ phone: '+998901110002' }, { $set: { role: 'admin' } });
  assert.strictEqual((await get('/api/admin/stats', adminToken)).status, 200);
});

// ── Tender va lot boshqaruvi ─────────────────────────────────────────
test('Admin tender yaratadi va u DEMO emas', async () => {
  const r = await post('/api/admin/tenders', {
    title: 'Haqiqiy test tenderi', org: 'Test Hokimiyat', soha: 'it', hudud: 'toshkent',
    budgetRaw: 500000000, deadline: '2027-01-15',
  }, adminToken);

  assert.strictEqual(r.status, 201);
  const { tender } = await r.json();
  assert.strictEqual(tender.isDemo, false);
  assert.strictEqual(tender.budget, new Intl.NumberFormat('uz-UZ').format(500000000));
});

test('Majburiy maydonsiz tender — 400', async () => {
  const r = await post('/api/admin/tenders', { title: 'Faqat nomi' }, adminToken);
  assert.strictEqual(r.status, 400);
});

test('Tender o\'chirilganda lotlari ham o\'chadi', async () => {
  const created = await (await post('/api/admin/tenders', {
    title: 'O\'chiriladigan tender', org: 'Org', soha: 'it', hudud: 'toshkent',
    budgetRaw: 1000000, deadline: '2027-02-01',
  }, adminToken)).json();

  await post('/api/admin/lots', {
    tenderId: created.tender.id, title: 'Lot 1', startPrice: 500000, deadline: '2027-02-01',
  }, adminToken);

  const del = await fetch(`${base}/api/admin/tenders/${created.tender.id}`, {
    method: 'DELETE', headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.strictEqual(del.status, 200);
  assert.strictEqual((await del.json()).deletedLots, 1);
  assert.strictEqual(await db.Lot.countDocuments({ tenderId: created.tender.id }), 0);
});

// ── To'lov oqimi ─────────────────────────────────────────────────────
test('Tariflar ochiq ko\'rinadi, faqat ishlaydigan usullar ro\'yxatda', async () => {
  const data = await (await get('/api/billing/plans')).json();
  assert.ok(data.plans.length >= 3);
  // Payme/Click merchant kaliti yo'q — ro'yxatda ko'rsatilmasligi kerak
  assert.ok(data.paymentMethods.every(m => m.enabled));
  assert.ok(data.paymentMethods.some(m => m.id === 'transfer'));
});

test('Obuna so\'rovi — tarif DARHOL faollashmaydi', async () => {
  const r = await post('/api/billing/subscribe', { plan: 'pro', months: 1 }, userToken);
  assert.strictEqual(r.status, 201);
  const data = await r.json();
  assert.strictEqual(data.invoice.status, 'pending');
  assert.ok(data.invoice.invoiceNumber.startsWith('TM-'));

  // Foydalanuvchi hali free
  const me = await (await get('/api/billing/me', userToken)).json();
  assert.strictEqual(me.plan, 'free');
});

test('Ikkinchi so\'rov yangi hisob-faktura yaratmaydi', async () => {
  const r = await post('/api/billing/subscribe', { plan: 'pro', months: 1 }, userToken);
  assert.strictEqual((await r.json()).alreadyPending, true);
});

test('Ulanmagan to\'lov usuli — yolg\'on tasdiq emas, aniq xato', async () => {
  const other = await register('+998901110003', 'Uchinchi');
  const r = await post('/api/billing/subscribe', { plan: 'pro', paymentMethod: 'payme' }, other.token);
  assert.strictEqual(r.status, 503);
  assert.ok((await r.json()).error.includes('ulanmagan'));
});

test('Admin tasdiqlagandan keyin tarif faollashadi', async () => {
  const subs = await (await get('/api/admin/subscriptions?status=pending', adminToken)).json();
  const pending = subs.items.find(s => s.user.id === userId);
  assert.ok(pending, 'kutilayotgan obuna topilishi kerak');

  const approve = await post(`/api/admin/subscriptions/${pending.id}/approve`, { transactionId: 'TX-1' }, adminToken);
  assert.strictEqual(approve.status, 200);

  const me = await (await get('/api/billing/me', userToken)).json();
  assert.strictEqual(me.plan, 'pro');
  assert.strictEqual(me.isActive, true);
  assert.strictEqual(me.limits.docPerDay, 99);
});

test('Muddati tugagan obuna foydalanuvchini free ga qaytaradi', async () => {
  const billing = require('../services/billing');
  await db.Subscription.updateMany(
    { userId, status: 'active' },
    { $set: { endDate: new Date(Date.now() - 86400000) } }
  );
  await db.User.updateOne({ id: userId }, { $set: { planExpiresAt: new Date(Date.now() - 86400000) } });

  const count = await billing.expireOutdatedSubscriptions();
  assert.ok(count >= 1);

  const user = await db.User.findOne({ id: userId });
  assert.strictEqual(user.plan, 'free');
  assert.strictEqual(user.planExpiresAt, null);
});

test('12 oylik obunada 2 oy chegirma', async () => {
  const { calculatePrice, PLANS } = require('../config/plans');
  const yearly = calculatePrice('pro', 12);
  assert.strictEqual(yearly.amount, PLANS.pro.priceMonthly * 10);
  assert.strictEqual(yearly.discountMonths, 2);
});
