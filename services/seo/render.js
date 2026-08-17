'use strict';

const config = require('../../config');

/**
 * SERVER TOMONDA RENDER — qidiruv tizimlari uchun.
 *
 * SPA (index.html) JavaScript ishlagandan keyingina mazmun ko'rsatadi,
 * shuning uchun tenderlar Google'da umuman indekslanmaydi. Bu modul har
 * bir tender uchun to'liq HTML sahifa quradi: mazmun darhol ko'rinadi,
 * meta teglar va JSON-LD to'ldiriladi.
 *
 * MUHIM: demo yozuvlar `noindex` bilan chiqadi. Namunaviy (o'ylab
 * topilgan) tenderlar qidiruv natijalariga tushmasligi kerak — aks holda
 * odamlar mavjud bo'lmagan tenderni izlab kelaveradi.
 */

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const formatSom = (n) => new Intl.NumberFormat('uz-UZ').format(Math.round(Number(n) || 0));

function daysLeft(deadline) {
  return Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000);
}

function siteUrl() {
  return (config.frontendUrl || 'https://tendermind.uz').replace(/\/$/, '');
}

const SOHA_LABEL = {
  it: 'IT va axborot texnologiyalari', qurilish: 'Qurilish', tibbiyot: 'Tibbiyot',
  oziq: 'Oziq-ovqat', transport: 'Transport', talim: "Ta'lim",
  ekologiya: 'Ekologiya', qishloq: "Qishloq xo'jaligi", boshqa: 'Boshqa',
};

const HUDUD_LABEL = {
  toshkent: 'Toshkent', samarqand: 'Samarqand', buxoro: 'Buxoro',
  andijon: 'Andijon', namangan: 'Namangan', fargona: "Farg'ona",
  qashqadaryo: 'Qashqadaryo', surxondaryo: 'Surxondaryo', xorazm: 'Xorazm',
  navoiy: 'Navoiy', jizzax: 'Jizzax', sirdaryo: 'Sirdaryo',
  qoraqalpogiston: "Qoraqalpog'iston", boshqa: 'Boshqa',
};

/** Kod ko'rinishidagi qiymatni o'qiladigan nomga aylantirish */
const label = (map, value) => map[value] || value;

/** Qidiruv natijasida ko'rinadigan qisqa tavsif (155 belgigacha) */
function buildDescription(tender, lots) {
  const kun = daysLeft(tender.deadline);
  const parts = [
    `${tender.org} e'lon qildi.`,
    `Byudjet: ${tender.budget} so'm.`,
    lots.length > 1 ? `${lots.length} ta lot.` : '',
    kun > 0 ? `Muddat: ${tender.deadline} (${kun} kun).` : 'Muddati tugagan.',
  ].filter(Boolean);

  return parts.join(' ').slice(0, 155);
}

/**
 * JSON-LD ni <script> blokiga xavfsiz joylash.
 *
 * JSON.stringify HTML ni qochirmaydi, shuning uchun tender sarlavhasidagi
 * `</script>` brauzerda blokni erta yopib, undan keyingi matnni HTML deb
 * o'qitadi — bu XSS. `<` va `>` ni JSON qochirish ketma-ketligiga
 * aylantiramiz: JSON uchun bu bir xil qiymat, HTML uchun esa zararsiz.
 */
