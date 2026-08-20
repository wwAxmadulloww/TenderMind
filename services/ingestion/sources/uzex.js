'use strict';

const { politeFetch } = require('../http');
const logger = require('../../../logger');

/**
 * XARID.UZEX.UZ — O'zbekiston davlat xaridlari rasmiy portali.
 *
 * Portalning o'zi Angular ilovasi, ya'ni sahifadan matn qirqib olish
 * behuda: mazmun JavaScript ishlagandan keyin paydo bo'ladi. Uning
 * ortida esa OCHIQ JSON API turadi — kalit ham, ro'yxatdan o'tish ham
 * talab qilinmaydi. Shuning uchun sahifani "tirnash" o'rniga o'sha
 * API dan foydalanamiz: bu ham ishonchliroq, ham portalga yengilroq.
 *
 *   Ro'yxat:    POST /Common/GetMinimizedLotsList   {"from":1,"to":20}
 *   Tafsilot:   GET  /Common/GetLot/{id}
 *
 * Sahifalash `from`/`to` — 1 dan boshlanadigan, ikki tomoni ham
 * kiradigan oraliq (skip/take EMAS). Har javobda `total_count` keladi.
 *
 * ─────────────────────────────────────────────────────────────────────
 * DIQQAT — bu adapter hozir ISHLAMAYDI, va buning sababi texnik emas.
 *
 * API o'zini tanitgan har qanday mijozni rad etadi:
 *
 *   User-Agent: TenderMind-Bot/1.0 (+https://tendermind.uz/bot)
 *   → 500 {"message": "Приложение : Missing User-Agent header"}
 *
 * Xabar chalg'ituvchi: sarlavha YUBORILGAN. Rad etilishining sababi —
 * u brauzernikiga o'xshamaydi. `curl/8.0`, `python-requests`, hatto
 * `Googlebot` ham shu javobni oladi; faqat to'liq Chrome satri o'tadi.
 * Ya'ni bu buzuq parser emas, ataylab qo'yilgan bot filtri.
 *
 * Undan o'tish uchun brauzer bo'lib ko'rinish kerak bo'lardi. Biz
 * bunday qilmaymiz: portal egasi kirishni ataylab cheklagan bo'lsa,
 * uni aldab o'tish — ochiq ma'lumot yig'ish emas, to'siqni chetlab
 * o'tish. Yuqoridagi uchta qoida shuning uchun yozilgan.
 *
 * TO'G'RI YO'L: UzEx bilan rasmiy kelishuv va API kirish huquqi.
 * Ma'lumotning o'zi ochiq va bu yerdagi moslashtirish kodi tayyor —
 * ruxsat berilgan zahoti adapter ishlab ketadi.
 *
 * Shu paytgacha: `npm run ingest -- file --path=...` bilan portaldan
 * qo'lda yuklab olingan eksportni kiritish mumkin.
 * ─────────────────────────────────────────────────────────────────────
 */

const API = process.env.UZEX_API_BASE || 'https://xarid-api-auction.uzex.uz';
const PORTAL = 'https://xarid.uzex.uz';

// Portal bir so'rovda ko'pi bilan shuncha yozuv qaytaradi
const PAGE_SIZE = 20;

const BLOCKED_HINT = [
  'xarid.uzex.uz API si o\'zini tanitgan mijozlarni rad etadi',
  '(faqat brauzer User-Agent i qabul qilinadi).',
  'Biz brauzer bo\'lib ko\'rinmaymiz — bu to\'siqni chetlab o\'tish bo\'lardi.',
  'Yechim: UzEx bilan rasmiy API kelishuvi.',
  'Hozircha: npm run ingest -- file --path=./data/eksport.json',
].join(' ');

/** Portal bot filtriga uchradikmi? */
function isBotBlock(status, body) {
  return status === 500 && /Missing User-Agent header/i.test(String(body || ''));
}

