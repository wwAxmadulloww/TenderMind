'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User } = require('../models');
const config = require('../config');
const logger = require('../logger');
const asyncHandler = require('../utils/asyncHandler');

// Database error helper
function handleDBError(err, res) {
  logger.error('Database error in authController', err);
  const isDBError = err.name === 'MongoNetworkError' || err.name === 'MongooseServerSelectionError' ||
    (err.message && (err.message.includes('ECONNREFUSED') || err.message.includes('topology')));
  if (isDBError) {
    return res.status(503).json({ error: 'Server yuklanmoqda. 10-20 soniyadan keyin qaytadan urinib ko\'ring.' });
  }
  return null;
}

/**
 * Register a new user
 */
async function register(req, res) {
  try {
    const { name, phone, password, company } = req.body;

    const existingUser = await User.findOne({ phone });
    if (existingUser) {
      return res.status(409).json({ error: 'Bu telefon raqam allaqachon ro\'yxatdan o\'tgan' });
    }

    const hashedPwd = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      phone,
      company: company || '',
      passwordHash: hashedPwd
    });

    const token = jwt.sign(
      { id: user.id, name: user.name, phone: user.phone },
      config.jwtSecret,
      { expiresIn: '30d' }
    );

    res.status(201).json({
      success: true,
      token,
      user: { id: user.id, name: user.name, phone: user.phone, company: user.company }
    });
  } catch (err) {
    const handled = handleDBError(err, res);
    if (handled) return;
    logger.error('Register error', err);
    res.status(500).json({ error: 'Ro\'yxatdan o\'tishda xatolik yuz berdi' });
  }
}

/**
 * Log in an existing user
 */
async function login(req, res) {
  try {
    const { phone, password } = req.body;

    const user = await User.findOne({ phone });
    if (!user) return res.status(401).json({ error: 'Telefon yoki parol noto\'g\'ri' });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Telefon yoki parol noto\'g\'ri' });

    const token = jwt.sign(
      { id: user.id, name: user.name, phone: user.phone },
      config.jwtSecret,
      { expiresIn: '30d' }
    );

    res.json({
      success: true,
      token,
      user: { id: user.id, name: user.name, phone: user.phone, company: user.company }
    });
  } catch (err) {
    const handled = handleDBError(err, res);
    if (handled) return;
    logger.error('Login error', err);
    res.status(500).json({ error: 'Kirishda xatolik yuz berdi' });
  }
}

/**
 * Get current user profile (me)
 */
async function getProfile(req, res) {
  try {
    const user = await User.findOne({ id: req.user.id });
    if (!user) return res.status(401).json({ error: 'Sessiya yaroqsiz — qaytadan kiring' });
    res.json({
      success: true,
      user: { id: user.id, name: user.name, phone: user.phone, company: user.company }
    });
  } catch (err) {
    logger.error('Get profile error', err);
    res.status(500).json({ error: 'Profil ma\'lumotlarini olishda xatolik yuz berdi' });
  }
}

/**
 * Change current user password
 */
async function changePassword(req, res) {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Hamma maydonlar talab qilinadi' });
    }
    if (newPassword.length < 6 || /\s/.test(newPassword)) {
      return res.status(400).json({ error: 'Yangi parol kamida 6 belgi, bo\'shliqsiz' });
    }
    if (currentPassword === newPassword) {
      return res.status(400).json({ error: 'Yangi parol eski paroldan farq qilishi kerak' });
    }

    const user = await User.findOne({ id: req.user.id });
    if (!user) return res.status(401).json({ error: 'Sessiya yaroqsiz — qaytadan kiring' });

    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Joriy parol noto\'g\'ri' });

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await user.save();

    res.json({ success: true, message: 'Parol muvaffaqiyatli o\'zgartirildi' });
  } catch (err) {
    logger.error('Change password error', err);
    res.status(500).json({ error: 'Parolni o\'zgartirishda xatolik yuz berdi' });
  }
}

/**
 * Update current user profile info
 */
async function updateProfile(req, res) {
  try {
    const { name, company } = req.body;

    if (name && (name.length < 2 || name.length > 50)) {
      return res.status(400).json({ error: 'Ism 2-50 belgi bo\'lishi kerak' });
    }
    if (company && company.length > 100) {
      return res.status(400).json({ error: 'Kompaniya nomi 100 belgidan oshmasin' });
    }

    const user = await User.findOne({ id: req.user.id });
    if (!user) return res.status(401).json({ error: 'Sessiya yaroqsiz — qaytadan kiring' });

    if (name) user.name = name.trim();
    if (company !== undefined) user.company = company.trim();
    await user.save();

    res.json({
      success: true,
      user: { id: user.id, name: user.name, phone: user.phone, company: user.company }
    });
  } catch (err) {
    logger.error('Update profile error', err);
    res.status(500).json({ error: 'Profilni yangilashda xatolik yuz berdi' });
  }
}

/**
 * Telegram hisobini bog'lash kodini olish/yangilash.
 * Kod bir martalik: bot uni ishlatgach tozalaydi.
 */
async function getTelegramCode(req, res) {
  const { generateLinkCode } = require('../services/telegram/commands');

  const user = await User.findOne({ id: req.user.id });
  if (!user) return res.status(401).json({ error: 'Sessiya yaroqsiz — qaytadan kiring' });

  if (!user.telegram) user.telegram = {};

  const alreadyLinked = Boolean(user.telegram.chatId);
  if (!alreadyLinked && !user.telegram.linkCode) {
    user.telegram.linkCode = generateLinkCode();
    await user.save();
  }

  const botUsername = String(process.env.TELEGRAM_BOT_USERNAME || '').replace('@', '');

  res.json({
    linked: alreadyLinked,
    code: alreadyLinked ? null : user.telegram.linkCode,
    notifyEnabled: user.telegram.notifyEnabled !== false,
    botUsername: botUsername || null,
    deepLink: (!alreadyLinked && botUsername)
      ? `https://t.me/${botUsername}?start=${user.telegram.linkCode}`
      : null,
  });
}

/** Telegram bog'lanishini uzish */
async function unlinkTelegram(req, res) {
  const user = await User.findOne({ id: req.user.id });
  if (!user) return res.status(401).json({ error: 'Sessiya yaroqsiz — qaytadan kiring' });

  user.telegram.chatId = '';
  user.telegram.linkCode = '';
  user.telegram.linkedAt = null;
  await user.save();

  res.json({ success: true, message: 'Telegram uzildi' });
}

module.exports = {
  getTelegramCode: asyncHandler(getTelegramCode),
  unlinkTelegram: asyncHandler(unlinkTelegram),
  register: asyncHandler(register),
  login: asyncHandler(login),
  getProfile: asyncHandler(getProfile),
  changePassword: asyncHandler(changePassword),
  updateProfile: asyncHandler(updateProfile)
};
