'use strict';

const express = require('express');
const router = express.Router();
const tenderController = require('../controllers/tenderController');
const { authMiddleware } = require('../middleware/auth');
const requireDB = require('../middleware/dbReady');

// Router `/api` ga mount qilinadi, shuning uchun yo'llar mijoz chaqiruvlari
// bilan 1:1 mos keladi: /api/tenders, /api/saved, /api/won.
//
// requireDB har bir route ga alohida beriladi — `router.use()` bo'lsa,
// shu prefiksdagi BOSHQA routerlarning so'rovlari ham ushlab qolinadi.

// Ochiq (autentifikatsiyasiz) — tenderlarni ko'rish hamma uchun erkin
router.get('/tenders', requireDB, tenderController.listTenders);
router.get('/stats', requireDB, tenderController.getStats);
router.get('/tenders/:id', requireDB, tenderController.getTenderById);

// Foydalanuvchiga bog'liq
router.get('/saved', requireDB, authMiddleware, tenderController.getSavedTenders);
router.post('/saved/:id', requireDB, authMiddleware, tenderController.toggleSaveTender);

router.get('/won', requireDB, authMiddleware, tenderController.getWonTenders);
router.post('/won/:id', requireDB, authMiddleware, tenderController.toggleWonTender);

module.exports = router;
