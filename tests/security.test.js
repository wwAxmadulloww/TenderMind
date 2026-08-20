'use strict';

/**
 * Topilgan xavfsizlik xatolari uchun testlar.
 * Har biri avval haqiqatda reproduce qilingan muammoni qamrab oladi.
 */

const test = require('node:test');
const assert = require('node:assert');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { escapeRegex, sanitizeSearch, searchRegex, MAX_SEARCH_LENGTH } = require('../utils/searchQuery');

// ══════════════════════════════════════════════════════════════════════
// Qidiruvdagi RegExp in'ektsiyasi (sof mantiq)
// ══════════════════════════════════════════════════════════════════════
test('escapeRegex — maxsus belgilar zararsizlantiriladi', () => {
  assert.strictEqual(escapeRegex('C++'), 'C\\+\\+');
  assert.strictEqual(escapeRegex('(a)'), '\\(a\\)');
  assert.strictEqual(escapeRegex('[a-z]'), '\\[a-z\\]');
});

test('searchRegex — yaroqsiz namuna ham xato bermaydi', () => {
  // Bularning har biri ilgari `new RegExp()` ni yiqitardi
  for (const bad of ['C++', '(', '[a-', '*', '?', 'a{2,', '\\']) {
    assert.doesNotThrow(() => searchRegex(bad), `"${bad}" xato berdi`);
  }
});

test('searchRegex — matn sifatida qidiradi, namuna sifatida emas', () => {
  const pattern = searchRegex('a.c');
  assert.ok(pattern.test('a.c'), 'aynan mos kelishi kerak');
  assert.ok(!pattern.test('abc'), '"." istalgan belgi sifatida ishlamasligi kerak');
});

test('searchRegex — ReDoS namunasi oddiy matnga aylanadi', () => {
  const pattern = searchRegex('(a+)+$');
  const started = Date.now();
  pattern.test('a'.repeat(2000));
  assert.ok(Date.now() - started < 200, 'katastrofik backtracking bo\'lmasligi kerak');
});

test('sanitizeSearch — uzunlik cheklanadi', () => {
  assert.strictEqual(sanitizeSearch('a'.repeat(5000)).length, MAX_SEARCH_LENGTH);
  assert.strictEqual(sanitizeSearch('  bo\'sh joy  '), 'bo\'sh joy');
  assert.strictEqual(sanitizeSearch(null), '');
  assert.strictEqual(sanitizeSearch({}), '');
});

// ══════════════════════════════════════════════════════════════════════
// Eksport hajmi chegarasi
// ══════════════════════════════════════════════════════════════════════
const { checkExportSize, MAX_DOC_CHARS, MAX_TOTAL_CHARS } = require('../controllers/exportController');

test('Odatdagi hajmdagi hujjatlar o\'tadi', () => {
  const docs = { ariza: 'a'.repeat(5000), texnik: 'b'.repeat(8000) };
  assert.strictEqual(checkExportSize({ docs }), null);
});

test('Bitta juda uzun hujjat rad etiladi', () => {
  const docs = { ariza: 'a'.repeat(MAX_DOC_CHARS + 1) };
  assert.ok(checkExportSize({ docs }), 'chegaradan oshgan hujjat rad etilishi kerak');
});

test('Alohida kichik, lekin birgalikda katta hujjatlar rad etiladi', () => {
  const perDoc = MAX_DOC_CHARS - 1;
  const docs = {};
  // Har biri chegarada, lekin yig'indisi umumiy chegaradan oshadi
  for (let i = 0; i < Math.ceil(MAX_TOTAL_CHARS / perDoc) + 1; i += 1) {
    docs['d' + i] = 'x'.repeat(perDoc);
  }
  const problem = checkExportSize({ docs });
  assert.ok(problem && problem.includes('birgalikda'));
});

test('Bo\'sh mazmun chegaradan o\'tadi — uni boshqa tekshiruv ushlaydi', () => {
  assert.strictEqual(checkExportSize({ content: '' }), null);
});

// ══════════════════════════════════════════════════════════════════════
// Integratsion: token bekor qilish, qidiruv, parol tiklash
// ══════════════════════════════════════════════════════════════════════
let mongod, server, base, db;

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
  process.env.MONGODB_URI = mongod.getUri('tendermind_security_test');
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'security-test-uchun-uzun-tasodifiy-qiymat-123456';

  db = require('../db');
  const { app } = require('../server');
  await db.connectDB({ required: true });
  await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (server) server.close();
  if (db) await db.mongoose.disconnect();
  if (mongod) await mongod.stop();
});

test('Qidiruvda "C++" server xatosi bermaydi', async () => {
  const r = await get('/api/tenders?search=' + encodeURIComponent('C++'));
  assert.strictEqual(r.status, 200, 'ilgari 500 qaytarardi');
});

test('Yopilmagan qavs regex xatosini oshkor qilmaydi', async () => {
  const r = await get('/api/tenders?search=' + encodeURIComponent('('));
  assert.strictEqual(r.status, 200);
  const body = await r.text();
  assert.ok(!body.includes('Invalid regular expression'),
    'ichki regex xatosi mijozga chiqmasligi kerak');
});

