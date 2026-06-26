'use strict';

const { Tender } = require('../models');
const { TENDERS_SEED } = require('../seed-tenders');

function normalizeTender(tender) {
  if (!tender) return null;
  const obj = typeof tender.toObject === 'function' ? tender.toObject() : { ...tender };
  obj.isNew = Boolean(obj.isFresh || obj.isNew);
  delete obj.isFresh;
  delete obj._id;
  delete obj.__v;
  return obj;
}

function buildFilter({ soha, hudud, status, search } = {}) {
  const filter = {};
  if (soha && soha !== 'all') filter.soha = soha;
  if (hudud && hudud !== 'all') filter.hudud = hudud;
  if (status && status !== 'all') filter.status = status;
  if (search) {
    const q = String(search).trim();
    if (q) {
      filter.$or = [
        { title: new RegExp(q, 'i') },
        { org: new RegExp(q, 'i') },
        { tags: new RegExp(q, 'i') },
      ];
    }
  }
  return filter;
}

function buildSort(sort) {
  if (sort === 'budget') return { budgetRaw: -1 };
  if (sort === 'date') return { deadline: 1 };
  if (sort === 'newest') return { postedDate: -1 };
  return { probability: -1 };
}

async function ensureSeeded() {
  const count = await Tender.countDocuments();
  if (count > 0) return count;
  const docs = TENDERS_SEED.map(t => ({
    ...t,
    isFresh: Boolean(t.isFresh || t.isNew),
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
  list,
  findById,
  findManyByIds,
  count,
  normalizeTender,
};
