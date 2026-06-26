/* ═══════════════════════════════════════════════════════════
   TENDERMIND — server.js  v2.0
   Node.js + Express + AI backend
   ═══════════════════════════════════════════════════════════ */

'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const docx = require('docx');
const PDFDocument = require('pdfkit');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const OpenAI = require('openai').default || require('openai');
const logger = require('./logger');
const { validateBody, sanitizeBody, normalizeUzbekPhone } = require('./validators');
const config = require('./config');
const { corsOptions } = require('./config/cors');
const { connectDB, isDBConnected, User, mongoose } = require('./db');
const tenderRepository = require('./repositories/tenderRepository');
const aiManager = require('./services/ai');
const { authMiddleware } = require('./middleware/auth');

const app = express();
const PORT = config.port;
const isProd = config.isProd;

let JWT_SECRET = config.jwtSecret;
if (!JWT_SECRET) {
  if (isProd) {
    logger.error('JWT_SECRET muhit o\'zgaruvchisi productionda majburiy');
    process.exit(1);
  }
  JWT_SECRET = 'tendermind-dev-only-unsafe-secret';
  logger.warn('JWT_SECRET o\'rnatilmagan — faqat development uchun standart parol ishlatilmoqda');
}

// ── AI Client (Groq primary [free], OpenAI fallback) ─────────────────────────
const GEMINI_API_KEY_FALLBACK = '';

// ── Xavfsizlik tekshiruvi: .env faylini to'g'ridan-to'g'ri o'qish FAQAT fallback uchun
// Production muhitda env o'zgaruvchilari platformadan keladi (Render, Vercel, etc.)

/** Groq API keyni olish (bepul, tez) */
function getGroqApiKey() {
  const fromEnv = (process.env.GROQ_API_KEY || '').trim();
  if (fromEnv.length >= 20) return fromEnv;
  try {
    const envFile = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
    const match = envFile.match(/^GROQ_API_KEY\s*=\s*(.+)$/m);
    if (match && match[1].trim().length >= 20) return match[1].trim();
  } catch { /* ignore */ }
  return '';
}

/** OpenAI API keyni olish (fallback) */
function getOpenAIApiKey() {
  const fromEnv = (process.env.OPENAI_API_KEY || '').trim();
  if (fromEnv.length >= 20) return fromEnv;
  try {
    const envFile = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
    const match = envFile.match(/^OPENAI_API_KEY\s*=\s*(.+)$/m);
    if (match && match[1].trim().length >= 20) return match[1].trim();
  } catch { /* ignore */ }
  return '';
}

/** Gemini API keyni olish (last fallback) */
function getGeminiApiKey() {
  const fromEnv = (process.env.GEMINI_API_KEY || '').trim();
  if (fromEnv.length >= 20) return fromEnv;
  try {
    const envFile = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
    const match = envFile.match(/^GEMINI_API_KEY\s*=\s*(.+)$/m);
    if (match && match[1].trim().length >= 20) return match[1].trim();
  } catch { /* ignore */ }
  return GEMINI_API_KEY_FALLBACK;
}

/** AI sozlanganmi tekshirish */
function isGeminiConfigured() {
  return aiManager.isConfigured();
}

/** Groq orqali matn generatsiya (bepul, OpenAI-compatible) */
async function groqGenerate(prompt, systemInstruction) {
  const apiKey = getGroqApiKey();
  if (!apiKey) throw new Error('GROQ_API_KEY topilmadi');
  // Groq OpenAI SDK bilan 100% mos
  const client = new OpenAI({
    apiKey,
    baseURL: 'https://api.groq.com/openai/v1',
  });
  const messages = [];
  if (systemInstruction) messages.push({ role: 'system', content: systemInstruction });
  messages.push({ role: 'user', content: prompt });
  const response = await client.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages,
    max_tokens: 8000,
    temperature: 0.7,
  });
  return response.choices[0].message.content;
}

/** OpenAI orqali matn generatsiya (fallback) */
async function openAIGenerate(prompt, systemInstruction) {
  const apiKey = getOpenAIApiKey();
  if (!apiKey) throw new Error('OPENAI_API_KEY topilmadi');
  const client = new OpenAI({ apiKey });
  const messages = [];
  if (systemInstruction) messages.push({ role: 'system', content: systemInstruction });
  messages.push({ role: 'user', content: prompt });
  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages,
    max_tokens: 8000,
    temperature: 0.7,
  });
  return response.choices[0].message.content;
}

/** Gemini orqali matn generatsiya (last fallback) */
async function geminiGenerateFallback(prompt, systemInstruction) {
  const genAI = new GoogleGenerativeAI(getGeminiApiKey());
  const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
    ...(systemInstruction ? { systemInstruction } : {}),
  });
  const result = await model.generateContent(prompt);
  return result.response.text();
}

/** Asosiy AI matn generatsiya funksiyasi — Groq (bepul) → OpenAI → Gemini */
async function geminiGenerate(prompt, systemInstruction, _modelName) {
  return aiManager.generate(prompt, systemInstruction);
}

/** AI chat sessiyasi — Groq (bepul) → OpenAI → Gemini */
async function geminiChat(systemInstruction, history, userMessage) {
  return aiManager.chat(systemInstruction, history, userMessage);
}

/** AI matnlarida qatorlarni ajratish (\\n literal va CRLF) */
function splitDocLines(text) {
  return String(text || '').split(/\r\n|\n|\r/);
}

// ── Middleware ────────────────────────────────────────────────────────
// QO'SHIMCHA #6: Content Security Policy yoqilgan, lekin inline JS uchun flexible
app.use(helmet({
  contentSecurityPolicy: false,  // inline onclick handlerlari uchun o'chirildi
  crossOriginEmbedderPolicy: false,
}));

// CORS — production da faqat ruxsat etilgan domenlar, dev da hamma
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:4020',
  'http://127.0.0.1:4020',
  'http://127.0.0.1:3000',
  // Render production URL (o'zingiznikini kiriting)
  process.env.FRONTEND_URL,
  'https://tendermind.onrender.com',
  'https://tendermind.uz',
  'https://www.tendermind.uz',
].filter(Boolean);

app.use(cors(corsOptions()));

app.use(express.json({ limit: '2mb' }));

