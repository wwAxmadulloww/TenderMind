'use strict';

const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const verificationController = require('../controllers/verificationController');
const { authMiddleware } = require('../middleware/auth');
const { validateBody, sanitizeBody, normalizeUzbekPhone } = require('../validators');
const requireDB = require('../middleware/dbReady');
const { registerLimiter, loginLimiter, codeLimiter } = require('../middleware/rateLimits');

// Barcha auth amallari bazaga bog'liq
router.use(requireDB);

// Auth validation rules
const authRegisterSanitize = sanitizeBody({ name: 'name', company: 'company' });
const registerRules = {
  name: { required: true, format: 'name', errorMsg: 'Ism 2–50 belgi, ruxsat etilgan alifbo' },
  phone: { required: true, format: 'phone', errorMsg: 'Telefon +998901234567 yoki 901234567 ko\'rinishida kiriting' },
  password: { required: true, format: 'password', errorMsg: 'Parol kamida 6 belgi, bo\'shliqsiz' },
  company: { required: false, format: 'company', errorMsg: 'Kompaniya nomi 2–100 belgi' },
};
const loginRules = {
  phone: { required: true, format: 'phone', errorMsg: 'Telefon formati noto\'g\'ri' },
  password: { required: true, format: 'password', errorMsg: 'Parol noto\'g\'ri' },
};

function normalizeAuthPhone(req, res, next) {
  req.body.phone = normalizeUzbekPhone(req.body.phone || '');
  next();
}

// Routes
router.post('/register', registerLimiter, authRegisterSanitize, normalizeAuthPhone, validateBody(registerRules), authController.register);
router.post('/login', loginLimiter, normalizeAuthPhone, validateBody(loginRules), authController.login);
router.get('/me', authMiddleware, authController.getProfile);
router.post('/logout', authMiddleware, authController.logout);
router.put('/change-password', authMiddleware, authController.changePassword);
router.put('/profile', authMiddleware, authController.updateProfile);

// ── Telefon tasdiqlash va parolni tiklash ────────────────────────────
router.get('/sms-status', verificationController.smsStatus);
router.post('/send-code', codeLimiter, authMiddleware, verificationController.sendPhoneCode);
router.post('/verify-phone', authMiddleware, verificationController.verifyPhone);

router.post('/forgot-password', codeLimiter, verificationController.forgotPassword);
router.post('/reset-password', loginLimiter, verificationController.resetPassword);

// Telegram xabarnomasi
router.get('/telegram-code', authMiddleware, authController.getTelegramCode);
router.post('/telegram-unlink', authMiddleware, authController.unlinkTelegram);

module.exports = router;
