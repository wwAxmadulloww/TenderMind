'use strict';

const { Tender } = require('../models');
const { TENDERS_SEED } = require('../seed-tenders');
const { searchRegex } = require('../utils/searchQuery');

const DAY_MS = 86400000;
const toISODate = (date) => new Date(date).toISOString().slice(0, 10);

/** Bugun, `YYYY-MM-DD` — deadline ham shu shaklda saqlanadi */
const todayISO = () => toISODate(Date.now());

/** Shu kundan boshlab n kun keyingi sana */
const inDaysISO = (n) => toISODate(Date.now() + n * DAY_MS);

// Shuncha kun qolganda e'lon "shoshilinch" hisoblanadi.
const URGENT_WITHIN_DAYS = 7;

/**
 * E'lon holati — SAQLANGAN maydondan emas, MUDDATDAN hisoblanadi.
 *
 * Saqlangan `status` vaqt o'tishi bilan haqiqatdan uzoqlashadi: hech kim
 * uni yangilab turmaydi, shuning uchun muddati o'tgan e'lon abadiy
 * "faol" bo'lib qolaverardi va odam qatnasha olmaydigan tenderni ko'rardi.
 * Bekor qilingan va qo'lda yopilgan e'lonlargina saqlangan qiymatda
 * qoladi — ularni sana emas, buyurtmachining qarori belgilaydi.
 */
const CLOSED_BY_HAND = ['closed', 'canceled'];

function computeStatus(stored, deadline) {
  if (CLOSED_BY_HAND.includes(stored)) return stored;
  const day = String(deadline || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return stored || 'active';
  if (day < todayISO()) return 'closed';
  if (day <= inDaysISO(URGENT_WITHIN_DAYS)) return 'urgent';
  return 'active';
}

function normalizeTender(tender) {
  if (!tender) return null;
  const obj = typeof tender.toObject === 'function' ? tender.toObject() : { ...tender };
  obj.isNew = Boolean(obj.isFresh || obj.isNew);
  delete obj.isFresh;
  delete obj._id;
  delete obj.__v;

  // Mijozga ko'rsatiladigan holat — bugungi sanaga qarab. Bazadagi
  // qiymat e'lon kiritilgan kundagi holatni bildiradi, bugungisini emas.
  obj.status = computeStatus(obj.status, obj.deadline);

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

/**
 * Holat bo'yicha so'rov — sanaga tayangan holda.
 *
 * `status` maydoni bazada qoladi, lekin u faqat "qo'lda yopilganmi?"
 * degan savolga javob beradi. Faol/shoshilinch/tugagan — muddatdan.
 */
function statusCondition(status) {
  const notClosedByHand = { status: { $nin: CLOSED_BY_HAND } };

  if (status === 'active') {
    return { ...notClosedByHand, deadline: { $gte: todayISO() } };
  }
  if (status === 'urgent') {
    return { ...notClosedByHand, deadline: { $gte: todayISO(), $lte: inDaysISO(URGENT_WITHIN_DAYS) } };
  }
  if (status === 'closed') {
    return { $or: [{ status: { $in: CLOSED_BY_HAND } }, { deadline: { $lt: todayISO() } }] };
  }
  return null;
}

function buildFilter({ soha, hudud, status, search } = {}) {
  const conditions = [];
  const filter = {};
  if (soha && soha !== 'all') filter.soha = soha;
  if (hudud && hudud !== 'all') filter.hudud = hudud;

  if (status && status !== 'all') {
    const condition = statusCondition(status);
    // Noma'lum qiymat hech narsa qaytarmasin — jimgina hammasini
    // ko'rsatish foydalanuvchini chalg'itadi.
    if (condition) conditions.push(condition);
    else filter.status = status;
  }

  // Foydalanuvchi kiritmasi hech qachon to'g'ridan-to'g'ri RegExp ga
  // bermaydi — "C++" kabi oddiy so'rov ham serverni yiqitardi.
  const pattern = searchRegex(search);
  if (pattern) {
    conditions.push({ $or: [{ title: pattern }, { org: pattern }, { tags: pattern }] });
  }

  // $and — chunki holat va qidiruv ikkalasi ham `$or` ishlatishi mumkin;
  // ularni bitta obyektga qo'ysak biri ikkinchisini bosib ketardi.
  if (conditions.length) filter.$and = conditions;
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

/** Hozir taklif qabul qilayotgan e'lonlar soni */
async function countOpen() {
  return Tender.countDocuments(statusCondition('active'));
}

/**
 * Qamrov — bazada HAQIQATDA e'loni bor soha va hududlar.
 *
 * Bosh sahifadagi raqamlar lug'atdagi kalitlar sonini emas, shuni
 * ko'rsatishi kerak: "9 soha" degan yozuv yonida faqat 3 tasida e'lon
 * bo'lsa, bu o'lchov emas, va'da bo'lib qoladi.
 */
async function coverage() {
  const open = statusCondition('active');
  const [sohalar, hududlar, bySoha] = await Promise.all([
    Tender.distinct('soha', open),
    Tender.distinct('hudud', open),
    // Soha bo'yicha sanoq — filtr ro'yxatida ko'rsatiladi. Odam
    // bo'sh sohani bosib, bo'sh ro'yxatni ko'rib qaytmasligi uchun.
    Tender.aggregate([
      { $match: open },
      { $group: { _id: '$soha', count: { $sum: 1 } } },
    ]),
  ]);

  return {
    sohalar: sohalar.filter(Boolean),
    hududlar: hududlar.filter(Boolean),
    bySoha: Object.fromEntries(bySoha.filter(g => g._id).map(g => [g._id, g.count])),
  };
}

module.exports = {
  ensureSeeded,
  shiftSeedDates,
  list,
  findById,
  findManyByIds,
  count,
  countOpen,
  coverage,
  normalizeTender,
  computeStatus,
  statusCondition,
  todayISO,
  URGENT_WITHIN_DAYS,
};
