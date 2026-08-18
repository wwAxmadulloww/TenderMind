/* ═══════════════════════════════════════════════════════
   TENDERMIND — db.js  v3.0
   MongoDB modellari: User, Tender, Subscription
   ═══════════════════════════════════════════════════════ */
'use strict';

const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI;
let connectionPromise = null;

// ── USER MODEL ────────────────────────────────────────────
const UserSchema = new mongoose.Schema({
  id: { type: String, default: uuidv4, unique: true, index: true },
  name: { type: String, required: true },
  phone: { type: String, required: true, unique: true, index: true },
  company: { type: String, default: '' },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  // Token avlodi. Chiqish yoki parol o'zgarganda oshiriladi — shu paytgacha
  // berilgan barcha tokenlar darhol kuchsizlanadi. Busiz "Chiqish" faqat
  // brauzerdagi nusxani o'chirardi, o'g'irlangan token 30 kun ishlayverardi.
  tokenVersion: { type: Number, default: 0 },

  // Telefon tasdiqlash va parolni tiklash. Kod ochiq saqlanmaydi —
  // faqat hash, muddat va urinishlar soni.
  phoneVerified: { type: Boolean, default: false },
  verification: {
    codeHash: { type: String, default: '' },
    purpose: { type: String, enum: ['phone', 'reset', ''], default: '' },
    expiresAt: { type: Date, default: null },
    attempts: { type: Number, default: 0 },
    lastSentAt: { type: Date, default: null },
  },
  plan: { type: String, enum: ['free', 'pro', 'corporate'], default: 'free' },
  planExpiresAt: { type: Date, default: null },
  savedTenders: { type: [String], default: [] },
  wonTenders:   { type: [String], default: [] },
  // Kunlik limit tracking
  aiDocUsedToday: { type: Number, default: 0 },
  aiDocResetDate: { type: String, default: '' }, // YYYY-MM-DD
  aiChatUsedToday: { type: Number, default: 0 },
  aiChatResetDate: { type: String, default: '' },
  // Telegram orqali xabarnoma
  telegram: {
    chatId: { type: String, default: '', index: true },
    username: { type: String, default: '' },
    linkCode: { type: String, default: '', index: true },   // hisobni bog'lash kodi
    linkedAt: { type: Date, default: null },
    notifyEnabled: { type: Boolean, default: true },
    filters: {
      soha: { type: String, default: 'all' },
      hudud: { type: String, default: 'all' },
      minBudget: { type: Number, default: 0 },
    },
    lastNotifiedAt: { type: Date, default: null },
  },
  // "Birinchi tenderingiz" yo'riqnomasi bo'yicha progress
  onboarding: {
    completedSteps: { type: [String], default: [] },
    finishedAt: { type: Date, default: null },
    skipped: { type: Boolean, default: false },
  },
  createdAt: { type: Date, default: Date.now },
  lastLoginAt: { type: Date, default: null }
});

// Plan limitlari
UserSchema.methods.getPlanLimits = function () {
  const limits = {
    free:      { docPerDay: 1,  chatPerDay: 10,  searches: 3,  compare: false, strategy: false },
    pro:       { docPerDay: 99, chatPerDay: 100, searches: 999, compare: true,  strategy: true  },
    corporate: { docPerDay: 99, chatPerDay: 200, searches: 999, compare: true,  strategy: true  },
  };
  return limits[this.plan] || limits.free;
};

// Plan faolmi?
UserSchema.methods.isPlanActive = function () {
  if (this.plan === 'free') return true;
  if (!this.planExpiresAt) return false;
  return new Date() < new Date(this.planExpiresAt);
};

// Kunlik limit maydonlari: 'doc' va 'chat' uchun
const QUOTA_FIELDS = {
  doc:  { used: 'aiDocUsedToday',  reset: 'aiDocResetDate',  limit: 'docPerDay'  },
  chat: { used: 'aiChatUsedToday', reset: 'aiChatResetDate', limit: 'chatPerDay' },
};

const today = () => new Date().toISOString().slice(0, 10);

// Bugun shu turdagi amaldan nechtasi ishlatilgan
UserSchema.methods.quotaUsed = function (kind) {
  const f = QUOTA_FIELDS[kind];
  if (!f) return 0;
  return this[f.reset] === today() ? this[f.used] : 0;   // yangi kun — reset
};

