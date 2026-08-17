'use strict';

const express = require('express');
const router = express.Router();
const publicController = require('../controllers/publicController');
const requireDB = require('../middleware/dbReady');

// Ildizga mount qilinadi (`/`), shuning uchun yo'llar to'liq ko'rsatiladi.
// robots.txt va sitemap.xml bazasiz ham javob berishi kerak — qidiruv
// tizimi vaqtinchalik xatoni uzoq eslab qoladi.
router.get('/robots.txt', publicController.robots);
router.get('/sitemap.xml', publicController.sitemap);

router.get('/tender/:id', requireDB, publicController.tenderPage);
router.get('/tenderlar/:soha', requireDB, publicController.categoryPage);

module.exports = router;
