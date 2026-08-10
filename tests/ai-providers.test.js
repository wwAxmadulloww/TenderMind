'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { GroqProvider, OpenAIProvider, GeminiProvider } = require('../services/ai/providers');

test('Gemini — faqat AIza bilan boshlanuvchi kalitni qabul qiladi', () => {
  assert.ok(new GeminiProvider('AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ12345').isConfigured());
  // Ilgari "AQ." bilan boshlanuvchi kalit ham "sozlangan" deb hisoblanardi
  // va xato faqat birinchi real so'rovda ma'lum bo'lardi:
  assert.ok(!new GeminiProvider('AQ.XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX').isConfigured());
});

test('OpenAI — sk- prefiksi talab qilinadi', () => {
  assert.ok(new OpenAIProvider('sk-proj-abcdefghijklmnopqrstuvwxyz').isConfigured());
  assert.ok(!new OpenAIProvider('AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ').isConfigured());
});

test('Groq — gsk_ prefiksi talab qilinadi', () => {
  assert.ok(new GroqProvider('gsk_abcdefghijklmnopqrstuvwxyz123').isConfigured());
  assert.ok(!new GroqProvider('sk-abcdefghijklmnopqrstuvwxyz123').isConfigured());
});

test('Bo\'sh yoki qisqa kalit — sozlanmagan', () => {
  for (const Provider of [GroqProvider, OpenAIProvider, GeminiProvider]) {
    assert.ok(!new Provider('').isConfigured());
    assert.ok(!new Provider(undefined).isConfigured());
    assert.ok(!new Provider('sk-qisqa').isConfigured());
  }
});