async function readOrThrow(response, path) {
  const text = await response.text();
  if (isBotBlock(response.status, text)) throw new Error(BLOCKED_HINT);
  if (!response.ok) throw new Error(`${path} → ${response.status}`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${path} → javob JSON emas`);
  }
}

async function postJson(path, body) {
  const response = await politeFetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  return readOrThrow(response, path);
}

async function getJson(path) {
  const response = await politeFetch(`${API}${path}`, { headers: { Accept: 'application/json' } });
  return readOrThrow(response, path);
}

/**
 * Hudud nomini kalitga aylantirish.
 *
 * Portal to'liq nom beradi — "Сырдарьинская область", "город Ташкент".
 * normalize.js dagi lug'at esa qisqa kalitlarni biladi ("сырдарья"),
 * shuning uchun aniq moslik ishlamaydi va hammasi "boshqa" bo'lib
 * qolardi. Bu yerda o'zak bo'yicha solishtiramiz.
 */
const REGION_STEMS = [
  [/тошкент|ташкент|toshkent/i, 'toshkent'],
  [/самарканд|samarqand/i, 'samarqand'],
  [/бухар|buxoro/i, 'buxoro'],
  [/андижан|andijon/i, 'andijon'],
  [/наманган|namangan/i, 'namangan'],
  [/фергана|ферган|farg/i, 'fargona'],
  [/кашкадар|qashqadaryo/i, 'qashqadaryo'],
  [/сурхандар|surxondaryo/i, 'surxondaryo'],
  [/хорезм|xorazm/i, 'xorazm'],
  [/навои|navoiy/i, 'navoiy'],
  [/джизак|jizzax/i, 'jizzax'],
  [/сырдар|sirdaryo/i, 'sirdaryo'],
  [/каракалпак|qoraqalpog/i, 'qoraqalpogiston'],
];

function regionKey(name) {
  const text = String(name || '');
  for (const [pattern, key] of REGION_STEMS) if (pattern.test(text)) return key;
  return 'boshqa';
}

/**
 * Kategoriya nomidan soha kalitini topish.
 *
 * Portal kategoriyalari juda batafsil ("Изделия резиновые и
 * пластмассовые"), TenderMind sohalari esa yirik. Aniq moslik
 * bo'lmagani uchun kalit so'z bo'yicha aniqlanadi; topilmasa —
 * halol "boshqa".
 */
const SECTOR_STEMS = [
  [/компьютер|программн|информацион|связи|телекоммуникац|it\b/i, 'it'],
  [/строительн|строительств|ремонт|здани|дорог|цемент|бетон/i, 'qurilish'],
  [/медицин|лекарств|фармацевт|здравоохран|больнич/i, 'tibbiyot'],
  [/продукт|пищев|питани|мясн|молочн|хлеб|зерн/i, 'oziq'],
  [/транспорт|автомобил|перевоз|запчаст|топлив/i, 'transport'],
  [/образован|учебн|школьн|мебель для|канцеляр/i, 'talim'],
  [/эколог|отход|очистк|водоснабж/i, 'ekologiya'],
  [/сельск|сельхоз|аграрн|семен|удобрен|животновод/i, 'qishloq'],
];

function sectorKey(categoryName) {
  const text = String(categoryName || '');
  for (const [pattern, key] of SECTOR_STEMS) if (pattern.test(text)) return key;
  return 'boshqa';
}

const isoDate = (value) => {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? new Date(time).toISOString().slice(0, 10) : '';
};

/**
 * Lot tafsilotidan normalizatsiya uchun xom yozuv qurish.
 *
 * Portalda "tender" va "lot" TenderMind dagidek ajratilmagan: auksion
 * yozuvi o'zi bitta lot. Shuning uchun har bir lotdan bitta lotli
 * e'lon quriladi — sun'iy guruhlash haqiqatni buzgan bo'lardi.
 */
function toRawRecord(detail) {
  const products = Array.isArray(detail.js_details) ? detail.js_details : [];
  const conditions = Array.isArray(detail.js_conditions) ? detail.js_conditions : [];

  // Sarlavha: portal alohida "nom" maydonini bermaydi, shuning uchun
  // birinchi mahsulot nomidan quriladi, bo'lmasa kategoriyadan.
  const firstProduct = products[0] || {};
  const title = String(
    firstProduct.product_name || firstProduct.name || detail.category_name || ''
  ).trim();

  const quantityNote = products.length > 1
    ? `${products.length} ta turdagi mahsulot`
    : (firstProduct.amount ? `${firstProduct.amount} ${firstProduct.measure_name || ''}`.trim() : '');

  return {
    id: `uzex-${detail.id}`,
    sourceId: String(detail.display_no || detail.id),
    sourceUrl: `${PORTAL}/auction/info-about-lot/${detail.id}`,

    title: title || `Lot ${detail.display_no}`,
    org: String(detail.customer_name || '').trim(),
    category: sectorKey(detail.category_name),
    region: regionKey(detail.region_name),

    description: [
      detail.description,
      quantityNote,
      detail.district_name ? `Yetkazib berish hududi: ${detail.district_name}` : '',
      detail.delivery_days ? `Yetkazib berish muddati: ${detail.delivery_days} kun` : '',
    ].filter(Boolean).join('. '),

    // Boshlang'ich narx — auksionda shu summadan past taklif beriladi
    budget: detail.start_cost,
    deadline: isoDate(detail.end_date),
    postedDate: isoDate(detail.start_date || detail.date_ini),

    contactPhone: String(detail.phone || '').trim(),
    contactEmail: String(detail.email || '').trim(),

    requirements: conditions
      .map(c => String(c.condition_name || '').trim())
      .filter(Boolean)
      .slice(0, 10),

    tags: [detail.category_name, detail.customer_type, detail.currency_name]
      .filter(Boolean)
      .map(t => String(t).slice(0, 50)),
  };
}

/**
 * Ochiq lotlarni olish.
 *
 * `limit` — nechta lot olinsin (standart 40). Portalda minglab yozuv
 * bor, hammasini bir yo'la tortish na bizga, na portalga kerak.
 */
async function fetchRecords(options = {}) {
  const limit = Math.max(1, Math.min(500, Number(options.limit) || 40));
  const records = [];
  let cursor = 1;
  let total = null;

  while (records.length < limit) {
    const to = Math.min(cursor + PAGE_SIZE - 1, limit);
    const page = await postJson('/Common/GetMinimizedLotsList', { from: cursor, to });

    if (!Array.isArray(page) || page.length === 0) break;
    if (total === null) {
      total = page[0]?.total_count ?? null;
      if (total !== null) logger.info(`UzEx: portalda ${total} ta ochiq lot bor`);
    }

    for (const summary of page) {
      if (records.length >= limit) break;
      try {
        // Ro'yxatda sarlavha ham, buyurtmachi ham yo'q — ular faqat
        // tafsilotda. Tushuntirish va hujjat uchun ikkalasi ham shart.
        const detail = await getJson(`/Common/GetLot/${summary.id}`);
        const lot = Array.isArray(detail) ? detail[0] : detail;
        if (lot && lot.id) records.push(toRawRecord(lot));
      } catch (err) {
        logger.warn(`UzEx: ${summary.id} lot tafsiloti olinmadi — ${err.message}`);
      }
    }

    cursor = to + 1;
    if (total !== null && cursor > total) break;
  }

  logger.info(`UzEx: ${records.length} ta lot olindi`);
  return records;
}

module.exports = {
  name: 'uzex',
  label: 'xarid.uzex.uz — davlat xaridlari portali',
  fetchRecords,
  // Testlar uchun
  toRawRecord,
  regionKey,
  sectorKey,
};
