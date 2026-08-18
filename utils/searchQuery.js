'use strict';

/**
 * QIDIRUV SO'ROVINI XAVFSIZ REGEXP GA AYLANTIRISH
 *
 * Foydalanuvchi kiritmasini to'g'ridan-to'g'ri `new RegExp()` ga berish
 * ikki xil muammo tug'diradi:
 *
 *   1. Oddiy so'rov serverni yiqitadi. "C++" → `Invalid regular
 *      expression` → 500. Odam hech qanday yomon niyatsiz shunday yozadi.
 *   2. Maxsus tuzilgan namuna (masalan `(a+)+$`) katastrofik
 *      backtracking keltirib chiqaradi — ReDoS.
 *
 * Yechim: barcha maxsus belgilar qochiriladi, ya'ni so'rov faqat oddiy
 * matn sifatida qidiriladi. Uzunlik ham cheklanadi.
 */

const MAX_SEARCH_LENGTH = 120;

/** RegExp uchun maxsus ma'noga ega barcha belgilarni qochirish */
function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Qidiruv so'rovini tozalash.
 * @returns {string} bo'sh satr — qidiruv qo'llanilmasligi kerakligini bildiradi
 */
function sanitizeSearch(input) {
  if (typeof input !== 'string' && typeof input !== 'number') return '';
  return String(input).trim().slice(0, MAX_SEARCH_LENGTH);
}

/**
 * Tozalangan so'rovdan xavfsiz, harf registriga bog'liq bo'lmagan RegExp.
 * @returns {RegExp|null} null — qidiradigan narsa yo'q
 */
function searchRegex(input) {
  const clean = sanitizeSearch(input);
  if (!clean) return null;
  return new RegExp(escapeRegex(clean), 'i');
}

module.exports = { escapeRegex, sanitizeSearch, searchRegex, MAX_SEARCH_LENGTH };
