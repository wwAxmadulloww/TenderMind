'use strict';

const jwt = require('jsonwebtoken');
const config = require('../config');

function extractToken(req) {
  const authHeader = req.headers.authorization || '';
  const [scheme, token] = authHeader.split(' ');
  if (scheme === 'Bearer' && token) return token;
  if (req.cookies && req.cookies.tm_token) return req.cookies.tm_token;
  return '';
}

function authMiddleware(req, res, next) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: 'Token talab qilinadi' });
  try {
    req.user = jwt.verify(token, config.jwtSecret, {
      algorithms: ['HS256'],
    });
    return next();
  } catch {
    return res.status(401).json({ error: 'Yaroqsiz token' });
  }
}

module.exports = { authMiddleware, extractToken };
