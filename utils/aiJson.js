'use strict';

const logger = require('../logger');

/**
 * AI javobidan JSON ajratib olish.
 *
 * Modellar ko'pincha JSON ni ```json ... ``` blokiga o'rab yuboradi yoki
 * oldidan izoh qo'shadi. Shuning uchun avval blok, keyin birinchi `{...}`
 * bo'lagi sinaladi.
 */
function parseAIJson(rawText, fallback = null) {
  if (typeof rawText !== 'string' || !rawText.trim()) return fallback;

  const candidates = [];

  const fenced = rawText.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) candidates.push(fenced[1]);

  const braced = rawText.match(/\{[\s\S]*\}/);
  if (braced) candidates.push(braced[0]);

  candidates.push(rawText);

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate.trim());
    } catch {
      // keyingisini sinaymiz
    }
  }

  logger.warn('AI javobini JSON sifatida o\'qib bo\'lmadi — fallback ishlatildi');
  return fallback;
}

module.exports = { parseAIJson };
