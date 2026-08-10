'use strict';

const { User } = require('../models');

/**
 * Admin huquqini tekshirish.
 *
 * MUHIM: rol tokendan EMAS, bazadan o'qiladi. Token 30 kun yashaydi —
 * agar rol token ichida saqlansa, huquqi olib tashlangan foydalanuvchi
 * yana bir oy davomida admin bo'lib qolaverardi.
 *
 * authMiddleware dan keyin ishlatiladi.
 */
async function requireAdmin(req, res, next) {
  try {
    const user = await User.findOne({ id: req.user.id });
    if (!user) return res.status(401).json({ error: 'Sessiya yaroqsiz — qaytadan kiring' });

    if (user.role !== 'admin') {
      return res.status(403).json({ error: 'Bu bo\'lim faqat administratorlar uchun' });
    }

    req.dbUser = user;
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = { requireAdmin };
