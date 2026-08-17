'use strict';

const { Tender, Lot } = require('../../models');
const { normalizeRecord } = require('./normalize');
const sources = require('./sources');
const logger = require('../../logger');

/**
 * INGESTION — tashqi manbadan tender ma'lumotini olib bazaga yozish.
 *
 * Oqim:  manba → normalizatsiya → dedupe → upsert → admin tekshiruvi
 *
 * Yangi yozuv `isVerified: false` bilan keladi. Administrator tasdiqlamaguncha
 * u "tekshirilmagan" deb belgilanadi — foydalanuvchi buni ko'rib turadi.
 */

async function upsertTender(normalized) {
  const existing = await Tender.findOne({
    sourceName: normalized.sourceName,
    sourceId: normalized.sourceId,
  });

  const { lots, ...tenderFields } = normalized;

  if (!existing) {
    const tender = await Tender.create({ ...tenderFields, lotCount: lots.length });
    await Lot.insertMany(lots.map(lot => ({ ...lot, tenderId: tender.id, isDemo: false })));
    return { action: 'created', tenderId: tender.id };
  }

  // Mazmun o'zgarmagan bo'lsa — bazaga tegmaymiz
  if (existing.contentHash && existing.contentHash === normalized.contentHash) {
    return { action: 'unchanged', tenderId: existing.id };
  }

  // Administrator qo'lda tasdiqlagan yozuvni qayta "tekshirilmagan"
  // holatga tushirmaymiz — faqat mazmunni yangilaymiz.
  const wasVerified = existing.isVerified;
  Object.assign(existing, tenderFields, { isVerified: wasVerified, lotCount: lots.length });
  await existing.save();

  // Lotlarni almashtiramiz, lekin tayyor tushuntirishlarni saqlab qolamiz —
  // ular AI resursiga tushgan va lot mazmuni o'zgarmagan bo'lsa hali yaroqli.
  const oldLots = await Lot.find({ tenderId: existing.id }).lean();
  const explanationBySourceId = new Map(
    oldLots.filter(l => l.explanation?.xulosa).map(l => [l.sourceId, l.explanation])
  );

  await Lot.deleteMany({ tenderId: existing.id });
  await Lot.insertMany(lots.map(lot => ({
    ...lot,
    tenderId: existing.id,
    isDemo: false,
    ...(explanationBySourceId.has(lot.sourceId)
      ? { explanation: explanationBySourceId.get(lot.sourceId) }
      : {}),
  })));

  return { action: 'updated', tenderId: existing.id };
}

/**
 * @param {string} sourceName  sources/index.js dagi manba nomi
 * @param {object} options     { dryRun, limit, ...sourceOptions }
 */
async function runIngestion(sourceName, options = {}) {
  const source = sources.get(sourceName);
  if (!source) {
    throw new Error(`Noma'lum manba: ${sourceName}. Mavjud: ${sources.list().join(', ')}`);
  }

  const startedAt = Date.now();
  const report = {
    source: sourceName,
    dryRun: Boolean(options.dryRun),
    fetched: 0, created: 0, updated: 0, unchanged: 0, skipped: 0,
    errors: [],
  };

  logger.info(`Ingestion boshlandi: ${sourceName}${options.dryRun ? ' (dry-run)' : ''}`);

  let rawRecords;
  try {
    rawRecords = await source.fetch(options);
  } catch (err) {
    report.errors.push(`Manbadan o'qib bo'lmadi: ${err.message}`);
    logger.error(`Ingestion manbasi xatosi (${sourceName})`, err);
    return report;
  }

  const createdIds = [];
  const limit = Number(options.limit) || rawRecords.length;
  const batch = rawRecords.slice(0, limit);
  report.fetched = batch.length;

  for (const raw of batch) {
    const result = normalizeRecord(raw, { sourceName });

    if (!result.ok) {
      report.skipped += 1;
      report.errors.push(`"${result.title}": ${result.errors.join(', ')}`);
      continue;
    }

    if (options.dryRun) {
      report.created += 1;   // dry-run da faqat sanaymiz
      continue;
    }

    try {
      const { action, tenderId } = await upsertTender(result.tender);
      report[action === 'created' ? 'created' : action === 'updated' ? 'updated' : 'unchanged'] += 1;
      if (action === 'created') createdIds.push(tenderId);
    } catch (err) {
      report.skipped += 1;
      report.errors.push(`"${result.tender.title}": saqlashda xato — ${err.message}`);
    }
  }

  // Yangi tenderlar haqida Telegram obunachilariga xabar berish.
  // Bot sozlanmagan bo'lsa jimgina o'tkazib yuboriladi — ingestion
  // xabarnoma tufayli yiqilmasligi kerak.
  if (!options.dryRun && createdIds.length && options.notify !== false) {
    try {
      const telegram = require('../telegram');
      report.notified = await telegram.notifyNewTenders(createdIds);
    } catch (err) {
      logger.warn(`Telegram xabarnomasi yuborilmadi: ${err.message}`);
    }
  }

  report.durationMs = Date.now() - startedAt;
  logger.info(
    `Ingestion tugadi (${sourceName}): ${report.created} yangi, ${report.updated} yangilandi, `
    + `${report.unchanged} o'zgarmadi, ${report.skipped} o'tkazib yuborildi`
  );

  return report;
}

module.exports = { runIngestion, upsertTender };
