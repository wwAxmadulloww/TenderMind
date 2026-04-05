/* ═══════════════════════════════════════════
   TENDERMIND — Input Validators
   ═══════════════════════════════════════════ */

'use strict';

// ── Validation Rules ─────────────────────────────────────────────────
const validators = {
  // Phone validation (Uzbek +998 format)
  phone: (val) => /^\+998\d{9,12}$/.test(val),
  
  // Email validation
  email: (val) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val),
  
  // Password (min 6 chars, no spaces)
  password: (val) => val && val.length >= 6 && !/\s/.test(val),
  
  // Company name (2-100 chars; O'zbek/apostrof va oddiy belgilar)
  company: (val) => /^[a-zA-Z0-9\u0400-\u04FF\s\-\/.'ʼʻ`]{2,100}$/.test(val),
  
  // Person name (2-50 chars; O'zbekiston, O‘zbekiston va h.k.)
  name: (val) => /^[a-zA-Z0-9\u0400-\u04FF\s\-.'ʼʻ`]{2,50}$/.test(val),
  
  // INN (12 digits for Uzbekistan)
  inn: (val) => /^\d{12}$/.test(val),
  
  // Narx validatsiyasi (max 100 trillion so'm) — QO'SHIMCHA #10
  price: (val) => {
    const n = Number(val);
    return !isNaN(n) && n > 0 && n <= 100_000_000_000_000;
  },
  
  // URL slug
  slug: (val) => /^[a-z0-9\-]{3,50}$/.test(val),
  
  // Text (1-5000 chars, no HTML)
  text: (val) => typeof val === 'string' && val.length >= 1 && val.length <= 5000 && !/<[^>]*>/g.test(val),

  // QO'SHIMCHA #10: Kuchli parol tekshiruvi (kamida 8 belgi, raqam yoki maxsus belgi bilan)
  strongPassword: (val) => {
    if (!val || val.length < 8) return false;
    if (/\s/.test(val)) return false;
    // Kamida bitta raqam yoki maxsus belgi
    return /[0-9!@#$%^&*]/.test(val);
  },

  // QO'SHIMCHA #10: Tender ID formati tekshiruvi
  tenderId: (val) => /^[a-z0-9\-]{2,20}$/.test(val),
};

// ── Sanitizers ─────────────────────────────────────────────────────
const sanitizers = {
  // Remove HTML tags and trim
  text: (val) => typeof val === 'string' ? val.replace(/<[^>]*>/g, '').trim() : '',
  
  // Trim and lowercase email
  email: (val) => (typeof val === 'string' ? val.toLowerCase().trim() : ''),
  
  // Trim phone
  phone: (val) => (typeof val === 'string' ? val.trim() : ''),
  
  // Remove extra whitespace
  name: (val) => (typeof val === 'string' ? val.replace(/\s+/g, ' ').trim() : ''),
  
  // Trim company name
  company: (val) => (typeof val === 'string' ? val.trim() : ''),
};

// ── Main Validation Function ─────────────────────────────────────────
function validate(data, rules) {
  const errors = {};
  
  for (const [field, rule] of Object.entries(rules)) {
    const value = data[field];
    
    // Check required
    if (rule.required && (!value || (typeof value === 'string' && !value.trim()))) {
      errors[field] = `${field} talab qilinadi`;
      continue;
    }
    
    // Skip if not required and empty
    if (!rule.required && (!value || (typeof value === 'string' && !value.trim()))) {
      continue;
    }
    
    // Check format
    if (rule.format && validators[rule.format]) {
      if (!validators[rule.format](value)) {
        errors[field] = rule.errorMsg || `${field} noto'g'ri format`;
      }
    }
    
    // Check length
    if (rule.minLength && value.length < rule.minLength) {
      errors[field] = `${field} kamida ${rule.minLength} belgida bo'lishi kerak`;
    }
    if (rule.maxLength && value.length > rule.maxLength) {
      errors[field] = `${field} ko'pi bilan ${rule.maxLength} belgida bo'lishi kerak`;
    }
    
    // Check custom validator
    if (rule.custom && !rule.custom(value)) {
      errors[field] = rule.errorMsg || `${field} yaroqsiz`;
    }
  }
  
  return Object.keys(errors).length > 0 ? errors : null;
}

// ── Sanitize Data ────────────────────────────────────────────────────
function sanitize(data, schema) {
  const src = data && typeof data === 'object' ? data : {};
  const sanitized = { ...src };

  for (const [field, sanitizer] of Object.entries(schema)) {
    if (Object.prototype.hasOwnProperty.call(src, field) && sanitizers[sanitizer]) {
      sanitized[field] = sanitizers[sanitizer](src[field]);
    }
  }

  return sanitized;
}

// ── Express Middleware Factories ─────────────────────────────────────
function validateBody(rules) {
  return (req, res, next) => {
    const errors = validate(req.body, rules);
    if (errors) {
      return res.status(400).json({ errors, error: 'Kiritilgan ma\'lumotlar noto\'g\'ri' });
    }
    next();
  };
}

function sanitizeBody(schema) {
  return (req, res, next) => {
    req.body = sanitize(req.body, schema);
    next();
  };
}

// ── Uzbekistan phone: +998 + 9–12 raqam ───────────────────────────────
function normalizeUzbekPhone(input) {
  if (input == null || typeof input !== 'string') return '';
  const compact = input.replace(/\s/g, '');
  if (/^\+998\d{9,12}$/.test(compact)) return compact;
  const digits = input.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('998')) return `+${digits}`;
  if (digits.length === 9 && digits.startsWith('9')) return `+998${digits}`;
  return compact.trim();
}

// ── Export ───────────────────────────────────────────────────────────
module.exports = {
  validate,
  sanitize,
  validators,
  sanitizers,
  validateBody,
  sanitizeBody,
  normalizeUzbekPhone,
};
