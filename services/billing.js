'use strict';

const { Subscription, User } = require('../models');
const { getPlan, calculatePrice, PAID_PLANS } = require('../config/plans');
const logger = require('../logger');

/**
 * TO'LOV HOLATI — ochiq aytilgan chegara
 *
 * Hozir faqat "manual" usul to'liq ishlaydi: foydalanuvchi hisob-faktura
 * oladi, pul o'tkazadi, administrator tasdiqlaydi va tarif faollashadi.
 * Bu oqim to'liq va ishonchli.
 *
 * Payme/Click avtomatik integratsiyasi uchun merchant kaliti va ular
 * tomonidan tasdiqlangan webhook manzili kerak. Kalitlar berilmagunicha
 * bu usullar "sozlanmagan" deb qaytariladi — yolg'on "to'lov qabul
 * qilindi" javobi berilmaydi.
 */
const PAYMENT_METHODS = {
  transfer: { id: 'transfer', name: 'Bank o\'tkazmasi', automatic: false, enabled: true },
  payme: { id: 'payme', name: 'Payme', automatic: true, enabled: false },
  click: { id: 'click', name: 'Click', automatic: true, enabled: false },
};

function availableMethods() {
  return Object.values(PAYMENT_METHODS).filter(m => m.enabled);
}

function generateInvoiceNumber() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.floor(1000 + Math.random() * 9000);
  return `TM-${date}-${random}`;
}

function addMonths(date, months) {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

/**
 * Obuna so'rovini yaratish. Tarif DARHOL faollashmaydi — avval to'lov
 * tasdiqlanishi kerak.
 */
async function createSubscriptionRequest({ userId, planId, months = 1, paymentMethod = 'transfer' }) {
  if (!PAID_PLANS.includes(planId)) {
    throw Object.assign(new Error('Bu tarif uchun to\'lov talab qilinmaydi'), { status: 400 });
  }

  const method = PAYMENT_METHODS[paymentMethod];
  if (!method) {
    throw Object.assign(new Error('Noma\'lum to\'lov usuli'), { status: 400 });
  }
  if (!method.enabled) {
    throw Object.assign(
      new Error(`${method.name} hozircha ulanmagan. Bank o'tkazmasi usulidan foydalaning.`),
      { status: 503 }
    );
  }

  // Bir vaqtning o'zida bitta kutilayotgan so'rov
  const pending = await Subscription.findOne({ userId, status: 'pending' });
  if (pending) {
    return { subscription: pending, alreadyPending: true };
  }

  const price = calculatePrice(planId, months);
  const startDate = new Date();

  const subscription = await Subscription.create({
    userId,
    plan: planId,
    status: 'pending',
    paymentMethod,
    amount: price.amount,
    currency: price.currency,
    startDate,
    endDate: addMonths(startDate, price.months),
    invoiceNumber: generateInvoiceNumber(),
  });

  return { subscription, alreadyPending: false, price };
}

/**
 * To'lovni tasdiqlash — tarifni faollashtiradi.
 * Faqat administrator (yoki kelajakda to'lov tizimi webhook'i) chaqiradi.
 */
async function approveSubscription(subscriptionId, { transactionId = '', approvedBy = '' } = {}) {
  const subscription = await Subscription.findOne({ id: subscriptionId });
  if (!subscription) {
    throw Object.assign(new Error('Obuna topilmadi'), { status: 404 });
  }
  if (subscription.status === 'active') {
    return { subscription, alreadyActive: true };
  }

  const user = await User.findOne({ id: subscription.userId });
  if (!user) {
    throw Object.assign(new Error('Foydalanuvchi topilmadi'), { status: 404 });
  }

  // Amaldagi obuna hali tugamagan bo'lsa — yangi muddat uning ustiga qo'shiladi
  const now = new Date();
  const base = user.planExpiresAt && new Date(user.planExpiresAt) > now
    ? new Date(user.planExpiresAt)
    : now;

  const months = Math.max(1, Math.round(
    (new Date(subscription.endDate) - new Date(subscription.startDate)) / (30 * 86400000)
  ));

  subscription.status = 'active';
  subscription.startDate = now;
  subscription.endDate = addMonths(base, months);
  if (transactionId) subscription.transactionId = transactionId;
  await subscription.save();

  user.plan = subscription.plan;
  user.planExpiresAt = subscription.endDate;
  await user.save();

  logger.info(`Obuna faollashtirildi: ${user.phone} → ${subscription.plan} (${approvedBy || 'admin'})`);
  return { subscription, user, alreadyActive: false };
}

async function rejectSubscription(subscriptionId, reason = '') {
  const subscription = await Subscription.findOne({ id: subscriptionId });
  if (!subscription) {
    throw Object.assign(new Error('Obuna topilmadi'), { status: 404 });
  }
  subscription.status = 'canceled';
  await subscription.save();
  logger.info(`Obuna rad etildi: ${subscriptionId} — ${reason || 'sabab ko\'rsatilmagan'}`);
  return subscription;
}

/**
 * Muddati tugagan obunalarni yopish va foydalanuvchini free ga qaytarish.
 * Kunlik cron yoki server ishga tushganda chaqiriladi.
 */
async function expireOutdatedSubscriptions() {
  const now = new Date();
  const expired = await Subscription.find({ status: 'active', endDate: { $lt: now } });

  for (const subscription of expired) {
    subscription.status = 'expired';
    await subscription.save();

    const user = await User.findOne({ id: subscription.userId });
    // Foydalanuvchida yangiroq faol obuna bo'lsa — tegmaymiz
    if (user && (!user.planExpiresAt || new Date(user.planExpiresAt) <= now)) {
      user.plan = 'free';
      user.planExpiresAt = null;
      await user.save();
    }
  }

  return expired.length;
}

module.exports = {
  PAYMENT_METHODS,
  availableMethods,
  createSubscriptionRequest,
  approveSubscription,
  rejectSubscription,
  expireOutdatedSubscriptions,
  generateInvoiceNumber,
  addMonths,
};
