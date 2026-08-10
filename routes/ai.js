'use strict';

const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const aiController = require('../controllers/aiController');
const { authMiddleware } = require('../middleware/auth');
const { requireQuota } = require('../middleware/quota');
const requireDB = require('../middleware/dbReady');

// DIQQAT: bu router `/api` ga mount qilinadi va boshqa routerlar ham shu
// prefiksdan foydalanadi. Shuning uchun `router.use(...)` ISHLATILMAYDI —
// u mos kelmagan so'rovlarni ham ushlab qolib, boshqa routerlarga
// o'tkazmay qo'yadi. Middleware har bir route ga alohida beriladi.

// IP bo'yicha umumiy tormoz (bot va suiiste'moldan). Foydalanuvchi bo'yicha
// aniq cheklov requireQuota da — tarifga bog'liq holda.
const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,  // 1 soat
  max: 20,
  message: { error: 'AI limit: soatiga 20 ta so\'rov. Birozdan keyin urinib ko\'ring.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const chatLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 100,
  message: { error: 'AI maslahatchi: soatiga 100 ta xabar limiti. Birozdan keyin urinib ko\'ring.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Barcha AI endpointlari autentifikatsiya talab qiladi — aks holda
// istalgan anonim so'rov loyihaning AI balansini sarflaydi.
// Tartib muhim: avval rate limit (arzon), keyin auth (bazasiz ishlaydi),
// so'ng baza va tarif tekshiruvi. Shunda tokensiz so'rov baza uzilgan
// bo'lsa ham to'g'ri 401 oladi.
const guard = (limiter, kind) => [limiter, authMiddleware, requireDB, requireQuota(kind)];

router.post('/generate',     guard(aiLimiter, 'doc'),    aiController.generateDocuments);
router.post('/strategy',     guard(aiLimiter, 'chat'),   aiController.getStrategy);
router.post('/ai/compare',   guard(aiLimiter, 'chat'),   aiController.compareTenders);
router.post('/chat',         guard(chatLimiter, 'chat'), aiController.chatWithAI);
router.post('/ai/recommend', guard(aiLimiter, 'chat'),   aiController.recommendTenders);

module.exports = router;