function safeJsonLd(data) {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

/** Google uchun tuzilgan ma'lumot */
function buildJsonLd(tender, lots) {
  return {
    '@context': 'https://schema.org',
    '@type': 'GovernmentService',
    name: tender.title,
    description: tender.description || buildDescription(tender, lots),
    provider: { '@type': 'GovernmentOrganization', name: tender.org },
    areaServed: { '@type': 'Place', name: tender.hudud },
    url: `${siteUrl()}/tender/${tender.id}`,
    ...(tender.budgetRaw ? {
      offers: {
        '@type': 'Offer',
        price: tender.budgetRaw,
        priceCurrency: 'UZS',
        availabilityEnds: tender.deadline,
      },
    } : {}),
  };
}

function renderExplanation(explanation) {
  if (!explanation || !explanation.xulosa) return '';

  const block = (title, content) => content
    ? `<div class="seo-exp-item"><h4>${escapeHtml(title)}</h4><p>${escapeHtml(content)}</p></div>`
    : '';

  const hujjatlar = Array.isArray(explanation.hujjatlar) && explanation.hujjatlar.length
    ? `<div class="seo-exp-item"><h4>Qanday hujjat kerak</h4><ul>${
        explanation.hujjatlar.map(h => `<li>${escapeHtml(h)}</li>`).join('')
      }</ul></div>`
    : '';

  return `
    <div class="seo-explanation">
      <h3>Oddiy tilda tushuntirish</h3>
      ${block('Nima sotib olinmoqda', explanation.nima)}
      ${block('Kim qatnasha oladi', explanation.kim)}
      ${hujjatlar}
      ${block('Pul masalasi', explanation.pul)}
      ${block('Muddat', explanation.muddat)}
      ${block('Qisqacha', explanation.xulosa)}
    </div>`;
}

function renderLot(lot) {
  const kun = daysLeft(lot.deadline);

  return `
  <article class="seo-lot" id="lot-${escapeHtml(lot.lotNumber)}">
    <h2>Lot №${escapeHtml(lot.lotNumber)} — ${escapeHtml(lot.title)}</h2>

    <dl class="seo-facts">
      <div><dt>Boshlang'ich narx</dt><dd>${formatSom(lot.startPrice)} so'm</dd></div>
      ${lot.quantity ? `<div><dt>Miqdori</dt><dd>${escapeHtml(lot.quantity)} ${escapeHtml(lot.unit || '')}</dd></div>` : ''}
      <div><dt>Muddat</dt><dd>${escapeHtml(lot.deadline)}${kun > 0 ? ` (${kun} kun qoldi)` : ' — tugagan'}</dd></div>
      ${lot.deliveryTerm ? `<div><dt>Yetkazib berish</dt><dd>${escapeHtml(lot.deliveryTerm)}</dd></div>` : ''}
    </dl>

    ${lot.description ? `<p>${escapeHtml(lot.description)}</p>` : ''}

    ${(lot.requirements || []).length ? `
      <h4>Talablar</h4>
      <ul>${lot.requirements.map(r => `<li>${escapeHtml(r)}</li>`).join('')}</ul>` : ''}

    ${renderExplanation(lot.explanation)}
  </article>`;
}

/**
 * Tender sahifasini to'liq HTML sifatida qurish.
 * @param {object} tender
 * @param {Array} lots
 */
function renderTenderPage(tender, lots = []) {
  const url = `${siteUrl()}/tender/${tender.id}`;
  const description = buildDescription(tender, lots);
  const kun = daysLeft(tender.deadline);

  // Demo yoki muddati tugagan yozuvlar qidiruvga tushmasin
  const noindex = tender.isDemo || kun < 0;

  const title = `${tender.title} — ${tender.org} | TenderMind`;

  return `<!DOCTYPE html>
<html lang="uz">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${escapeHtml(url)}">
${noindex ? '<meta name="robots" content="noindex, follow">' : '<meta name="robots" content="index, follow">'}

<meta property="og:type" content="article">
<meta property="og:title" content="${escapeHtml(tender.title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${escapeHtml(url)}">
<meta property="og:site_name" content="TenderMind">
<meta property="og:locale" content="uz_UZ">
<meta name="twitter:card" content="summary">

<link rel="stylesheet" href="/assets/css/core.css">
<link rel="stylesheet" href="/assets/css/doc.css">
<script type="application/ld+json">${safeJsonLd(buildJsonLd(tender, lots))}</script>
</head>
<body class="seo-body">

<header class="seo-header">
  <a href="/" class="seo-brand"><span class="logo-icon">⬡</span> TenderMind</a>
  <a href="/#browse" class="seo-cta">Ilovaga kirish</a>
</header>

<main class="seo-main">
  <nav class="seo-breadcrumb" aria-label="Yo'nalish">
    <a href="/">Bosh sahifa</a> ›
    <a href="/tenderlar/${escapeHtml(tender.soha)}">${escapeHtml(label(SOHA_LABEL, tender.soha))}</a> ›
    <span>${escapeHtml(tender.title.slice(0, 60))}</span>
  </nav>

  ${tender.isDemo ? `
    <div class="seo-notice demo">
      <strong>Namunaviy ma'lumot.</strong> Bu yozuv o'rganish uchun tayyorlangan —
      haqiqiy e'lon emas. Haqiqiy tenderlar uchun rasmiy portalni tekshiring.
    </div>` : (tender.isVerified === false ? `
    <div class="seo-notice unverified">
      <strong>Tekshirilmagan.</strong> Bu yozuv tashqi manbadan avtomatik olingan va
      hali qo'lda tasdiqlanmagan. Taklif berishdan oldin
      ${tender.sourceUrl
        ? `<a href="${escapeHtml(tender.sourceUrl)}" rel="nofollow noopener" target="_blank">asl e'lonni</a>`
        : "asl e'lonni"} tekshiring.
    </div>` : '')}

  <h1>${escapeHtml(tender.title)}</h1>

  <dl class="seo-facts seo-facts-main">
    <div><dt>Buyurtmachi</dt><dd>${escapeHtml(tender.org)}</dd></div>
    <div><dt>Byudjet</dt><dd>${escapeHtml(tender.budget)} so'm</dd></div>
    <div><dt>Soha</dt><dd>${escapeHtml(label(SOHA_LABEL, tender.soha))}</dd></div>
    <div><dt>Hudud</dt><dd>${escapeHtml(label(HUDUD_LABEL, tender.hudud))}</dd></div>
    <div><dt>Muddat</dt><dd>${escapeHtml(tender.deadline)}${kun > 0 ? ` (${kun} kun qoldi)` : ' — tugagan'}</dd></div>
    <div><dt>Lotlar</dt><dd>${lots.length} ta</dd></div>
  </dl>

  ${tender.description ? `<p class="seo-lead">${escapeHtml(tender.description)}</p>` : ''}

  ${(tender.requirements || []).length ? `
    <h2>Umumiy talablar</h2>
    <ul>${tender.requirements.map(r => `<li>${escapeHtml(r)}</li>`).join('')}</ul>` : ''}

  <h2>Lotlar</h2>
  ${lots.length ? lots.map(renderLot).join('') : '<p>Bu tender uchun lot ma\'lumoti yo\'q.</p>'}

  <div class="seo-cta-box">
    <h2>Bu tenderga qatnashmoqchimisiz?</h2>
    <p>
      TenderMind sizga hujjatlarni tayyorlashda yordam beradi va har bir lotni
      oddiy tilda tushuntiradi. Tender bilan ilk marta ishlayotgan bo'lsangiz —
      <a href="/#guide">boshlang'ich yo'riqnomadan</a> boshlang.
    </p>
    <a href="/#browse" class="seo-cta">Bepul boshlash</a>
  </div>
</main>

<footer class="seo-footer">
  <p>© ${new Date().getFullYear()} TenderMind · AI yordamida tayyorlangan matnlar insoniy tekshiruvni talab qiladi.</p>
</footer>

</body>
</html>`;
}

/**
 * Soha bo'yicha ro'yxat sahifasi.
 *
 * Qidiruv tizimi uchun ikki foydasi bor: o'zi indekslanadigan sahifa, va
 * crawler'ga alohida tenderlarga o'tish yo'lini beradi.
 */
function renderCategoryPage(soha, tenders = []) {
  const sohaName = label(SOHA_LABEL, soha);
  const url = `${siteUrl()}/tenderlar/${soha}`;
  const title = `${sohaName} sohasidagi tenderlar | TenderMind`;
  const description = tenders.length
    ? `${sohaName} bo'yicha ${tenders.length} ta faol tender. Byudjet, muddat va talablar — oddiy tilda tushuntirish bilan.`
    : `${sohaName} bo'yicha hozircha faol tender yo'q.`;

  const items = tenders.map(t => {
    const kun = daysLeft(t.deadline);
    return `
    <li class="seo-list-item">
      <a href="/tender/${escapeHtml(t.id)}"><h2>${escapeHtml(t.title)}</h2></a>
      <p class="seo-list-org">${escapeHtml(t.org)} · ${escapeHtml(label(HUDUD_LABEL, t.hudud))}</p>
      <p class="seo-list-meta">
        <span>${escapeHtml(t.budget)} so'm</span>
        <span>${kun > 0 ? `${kun} kun qoldi` : 'muddati tugagan'}</span>
        ${t.isDemo ? '<span class="seo-list-demo">DEMO</span>' : ''}
      </p>
    </li>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="uz">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${escapeHtml(url)}">
<meta name="robots" content="${tenders.length ? 'index, follow' : 'noindex, follow'}">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${escapeHtml(url)}">
<link rel="stylesheet" href="/assets/css/core.css">
<link rel="stylesheet" href="/assets/css/doc.css">
</head>
<body class="seo-body">

<header class="seo-header">
  <a href="/" class="seo-brand"><span class="logo-icon">⬡</span> TenderMind</a>
  <a href="/#browse" class="seo-cta">Ilovaga kirish</a>
</header>

<main class="seo-main">
  <nav class="seo-breadcrumb" aria-label="Yo'nalish">
    <a href="/">Bosh sahifa</a> › <span>${escapeHtml(sohaName)}</span>
  </nav>

  <h1>${escapeHtml(sohaName)} sohasidagi tenderlar</h1>
  <p>${escapeHtml(description)}</p>

  ${tenders.length
    ? `<ul class="seo-list">${items}</ul>`
    : '<p>Bu sohada hozircha e\'lon yo\'q. Boshqa sohalarni ko\'rish uchun <a href="/">bosh sahifaga</a> o\'ting.</p>'}
</main>

<footer class="seo-footer">
  <p>© ${new Date().getFullYear()} TenderMind</p>
</footer>

</body>
</html>`;
}

/** Sitemap — faqat indekslanadigan sahifalar */
function renderSitemap(tenders = [], sohalar = []) {
  const base = siteUrl();
  const today = new Date().toISOString().slice(0, 10);

  const staticPages = [
    { loc: `${base}/`, priority: '1.0', changefreq: 'daily' },
    ...sohalar.map(soha => ({
      loc: `${base}/tenderlar/${soha}`, priority: '0.6', changefreq: 'daily',
    })),
  ];

  const tenderPages = tenders.map(t => ({
    loc: `${base}/tender/${t.id}`,
    priority: '0.8',
    changefreq: 'daily',
    lastmod: t.updatedAt ? new Date(t.updatedAt).toISOString().slice(0, 10) : today,
  }));

  const urls = [...staticPages, ...tenderPages].map(page => `  <url>
    <loc>${escapeHtml(page.loc)}</loc>
    <lastmod>${page.lastmod || today}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
}

function renderRobotsTxt() {
  return `User-agent: *
Allow: /
Disallow: /admin
Disallow: /api/

Sitemap: ${siteUrl()}/sitemap.xml
`;
}

/** Tender topilmaganda — to'g'ri 404 sahifasi */
function renderNotFound() {
  return `<!DOCTYPE html>
<html lang="uz">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Tender topilmadi — TenderMind</title>
<meta name="robots" content="noindex, follow">
<link rel="stylesheet" href="/assets/css/core.css">
<link rel="stylesheet" href="/assets/css/doc.css">
</head>
<body class="seo-body">
<header class="seo-header">
  <a href="/" class="seo-brand"><span class="logo-icon">⬡</span> TenderMind</a>
</header>
<main class="seo-main">
  <h1>Tender topilmadi</h1>
  <p>Bu tender o'chirilgan yoki manzil noto'g'ri kiritilgan bo'lishi mumkin.</p>
  <p><a href="/" class="seo-cta">Barcha tenderlarni ko'rish</a></p>
</main>
</body>
</html>`;
}

module.exports = {
  renderTenderPage, renderCategoryPage, renderSitemap, renderRobotsTxt, renderNotFound,
  escapeHtml, buildDescription, buildJsonLd, siteUrl, SOHA_LABEL, HUDUD_LABEL,
};