test('Juda uzun qidiruv qabul qilinadi, lekin qirqiladi', async () => {
  const r = await get('/api/tenders?search=' + 'a'.repeat(5000));
  assert.strictEqual(r.status, 200);
});

// ── Token bekor qilish ────────────────────────────────────────────────
test('Chiqishdan keyin eski token ishlamaydi', async () => {
  const { token } = await register('+998901220001', 'Chiquvchi');

  assert.strictEqual((await get('/api/auth/me', token)).status, 200, 'chiqishdan oldin ishlashi kerak');

  const out = await post('/api/auth/logout', {}, token);
  assert.strictEqual(out.status, 200);

  assert.strictEqual((await get('/api/auth/me', token)).status, 401,
    'chiqishdan keyin token darhol kuchsizlanishi kerak');
});

test('Parol o\'zgarganda barcha eski tokenlar bekor bo\'ladi', async () => {
  const { token: firstDevice } = await register('+998901220002', 'Ikki Qurilma');

  // Ikkinchi qurilmadan kirish — ikkala token ham amal qiladi
  const second = await (await post('/api/auth/login', { phone: '+998901220002', password: 'test1234' })).json();
  assert.strictEqual((await get('/api/auth/me', firstDevice)).status, 200);
  assert.strictEqual((await get('/api/auth/me', second.token)).status, 200);

  const changed = await fetch(`${base}/api/auth/change-password`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${second.token}` },
    body: JSON.stringify({ currentPassword: 'test1234', newPassword: 'yangi9876' }),
  });
  assert.strictEqual(changed.status, 200);
  const changedBody = await changed.json();

  assert.strictEqual((await get('/api/auth/me', firstDevice)).status, 401,
    'boshqa qurilmadagi sessiya yopilishi kerak');
  assert.strictEqual((await get('/api/auth/me', second.token)).status, 401,
    'eski token — o\'zgartirgan qurilmada ham — kuchsizlanadi');

  assert.ok(changedBody.token, 'server yangi token berishi kerak');
  assert.strictEqual((await get('/api/auth/me', changedBody.token)).status, 200,
    'yangi token bilan ishlash davom etadi');
});

test('Buzilgan token rad etiladi', async () => {
  const { token } = await register('+998901220003', 'Uchinchi');
  const tampered = token.slice(0, -3) + 'xyz';
  assert.strictEqual((await get('/api/auth/me', tampered)).status, 401);
});

// ── Admin orqali parol tiklash ────────────────────────────────────────
test('Admin vaqtinchalik parol beradi, eski parol ishlamay qoladi', async () => {
  const victim = await register('+998901220004', 'Parolni Unutgan');
  const adminReg = await register('+998901220005', 'Admin');
  await db.User.updateOne({ id: adminReg.user.id }, { $set: { role: 'admin' } });

  // Rol o'zgardi — admin qaytadan kirishi kerak
  const admin = await (await post('/api/auth/login', { phone: '+998901220005', password: 'test1234' })).json();

  const reset = await post(`/api/admin/users/${victim.user.id}/reset-password`, {}, admin.token);
  assert.strictEqual(reset.status, 200);
  const { temporaryPassword } = await reset.json();
  assert.ok(temporaryPassword && temporaryPassword.length >= 8);
  assert.ok(!/[01IOl]/.test(temporaryPassword), 'chalkashtiradigan belgi bo\'lmasin');

  // Eski parol endi ishlamaydi, vaqtinchalik parol ishlaydi
  assert.strictEqual(
    (await post('/api/auth/login', { phone: '+998901220004', password: 'test1234' })).status, 401);
  assert.strictEqual(
    (await post('/api/auth/login', { phone: '+998901220004', password: temporaryPassword })).status, 200);

  // Eski sessiya ham yopilgan
  assert.strictEqual((await get('/api/auth/me', victim.token)).status, 401);
});

test('Oddiy foydalanuvchi boshqa birovning parolini tiklay olmaydi', async () => {
  const attacker = await register('+998901220006', 'Buzg\'unchi');
  const target = await register('+998901220007', 'Nishon');

  const r = await post(`/api/admin/users/${target.user.id}/reset-password`, {}, attacker.token);
  assert.strictEqual(r.status, 403);
});

// ── CSP ───────────────────────────────────────────────────────────────
test('Bosh sahifa CSP sarlavhasi bilan keladi', async () => {
  const r = await get('/');
  const csp = r.headers.get('content-security-policy');
  assert.ok(csp, 'CSP sarlavhasi bo\'lishi kerak');
  assert.ok(csp.includes("script-src 'self'"), 'skriptlar faqat o\'z domenidan');
  assert.ok(!csp.includes("script-src 'self' 'unsafe-inline'"),
    'skriptlar uchun unsafe-inline bo\'lmasligi kerak');
  assert.ok(csp.includes("object-src 'none'"));
  assert.ok(csp.includes("frame-ancestors 'none'"), 'clickjacking himoyasi');
});
