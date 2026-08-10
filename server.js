/* ═══════════════════════════════════════════════════════════
   TENDERMIND — server.js  v3.0 (Refactored Entry Point)
   Node.js + Express + AI backend
   ═══════════════════════════════════════════════════════════ */

'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const logger = require('./logger');
const config = require('./config');
const { corsOptions } = require('./config/cors');
const { connectDB, isDBConnected } = require('./db');
const tenderRepository = require('./repositories/tenderRepository');
const lotRepository = require('./repositories/lotRepository');
const aiManager = require('./services/ai');
const billing = require('./services/billing');

// Import Routers
const authRouter = require('./routes/auth');
const tendersRouter = require('./routes/tenders');
const lotsRouter = require('./routes/lots');
const learnRouter = require('./routes/learn');
const adminRouter = require('./routes/admin');
const billingRouter = require('./routes/billing');
const aiRouter = require('./routes/ai');
const exportRouter = require('./routes/export');

const app = express();
const PORT = config.port;
const isProd = config.isProd;

// Helper to check if any AI provider is configured
const isGeminiConfigured = () => aiManager.isConfigured();

// ── Security & Global Middlewares ─────────────────────────────────────
// Render/Nginx kabi prokci ortida haqiqiy mijoz IP sini olish uchun.
// Busiz express-rate-limit hamma so'rovni bitta prokci IP deb hisoblaydi
// va bitta foydalanuvchi limitni tugatsa — hamma bloklanadi.
if (isProd) app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: false,  // flexible for inline onclick handlers in landing page
  crossOriginEmbedderPolicy: false,
}));

app.use(cors(corsOptions()));
app.use(express.json({ limit: '2mb' }));

// Static file serving for client files
app.use('/styles.css', express.static(path.join(__dirname, 'styles.css')));
app.use('/app.js', express.static(path.join(__dirname, 'app.js')));
app.use('/i18n.js', express.static(path.join(__dirname, 'i18n.js')));
app.use('/logo.png', express.static(path.join(__dirname, 'logo.png')));
app.use('/favicon.ico', express.static(path.join(__dirname, 'logo.png')));

app.use('/admin.js', express.static(path.join(__dirname, 'admin.js')));

// Serve Frontend Landing & SPA page
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// Admin panel — alohida sahifa. Kirish huquqi API darajasida tekshiriladi,
// sahifaning o'zi statik fayl (unda maxfiy ma'lumot yo'q).
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

// Rate limiter for general Auth endpoints
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 60,
  message: { error: 'Juda ko\'p so\'rov. 15 daqiqadan keyin urinib ko\'ring.' }
});

// ── Health Check Endpoint ─────────────────────────────────────────────
// Routerlardan OLDIN turishi shart: baza uzilganda ham javob berishi kerak,
// aks holda monitoring "server o'lgan" deb xato xulosa qiladi.
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '3.0.0',
    timestamp: new Date().toISOString(),
    ai: isGeminiConfigured() ? `${aiManager.providerName().toLowerCase()}-configured` : 'not_configured',
    db: isDBConnected() ? 'ok' : 'missing'
  });
});

// ── Mount Routers ─────────────────────────────────────────────────────
// Bazaga bog'liq routerlar o'z ichida requireDB ni chaqiradi (routes/*.js),
// shuning uchun bu yerda faqat mount qilinadi. Eksport bazaga bog'liq emas.
app.use('/api/auth', apiLimiter, authRouter);
app.use('/api', tendersRouter);
app.use('/api', lotsRouter);
app.use('/api', learnRouter);
app.use('/api', aiRouter);
app.use('/api', exportRouter);
app.use('/api/admin', adminRouter);
app.use('/api/billing', billingRouter);

// ── Error Handlers ──────────────────────────────────────────────────
// 404 Handler
app.use((req, res) => {
  res.status(404).json({ error: 'Sahifa topilmadi', path: req.path });
});

