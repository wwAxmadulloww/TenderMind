'use strict';

/**
 * Foydalanuvchini administrator qilish.
 *
 *   node scripts/make-admin.js +998901234567
 *
 * Birinchi adminni shu skript orqali yarating — API orqali o'zini admin
 * qilish imkoniyati ataylab qo'yilmagan (aks holda istalgan ro'yxatdan
 * o'tgan odam admin bo'lib olardi).
 */

require('dotenv').config();
const { connectDB, User, mongoose } = require('../db');
const { normalizeUzbekPhone } = require('../validators');

async function main() {
  const raw = process.argv[2];
  if (!raw) {
    console.error('❌ Telefon raqam kiriting:\n   node scripts/make-admin.js +998901234567');
    process.exit(1);
  }

  const phone = normalizeUzbekPhone(raw);
  console.log(`⏳ ${phone} qidirilmoqda...`);

  await connectDB({ required: true });

  const user = await User.findOne({ phone });
  if (!user) {
    console.error(`❌ Bunday raqamli foydalanuvchi topilmadi: ${phone}`);
    console.error('   Avval ilovada ro\'yxatdan o\'ting, keyin shu skriptni ishga tushiring.');
    await mongoose.disconnect();
    process.exit(1);
  }

  if (user.role === 'admin') {
    console.log(`ℹ️  ${user.name} allaqachon administrator.`);
  } else {
    user.role = 'admin';
    await user.save();
    console.log(`✅ ${user.name} (${phone}) endi administrator.`);
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('❌ Xato:', err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
