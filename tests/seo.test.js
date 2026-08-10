'use strict';

const test = require('node:test');
const assert = require('node:assert');

process.env.FRONTEND_URL = 'https://tendermind.uz';
const seo = require('../services/seo/render');

const baseTender = {
  id: 'test-001', title: 'Maktablar uchun parta yetkazib berish',
  org: 'Toshkent shahar hokimiyati', soha: 'talim', hudud: 'toshkent',
  budget: '450 000 000', budgetRaw: 450000000,
  deadline: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
  description: '500 ta o\'quvchi partasi', requirements: ['Sifat sertifikati'],
  isDemo: false, isVerified: true,
};

const baseLot = {
  lotNumber: 1, title: 'O\'quvchi partalari', startPrice: 270000000,
  quantity: 300, unit: 'dona',
  deadline: baseTender.deadline, requirements: ['E1 sinf material'],
};

// ── Indekslash qoidalari ─────────────────────────────────────────────
test('Haqiqiy tender indekslanadi', () => {
  const html = seo.renderTenderPage(baseTender, [baseLot]);
  assert.ok(html.includes('content="index, follow"'));
});

test('DEMO tender qidiruvga tushmaydi', () => {
  const html = seo.renderTenderPage({ ...baseTender, isDemo: true }, [baseLot]);
  assert.ok(html.includes('content="noindex, follow"'),
    'namunaviy ma\'lumot qidiruv natijalariga tushmasligi kerak');
  assert.ok(html.includes('Namunaviy ma'));
});

test('Muddati tugagan tender ham indekslanmaydi', () => {
  const past = new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10);
  const html = seo.renderTenderPage({ ...baseTender, deadline: past }, []);
  assert.ok(html.includes('content="noindex, follow"'));
});

test('Tekshirilmagan yozuv ogohlantirish bilan chiqadi', () => {
  const html = seo.renderTenderPage(
    { ...baseTender, isVerified: false, sourceUrl: 'https://misol.uz/1' }, [baseLot]
  );
  assert.ok(html.includes('Tekshirilmagan'));
  // Tashqi manbaga havola nofollow bo'lishi kerak
  assert.ok(html.includes('rel="nofollow noopener"'));
});

// ── Meta teglar ──────────────────────────────────────────────────────
test('Sahifada barcha zarur meta teglar bor', () => {
  const html = seo.renderTenderPage(baseTender, [baseLot]);

  assert.ok(html.includes('<title>'));
  assert.ok(html.includes('name="description"'));
  assert.ok(html.includes('rel="canonical" href="https://tendermind.uz/tender/test-001"'));
  assert.ok(html.includes('property="og:title"'));
  assert.ok(html.includes('property="og:url"'));
  assert.ok(html.includes('application/ld+json'));
  assert.ok(html.includes('lang="uz"'));
});

test('Tavsif 155 belgidan oshmaydi', () => {
  const description = seo.buildDescription(baseTender, [baseLot, baseLot]);
  assert.ok(description.length <= 155, `uzunlik: ${description.length}`);
  assert.ok(description.includes('Toshkent shahar hokimiyati'));
});

test('JSON-LD to\'g\'ri tuzilgan', () => {
  const jsonLd = seo.buildJsonLd(baseTender, [baseLot]);
  assert.strictEqual(jsonLd['@type'], 'GovernmentService');
  assert.strictEqual(jsonLd.offers.price, 450000000);
  assert.strictEqual(jsonLd.offers.priceCurrency, 'UZS');
  // JSON.stringify xatosiz ishlashi kerak — sahifaga shunday joylanadi
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(jsonLd)));
});

// ── Mazmun ───────────────────────────────────────────────────────────
test('Lot mazmuni HTML da bor — JS kutilmaydi', () => {
  const html = seo.renderTenderPage(baseTender, [baseLot]);
  assert.ok(html.includes('O&#39;quvchi partalari'));
  assert.ok(html.includes('270 000 000') || html.includes('270 000 000'));
  assert.ok(html.includes('E1 sinf material'));
});

test('Tayyor tushuntirish sahifada ko\'rinadi', () => {
  const lot = {
    ...baseLot,
    explanation: {
      nima: 'Bu lotda 300 dona parta sotib olinmoqda.',
      kim: 'Mebel ishlab chiqaruvchilar.',
      hujjatlar: ['Narx taklifi', 'Texnik taklif'],
      pul: 'Boshlang\'ich narx 270 mln so\'m.',
      muddat: '30 kun qoldi.',
      xulosa: 'Oddiy va tushunarli lot.',
    },
  };
  const html = seo.renderTenderPage(baseTender, [lot]);

  assert.ok(html.includes('Oddiy tilda tushuntirish'));
  assert.ok(html.includes('300 dona parta'));
  assert.ok(html.includes('Narx taklifi'));
});

