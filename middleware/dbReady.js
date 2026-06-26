'use strict';

const { isDBConnected } = require('../db');

function requireDB(req, res, next) {
  if (isDBConnected()) return next();
  return res.status(503).json({ error: 'Ma\'lumotlar bazasi vaqtincha mavjud emas' });
}

module.exports = requireDB;
