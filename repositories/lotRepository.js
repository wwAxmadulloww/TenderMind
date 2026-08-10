'use strict';

const { Lot, Tender } = require('../models');

function normalizeLot(lot) {
  if (!lot) return null;
  const obj = typeof lot.toObject === 'function' ? lot.toObject() : { ...lot };
  delete obj._id;
  delete obj.__v;
  // Tushuntirish tayyor yoki yo'qligini mijoz bilishi uchun
  obj.hasExplanation = Boolean(obj.explanation && obj.explanation.xulosa);
  return obj;
}

async function findByTender(tenderId) {
  const lots = await Lot.find({ tenderId }).sort({ lotNumber: 1 }).lean();
  return lots.map(normalizeLot);
}

async function findById(id) {
  return normalizeLot(await Lot.findOne({ id }).lean());
}

/** AI tushuntirishini saqlash uchun to'liq hujjat kerak (lean emas) */
async function findDocById(id) {
  return Lot.findOne({ id });
}

async function count() {
  return Lot.countDocuments();
}

/**
 * Mavjud tenderlar uchun lot yaratish (migratsiya).
 *
 * Hozirgi demo tenderlarda lot tushunchasi yo'q — har biri uchun bitta
 * "Lot №1" yaratiladi. Haqiqiy ingestion ishga tushganda lotlar manbadan
 * to'g'ridan-to'g'ri keladi va bu funksiya kerak bo'lmaydi.
 */
async function backfillFromTenders() {
  const tenders = await Tender.find().lean();
  let created = 0;

  for (const tender of tenders) {
    const existing = await Lot.countDocuments({ tenderId: tender.id });
    if (existing > 0) continue;

    await Lot.create({
      tenderId: tender.id,
      lotNumber: 1,
      title: tender.title,
      description: tender.description || '',
      startPrice: tender.budgetRaw,
      deliveryTerm: '',
      requirements: tender.requirements || [],
      deadline: tender.deadline,
      status: tender.status,
      sourceUrl: tender.sourceUrl || '',
      sourceId: tender.sourceId || '',
      isDemo: tender.isDemo !== false,
    });
    created += 1;
  }

  if (created > 0) await syncLotCounts();
  return created;
}

/** Tenderdagi lotCount ni haqiqiy songa moslashtirish */
async function syncLotCounts() {
  const grouped = await Lot.aggregate([
    { $group: { _id: '$tenderId', total: { $sum: 1 } } },
  ]);
  const ops = grouped.map(g => ({
    updateOne: { filter: { id: g._id }, update: { $set: { lotCount: g.total } } },
  }));
  if (ops.length) await Tender.bulkWrite(ops);
  return ops.length;
}

module.exports = {
  findByTender,
  findById,
  findDocById,
  count,
  backfillFromTenders,
  syncLotCounts,
  normalizeLot,
};