test('HTML in\'ektsiyasi qochiriladi', () => {
  const html = seo.renderTenderPage(
    { ...baseTender, title: '<script>alert(1)</script>', org: '"onload="x' }, []
  );
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('"onload="x'));
});

// ── Sitemap va robots ────────────────────────────────────────────────
test('Sitemap to\'g\'ri XML qaytaradi', () => {
  const xml = seo.renderSitemap([
    { id: 'a-1', updatedAt: new Date('2027-01-15') },
    { id: 'a-2', updatedAt: new Date('2027-01-16') },
  ]);

  assert.ok(xml.startsWith('<?xml version="1.0"'));
  assert.ok(xml.includes('https://tendermind.uz/tender/a-1'));
  assert.ok(xml.includes('<lastmod>2027-01-15</lastmod>'));
  assert.ok(xml.includes('https://tendermind.uz/</loc>'), 'bosh sahifa ham bo\'lishi kerak');
});

test('Bo\'sh sitemap ham yaroqli XML', () => {
  const xml = seo.renderSitemap([]);
  assert.ok(xml.includes('<urlset'));
  assert.ok(xml.includes('</urlset>'));
});

test('robots.txt admin va API ni yopadi, sitemapni ko\'rsatadi', () => {
  const txt = seo.renderRobotsTxt();
  assert.ok(txt.includes('Disallow: /admin'));
  assert.ok(txt.includes('Disallow: /api/'));
  assert.ok(txt.includes('Sitemap: https://tendermind.uz/sitemap.xml'));
});

test('404 sahifasi indekslanmaydi', () => {
  const html = seo.renderNotFound();
  assert.ok(html.includes('noindex'));
  assert.ok(html.includes('Tender topilmadi'));
});

// ── Soha sahifasi ────────────────────────────────────────────────────
test('Soha sahifasi tenderlarga havola beradi', () => {
  const html = seo.renderCategoryPage('talim', [
    { id: 't-1', title: 'Parta yetkazish', org: 'Hokimiyat', hudud: 'buxoro',
      budget: '450 000 000', deadline: baseTender.deadline, isDemo: false },
  ]);

  assert.ok(html.includes('href="/tender/t-1"'), 'crawler tenderga o\'ta olishi kerak');
  // Apostrof HTML sifatida qochiriladi — sarlavha "Ta&#39;lim ..." ko'rinishida
  assert.ok(html.includes('Ta&#39;lim sohasidagi tenderlar'));
  assert.ok(html.includes('content="index, follow"'));
  assert.ok(html.includes('Buxoro'), 'hudud o\'qiladigan nomda bo\'lishi kerak');
});

test('Bo\'sh soha sahifasi indekslanmaydi', () => {
  const html = seo.renderCategoryPage('talim', []);
  assert.ok(html.includes('content="noindex, follow"'),
    'mazmuni yo\'q sahifa qidiruvga tushmasligi kerak');
});

test('Soha sahifasida DEMO belgisi ko\'rinadi', () => {
  const html = seo.renderCategoryPage('it', [
    { id: 'd-1', title: 'Demo tender', org: 'Org', hudud: 'toshkent',
      budget: '1 000 000', deadline: baseTender.deadline, isDemo: true },
  ]);
  assert.ok(html.includes('seo-list-demo'));
});

test('Sitemap kategoriya sahifalarini ham qamrab oladi', () => {
  const xml = seo.renderSitemap([{ id: 'a-1' }], ['it', 'talim']);
  assert.ok(xml.includes('https://tendermind.uz/tenderlar/it'));
  assert.ok(xml.includes('https://tendermind.uz/tenderlar/talim'));
});

test('Tender sahifasidagi breadcrumb havolasi mavjud sahifaga ketadi', () => {
  const html = seo.renderTenderPage(baseTender, []);
  const match = html.match(/href="(\/tenderlar\/[a-z]+)"/);
  assert.ok(match, 'breadcrumb havolasi bo\'lishi kerak');
  // Havoladagi soha renderCategoryPage tanigan qiymat bo'lishi shart
  const soha = match[1].split('/').pop();
  assert.ok(seo.SOHA_LABEL[soha], `"${soha}" soha ro'yxatida yo'q — havola 404 beradi`);
});
