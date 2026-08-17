'use strict';

const logger = require('../../logger');

/**
 * Telegram Bot API mijozi.
 *
 * Qo'shimcha kutubxonasiz — Bot API oddiy HTTPS/JSON, shuning uchun
 * `fetch` yetarli. Kamroq bog'liqlik = kamroq zaiflik.
 */

const BASE = 'https://api.telegram.org';

function getToken() {
  return String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
}

/** Token formati: "<raqam>:<harflar>" */
function isConfigured() {
  const token = getToken();
  return /^\d{6,}:[A-Za-z0-9_-]{30,}$/.test(token);
}

async function call(method, payload = {}, { timeoutMs = 30000 } = {}) {
  if (!isConfigured()) {
    throw new Error('TELEGRAM_BOT_TOKEN sozlanmagan yoki formati noto\'g\'ri');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${BASE}/bot${getToken()}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const data = await response.json().catch(() => ({}));
    if (!data.ok) {
      const description = data.description || `HTTP ${response.status}`;
      const error = new Error(`Telegram API xatosi (${method}): ${description}`);
      error.code = data.error_code;
      error.retryAfter = data.parameters?.retry_after;
      throw error;
    }
    return data.result;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Xabar yuborish. Foydalanuvchi botni bloklagan bo'lsa (403) xato
 * yutilmaydi — chaqiruvchi obunani o'chirishi kerak.
 */
async function sendMessage(chatId, text, options = {}) {
  return call('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...options,
  });
}

async function getUpdates(offset, timeoutSeconds = 25) {
  return call('getUpdates', {
    offset,
    timeout: timeoutSeconds,
    allowed_updates: ['message'],
  }, { timeoutMs: (timeoutSeconds + 10) * 1000 });
}

async function getMe() {
  return call('getMe');
}

async function deleteWebhook() {
  // Long-polling ishlashi uchun webhook o'chirilgan bo'lishi kerak
  try {
    await call('deleteWebhook', { drop_pending_updates: false });
  } catch (err) {
    logger.warn(`Webhook o'chirilmadi: ${err.message}`);
  }
}

module.exports = { call, sendMessage, getUpdates, getMe, deleteWebhook, isConfigured, getToken };
