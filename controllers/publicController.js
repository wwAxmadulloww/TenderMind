'use strict';

const tenderRepository = require('../repositories/tenderRepository');
const lotRepository = require('../repositories/lotRepository');
const { Tender } = require('../models');
const seo = require('../services/seo/render');
const asyncHandler = require('../utils/asyncHandler');
const { isDBConnected } = require('../db');

/**
 * Ochiq, indekslanadigan sahifalar.
 *
 * Bular API emas — qidiruv tizimi va havola orqali kelgan odam uchun
 * to'liq HTML. Autentifikatsiya talab qilinmaydi.
 */

/** GET /tender/:id */
async function tenderPage(req, res) {
  const tender = await tenderRepository.findById(req.params.id);
  if (!tender) {
    return res.status(404).type('html').send(seo.renderNotFound());
  }

  const lots = await lotRepository.findByTender(tender.id);

  // Sahifa kamdan-kam o'zgaradi; CDN va brauzer keshiga ruxsat beramiz
  res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
  res.type('html').send(seo.renderTenderPage(tender, lots));
}

/** GET /tenderlar/:soha — soha bo'yicha ro'yxat */
async function categoryPage(req, res) {
  const soha = String(req.params.soha || '').toLowerCase();
  if (!seo.SOHA_LABEL[soha]) {
    return res.status(404).type('html').send(seo.renderNotFound());
  }

  const today = new Date().toISOString().slice(0, 10);
  const tenders = await Tender.find({ soha, deadline: { $gte: today } })
    .select('id title org hudud budget deadline isDemo')
    .sort({ deadline: 1 })
    .limit(100)
    .lean();

  res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
  res.type('html').send(seo.renderCategoryPage(soha, tenders));
}

/** GET /sitemap.xml — faqat indekslanadigan yozuvlar */
async function sitemap(req, res) {
  if (!isDBConnected()) {
    // Baza yo'q bo'lsa bo'sh sitemap — 500 dan ko'ra shu yaxshi,
    // aks holda qidiruv tizimi xatoni eslab qoladi
    return res.type('xml').send(seo.renderSitemap([]));
  }

  const today = new Date().toISOString().slice(0, 10);
  const tenders = await Tender.find({
    isDemo: { $ne: true },        // namunaviy yozuvlar qidiruvga tushmaydi
    deadline: { $gte: today },    // muddati tugaganlari ham
  })
    .select('id updatedAt')
    .sort({ updatedAt: -1 })
    .limit(50000)                 // sitemap standarti chegarasi
    .lean();

  // Kategoriya sahifalari — faqat ichida yozuvi borlari
  const sohalar = await Tender.distinct('soha', { deadline: { $gte: today } });

  res.set('Cache-Control', 'public, max-age=3600');
  res.type('xml').send(seo.renderSitemap(tenders, sohalar));
}

/** GET /robots.txt */
function robots(req, res) {
  res.set('Cache-Control', 'public, max-age=86400');
  res.type('text').send(seo.renderRobotsTxt());
}

module.exports = {
  tenderPage: asyncHandler(tenderPage),
  categoryPage: asyncHandler(categoryPage),
  sitemap: asyncHandler(sitemap),
  robots,
};
