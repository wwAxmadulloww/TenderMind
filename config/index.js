'use strict';

require('dotenv').config();

const env = process.env.NODE_ENV || 'development';
const isProd = env === 'production';
const port = Number(process.env.PORT) || 3002;

const splitCsv = (value) => String(value || '')
  .split(',')
  .map(item => item.trim())
  .filter(Boolean);

const config = {
  env,
  isProd,
  port,
  // Productionda (Render/Docker) konteyner tashqarisidan ko'rinishi uchun
  // 0.0.0.0 ga bind qilish shart; lokalda 127.0.0.1 xavfsizroq.
  host: process.env.HOST || (isProd ? '0.0.0.0' : '127.0.0.1'),
  jwtSecret: String(process.env.JWT_SECRET || '').trim(),
  mongodbUri: String(process.env.MONGODB_URI || '').trim(),
  frontendUrl: String(process.env.FRONTEND_URL || '').trim(),
  corsOrigins: splitCsv(process.env.CORS_ORIGINS || process.env.FRONTEND_URL),
  logLevel: process.env.LOG_LEVEL || 'info',
  // Cheklovlar. Test muhitida yuqori — barcha testlar bitta IP dan
  // keladi va haqiqiy qiymatlar bilan ular bir-birini bloklaydi.
  // Limitlarning o'zi tests/rate-limit.test.js da tekshiriladi.
  rateLimits: env === 'test'
    ? { register: 1000, login: 1000, smsCode: 1000, auth: 5000 }
    : { register: 5, login: 10, smsCode: 5, auth: 60 },
  sms: {
    eskizEmail: String(process.env.ESKIZ_EMAIL || '').trim(),
    eskizPassword: String(process.env.ESKIZ_PASSWORD || '').trim(),
    playMobileLogin: String(process.env.PLAYMOBILE_LOGIN || '').trim(),
    playMobilePassword: String(process.env.PLAYMOBILE_PASSWORD || '').trim(),
    // Development da SMS o'rniga konsolga yozish
    useConsole: process.env.SMS_CONSOLE === 'true',
  },
  ai: {
    groqApiKey: String(process.env.GROQ_API_KEY || '').trim(),
    openAIApiKey: String(process.env.OPENAI_API_KEY || '').trim(),
    geminiApiKey: String(process.env.GEMINI_API_KEY || '').trim(),
  },
};

if (!config.jwtSecret && !isProd) {
  config.jwtSecret = 'tendermind-dev-only-unsafe-secret';
}

module.exports = config;
