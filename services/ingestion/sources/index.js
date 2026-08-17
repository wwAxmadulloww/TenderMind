'use strict';

const fileSource = require('./file');
const httpJsonSource = require('./httpJson');

/**
 * Manbalar reyestri.
 *
 * Yangi portal qo'shish uchun `fetch(options) => Promise<Array>` qaytaruvchi
 * modul yozib, shu ro'yxatga qo'shing. Qolgan hammasi — normalizatsiya,
 * dedupe, saqlash — o'zgarishsiz ishlaydi.
 */
const registry = new Map([
  [fileSource.name, fileSource],
  [httpJsonSource.name, httpJsonSource],
]);

module.exports = {
  get: (name) => registry.get(name),
  list: () => [...registry.keys()],
  all: () => [...registry.values()],
  register: (source) => registry.set(source.name, source),
};
