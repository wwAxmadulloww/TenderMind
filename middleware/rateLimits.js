'use strict';

const rateLimit = require('express-rate-limit');
const config = require('../config');

/**
 * CHEKLOVLAR BIR JOYDA
 *
 * Qiymatlar `config.rateLimits` dan olinadi. Test muhitida ular ataylab
 * yuqori: barcha testlar bitta IP dan keladi, ya'ni haqiqiy limitlar
 * bilan ular bir-birini bloklab qo'yadi va tekshirilayotgan mantiq emas,
 * limit sinaladi. Limitlarning O'ZI alohida testda tekshiriladi
 * (tests/rate-limit.test.js) — u limiterni past qiymat bilan quradi.
 */

const { rateLimits } = config;

function build({ windowMs, max, message, skipSuccessfulRequests = false }) {
  return rateLimit({
    windowMs,
    max,
    skipSuccessfulRequests,
    message: { error: message },
    standardHeaders: true,
    legacyHeaders: false,
  });
}

/** Ro'yxatdan o'tish — soxta hisoblar oqimini to'xtatadi */
const registerLimiter = build({
  windowMs: 60 * 60 * 1000,
  max: rateLimits.register,
  message: 'Ko\'p urinish. Bir soatdan keyin qaytadan urinib ko\'ring.',
});

/** Kirish — parol tanlashga qarshi. Muvaffaqiyatli kirish sanalmaydi. */
const loginLimiter = build({
  windowMs: 15 * 60 * 1000,
  max: rateLimits.login,
  skipSuccessfulRequests: true,
  message: 'Ko\'p marta noto\'g\'ri urinish. 15 daqiqadan keyin qaytadan urinib ko\'ring.',
});

/** SMS kodi — har bir xabar pul turadi, shuning uchun eng qattiq */
const codeLimiter = build({
  windowMs: 60 * 60 * 1000,
  max: rateLimits.smsCode,
  message: 'Ko\'p marta kod so\'raldi. Bir soatdan keyin urinib ko\'ring.',
});

/** Qolgan auth amallari uchun umumiy tormoz */
const authLimiter = build({
  windowMs: 15 * 60 * 1000,
  max: rateLimits.auth,
  message: 'Juda ko\'p so\'rov. 15 daqiqadan keyin urinib ko\'ring.',
});

module.exports = { build, registerLimiter, loginLimiter, codeLimiter, authLimiter };
