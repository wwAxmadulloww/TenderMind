'use strict';

const { User, Tender, Lot, Subscription } = require('../models');
const tenderRepository = require('../repositories/tenderRepository');
const lotRepository = require('../repositories/lotRepository');
const billing = require('../services/billing');
const asyncHandler = require('../utils/asyncHandler');
const logger = require('../logger');

// ── STATISTIKA ────────────────────────────────────────────────────────
async function stats(req, res) {
  const [
    users, admins, tenders, demoTenders, lots, explainedLots,
    activeSubs, pendingSubs, proUsers,
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ role: 'admin' }),
    Tender.countDocuments(),
    Tender.countDocuments({ isDemo: true }),
    Lot.countDocuments(),
    Lot.countDocuments({ 'explanation.xulosa': { $ne: '' } }),
    Subscription.countDocuments({ status: 'active' }),
    Subscription.countDocuments({ status: 'pending' }),
    User.countDocuments({ plan: { $in: ['pro', 'corporate'] } }),
  ]);

  const weekAgo = new Date(Date.now() - 7 * 86400000);
  const newUsersThisWeek = await User.countDocuments({ createdAt: { $gte: weekAgo } });

  res.json({
    users: { total: users, admins, pro: proUsers, newThisWeek: newUsersThisWeek },
    tenders: { total: tenders, demo: demoTenders, real: tenders - demoTenders },
    lots: { total: lots, explained: explainedLots },
    subscriptions: { active: activeSubs, pending: pendingSubs },
  });
}

// ── TENDERLAR ─────────────────────────────────────────────────────────
async function listTenders(req, res) {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const filter = {};
  if (req.query.isDemo === 'true') filter.isDemo = true;
  if (req.query.isDemo === 'false') filter.isDemo = false;
  if (req.query.search) filter.title = new RegExp(String(req.query.search).trim(), 'i');

  const [total, items] = await Promise.all([
    Tender.countDocuments(filter),
    Tender.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
  ]);

  res.json({ total, page, limit, pages: Math.ceil(total / limit), items });
}

async function createTender(req, res) {
  const body = req.body || {};
  const required = ['title', 'soha', 'hudud', 'org', 'budgetRaw', 'deadline'];
  const missing = required.filter(field => !body[field]);
  if (missing.length) {
    return res.status(400).json({ error: `Majburiy maydonlar to'ldirilmagan: ${missing.join(', ')}` });
  }

  const budgetRaw = Number(body.budgetRaw);
  if (!Number.isFinite(budgetRaw) || budgetRaw <= 0) {
    return res.status(400).json({ error: 'Byudjet musbat son bo\'lishi kerak' });
  }

  const tender = await Tender.create({
    ...body,
    budgetRaw,
    budget: body.budget || new Intl.NumberFormat('uz-UZ').format(budgetRaw),
    // Admin qo'lda kiritgan yozuv demo emas va tekshirilgan hisoblanadi —
    // uni kiritishning o'zi tekshiruv. Avtomatik ingestion esa
    // isVerified: false bilan keladi va alohida tasdiqlanadi.
    isDemo: body.isDemo === true,
    isVerified: body.isVerified !== false,
    createdBy: req.dbUser.phone,
  });

  logger.info(`Admin ${req.dbUser.phone} tender yaratdi: ${tender.id}`);
  res.status(201).json({ success: true, tender: tenderRepository.normalizeTender(tender) });
}

async function updateTender(req, res) {
  const tender = await Tender.findOne({ id: req.params.id });
  if (!tender) return res.status(404).json({ error: 'Tender topilmadi' });

  // id va createdBy ni tashqaridan o'zgartirishga yo'l qo'ymaymiz
  const { id, createdBy, _id, ...updatable } = req.body || {};
  Object.assign(tender, updatable);
  if (updatable.budgetRaw) {
    tender.budget = updatable.budget || new Intl.NumberFormat('uz-UZ').format(Number(updatable.budgetRaw));
  }
  await tender.save();

  res.json({ success: true, tender: tenderRepository.normalizeTender(tender) });
}

async function deleteTender(req, res) {
  const tender = await Tender.findOne({ id: req.params.id });
  if (!tender) return res.status(404).json({ error: 'Tender topilmadi' });

  // Tenderni o'chirishda uning lotlari ham o'chadi — aks holda
  // bazada egasi yo'q lotlar qolib ketadi
  const removedLots = await Lot.deleteMany({ tenderId: tender.id });
  await Tender.deleteOne({ id: tender.id });

  logger.info(`Admin ${req.dbUser.phone} tender o'chirdi: ${tender.id}`);
  res.json({ success: true, deletedLots: removedLots.deletedCount });
}

// ── LOTLAR ────────────────────────────────────────────────────────────
async function createLot(req, res) {
  const body = req.body || {};
  const tender = await Tender.findOne({ id: body.tenderId });
  if (!tender) return res.status(404).json({ error: 'Tender topilmadi' });

  const startPrice = Number(body.startPrice);
  if (!Number.isFinite(startPrice) || startPrice <= 0) {
    return res.status(400).json({ error: 'Boshlang\'ich narx musbat son bo\'lishi kerak' });
  }
  if (!body.title || !body.deadline) {
    return res.status(400).json({ error: 'Nomi va muddati majburiy' });
  }

  const lastLot = await Lot.findOne({ tenderId: tender.id }).sort({ lotNumber: -1 }).lean();

  const lot = await Lot.create({
    ...body,
    startPrice,
    lotNumber: body.lotNumber || (lastLot ? lastLot.lotNumber + 1 : 1),
    isDemo: tender.isDemo,
  });

  await lotRepository.syncLotCounts();
  res.status(201).json({ success: true, lot: lotRepository.normalizeLot(lot) });
}

