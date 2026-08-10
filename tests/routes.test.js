'use strict';

const test = require('node:test');
const assert = require('node:assert');

// Baza ulanmagan holatni sinash — server.js require.main tekshiruvi tufayli
// import qilinganda o'zi ishga tushmaydi.
process.env.MONGODB_URI = '';
process.env.NODE_ENV = 'test';

const { app } = require('../server');

let server;
let base;

test.before(async () => {
  await new Promise(resolve => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server && server.close());

test('GET /api/health — baza uzilgan bo\'lsa ham 200 qaytaradi', async () => {
  const r = await fetch(`${base}/api/health`);
  assert.strictEqual(r.status, 200);
  const body = await r.json();
  assert.strictEqual(body.status, 'ok');
  assert.strictEqual(body.db, 'missing');
});

test('POST /api/export/pdf — tokensiz 401', async () => {
  const r = await fetch(`${base}/api/export/pdf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: 'test' }),
  });
  assert.strictEqual(r.status, 401);
});

test('POST /api/export/word — tokensiz 401', async () => {
  const r = await fetch(`${base}/api/export/word`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: 'test' }),
  });
  assert.strictEqual(r.status, 401);
});

test('GET /api/tenders — baza uzilgan bo\'lsa 503 (avval 500 va crash edi)', async () => {
  const r = await fetch(`${base}/api/tenders`);
  assert.strictEqual(r.status, 503);
});

test('POST /api/chat — tokensiz 401, va baza uzilganda ham server qulamaydi', async () => {
  const r = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'salom' }),
  });
  // Token tekshiruvi bazadan oldin — shuning uchun 401, 503 emas
  assert.strictEqual(r.status, 401);

  // Eng muhimi — process tirik qolgani (ilgari shu so'rov serverni o'ldirardi)
  const health = await fetch(`${base}/api/health`);
  assert.strictEqual(health.status, 200);
});

test('POST /api/chat — yaroqli token, lekin baza yo\'q → 503 (crash emas)', async () => {
  const jwt = require('jsonwebtoken');
  const token = jwt.sign({ id: 'test-id', name: 'T', phone: '+998901234567' },
    process.env.JWT_SECRET || 'tendermind-dev-only-unsafe-secret', { expiresIn: '1h' });

  const r = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ message: 'salom' }),
  });
  assert.strictEqual(r.status, 503);

  const health = await fetch(`${base}/api/health`);
  assert.strictEqual(health.status, 200);
});

test('GET /api/glossary — bazasiz ham ochiq va ishlaydi', async () => {
  const r = await fetch(`${base}/api/glossary`);
  assert.strictEqual(r.status, 200);
  const data = await r.json();
  assert.ok(data.total > 10);
  assert.ok(data.terms.some(t => t.term === 'Lot'));
});

test('GET /api/glossary/:term — qo\'shimchali shakl ham topiladi', async () => {
  const r = await fetch(`${base}/api/glossary/lotga`);
  assert.strictEqual(r.status, 200);
  assert.strictEqual((await r.json()).term.term, 'Lot');
});

test('GET /api/onboarding — tokensiz ham to\'liq qaytadi', async () => {
  const r = await fetch(`${base}/api/onboarding`);
  assert.strictEqual(r.status, 200);
  const data = await r.json();
  assert.ok(data.steps.length >= 5);
  assert.strictEqual(data.progress, undefined, 'anonim foydalanuvchida progress bo\'lmaydi');
});

test('POST /api/onboarding/progress — tokensiz 401', async () => {
  const r = await fetch(`${base}/api/onboarding/progress`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stepId: 'tender-nima' }),
  });
  assert.strictEqual(r.status, 401);
});

test('Noma\'lum endpoint — 404', async () => {
  const r = await fetch(`${base}/api/mavjud-emas`);
  assert.strictEqual(r.status, 404);
});
