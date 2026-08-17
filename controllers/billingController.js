'use strict';

const billing = require('../services/billing');
const { PLANS, getPlan, calculatePrice } = require('../config/plans');
const { Subscription, User } = require('../models');
const asyncHandler = require('../utils/asyncHandler');

/** GET /api/billing/plans — tariflar va to'lov usullari (ochiq) */
function listPlans(req, res) {
  res.json({
    plans: Object.values(PLANS),
    paymentMethods: billing.availableMethods(),
  });
}

/** GET /api/billing/me — joriy tarif holati */
async function myBilling(req, res) {
  const user = await User.findOne({ id: req.user.id });
  if (!user) return res.status(401).json({ error: 'Sessiya yaroqsiz — qaytadan kiring' });

  const subscriptions = await Subscription.find({ userId: user.id })
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();

  res.json({
    plan: user.plan,
    planName: getPlan(user.plan)?.name || user.plan,
    planExpiresAt: user.planExpiresAt,
    isActive: user.isPlanActive(),
    limits: user.getPlanLimits(),
    usedToday: { doc: user.quotaUsed('doc'), chat: user.quotaUsed('chat') },
    subscriptions: subscriptions.map(s => ({
      id: s.id, plan: s.plan, status: s.status, amount: s.amount,
      currency: s.currency, invoiceNumber: s.invoiceNumber,
      startDate: s.startDate, endDate: s.endDate, createdAt: s.createdAt,
    })),
  });
}

/** POST /api/billing/subscribe — obuna so'rovi yaratish */
async function subscribe(req, res) {
  const { plan, months, paymentMethod } = req.body;

  if (!getPlan(plan)) {
    return res.status(400).json({ error: 'Noma\'lum tarif' });
  }

  const result = await billing.createSubscriptionRequest({
    userId: req.user.id,
    planId: plan,
    months,
    paymentMethod: paymentMethod || 'transfer',
  });

  const s = result.subscription;

  res.status(result.alreadyPending ? 200 : 201).json({
    success: true,
    alreadyPending: result.alreadyPending,
    message: result.alreadyPending
      ? 'Sizda tasdiqlanmagan to\'lov so\'rovi bor. Avval o\'shani yakunlang.'
      : 'Hisob-faktura yaratildi. To\'lovni amalga oshiring — tasdiqlangach tarif faollashadi.',
    invoice: {
      id: s.id,
      invoiceNumber: s.invoiceNumber,
      plan: s.plan,
      planName: getPlan(s.plan)?.name,
      amount: s.amount,
      currency: s.currency,
      status: s.status,
      createdAt: s.createdAt,
    },
    // To'lov avtomatik emas — foydalanuvchi buni aniq bilishi kerak
    instructions: [
      `To'lov summasi: ${new Intl.NumberFormat('uz-UZ').format(s.amount)} ${s.currency}`,
      `To'lov izohida hisob-faktura raqamini ko'rsating: ${s.invoiceNumber}`,
      'To\'lov tasdiqlangach tarifingiz avtomatik faollashadi (odatda 1 ish kuni ichida).',
    ],
  });
}

/** POST /api/billing/quote — narxni oldindan hisoblash */
function quote(req, res) {
  const { plan, months } = req.body;
  const price = calculatePrice(plan, months);
  if (!price) return res.status(400).json({ error: 'Noma\'lum tarif' });
  res.json({ plan, ...price });
}

module.exports = {
  listPlans,
  quote,
  myBilling: asyncHandler(myBilling),
  subscribe: asyncHandler(subscribe),
};