// XATO #3 TUZATMA: express.static('.') O'RNI — faqat kerakli fayllar serve bo'ladi
// .env, db.json, server.js, validators.js, logger.js — HECH QACHON serve bo'lmaydi
app.use('/styles.css', express.static(path.join(__dirname, 'styles.css')));
app.use('/app.js', express.static(path.join(__dirname, 'app.js')));
app.use('/i18n.js', express.static(path.join(__dirname, 'i18n.js')));
app.use('/logo.png', express.static(path.join(__dirname, 'logo.png')));
app.use('/favicon.ico', express.static(path.join(__dirname, 'logo.png')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 min
  max: 60,
  message: { error: 'Juda ko\'p so\'rov. 15 daqiqadan keyin urinib ko\'ring.' }
});
const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,  // 1 soat
  max: 20,
  message: { error: 'AI limit: soatiga 20 ta hujjat yaratish mumkin.' }
});
const chatLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 100,
  message: { error: 'AI maslahatchi: soatiga 100 ta xabar limiti. Birozdan keyin urinib ko\'ring.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// XATO #7 TUZATMA: Rate limiting to'g'ri taqsimlangan — ikki marta qo'llanilmaslik uchun
// apiLimiter faqat auth routelar uchun, AI endpointlar uchun alohida
app.use('/api/auth/', apiLimiter);
app.use('/api/generate', aiLimiter);
app.use('/api/strategy', aiLimiter);



// ══════════════════════════════════════════════════════════════════════
// API ROUTES
// Tender data is loaded from MongoDB via repositories/tenderRepository.js.
// Seed data lives in seed-tenders.js.
// ══════════════════════════════════════════════════════════════════════

// ── GET /api/tenders ─────────────────────────────────────────────────
app.get('/api/tenders', async (req, res, next) => {
  try {
    res.json(await tenderRepository.list(req.query));
  } catch (err) {
    next(err);
  }
});

// ── GET /api/tenders/:id ─────────────────────────────────────────────
app.get('/api/tenders/:id', async (req, res, next) => {
  try {
  const t = await tenderRepository.findById(req.params.id);
  if (!t) return res.status(404).json({ error: 'Tender topilmadi' });
  res.json(t);
  } catch (err) {
    next(err);
  }
});

// ── POST /api/generate (7 ta O'zbekiston tender hujjati) ────────────
app.post('/api/generate', async (req, res) => {
  const { company, orgForm, director, inn, address, phoneEmail, experience, bankDetails, pastProjects, tenderName, tenderLot, buyerOrg, price, deliveryTerm, tenderSoha } = req.body;

  if (!company || !experience || !tenderName || !price) {
    return res.status(400).json({ error: 'Barcha majburiy maydonlar to\'ldirilishi shart' });
  }

  const MAX_FIELD = 8000;
  const strFields = [company, orgForm, director, inn, address, phoneEmail, experience, bankDetails, pastProjects, tenderName, tenderLot, buyerOrg, deliveryTerm, tenderSoha];
  for (const f of strFields) {
    if (typeof f === 'string' && f.length > MAX_FIELD) {
      return res.status(400).json({ error: `Maydon juda uzun (${MAX_FIELD} belgidan oshmasin)` });
    }
  }

  if (!isGeminiConfigured()) {
    return res.status(503).json({
      error: 'API_KEY_MISSING',
      message: '.env faylida GEMINI_API_KEY sozlanmagan'
    });
  }

  const formatted = new Intl.NumberFormat('uz-UZ').format(Number(price));
  const today = new Date().toLocaleDateString('uz-Latn-UZ', { year: 'numeric', month: 'long', day: 'numeric' });
  const org = orgForm || 'MChJ';
  const dir = director || '___';

  const systemPrompt = `Sen O'zbekiston davlat xaridlari (xarid.uz) tizimi uchun professional tender hujjatlari yaratuvchi AI-yuristsan. Sening vazifang — berilgan ma'lumotlar asosida O'zekspomarkaz tender shakllari bo'yicha 7 ta rasmiy hujjat yaratish. Til: Rasmiy o'zbek tili. Yolg'on raqamlar ishlatma — agar ma'lumot yo'q bo'lsa '___' qo'y.`;

  const userPrompt = `Quyidagi ma'lumotlar asosida 7 ta tender hujjatini yarat:

Kompaniya: "${company}" ${org}
Rahbar: ${dir}
INN: ${inn || '___'}
Manzil: ${address || '___'}
Tel/Email: ${phoneEmail || '___'}
Tajriba: ${experience} yil
Bank: ${bankDetails || '___'}
Loyihalar: ${pastProjects || '___'}

Tender: "${tenderName}"
LOT: ${tenderLot || '___'}
Buyurtmachi: ${buyerOrg || '___'}
Narx: ${formatted} so'm (QQS bilan)
Muddat: ${deliveryTerm || '90 kalendar kun'}

JSON formatda qaytar (faqat JSON, boshqa hech narsa yo'q):
{
  "ariza": "Shakl №1 — rasmiy ariza to'liq matni",
  "kafolat": "Shakl №2 — kafolat xati matni (7 ta kafolat bandlari)",
  "kompaniya": "Shakl №3 — kompaniya ma'lumotlari jadvali",
  "texnik": "Shakl №6 — texnik taklif batafsil",
  "narx": "Shakl №7 — narx taklifi va xarajatlar tarkibi",
  "moliya": "Shakl №3 2-ilova — moliyaviy holat jadvali",
  "vakolat": "Shakl №5 — vakolatnoma matni"
}`;

  try {
    const rawText = await geminiGenerate(userPrompt, systemPrompt, 'gemini-1.5-flash');
    let parsed;
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : rawText);
    } catch {
      parsed = { ariza: rawText, kafolat: '', kompaniya: '', texnik: '', narx: '', moliya: '', vakolat: '' };
    }

    res.json({ success: true, docs: parsed, model: 'Gemini AI — 7 hujjat' });

  } catch (err) {
    logger.error('AI API error', err);
    if (err.status === 401 || (err.message && err.message.includes('API_KEY'))) {
      return res.status(401).json({ error: 'Gemini API kalit yaroqsiz. .env faylini tekshiring.' });
    }
    if (err.message && err.message.includes('404')) {
      return res.status(503).json({ error: 'AI modeli topilmadi. Administrator bilan bog\'laning.' });
    }
    res.status(500).json({ error: 'AI xizmatida xatolik. Qaytadan urinib ko\'ring.' });
  }
});

// ── POST /api/strategy ───────────────────────────────────────────────
app.post('/api/strategy', async (req, res, next) => {
  try {
  const { tenderId, company, experience } = req.body;
  if (!tenderId) return res.status(400).json({ error: 'tenderId talab qilinadi' });

  const tender = await tenderRepository.findById(tenderId);
  if (!tender) return res.status(404).json({ error: 'Tender topilmadi' });

  if (!isGeminiConfigured()) {
    // Fallback: statik strategiya
    return res.json({
      success: true,
      aiGenerated: false,
      strategy: generateFallbackStrategy(tender, company, experience)
    });
  }

  const prompt = `O'zbekiston davlat tender mutaxassisi sifatida quyidagi tender uchun g'alaba strategiyasi tayyorla:

Tender: ${tender.title}
Tashkilot: ${tender.org}
Byudjet: ${tender.budget} so'm
Raqiblar: ${tender.competitors} ta
G'alaba ehtimoli: ${tender.probability}%
Deadline: ${tender.deadline}
Soha: ${tender.soha}
${company ? `Kompaniya: ${company}, tajriba: ${experience} yil` : ''}

JSON formatda qaytаr:
{
  "probability": ${tender.probability},
  "kpis": [
    {"icon": "📊", "value": "87%", "label": "G'alaba ehtimoli", "trend": "+12%", "color": "green"},
    {"icon": "💰", "value": "3.4 mlrd", "label": "Optimal narx tavsiyasi", "trend": "bozor narxi", "color": "yellow"},
    {"icon": "⚡", "value": "${tender.competitors}", "label": "Raqiblar soni", "trend": "tahlil qilindi", "color": "blue"}
  ],
  "steps": [
    {"title": "...", "description": "...", "status": "done", "tag": "..."},
    {"title": "...", "description": "...", "status": "done", "tag": "..."},
    {"title": "...", "description": "...", "status": "active", "tag": "..."},
    {"title": "...", "description": "...", "status": "pending", "tag": "..."},
    {"title": "...", "description": "...", "status": "pending", "tag": "..."}
  ],
  "risks": [
    {"level": "low", "text": "..."},
    {"level": "medium", "text": "..."},
    {"level": "high", "text": "..."}
  ],
  "priceRecommendation": "...",
  "keyAdvantages": ["...", "...", "..."],
  "deadline": "${tender.deadline}"
}`;

  try {
    const rawText = await geminiGenerate(prompt, null, 'gemini-1.5-flash');
    let parsed;
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : rawText);
    } catch {
      parsed = generateFallbackStrategy(tender, company, experience);
    }

    res.json({ success: true, aiGenerated: true, strategy: parsed });
  } catch (err) {
    logger.error('Strategy AI error', err);
    res.json({
      success: true,
      aiGenerated: false,
      strategy: generateFallbackStrategy(tender, company, experience)
    });
  }
  } catch (err) {
    next(err);
  }
});

