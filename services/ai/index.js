'use strict';

const config = require('../../config');
const logger = require('../../logger');
const { GroqProvider, OpenAIProvider, GeminiProvider } = require('./providers');

class AIManager {
  constructor() {
    this.providers = [
      new GroqProvider(config.ai.groqApiKey),
      new OpenAIProvider(config.ai.openAIApiKey),
      new GeminiProvider(config.ai.geminiApiKey),
    ];
  }

  get availableProvider() {
    return this.providers.find(provider => provider.isConfigured());
  }

  isConfigured() {
    return Boolean(this.availableProvider);
  }

  providerName() {
    return this.availableProvider?.name || 'none';
  }

  async generate(prompt, systemInstruction, options) {
    const errors = [];
    for (const provider of this.providers) {
      if (!provider.isConfigured()) continue;
      try {
        return await provider.generate(prompt, systemInstruction, options);
      } catch (err) {
        errors.push(`${provider.name}: ${err.message}`);
        logger.warn(`AI provider failed: ${provider.name}`, err.message);
      }
    }
    throw new Error(errors.length ? errors.join('; ') : 'AI provider sozlanmagan');
  }

  async chat(systemInstruction, history, userMessage) {
    const errors = [];
    for (const provider of this.providers) {
      if (!provider.isConfigured()) continue;
      try {
        return await provider.chat(systemInstruction, history, userMessage);
      } catch (err) {
        errors.push(`${provider.name}: ${err.message}`);
        logger.warn(`AI chat provider failed: ${provider.name}`, err.message);
      }
    }
    throw new Error(errors.length ? errors.join('; ') : 'AI provider sozlanmagan');
  }
}

module.exports = new AIManager();
