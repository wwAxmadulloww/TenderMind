'use strict';

/**
 * Ingestion ni ishga tushirish.
 *
 *   node scripts/ingest.js file --path=./data/tenderlar.json
 *   node scripts/ingest.js file --path=./export.csv --dry-run
 *   node scripts/ingest.js http-json --limit=100
 *
 * Cron misoli (har kuni ertalab 7:00 da):
 *   0 7 * * *  cd /path/to/TenderMInd && node scripts/ingest.js http-json >> logs/ingest.log 2>&1
 */

require('dotenv').config();
const { connectDB, mongoose } = require('../db');
const { runIngestion } = require('../services/ingestion');
const sources = require('../services/ingestion/sources');

function parseArgs(argv) {
  const options = {};
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const [key, value = 'true'] = arg.slice(2).split('=');
    const camel = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    options[camel] = value === 'true' ? true : value === 'false' ? false : value;
  }
  return options;
}

async function main() {
  const [, , sourceName, ...rest] = process.argv;

  if (!sourceName || sourceName === '--help') {
    console.log('Foydalanish: node scripts/ingest.js <manba> [--path=...] [--limit=N] [--dry-run]');
    console.log('\nMavjud manbalar:');
    for (const source of sources.all()) {
      console.log(`  ${source.name.padEnd(12)} ${source.description}`);
    }
    process.exit(sourceName ? 0 : 1);
  }

  const options = parseArgs(rest);

  await connectDB({ required: true });
  const report = await runIngestion(sourceName, options);

  console.log('\n┌─ Ingestion hisoboti ───────────────────────');
  console.log(`│  Manba:        ${report.source}${report.dryRun ? '  (dry-run — bazaga yozilmadi)' : ''}`);
  console.log(`│  O'qildi:      ${report.fetched}`);
  console.log(`│  Yangi:        ${report.created}`);
  console.log(`│  Yangilandi:   ${report.updated}`);
  console.log(`│  O'zgarmadi:   ${report.unchanged}`);
  console.log(`│  O'tkazildi:   ${report.skipped}`);
  console.log(`│  Davomiyligi:  ${report.durationMs} ms`);
  console.log('└────────────────────────────────────────────');

  if (report.errors.length) {
    console.log(`\n⚠️  ${report.errors.length} ta muammo:`);
    report.errors.slice(0, 20).forEach(e => console.log(`   • ${e}`));
    if (report.errors.length > 20) console.log(`   ... va yana ${report.errors.length - 20} ta`);
  }

  if (report.created > 0 || report.updated > 0) {
    console.log('\nℹ️  Yangi yozuvlar "tekshirilmagan" holatda. Admin panelda ko\'rib chiqing: /admin');
  }

  await mongoose.disconnect();
  process.exit(report.errors.length && report.fetched === report.skipped ? 1 : 0);
}

main().catch(async (err) => {
  console.error('❌ Ingestion xatosi:', err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