function generateFallbackStrategy(tender, company, experience) {
  const optimalPrice = Math.round(tender.budgetRaw * 0.87);
  const formatted = new Intl.NumberFormat('en').format(optimalPrice);
  const daysLeft = Math.ceil((new Date(tender.deadline) - new Date()) / 86400000);

  return {
    probability: tender.probability,
    kpis: [
      { icon: '📊', value: `${tender.probability}%`, label: "G'alaba ehtimoli", trend: `${tender.competitors} raqib`, color: 'green' },
      { icon: '💰', value: `${Math.round(tender.budgetRaw / 1e9 * 10) / 10} mlrd`, label: 'Tender byudjeti', trend: 'Optimal narx hisoblandi', color: 'yellow' },
      { icon: '⏰', value: `${daysLeft} kun`, label: 'Qolgan muddat', trend: daysLeft < 15 ? '🔴 Shoshiling!' : '✅ Vaqt bor', color: 'blue' },
    ],
    steps: [
      { title: "Raqiblarni tahlil qilish", description: `${tender.org} bilan avvalgi shartnomalar, ${tender.competitors} ta raqib kuchli va zaif tomonlari aniqlandi.`, status: 'done', tag: '🎯 Tahlil tugadi' },
      { title: "Optimal narx strategiyasi", description: `Byudjet ${tender.budget} so'm. Optimal taklif narxi: ${formatted} so'm (taxminan byudjetning 87%).`, status: 'done', tag: `💰 ${formatted} so'm tavsiya` },
      { title: "Hujjatlarni kuchaytirish", description: "Texnik taklif, moliyaviy hisob va kompaniya profili yuqori sifatda tayyorlanishi kerak. AI generator ishlatish tavsiya etiladi.", status: 'active', tag: '📝 Jarayonda' },
      { title: "Taqdimot tayyorlash", description: `${tender.org} oldida 15 daqiqalik taqdimot: texnik imkoniyatlar, avvalgi loyihalar, jamoа.`, status: 'pending', tag: `📅 ${daysLeft - 5} kun ichida` },
      { title: "Yuborish va kuzatish", description: `Barcha hujjatni muddatdan 3 kun oldin topshiring. ${tender.contactEmail || 'aloqa'} orqali tasdiq oling.`, status: 'pending', tag: '📋 Inson tekshiruvi majburiy' },
    ],
    risks: [
      { level: 'low', text: `Texnik taklif sifatli tayyorlansa, g'alaba ehtimoli ${tender.probability}% dan yuqori bo'lishi mumkin.` },
      { level: 'medium', text: `${tender.competitors} ta raqib bor. Narx va texnik ustunlik birgalikda muhim.` },
      { level: 'high', text: `Muddatga ${daysLeft} kun qoldi. Hujjatlarni vaqtida topshirish kritik.` },
    ],
    priceRecommendation: `${formatted} so'm`,
    keyAdvantages: ['Sifatli texnik hujjatlar', 'Vaqtida topshirish', 'Professional jamoа'],
    deadline: tender.deadline,
  };
}

// ── POST /api/ai/compare (Tenderlarni AI bo'yicha taqqoslash) ────────
app.use('/api/ai/compare', aiLimiter);
app.post('/api/ai/compare', async (req, res) => {
  try {
    const { tender1Id, tender2Id } = req.body;

    if (!tender1Id || !tender2Id) {
      return res.status(400).json({ errors: { tender: 'Ikkita tender ID kerak' } });
    }

    const t1 = await tenderRepository.findById(tender1Id);
    const t2 = await tenderRepository.findById(tender2Id);

    if (!t1 || !t2) {
      return res.status(404).json({ error: 'Tender topilmadi' });
    }

    // If no API key, return demo comparison
    if (!isGeminiConfigured()) {
      const comparison = generateDemoComparison(t1, t2);
      return res.json({ success: true, comparison, aiGenerated: false, model: 'Demo' });
    }

    // Call Gemini AI for comparison
    const comparePrompt = `O'zbek davlat tenderlarini taqqoslab ber.

TENDER 1: "${t1.title}"
- Byudjet: ${t1.budget}
- Raqiblar: ${t1.competitors}
- G'alaba ehtimoli: ${t1.probability}%
- Muddati: ${t1.deadline}
- Soha: ${t1.soha}
- Tavsifi: ${t1.description}

TENDER 2: "${t2.title}"
- Byudjet: ${t2.budget}
- Raqiblar: ${t2.competitors}
- G'alaba ehtimoli: ${t2.probability}%
- Muddati: ${t2.deadline}
- Soha: ${t2.soha}
- Tavsifi: ${t2.description}

Ushbu formatda javob ber JSON (faqat JSON, boshqa hech narsa yo'q):
{
  "summary": "Qaysi tender yaxshi va nima sababdan",
  "advantages1": ["Tender 1 ning afzalliklari", "..."],
  "advantages2": ["Tender 2 ning afzalliklari", "..."],
  "risks1": ["Tender 1 xavflari", "..."],
  "risks2": ["Tender 2 xavflari", "..."],
  "recommendation": "Qaysi tenderni tanlash kerak va nima sababdan",
  "difficulty": "Oson/O'rta/Qiyin",
  "timeToBid": "Hujjatlar tayyorlash uchun taxminiy vaqt kun hisobida"
}`;

    const responseText = await geminiGenerate(comparePrompt, null, 'gemini-1.5-flash');

    let comparison;
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      comparison = jsonMatch ? JSON.parse(jsonMatch[0]) : generateDemoComparison(t1, t2);
    } catch {
      comparison = generateDemoComparison(t1, t2);
    }

    res.json({ success: true, comparison, aiGenerated: true, model: 'Gemini 1.5 Flash' });
  } catch (err) {
    logger.error('Compare error', err);
    res.status(500).json({ error: 'AI taqqoslashda xatolik' });
  }
});

// ── Demo Comparison Generator ────────────────────────────────────────
function generateDemoComparison(t1, t2) {
  const daysLeft1 = Math.ceil((new Date(t1.deadline) - new Date()) / 86400000);
  const daysLeft2 = Math.ceil((new Date(t2.deadline) - new Date()) / 86400000);

  const t1Stronger = t1.probability + (daysLeft1 > 20 ? 10 : 0) > t2.probability + (daysLeft2 > 20 ? 10 : 0);

  return {
    summary: t1Stronger
      ? `${t1.title.substring(0, 40)}... tenderi ${t2.title.substring(0, 40)} dan yaxshi tanlov.`
      : `${t2.title.substring(0, 40)}... tenderi ${t1.title.substring(0, 40)} dan yaxshi tanlov.`,
    advantages1: [
      `${t1.probability}% g'alaba ehtimoli`,
      `${t1.competitors} ta raqib (${t2.competitors} ta ga nisbatan)`,
      `${new Intl.NumberFormat('uz').format(t1.budgetRaw)} so\'m byudjet`,
      `${t1.tags.join(', ')} sohalari`
    ],
    advantages2: [
      `${t2.probability}% g'alaba ehtimoli`,
      `${t2.competitors} ta raqib`,
      `${new Intl.NumberFormat('uz').format(t2.budgetRaw)} so'm byudjet`,
      `${t2.tags.join(', ')} sohalari`
    ],
    risks1: daysLeft1 < 15 ? ['Muddati tez tugaydi — shoshilinch hujjatlar'] : [`Muddatga ${daysLeft1} kun qoldi`],
    risks2: daysLeft2 < 15 ? ['Muddati tez tugaydi — shoshilinch hujjatlar'] : [`Muddatga ${daysLeft2} kun qoldi`],
    recommendation: t1Stronger
      ? `${t1.title.substring(0, 50)}... ni tanlang. Yuqori g'alaba ehtimoli va ko'proq vaqt mavjud.`
      : `${t2.title.substring(0, 50)}... ni tanlang. Yuqori g'alaba ehtimoli va ko'proq vaqt mavjud.`,
    difficulty: t1.competitors > 8 ? 'Qiyin' : t1.competitors > 4 ? "O'rta" : 'Oson',
    timeToBid: Math.ceil(Math.random() * 3 + 3) + ' kun'
  };
}

