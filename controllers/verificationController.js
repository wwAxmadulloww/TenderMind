'use strict';

const bcrypt = require('bcryptjs');
const { User } = require('../models');
const { smsManager, generateCode, hashCode, codesMatch } = require('../services/sms');
const { signToken } = require('../middleware/auth');
const { normalizeUzbekPhone, validators } = require('../validators');
const asyncHandler = require('../utils/asyncHandler');
const logger = require('../logger');

const CODE_TTL_MS = 5 * 60 * 1000;    // kod 5 daqiqa amal qiladi
const RESEND_COOLDOWN_MS = 60 * 1000; // qayta yuborish orasidagi eng kam vaqt
const MAX_ATTEMPTS = 5;

/**
 * SMS sozlanmaganini bir xil, halol javob bilan bildirish.
 * Foydalanuvchiga texnik tafsilot emas, holat aytiladi.
 */
function smsUnavailable(res) {
  return res.status(503).json({
    error: 'SMS_NOT_CONFIGURED',
    message: 'SMS xizmati hozircha ulanmagan. Parolni tiklash uchun '
      + 'qo\'llab-quvvatlash xizmatiga murojaat qiling.',
  });
}

/** Kodni yaratib, foydalanuvchiga yozib qo'yish va SMS yuborish */
async function issueCode(user, purpose) {
  const code = generateCode();

  user.verification = {
    codeHash: hashCode(code),
    purpose,
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
    attempts: 0,
    lastSentAt: new Date(),
  };
  await user.save();

  const text = purpose === 'reset'
    ? `TenderMind: parolni tiklash kodi ${code}. Hech kimga bermang. 5 daqiqa amal qiladi.`
    : `TenderMind: tasdiqlash kodi ${code}. 5 daqiqa amal qiladi.`;

  await smsManager.send(user.phone, text);
}

/** Juda tez-tez so'ralayaptimi? */
function tooSoon(user) {
  const lastSent = user.verification?.lastSentAt;
  if (!lastSent) return 0;
  const waited = Date.now() - new Date(lastSent).getTime();
  return waited < RESEND_COOLDOWN_MS ? Math.ceil((RESEND_COOLDOWN_MS - waited) / 1000) : 0;
}

/**
 * Kodni tekshirish.
 * @returns {string|null} xato matni, yoki null — kod to'g'ri
 */
async function checkCode(user, code, purpose) {
  const state = user.verification || {};

  if (!state.codeHash || state.purpose !== purpose) {
    return 'Kod so\'ralmagan. Avval kod yuborishni so\'rang.';
  }
  if (!state.expiresAt || new Date() > new Date(state.expiresAt)) {
    return 'Kod muddati tugagan. Yangisini so\'rang.';
  }
  if ((state.attempts || 0) >= MAX_ATTEMPTS) {
    return 'Juda ko\'p noto\'g\'ri urinish. Yangi kod so\'rang.';
  }

  if (!codesMatch(String(code || ''), state.codeHash)) {
    user.verification.attempts = (state.attempts || 0) + 1;
    await user.save();
    const left = MAX_ATTEMPTS - user.verification.attempts;
    return left > 0
      ? `Kod noto'g'ri. Yana ${left} ta urinish qoldi.`
      : 'Kod noto\'g\'ri. Urinishlar tugadi — yangi kod so\'rang.';
  }

  return null;
}

/** Ishlatilgan kodni tozalash — bir kod bir marta */
function clearCode(user) {
  user.verification = {
    codeHash: '', purpose: '', expiresAt: null, attempts: 0,
    lastSentAt: user.verification?.lastSentAt || null,
  };
}

// ══════════════════════════════════════════════════════════════════════
// TELEFONNI TASDIQLASH (tizimga kirgan foydalanuvchi)
// ══════════════════════════════════════════════════════════════════════

/** POST /api/auth/send-code */
async function sendPhoneCode(req, res) {
  if (!smsManager.isConfigured()) return smsUnavailable(res);

  const user = req.dbUser;
  if (user.phoneVerified) {
    return res.status(400).json({ error: 'Telefon allaqachon tasdiqlangan' });
  }

  const wait = tooSoon(user);
  if (wait) {
    return res.status(429).json({ error: `Yangi kod uchun ${wait} soniya kuting` });
  }

  await issueCode(user, 'phone');
  res.json({ success: true, message: 'Tasdiqlash kodi yuborildi', expiresInSeconds: CODE_TTL_MS / 1000 });
}

