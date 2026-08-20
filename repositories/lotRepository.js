'use strict';

const { Lot, Tender } = require('../models');
const { buildBasicExplanation } = require('../services/lotExplainer');
const logger = require('../logger');

/**
 * Lot uchun AI SIZ tushuntirish tayyorlash.
 *
 * lotExplainer.js dagi asosiy qoida: "tushuntirish AI ulanmagan bo'lsa
 * ham ishlashi SHART". Amalda esa u faqat kirgan foydalanuvchi tugmani
 * bosganda va kunlik limit sarflanganda yaratilardi — ya'ni ro'yxatdan
 * o'tmagan mehmon uchun mahsulotning asosiy va'dasi hech qachon
 * ko'rinmasdi. Holbuki asosiy variant faqat lotning o'z ma'lumotidan
 * quriladi: na tarmoq, na pul, na limit talab qiladi.
 *
 * Shuning uchun u lot yaratilishi bilan tayyorlanadi. AI esa keyin
 * `?refresh=1` orqali uni boyitadi.
 */
function basicExplanationFor(lot, tender) {
  const basic = buildBasicExplanation(lot, tender);
  return {
    nima: basic.nima,
    kim: basic.kim,
    hujjatlar: basic.hujjatlar,
    pul: basic.pul,
    muddat: basic.muddat,
    xulosa: basic.xulosa,
    generatedAt: new Date(),
    model: 'asosiy (AI ulanmagan)',
  };
}

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

    const lot = {
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
    };

    await Lot.create({ ...lot, explanation: basicExplanationFor(lot, tender) });
    created += 1;
  }

  if (created > 0) await syncLotCounts();
  return created;
}

/**
 * Tushuntirishsiz qolgan lotlarga asosiy variantni yozish.
 *
 * Ilgari yaratilgan lotlarda tushuntirish bo'sh — ular uchun "Oddiy
 * tilda" tugmasi hech narsa qaytarmaydi. AI chaqirilmaydi, shuning
 * uchun bu migratsiya tekin va har ishga tushishda xavfsiz.
 */
async function backfillExplanations() {
  const missing = await Lot.find({
    $or: [{ 'explanation.xulosa': '' }, { 'explanation.xulosa': { $exists: false } }],
  }).limit(5000);

  if (!missing.length) return 0;

  const tenderIds = [...new Set(missing.map(lot => lot.tenderId))];
  const tenders = await Tender.find({ id: { $in: tenderIds } }).lean();
  const byId = new Map(tenders.map(tender => [tender.id, tender]));

  let filled = 0;
  for (const lot of missing) {
    try {
      lot.explanation = basicExplanationFor(lot.toObject(), byId.get(lot.tenderId));
      await lot.save();
      filled += 1;
    } catch (err) {
      logger.error(`Lot tushuntirishini yozib bo'lmadi: ${lot.id}`, err);
    }
  }
  return filled;
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
  backfillExplanations,
  syncLotCounts,
  normalizeLot,
};
