'use strict';

/**
 * E'lon holati va admin kiritmasini tekshiruvchi testlar.
 *
 * Har biri avval haqiqatda ishlayotgan serverda reproduce qilingan
 * muammoni qamrab oladi:
 *   - muddati o'tgan e'lon "Faol" filtrida va bosh sahifadagi hisobda
 *     ko'rinardi;
 *   - "Shoshilinch" filtri qo'lda yozilgan yorliqni qaytarardi, eng
 *     tez tugaydigan e'lon esa unga tushmasdi;
 *   - admin API istalgan sana matnini va istalgan ID ni qabul qilardi.
 */

const test = require('node:test');
const assert = require('node:assert');
const { MongoMemoryServer } = require('mongodb-memory-server');

// db.js MONGODB_URI ni yuklanish paytida o'qiydi, shuning uchun uni
// (va unga bog'liq repozitoriyni) `before` ichida, manzil o'rnatilgandan
// KEYIN chaqiramiz. Tepada chaqirilsa .env dagi eski manzil qotib qoladi.
let repo;

const DAY = 86400000;
const iso = (offsetDays) => new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);

// ══════════════════════════════════════════════════════════════════════
// Sof mantiq — bazasiz
// ══════════════════════════════════════════════════════════════════════
test('computeStatus — muddat o\'tgan bo\'lsa "closed"', () => {
  assert.strictEqual(repo.computeStatus('active', iso(-1)), 'closed');
  assert.strictEqual(repo.computeStatus('active', '2020-01-01'), 'closed');
});

test('computeStatus — yaqin muddat "urgent", uzoq muddat "active"', () => {
  assert.strictEqual(repo.computeStatus('active', iso(0)), 'urgent');
  assert.strictEqual(repo.computeStatus('active', iso(repo.URGENT_WITHIN_DAYS)), 'urgent');
  assert.strictEqual(repo.computeStatus('active', iso(repo.URGENT_WITHIN_DAYS + 1)), 'active');
});

test('computeStatus — saqlangan "urgent" yorlig\'i haqiqatni bosmaydi', () => {
  // Ilgari shu yorliq bor yozuv 100 kun qolgan bo'lsa ham shoshilinch edi
  assert.strictEqual(repo.computeStatus('urgent', iso(100)), 'active');
});

test('computeStatus — qo\'lda yopilgan e\'lon sanaga qaramay yopiq qoladi', () => {
  assert.strictEqual(repo.computeStatus('closed', iso(30)), 'closed');
  assert.strictEqual(repo.computeStatus('canceled', iso(30)), 'canceled');
});

// ══════════════════════════════════════════════════════════════════════
// Integratsion
// ══════════════════════════════════════════════════════════════════════
let mongod, server, base, db, adminToken;