// Limit yetarlimi?
UserSchema.methods.canUse = function (kind) {
  const f = QUOTA_FIELDS[kind];
  if (!f) return true;
  // Pullik tarif muddati tugagan bo'lsa — free limitlari qo'llanadi
  const limits = this.isPlanActive()
    ? this.getPlanLimits()
    : { docPerDay: 1, chatPerDay: 10 };
  return this.quotaUsed(kind) < limits[f.limit];
};

// Limitdan bittasini sarflash
UserSchema.methods.consumeQuota = async function (kind) {
  const f = QUOTA_FIELDS[kind];
  if (!f) return;
  if (this[f.reset] !== today()) {
    this[f.used] = 1;
    this[f.reset] = today();
  } else {
    this[f.used] += 1;
  }
  await this.save();
};

// Eski nomlar — mavjud kod buzilmasligi uchun
UserSchema.methods.canUseAIDoc = function () { return this.canUse('doc'); };
UserSchema.methods.incrementAIDoc = function () { return this.consumeQuota('doc'); };

const User = mongoose.models.User || mongoose.model('User', UserSchema);

// ── TENDER MODEL (MongoDB) ────────────────────────────────
const TenderSchema = new mongoose.Schema({
  id: { type: String, default: uuidv4, unique: true, index: true },
  soha: { type: String, required: true, index: true },
  hudud: { type: String, required: true, index: true },
  status: { type: String, enum: ['active', 'urgent', 'closed', 'canceled'], default: 'active' },
  isFresh: { type: Boolean, default: false },
  title: { type: String, required: true },
  budget: { type: String, required: true },
  budgetRaw: { type: Number, required: true },
  // Bu ikkalasi HISOBLANGAN emas — faqat manba ularni bersa to'ldiriladi.
  // Demo yozuvlarda qo'lda kiritilgan, haqiqiy e'lonlarda odatda null.
  // null bo'lsa interfeys ularni umuman ko'rsatmaydi (soxta raqam chiqmaydi).
  probability: { type: Number, default: null },
  competitors: { type: Number, default: null },
  deadline: { type: String, required: true },
  postedDate: { type: String, default: () => new Date().toISOString().slice(0, 10) },
  tags: { type: [String], default: [] },
  org: { type: String, required: true },
  description: { type: String, default: '' },
  requirements: { type: [String], default: [] },
  contactEmail: { type: String, default: '' },
  contactPhone: { type: String, default: '' },
  // Tashqi manba (ingestion) uchun
  sourceUrl: { type: String, default: '' },
  sourceId: { type: String, default: '', index: true },
  sourceName: { type: String, default: '' },      // masalan: 'xarid.uz'
  contentHash: { type: String, default: '', index: true },  // o'zgarishni aniqlash uchun
  isVerified: { type: Boolean, default: false },
  // isDemo — namunaviy (o'qitish uchun) yozuv. Haqiqiy e'lon EMAS.
  // Foydalanuvchi buni interfeysda aniq ko'rishi shart.
  isDemo: { type: Boolean, default: false, index: true },
  lotCount: { type: Number, default: 0 },
  // Admin
  createdBy: { type: String, default: 'admin' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, {
  toJSON: {
    virtuals: true,
    transform(_doc, ret) {
      ret.isNew = Boolean(ret.isFresh);
      delete ret._id;
      delete ret.__v;
      return ret;
    }
  },
  toObject: {
    virtuals: true,
    transform(_doc, ret) {
      ret.isNew = Boolean(ret.isFresh);
      delete ret._id;
      delete ret.__v;
      return ret;
    }
  }
});

// Full-text search indeksi
TenderSchema.index({ title: 'text', description: 'text', org: 'text' });
TenderSchema.index({ status: 1, soha: 1, hudud: 1 });
TenderSchema.index({ deadline: 1 });

// Mongoose 9 da middleware ga `next` callback uzatilmaydi — hook sinxron
// bo'lishi yoki promise qaytarishi kerak. Eski `function (next) { next(); }`
// ko'rinishi "next is not a function" xatosini beradi va SAQLASHNI buzadi.
TenderSchema.pre('save', function () {
  this.updatedAt = new Date();
});

const Tender = mongoose.models.Tender || mongoose.model('Tender', TenderSchema);

// ── LOT MODEL ─────────────────────────────────────────────
// Bitta tender ichida bir nechta lot bo'lishi mumkin — real xarid
// e'lonlarida ishtirokchi aynan LOT ga taklif beradi, tenderga emas.
const LotSchema = new mongoose.Schema({
  id: { type: String, default: uuidv4, unique: true, index: true },
  tenderId: { type: String, required: true, index: true },

  lotNumber: { type: Number, required: true },
  title: { type: String, required: true },
  description: { type: String, default: '' },

  // Nima va qancha sotib olinmoqda
  quantity: { type: Number, default: null },
  unit: { type: String, default: '' },              // dona, kg, m², xizmat
  startPrice: { type: Number, required: true },     // boshlang'ich narx, so'm
  currency: { type: String, default: 'UZS' },

  // Shartlar
  deliveryTerm: { type: String, default: '' },
  deliveryAddress: { type: String, default: '' },
  requirements: { type: [String], default: [] },
  deadline: { type: String, required: true },

  status: { type: String, enum: ['active', 'urgent', 'closed', 'canceled'], default: 'active' },

  // Tashqi manba
  sourceUrl: { type: String, default: '' },
  sourceId: { type: String, default: '', index: true },
  isDemo: { type: Boolean, default: false },

  // ── ODDIY TILDA TUSHUNTIRISH ───────────────────────────
  // AI bir marta yaratadi va shu yerda saqlanadi. Har ko'rishda qayta
  // generatsiya qilinmaydi — aks holda har bir sahifa ochilishi pul turadi.
  explanation: {
    nima: { type: String, default: '' },          // nima sotib olinmoqda
    kim: { type: String, default: '' },           // kim qatnasha oladi
    hujjatlar: { type: [String], default: [] },   // qanday hujjat kerak
    pul: { type: String, default: '' },           // qancha pul, qanday to'lanadi
    muddat: { type: String, default: '' },        // qachongacha
    xulosa: { type: String, default: '' },        // 2-3 jumlalik umumiy xulosa
    generatedAt: { type: Date, default: null },
    model: { type: String, default: '' },
  },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, {
  toJSON: { virtuals: true, transform: stripInternals },
  toObject: { virtuals: true, transform: stripInternals },
});

function stripInternals(_doc, ret) {
  delete ret._id;
  delete ret.__v;
  return ret;
}

LotSchema.index({ tenderId: 1, lotNumber: 1 });
LotSchema.index({ status: 1, deadline: 1 });
LotSchema.index({ title: 'text', description: 'text' });

// Tushuntirish tayyor va yangimi? (30 kundan eski bo'lsa qayta yaratiladi)
LotSchema.methods.hasExplanation = function () {
  const generatedAt = this.explanation && this.explanation.generatedAt;
  if (!generatedAt) return false;
  const ageInDays = (Date.now() - new Date(generatedAt).getTime()) / 86400000;
  return ageInDays < 30 && Boolean(this.explanation.xulosa);
};

LotSchema.pre('save', function () {
  this.updatedAt = new Date();
});

const Lot = mongoose.models.Lot || mongoose.model('Lot', LotSchema);

// ── SUBSCRIPTION MODEL ────────────────────────────────────
const SubscriptionSchema = new mongoose.Schema({
  id: { type: String, default: uuidv4, unique: true },
  userId: { type: String, required: true, index: true },
  plan: { type: String, enum: ['pro', 'corporate'], required: true },
  status: { type: String, enum: ['active', 'canceled', 'expired', 'pending'], default: 'pending' },
  // To'lov
  paymentMethod: { type: String, enum: ['payme', 'click', 'transfer', 'manual'], default: 'manual' },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'UZS' },
  transactionId: { type: String, default: '' },
  // Muddatlar
  startDate: { type: Date, default: Date.now },
  endDate: { type: Date, required: true },
  // Invoice
  invoiceNumber: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

const Subscription = mongoose.models.Subscription || mongoose.model('Subscription', SubscriptionSchema);

// ── CONNECTION ────────────────────────────────────────────
const connectDB = async (options = {}) => {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  if (connectionPromise) return connectionPromise;

  const uri = options.uri || MONGODB_URI;
  if (!uri) {
    const error = new Error('MONGODB_URI sozlanmagan');
    if (options.required) throw error;
    console.error('❌ MongoDB URI topilmadi:', error.message);
    return null;
  }

  connectionPromise = (async () => {
    await mongoose.connect(uri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 10000,
      ...options.mongooseOptions,
    });
    console.log('✅ MongoDB ga muvaffaqiyatli ulandi');
    return mongoose.connection;
  })();

  try {
    return await connectionPromise;
  } catch (error) {
    connectionPromise = null;
    console.error('❌ MongoDB ga ulanishda xato:', error.message);
    if (options.required) throw error;
    return null;
  }
};

const isDBConnected = () => mongoose.connection.readyState === 1;

module.exports = { connectDB, isDBConnected, User, Tender, Lot, Subscription, mongoose };
