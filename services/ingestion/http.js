'use strict';

const logger = require('../../logger');

/**
 * Odobli HTTP mijoz.
 *
 * Ochiq ma'lumot yig'ishda uchta qoidaga qat'iy amal qilinadi:
 *   1. O'zini tanitish — User-Agent da loyiha nomi va aloqa manzili;
 *   2. Yuklama chegarasi — so'rovlar orasida majburiy pauza;
 *   3. robots.txt — taqiqlangan yo'llarga umuman murojaat qilinmaydi.
 *
 * Bu qoidalarni chetlab o'tish uchun sozlama ataylab qo'yilmagan.
 */

const USER_AGENT = process.env.INGEST_USER_AGENT
  || 'TenderMind-Bot/1.0 (+https://tendermind.uz/bot; ochiq tender ma\'lumotlarini yig\'ish)';

const DEFAULT_DELAY_MS = Number(process.env.INGEST_DELAY_MS) || 1500;
const DEFAULT_TIMEOUT_MS = Number(process.env.INGEST_TIMEOUT_MS) || 20000;

let lastRequestAt = 0;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/** So'rovlar orasida kamida DELAY_MS kutish */
async function throttle(delayMs = DEFAULT_DELAY_MS) {
  const waited = Date.now() - lastRequestAt;
  if (waited < delayMs) await sleep(delayMs - waited);
  lastRequestAt = Date.now();
}

async function politeFetch(url, options = {}) {
  const { delayMs, timeoutMs = DEFAULT_TIMEOUT_MS, retries = 2, ...rest } = options;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    await throttle(delayMs);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...rest,
        signal: controller.signal,
        headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'uz,ru;q=0.8', ...(rest.headers || {}) },
      });

      // 429/503 — server "sekinroq" deyapti, hurmat qilamiz
      if ((response.status === 429 || response.status === 503) && attempt < retries) {
        const retryAfter = Number(response.headers.get('retry-after')) || (5 * (attempt + 1));
        logger.warn(`${url} → ${response.status}, ${retryAfter}s kutilmoqda`);
        await sleep(retryAfter * 1000);
        continue;
      }

      return response;
    } catch (err) {
      if (attempt === retries) throw err;
      logger.warn(`So'rov muvaffaqiyatsiz (${attempt + 1}/${retries}): ${err.message}`);
      await sleep(2000 * (attempt + 1));
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error(`So'rov bajarilmadi: ${url}`);
}

module.exports = { politeFetch, USER_AGENT, sleep };
