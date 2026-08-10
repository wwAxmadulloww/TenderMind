'use strict';

const config = require('./index');
const logger = require('../logger');

// Productionda ruxsat etilgan domenlar
const prodOrigins = [
  config.frontendUrl,
  ...config.corsOrigins,
  'https://tendermind.onrender.com',
  'https://tendermind.uz',
  'https://www.tendermind.uz',
].filter(Boolean);

const allowedOrigins = Array.from(new Set(prodOrigins));

/**
 * Development da har qanday localhost porti qabul qilinadi.
 *
 * Ilgari bu yerda qat'iy ro'yxat (3000, 3001, 4020) turardi va server
 * boshqa portda ishga tushsa — masalan 3002 da — o'ZINING frontendidan
 * kelgan POST so'rovlarni ham bloklardi.
 */
function isLocalOrigin(origin) {
  try {
    const { hostname, protocol } = new URL(origin);
    if (protocol !== 'http:' && protocol !== 'https:') return false;
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  } catch {
    return false;
  }
}

/** So'rov serverning o'z domenidan kelganmi? */
function isSameHost(origin, req) {
  const host = req && req.headers && req.headers.host;
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function isAllowed(origin, req) {
  // Origin yo'q — same-origin so'rov, curl yoki mobil ilova
  if (!origin) return true;
  // Ilovaning o'z domeni har doim ruxsat etiladi. Bu FRONTEND_URL
  // sozlanmay qolganda deploy buzilishining oldini oladi.
  if (isSameHost(origin, req)) return true;
  if (!config.isProd && isLocalOrigin(origin)) return true;
  return allowedOrigins.includes(origin);
}

/**
 * cors() ning dinamik ko'rinishi — so'rovning o'zi ham kerak,
 * chunki same-host tekshiruvi Host sarlavhasiga tayanadi.
 */
function corsOptions() {
  return function corsDelegate(req, callback) {
    const origin = req.headers.origin;
    if (isAllowed(origin, req)) {
      return callback(null, { origin: true, credentials: true });
    }
    logger.warn(`CORS rejected origin: ${origin}`);
    return callback(null, { origin: false, credentials: true });
  };
}

module.exports = { corsOptions, allowedOrigins, isLocalOrigin, isAllowed };