/** POST /api/auth/verify-phone */
async function verifyPhone(req, res) {
  const user = req.dbUser;

  const problem = await checkCode(user, req.body?.code, 'phone');
  if (problem) return res.status(400).json({ error: problem });

  user.phoneVerified = true;
  clearCode(user);
  await user.save();

  logger.info(`Telefon tasdiqlandi: ${user.phone}`);
  res.json({ success: true, message: 'Telefon tasdiqlandi' });
}

// ══════════════════════════════════════════════════════════════════════
// PAROLNI TIKLASH (tizimga kirmagan foydalanuvchi)
// ══════════════════════════════════════════════════════════════════════

/**
 * POST /api/auth/forgot-password
 *
 * MUHIM: raqam bazada bor-yo'qligi OSHKOR QILINMAYDI. Aks holda bu
 * endpoint "bu raqam ro'yxatdan o'tganmi?" degan savolga javob beruvchi
 * vositaga aylanadi va foydalanuvchilar ro'yxatini yig'ish mumkin bo'ladi.
 * Javob har doim bir xil.
 */
async function forgotPassword(req, res) {
  if (!smsManager.isConfigured()) return smsUnavailable(res);

  const phone = normalizeUzbekPhone(req.body?.phone || '');
  const sameAnswer = {
    success: true,
    message: 'Agar bu raqam ro\'yxatdan o\'tgan bo\'lsa, tiklash kodi yuborildi.',
  };

  if (!validators.phone(phone)) return res.json(sameAnswer);

  const user = await User.findOne({ phone });
  if (!user) return res.json(sameAnswer);

  // Cooldown ham jimgina — javob o'zgarmasligi kerak
  if (tooSoon(user)) return res.json(sameAnswer);

  try {
    await issueCode(user, 'reset');
  } catch (err) {
    logger.error('Tiklash kodini yuborishda xato', err);
    if (err.code === 'SMS_NOT_CONFIGURED') return smsUnavailable(res);
  }

  res.json(sameAnswer);
}

/** POST /api/auth/reset-password */
async function resetPassword(req, res) {
  const { phone: rawPhone, code, newPassword } = req.body || {};

  if (!validators.password(newPassword)) {
    return res.status(400).json({ error: 'Yangi parol kamida 6 belgi, bo\'shliqsiz' });
  }

  const phone = normalizeUzbekPhone(rawPhone || '');
  const user = await User.findOne({ phone });

  // Bu bosqichda kod talab qilinadi, shuning uchun mavjud bo'lmagan
  // raqam uchun ham xuddi shu xato beriladi — ma'lumot sizib chiqmaydi.
  const invalid = { error: 'Kod yaroqsiz yoki muddati tugagan' };
  if (!user) return res.status(400).json(invalid);

  const problem = await checkCode(user, code, 'reset');
  if (problem) return res.status(400).json({ error: problem });

  user.passwordHash = await bcrypt.hash(newPassword, 10);
  // Parol tiklandi — barcha eski sessiyalar yopiladi. Agar hisobni
  // kimdir egallagan bo'lsa, uning tokeni ham shu daqiqada o'ladi.
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  // Kodni SMS orqali olgan bo'lsa, raqam unga tegishli ekani isbotlandi
  user.phoneVerified = true;
  clearCode(user);
  await user.save();

  logger.info(`Parol tiklandi: ${user.phone}`);
  res.json({
    success: true,
    message: 'Parol o\'zgartirildi',
    token: signToken(user),
    user: { id: user.id, name: user.name, phone: user.phone, company: user.company },
  });
}

/** GET /api/auth/sms-status — interfeys nima ko'rsatishini bilishi uchun */
function smsStatus(req, res) {
  res.json({ available: smsManager.isConfigured() });
}

module.exports = {
  sendPhoneCode: asyncHandler(sendPhoneCode),
  verifyPhone: asyncHandler(verifyPhone),
  forgotPassword: asyncHandler(forgotPassword),
  resetPassword: asyncHandler(resetPassword),
  smsStatus,
  CODE_TTL_MS,
  MAX_ATTEMPTS,
};