// ── AUTH ROUTES ──────────────────────────────────────────────────────
const authRegisterSanitize = sanitizeBody({ name: 'name', company: 'company' });
const registerRules = {
  name: { required: true, format: 'name', errorMsg: 'Ism 2–50 belgi, ruxsat etilgan alifbo' },
  phone: { required: true, format: 'phone', errorMsg: 'Telefon +998901234567 yoki 901234567 ko\'rinishida kiriting' },
  password: { required: true, format: 'password', errorMsg: 'Parol kamida 6 belgi, bo\'shliqsiz' },
  company: { required: false, format: 'company', errorMsg: 'Kompaniya nomi 2–100 belgi' },
};
const loginRules = {
  phone: { required: true, format: 'phone', errorMsg: 'Telefon formati noto\'g\'ri' },
  password: { required: true, format: 'password', errorMsg: 'Parol noto\'g\'ri' },
};

function normalizeAuthPhone(req, res, next) {
  req.body.phone = normalizeUzbekPhone(req.body.phone || '');
  next();
}

// legacy phonesMatch functionality removed due to MongoDB Native Search

app.post('/api/auth/register',
  authRegisterSanitize,
  normalizeAuthPhone,
  validateBody(registerRules),
  async (req, res) => {
    try {
      const { name, phone, password, company } = req.body;

      const existingUser = await User.findOne({ phone });
      if (existingUser) {
        return res.status(409).json({ error: 'Bu telefon raqam allaqachon ro\'yxatdan o\'tgan' });
      }

      const hashedPwd = await bcrypt.hash(password, 10);
      const user = await User.create({
        name,
        phone,
        company: company || '',
        passwordHash: hashedPwd
      });

      const token = jwt.sign({ id: user.id, name: user.name, phone: user.phone }, JWT_SECRET, { expiresIn: '30d' });
      res.status(201).json({ success: true, token, user: { id: user.id, name: user.name, phone: user.phone, company: user.company } });
    } catch (err) {
      logger.error('Register error', err);
      const isDBError = err.name === 'MongoNetworkError' || err.name === 'MongooseServerSelectionError' ||
        (err.message && (err.message.includes('ECONNREFUSED') || err.message.includes('topology')));
      if (isDBError) {
        return res.status(503).json({ error: 'Server yuklanmoqda. 10-20 soniyadan keyin qaytadan urinib ko\'ring.' });
      }
      res.status(500).json({ error: 'Ro\'yxatdan o\'tishda xatolik yuz berdi' });
    }
  });

app.post('/api/auth/login',
  normalizeAuthPhone,
  validateBody(loginRules),
  async (req, res) => {
    try {
      const { phone, password } = req.body;

      const user = await User.findOne({ phone });
      if (!user) return res.status(401).json({ error: 'Telefon yoki parol noto\'g\'ri' });

      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) return res.status(401).json({ error: 'Telefon yoki parol noto\'g\'ri' });

      const token = jwt.sign({ id: user.id, name: user.name, phone: user.phone }, JWT_SECRET, { expiresIn: '30d' });
      res.json({ success: true, token, user: { id: user.id, name: user.name, phone: user.phone, company: user.company } });
    } catch (err) {
      logger.error('Login error', err);
      const isDBError = err.name === 'MongoNetworkError' || err.name === 'MongooseServerSelectionError' ||
        (err.message && (err.message.includes('ECONNREFUSED') || err.message.includes('topology')));
      if (isDBError) {
        return res.status(503).json({ error: 'Server yuklanmoqda. 10-20 soniyadan keyin qaytadan urinib ko\'ring.' });
      }
      res.status(500).json({ error: 'Kirishda xatolik yuz berdi' });
    }
  });

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findOne({ id: req.user.id });
    if (!user) return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });
    res.json({ id: user.id, name: user.name, phone: user.phone, company: user.company });
  } catch (err) {
    logger.error('Auth/me error', err);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// ── SAVED TENDERS ────────────────────────────────────────────────────
app.get('/api/saved', authMiddleware, async (req, res) => {
  try {
    const user = await User.findOne({ id: req.user.id });
    const savedIds = user ? user.savedTenders : [];
    const tenders = await tenderRepository.findManyByIds(savedIds);
    res.json(tenders);
  } catch (err) {
    logger.error('Saved fetch error', err);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

app.post('/api/saved/:id', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const user = await User.findOne({ id: userId });
  if (!user) return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });

  const idx = user.savedTenders.indexOf(req.params.id);
  if (idx > -1) {
    user.savedTenders.splice(idx, 1);
    await user.save();
    res.json({ saved: false, message: 'Saqlangan tenderlardan olib tashlandi' });
  } else {
    user.savedTenders.push(req.params.id);
    await user.save();
    res.json({ saved: true, message: 'Tender saqlandi!' });
  }
});

// ── WON TENDERS ──────────────────────────────────────────────────────
app.get('/api/won', authMiddleware, async (req, res) => {
  try {
    const user = await User.findOne({ id: req.user.id });
    const wonIds = user ? user.wonTenders : [];
    const tenders = await tenderRepository.findManyByIds(wonIds);
    res.json(tenders);
  } catch (err) {
    logger.error('Won fetch error', err);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

app.post('/api/won/:id', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const user = await User.findOne({ id: userId });
  if (!user) return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });

  const idx = user.wonTenders.indexOf(req.params.id);
  if (idx > -1) {
    user.wonTenders.splice(idx, 1);
    await user.save();
    res.json({ won: false, message: 'Yutganlardan olib tashlandi' });
  } else {
    user.wonTenders.push(req.params.id);
    await user.save();
    res.json({ won: true, message: "Tabriklaymiz! Tender yutilganlar safiga qo'shildi 🏆" });
  }
});

// QO'SHIMCHA #5: Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    ai: isGeminiConfigured() ? `${aiManager.providerName().toLowerCase()}-configured` : 'not_configured',
    db: isDBConnected() ? 'ok' : 'missing'
  });
});

// QO'SHIMCHA #3: Parolni o'zgartirish endpoint
app.put('/api/auth/change-password', authMiddleware, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Hamma maydonlar talab qilinadi' });
  }
  if (newPassword.length < 6 || /\s/.test(newPassword)) {
    return res.status(400).json({ error: 'Yangi parol kamida 6 belgi, bo\'shliqsiz' });
  }
  if (currentPassword === newPassword) {
    return res.status(400).json({ error: 'Yangi parol eski paroldan farq qilishi kerak' });
  }

  const user = await User.findOne({ id: req.user.id });
  if (!user) return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });

  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Joriy parol noto\'g\'ri' });

  user.passwordHash = await bcrypt.hash(newPassword, 10);
  await user.save();

  res.json({ success: true, message: 'Parol muvaffaqiyatli o\'zgartirildi' });
});

