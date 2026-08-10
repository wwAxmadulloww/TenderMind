'use strict';

const lotRepository = require('../repositories/lotRepository');
const tenderRepository = require('../repositories/tenderRepository');
const { explainLot, analyzeFit } = require('../services/lotExplainer');
const asyncHandler = require('../utils/asyncHandler');
const logger = require('../logger');

/** GET /api/tenders/:id/lots — tenderning barcha lotlari */
async function listByTender(req, res) {
  const tender = await tenderRepository.findById(req.params.id);
  if (!tender) return res.status(404).json({ error: 'Tender topilmadi' });

  const lots = await lotRepository.findByTender(req.params.id);
  res.json({ tender, lots, total: lots.length });
}

/** GET /api/lots/:id — bitta lot (tushuntirish tayyor bo'lsa u ham qaytadi) */
async function getById(req, res) {
  const lot = await lotRepository.findById(req.params.id);
  if (!lot) return res.status(404).json({ error: 'Lot topilmadi' });

  const tender = await tenderRepository.findById(lot.tenderId);
  res.json({ lot, tender });
}

/**
 * POST /api/lots/:id/explain — "Oddiy tilda tushuntirish"
 *
 * Tushuntirish bir marta yaratilib, lot hujjatida saqlanadi. Keyingi
 * so'rovlarda keshdan qaytadi — ya'ni AI limiti sarflanmaydi va javob
 * bir zumda keladi. `?refresh=1` bilan majburan qayta yaratish mumkin.
 */
async function explain(req, res) {
  const lotDoc = await lotRepository.findDocById(req.params.id);
  if (!lotDoc) return res.status(404).json({ error: 'Lot topilmadi' });

  const forceRefresh = req.query.refresh === '1';

  if (!forceRefresh && lotDoc.hasExplanation()) {
    req.skipQuota = true;   // AI chaqirilmadi — kunlik limit sarflanmasin
    return res.json({
      success: true,
      cached: true,
      explanation: lotDoc.explanation,
    });
  }

  const tender = await tenderRepository.findById(lotDoc.tenderId);
  const generated = await explainLot(lotDoc.toObject(), tender);

  lotDoc.explanation = {
    nima: generated.nima,
    kim: generated.kim,
    hujjatlar: generated.hujjatlar,
    pul: generated.pul,
    muddat: generated.muddat,
    xulosa: generated.xulosa,
    generatedAt: new Date(),
    model: generated.model,
  };

  try {
    await lotDoc.save();
  } catch (err) {
    // Saqlash muvaffaqiyatsiz bo'lsa ham foydalanuvchi javobni olsin
    logger.error('Lot tushuntirishini saqlashda xato', err);
  }

  res.json({ success: true, cached: false, explanation: lotDoc.explanation });
}

/**
 * POST /api/lots/:id/fit — "Menga mos keladimi?"
 * AI talab qilmaydi: aniq, tekshiriladigan mezonlar asosida.
 */
async function checkFit(req, res) {
  const lot = await lotRepository.findById(req.params.id);
  if (!lot) return res.status(404).json({ error: 'Lot topilmadi' });

  const tender = await tenderRepository.findById(lot.tenderId);

  // Profil: so'rov tanasidan yoki foydalanuvchi hisobidan
  const profile = {
    experience: req.body.experience,
    soha: req.body.soha,
    hudud: req.body.hudud,
    company: req.body.company || (req.dbUser && req.dbUser.company),
  };

  res.json({ success: true, lotId: lot.id, fit: analyzeFit(lot, tender, profile) });
}

module.exports = {
  listByTender: asyncHandler(listByTender),
  getById: asyncHandler(getById),
  explain: asyncHandler(explain),
  checkFit: asyncHandler(checkFit),
};
