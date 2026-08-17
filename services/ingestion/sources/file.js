'use strict';

const fs = require('fs/promises');
const path = require('path');

/**
 * FAYL MANBASI — JSON yoki CSV.
 *
 * Bu adapter bugunoq ishlaydi: portaldan qo'lda yuklab olingan eksportni
 * (yoki qo'lda tayyorlangan ro'yxatni) bazaga kiritish uchun. Portal
 * API si ochilgunicha haqiqiy ma'lumot bilan ishlashning eng ishonchli yo'li.
 *
 *   node scripts/ingest.js file --path=./data/tenderlar.json
 */

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(line => line.trim());
  if (lines.length < 2) return [];

  const splitLine = (line) => {
    const cells = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"') {
        // Ikkilangan qo'shtirnoq — qochirilgan qo'shtirnoq
        if (inQuotes && line[i + 1] === '"') { current += '"'; i += 1; }
        else inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        cells.push(current); current = '';
      } else {
        current += char;
      }
    }
    cells.push(current);
    return cells.map(c => c.trim());
  };

  const headers = splitLine(lines[0]);
  return lines.slice(1).map(line => {
    const cells = splitLine(line);
    const row = {};
    headers.forEach((header, i) => { row[header] = cells[i] ?? ''; });
    return row;
  });
}

async function fetchRecords(options = {}) {
  const filePath = options.path || process.env.INGEST_FILE_PATH;
  if (!filePath) {
    throw new Error('Fayl yo\'li ko\'rsatilmagan. Misol: --path=./data/tenderlar.json');
  }

  const absolute = path.resolve(filePath);
  const text = await fs.readFile(absolute, 'utf8');

  if (absolute.toLowerCase().endsWith('.csv')) {
    return parseCsv(text);
  }

  const parsed = JSON.parse(text);
  // Ham `[...]`, ham `{ items: [...] }` / `{ data: [...] }` qo'llab-quvvatlanadi
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.items)) return parsed.items;
  if (Array.isArray(parsed.data)) return parsed.data;
  if (Array.isArray(parsed.results)) return parsed.results;

  throw new Error('JSON faylda massiv topilmadi (kutilgan: [...] yoki { items: [...] })');
}

module.exports = {
  name: 'file',
  description: 'Lokal JSON yoki CSV fayldan import qilish',
  fetch: fetchRecords,
  parseCsv,
};
