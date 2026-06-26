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
  plan: { type: String, enum: ['free', 'pro', 'corporate'], default: 'free' },
  planExpiresAt: { type: Date, default: null },
  savedTenders: { type: [String], default: [] },
  wonTenders:   { type: [String], default: [] },
  // Kunlik limit tracking
  aiDocUsedToday: { type: Number, default: 0 },
  aiDocResetDate: { type: String, default: '' }, // YYYY-MM-DD
  aiChatUsedToday: { type: Number, default: 0 },
  aiChatResetDate: { type: String, default: '' },
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

// Bugungi AI doc limit
UserSchema.methods.canUseAIDoc = function () {
  const today = new Date().toISOString().slice(0, 10);
  if (this.aiDocResetDate !== today) return true; // yangi kun — reset
  const limits = this.getPlanLimits();
  return this.aiDocUsedToday < limits.docPerDay;
};

// AI doc ishlatildi
UserSchema.methods.incrementAIDoc = async function () {
  const today = new Date().toISOString().slice(0, 10);
  if (this.aiDocResetDate !== today) {
    this.aiDocUsedToday = 1;
    this.aiDocResetDate = today;
  } else {
    this.aiDocUsedToday += 1;
  }
  await this.save();
};

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
  probability: { type: Number, default: 50 },
  competitors: { type: Number, default: 5 },
  deadline: { type: String, required: true },
  postedDate: { type: String, default: () => new Date().toISOString().slice(0, 10) },
  tags: { type: [String], default: [] },
  org: { type: String, required: true },
  description: { type: String, default: '' },
  requirements: { type: [String], default: [] },
  contactEmail: { type: String, default: '' },
  contactPhone: { type: String, default: '' },
  // xarid.uz integratsiya uchun
  sourceUrl: { type: String, default: '' },
  sourceId: { type: String, default: '' },
  isVerified: { type: Boolean, default: false },
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

TenderSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

const Tender = mongoose.models.Tender || mongoose.model('Tender', TenderSchema);

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

module.exports = { connectDB, isDBConnected, User, Tender, Subscription, mongoose };
