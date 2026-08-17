'use strict';

/**
 * TARIFLAR
 *
 * Narxlar shu yerda — kodning boshqa joyida qo'lda yozilmasin.
 * `limits` db.js dagi getPlanLimits() bilan mos bo'lishi shart.
 */

const PLANS = {
  free: {
    id: 'free',
    name: 'Bepul',
    priceMonthly: 0,
    currency: 'UZS',
    description: 'Sinab ko\'rish va o\'rganish uchun',
    features: [
      'Barcha tenderlar va lotlarni ko\'rish',
      'Lotlarni oddiy tilda tushuntirish',
      '"Menga mos keladimi?" tahlili — cheksiz',
      'Kuniga 1 ta AI hujjat to\'plami',
      'Kuniga 10 ta AI maslahat xabari',
    ],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    priceMonthly: 299000,
    currency: 'UZS',
    description: 'Muntazam tenderda qatnashadiganlar uchun',
    features: [
      'Bepul tarifdagi hamma narsa',
      'Kuniga 99 ta AI hujjat to\'plami',
      'Kuniga 100 ta AI maslahat xabari',
      'Tenderlarni taqqoslash',
      'G\'alaba strategiyasi',
    ],
  },
  corporate: {
    id: 'corporate',
    name: 'Korporativ',
    priceMonthly: 799000,
    currency: 'UZS',
    description: 'Jamoa bilan ishlaydigan kompaniyalar uchun',
    features: [
      'Pro tarifdagi hamma narsa',
      'Kuniga 200 ta AI maslahat xabari',
      'Ustuvor qo\'llab-quvvatlash',
    ],
  },
};

const PAID_PLANS = ['pro', 'corporate'];

function getPlan(planId) {
  return PLANS[planId] || null;
}

/** Obuna narxi — oylar soniga qarab */
function calculatePrice(planId, months = 1) {
  const plan = getPlan(planId);
  if (!plan) return null;
  const count = Math.max(1, Math.min(12, Number(months) || 1));
  // 12 oyga olganda 2 oy bepul
  const payableMonths = count === 12 ? 10 : count;
  return {
    months: count,
    amount: plan.priceMonthly * payableMonths,
    currency: plan.currency,
    discountMonths: count - payableMonths,
  };
}

module.exports = { PLANS, PAID_PLANS, getPlan, calculatePrice };
