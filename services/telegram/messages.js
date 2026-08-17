'use strict';

/**
 * Bot matnlari va formatlash.
 *
 * Alohida modulda — chunki bular sof funksiyalar va test qilinadi.
 * Telegram HTML rejimi ishlatiladi, shuning uchun har bir tashqi
 * qiymat qochiriladi (foydalanuvchi nomi, tender sarlavhasi va h.k.).
 */

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const formatSom = (n) => new Intl.NumberFormat('uz-UZ').format(Math.round(Number(n) || 0));

function daysLeft(deadline) {
  return Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000);
}

const WELCOME = [
  '👋 <b>TenderMind botiga xush kelibsiz!</b>',
  '',
  'Men sizga mos yangi tenderlar chiqqanda xabar beraman.',
  '',
  '<b>Buyruqlar:</b>',
  '/ulash <code>KOD</code> — saytdagi hisobingizni bog\'lash',
  '/sozlama — qaysi tenderlar haqida xabar olishni tanlash',
  '/holat — joriy sozlamalarni ko\'rish',
  '/toxtat — xabarnomani o\'chirish',
  '/yoq — xabarnomani qayta yoqish',
  '',
  'Boshlash uchun saytda profilingizga kiring va <b>Telegram ulash</b> kodini oling.',
].join('\n');

const HELP = WELCOME;

function linkSuccess(name) {
  return [
    `✅ <b>Hisob bog'landi!</b>`,
    '',
    `Salom, ${escapeHtml(name)}. Endi sizga mos yangi tenderlar chiqqanda xabar beraman.`,
    '',
    'Sozlamalarni o\'zgartirish uchun: /sozlama',
  ].join('\n');
}

const LINK_INVALID = [
  '❌ <b>Kod noto\'g\'ri yoki eskirgan.</b>',
  '',
  'Saytdagi profilingizdan yangi kod oling va qaytadan urinib ko\'ring:',
  '<code>/ulash SIZNING-KODINGIZ</code>',
].join('\n');

const NOT_LINKED = [
  '🔗 Avval hisobingizni bog\'lang.',
  '',
  'Saytdagi profilingizdan kod oling va yuboring:',
  '<code>/ulash SIZNING-KODINGIZ</code>',
].join('\n');

function statusMessage(user) {
  const f = user.telegram?.filters || {};
  const sohaText = !f.soha || f.soha === 'all' ? 'barchasi' : f.soha;
  const hududText = !f.hudud || f.hudud === 'all' ? 'barchasi' : f.hudud;
  const budgetText = f.minBudget > 0 ? `${formatSom(f.minBudget)} so'mdan yuqori` : 'cheklovsiz';

  return [
    `<b>Joriy sozlamalar</b>`,
    '',
    `👤 Hisob: ${escapeHtml(user.name)}`,
    `🔔 Xabarnoma: ${user.telegram?.notifyEnabled ? 'yoqilgan' : '<b>o\'chirilgan</b>'}`,
    `🏷 Soha: ${escapeHtml(sohaText)}`,
    `📍 Hudud: ${escapeHtml(hududText)}`,
    `💰 Byudjet: ${budgetText}`,
    '',
    'O\'zgartirish uchun: /sozlama',
  ].join('\n');
}

const SETTINGS_HELP = [
  '<b>Sozlamalarni o\'zgartirish</b>',
  '',
  'Quyidagi ko\'rinishda yuboring:',
  '',
  '<code>/sozlama soha it</code>',
  '<code>/sozlama hudud toshkent</code>',
  '<code>/sozlama byudjet 500000000</code>',
  '<code>/sozlama soha barchasi</code>',
  '',
  '<b>Sohalar:</b> it, qurilish, tibbiyot, oziq, transport, talim, ekologiya, qishloq',
].join('\n');

/** Yangi tender haqida xabar */
function tenderNotification(tender, lots = [], siteUrl = '') {
  const kun = daysLeft(tender.deadline);
  const lines = [
    '🆕 <b>Yangi tender</b>',
    '',
    `<b>${escapeHtml(tender.title)}</b>`,
    `🏛 ${escapeHtml(tender.org)}`,
    `💰 ${escapeHtml(tender.budget)} so'm`,
    `⏰ ${kun > 0 ? `${kun} kun qoldi` : 'muddat tugagan'}`,
  ];

  if (lots.length > 1) {
    lines.push('', `<b>${lots.length} ta lot:</b>`);
    for (const lot of lots.slice(0, 5)) {
      lines.push(`  ${lot.lotNumber}. ${escapeHtml(lot.title)} — ${formatSom(lot.startPrice)} so'm`);
    }
    if (lots.length > 5) lines.push(`  ... va yana ${lots.length - 5} ta`);
  }

  if (tender.isDemo) {
    lines.push('', '⚠️ <i>Namunaviy ma\'lumot — haqiqiy e\'lon emas.</i>');
  } else if (tender.isVerified === false) {
    lines.push('', '⚠️ <i>Tekshirilmagan — asl e\'lonni tasdiqlang.</i>');
  }

  if (siteUrl) {
    lines.push('', `👉 <a href="${siteUrl}">Batafsil va oddiy tilda tushuntirish</a>`);
  }

  return lines.join('\n');
}

module.exports = {
  escapeHtml, formatSom, daysLeft,
  WELCOME, HELP, LINK_INVALID, NOT_LINKED, SETTINGS_HELP,
  linkSuccess, statusMessage, tenderNotification,
};
