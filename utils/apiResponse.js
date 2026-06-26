'use strict';

function ok(res, data = {}, message = '') {
  return res.json({ success: true, data, message, error: null });
}

function fail(res, status, message, details) {
  return res.status(status).json({ success: false, data: null, message: '', error: message, details });
}

module.exports = { ok, fail };
