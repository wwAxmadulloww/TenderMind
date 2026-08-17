'use strict';

const express = require('express');
const router = express.Router();
const lotController = require('../controllers/lotController');
const { authMiddleware } = require('../middleware/auth');
const { requireQuota } = require('../middleware/quota');
const requireDB = require('../middleware/dbReady');

// Bu router ham `/api` ga mount qilinadi — shuning uchun router.use() emas,
// middleware har bir route ga alohida beriladi.

// ── Ochiq: lotlarni ko'rish hamma uchun erkin ────────────────────────
// Loyihaning maqsadi — auditoriyani kengaytirish, shuning uchun lotni
// ko'rish va tushuntirishni O'QISH uchun ro'yxatdan o'tish talab etilmaydi.
router.get('/tenders/:id/lots', requireDB, lotController.listByTender);
router.get('/lots/:id', requireDB, lotController.getById);

// "Menga mos keladimi?" — AI ishlatmaydi, shuning uchun limitsiz va ochiq
router.post('/lots/:id/fit', requireDB, lotController.checkFit);

// ── Tushuntirishni YARATISH — AI sarflaydi, shuning uchun himoyalangan ──
// Kesh mavjud bo'lsa controller AI ni umuman chaqirmaydi.
// authMiddleware birinchi: JWT tekshiruvi bazaga bog'liq emas, shuning
// uchun tokensiz so'rov baza holatidan qat'i nazar 401 olishi kerak.
router.post('/lots/:id/explain', authMiddleware, requireDB, requireQuota('chat'), lotController.explain);

module.exports = router;
