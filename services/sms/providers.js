'use strict';

const logger = require('../../logger');

/**
 * SMS PROVAYDERLARI
 *
 * O'zbekistonda eng keng tarqalgan ikkitasi qo'llab-quvvatlanadi.
 * Ikkalasi ham `send(phone, text)` interfeysini beradi, shuning uchun
 * provayder almashtirilganda qolgan kod o'zgarmaydi.
 *
 * Kalit berilmagan bo'lsa provayder "sozlanmagan" deb qaytadi va tizim
 * buni ochiq aytadi — yolg'on "SMS yubordik" xabari berilmaydi.
 */

/** Eskiz.uz — token bilan ishlaydi, token 30 kun amal qiladi */
class EskizProvider {
  constructor({ email, password, baseUrl }) {
    this.name = 'Eskiz';
    this.email = email;
    this.password = password;
    this.baseUrl = baseUrl || 'https://notify.eskiz.uz/api';
    this.token = null;
    this.tokenExpiresAt = 0;
  }

  isConfigured() {
    return Boolean(this.email && this.password);
  }

  async authenticate() {
    // Token hali yaroqli bo'lsa qayta so'ramaymiz
    if (this.token && Date.now() < this.tokenExpiresAt) return this.token;

    const response = await fetch(`${this.baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: this.email, password: this.password }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      throw new Error(`Eskiz autentifikatsiyasi muvaffaqiyatsiz (${response.status})`);
    }

    const data = await response.json();
    this.token = data?.data?.token;
    if (!this.token) throw new Error('Eskiz token qaytarmadi');

    // Xavfsizlik uchun e'lon qilingandan qisqaroq muddat qo'yamiz
    this.tokenExpiresAt = Date.now() + 25 * 24 * 60 * 60 * 1000;
    return this.token;
  }

  async send(phone, text) {
    const token = await this.authenticate();

    const form = new URLSearchParams({
      mobile_phone: phone.replace(/\D/g, ''),
      message: text,
      from: process.env.SMS_SENDER || '4546',
    });

    const response = await fetch(`${this.baseUrl}/message/sms/send`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form,
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Eskiz SMS yubormadi (${response.status}): ${body.slice(0, 120)}`);
    }

    return true;
  }
}

/** Play Mobile — Basic auth, XML emas, JSON API */
class PlayMobileProvider {
  constructor({ login, password, baseUrl }) {
    this.name = 'PlayMobile';
    this.login = login;
    this.password = password;
    this.baseUrl = baseUrl || 'https://send.smsxabar.uz/broker-api';
  }

  isConfigured() {
    return Boolean(this.login && this.password);
  }

  async send(phone, text) {
    const auth = Buffer.from(`${this.login}:${this.password}`).toString('base64');

    const response = await fetch(`${this.baseUrl}/send`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [{
          recipient: phone.replace(/\D/g, ''),
          'message-id': `tm-${Date.now()}`,
          sms: { originator: process.env.SMS_SENDER || '3700', content: { text } },
        }],
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`PlayMobile SMS yubormadi (${response.status}): ${body.slice(0, 120)}`);
    }

    return true;
  }
}

/**
 * Konsol provayderi — FAQAT development uchun.
 *
 * SMS yubormaydi, kodni logga yozadi. Bu ishlab chiqish paytida SMS
 * xarajatisiz butun oqimni sinab ko'rish imkonini beradi. Productionda
 * hech qachon yoqilmaydi (config buni tekshiradi).
 */
class ConsoleProvider {
  constructor() {
    this.name = 'Konsol (faqat development)';
  }

  isConfigured() {
    return true;
  }

  async send(phone, text) {
    logger.info(`[SMS → ${phone}] ${text}`);
    return true;
  }
}

module.exports = { EskizProvider, PlayMobileProvider, ConsoleProvider };
