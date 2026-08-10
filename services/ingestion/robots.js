'use strict';

const { politeFetch, USER_AGENT } = require('./http');
const logger = require('../../logger');

/**
 * robots.txt tekshiruvi.
 *
 * Sayt egasi qaysi yo'llarni yig'ishni taqiqlaganini hurmat qilamiz.
 * robots.txt olinmasa — EHTIYOTKORLIK tomon qaraymiz emas: standart
 * bo'yicha fayl yo'qligi "ruxsat" degani, lekin xato (5xx) bo'lsa
 * taqiq deb hisoblanadi.
 */

const cache = new Map();   // origin → { rules, fetchedAt }
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

function parseRobots(text) {
  const groups = [];
  let current = null;

  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;

    const [rawKey, ...rest] = line.split(':');
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(':').trim();

    if (key === 'user-agent') {
      // Ketma-ket kelgan User-agent qatorlari bitta guruhga tegishli
      if (!current || current.hasRules) {
        current = { agents: [], allow: [], disallow: [], hasRules: false };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
    } else if (current && (key === 'allow' || key === 'disallow')) {
      current.hasRules = true;
      if (value) current[key].push(value);
    }
  }

  return groups;
}

function selectGroup(groups, userAgent) {
  const ua = userAgent.toLowerCase();
  const specific = groups.find(g => g.agents.some(a => a !== '*' && ua.includes(a)));
  return specific || groups.find(g => g.agents.includes('*')) || null;
}

function pathMatches(pattern, pathname) {
  // robots.txt shabloni: `*` — istalgan ketma-ketlik, `$` — oxiri
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  const anchored = escaped.endsWith('\\$')
    ? `^${escaped.slice(0, -2)}$`
    : `^${escaped}`;
  return new RegExp(anchored).test(pathname);
}

/** Eng uzun mos keluvchi qoida g'olib (standart talabi) */
function isAllowedByRules(group, pathname) {
  if (!group) return true;

  const longest = (patterns) => patterns
    .filter(p => pathMatches(p, pathname))
    .reduce((max, p) => Math.max(max, p.length), -1);

  const allowLen = longest(group.allow);
  const disallowLen = longest(group.disallow);

  if (disallowLen === -1) return true;
  return allowLen >= disallowLen;
}

async function fetchRules(origin) {
  const cached = cache.get(origin);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.rules;

  let rules = [];
  try {
    const response = await politeFetch(`${origin}/robots.txt`, { retries: 1 });
    if (response.status === 404 || response.status === 410) {
      rules = [];                       // fayl yo'q — ruxsat
    } else if (!response.ok) {
      rules = null;                     // xato — taqiq deb hisoblaymiz
    } else {
      rules = parseRobots(await response.text());
    }
  } catch (err) {
    logger.warn(`robots.txt olinmadi (${origin}): ${err.message}`);
    rules = null;
  }

  cache.set(origin, { rules, fetchedAt: Date.now() });
  return rules;
}

/**
 * Shu URL ni yig'ishga ruxsat bormi?
 * @returns {Promise<{allowed: boolean, reason: string}>}
 */
async function isAllowed(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { allowed: false, reason: 'URL noto\'g\'ri' };
  }

  const rules = await fetchRules(parsed.origin);

  if (rules === null) {
    return { allowed: false, reason: 'robots.txt o\'qib bo\'lmadi — ehtiyot yuzasidan to\'xtatildi' };
  }
  if (rules.length === 0) {
    return { allowed: true, reason: 'robots.txt yo\'q — cheklov belgilanmagan' };
  }

  const group = selectGroup(rules, USER_AGENT);
  const allowed = isAllowedByRules(group, parsed.pathname);

  return {
    allowed,
    reason: allowed ? 'robots.txt ruxsat beradi' : `robots.txt bu yo'lni taqiqlaydi: ${parsed.pathname}`,
  };
}

module.exports = { isAllowed, parseRobots, isAllowedByRules, selectGroup, pathMatches };