// QO'SHIMCHA #4: Profil yangilash endpoint
app.put('/api/auth/profile', authMiddleware, async (req, res) => {
  const { name, company } = req.body;

  if (name && (name.length < 2 || name.length > 50)) {
    return res.status(400).json({ error: 'Ism 2-50 belgi bo\'lishi kerak' });
  }
  if (company && company.length > 100) {
    return res.status(400).json({ error: 'Kompaniya nomi 100 belgidan oshmasin' });
  }

  const user = await User.findOne({ id: req.user.id });
  if (!user) return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });

  if (name) user.name = name.trim();
  if (company !== undefined) user.company = company.trim();
  await user.save();

  res.json({
    success: true,
    user: { id: user.id, name: user.name, phone: user.phone, company: user.company }
  });
});

// ── EXPORT ENDPOINTS ─────────────────────────────────────────────────
app.post('/api/export/word', (req, res) => {
  const { title, docs, content } = req.body;
  // docs is object with keys: ariza, kafolat, kompaniya, texnik, narx, moliya, vakolat
  // content is fallback for single document format

  if (!docs && !content) return res.status(400).json({ error: 'No content' });

  // XATO #2 TUZATMA: PageBreak docx v9.x da mavjud emas — pageBreakBefore ishlatiladi
  const { Document, Packer, Paragraph, TextRun } = docx;

  let children = [];

  // If docs object is provided (7 documents), format them nicely
  if (docs && Object.keys(docs).length > 0) {
    const docOrder = ['ariza', 'kafolat', 'kompaniya', 'texnik', 'narx', 'moliya', 'vakolat'];
    const docNames = {
      ariza: '📋 ARIZA (Shakl №1)',
      kafolat: '🛡️ KAFOLAT XATI (Shakl №2)',
      kompaniya: '🏢 KOMPANIYA MA\'LUMOTLARI (Shakl №3)',
      texnik: '⚙️ TEXNIK TAKLIF (Shakl №6)',
      narx: '💰 NARX TAKLIFI (Shakl №7)',
      moliya: '📊 MOLIYAVIY HOLAT',
      vakolat: '📝 VAKOLATNOMA (Shakl №5)'
    };

    docOrder.forEach((docType, idx) => {
      if (docs[docType]) {
        // XATO #2 TUZATMA: pageBreakBefore ishlatiladi (PageBreak mavjud emas docx v9.x da)
        if (idx > 0) {
          children.push(new Paragraph({ pageBreakBefore: true, children: [] }));
        }

        // XATO #5 TUZATMA: Sarlavha rangi — professional to'q ko'k-kulrang (1F2937)
        // Oldin: C8FF00 (neon yashil — chop etishda ko'rinmaydi)
        children.push(new Paragraph({
          children: [new TextRun({ text: docNames[docType] || docType, bold: true, size: 28, font: 'Cambria', color: '1F2937' })],
          spacing: { after: 200 }
        }));

        // Add document content
        const lines = splitDocLines(docs[docType]);
        lines.forEach(line => {
          children.push(new Paragraph({
            children: [new TextRun({ text: line || ' ', size: 22, font: 'Cambria' })],
            spacing: { after: 80 }
          }));
        });
      }
    });
  } else if (content) {
    // Fallback for single document format
    const paragraphs = splitDocLines(content).map(line => {
      return new Paragraph({
        children: [new TextRun({ text: line, size: 24, font: 'Cambria' })],
        spacing: { after: 120 }
      });
    });
    children = paragraphs;
  }

  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        new Paragraph({
          children: [new TextRun({ text: title || 'Tender Hujjatlari', bold: true, size: 36, font: 'Cambria' })],
          spacing: { after: 400 }
        }),
        new Paragraph({
          children: [new TextRun({ text: 'O\'zbekiston davlat xaridlari standartiga mos', italic: true, size: 20, font: 'Cambria' })],
          spacing: { after: 600 }
        }),
        ...children
      ],
    }],
  });

  Packer.toBuffer(doc).then((buffer) => {
    res.setHeader('Content-Disposition', `attachment; filename="${(title || 'Hujjat').replace(/\s+/g, '_')}.docx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.send(buffer);
  }).catch(e => res.status(500).json({ error: e.message }));
});

app.post('/api/export/pdf', (req, res) => {
  const { title, docs, content } = req.body;
  if (!docs && !content) return res.status(400).send('No content');

  const pdf = new PDFDocument({ margin: 40, bufferPages: true });

  res.setHeader('Content-Disposition', `attachment; filename="${(title || 'Hujjat').replace(/\s+/g, '_')}.pdf"`);
  res.setHeader('Content-Type', 'application/pdf');

  pdf.pipe(res);

  // If docs object is provided (7 documents), format them nicely
  if (docs && Object.keys(docs).length > 0) {
    const docOrder = ['ariza', 'kafolat', 'kompaniya', 'texnik', 'narx', 'moliya', 'vakolat'];
    const docNames = {
      ariza: '📋 ARIZA (Shakl №1)',
      kafolat: '🛡️ KAFOLAT XATI (Shakl №2)',
      kompaniya: '🏢 KOMPANIYA MA\'LUMOTLARI (Shakl №3)',
      texnik: '⚙️ TEXNIK TAKLIF (Shakl №6)',
      narx: '💰 NARX TAKLIFI (Shakl №7)',
      moliya: '📊 MOLIYAVIY HOLAT',
      vakolat: '📝 VAKOLATNOMA (Shakl №5)'
    };

    // Title page
    pdf.fontSize(24).font('Helvetica-Bold').text(title || 'Tender Hujjatlari', { align: 'center' }).moveDown(1);
    pdf.fontSize(12).font('Helvetica-Oblique').text('O\'zbekiston davlat xaridlari standartiga mos', { align: 'center' }).moveDown(3);

    // All 7 documents
    docOrder.forEach((docType, idx) => {
      if (docs[docType]) {
        // Page break before each new document
        if (idx > 0) {
          pdf.addPage();
        }

        // Document header
        pdf.fontSize(14).font('Helvetica-Bold').text(docNames[docType] || docType).moveDown(1);
        pdf.moveTo(40, pdf.y).lineTo(550, pdf.y).stroke().moveDown(0.5);

        // Document content
        pdf.fontSize(10).font('Helvetica');
        const lines = splitDocLines(docs[docType]);
        lines.forEach(line => {
          pdf.text(line || '', { align: 'justify', lineGap: 2 });
        });
        pdf.moveDown(1);
      }
    });
  } else if (content) {
    // Fallback for single document format
    pdf.fontSize(18).text(title || 'Tender Hujjati', { align: 'center' }).moveDown(2);
    pdf.fontSize(12).text(content, { align: 'justify', lineGap: 4 });
  }

  pdf.end();
});

// ── AI CHAT (Maslahatchi) — alohida limit, chuqur suhbat ─────────────
app.use('/api/chat', chatLimiter);

function sanitizeChatHistoryTurns(history) {
  if (!Array.isArray(history)) return [];
  const out = [];
  for (const h of history) {
    if (!h || (h.role !== 'user' && h.role !== 'assistant')) continue;
    if (typeof h.content !== 'string') continue;
    const c = h.content.trim();
    if (!c || c.length > 12000) continue;
    const last = out[out.length - 1];
    if (last && last.role === h.role) {
      last.content += `\n\n${c}`;
    } else {
      out.push({ role: h.role, content: c });
    }
  }
  while (out.length && out[0].role === 'assistant') out.shift();
  return out.slice(-24);
}

app.post('/api/chat', async (req, res) => {
  const { message, tenderContext, history } = req.body;
  if (!message || typeof message !== 'string') return res.status(400).json({ error: 'Xabar talab qilinadi' });
  if (message.length > 8000) return res.status(400).json({ error: 'Xabar 8000 belgidan oshmasin' });

  const tenderCount = await tenderRepository.count();
  const systemPrompt = `Sen "TenderMind AI Maslahatchi"san — xatti-harakating ChatGPT yoki Claude kabi tabiiy, do'stona va suhbatga asoslangan bo'lsin, lekin ixtisoslashuving — O'zbekiston va umuman davlat xaridlari, tenderlar, kotirovkalar, shartnomalar va xarid jarayoni.

ASOSIY PRINSIPLAR:
1) Har qanday savolga javob ber: tushuntirish, taqqoslash, misollar, "boshlang'ich uchun" qo'llanma, professional maslahat — hammasi mumkin.
2) Foydalanuvchi "tushunmayman", "nima bu tender?", "ma'lumot bermang, oddiy tilda tushuntiring" desa — juda sodda va bosqichma-bosqich tushuntir, jargonni yana ochib ber.
3) Suhbat tarixini hisobga ol: avvalgi xabarlarga mantiqiylik bilan bog'la, takrorlamasdan davom ettir.
4) Til: foydalanuvchi o'zbekcha yozsa — asosan o'zbekcha; ruscha/inglizcha yozsa — shu tilda javob ber (kerak bo'lsa ikkala tilni aralashtirish mumkin).
5) Javob uzunligi: savolga mos. Oddiy savolga qisqa; "tushuntirib ber", "batafsil" desa — batafsil yozish mumkin (bir necha bo'lim, ro'yxamlar).
6) Format: **qalin** uchun markdown, ro'yxamlar, qisqa sarlavhalar — o'qish oson bo'lsin.
7) TenderMind ilovasidagi tenderlar — o'qitish/demonstratsiya uchun namunaviy ma'lumotlar (${tenderCount} ta yozuv). Ularni haqiqiy xarid.uz e'lonlari bilan aralashtirmasdan, kerak bo'lsa "bu yerda demo ma'lumot" deb aytaver.
8) Qonuniy va axloqiy: soliq, korrupsiya, yolg'on hujjat yoki qoidabuzarlikni o'rganishni so'rasa — rad qilib, qonuniy yo'lni tavsiya qil.
9) Aniq qonun bandi yoki portal qoidasi ishonchsiz bo'lsa — "rasmiy manba yoki yurist bilan tekshiring" deb yoz.
10) Yopishda ba'zan 1 ta qo'shimcha savol taklif qil (majburiy emas, suhbat tabiiy bo'lsa — qo'shmasdan ham bo'ladi).

KONTEKST (yordamchi):
- O'zbekistonda davlat xaridlari odatda elektron platformalar orqali; fuqarolarga "tender" — davlat yoki tashkilot xarid qilish uchun ochiq tanlov jarayoni sifatida tushuntiriladi.
- Sohalar: IT, qurilish, tibbiyot, oziq-ovqat, transport, ta'lim, ekologiya, qishloq xo'jaligi va boshqalar.
- Hududlar (demo): Toshkent, Samarqand, Namangan, Andijon, Farg'ona, Buxoro, Qashqadaryo, Xorazm, Surxondaryo.`;

  let contextInfo = '';
  if (tenderContext) {
    const tender = await tenderRepository.findById(tenderContext);
    if (tender) {
      contextInfo = `\n\n[FOYDALANUVCHI TANLAGAN TENDER (demo bazadan)]
ID: ${tender.id}
Nomi: ${tender.title}
Tashkilot: ${tender.org}
Soha: ${tender.soha}
Hudud: ${tender.hudud}
Byudjet: ${tender.budget} so'm
Raqiblar (demo): ${tender.competitors} ta
G'alaba ehtimoli (demo model): ${tender.probability}%
Muddat: ${tender.deadline}
Talablar: ${(tender.requirements || []).join(', ')}
Tavsif: ${tender.description || ''}`;
    }
  }

  if (!isGeminiConfigured()) {
    return res.json({
      success: true,
      aiGenerated: false,
      reply: await generateFallbackChatReply(message, tenderContext)
    });
  }

  const pastTurns = sanitizeChatHistoryTurns(history);

  // Gemini chat history formatiga o'tkazish
  const geminiHistory = pastTurns.map(h => ({
    role: h.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: h.content }],
  }));

  const userMessageWithContext = message.trim() + contextInfo;

  try {
    const reply = await geminiChat(systemPrompt, geminiHistory, userMessageWithContext);
    res.json({ success: true, aiGenerated: true, reply: reply.trim() });
  } catch (err) {
    logger.error('Chat AI error', err);
    // Fallback: gemini-pro bilan urinib ko'r
    try {
      const reply = await geminiChat(systemPrompt, [], userMessageWithContext);
      return res.json({ success: true, aiGenerated: true, reply: reply.trim() });
    } catch (err2) {
      logger.error('Chat AI fallback error', err2);
    }
    res.json({
      success: true,
      aiGenerated: false,
      reply: await generateFallbackChatReply(message, tenderContext)
    });
  }
});

