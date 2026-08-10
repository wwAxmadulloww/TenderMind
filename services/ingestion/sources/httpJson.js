'use strict';

const { politeFetch } = require('../http');
const { isAllowed } = require('../robots');
const logger = require('../../../logger');

/**
 * UMUMIY JSON API MANBASI
 *
 * Portal JSON qaytaradigan manzilga ega bo'lganda ishlatiladi. Endpoint,
 * sahifalash va maydon nomlari — hammasi sozlama orqali beriladi, kod
 * o'zgartirilmaydi.
 *
 * Har bir so'rovdan oldin robots.txt tekshiriladi. Taqiqlangan bo'lsa —
 * ingestion to'xtaydi. Buni chetlab o'tish sozlamasi yo'q.
 *
 * Sozlash (.env):
 *   INGEST_API_URL=https://misol.uz/api/tenders
 *   INGEST_API_ITEMS_PATH=data.items     # javobdagi massiv joyi
 *   INGEST_API_PAGE_PARAM=page
 *   INGEST_API_LIMIT_PARAM=limit
 *   INGEST_API_PAGE_SIZE=50
 *   INGEST_API_MAX_PAGES=10
 *   INGEST_API_HEADERS={"X-Api-Key":"..."}
 */

function readPath(object, dottedPath) {
  if (!dottedPath) return object;
  return dottedPath.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), object);
}

async function fetchRecords(options = {}) {
  const url = options.url || process.env.INGEST_API_URL;
  if (!url) {
    throw new Error(
      'INGEST_API_URL sozlanmagan.\n'
      + 'Portalning JSON manzilini .env ga qo\'shing yoki `file` manbasidan foydalaning.'
    );
  }

  const check = await isAllowed(url);
  if (!check.allowed) {
    throw new Error(`Yig'ishga ruxsat yo'q: ${check.reason}`);
  }
  logger.info(`robots.txt tekshiruvi: ${check.reason}`);

  const itemsPath = options.itemsPath || process.env.INGEST_API_ITEMS_PATH || '';
  const pageParam = options.pageParam || process.env.INGEST_API_PAGE_PARAM || 'page';
  const limitParam = options.limitParam || process.env.INGEST_API_LIMIT_PARAM || 'limit';
  const pageSize = Number(options.pageSize || process.env.INGEST_API_PAGE_SIZE) || 50;
  const maxPages = Number(options.maxPages || process.env.INGEST_API_MAX_PAGES) || 10;

  let headers = {};
  try {
    headers = JSON.parse(process.env.INGEST_API_HEADERS || '{}');
  } catch {
    logger.warn('INGEST_API_HEADERS JSON emas — e\'tiborsiz qoldirildi');
  }

  const all = [];

  for (let page = 1; page <= maxPages; page += 1) {
    const pageUrl = new URL(url);
    pageUrl.searchParams.set(pageParam, String(page));
    pageUrl.searchParams.set(limitParam, String(pageSize));

    const response = await politeFetch(pageUrl.toString(), { headers });
    if (!response.ok) {
      throw new Error(`Manba ${response.status} qaytardi: ${pageUrl.pathname}`);
    }

    const body = await response.json();
    const items = readPath(body, itemsPath);

    if (!Array.isArray(items)) {
      throw new Error(
        `Javobda massiv topilmadi (INGEST_API_ITEMS_PATH="${itemsPath}"). `
        + `Kelgan turlar: ${Object.keys(body || {}).join(', ') || 'bo\'sh'}`
      );
    }

    all.push(...items);
    logger.info(`Sahifa ${page}: ${items.length} ta yozuv`);

    if (items.length < pageSize) break;   // oxirgi sahifa
  }

  return all;
}

module.exports = {
  name: 'http-json',
  description: 'Sozlanadigan JSON API (robots.txt hurmat qilinadi)',
  fetch: fetchRecords,
  readPath,
};
