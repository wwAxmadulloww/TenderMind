'use strict';

/**
 * Telegram bot ishchisi (long-polling).
 *
 *   node scripts/telegram-bot.js
 *
 * Webhook o'rniga long-polling ishlatiladi: bu ochiq HTTPS domen talab
 * qilmaydi, ya'ni lokal kompyuterda ham, serverda ham bir xil ishlaydi.
 *
 * Sozlash: .env ga TELEGRAM_BOT_TOKEN qo'shing (@BotFather dan olinadi).
 */

require('dotenv').config();
const { connectDB, mongoose } = require('../db');
const telegram = require('../services/telegram');
const logger = require('../logger');

let running = true;
let offset = 0;

async function main() {
  if (!telegram.api.isConfigured()) {
    console.error('❌ TELEGRAM_BOT_TOKEN sozlanmagan yoki formati noto\'g\'ri.');
    console.error('   @BotFather dan token oling va .env ga qo\'shing:');
    console.error('   TELEGRAM_BOT_TOKEN=123456789:AA...');
    process.exit(1);
  }

  await connectDB({ required: true });

  const me = await telegram.api.getMe();
  console.log(`✅ Bot ishga tushdi: @${me.username}`);
  console.log('   To\'xtatish uchun Ctrl+C\n');

  // Long-polling webhook bilan birga ishlamaydi
  await telegram.api.deleteWebhook();

  while (running) {
    try {
      const updates = await telegram.api.getUpdates(offset);

      for (const update of updates) {
        offset = update.update_id + 1;
        try {
          await telegram.handleUpdate(update);
        } catch (err) {
          // Bitta xabardagi xato butun botni to'xtatmasligi kerak
          logger.error('Telegram update xatosi', err);
        }
      }
    } catch (err) {
      if (!running) break;
      logger.error('getUpdates xatosi — 5 soniyadan keyin qayta urinamiz', err.message);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

  await mongoose.disconnect();
}

const shutdown = async () => {
  console.log('\n🛑 Bot to\'xtatilmoqda...');
  running = false;
  setTimeout(() => process.exit(0), 1000);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

main().catch(async (err) => {
  console.error('❌ Bot xatosi:', err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