async function generateFallbackChatReply(message, tenderContext) {
  const msg = message.toLowerCase().trim();

  const beginnerHints =
    /tushunmay|tushunmadim|nima (bu )?tender|tender nima|boshlang|yangiman|oddiy tilda|tushunti|nimaga kerak|nimala|qanday (ish|bo)/.test(msg);
  if (beginnerHints && !tenderContext) {
    return (
      '**Tender nima?** (qisqa va oddiy)\n\n' +
      'Davlat yoki yirik tashkilot nimadir sotib olishi kerak bo\'lsa (masalan, kompyuter, qurilish ishlari, oziq-ovqat xizmati), ' +
      'ko\'pincha buni **ochiq tanlov** orqali qiladi: bir necha kompaniya **taklif** beradi, eng mosini tanlaydi. Shu jarayonning o\'zi ko\'pincha **tender** deb ataladi.\n\n' +
      '**Asosiy g\'oya:**\n' +
      '• **Buyurtmachi** — kim xarid qilmoqchi\n' +
      '• **Ishtirokchi** — kim xizmat/yetkazib berishni taklif qiladi\n' +
      '• **Hujjatlar** — nima qila olishingiz va qancha narxlash haqida\n' +
      '• **Muddat** — qachongacha topshirish kerak\n\n' +
      '**TenderMind** ilovasidagi ro\'yxat — **o\'rganish uchun demo** tenderlar; haqiqiy e\'lonlar uchun rasmiy **xarid.uz** (va tegishli) portallarni tekshiring.\n\n' +
      'Hozir **API kaliti yo\'q** — men to\'liq suhbat rejimida emasman. To\'liq "ChatGPT kabi" javoblar uchun `.env` ga `ANTHROPIC_API_KEY` qo\'shing.\n\n' +
      'Keyingi qadam sifatida yozing: "Qanday hujjatlar kerak?" yoki "Narxni qanday belgilash mumkin?" — yoki ilovadan bitta tenderni tanlab **AI dan maslahat** qiling.'
    );
  }

  if (tenderContext) {
    const tender = await tenderRepository.findById(tenderContext);
    if (tender) {
      return `**"${tender.title}"** (tanlangan tender, demo ma'lumot)\n\n` +
        `**Kim e'lon qilgan:** ${tender.org}\n` +
        `**Nima haqida:** ${tender.description || 'Tavsif ilovada'}\n\n` +
        `**Byudjet (demo):** ${tender.budget} so'm\n` +
        `**G'alaba ehtimoli (demo model):** ${tender.probability}%\n` +
        `**Taxminiy raqiblar soni (demo):** ${tender.competitors}\n` +
        `**Muddat:** ${tender.deadline}\n\n` +
        `**Talablar:** ${(tender.requirements || []).join('; ') || '—'}\n\n` +
        `**Amaliy maslahat:** texnik taklifni batafsil yozing, narxni odatda byudjetning **85–92%** atrofida rejalashtirish ko'p hollarda mantiqiy; hujjatlarni muddatdan oldin topshiring.\n\n` +
        (isGeminiConfigured()
          ? ''
          : '_To\'liq batafsil suhbat uchun API kalitini ulang._\n\n') +
        `Yana nimani tushuntirish kerak — narx, hujjatlar yoki strategiya?`;
    }
  }

  if (/salom|assalom|hello|hi\b|privet/.test(msg)) {
    return (
      'Salom! Men TenderMind **AI maslahatchi**man (hozir cheklangan rejim: API kalitsiz shablon javoblar).\n\n' +
      'Menga **har qanday** tender haqida savol bering — masalan:\n' +
      '• "Tender va oddiy xarid farqi nima?"\n' +
      '• "Birinchi marta qatnashmoqchiman, nimadan boshlayman?"\n' +
      '• "Texnik taklifda nima bo\'lishi kerak?"\n\n' +
      'Haqiqiy suhbat va chuqur javoblar uchun loyihada **ANTHROPIC_API_KEY** sozlansin.'
    );
  }

  if (/xarid\.uz|xarid uz|portal/.test(msg)) {
    return (
      '**xarid.uz** — O\'zbekistonda davlat xaridlari bilan bog\'liq elektron tizimlardan biri (rasmiy portal va qoidalar vaqt o\'tishi bilan yangilanadi).\n\n' +
      'Umuman olganda u yerda **e\'lonlar**, **hujjatlar**, **muddatlar** va **taklif topshirish** bo\'yicha yo\'riqnomalar bo\'ladi. Aniq qadam-qadam uchun portalning o\'zidagi **yordam** yoki yurist bilan tekshirish yaxshi.\n\n' +
      'TenderMind esa **o\'qitish va tayyorgarlik** uchun: demo tenderlar, strategiya va hujjat namunalari.'
    );
  }

  if (msg.includes('tender') && (msg.includes('qaysi') || msg.includes('mos') || msg.includes('tavsiya'))) {
    return `**Mos tender** topish uchun o'zingiz haqingizda qisqacha ayting yoki ilovada **🤖 AI Tavsiya** tugmasidan foydalaning.\n\n` +
      `Savollar:\n` +
      `1. Qaysi sohada ishlaysiz? (IT, qurilish, tibbiyot, ...)\n` +
      `2. Tajribangiz necha yil?\n` +
      `3. Qaysi viloyat/shahar?\n\n` +
      `_API ulangan bo'lsa, men bularni inobatga olib batafsil javob beraman._`;
  }

  if (msg.includes('narx') || msg.includes('baho') || msg.includes('qancha') || msg.includes('price')) {
    return `**Narx bo'yicha (umumiy)**\n\n` +
      `• Ko'p hollarda taklif **byudjetdan past** bo'ladi; juda ham past bo'lsa, ishonchlilik shubhasi tug'ilishi mumkin.\n` +
      `• **Texnik qism** va **tajriba** ham baholanadi — faqat eng arzon emas.\n` +
      `• Smetada **xarajat turlari** (materiallar, mehnat, transport, boshqaruv, rezerv) ko'rinadigan qilib yozish yaxshi.\n\n` +
      `Konkret tender byudjetini aytsangiz, taxminiy diapazon haqida gaplashamiz (to'liq rejimda API kalit kerak).`;
  }

  if (msg.includes('hujjat') || msg.includes('document') || msg.includes('tayyorl')) {
    return `**Odatda so'raladigan hujjatlar**\n\n` +
      `• **Texnik taklif** — bajarish usuli, muddat, sifat\n` +
      `• **Moliyaviy / narx taklifi**\n` +
      `• **Kompaniya to'g'risida** — guvohnomalar, tajriba\n` +
      `• **Litsenziya / sertifikat** (soha bo'yicha)\n\n` +
      `TenderMind **Hujjat** bo'limida AI yordamida namunalar yaratish mumkin — lekin yuborishdan oldin **o'zingiz tekshiring**.\n\n` +
      `API kalitsiz men faqat umumiy ro'yxatni beraman; batafsil matn uchun kalitni ulang.`;
  }

  if (msg.includes('strategiya') || msg.includes('g\'alaba') || msg.includes('yutish') || msg.includes('win')) {
    return `**G'alaba uchun umumiy yo'nalish**\n\n` +
      `1. E'lon va **texnik topshiriq**ni diqqat bilan o'qing\n` +
      `2. **Raqobatchilar** va bozor narxini taxminan bilib oling\n` +
      `3. **Texnik taklif**ni aniq va ishonchli qiling\n` +
      `4. **Muddat va hujjatlar**ni oldin topshirish\n` +
      `5. Shubhali joylarda rasmiy **savol-javob** kanalidan foydalanish\n\n` +
      `Ilovada aniq tenderni tanlab **Strategiya** va **taqqoslash** funksiyalaridan ham foydalaning.`;
  }

  return (
    'Men **tender va davlat xaridlari** bo\'yicha yordam berishga mo\'ljallanganman. Hozir **Gemini API** ulangan emas, shuning uchun javoblarim **cheklangan shablon** asosida.\n\n' +
    '**Siz yozishingiz mumkin:**\n' +
    '• "Tender nima va qanday ishlaydi?"\n' +
    '• "Boshlang\'ich uchun qadam-baqadam tushuntir"\n' +
    '• "Narx, hujjat, strategiya haqida maslahat"\n\n' +
    '**To\'liq erkin suhbat** uchun loyiha ildizida `.env` faylida `GEMINI_API_KEY=...` qo\'ying va serverni qayta ishga tushiring.\n\n' +
    `Savolingiz: _"${message.slice(0, 200)}${message.length > 200 ? '…' : ''}"_ — yuqoridagi mavzulardan birini tanlang yoki savolni aniqroq yozing.`
  );
}

