'use strict';

/**
 * TARIFLAR
 *
 * Narxlar shu yerda — kodning boshqa joyida qo'lda yozilmasin.
 * `limits` db.js dagi getPlanLimits() bilan mos bo'lishi shart.
 *
 * QOIDA: bu ro'yxatda faqat HAQIQATDA farq qiladigan narsa yoziladi.
 * Ilgari Pro "Tenderlarni taqqoslash" va "G'alaba strategiyasi" ni
 * sotardi, holbuki ikkalasi ham bepul tarifda ochiq edi — kod ularni
 * hech qachon cheklamagan. Pul to'lagan odam allaqachon tekin bo'lgan
 * narsani olsa, bu tarifga emas, mahsulotga ishonchni yo'qotadi.
 */

const PLANS = {
  free: {
    id: 'free',
    name: 'Bepul',
    priceMonthly: 0,
    currency: 'UZS',
    description: 'Tenderni o\'rganish va qatnashish uchun — yetarli',
    features: [
      'Barcha tenderlar va lotlarni ko\'rish — cheksiz',
      'Lotlarni oddiy tilda tushuntirish — cheksiz',
      '"Menga mos keladimi?" tahlili — cheksiz',
      'Tenderlarni taqqoslash va g\'alaba strategiyasi',
      'Atamalar lug\'ati va boshlang\'ich yo\'riqnoma',
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
      'Kuniga 99 ta AI hujjat to\'plami — bepulda 1 ta',
      'Kuniga 100 ta AI maslahat xabari — bepulda 10 ta',
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
      'Kuniga 200 ta AI maslahat xabari — Pro da 100 ta',
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
