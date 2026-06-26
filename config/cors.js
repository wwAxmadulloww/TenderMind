'use strict';

const config = require('./index');
const logger = require('../logger');

const devOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:4020',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  'http://127.0.0.1:4020',
];

const prodOrigins = [
  config.frontendUrl,
  ...config.corsOrigins,
  'https://tendermind.onrender.com',
  'https://tendermind.uz',
  'https://www.tendermind.uz',
].filter(Boolean);

const allowedOrigins = config.isProd ? Array.from(new Set(prodOrigins)) : devOrigins;

function corsOptions() {
  return {
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      logger.warn(`CORS rejected origin: ${origin}`);
      return callback(new Error('CORS origin ruxsat etilmagan'));
    },
    credentials: true,
  };
}

module.exports = { corsOptions, allowedOrigins };
