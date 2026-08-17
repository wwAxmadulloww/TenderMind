'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  parseCommand, parseSettings, generateLinkCode, normalizeLinkCode, matchesFilters,
} = require('../services/telegram/commands');
const { escapeHtml, tenderNotification, statusMessage } = require('../services/telegram/messages');
const api = require('../services/telegram/api');

// ── Buyruqlar ────────────────────────────────────────────────────────
test('parseCommand — oddiy va guruh ko\'rinishi', () => {
  assert.deepStrictEqual(parseCommand('/start'), { command: 'start', args: [] });
  assert.deepStrictEqual(parseCommand('/ulash ABC12345'), { command: 'ulash', args: ['ABC12345'] });
  // Guruhlarda Telegram bot nomini qo'shadi
  assert.deepStrictEqual(parseCommand('/holat@TenderMindBot'), { command: 'holat', args: [] });
  assert.deepStrictEqual(parseCommand('oddiy matn'), { command: null, args: [] });
});

test('parseSettings — soha', () => {
  assert.deepStrictEqual(parseSettings(['soha', 'it']), { ok: true, field: 'soha', value: 'it' });
  assert.deepStrictEqual(parseSettings(['soha', 'barchasi']), { ok: true, field: 'soha', value: 'all' });

  const bad = parseSettings(['soha', 'kosmonavtika']);
  assert.strictEqual(bad.ok, false);
  assert.ok(bad.error.includes('Noma\'lum soha'));
});

test('parseSettings — byudjet', () => {
  assert.deepStrictEqual(parseSettings(['byudjet', '500000000']), { ok: true, field: 'minBudget', value: 500000000 });
  assert.deepStrictEqual(parseSettings(['byudjet', '500 000 000']), { ok: true, field: 'minBudget', value: 500000000 });
  assert.deepStrictEqual(parseSettings(['byudjet', '0']), { ok: true, field: 'minBudget', value: 0 });
});

test('parseSettings — argumentsiz yordam ko\'rsatadi', () => {
  assert.strictEqual(parseSettings([]).showHelp, true);
  assert.strictEqual(parseSettings(['soha']).showHelp, true);
});

test('Bog\'lash kodi — chalkashtiradigan belgilarsiz', () => {
  for (let i = 0; i < 50; i += 1) {
    const code = generateLinkCode();
    assert.strictEqual(code.length, 8);
    assert.ok(!/[01IO]/.test(code), `kodda chalkash belgi bor: ${code}`);
  }
});

test('normalizeLinkCode — kichik harf va ortiqcha belgilarni tozalaydi', () => {
  assert.strictEqual(normalizeLinkCode('abc12345'), 'ABC12345');
  assert.strictEqual(normalizeLinkCode(' abc-123-45 '), 'ABC12345');
  assert.strictEqual(normalizeLinkCode(''), '');
});

// ── Filtrlash ────────────────────────────────────────────────────────
const tender = { soha: 'it', hudud: 'toshkent', budgetRaw: 500000000 };

test('matchesFilters — bo\'sh filtr hammasini o\'tkazadi', () => {
  assert.ok(matchesFilters(tender, {}));
  assert.ok(matchesFilters(tender, { soha: 'all', hudud: 'all', minBudget: 0 }));
});

test('matchesFilters — soha va hudud', () => {
  assert.ok(matchesFilters(tender, { soha: 'it' }));
  assert.ok(!matchesFilters(tender, { soha: 'qurilish' }));
  assert.ok(!matchesFilters(tender, { hudud: 'samarqand' }));
});

test('matchesFilters — minimal byudjet', () => {
  assert.ok(matchesFilters(tender, { minBudget: 100000000 }));
  assert.ok(!matchesFilters(tender, { minBudget: 900000000 }));
});

// ── Xabar formatlash ─────────────────────────────────────────────────
test('escapeHtml — HTML in\'ektsiyasining oldini oladi', () => {
  assert.strictEqual(escapeHtml('<b>qalin</b>'), '&lt;b&gt;qalin&lt;/b&gt;');
  assert.strictEqual(escapeHtml('a & b'), 'a &amp; b');
});

test('Xabarnoma — tender sarlavhasidagi HTML qochiriladi', () => {
  const text = tenderNotification({
    title: '<script>alert(1)</script> Tender', org: 'Org',
    budget: '450 000 000', deadline: '2027-01-01',
  }, []);
  assert.ok(!text.includes('<script>'));
  assert.ok(text.includes('&lt;script&gt;'));
});

test('Xabarnoma — DEMO va tekshirilmagan holat aniq belgilanadi', () => {
  const demo = tenderNotification({ title: 'T', org: 'O', budget: '1', deadline: '2027-01-01', isDemo: true }, []);
  assert.ok(demo.includes('Namunaviy'));

  const unverified = tenderNotification({ title: 'T', org: 'O', budget: '1', deadline: '2027-01-01', isDemo: false, isVerified: false }, []);
  assert.ok(unverified.includes('Tekshirilmagan'));
});

test('Xabarnoma — ko\'p lotli tenderda lotlar ro\'yxati', () => {
  const lots = [
    { lotNumber: 1, title: 'Partalar', startPrice: 270000000 },
    { lotNumber: 2, title: 'Stullar', startPrice: 180000000 },
  ];
  const text = tenderNotification({ title: 'Mebel', org: 'Org', budget: '450 000 000', deadline: '2027-03-15' }, lots);
  assert.ok(text.includes('2 ta lot'));
  assert.ok(text.includes('Partalar'));
});

test('statusMessage — sozlanmagan filtrlar "barchasi" deb ko\'rsatiladi', () => {
  const text = statusMessage({ name: 'Ali', telegram: { notifyEnabled: true, filters: {} } });
  assert.ok(text.includes('barchasi'));
  assert.ok(text.includes('Ali'));
});

// ── Sozlama ──────────────────────────────────────────────────────────
test('Bot tokeni tekshiriladi — noto\'g\'ri format qabul qilinmaydi', () => {
  const original = process.env.TELEGRAM_BOT_TOKEN;

  process.env.TELEGRAM_BOT_TOKEN = '';
  assert.strictEqual(api.isConfigured(), false);

  process.env.TELEGRAM_BOT_TOKEN = 'notatoken';
  assert.strictEqual(api.isConfigured(), false);

  process.env.TELEGRAM_BOT_TOKEN = '123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw';
  assert.strictEqual(api.isConfigured(), true);

  process.env.TELEGRAM_BOT_TOKEN = original || '';
});

test('Token yo\'q bo\'lsa — yolg\'on muvaffaqiyat emas, aniq xato', async () => {
  const original = process.env.TELEGRAM_BOT_TOKEN;
  process.env.TELEGRAM_BOT_TOKEN = '';

  await assert.rejects(() => api.sendMessage('123', 'test'), /sozlanmagan/);

  process.env.TELEGRAM_BOT_TOKEN = original || '';
});