// ── AI TENDER RECOMMENDATION ────────────────────────────────────────
app.use('/api/ai/recommend', aiLimiter);
app.post('/api/ai/recommend', async (req, res) => {
  const { company, experience, soha, hudud } = req.body;

  const candidatesResult = await tenderRepository.list({ soha, hudud, sort: 'probability', limit: 50 });
  const candidates = candidatesResult.items;
  const top5 = candidates.slice(0, 5);

  if (!isGeminiConfigured()) {
    // Fallback: return smart recommendations without AI
    const recommendations = top5.map(t => {
      const daysLeft = Math.ceil((new Date(t.deadline) - new Date()) / 86400000);
      const expYears = parseInt(experience) || 3;
      let score = t.probability;
      if (expYears >= 5) score = Math.min(100, score + 8);
      if (t.competitors <= 5) score = Math.min(100, score + 5);
      if (daysLeft > 20) score = Math.min(100, score + 3);

      return {
        tenderId: t.id,
        title: t.title,
        score,
        reason: `G'alaba ehtimoli ${t.probability}%, raqiblar ${t.competitors} ta, muddat ${daysLeft} kun. ${t.competitors <= 4 ? 'Kam raqib — kuchli imkoniyat!' : ''} ${score >= 80 ? '⭐ Yuqori tavsiya!' : ''}`.trim(),
        tips: [
          `Narxni ${Math.round(t.budgetRaw * 0.88 / 1e6)} mln so'm atrofida belgilang`,
          t.requirements?.[0] ? `"${t.requirements[0]}" talabiga javob bering` : 'Texnik taklifni batafsil yozing',
          daysLeft < 15 ? '⚠️ Muddatga oz qoldi, shoshiling!' : 'Hujjatlarni muddatdan 3 kun oldin topshiring',
        ],
        budget: t.budget,
        competitors: t.competitors,
        deadline: t.deadline,
        probability: t.probability,
        soha: t.soha,
      };
    });

    return res.json({
      success: true,
      aiGenerated: false,
      recommendations,
      summary: `${candidates.length} ta mos tender topildi. Eng yuqori g'alaba ehtimoli: ${top5[0]?.probability || 0}%.`
    });
  }

  // AI-powered recommendations
  const prompt = `O'zbekiston davlat xaridlari bo'yicha ekspert sifatida quyidagi kompaniya uchun eng mos 5 ta tenderni tavsiya qil va har biri uchun sabab va maslahat ber.

Kompaniya: ${company || 'Noma\'lum'}
Tajriba: ${experience || 'Noma\'lum'} yil
${soha && soha !== 'all' ? `Soha: ${soha}` : ''}
${hudud && hudud !== 'all' ? `Hudud: ${hudud}` : ''}

Mavjud tenderlar:
${top5.map((t, i) => `${i + 1}. ID: ${t.id}, "${t.title}", Byudjet: ${t.budget}, Raqiblar: ${t.competitors}, Ehtimol: ${t.probability}%, Muddat: ${t.deadline}, Talablar: ${(t.requirements || []).join(', ')}`).join('\n')}

JSON formatda qaytяr (faqat JSON):
{
  "recommendations": [
    {
      "tenderId": "...",
      "score": 85,
      "reason": "Nima uchun bu tender mos - 1-2 jumlada",
      "tips": ["Maslahat 1", "Maslahat 2", "Maslahat 3"]
    }
  ],
  "summary": "Umumiy xulosa - 1-2 jumla"
}`;

  try {
    const rawText = await geminiGenerate(prompt, null, 'gemini-1.5-flash');
    let parsed;
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : rawText);
    } catch {
      // Fallback to simple recommendation
      parsed = { recommendations: top5.map(t => ({ tenderId: t.id, score: t.probability, reason: 'AI tahlil qildi', tips: ['Texnik taklifni yaxshi tayyorlang'] })), summary: 'AI tahlili' };
    }

    // Enrich with tender data
    parsed.recommendations = (parsed.recommendations || []).map(rec => {
      const tender = candidates.find(t => t.id === rec.tenderId);
      if (tender) {
        rec.title = tender.title;
        rec.budget = tender.budget;
        rec.competitors = tender.competitors;
        rec.deadline = tender.deadline;
        rec.probability = tender.probability;
        rec.soha = tender.soha;
      }
      return rec;
    });

    res.json({ success: true, aiGenerated: true, ...parsed });
  } catch (err) {
    logger.error('AI recommend error', err);
    // Return fallback
    const recommendations = top5.map(t => ({
      tenderId: t.id, title: t.title, score: t.probability,
      reason: `G'alaba ehtimoli ${t.probability}%, raqiblar ${t.competitors} ta`,
      tips: ['Texnik taklifni batafsil yozing'], budget: t.budget,
      competitors: t.competitors, deadline: t.deadline, probability: t.probability, soha: t.soha,
    }));
    res.json({ success: true, aiGenerated: false, recommendations, summary: 'Avtomat tahlil' });
  }
});

