'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { isAllowed, isLocalOrigin } = require('../config/cors');

const req = (host) => ({ headers: { host } });

test('Ilovaning o\'z domeni har doim ruxsat etiladi', () => {
  // FRONTEND_URL sozlanmagan bo'lsa ham deploy buzilmasligi kerak
  assert.ok(isAllowed('https://tendermind-yangi.onrender.com', req('tendermind-yangi.onrender.com')));
  assert.ok(isAllowed('http://localhost:9999', req('localhost:9999')));
});

test('Origin bo\'lmasa — ruxsat (same-origin, curl, mobil ilova)', () => {
  assert.ok(isAllowed(undefined, req('localhost:3002')));
  assert.ok(isAllowed('', req('localhost:3002')));
});

test('Development da istalgan localhost porti ruxsat etiladi', () => {
  // Ilgari ro'yxat qat'iy edi (3000/3001/4020) va 3002 da server
  // o'z frontendini bloklardi
  assert.ok(isLocalOrigin('http://localhost:3002'));
  assert.ok(isLocalOrigin('http://127.0.0.1:5173'));
  assert.ok(isLocalOrigin('http://localhost:8080'));
  assert.ok(!isLocalOrigin('http://evil.com'));
  assert.ok(!isLocalOrigin('javascript:alert(1)'));
  assert.ok(!isLocalOrigin('not-a-url'));
});

test('Begona domen — rad etiladi', () => {
  assert.ok(!isAllowed('https://evil.example.com', req('tendermind.uz')));
});
