/* ═══════════════════════════════════════════
   TENDERMIND — logger.js
   Simple logging utility
   ═══════════════════════════════════════════ */

'use strict';

const LOG_LEVELS = {
  DEBUG: { level: 0, label: '🔹 DEBUG', color: '\x1b[36m' },
  INFO: { level: 1, label: 'ℹ️  INFO', color: '\x1b[32m' },
  WARN: { label: '⚠️  WARN', level: 2, color: '\x1b[33m' },
  ERROR: { label: '❌ ERROR', level: 3, color: '\x1b[31m' },
};

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const currentLevel = LOG_LEVELS[LOG_LEVEL.toUpperCase()]?.level || 1;

const logger = {
  debug: (msg, data) => {
    if (0 >= currentLevel) {
      console.log(`${LOG_LEVELS.DEBUG.color}[${new Date().toISOString()}] ${LOG_LEVELS.DEBUG.label} ${msg}\x1b[0m`, data || '');
    }
  },

  info: (msg, data) => {
    if (1 >= currentLevel) {
      console.log(`${LOG_LEVELS.INFO.color}[${new Date().toISOString()}] ${LOG_LEVELS.INFO.label} ${msg}\x1b[0m`, data || '');
    }
  },

  warn: (msg, data) => {
    if (2 >= currentLevel) {
      console.warn(`${LOG_LEVELS.WARN.color}[${new Date().toISOString()}] ${LOG_LEVELS.WARN.label} ${msg}\x1b[0m`, data || '');
    }
  },

  error: (msg, err) => {
    if (3 >= currentLevel) {
      console.error(`${LOG_LEVELS.ERROR.color}[${new Date().toISOString()}] ${LOG_LEVELS.ERROR.label} ${msg}\x1b[0m`);
      if (err) console.error(err);
    }
  },
};

module.exports = logger;
