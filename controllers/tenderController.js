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
 * Bosh sahifadagi ko'rsatkichlar.
 *
 * Uchala raqam ham O'LCHANADI. Ilgari soha va hudud soni lug'atdagi
 * kalitlar sonidan olinardi — ya'ni bazada bironta ham qurilish e'loni
 * bo'lmasa ham "9 soha" deb yozilaverardi. Haqiqiy son yonida turgan
 * o'ylab topilgan son ikkalasiga ham ishonchni yo'qotadi.
 */
async function getStats(req, res, next) {
  try {
    const [open, { sohalar, hududlar, bySoha }] = await Promise.all([
      tenderRepository.countOpen(),
      tenderRepository.coverage(),
    ]);
    res.json({ open, sohalar: sohalar.length, hududlar: hududlar.length, bySoha });
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
 * Ro'yxatga qo'shish/olib tashlash — saqlanganlar va yutganlar uchun bir xil.
 *
 * Qo'shishdan oldin e'lon bazada BOR-YO'QLIGI tekshiriladi: aks holda
 * istalgan matn ro'yxatga tushib, foydalanuvchi hujjatini cheksiz
 * o'stirish mumkin edi, ro'yxatda esa hech qachon ko'rinmaydigan
 * "arvoh" yozuvlar to'planardi.
 */
const MAX_LIST_SIZE = 500;

function toggleList(field, messages) {
  return async function toggle(req, res) {
    try {
      const user = await User.findOne({ id: req.user.id });
      if (!user) return res.status(401).json({ error: 'Sessiya yaroqsiz — qaytadan kiring' });

      const id = req.params.id;
      const idx = user[field].indexOf(id);

      if (idx > -1) {
        user[field].splice(idx, 1);
        await user.save();
        return res.json({ [messages.key]: false, message: messages.removed });
      }

      if (!(await tenderRepository.findById(id))) {
        return res.status(404).json({ error: 'Tender topilmadi' });
      }
      if (user[field].length >= MAX_LIST_SIZE) {
        return res.status(400).json({
          error: `Ro'yxatda ${MAX_LIST_SIZE} tadan ortiq e'lon saqlab bo'lmaydi. Keraksizlarini olib tashlang.`,
        });
      }

      user[field].push(id);
      await user.save();
      return res.json({ [messages.key]: true, message: messages.added });
    } catch (err) {
      logger.error(`Toggle ${field} error`, err);
      return res.status(500).json({ error: 'Server xatosi' });
    }
  };
}

const toggleSaveTender = toggleList('savedTenders', {
  key: 'saved',
  added: 'Tender saqlandi!',
  removed: 'Saqlangan tenderlardan olib tashlandi',
});

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

const toggleWonTender = toggleList('wonTenders', {
  key: 'won',
  added: "Tabriklaymiz! Tender yutilganlar safiga qo'shildi 🏆",
  removed: 'Yutganlardan olib tashlandi',
});

module.exports = {
  listTenders: asyncHandler(listTenders),
  getStats: asyncHandler(getStats),
  getTenderById: asyncHandler(getTenderById),
  getSavedTenders: asyncHandler(getSavedTenders),
  toggleSaveTender: asyncHandler(toggleSaveTender),
  getWonTenders: asyncHandler(getWonTenders),
  toggleWonTender: asyncHandler(toggleWonTender)
};
