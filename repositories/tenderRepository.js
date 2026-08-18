'use strict';

const { Tender } = require('../models');
const { TENDERS_SEED } = require('../seed-tenders');
const { searchRegex } = require('../utils/searchQuery');

function normalizeTender(tender) {
  if (!tender) return null;
  const obj = typeof tender.toObject === 'function' ? tender.toObject() : { ...tender };
  obj.isNew = Boolean(obj.isFresh || obj.isNew);
  delete obj.isFresh;
  delete obj._id;
  delete obj.__v;

  // `probability` va `competitors` — demo yozuvlarda hisoblangan emas,
  // qo'lda kiritilgan qiymatlar. Mijoz ularni fakt sifatida ko'rsatmasligi
  // uchun ochiq belgi qo'yiladi.
  obj.isDemo = Boolean(obj.isDemo);
  obj.estimatesAreDemo = obj.isDemo;
  if (obj.isDemo) {
    obj.dataNote = 'Namunaviy ma\'lumot — o\'rganish uchun. Haqiqiy e\'lon emas.';
  }
  return obj;
}

function buildFilter({ soha, hudud, status, search } = {}) {
  const filter = {};
  if (soha && soha !== 'all') filter.soha = soha;
  if (hudud && hudud !== 'all') filter.hudud = hudud;
  if (status && status !== 'all') filter.status = status;
  // Foydalanuvchi kiritmasi hech qachon to'g'ridan-to'g'ri RegExp ga
  // bermaydi — "C++" kabi oddiy so'rov ham serverni yiqitardi.
  const pattern = searchRegex(search);
  if (pattern) {
    filter.$or = [
      { title: pattern },
      { org: pattern },
      { tags: pattern },
    ];
  }
  return filter;
}

function buildSort(sort) {
  if (sort === 'budget') return { budgetRaw: -1 };
  if (sort === 'date') return { deadline: 1 };
  if (sort === 'newest') return { postedDate: -1 };
  // probability haqiqiy e'lonlarda null bo'ladi — bunday yozuvlar oxirida
  // qolmasligi uchun ikkinchi mezon sifatida e'lon sanasi ishlatiladi.
  return { probability: -1, postedDate: -1 };
}

const DAY_MS = 86400000;
const toISODate = (date) => new Date(date).toISOString().slice(0, 10);

/**
 * Demo sanalarini bugungi kunga surish.
 *
 * Seed faylidagi sanalar qat'iy yozilgan, shuning uchun vaqt o'tishi bilan
 * hamma demo tender "muddati tugagan" holatga tushib qoladi va ilova
 * bo'sh ko'rinadi. Bu yerda eng erta e'lon sanasi "bugun" deb olinadi va
 * qolgan barcha sanalar shu farq bo'yicha suriladi — nisbiy tartib va
 * shoshilinchlik saqlanadi.
 */
function shiftSeedDates(seed) {
  const posted = seed
    .map(t => new Date(t.postedDate).getTime())
    .filter(ms => Number.isFinite(ms));
  if (!posted.length) return seed;

  const earliest = Math.min(...posted);
  const offset = Date.now() - earliest;
  if (offset <= 0) return seed;   // sanalar allaqachon kelajakda

  return seed.map(t => ({
    ...t,
    postedDate: toISODate(new Date(t.postedDate).getTime() + offset),
    deadline: toISODate(new Date(t.deadline).getTime() + offset),
  }));
}

async function ensureSeeded() {
  const count = await Tender.countDocuments();
  if (count > 0) return count;
  const docs = shiftSeedDates(TENDERS_SEED).map(t => ({
    ...t,
    isFresh: Boolean(t.isFresh || t.isNew),
    // Seed ma'lumoti — namunaviy, haqiqiy e'lon emas. Interfeys buni
    // ochiq ko'rsatadi; haqiqiy ingestion ishga tushganda yangi
    // yozuvlarda isDemo=false bo'ladi.
    isDemo: true,
    isVerified: false,
    sourceName: 'demo',
  }));
  await Tender.insertMany(docs, { ordered: false });
  return docs.length;
}

async function list(params = {}) {
  const page = Math.max(1, parseInt(params.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(params.limit, 10) || 12));
  const filter = buildFilter(params);
  const sort = buildSort(params.sort);
  const total = await Tender.countDocuments(filter);
  const items = await Tender.find(filter)
    .sort(sort)
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  return {
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
    items: items.map(normalizeTender),
  };
}

async function findById(id) {
  return normalizeTender(await Tender.findOne({ id }).lean());
}

async function findManyByIds(ids = []) {
  if (!ids.length) return [];
  const docs = await Tender.find({ id: { $in: ids } }).lean();
  const byId = new Map(docs.map(doc => [doc.id, normalizeTender(doc)]));
  return ids.map(id => byId.get(id)).filter(Boolean);
}

async function count() {
  return Tender.countDocuments();
}

module.exports = {
  ensureSeeded,
  shiftSeedDates,
  list,
  findById,
  findManyByIds,
  count,
  normalizeTender,
};