// Global Error Handler
// Productionda ichki xato matni (baza tuzilishi, fayl yo'llari) tashqariga
// chiqmasligi kerak — faqat 4xx "mijoz xatosi" xabarlari ko'rsatiladi.
app.use((err, req, res, next) => {
  logger.error('Server Error', err);
  const status = err.status || 500;
  const isClientError = status >= 400 && status < 500;
  const safeMessage = (!isProd || isClientError)
    ? (err.message || 'Server xatosi')
    : 'Server xatosi. Birozdan keyin qaytadan urinib ko\'ring.';

  res.status(status).json({
    error: safeMessage,
    ...(!isProd && { stack: err.stack })
  });
});

// ── Startup Config Validation ─────────────────────────────────────────
function validateStartupConfig() {
  const warnings = [];
  const errors = [];

  // Check if AI is configured
  if (!isGeminiConfigured()) {
    warnings.push('GEMINI_API_KEY / GROQ_API_KEY / OPENAI_API_KEY sozlanmagan — AI funksiyalar ishlamaydi');
  }

  // JWT Secret safety check
  const UNSAFE_JWT_SECRETS = [
    'tendermind-super-secret-key-change-in-production',
    'tendermind-dev-only-unsafe-secret',
    'secret',
    'password',
    'jwt_secret',
  ];
  const currentSecret = process.env.JWT_SECRET || '';
  if (UNSAFE_JWT_SECRETS.includes(currentSecret)) {
    if (isProd) {
      errors.push('JWT_SECRET xavfli default qiymatda — JUDA XAVFLI! Render dashboard da o\'zgartiring.');
    } else {
      warnings.push('JWT_SECRET standart qiymatda — productiondan oldin o\'zgartiring');
    }
  }

  // NODE_ENV check
  if (!process.env.NODE_ENV) {
    warnings.push('NODE_ENV o\'rnatilmagan — development deb qabul qilinadi');
  }

  warnings.forEach(w => logger.warn(w));
  errors.forEach(e => logger.error(e));

  if (errors.length > 0) {
    logger.error('Kritik konfiguratsiya xatolari. Server to\'xtatildi.');
    process.exit(1);
  }
}

// ── Start Server ──────────────────────────────────────────────────────
async function startServer() {
  validateStartupConfig();
  const connection = await connectDB();
  if (connection) {
    try {
      await tenderRepository.ensureSeeded();
      // Lotsiz eski tenderlar uchun bittadan lot yaratiladi (migratsiya).
      const createdLots = await lotRepository.backfillFromTenders();
      if (createdLots > 0) logger.info(`${createdLots} ta tender uchun lot yaratildi`);

      // Muddati o'tgan obunalarni yopish (server har ko'tarilganda)
      const expired = await billing.expireOutdatedSubscriptions();
      if (expired > 0) logger.info(`${expired} ta obuna muddati tugadi va yopildi`);
    } catch (err) {
      logger.error('Tender seed error', err);
    }
  }

  const server = app.listen(PORT, config.host, async () => {
    logger.info(`TenderMind Server — http://localhost:${PORT}`);
    logger.info(`AI: ${isGeminiConfigured() ? `✅ ${aiManager.providerName()} ulandi` : '❌ AI API key kiriting'}`);
    logger.info(`Mode: ${process.env.NODE_ENV || 'development'}`);
    logger.info(`MongoDB: ${isDBConnected() ? '✅ ulandi' : '❌ ulanmagan'}`);
    if (isDBConnected()) logger.info(`Tenderlar: ${await tenderRepository.count()} ta ma'lumot bazada`);
  });

  return server;
}

if (require.main === module) {
  startServer().catch(err => {
    logger.error('Startup error', err);
    process.exit(1);
  });
}

module.exports = { app, startServer };

// ── Oxirgi himoya chizig'i ────────────────────────────────────────────
// Controllerlar asyncHandler bilan o'ralgan, ammo e'tibordan chetda qolgan
// promise bo'lsa — server jimgina o'lib qolmasin, log qoldirsin.
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', reason);
});
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception — server to\'xtatilmoqda', err);
  process.exit(1);
});

// Graceful Shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal — server yopilmoqda...');
  process.exit(0);
});
process.on('SIGINT', () => {
  logger.info('SIGINT signal — server yopilmoqda...');
  process.exit(0);
});
