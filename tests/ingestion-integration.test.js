'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongod, db, runIngestion;
const samplePath = path.join(__dirname, '..', 'data', 'namuna-tenderlar.json');

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri('tendermind_ingest_test');
  process.env.NODE_ENV = 'test';

  db = require('../db');
  runIngestion = require('../services/ingestion').runIngestion;
  await db.connectDB({ required: true });
});

test.after(async () => {
  if (db) await db.mongoose.disconnect();
  if (mongod) await mongod.stop();
});

test('dry-run — bazaga hech narsa yozmaydi', async () => {
  const report = await runIngestion('file', { path: samplePath, dryRun: true });
  assert.strictEqual(report.fetched, 2);
  assert.strictEqual(await db.Tender.countDocuments(), 0);
});

test('Import — tender va lotlar yaratiladi', async () => {
  const report = await runIngestion('file', { path: samplePath });
  assert.strictEqual(report.created, 2);
  assert.strictEqual(report.skipped, 0);

  const tender = await db.Tender.findOne({ sourceId: 'XU-2026-000123' });
  assert.ok(tender);
  assert.strictEqual(tender.soha, 'talim');
  assert.strictEqual(tender.hudud, 'toshkent');
  assert.strictEqual(tender.budgetRaw, 450000000);
  assert.strictEqual(tender.lotCount, 2);

  const lots = await db.Lot.find({ tenderId: tender.id }).sort({ lotNumber: 1 });
  assert.strictEqual(lots.length, 2);
  assert.strictEqual(lots[0].title, 'O\'quvchi partalari');
  assert.strictEqual(lots[0].startPrice, 270000000);
  assert.strictEqual(lots[1].quantity, 600);
});

test('Import qilingan yozuv DEMO emas, lekin TEKSHIRILMAGAN', async () => {
  const tender = await db.Tender.findOne({ sourceId: 'XU-2026-000123' });
  assert.strictEqual(tender.isDemo, false);
  assert.strictEqual(tender.isVerified, false);
  // Soxta baholar qo'yilmagan
  assert.strictEqual(tender.probability, null);
  assert.strictEqual(tender.competitors, null);
});

test('Takroriy import — nusxa yaratmaydi', async () => {
  const report = await runIngestion('file', { path: samplePath });
  assert.strictEqual(report.created, 0);
  assert.strictEqual(report.unchanged, 2, 'mazmun o\'zgarmagan — bazaga tegilmasligi kerak');
  assert.strictEqual(await db.Tender.countDocuments(), 2);
});

test('Admin tasdig\'i qayta import da yo\'qolmaydi', async () => {
  await db.Tender.updateOne({ sourceId: 'XU-2026-000123' }, { $set: { isVerified: true } });

  // Mazmunni o'zgartiramiz — yangilanish yo'lini majburlash uchun
  await db.Tender.updateOne({ sourceId: 'XU-2026-000123' }, { $set: { contentHash: 'eskirgan' } });
  await runIngestion('file', { path: samplePath });

  const tender = await db.Tender.findOne({ sourceId: 'XU-2026-000123' });
  assert.strictEqual(tender.isVerified, true, 'qo\'lda tasdiqlangan holat saqlanishi kerak');
});

test('Yangilanishda tayyor tushuntirish yo\'qolmaydi', async () => {
  const tender = await db.Tender.findOne({ sourceId: 'XU-2026-000123' });
  const lot = await db.Lot.findOne({ tenderId: tender.id, lotNumber: 1 });

  lot.explanation = {
    nima: 'test', kim: 'test', hujjatlar: ['a'], pul: 'test', muddat: 'test',
    xulosa: 'Saqlanishi kerak bo\'lgan tushuntirish', generatedAt: new Date(), model: 'test',
  };
  await lot.save();

  await db.Tender.updateOne({ id: tender.id }, { $set: { contentHash: 'yana-eskirgan' } });
  await runIngestion('file', { path: samplePath });

  const refreshed = await db.Lot.findOne({ tenderId: tender.id, lotNumber: 1 });
  assert.strictEqual(refreshed.explanation.xulosa, 'Saqlanishi kerak bo\'lgan tushuntirish',
    'AI resursi sarflangan tushuntirish qayta importda yo\'qolmasligi kerak');
});

test('Yaroqsiz yozuvlar o\'tkazib yuboriladi, sabab bilan', async () => {
  const fs = require('fs');
  const os = require('os');
  const badPath = path.join(os.tmpdir(), `tm-bad-${Date.now()}.json`);
  fs.writeFileSync(badPath, JSON.stringify([
    { sourceId: 'OK-1', title: 'To\'g\'ri yozuv', org: 'Org', budget: '1000000', deadline: '2027-06-01' },
    { title: 'sourceId yo\'q' },
    { sourceId: 'BAD-2', title: 'Byudjetsiz', org: 'Org', deadline: '2027-06-01' },
  ]));

  const report = await runIngestion('file', { path: badPath });
  assert.strictEqual(report.created, 1);
  assert.strictEqual(report.skipped, 2);
  assert.strictEqual(report.errors.length, 2);
  assert.ok(report.errors.some(e => e.includes('sourceId')));

  fs.unlinkSync(badPath);
});

test('Noma\'lum manba — tushunarli xato', async () => {
  await assert.rejects(
    () => runIngestion('mavjud-emas'),
    /Noma'lum manba/
  );
});
