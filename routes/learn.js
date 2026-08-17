'use strict';

const express = require('express');
const router = express.Router();
const learnController = require('../controllers/learnController');
const { authMiddleware, optionalAuth } = require('../middleware/auth');
const requireDB = require('../middleware/dbReady');

// Ta'lim materiallari — hamma uchun ochiq. Bu loyihaning maqsadi:
// bilimi kam odamlarni jalb qilish. Devor qo'yish maqsadga zid.
// Lug'at fayldan o'qiladi — bazaga ehtiyoj yo'q.
router.get('/glossary', learnController.listGlossary);
router.get('/glossary/:term', learnController.getTerm);

// Yo'riqnoma ochiq; token bo'lsa progress ham qo'shiladi
router.get('/onboarding', optionalAuth, learnController.getOnboarding);

// Progressni saqlash uchun tizimga kirish kerak.
// authMiddleware requireDB dan OLDIN: JWT tekshiruvi bazaga muhtoj emas,
// shuning uchun yaroqsiz token baza holatidan qat'i nazar 401 olishi kerak.
router.post('/onboarding/progress', authMiddleware, requireDB, learnController.saveProgress);

module.exports = router;