const authed = (path, options = {}) => fetch(`${base}${path}`, {
  ...options,
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${adminToken}`,
    ...(options.headers || {}),
  },
});

const createTender = (body) =>
  authed('/api/admin/tenders', { method: 'POST', body: JSON.stringify(body) });

const baseTender = {
  title: 'Sinov e\'loni', org: 'Sinov tashkiloti',
  soha: 'it', hudud: 'toshkent', budgetRaw: 1000000,
};

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri('tendermind_status_test');
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'status-test-uchun-uzun-tasodifiy-qiymat-1234567';

  db = require('../db');
  repo = require('../repositories/tenderRepository');
  const { app } = require('../server');
  await db.connectDB({ required: true });
  await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;

  const registered = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Sinov Admin', phone: '+998901330001',
      password: 'test1234', company: 'TenderMind',
    }),
  }).then(r => r.json());

  await db.User.updateOne({ phone: '+998901330001' }, { role: 'admin' });
  adminToken = registered.token;

  // Uch xil holat: tugagan, tez tugaydigan, uzoq muddatli
  await createTender({ ...baseTender, id: 'st-expired', deadline: iso(-10) });
  await createTender({ ...baseTender, id: 'st-soon', deadline: iso(3) });
  await createTender({ ...baseTender, id: 'st-far', deadline: iso(90), status: 'urgent' });
});

test.after(async () => {
  if (server) server.close();
  if (db) await db.mongoose.disconnect();
  if (mongod) await mongod.stop();
});

const list = (query) => fetch(`${base}/api/tenders?${query}`).then(r => r.json());
const idsOf = (data) => data.items.map(i => i.id).sort();

test('"Faol" filtri muddati o\'tgan e\'lonni ko\'rsatmaydi', async () => {
  const data = await list('status=active&limit=50');
  assert.ok(!idsOf(data).includes('st-expired'),
    'muddati o\'tgan e\'lon faol ro\'yxatda qolmasligi kerak');
  assert.ok(idsOf(data).includes('st-soon'));
  assert.ok(idsOf(data).includes('st-far'));
});

test('"Shoshilinch" filtri yorliqni emas, muddatni hisobga oladi', async () => {
  const data = await list('status=urgent&limit=50');
  const ids = idsOf(data);
  assert.ok(ids.includes('st-soon'), 'tez tugaydigan e\'lon shoshilinch bo\'lishi kerak');
  assert.ok(!ids.includes('st-far'), 'saqlangan "urgent" yorlig\'i yetarli asos emas');
  assert.ok(!ids.includes('st-expired'));
});

test('Muddati o\'tgan e\'lon "closed" holati bilan qaytadi', async () => {
  const tender = await fetch(`${base}/api/tenders/st-expired`).then(r => r.json());
  assert.strictEqual(tender.status, 'closed', 'bazada "active" bo\'lsa ham');
});

test('Qidiruv va holat birga ishlaydi', async () => {
  // Ikkalasi ham $or ishlatadi — biri ikkinchisini bosib ketmasligi kerak
  const active = await list('status=active&search=Sinov&limit=50');
  assert.ok(!idsOf(active).includes('st-expired'));
  assert.ok(idsOf(active).length >= 2);

  const all = await list('status=all&search=Sinov&limit=50');
  assert.ok(idsOf(all).includes('st-expired'), 'status=all hammasini qamrasin');
});

test('/api/stats o\'lchangan qamrovni qaytaradi', async () => {
  const stats = await fetch(`${base}/api/stats`).then(r => r.json());
  const active = await list('status=active&limit=50');

  assert.strictEqual(stats.open, active.total, 'hisob faol ro\'yxat bilan mos bo\'lsin');
  // Lug'atda 9 soha va 14 hudud bor; bazada faqat bittadan ishlatilgan
  assert.strictEqual(stats.sohalar, 1, 'lug\'at hajmi emas, haqiqiy qamrov');
  assert.strictEqual(stats.hududlar, 1);
});

// ── Admin kiritmasi ───────────────────────────────────────────────────
test('Yaroqsiz sana rad etiladi', async () => {
  for (const bad of ['salom-dunyo', '2026-02-31', '31.12.2026', '2026-13-01', '']) {
    const r = await createTender({ ...baseTender, id: 'st-bad-date', deadline: bad });
    assert.strictEqual(r.status, 400, `"${bad}" qabul qilinmasligi kerak`);
  }
});

test('Manzilda xavfsiz bo\'lmagan ID rad etiladi', async () => {
  for (const bad of ['../../etc/passwd', 'a b', 'Katta-Harf', 'a', 'x'.repeat(51), '<script>']) {
    const r = await createTender({ ...baseTender, id: bad, deadline: iso(30) });
    assert.strictEqual(r.status, 400, `"${bad}" qabul qilinmasligi kerak`);
  }
});

test('To\'g\'ri ID va sana qabul qilinadi', async () => {
  const r = await createTender({ ...baseTender, id: 'st-yaxshi-1', deadline: iso(30) });
  assert.strictEqual(r.status, 201);
});

test('Tahrirda ham sana tekshiriladi', async () => {
  const bad = await authed('/api/admin/tenders/st-yaxshi-1', {
    method: 'PUT', body: JSON.stringify({ deadline: 'buzuq' }),
  });
  assert.strictEqual(bad.status, 400, 'yaroqli e\'lonni buzib bo\'lmasin');

  const good = await authed('/api/admin/tenders/st-yaxshi-1', {
    method: 'PUT', body: JSON.stringify({ deadline: iso(45) }),
  });
  assert.strictEqual(good.status, 200);
});

// ── Saqlangan ro'yxat ─────────────────────────────────────────────────
test('Mavjud bo\'lmagan e\'lonni saqlab bo\'lmaydi', async () => {
  const r = await authed('/api/saved/bunday-tender-yoq', { method: 'POST' });
  assert.strictEqual(r.status, 404, 'ro\'yxatga arvoh yozuv tushmasligi kerak');
});

test('Mavjud e\'lonni saqlash va qaytarib olish ishlaydi', async () => {
  const added = await authed('/api/saved/st-soon', { method: 'POST' }).then(r => r.json());
  assert.strictEqual(added.saved, true);

  const removed = await authed('/api/saved/st-soon', { method: 'POST' }).then(r => r.json());
  assert.strictEqual(removed.saved, false);
});

// ── Tarif limitlari ───────────────────────────────────────────────────
test('Tarif limitlari faqat tekshiriladigan maydonlardan iborat', async () => {
  const me = await authed('/api/billing/me').then(r => r.json());
  assert.deepStrictEqual(Object.keys(me.limits).sort(), ['chatPerDay', 'docPerDay'],
    'tekshirilmaydigan limit mijozga yuborilmasin');
});
