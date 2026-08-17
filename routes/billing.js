'use strict';

const express = require('express');
const router = express.Router();
const billingController = require('../controllers/billingController');
const { authMiddleware } = require('../middleware/auth');
const requireDB = require('../middleware/dbReady');

// `/api/billing` — alohida prefiks

// Tariflar ochiq: narxni ko'rish uchun ro'yxatdan o'tish shart emas
router.get('/plans', billingController.listPlans);
router.post('/quote', billingController.quote);

router.get('/me', authMiddleware, requireDB, billingController.myBilling);
router.post('/subscribe', authMiddleware, requireDB, billingController.subscribe);

module.exports = router;
