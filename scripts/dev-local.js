'use strict';

/**
 * Lokal ishga tushirish — MongoDB Atlas ga ulanmasdan.
 *
 * Xotiradagi MongoDB ko'tariladi, seed va lot migratsiyasi bajariladi.
 * Internet yoki Atlas kaliti kerak emas. Ma'lumot server o'chganda yo'qoladi.
 *
 *   npm run dev:local
 */

const { MongoMemoryServer } = require('mongodb-memory-server');

async function main() {
  console.log('⏳ Xotirada MongoDB ko\'tarilmoqda...');
  const mongod = await MongoMemoryServer.create();

  process.env.MONGODB_URI = mongod.getUri('tendermind_local');
  process.env.NODE_ENV = process.env.NODE_ENV || 'development';
  process.env.PORT = process.env.PORT || '3002';
  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = require('crypto').randomBytes(48).toString('hex');
    console.log('ℹ️  Vaqtinchalik JWT_SECRET yaratildi (faqat shu sessiya uchun)');
  }

  console.log('✅ Xotiradagi MongoDB tayyor\n');

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

/**
 * Lokal admin hisobi.
 *
 * Faqat shu skript uchun — baza xotirada va server o'chganda yo'qoladi.
 * Productionda hech qachon chaqirilmaydi (server.js bunga murojaat qilmaydi).
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

  console.log('\n┌─ Lokal admin hisobi (faqat shu sessiya uchun) ─────────');
  console.log(`│  Telefon: ${phone}`);
  console.log(`│  Parol:   ${password}`);
  console.log(`│  Panel:   http://localhost:${process.env.PORT}/admin`);
  console.log('└────────────────────────────────────────────────────────\n');
}

main().catch(err => {
  console.error('❌ Lokal server ishga tushmadi:', err);
  process.exit(1);
});
