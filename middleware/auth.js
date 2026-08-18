'use strict';

const jwt = require('jsonwebtoken');
const config = require('../config');
const { User } = require('../models');
const { isDBConnected } = require('../db');

function extractToken(req) {
  const authHeader = req.headers.authorization || '';
  const [scheme, token] = authHeader.split(' ');
  if (scheme === 'Bearer' && token) return token;
  if (req.cookies && req.cookies.tm_token) return req.cookies.tm_token;
  return '';
}

/**
 * Autentifikatsiya.
 *
 * Ikki bosqich:
 *   1. Imzo tekshiruvi — token haqiqatan bizniki ekanini isbotlaydi;
 *   2. Token avlodi (`tv`) bazadagi qiymatga mos kelishi.
 *
 * Ikkinchi bosqich bazani talab qiladi va ataylab shunday: usiz
 * "Chiqish" tugmasi hech narsani bekor qilmaydi va o'g'irlangan token
 * 30 kun davomida ishlayveradi. Baza uzilgan bo'lsa 503 qaytariladi —
 * foydalanuvchini tekshira olmasak, uni ichkariga qo'ymaymiz.
 *
 * Yon foyda: topilgan foydalanuvchi `req.dbUser` ga yoziladi, shuning
 * uchun keyingi middleware va controllerlar uni qayta izlamaydi.
 */
async function authMiddleware(req, res, next) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: 'Token talab qilinadi' });

  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
  } catch {
    return res.status(401).json({ error: 'Yaroqsiz token' });
  }

  if (!isDBConnected()) {
    return res.status(503).json({ error: 'Ma\'lumotlar bazasi vaqtincha mavjud emas' });
  }

  try {
    const user = await User.findOne({ id: payload.id });
    if (!user) {
      return res.status(401).json({ error: 'Sessiya yaroqsiz — qaytadan kiring' });
    }

    // Eski avloddagi token — chiqilgan yoki parol almashtirilgan
    if ((payload.tv || 0) !== (user.tokenVersion || 0)) {
      return res.status(401).json({ error: 'Sessiya tugadi — qaytadan kiring' });
    }

    req.user = payload;
    req.dbUser = user;
    return next();
  } catch (err) {
    return next(err);
  }
}

/**
 * Ixtiyoriy autentifikatsiya.
 *
 * Sahifa hamma uchun ochiq, lekin tizimga kirgan foydalanuvchiga
 * qo'shimcha ma'lumot (masalan yo'riqnoma progressi) ko'rsatiladi.
 * Token yo'q yoki yaroqsiz bo'lsa — xato emas, shunchaki mehmon sifatida
 * davom etiladi.
 */
async function optionalAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) return next();

  try {
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
    if (!isDBConnected()) return next();

    const user = await User.findOne({ id: payload.id });
    // Bekor qilingan token — mehmon sifatida davom etamiz, 401 bermaymiz:
    // sahifaning o'zi ochiq va u ko'rinishi kerak.
    if (user && (payload.tv || 0) === (user.tokenVersion || 0)) {
      req.user = payload;
      req.dbUser = user;
    }
  } catch {
    // Yaroqsiz token — e'tiborsiz qoldiriladi
  }

  return next();
}

/** Kirish/ro'yxatdan o'tishda token yasash — avlod raqami bilan */
function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      name: user.name,
      phone: user.phone,
      tv: user.tokenVersion || 0,
    },
    config.jwtSecret,
    { expiresIn: '30d' }
  );
}

module.exports = { authMiddleware, optionalAuth, extractToken, signToken };
