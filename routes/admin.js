'use strict';

const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authMiddleware } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/admin');
const requireDB = require('../middleware/dbReady');

// Bu router `/api/admin` ga mount qilinadi — alohida prefiks, shuning
// uchun router.use() xavfsiz: boshqa routerlarga ta'sir qilmaydi.
router.use(authMiddleware);   // avval token (bazasiz ishlaydi)
router.use(requireDB);
router.use(requireAdmin);     // rol bazadan tekshiriladi

router.get('/stats', adminController.stats);

// Tenderlar
router.get('/tenders', adminController.listTenders);
router.post('/tenders', adminController.createTender);
router.put('/tenders/:id', adminController.updateTender);
router.delete('/tenders/:id', adminController.deleteTender);

// Lotlar
router.post('/lots', adminController.createLot);
router.put('/lots/:id', adminController.updateLot);
router.delete('/lots/:id', adminController.deleteLot);

// Foydalanuvchilar
router.get('/users', adminController.listUsers);
router.put('/users/:id/plan', adminController.updateUserPlan);

// Obunalar
router.get('/subscriptions', adminController.listSubscriptions);
router.post('/subscriptions/:id/approve', adminController.approveSubscription);
router.post('/subscriptions/:id/reject', adminController.rejectSubscription);

module.exports = router;