async function updateLot(req, res) {
  const lot = await Lot.findOne({ id: req.params.id });
  if (!lot) return res.status(404).json({ error: 'Lot topilmadi' });

  const { id, _id, ...updatable } = req.body || {};
  Object.assign(lot, updatable);

  // Lot mazmuni o'zgardi — eski tushuntirish endi to'g'ri kelmasligi mumkin
  if (updatable.title || updatable.description || updatable.requirements || updatable.startPrice) {
    lot.explanation = { ...lot.explanation.toObject?.() ?? lot.explanation, generatedAt: null };
  }

  await lot.save();
  res.json({ success: true, lot: lotRepository.normalizeLot(lot) });
}

async function deleteLot(req, res) {
  const result = await Lot.deleteOne({ id: req.params.id });
  if (!result.deletedCount) return res.status(404).json({ error: 'Lot topilmadi' });
  await lotRepository.syncLotCounts();
  res.json({ success: true });
}

// ── FOYDALANUVCHILAR ──────────────────────────────────────────────────
async function listUsers(req, res) {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const filter = {};
  if (req.query.plan) filter.plan = req.query.plan;
  if (req.query.search) {
    const q = String(req.query.search).trim();
    filter.$or = [{ name: new RegExp(q, 'i') }, { phone: new RegExp(q, 'i') }, { company: new RegExp(q, 'i') }];
  }

  const [total, users] = await Promise.all([
    User.countDocuments(filter),
    User.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
  ]);

  res.json({
    total, page, limit, pages: Math.ceil(total / limit),
    // passwordHash hech qachon tashqariga chiqmasligi kerak
    items: users.map(u => ({
      id: u.id, name: u.name, phone: u.phone, company: u.company,
      role: u.role, plan: u.plan, planExpiresAt: u.planExpiresAt,
      createdAt: u.createdAt, lastLoginAt: u.lastLoginAt,
    })),
  });
}

async function updateUserPlan(req, res) {
  const { plan, months } = req.body || {};
  if (!['free', 'pro', 'corporate'].includes(plan)) {
    return res.status(400).json({ error: 'Noma\'lum tarif' });
  }

  const user = await User.findOne({ id: req.params.id });
  if (!user) return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });

  user.plan = plan;
  user.planExpiresAt = plan === 'free'
    ? null
    : billing.addMonths(new Date(), Math.max(1, Number(months) || 1));
  await user.save();

  logger.info(`Admin ${req.dbUser.phone} tarifni o'zgartirdi: ${user.phone} → ${plan}`);
  res.json({ success: true, user: { id: user.id, plan: user.plan, planExpiresAt: user.planExpiresAt } });
}

// ── OBUNALAR ──────────────────────────────────────────────────────────
async function listSubscriptions(req, res) {
  const filter = req.query.status ? { status: req.query.status } : {};
  const subs = await Subscription.find(filter).sort({ createdAt: -1 }).limit(100).lean();

  // Har bir obunaga foydalanuvchi ma'lumotini qo'shamiz
  const userIds = [...new Set(subs.map(s => s.userId))];
  const users = await User.find({ id: { $in: userIds } }).lean();
  const byId = new Map(users.map(u => [u.id, u]));

  res.json({
    total: subs.length,
    items: subs.map(s => ({
      id: s.id, plan: s.plan, status: s.status, amount: s.amount, currency: s.currency,
      paymentMethod: s.paymentMethod, invoiceNumber: s.invoiceNumber,
      startDate: s.startDate, endDate: s.endDate, createdAt: s.createdAt,
      user: byId.get(s.userId)
        ? { id: s.userId, name: byId.get(s.userId).name, phone: byId.get(s.userId).phone, company: byId.get(s.userId).company }
        : { id: s.userId, name: 'O\'chirilgan foydalanuvchi' },
    })),
  });
}

async function approveSubscription(req, res) {
  const result = await billing.approveSubscription(req.params.id, {
    transactionId: req.body?.transactionId,
    approvedBy: req.dbUser.phone,
  });
  res.json({
    success: true,
    alreadyActive: result.alreadyActive,
    subscription: { id: result.subscription.id, status: result.subscription.status, endDate: result.subscription.endDate },
  });
}

async function rejectSubscription(req, res) {
  const subscription = await billing.rejectSubscription(req.params.id, req.body?.reason);
  res.json({ success: true, subscription: { id: subscription.id, status: subscription.status } });
}

module.exports = {
  stats: asyncHandler(stats),
  listTenders: asyncHandler(listTenders),
  createTender: asyncHandler(createTender),
  updateTender: asyncHandler(updateTender),
  deleteTender: asyncHandler(deleteTender),
  createLot: asyncHandler(createLot),
  updateLot: asyncHandler(updateLot),
  deleteLot: asyncHandler(deleteLot),
  listUsers: asyncHandler(listUsers),
  updateUserPlan: asyncHandler(updateUserPlan),
  listSubscriptions: asyncHandler(listSubscriptions),
  approveSubscription: asyncHandler(approveSubscription),
  rejectSubscription: asyncHandler(rejectSubscription),
};
