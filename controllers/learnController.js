'use strict';

const { GLOSSARY, findTerm } = require('../data/glossary');
const { STEPS, TOTAL_STEPS } = require('../data/onboarding');
const { User } = require('../models');
const { isDBConnected } = require('../db');
const asyncHandler = require('../utils/asyncHandler');

/** GET /api/glossary — barcha atamalar (mijozda keshlanadi) */
function listGlossary(req, res) {
  res.json({
    total: GLOSSARY.length,
    terms: GLOSSARY.map(({ term, aliases, short, example }) => ({ term, aliases, short, example })),
  });
}

/** GET /api/glossary/:term — bitta atama */
function getTerm(req, res) {
  const entry = findTerm(req.params.term);
  if (!entry) return res.status(404).json({ error: 'Bunday atama lug\'atda yo\'q' });
  res.json({ term: entry });
}

/** GET /api/onboarding — yo'riqnoma qadamlari (+ tizimga kirgan bo'lsa progress) */
async function getOnboarding(req, res) {
  const payload = { totalSteps: TOTAL_STEPS, steps: STEPS };

  // authMiddleware ixtiyoriy — token bo'lsa progress qo'shiladi.
  // Baza uzilgan bo'lsa ham yo'riqnomaning O'ZI ochilishi kerak, shuning
  // uchun progress olishdagi xato butun javobni yiqitmaydi.
  if (req.user && req.user.id && isDBConnected()) {
    const user = await User.findOne({ id: req.user.id }).catch(() => null);
    if (user) {
      const completed = (user.onboarding && user.onboarding.completedSteps) || [];
      payload.progress = {
        completedSteps: completed,
        finishedAt: (user.onboarding && user.onboarding.finishedAt) || null,
        skipped: Boolean(user.onboarding && user.onboarding.skipped),
        percent: Math.round((completed.length / TOTAL_STEPS) * 100),
      };
    }
  }

  res.json(payload);
}

/** POST /api/onboarding/progress — qadamni bajarilgan deb belgilash */
async function saveProgress(req, res) {
  const { stepId, skip } = req.body;

  const user = await User.findOne({ id: req.user.id });
  if (!user) return res.status(401).json({ error: 'Sessiya yaroqsiz — qaytadan kiring' });

  if (!user.onboarding) user.onboarding = { completedSteps: [], finishedAt: null, skipped: false };

  if (skip) {
    user.onboarding.skipped = true;
  } else {
    if (!STEPS.some(s => s.id === stepId)) {
      return res.status(400).json({ error: 'Noma\'lum qadam' });
    }
    if (!user.onboarding.completedSteps.includes(stepId)) {
      user.onboarding.completedSteps.push(stepId);
    }
    if (user.onboarding.completedSteps.length >= TOTAL_STEPS && !user.onboarding.finishedAt) {
      user.onboarding.finishedAt = new Date();
    }
  }

  await user.save();

  const completed = user.onboarding.completedSteps;
  res.json({
    success: true,
    progress: {
      completedSteps: completed,
      finishedAt: user.onboarding.finishedAt,
      skipped: user.onboarding.skipped,
      percent: Math.round((completed.length / TOTAL_STEPS) * 100),
    },
  });
}

module.exports = {
  listGlossary,
  getTerm,
  getOnboarding: asyncHandler(getOnboarding),
  saveProgress: asyncHandler(saveProgress),
};
