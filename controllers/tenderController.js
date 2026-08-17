'use strict';

const tenderRepository = require('../repositories/tenderRepository');
const { User } = require('../models');
const logger = require('../logger');
const asyncHandler = require('../utils/asyncHandler');

/**
 * List all tenders (with filters, search, and pagination)
 */
async function listTenders(req, res, next) {
  try {
    const result = await tenderRepository.list(req.query);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * Get tender by custom ID (e.g. it-001)
 */
async function getTenderById(req, res, next) {
  try {
    const tender = await tenderRepository.findById(req.params.id);
    if (!tender) return res.status(404).json({ error: 'Tender topilmadi' });
    res.json(tender);
  } catch (err) {
    next(err);
  }
}

/**
 * Get list of saved tenders for the current authenticated user
 */
async function getSavedTenders(req, res) {
  try {
    const user = await User.findOne({ id: req.user.id });
    const savedIds = user ? user.savedTenders : [];
    const tenders = await tenderRepository.findManyByIds(savedIds);
    res.json(tenders);
  } catch (err) {
    logger.error('Saved fetch error', err);
    res.status(500).json({ error: 'Server xatosi' });
  }
}

/**
 * Toggle (save/unsave) a tender for the current authenticated user
 */
async function toggleSaveTender(req, res) {
  try {
    const userId = req.user.id;
    const user = await User.findOne({ id: userId });
    if (!user) return res.status(401).json({ error: 'Sessiya yaroqsiz — qaytadan kiring' });

    // Use atomic operations where possible, or update document
    const idx = user.savedTenders.indexOf(req.params.id);
    if (idx > -1) {
      user.savedTenders.splice(idx, 1);
      await user.save();
      res.json({ saved: false, message: 'Saqlangan tenderlardan olib tashlandi' });
    } else {
      user.savedTenders.push(req.params.id);
      await user.save();
      res.json({ saved: true, message: 'Tender saqlandi!' });
    }
  } catch (err) {
    logger.error('Toggle save error', err);
    res.status(500).json({ error: 'Server xatosi' });
  }
}

/**
 * Get list of won tenders for the current authenticated user
 */
async function getWonTenders(req, res) {
  try {
    const user = await User.findOne({ id: req.user.id });
    const wonIds = user ? user.wonTenders : [];
    const tenders = await tenderRepository.findManyByIds(wonIds);
    res.json(tenders);
  } catch (err) {
    logger.error('Won fetch error', err);
    res.status(500).json({ error: 'Server xatosi' });
  }
}

/**
 * Toggle (add/remove from won) a tender for the current authenticated user
 */
async function toggleWonTender(req, res) {
  try {
    const userId = req.user.id;
    const user = await User.findOne({ id: userId });
    if (!user) return res.status(401).json({ error: 'Sessiya yaroqsiz — qaytadan kiring' });

    const idx = user.wonTenders.indexOf(req.params.id);
    if (idx > -1) {
      user.wonTenders.splice(idx, 1);
      await user.save();
      res.json({ won: false, message: 'Yutganlardan olib tashlandi' });
    } else {
      user.wonTenders.push(req.params.id);
      await user.save();
      res.json({ won: true, message: "Tabriklaymiz! Tender yutilganlar safiga qo'shildi 🏆" });
    }
  } catch (err) {
    logger.error('Toggle won error', err);
    res.status(500).json({ error: 'Server xatosi' });
  }
}

module.exports = {
  listTenders: asyncHandler(listTenders),
  getTenderById: asyncHandler(getTenderById),
  getSavedTenders: asyncHandler(getSavedTenders),
  toggleSaveTender: asyncHandler(toggleSaveTender),
  getWonTenders: asyncHandler(getWonTenders),
  toggleWonTender: asyncHandler(toggleWonTender)
};
