'use strict';

const express = require('express');
const router = express.Router();
const exportController = require('../controllers/exportController');
const { authMiddleware } = require('../middleware/auth');

// Eksport ham himoyalangan: aks holda anonim so'rovlar server resursini
// (docx/pdf generatsiyasi — CPU va xotira) bemalol sarflashi mumkin.
// Middleware route darajasida — router.use() bu yerda boshqa routerlarni
// ham bloklab qo'yadi (hammasi `/api` ga mount qilingan).
router.post('/export/word', authMiddleware, exportController.exportWord);
router.post('/export/pdf', authMiddleware, exportController.exportPdf);

module.exports = router;
