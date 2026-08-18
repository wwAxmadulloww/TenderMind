'use strict';

const logger = require('../logger');

/**
 * Tarif limitini tekshiruvchi middleware.
 *
 * authMiddleware dan KEYIN ishlatiladi — req.user.id mavjud bo'lishi kerak.
 *
 *   kind: 'doc'  — AI hujjat generatsiyasi (free: kuniga 1 ta)
 *   kind: 'chat' — AI maslahatchi xabari  (free: kuniga 10 ta)
 *
 * Limit faqat so'rov MUVAFFAQIYATLI tugagandan keyin sarflanadi
 * (res 'finish' hodisasida, status < 400 bo'lsa). Ya'ni AI xato bersa,
 * foydalanuvchining kunlik limiti behuda yonmaydi.
 */
function requireQuota(kind) {
  return async function quotaMiddleware(req, res, next) {
    try {
      // authMiddleware foydalanuvchini yuklab qo'ygan — qayta izlamaymiz
      const user = req.dbUser;
      if (!user) return res.status(401).json({ error: 'Sessiya yaroqsiz — qaytadan kiring' });

      if (!user.canUse(kind)) {
        const limits = user.getPlanLimits();
        const limitValue = kind === 'doc' ? limits.docPerDay : limits.chatPerDay;
        return res.status(429).json({
          error: 'QUOTA_EXCEEDED',
          message: kind === 'doc'
            ? `Kunlik hujjat limiti tugadi (${limitValue} ta). Ertaga qaytadan urinib ko'ring yoki tarifni yangilang.`
            : `Kunlik AI suhbat limiti tugadi (${limitValue} ta xabar). Ertaga qaytadan urinib ko'ring yoki tarifni yangilang.`,
          plan: user.plan,
          used: user.quotaUsed(kind),
          limit: limitValue,
        });
      }

      res.on('finish', () => {
        if (res.statusCode >= 400) return;
        // Controller `req.skipQuota = true` qo'ysa — limit sarflanmaydi.
        // Masalan lot tushuntirishi keshdan qaytganda AI umuman
        // chaqirilmaydi, demak foydalanuvchidan limit olish noto'g'ri.
        if (req.skipQuota) return;
        user.consumeQuota(kind).catch(err => logger.error('Quota consume error', err));
      });

      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = { requireQuota };
