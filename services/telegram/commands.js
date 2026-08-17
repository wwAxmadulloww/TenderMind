'use strict';

/**
 * Bot buyruqlarini o'qish — sof funksiya, tarmoqqa bog'liq emas.
 * Shu sababdan to'liq test qilinadi.
 */

const VALID_SOHA = ['it', 'qurilish', 'tibbiyot', 'oziq', 'transport', 'talim', 'ekologiya', 'qishloq'];
const ALL_WORDS = ['barchasi', 'hammasi', 'all', '*'];

function parseCommand(rawText) {
  const text = String(rawText || '').trim();
  if (!text.startsWith('/')) return { command: null, args: [] };

  // "/ulash@TenderMindBot KOD" → guruhlarda bot nomi qo'shiladi
  const [rawCommand, ...args] = text.split(/\s+/);
  const command = rawCommand.slice(1).split('@')[0].toLowerCase();

  return { command, args };
}

/**
 * /sozlama buyrug'ini tahlil qilish.
 * @returns {{ok: true, field: string, value: any} | {ok: false, error: string} | {ok: false, showHelp: true}}
 */
function parseSettings(args) {
  if (!args.length) return { ok: false, showHelp: true };

  const field = String(args[0]).toLowerCase();
  const value = args.slice(1).join(' ').trim().toLowerCase();

  if (!value) return { ok: false, showHelp: true };

  if (field === 'soha') {
    if (ALL_WORDS.includes(value)) return { ok: true, field: 'soha', value: 'all' };
    if (!VALID_SOHA.includes(value)) {
      return { ok: false, error: `Noma'lum soha: "${value}". Mavjud: ${VALID_SOHA.join(', ')}` };
    }
    return { ok: true, field: 'soha', value };
  }

  if (field === 'hudud') {
    if (ALL_WORDS.includes(value)) return { ok: true, field: 'hudud', value: 'all' };
    // Hudud ro'yxati ochiq — yangi hudud qo'shilsa kod o'zgarmasin
    return { ok: true, field: 'hudud', value: value.replace(/[^a-z'‘’-]/g, '') };
  }

  if (field === 'byudjet' || field === 'budget') {
    if (ALL_WORDS.includes(value) || value === '0') return { ok: true, field: 'minBudget', value: 0 };
    const amount = Number(value.replace(/[^\d]/g, ''));
    if (!Number.isFinite(amount) || amount < 0) {
      return { ok: false, error: 'Byudjet raqam bo\'lishi kerak. Misol: /sozlama byudjet 500000000' };
    }
    return { ok: true, field: 'minBudget', value: amount };
  }

  return { ok: false, error: `Noma'lum sozlama: "${field}". Mavjud: soha, hudud, byudjet` };
}

/** Bog'lash kodi: 8 ta belgi, chalkashtiradigan harflarsiz (0/O, 1/I) */
function generateLinkCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

function normalizeLinkCode(input) {
  return String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

/**
 * Tender foydalanuvchi filtriga mos keladimi?
 * Notifikatsiya yuborishdan oldin shu tekshiriladi.
 */
function matchesFilters(tender, filters = {}) {
  if (filters.soha && filters.soha !== 'all' && tender.soha !== filters.soha) return false;
  if (filters.hudud && filters.hudud !== 'all' && tender.hudud !== filters.hudud) return false;
  if (filters.minBudget > 0 && Number(tender.budgetRaw || 0) < filters.minBudget) return false;
  return true;
}

module.exports = {
  parseCommand, parseSettings, generateLinkCode, normalizeLinkCode,
  matchesFilters, VALID_SOHA,
};
