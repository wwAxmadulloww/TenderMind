'use strict';

/**
 * Lokal ishga tushirish — tashqi MongoDB ga ulanmasdan.
 *
 * Baza `.data/mongo` papkasida SAQLANADI: yaratgan tenderlaringiz,
 * foydalanuvchilar va sozlamalar server qayta ishga tushganda ham
 * joyida qoladi. Bu Atlas klasteri yo'q paytda ham to'liq ishlaydigan
 * muhit beradi.
 *
 *   npm run dev:local              — saqlanadigan baza (tavsiya)
 *   npm run dev:local -- --fresh   — bazani tozalab boshlash
 *   TM_EPHEMERAL=true npm run dev:local  — xotirada, saqlanmaydi
 */

const path = require('node:path');
const fs = require('node:fs');
const { MongoMemoryServer } = require('mongodb-memory-server');

const DATA_DIR = path.join(__dirname, '..', '.data', 'mongo');

async function main() {
  const fresh = process.argv.includes('--fresh');
  const ephemeral = process.env.TM_EPHEMERAL === 'true';

  if (fresh && fs.existsSync(DATA_DIR)) {
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
    console.log('🧹 Eski baza o\'chirildi (--fresh)');
  }

  let mongod;
  if (ephemeral) {
    console.log('⏳ Xotirada MongoDB ko\'tarilmoqda (saqlanmaydi)...');
    mongod = await MongoMemoryServer.create();
  } else {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log('⏳ Lokal MongoDB ko\'tarilmoqda...');
    // wiredTiger — diskka yozadigan dvigatel. Busiz ma'lumot
    // faqat xotirada qolardi va server o'chganda yo'qolardi.
    mongod = await MongoMemoryServer.create({
      instance: { dbPath: DATA_DIR, storageEngine: 'wiredTiger' },
    });
  }

  process.env.MONGODB_URI = mongod.getUri('tendermind_local');
  process.env.NODE_ENV = process.env.NODE_ENV || 'development';
  process.env.PORT = process.env.PORT || '3002';

  if (!process.env.JWT_SECRET) {
    // Saqlanadigan rejimda sirni ham saqlaymiz — aks holda har
    // qayta ishga tushishda barcha sessiyalar yaroqsiz bo'lardi.
    process.env.JWT_SECRET = ephemeral ? randomSecret() : persistentSecret();
  }

  console.log(ephemeral
    ? '✅ Xotiradagi MongoDB tayyor\n'
    : `✅ Lokal MongoDB tayyor — ma'lumot saqlanadi: .data/mongo\n`);

  const { startServer } = require('../server');
  await startServer();

  await createLocalAdmin();

  const shutdown = async () => {
    console.log('\n🛑 To\'xtatilmoqda...');
    await mongod.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

const randomSecret = () => require('node:crypto').randomBytes(48).toString('hex');

/** Sirni fayldan o'qish, bo'lmasa yaratib qo'yish */
function persistentSecret() {
  const file = path.join(__dirname, '..', '.data', 'jwt-secret');
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();

  const secret = randomSecret();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, secret, { mode: 0o600 });
  console.log('ℹ️  Lokal JWT_SECRET yaratildi va .data/ ga saqlandi');
  return secret;
}

/**
 * Lokal admin hisobi.
 *
 * Faqat shu skript uchun. Productionda hech qachon chaqirilmaydi —
 * server.js bunga murojaat qilmaydi.
 */
async function createLocalAdmin() {
  const bcrypt = require('bcryptjs');
  const { User } = require('../db');

  const phone = '+998901234567';
  const password = 'admin1234';

  let user = await User.findOne({ phone });
  if (!user) {
    user = await User.create({
      name: 'Lokal Admin',
      phone,
      company: 'TenderMind',
      passwordHash: await bcrypt.hash(password, 10),
      role: 'admin',
    });
  } else if (user.role !== 'admin') {
    user.role = 'admin';
    await user.save();
  }

  console.log('┌─ Lokal admin hisobi ───────────────────────────────────');
  console.log(`│  Telefon: ${phone}`);
  console.log(`│  Parol:   ${password}`);
  console.log(`│  Sayt:    http://localhost:${process.env.PORT}`);
  console.log(`│  Panel:   http://localhost:${process.env.PORT}/admin`);
  console.log('└────────────────────────────────────────────────────────\n');
}

main().catch(err => {
  console.error('❌ Lokal server ishga tushmadi:', err.message);
  if (String(err.message).includes('dbPath')) {
    console.error('   Bazani tozalab ko\'ring: npm run dev:local -- --fresh');
  }
  process.exit(1);
});
