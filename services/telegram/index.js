'use strict';

const api = require('./api');
const msg = require('./messages');
const cmd = require('./commands');
const { User, Tender, Lot } = require('../../models');
const config = require('../../config');
const logger = require('../../logger');

/**
 * Telegram bot mantiqi: buyruqlarga javob berish va xabarnoma tarqatish.
 */

const siteUrl = () => config.frontendUrl || 'https://tendermind.uz';

// ── Buyruqlarni qayta ishlash ─────────────────────────────────────────
async function handleUpdate(update) {
  const message = update.message;
  if (!message || !message.text) return;

  const chatId = String(message.chat.id);
  const { command, args } = cmd.parseCommand(message.text);
  if (!command) return;

  const user = await User.findOne({ 'telegram.chatId': chatId });

  switch (command) {
    case 'start':
      // /start KOD — havola orqali kelgan bo'lsa darhol bog'laymiz
      if (args[0]) return linkAccount(chatId, args[0], message.from);
      return api.sendMessage(chatId, msg.WELCOME);

    case 'help':
    case 'yordam':
      return api.sendMessage(chatId, msg.HELP);

    case 'ulash':
    case 'link':
      return linkAccount(chatId, args[0], message.from);

    case 'holat':
    case 'status':
      if (!user) return api.sendMessage(chatId, msg.NOT_LINKED);
      return api.sendMessage(chatId, msg.statusMessage(user));

    case 'sozlama':
    case 'settings':
      if (!user) return api.sendMessage(chatId, msg.NOT_LINKED);
      return updateSettings(chatId, user, args);

    case 'toxtat':
    case 'stop':
      if (!user) return api.sendMessage(chatId, msg.NOT_LINKED);
      user.telegram.notifyEnabled = false;
      await user.save();
      return api.sendMessage(chatId, '🔕 Xabarnoma o\'chirildi. Qayta yoqish uchun: /yoq');

    case 'yoq':
    case 'start_notify':
      if (!user) return api.sendMessage(chatId, msg.NOT_LINKED);
      user.telegram.notifyEnabled = true;
      await user.save();
      return api.sendMessage(chatId, '🔔 Xabarnoma yoqildi.');

    default:
      return api.sendMessage(chatId, msg.HELP);
  }
}

async function linkAccount(chatId, rawCode, from = {}) {
  const code = cmd.normalizeLinkCode(rawCode);
  if (!code) return api.sendMessage(chatId, msg.LINK_INVALID);

  const user = await User.findOne({ 'telegram.linkCode': code });
  if (!user) return api.sendMessage(chatId, msg.LINK_INVALID);

  // Bir Telegram hisobi — bir foydalanuvchi. Eski bog'lanish uziladi.
  await User.updateMany(
    { 'telegram.chatId': chatId, id: { $ne: user.id } },
    { $set: { 'telegram.chatId': '', 'telegram.linkedAt': null } }
  );

  user.telegram.chatId = chatId;
  user.telegram.username = from.username || '';
  user.telegram.linkedAt = new Date();
  user.telegram.linkCode = '';   // kod bir martalik
  user.telegram.notifyEnabled = true;
  await user.save();

  logger.info(`Telegram bog'landi: ${user.phone} → chat ${chatId}`);
  return api.sendMessage(chatId, msg.linkSuccess(user.name));
}

async function updateSettings(chatId, user, args) {
  const result = cmd.parseSettings(args);

  if (result.showHelp) return api.sendMessage(chatId, msg.SETTINGS_HELP);
  if (!result.ok) return api.sendMessage(chatId, `❌ ${msg.escapeHtml(result.error)}`);

  user.telegram.filters[result.field] = result.value;
  await user.save();

  return api.sendMessage(chatId, `✅ Saqlandi.\n\n${msg.statusMessage(user)}`);
}

// ── Xabarnoma tarqatish ───────────────────────────────────────────────

/**
 * Berilgan tenderlar haqida mos foydalanuvchilarga xabar yuborish.
 *
 * Ingestion tugagandan keyin chaqiriladi. Telegram sekundiga ~30 xabar
 * chegarasi bor, shuning uchun yuborish orasida pauza qo'yiladi.
 */
async function notifyNewTenders(tenderIds = []) {
  const report = { candidates: 0, sent: 0, skipped: 0, blocked: 0, errors: [] };

  if (!api.isConfigured()) {
    report.errors.push('TELEGRAM_BOT_TOKEN sozlanmagan — xabarnoma yuborilmadi');
    return report;
  }
  if (!tenderIds.length) return report;

  const tenders = await Tender.find({ id: { $in: tenderIds } }).lean();
  if (!tenders.length) return report;

  const subscribers = await User.find({
    'telegram.chatId': { $ne: '' },
    'telegram.notifyEnabled': true,
  });
  report.candidates = subscribers.length;

  const lotsByTender = new Map();
  for (const tender of tenders) {
    lotsByTender.set(tender.id, await Lot.find({ tenderId: tender.id }).sort({ lotNumber: 1 }).lean());
  }

  for (const user of subscribers) {
    const filters = user.telegram.filters || {};
    const matched = tenders.filter(t => cmd.matchesFilters(t, filters));

    if (!matched.length) {
      report.skipped += 1;
      continue;
    }

    // Bir foydalanuvchiga bir yo'la ko'p xabar yubormaymiz
    for (const tender of matched.slice(0, 5)) {
      try {
        await api.sendMessage(
          user.telegram.chatId,
          msg.tenderNotification(tender, lotsByTender.get(tender.id) || [], `${siteUrl()}/#tender-${tender.id}`)
        );
        report.sent += 1;
        await new Promise(resolve => setTimeout(resolve, 60));   // ~16 xabar/sek
      } catch (err) {
        // 403 — foydalanuvchi botni bloklagan yoki chatni o'chirgan
        if (err.code === 403) {
          user.telegram.notifyEnabled = false;
          await user.save();
          report.blocked += 1;
          break;
        }
        if (err.retryAfter) {
          await new Promise(resolve => setTimeout(resolve, (err.retryAfter + 1) * 1000));
        }
        report.errors.push(`${user.phone}: ${err.message}`);
      }
    }

    user.telegram.lastNotifiedAt = new Date();
    await user.save();
  }

  logger.info(`Telegram xabarnoma: ${report.sent} yuborildi, ${report.skipped} filtrga mos emas, ${report.blocked} bloklangan`);
  return report;
}

module.exports = { handleUpdate, notifyNewTenders, linkAccount, api, commands: cmd, messages: msg };