// ── ERROR HANDLERS ──────────────────────────────────────────────────
// 404 Handler
app.use((req, res) => {
  res.status(404).json({ error: 'Sahifa topilmadi', path: req.path });
});

// Global Error Handler
app.use((err, req, res, next) => {
  logger.error('Server Error', err);
  res.status(err.status || 500).json({
    error: err.message || 'Server xatosi',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// ── START ────────────────────────────────────────────────────────────

// QO'SHIMCHA #9: Startup validatsiya — muhim konfiguratsiyalarni tekshirish
function validateStartupConfig() {
  const warnings = [];
  const errors = [];

  // API kalit tekshiruvi
  if (!isGeminiConfigured()) {
    warnings.push('GEMINI_API_KEY sozlanmagan — AI funksiyalar ishlamaydi');
  }
  // JWT Secret tekshiruvi — literal string '​tendermind-super-secret-key-change-in-production' xavfli
  const UNSAFE_JWT_SECRETS = [
    'tendermind-super-secret-key-change-in-production',
    'tendermind-dev-only-unsafe-secret',
    'secret',
    'password',
    'jwt_secret',
  ];
  const currentSecret = process.env.JWT_SECRET || '';
  if (UNSAFE_JWT_SECRETS.includes(currentSecret)) {
    if (isProd) errors.push('JWT_SECRET xavfli default qiymatda — JUDA XAVFLI! Render dashboard da o\'zgartiring.');
    else warnings.push('JWT_SECRET standart qiymatda — productiondan oldin o\'zgartiring');
  }
  // NODE_ENV tekshiruvi
  if (!process.env.NODE_ENV) {
    warnings.push('NODE_ENV o\'rnatilmagan — development deb qabul qilinadi');
  }

  warnings.forEach(w => logger.warn(w));
  errors.forEach(e => logger.error(e));

  // Kritik xatolar bo'lsa serverni to'xtatish
  if (errors.length > 0) {
    logger.error('Kritik konfiguratsiya xatolari. Server to\'xtatildi.');
    process.exit(1);
  }
}

async function startServer() {
  validateStartupConfig();
  const connection = await connectDB();
  if (connection) {
    try {
      await tenderRepository.ensureSeeded();
    } catch (err) {
      logger.error('Tender seed error', err);
    }
  }

  const server = app.listen(PORT, config.host, async () => {
    logger.info(`TenderMind Server — http://localhost:${PORT}`);
    logger.info(`AI: ${isGeminiConfigured() ? `✅ ${aiManager.providerName()} ulandi` : '❌ AI API key kiriting'}`);
    logger.info(`Mode: ${process.env.NODE_ENV || 'development'}`);
    logger.info(`MongoDB: ${isDBConnected() ? '✅ ulandi' : '❌ ulanmagan'}`);
    if (isDBConnected()) logger.info(`Tenderlar: ${await tenderRepository.count()} ta ma'lumot bazada`);
  });

  return server;
}

if (require.main === module) {
  startServer().catch(err => {
    logger.error('Startup error', err);
    process.exit(1);
  });
}

module.exports = { app, startServer };

// Graceful shutdown — SIGTERM va SIGINT signallarini ushlash
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal — server yopilmoqda...');
  process.exit(0);
});
process.on('SIGINT', () => {
  logger.info('SIGINT signal — server yopilmoqda...');
  process.exit(0);
});
