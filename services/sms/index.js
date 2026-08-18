'use strict';

const crypto = require('node:crypto');
const config = require('../../config');
const logger = require('../../logger');
const { EskizProvider, PlayMobileProvider, ConsoleProvider } = require('./providers');

/**
 * SMS XIZMATI
 *
 * Bitta provayder tanlanadi va shu ishlatiladi. Kalit berilmagan bo'lsa
 * xizmat "sozlanmagan" deb qaytadi — chaqiruvchi buni foydalanuvchiga
 * ochiq aytishi kerak. Yolg'on "kod yubordik" xabari berilmaydi.
 */
class SmsManager {
  constructor() {
    const { sms } = config;

    this.providers = [
      new EskizProvider({ email: sms.eskizEmail, password: sms.eskizPassword }),
      new PlayMobileProvider({ login: sms.playMobileLogin, password: sms.playMobilePassword }),
    ];

    // Konsol provayderi faqat development va faqat aniq so'ralganda.
    // Productionda hech qachon — aks holda kodlar SMS o'rniga logga
    // yozilib, tizim "ishlayapti" deb ko'rinardi.
    if (!config.isProd && sms.useConsole) {
      this.providers.push(new ConsoleProvider());
    }
  }

  get provider() {
    return this.providers.find(p => p.isConfigured());
  }

  isConfigured() {
    return Boolean(this.provider);
  }

  providerName() {
    return this.provider?.name || 'none';
  }

  async send(phone, text) {
    const provider = this.provider;
    if (!provider) {
      const error = new Error('SMS xizmati sozlanmagan');
      error.code = 'SMS_NOT_CONFIGURED';
      throw error;
    }

    await provider.send(phone, text);
    logger.info(`SMS yuborildi (${provider.name}) → ${maskPhone(phone)}`);
    return true;
  }
}

/** Loglarda to'liq raqam turmasin: +99890****567 */
function maskPhone(phone) {
  const text = String(phone);
  return text.length > 8 ? `${text.slice(0, 7)}****${text.slice(-3)}` : text;
}

/** 6 xonali tasdiqlash kodi */
function generateCode() {
  return String(crypto.randomInt(100000, 1000000));
}

/**
 * Kod bazada ochiq saqlanmaydi — faqat hash.
 * bcrypt bu yerda ortiqcha: kod 5 daqiqa yashaydi va urinishlar
 * cheklangan, shuning uchun tez SHA-256 yetarli va kutish vaqtini
 * uzaytirmaydi.
 */
function hashCode(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

function codesMatch(input, storedHash) {
  if (!storedHash) return false;
  const inputHash = hashCode(input);
  // Vaqt bo'yicha xavfsiz taqqoslash
  return crypto.timingSafeEqual(Buffer.from(inputHash), Buffer.from(storedHash));
}

module.exports = {
  smsManager: new SmsManager(),
  generateCode,
  hashCode,
  codesMatch,
  maskPhone,
};
