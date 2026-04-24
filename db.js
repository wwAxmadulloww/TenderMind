const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI;

// Define User Schema
const UserSchema = new mongoose.Schema({
  id: {
    type: String,
    default: uuidv4,
    unique: true,
    index: true
  },
  name: { type: String, required: true },
  phone: { type: String, required: true, unique: true, index: true },
  company: { type: String, required: false, default: '' },
  passwordHash: { type: String, required: true },
  role: { type: String, default: 'user' },
  savedTenders: {
    type: [String],
    default: []
  },
  wonTenders: {
    type: [String],
    default: []
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Avoid OverwriteModelError
const User = mongoose.models.User || mongoose.model('User', UserSchema);

// Connection function
const connectDB = async () => {
  if (mongoose.connection.readyState >= 1) return;

  try {
    await mongoose.connect(MONGODB_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 10000,
    });
    console.log('✅ MongoDB ga muvaffaqiyatli ulandi');
  } catch (error) {
    console.error('❌ MongoDB ga ulanishda xato:', error.message);
    // Render cold start uchun 5 sekunddan keyin qayta urinish
    console.log('⏳ 5 sekunddan keyin qayta uriniladi...');
    setTimeout(connectDB, 5000);
  }
};

module.exports = {
  connectDB,
  User,
  mongoose
};
