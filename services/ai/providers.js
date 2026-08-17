'use strict';

const { GoogleGenerativeAI } = require('@google/generative-ai');
const OpenAI = require('openai').default || require('openai');
const logger = require('../../logger');

/**
 * Kalit faqat uzunligi bo'yicha emas, prefiksi bo'yicha ham tekshiriladi.
 * Aks holda noto'g'ri formatdagi kalit "ulandi" deb ko'rsatiladi va
 * xato faqat birinchi real so'rovda ma'lum bo'ladi.
 */
function keyMatches(apiKey, prefixes, providerName) {
  if (!apiKey || apiKey.length < 20) return false;
  if (prefixes.some(prefix => apiKey.startsWith(prefix))) return true;
  logger.warn(
    `${providerName} kaliti noto'g'ri formatda (kutilgan boshlanish: ${prefixes.join(' yoki ')}). ` +
    `Bu provider o'tkazib yuboriladi.`
  );
  return false;
}

class GroqProvider {
  constructor(apiKey) {
    this.name = 'Groq';
    this.apiKey = apiKey;
  }

  isConfigured() {
    return keyMatches(this.apiKey, ['gsk_'], this.name);
  }

  async generate(prompt, systemInstruction, options = {}) {
    const client = new OpenAI({
      apiKey: this.apiKey,
      baseURL: 'https://api.groq.com/openai/v1',
    });
    const messages = [];
    if (systemInstruction) messages.push({ role: 'system', content: systemInstruction });
    messages.push({ role: 'user', content: prompt });
    const response = await client.chat.completions.create({
      model: options.model || 'llama-3.3-70b-versatile',
      messages,
      max_tokens: options.maxTokens || 8000,
      temperature: options.temperature ?? 0.7,
    });
    return response.choices[0].message.content;
  }

  async chat(systemInstruction, history, userMessage) {
    const client = new OpenAI({
      apiKey: this.apiKey,
      baseURL: 'https://api.groq.com/openai/v1',
    });
    const messages = [];
    if (systemInstruction) messages.push({ role: 'system', content: systemInstruction });
    for (const h of (history || [])) {
      messages.push({ role: h.role === 'model' ? 'assistant' : 'user', content: h.parts[0].text });
    }
    messages.push({ role: 'user', content: userMessage });
    const response = await client.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages,
      max_tokens: 4000,
      temperature: 0.8,
    });
    return response.choices[0].message.content;
  }
}

class OpenAIProvider {
  constructor(apiKey) {
    this.name = 'OpenAI';
    this.apiKey = apiKey;
  }

  isConfigured() {
    return keyMatches(this.apiKey, ['sk-'], this.name);
  }

  async generate(prompt, systemInstruction, options = {}) {
    const client = new OpenAI({ apiKey: this.apiKey });
    const messages = [];
    if (systemInstruction) messages.push({ role: 'system', content: systemInstruction });
    messages.push({ role: 'user', content: prompt });
    const response = await client.chat.completions.create({
      model: options.model || 'gpt-4o-mini',
      messages,
      max_tokens: options.maxTokens || 8000,
      temperature: options.temperature ?? 0.7,
    });
    return response.choices[0].message.content;
  }

  async chat(systemInstruction, history, userMessage) {
    const messages = [];
    if (systemInstruction) messages.push({ role: 'system', content: systemInstruction });
    for (const h of (history || [])) {
      messages.push({ role: h.role === 'model' ? 'assistant' : 'user', content: h.parts[0].text });
    }
    messages.push({ role: 'user', content: userMessage });
    const client = new OpenAI({ apiKey: this.apiKey });
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      max_tokens: 4000,
      temperature: 0.8,
    });
    return response.choices[0].message.content;
  }
}

class GeminiProvider {
  constructor(apiKey) {
    this.name = 'Gemini';
    this.apiKey = apiKey;
  }

  isConfigured() {
    return keyMatches(this.apiKey, ['AIza'], this.name);
  }

  async generate(prompt, systemInstruction) {
    const genAI = new GoogleGenerativeAI(this.apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      ...(systemInstruction ? { systemInstruction } : {}),
    });
    const result = await model.generateContent(prompt);
    return result.response.text();
  }

  async chat(systemInstruction, history, userMessage) {
    const genAI = new GoogleGenerativeAI(this.apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      ...(systemInstruction ? { systemInstruction } : {}),
    });
    const chat = model.startChat({ history: history || [] });
    const result = await chat.sendMessage(userMessage);
    return result.response.text();
  }
}

module.exports = { GroqProvider, OpenAIProvider, GeminiProvider };
