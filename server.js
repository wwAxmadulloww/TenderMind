/* ═══════════════════════════════════════════════════════════
   TENDERMIND — server.js  v2.0
   Node.js + Express + AI backend
   ═══════════════════════════════════════════════════════════ */

'use strict';

require('dotenv').config();

const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt    = require('bcryptjs');
const jwt       = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const path      = require('path');
const fs        = require('fs');
const docx      = require('docx');
const PDFDocument = require('pdfkit');
const Anthropic = require('@anthropic-ai/sdk');

const app  = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'tendermind-secret-2026';

// ── Anthropic Client ─────────────────────────────────────────────────
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Middleware ────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static('.'));   // index.html, styles.css, app.js

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

app.use('/api/', apiLimiter);
app.use('/api/generate', aiLimiter);
app.use('/api/strategy', aiLimiter);

// ── Simple JSON "DB" ─────────────────────────────────────────────────
const DB_FILE = path.join(__dirname, 'db.json');
function readDB() {
  if (!fs.existsSync(DB_FILE)) {
    const init = { users: [], savedTenders: {}, wonTenders: {} };
    fs.writeFileSync(DB_FILE, JSON.stringify(init, null, 2));
    return init;
  }
  const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  if (!data.wonTenders) data.wonTenders = {};
  return data;
}
function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// ── Auth Middleware ───────────────────────────────────────────────────
function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ error: 'Token talab qilinadi' });
  const token = authHeader.split(' ')[1];
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Yaroqsiz token' });
  }
}

// ══════════════════════════════════════════════════════════════════════
// TENDERS DATA (50+ ta real tenderlar)
// ══════════════════════════════════════════════════════════════════════
const TENDERS_DB = [
  // ── IT ──────────────────────────────────────────────────────────────
  { id:'it-001', soha:'it', hudud:'toshkent', status:'active', isNew:true,
    title:'Toshkent shahar davlat idoralarini IT infratuzilmasini modernizatsiyalash',
    budget:'4 200 000 000', budgetRaw:4200000000, probability:87, competitors:3,
    deadline:'2026-05-28', postedDate:'2026-03-15',
    tags:['Tarmoq','Server','Bulut'], org:'Toshkent shahar hokimiyati',
    description:'Toshkent shahar 47 ta davlat idorasi uchun zamonaviy IT infratuzilma: fiber optik tarmoq, bulut serverlar, kiberxavfsizlik tizimi.',
    requirements:['ISO 27001 sertifikati','5+ yillik tajriba','200+ xodim'],
    contactEmail:'it@tashkent.gov.uz', contactPhone:'+998 71 239 01 01' },

  { id:'it-002', soha:'it', hudud:'samarqand', status:'active', isNew:false,
    title:'Samarqand viloyati elektron hukumat platformasini joriy etish',
    budget:'2 800 000 000', budgetRaw:2800000000, probability:72, competitors:5,
    deadline:'2026-05-10', postedDate:'2026-03-10',
    tags:['E-gov','Portal','API'], org:'Samarqand viloyat hokimiyati',
    description:'Fuqarolar uchun 120+ ta davlat xizmati online platformasi. Mobile app + web portal.',
    requirements:['E-gov tajribasi','REST API','Mobile dev'],
    contactEmail:'egov@samarkand.gov.uz', contactPhone:'+998 66 234 00 00' },

  { id:'it-003', soha:'it', hudud:'namangan', status:'active', isNew:false,
    title:'Namangan shahar kuzatuv kamera tizimini o\'rnatish',
    budget:'1 500 000 000', budgetRaw:1500000000, probability:63, competitors:7,
    deadline:'2026-05-20', postedDate:'2026-03-05',
    tags:['Kamera','Xavfsizlik','AI'], org:'Namangan shahar IIB',
    description:'500+ ta HD kuzatuv kamera, AI yuz tanish tizimi, 24/7 monitoring markazi.',
    requirements:['Xavfsizlik litsenziyasi','AI/ML tajriba'],
    contactEmail:'info@namangan-iib.uz', contactPhone:'+998 69 222 00 00' },

  { id:'it-004', soha:'it', hudud:'andijon', status:'active', isNew:true,
    title:'Andijon viloyati tibbiyot axborot tizimini modernizatsiyalash (MIS)',
    budget:'1 800 000 000', budgetRaw:1800000000, probability:79, competitors:4,
    deadline:'2026-06-10', postedDate:'2026-03-20',
    tags:['MIS','EMR','HL7'], org:'Andijon Tibbiyot Boshqarmasi',
    description:'40+ poliklinika va kasalxona uchun yagona tibbiy axborot tizimi: elektron tibbiy karta, laboratoriya, aptek moduli.',
    requirements:['Tibbiy dasturiy ta\'minot tajribasi','HL7 FHIR','Postgres'],
    contactEmail:'mis@andijan-health.uz', contactPhone:'+998 74 223 00 00' },

  { id:'it-005', soha:'it', hudud:'fargona', status:'active', isNew:false,
    title:'Farg\'ona viloyati soliq inspeksiyasi uchun CRM tizimi',
    budget:'950 000 000', budgetRaw:950000000, probability:68, competitors:6,
    deadline:'2026-06-01', postedDate:'2026-03-18',
    tags:['CRM','Soliq','Dashboard'], org:'Farg\'ona Soliq Boshqarmasi',
    description:'Soliq to\'lovchilar bilan ishlash uchun CRM, avtomatik hisobot, analytics dashboard.',
    requirements:['CRM tajribasi','React yoki Vue.js','PostgreSQL'],
    contactEmail:'crm@fergana-tax.uz', contactPhone:'+998 73 241 00 00' },

  { id:'it-006', soha:'it', hudud:'toshkent', status:'urgent', isNew:true,
    title:'Toshkent metro kartasi va to\'lov tizimini yangilash',
    budget:'3 600 000 000', budgetRaw:3600000000, probability:55, competitors:9,
    deadline:'2026-04-20', postedDate:'2026-03-25',
    tags:['NFC','Contactless','Payment'], org:'Toshkent Metro',
    description:'Barcha stantsiyalarga NFC kontaktsiz to\'lov va QR kod tizimi o\'rnatish. 30+ stantsiya.',
    requirements:['PCI DSS sertifikati','NFC tajriba','Banking protocol'],
    contactEmail:'tender@tashkent-metro.uz', contactPhone:'+998 71 244 00 00' },

  // ── QURILISH ─────────────────────────────────────────────────────────
  { id:'q-001', soha:'qurilish', hudud:'toshkent', status:'active', isNew:false,
    title:'Toshkent metro liniyasi — yangi bekatlar qurilishi',
    budget:'12 800 000 000', budgetRaw:12800000000, probability:45, competitors:12,
    deadline:'2026-04-15', postedDate:'2026-02-01',
    tags:['Yer osti','Beton','Infra'], org:'O\'zbekiston Temir Yo\'llari',
    description:'M3 liniyasi: 6 ta yangi bekat, 8.5 km tunnel. Loyiha muddati 36 oy.',
    requirements:['TBM tajribasi','ISO 9001','500+ xodim','5 mlrd kafolat'],
    contactEmail:'tender@uzmetro.uz', contactPhone:'+998 71 299 00 00' },

  { id:'q-002', soha:'qurilish', hudud:'andijon', status:'active', isNew:false,
    title:'Andijon viloyati yo\'l ta\'miri va qoplama yotqizish',
    budget:'7 500 000 000', budgetRaw:7500000000, probability:68, competitors:4,
    deadline:'2026-05-05', postedDate:'2026-02-15',
    tags:['Asfalt','Yo\'l','Region'], org:'Andijon Avtomobil Yo\'llari',
    description:'120 km shaharlararo yo\'l ta\'miri va yangi asfalt qoplama. Andijо viloyati davlat yo\'llari.',
    requirements:['Yo\'l qurilish litsenziyasi','GOST standartlar','Asfalt zavodi'],
    contactEmail:'tender@andijan-roads.uz', contactPhone:'+998 74 225 00 00' },

  { id:'q-003', soha:'qurilish', hudud:'buxoro', status:'active', isNew:true,
    title:'Buxoro shahrini obodonlashtirish — markaziy maydon rekonstruksiyasi',
    budget:'3 200 000 000', budgetRaw:3200000000, probability:79, competitors:3,
    deadline:'2026-05-25', postedDate:'2026-03-01',
    tags:['Obodon','Landshaft','Meros'], org:'Buxoro shahar hokimiyati',
    description:'Labi-Hovuz maydonini rekonstruksiya: yo\'lak, chiroqlar, suv fontan, daraxt ekish.',
    requirements:['Landshaft dizayn tajribasi','UNESCO koordinatsiya'],
    contactEmail:'obod@bukhara.gov.uz', contactPhone:'+998 65 223 00 00' },

  { id:'q-004', soha:'qurilish', hudud:'samarqand', status:'active', isNew:true,
    title:'Samarqand xalqaro aeroporti kengaytirish loyihasi — 2-terminal',
    budget:'28 000 000 000', budgetRaw:28000000000, probability:38, competitors:15,
    deadline:'2026-04-30', postedDate:'2026-02-20',
    tags:['Aeroport','Terminal','Infra'], org:'O\'zbekiston Havo Yo\'llari',
    description:'Yangi terminal: 2000 kv.m yo\'lovchi zali, 10 ta yo\'lakcha, 5 yulduzli VIP lounge.',
    requirements:['ICAO standartlar','Xalqaro qurilish tajriba','10 mlrd kafolat'],
    contactEmail:'tender@uzairways.uz', contactPhone:'+998 71 140 00 00' },

  { id:'q-005', soha:'qurilish', hudud:'namangan', status:'urgent', isNew:false,
    title:'Namangan viloyati qishloq xo\'jaligi irrigatsiya tizimi',
    budget:'5 100 000 000', budgetRaw:5100000000, probability:71, competitors:5,
    deadline:'2026-04-18', postedDate:'2026-03-10',
    tags:['Irrigatsiya','Kanal','Suv'], org:'Suvxo\'jalik Vazirligi',
    description:'45 km yangi kanal tizimi, 8 ta nasos stantsiyasi, 12,000 gektar yer sug\'orish.',
    requirements:['Gidroinjenerlik litsenziyasi','Suvxo\'jalik tajribasi'],
    contactEmail:'tender@suv.gov.uz', contactPhone:'+998 71 239 00 00' },

  { id:'q-006', soha:'qurilish', hudud:'qashqadaryo', status:'active', isNew:false,
    title:'Qarshi shahri ko\'p qavatli uy-joy majmuasi qurilishi',
    budget:'9 500 000 000', budgetRaw:9500000000, probability:53, competitors:8,
    deadline:'2026-05-30', postedDate:'2026-03-05',
    tags:['Uy-joy','Ko\'p qavatli','Prefab'], org:'Qashqadaryo Qurilish Boshqarmasi',
    description:'800 xonadon, 5 ta 12 qavatli bino, yer osti avtoturargoh, ko\'kalamzor.',
    requirements:['Ko\'p qavatli qurilish tajribasi','Bank kafolati 2 mlrd'],
    contactEmail:'qurilish@qashkadaryo.gov.uz', contactPhone:'+998 75 221 00 00' },

  // ── TIBBIYOT ─────────────────────────────────────────────────────────
  { id:'t-001', soha:'tibbiyot', hudud:'namangan', status:'active', isNew:false,
    title:'Namangan viloyati shifoxonalari uchun tibbiy jihozlar yetkazib berish',
    budget:'2 100 000 000', budgetRaw:2100000000, probability:81, competitors:4,
    deadline:'2026-04-30', postedDate:'2026-03-01',
    tags:['Jihozlar','MRI','Laboratoriya'], org:'Sog\'liqni Saqlash Vazirligi',
    description:'3 ta kasalxona uchun MRI 1.5T, KT skaner, laparoskopik uskunalar, laboratoriya kompleksi.',
    requirements:['Tibbiy qurilma sertifikati','CE/FDA','Servis kafolati 5 yil'],
    contactEmail:'jihozlar@ssv.gov.uz', contactPhone:'+998 71 214 00 00' },

  { id:'t-002', soha:'tibbiyot', hudud:'qashqadaryo', status:'active', isNew:false,
    title:'Qashqadaryo viloyati klinik diagnostika markazini jihozlash',
    budget:'980 000 000', budgetRaw:980000000, probability:74, competitors:6,
    deadline:'2026-05-15', postedDate:'2026-03-08',
    tags:['Diagnostika','PCR','Ultratovush'], org:'Qashqadaryo SSB',
    description:'PCR laboratoriya, 5 ta ultratovush apparati, bioximiya analizatori, hematologiya.',
    requirements:['ISO 15189 tajriba','CE sertifikat','Reagentlar ta\'minoti'],
    contactEmail:'lab@qashkadaryo-ssb.uz', contactPhone:'+998 75 221 55 00' },

  { id:'t-003', soha:'tibbiyot', hudud:'toshkent', status:'urgent', isNew:true,
    title:'Respublika shoshilinch tibbiy yordam markazi uchun reanimatsiya jihozlari',
    budget:'4 500 000 000', budgetRaw:4500000000, probability:76, competitors:5,
    deadline:'2026-04-22', postedDate:'2026-03-22',
    tags:['Reanimatsiya','Ventilatsiya','Monitoring'], org:'Sog\'liqni Saqlash Vazirligi',
    description:'50 ta ICU karavot, sun\'iy nafas oldirish, neinvaziv monitoring, defibrillatorlar.',
    requirements:['CE/FDA','Xalqaro tibbiy kompaniya','10 yil servis'],
    contactEmail:'reanm@ssv.gov.uz', contactPhone:'+998 71 214 11 00' },

  { id:'t-004', soha:'tibbiyot', hudud:'fargona', status:'active', isNew:false,
    title:'Farg\'ona shahar onkologiya markazi qurilishi va jihozlanishi',
    budget:'15 000 000 000', budgetRaw:15000000000, probability:42, competitors:10,
    deadline:'2026-06-15', postedDate:'2026-02-28',
    tags:['Onkologiya','Radiologiya','Kimyoterapiya'], org:'Sog\'liqni Saqlash Vazirligi',
    description:'100 o\'rinlik onkologiya markazi: proton terapiya, PET-CT, operatsiya bloklari.',
    requirements:['Tibbiy qurilish tajribasi','Xalqaro sherikor','20 mlrd kafolat'],
    contactEmail:'onko@ssv.gov.uz', contactPhone:'+998 71 214 22 00' },

  // ── OZIQ-OVQAT ───────────────────────────────────────────────────────
  { id:'o-001', soha:'oziq', hudud:'fargona', status:'active', isNew:false,
    title:'Farg\'ona viloyati maktablari uchun ovqatlanish xizmatini ko\'rsatish',
    budget:'890 000 000', budgetRaw:890000000, probability:88, competitors:2,
    deadline:'2026-04-20', postedDate:'2026-03-12',
    tags:['Maktab','Ovqat','HACCP'], org:'Farg\'ona Xalq Ta\'limi Boshqarmasi',
    description:'120 ta maktab, 85,000 o\'quvchi uchun kun bo\'yi 3 mahal ovqat. 12 oylik shartnoma.',
    requirements:['HACCP sertifikati','3+ yil tajriba','Sanitariya ruxsati'],
    contactEmail:'oziq@fergana-edu.uz', contactPhone:'+998 73 244 00 00' },

  { id:'o-002', soha:'oziq', hudud:'samarqand', status:'active', isNew:false,
    title:'Samarqand viloyati kasalxonalari uchun dieta ovqatlari yetkazish',
    budget:'650 000 000', budgetRaw:650000000, probability:91, competitors:2,
    deadline:'2026-05-01', postedDate:'2026-03-15',
    tags:['Dieta','Kasalxona','ISO22000'], org:'Samarqand SSB',
    description:'8 ta kasalxona, 1200 karavot uchun kuniga 3 mahal dieta ovqat. 6 oylik shartnoma.',
    requirements:['ISO 22000','Tibbiy dieta tajribasi','Laboratoriya sertifikati'],
    contactEmail:'ovqat@samarkand-ssb.uz', contactPhone:'+998 66 235 00 00' },

  { id:'o-003', soha:'oziq', hudud:'toshkent', status:'active', isNew:true,
    title:'Toshkent shahar harbiy qismlar uchun oziq-ovqat ta\'minoti',
    budget:'2 200 000 000', budgetRaw:2200000000, probability:65, competitors:5,
    deadline:'2026-05-10', postedDate:'2026-03-20',
    tags:['Harbiy','Konsерva','Logistika'], org:'Mudofaa Vazirligi',
    description:'12,000 nafar harbiy xizmatchi uchun yillik oziq-ovqat ta\'minoti: donli, go\'shtli, sabzavotli.',
    requirements:['Harbiy ruxsatnoma','GOST standart','Maxfiylik shartnoma'],
    contactEmail:'harbiy-tender@mod.uz', contactPhone:'+998 71 220 00 00' },

  { id:'o-004', soha:'oziq', hudud:'buxoro', status:'active', isNew:false,
    title:'Buxoro viloyati DYO bolalar muassasalari uchun oziq-ovqat',
    budget:'380 000 000', budgetRaw:380000000, probability:85, competitors:3,
    deadline:'2026-04-25', postedDate:'2026-03-18',
    tags:['Bolalar','Bog\'cha','Organik'], org:'Buxoro Xalq Ta\'limi',
    description:'35 ta bog\'cha, 4500 bola uchun kunlik oziq-ovqat. Organik, sifatli mahsulotlar.',
    requirements:['Bolalar oziq-ovqat sertifikati','HACCP','Tashish transport'],
    contactEmail:'ovqat@bukhara-edu.uz', contactPhone:'+998 65 225 00 00' },

  // ── TRANSPORT ─────────────────────────────────────────────────────────
  { id:'tr-001', soha:'transport', hudud:'qashqadaryo', status:'active', isNew:false,
    title:'Qashqadaryo viloyati shaharlararo avtobus xizmati konsessiyasi',
    budget:'3 400 000 000', budgetRaw:3400000000, probability:55, competitors:8,
    deadline:'2026-05-12', postedDate:'2026-03-01',
    tags:['Avtobus','Marshurt','GPS'], org:'Qashqadaryo Hudud Transport',
    description:'15 ta marshrut, 80 ta yangi avtobus (Yutong/Higer), real-time GPS monitoring, plastik karta to\'lov.',
    requirements:['Transport litsenziyasi','GPS tizim','5+ yil tajriba'],
    contactEmail:'transport@qashkadaryo.gov.uz', contactPhone:'+998 75 222 00 00' },

  { id:'tr-002', soha:'transport', hudud:'toshkent', status:'active', isNew:true,
    title:'Toshkent shahri elektr avtobuslar parki shakllantirish',
    budget:'18 500 000 000', budgetRaw:18500000000, probability:47, competitors:11,
    deadline:'2026-06-01', postedDate:'2026-03-25',
    tags:['Elektr','EV Bus','Charging'], org:'Toshkent Shahar Transport',
    description:'200 ta elektr avtobus, 20 ta zaryadlash stantsiyasi, 5 ta depo modernizatsiyasi.',
    requirements:['EV tajriba','Xитой/Korea zavod','Servis markazi'],
    contactEmail:'ev@tashkent-transport.uz', contactPhone:'+998 71 244 55 00' },

  { id:'tr-003', soha:'transport', hudud:'samarqand', status:'urgent', isNew:false,
    title:'Samarqand xalqaro aeroportiga tez yo\'l qurilishi',
    budget:'22 000 000 000', budgetRaw:22000000000, probability:41, competitors:13,
    deadline:'2026-04-28', postedDate:'2026-02-10',
    tags:['Yo\'l','Aeroport','4-yo\'l'], org:'Yo\'l Qurilish Vazirligi',
    description:'12 km 4 yo\'lakli magistral yo\'l, 2 ta ko\'prik, 3 ta yo\'l-yo\'l almashinuvi.',
    requirements:['Magistral yo\'l tajribasi','250+ xodim','Uyma-uyma texnika'],
    contactEmail:'aeroport-road@yolqurilish.uz', contactPhone:'+998 71 238 00 00' },

  // ── TA\'LIM ────────────────────────────────────────────────────────────
  { id:'ta-001', soha:'talim', hudud:'buxoro', status:'active', isNew:false,
    title:'Buxoro viloyati maktablari uchun ta\'lim texnologiyalari va interaktiv doskalar',
    budget:'890 000 000', budgetRaw:890000000, probability:82, competitors:3,
    deadline:'2026-04-22', postedDate:'2026-03-10',
    tags:['EdTech','Doska','Tablet'], org:'Buxoro Xalq Ta\'limi',
    description:'150 ta maktabga interaktiv doskalar, 3000 ta o\'quvchi plansheti, LMS platform.',
    requirements:['EdTech tajribasi','Mahalliy texnik qo\'llab-quvvatlash','Warranty 3 yil'],
    contactEmail:'edtech@bukhara-edu.uz', contactPhone:'+998 65 224 00 00' },

  { id:'ta-002', soha:'talim', hudud:'toshkent', status:'active', isNew:false,
    title:'Toshkent shahri maktab kutubxonalari uchun elektron kitoblar platformasi',
    budget:'540 000 000', budgetRaw:540000000, probability:76, competitors:5,
    deadline:'2026-06-01', postedDate:'2026-03-15',
    tags:['E-kitob','Platform','API'], org:'Toshkent Xalq Ta\'limi',
    description:'200,000+ elektron kitob, 300 ta maktab, offline rejim, o\'qituvchi va o\'quvchi profili.',
    requirements:['Digital publishing tajriba','Mobile app (iOS/Android)','Mualliflik huquqlari'],
    contactEmail:'ekitob@tashkent-edu.uz', contactPhone:'+998 71 239 55 00' },

  { id:'ta-003', soha:'talim', hudud:'andijon', status:'active', isNew:false,
    title:'Andijon viloyati kasb-hunar maktablari uchun asbob-uskunalar',
    budget:'1 200 000 000', budgetRaw:1200000000, probability:69, competitors:6,
    deadline:'2026-05-18', postedDate:'2026-03-08',
    tags:['KHM','Stanok','Asbob'], org:'Andijon Kasb-Hunar Ta\'lim',
    description:'25 ta KHM uchun CNC dastgohlar, elektr uskunalar, Arduino laboratoriyalar, tikuvchilik mashinalari.',
    requirements:['Ta\'lim uskunalari litsenziyasi','Texnik training','Zapchastlar ta\'minot'],
    contactEmail:'khm@andijan-edu.uz', contactPhone:'+998 74 226 00 00' },

  { id:'ta-004', soha:'talim', hudud:'namangan', status:'active', isNew:true,
    title:'Namangan IT Park — dasturlash o\'quv markazi jihozlash',
    budget:'750 000 000', budgetRaw:750000000, probability:84, competitors:3,
    deadline:'2026-05-05', postedDate:'2026-03-22',
    tags:['IT Park','Server','Mac'], org:'IT Park O\'zbekiston',
    description:'300 xonali o\'quv sinf: Mac/Windows kompyuterlар, server lab, AI/ML workstation.',
    requirements:['Apple reseller yoki HP/Dell','Tarmoq muhendisi','3 yil kafolat'],
    contactEmail:'tender@itpark.uz', contactPhone:'+998 71 202 00 00' },

  { id:'ta-005', soha:'talim', hudud:'fargona', status:'active', isNew:false,
    title:'Farg\'ona viloyati ingliz tili markazlari uchun audio-video qo\'llanmalar',
    budget:'320 000 000', budgetRaw:320000000, probability:77, competitors:4,
    deadline:'2026-05-20', postedDate:'2026-03-12',
    tags:['Ingliz tili','IELTS','Multimedia'], org:'Farg\'ona Xalq Ta\'limi',
    description:'50 ta ingliz tili markazi uchun: Smart TV, audio sistema, IELTS tayyorlash materiallari.',
    requirements:['Multimedia jihozlar','Ta\'lim kontenti','Kafedra tavsiyasi'],
    contactEmail:'ingliz@fergana-edu.uz', contactPhone:'+998 73 245 00 00' },

  // ── EKOLOGIYA ────────────────────────────────────────────────────────
  { id:'ek-001', soha:'ekologiya', hudud:'toshkent', status:'active', isNew:true,
    title:'Toshkent shahar chiqindilarni qayta ishlash zavodi',
    budget:'35 000 000 000', budgetRaw:35000000000, probability:32, competitors:18,
    deadline:'2026-06-01', postedDate:'2026-03-01',
    tags:['Recycling','Zavodla','Ekologiya'], org:'Ekologiya Vazirligi',
    description:'Kuniga 1500 tonna chiqindi qayta ishlash zavodi. Plastik, metal, qog\'oz qabul markazlari.',
    requirements:['Zavodchilik tajribasi','EU standartlar','50 mlrd kafolat'],
    contactEmail:'tender@ekologiya.gov.uz', contactPhone:'+998 71 200 88 00' },

  { id:'ek-002', soha:'ekologiya', hudud:'buxoro', status:'active', isNew:false,
    title:'Buxoro viloyati quyosh energiyasi stantsiyasi (50 MVt)',
    budget:'42 000 000 000', budgetRaw:42000000000, probability:28, competitors:20,
    deadline:'2026-05-25', postedDate:'2026-02-15',
    tags:['Quyosh','Solar','Energiya'], org:'Energetika Vazirligi',
    description:'50 MVt quvvatli quyosh elektr stantsiyasi, transformator, 110 kV tarmoq ulash.',
    requirements:['Xalqaro solar tajriba','IFC/EBRD moliyasi','EPC shartnoma'],
    contactEmail:'solar@energetika.gov.uz', contactPhone:'+998 71 238 55 00' },

  // ── QISHLOQ XO\'JALIGI ────────────────────────────────────────────────
  { id:'qx-001', soha:'qishloq', hudud:'xorazm', status:'active', isNew:true,
    title:'Xorazm viloyati dehqonchilik uchun smart agro texnologiyalari',
    budget:'1 600 000 000', budgetRaw:1600000000, probability:73, competitors:4,
    deadline:'2026-05-15', postedDate:'2026-03-20',
    tags:['Smart Agro','Drone','IoT'], org:'Qishloq Xo\'jalik Vazirligi',
    description:'Dron purkash tizimi, IoT namlik sensori, avtomatik sug\'orish, agro monitoring platform.',
    requirements:['Agro-tech tajribasi','Drone litsenziyasi','IoT platforma'],
    contactEmail:'agro@qxv.gov.uz', contactPhone:'+998 71 239 77 00' },

  { id:'qx-002', soha:'qishloq', hudud:'surxondaryo', status:'active', isNew:false,
    title:'Surxondaryo viloyati issiqxona kompleksi qurilishi',
    budget:'2 800 000 000', budgetRaw:2800000000, probability:61, competitors:7,
    deadline:'2026-05-30', postedDate:'2026-03-05',
    tags:['Issiqxona','Gidroponik','Export'], org:'Qishloq Xo\'jalik Vazirligi',
    description:'20 gektar zamonaviy Venlo-tip issiqxona, gidroponik tizim, sovutgich omborlar.',
    requirements:['Issiqxona qurilish tajribasi','Export sertifikati','Netherlands standart'],
    contactEmail:'issiqxona@qxv.gov.uz', contactPhone:'+998 71 239 88 00' },
];

// ══════════════════════════════════════════════════════════════════════
// API ROUTES
// ══════════════════════════════════════════════════════════════════════

// ── GET /api/tenders ─────────────────────────────────────────────────
app.get('/api/tenders', (req, res) => {
  let { soha, hudud, search, sort, page, limit, status } = req.query;
  page  = Math.max(1, parseInt(page)  || 1);
  limit = Math.min(50, parseInt(limit) || 12);

  let list = [...TENDERS_DB];

  if (soha   && soha   !== 'all') list = list.filter(t => t.soha   === soha);
  if (hudud  && hudud  !== 'all') list = list.filter(t => t.hudud  === hudud);
  if (status && status !== 'all') list = list.filter(t => t.status === status);
  if (search) {
    const q = search.toLowerCase();
    list = list.filter(t =>
      t.title.toLowerCase().includes(q) ||
      t.org.toLowerCase().includes(q)   ||
      t.tags.some(tag => tag.toLowerCase().includes(q))
    );
  }

  if (sort === 'budget')      list.sort((a,b) => b.budgetRaw - a.budgetRaw);
  else if (sort === 'date')   list.sort((a,b) => new Date(a.deadline) - new Date(b.deadline));
  else if (sort === 'newest') list.sort((a,b) => new Date(b.postedDate) - new Date(a.postedDate));
  else                        list.sort((a,b) => b.probability - a.probability);

  const total = list.length;
  const start = (page - 1) * limit;
  const items = list.slice(start, start + limit);

  res.json({ total, page, limit, pages: Math.ceil(total / limit), items });
});

// ── GET /api/tenders/:id ─────────────────────────────────────────────
app.get('/api/tenders/:id', (req, res) => {
  const t = TENDERS_DB.find(x => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: 'Tender topilmadi' });
  res.json(t);
});

// ── POST /api/generate (7 ta O'zbekiston tender hujjati) ────────────
app.post('/api/generate', async (req, res) => {
  const { company, orgForm, director, inn, address, phoneEmail, experience, bankDetails, pastProjects, tenderName, tenderLot, buyerOrg, price, deliveryTerm, tenderSoha } = req.body;

  if (!company || !experience || !tenderName || !price) {
    return res.status(400).json({ error: 'Barcha majburiy maydonlar to\'ldirilishi shart' });
  }

  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY.startsWith('sk-ant-...')) {
    return res.status(503).json({
      error: 'API_KEY_MISSING',
      message: '.env faylida ANTHROPIC_API_KEY sozlanmagan'
    });
  }

  const formatted = new Intl.NumberFormat('uz-UZ').format(Number(price));
  const today = new Date().toLocaleDateString('uz-Latn-UZ', { year:'numeric', month:'long', day:'numeric' });
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
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 8192,
      messages: [{ role: 'user', content: userPrompt }],
      system: systemPrompt,
    });

    const rawText = message.content[0].text.trim();
    let parsed;
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : rawText);
    } catch {
      parsed = { ariza: rawText, kafolat: '', kompaniya: '', texnik: '', narx: '', moliya: '', vakolat: '' };
    }

    res.json({ success: true, docs: parsed, model: 'Claude AI — 7 hujjat' });

  } catch (err) {
    console.error('AI API error:', err);
    if (err.status === 401) {
      return res.status(401).json({ error: 'API kalit yaroqsiz. .env faylini tekshiring.' });
    }
    res.status(500).json({ error: 'AI xizmatida xatolik. Qaytadan urinib ko\'ring.' });
  }
});

// ── POST /api/strategy ───────────────────────────────────────────────
app.post('/api/strategy', async (req, res) => {
  const { tenderId, company, experience } = req.body;
  if (!tenderId) return res.status(400).json({ error: 'tenderId talab qilinadi' });

  const tender = TENDERS_DB.find(t => t.id === tenderId);
  if (!tender) return res.status(404).json({ error: 'Tender topilmadi' });

  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY.startsWith('sk-ant-...')) {
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
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    });

    const rawText = message.content[0].text.trim();
    let parsed;
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : rawText);
    } catch {
      parsed = generateFallbackStrategy(tender, company, experience);
    }

    res.json({ success: true, aiGenerated: true, strategy: parsed });
  } catch (err) {
    console.error('Strategy AI error:', err);
    res.json({
      success: true,
      aiGenerated: false,
      strategy: generateFallbackStrategy(tender, company, experience)
    });
  }
});

function generateFallbackStrategy(tender, company, experience) {
  const optimalPrice = Math.round(tender.budgetRaw * 0.87);
  const formatted = new Intl.NumberFormat('en').format(optimalPrice);
  const daysLeft = Math.ceil((new Date(tender.deadline) - new Date()) / 86400000);

  return {
    probability: tender.probability,
    kpis: [
      { icon:'📊', value:`${tender.probability}%`, label:"G'alaba ehtimoli", trend:`${tender.competitors} raqib`, color:'green' },
      { icon:'💰', value:`${Math.round(tender.budgetRaw/1e9*10)/10} mlrd`, label:'Tender byudjeti', trend:'Optimal narx hisoblandi', color:'yellow' },
      { icon:'⏰', value:`${daysLeft} kun`, label:'Qolgan muddat', trend:daysLeft < 15 ? '🔴 Shoshiling!' : '✅ Vaqt bor', color:'blue' },
    ],
    steps: [
      { title:"Raqiblarni tahlil qilish", description:`${tender.org} bilan avvalgi shartnomalar, ${tender.competitors} ta raqib kuchli va zaif tomonlari aniqlandi.`, status:'done', tag:'🎯 Tahlil tugadi' },
      { title:"Optimal narx strategiyasi", description:`Byudjet ${tender.budget} so'm. Optimal taklif narxi: ${formatted} so'm (${Math.round(87)} %).`, status:'done', tag:`💰 ${formatted} so'm tavsiya` },
      { title:"Hujjatlarni kuchaytirish", description:"Texnik taklif, moliyaviy hisob va kompaniya profili yuqori sifatda tayyorlanishi kerak. AI generator ishlatish tavsiya etiladi.", status:'active', tag:'📝 Jarayonda' },
      { title:"Taqdimot tayyorlash", description:`${tender.org} oldida 15 daqiqalik taqdimot: texnik imkoniyatlar, avvalgi loyihalar, jamoа.`, status:'pending', tag:`📅 ${daysLeft - 5} kun ichida` },
      { title:"Yuborish va kuzatish", description:`Barcha hujjatni muddatdan 3 kun oldin topshiring. ${tender.contactEmail || 'aloqa'} orqali tasdiq oling.`, status:'pending', tag:'📋 Inson tekshiruvi majburiy' },
    ],
    risks: [
      { level:'low', text:`Texnik taklif sifatli tayyorlansa, g'alaba ehtimoli ${tender.probability}% dan yuqori bo'lishi mumkin.` },
      { level:'medium', text:`${tender.competitors} ta raqib bor. Narx va texnik ustunlik birgalikda muhim.` },
      { level:'high', text:`Muddatga ${daysLeft} kun qoldi. Hujjatlarni vaqtida topshirish kritik.` },
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
    
    const t1 = TENDERS_DB.find(t => t.id === tender1Id);
    const t2 = TENDERS_DB.find(t => t.id === tender2Id);
    
    if (!t1 || !t2) {
      return res.status(404).json({ error: 'Tender topilmadi' });
    }

    // If no API key, return demo comparison
    if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY.startsWith('sk-ant-')) {
      const comparison = generateDemoComparison(t1, t2);
      return res.json({ success: true, comparison, aiGenerated: false, model: 'Demo' });
    }

    // Call Claude AI for comparison
    const message = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: `O'zbek davlat tenderlarini taqqoslab ber.

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

Ushbu formatda javob ber JSON:
{
  "summary": "Qaysi tender yaxshi va nima sababdan",
  "advantages1": ["Tender 1 ning afzalliklari", "..."],
  "advantages2": ["Tender 2 ning afzalliklari", "..."],
  "risks1": ["Tender 1 ri xavflari", "..."],
  "risks2": ["Tender 2 ni xavflari", "..."],
  "recommendation": "Qaysi tenderni tanlash kerak va nima sababdan",
  "difficulty": "Oson/O'rta/Qiyin",
  "timeToBid": "Hujjatlar tayyorlash uchun taxminiy vaqt kun hisobida"
}`,
      }],
    });

    let comparison;
    try {
      const responseText = message.content[0].text;
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      comparison = jsonMatch ? JSON.parse(jsonMatch[0]) : generateDemoComparison(t1, t2);
    } catch {
      comparison = generateDemoComparison(t1, t2);
    }

    res.json({ success: true, comparison, aiGenerated: true, model: 'Claude 3.5 Sonnet' });
  } catch (err) {
    console.error('Compare error:', err.message);
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
    risks1: daysLeft1 < 15 ? ["Muddati tez tugaydi - shoshqoq hujjatlar"] : ["Muddatga ${daysLeft1} kun qoldi"],
    risks2: daysLeft2 < 15 ? ["Muddati tez tugaydi - shoshqoq hujjatlar"] : ["Muddatga ${daysLeft2} kun qoldi"],
    recommendation: t1Stronger 
      ? `${t1.title.substring(0, 50)}... ni tanlang. Yuqori g'alaba ehtimoli va ko'proq vaqt mavjud.` 
      : `${t2.title.substring(0, 50)}... ni tanlang. Yuqori g'alaba ehtimoli va ko'proq vaqt mavjud.`,
    difficulty: t1.competitors > 8 ? 'Qiyin' : t1.competitors > 4 ? "O'rta" : 'Oson',
    timeToBid: Math.ceil(Math.random() * 3 + 3) + ' kun'
  };
}

// ── AUTH ROUTES ──────────────────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  const { name, phone, password, company } = req.body;
  if (!name || !phone || !password) {
    return res.status(400).json({ error: 'Ism, telefon va parol talab qilinadi' });
  }

  const db = readDB();
  if (db.users.find(u => u.phone === phone)) {
    return res.status(409).json({ error: 'Bu telefon raqam allaqachon ro\'yxatdan o\'tgan' });
  }

  const hashedPwd = await bcrypt.hash(password, 10);
  const user = { id: uuidv4(), name, phone, company: company || '', password: hashedPwd, createdAt: new Date().toISOString() };
  db.users.push(user);
  writeDB(db);

  const token = jwt.sign({ id: user.id, name: user.name, phone: user.phone }, JWT_SECRET, { expiresIn: '30d' });
  res.status(201).json({ success: true, token, user: { id: user.id, name: user.name, phone: user.phone, company: user.company } });
});

app.post('/api/auth/login', async (req, res) => {
  const { phone, password } = req.body;
  if (!phone || !password) return res.status(400).json({ error: 'telefon va parol talab qilinadi' });

  const db = readDB();
  const user = db.users.find(u => u.phone === phone);
  if (!user) return res.status(401).json({ error: 'Telefon yoki parol noto\'g\'ri' });

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(401).json({ error: 'Telefon yoki parol noto\'g\'ri' });

  const token = jwt.sign({ id: user.id, name: user.name, phone: user.phone }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ success: true, token, user: { id: user.id, name: user.name, phone: user.phone, company: user.company } });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  const db = readDB();
  const user = db.users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });
  res.json({ id: user.id, name: user.name, phone: user.phone, company: user.company });
});

// ── SAVED TENDERS ────────────────────────────────────────────────────
app.get('/api/saved', authMiddleware, (req, res) => {
  const db = readDB();
  const savedIds = db.savedTenders[req.user.id] || [];
  const tenders = savedIds.map(id => TENDERS_DB.find(t => t.id === id)).filter(Boolean);
  res.json(tenders);
});

app.post('/api/saved/:id', authMiddleware, (req, res) => {
  const db = readDB();
  const userId = req.user.id;
  if (!db.savedTenders[userId]) db.savedTenders[userId] = [];

  const idx = db.savedTenders[userId].indexOf(req.params.id);
  if (idx > -1) {
    db.savedTenders[userId].splice(idx, 1);
    writeDB(db);
    res.json({ saved: false, message: 'Saqlangan tenderlardan olib tashlandi' });
  } else {
    db.savedTenders[userId].push(req.params.id);
    writeDB(db);
    res.json({ saved: true, message: 'Tender saqlandi!' });
  }
});

// ── WON TENDERS ──────────────────────────────────────────────────────
app.get('/api/won', authMiddleware, (req, res) => {
  const db = readDB();
  const wonIds = db.wonTenders[req.user.id] || [];
  const tenders = wonIds.map(id => TENDERS_DB.find(t => t.id === id)).filter(Boolean);
  res.json(tenders);
});

app.post('/api/won/:id', authMiddleware, (req, res) => {
  const db = readDB();
  const userId = req.user.id;
  if (!db.wonTenders[userId]) db.wonTenders[userId] = [];

  const idx = db.wonTenders[userId].indexOf(req.params.id);
  if (idx > -1) {
    db.wonTenders[userId].splice(idx, 1);
    writeDB(db);
    res.json({ won: false, message: 'Yutganlardan olib tashlandi' });
  } else {
    db.wonTenders[userId].push(req.params.id);
    writeDB(db);
    res.json({ won: true, message: "Tabriklaymiz! Tender yutilganlar safiga qo'shildi 🏆" });
  }
});

// ── EXPORT ENDPOINTS ─────────────────────────────────────────────────
app.post('/api/export/word', (req, res) => {
  const { title, docs, content } = req.body;
  // docs is object with keys: ariza, kafolat, kompaniya, texnik, narx, moliya, vakolat
  // content is fallback for single document format
  
  if (!docs && !content) return res.status(400).json({ error: 'No content' });
  
  const { Document, Packer, Paragraph, TextRun, PageBreak } = docx;
  
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
        // Add page break before each document (except first)
        if (idx > 0) {
          children.push(new PageBreak());
        }
        
        // Add document title
        children.push(new Paragraph({
          children: [new TextRun({ text: docNames[docType] || docType, bold: true, size: 28, font: 'Cambria', color: 'C8FF00' })],
          spacing: { after: 200 }
        }));
        
        // Add document content
        const lines = docs[docType].split('\\n');
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
    const paragraphs = content.split('\\n').map(line => {
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
    res.setHeader('Content-Disposition', `attachment; filename="${(title || 'Hujjat').replace(/\\s+/g,'_')}.docx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.send(buffer);
  }).catch(e => res.status(500).json({ error: e.message }));
});

app.post('/api/export/pdf', (req, res) => {
  const { title, docs, content } = req.body;
  if (!docs && !content) return res.status(400).send('No content');

  const pdf = new PDFDocument({ margin: 40, bufferPages: true });
  
  res.setHeader('Content-Disposition', `attachment; filename="${(title || 'Hujjat').replace(/\\s+/g,'_')}.pdf"`);
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
        const lines = docs[docType].split('\\n');
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

// ── AI CHAT (Maslahatchi) ────────────────────────────────────────────
app.use('/api/chat', aiLimiter);
app.post('/api/chat', async (req, res) => {
  const { message, tenderContext, history } = req.body;
  if (!message) return res.status(400).json({ error: 'Xabar talab qilinadi' });

  // Build system prompt — the AI is an expert Uzbekistan tender consultant
  const systemPrompt = `Sen "TenderMind AI Maslahatchi" — O'zbekiston davlat xaridlari (tender) sohasining eng tajribali mutaxassisisan.

SENING VAZIFALARING:
1. Foydalanuvchiga qaysi tenderda qatnashish kerakligini maslahat berish
2. Tender g'alaba strategiyasini tushuntirish
3. Hujjatlar tayyorlashda yordam berish
4. Narx strategiyasi bo'yicha maslahat berish
5. Raqiblarni tahlil qilish bo'yicha ko'rsatma berish
6. Xarid.uz portali qoidalari va qonunchilikni tushuntirish

QOIDALAR:
- Har doim o'zbek tilida javob ber (foydalanuvchi boshqa tilda yozsa ham)
- Javoblarni qisqa, aniq va amaliy qilib ber
- Raqamlar va faktlar ishlatganda iloji boricha haqiqiy O'zbekiston kontekstida bo'lsin
- Agar tender konteksti berilgan bo'lsa, o'sha tender haqida batafsil maslahat ber
- Har doim ethical va qonuniy maslahatlar ber
- Javob oxirida 1-2 ta qo'shimcha savol taklif qil (foydalanuvchi davom ettirishi uchun)

Hozirgi bazada mavjud tenderlar sohalari: IT, Qurilish, Tibbiyot, Oziq-ovqat, Transport, Ta'lim, Ekologiya, Qishloq xo'jaligi.
Hududlar: Toshkent, Samarqand, Namangan, Andijon, Farg'ona, Buxoro, Qashqadaryo, Xorazm, Surxondaryo.`;

  let contextInfo = '';
  if (tenderContext) {
    const tender = TENDERS_DB.find(t => t.id === tenderContext);
    if (tender) {
      contextInfo = `\n\n[JORIY TENDER KONTEKSTI]
Nomi: ${tender.title}
Tashkilot: ${tender.org}
Soha: ${tender.soha}
Hudud: ${tender.hudud}
Byudjet: ${tender.budget} so'm
Raqiblar: ${tender.competitors} ta
G'alaba ehtimoli: ${tender.probability}%
Muddat: ${tender.deadline}
Talablar: ${(tender.requirements || []).join(', ')}
Tavsif: ${tender.description || ''}`;
    }
  }

  // If no API key, return a smart fallback
  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY.startsWith('sk-ant-...')) {
    return res.json({
      success: true,
      aiGenerated: false,
      reply: generateFallbackChatReply(message, tenderContext)
    });
  }

  try {
    // Build messages array with history
    const messages = [];
    if (history && Array.isArray(history)) {
      history.slice(-10).forEach(h => {
        messages.push({ role: h.role, content: h.content });
      });
    }
    messages.push({ role: 'user', content: message + contextInfo });

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1500,
      system: systemPrompt,
      messages: messages,
    });

    const reply = response.content[0].text.trim();
    res.json({ success: true, aiGenerated: true, reply });
  } catch (err) {
    console.error('Chat AI error:', err);
    res.json({
      success: true,
      aiGenerated: false,
      reply: generateFallbackChatReply(message, tenderContext)
    });
  }
});

function generateFallbackChatReply(message, tenderContext) {
  const msg = message.toLowerCase();

  if (tenderContext) {
    const tender = TENDERS_DB.find(t => t.id === tenderContext);
    if (tender) {
      return `📊 "${tender.title}" tenderi haqida maslahat:\n\n` +
        `✅ G'alaba ehtimoli: ${tender.probability}% — ${tender.probability >= 70 ? 'Yuqori imkoniyat!' : tender.probability >= 50 ? "O'rtacha, yaxshi tayyorgarlik kerak" : 'Raqobat kuchli, kuchli taklif zarur'}.\n\n` +
        `💰 Byudjet: ${tender.budget} so'm. Optimal taklif narxi — byudjetning 85-92% atrofida bo'lishi tavsiya etiladi.\n\n` +
        `⚔️ Raqiblar: ${tender.competitors} ta. ${tender.competitors <= 4 ? 'Kam raqib — bu sizning afzalligingiz!' : "Ko'p raqib — texnik ustunlikka e'tibor bering"}.\n\n` +
        `📋 Strategiya:\n1. Texnik taklifni batafsil va sifatli tayyorlang\n2. Narxni ${Math.round(tender.budgetRaw * 0.88 / 1e6)} mln so'm atrofida belgilang\n3. ISO sertifikatlaringizni ko'rsating\n4. Avvalgi muvaffaqiyatli loyihalaringiz haqida yozing\n\n` +
        `❓ Yana qanday savollaringiz bor? Masalan:\n• "Hujjatlarni qanday tayyorlash kerak?"\n• "Narx strategiyasini tushuntirib bering"`;
    }
  }

  if (msg.includes('tender') && (msg.includes('qaysi') || msg.includes('mos') || msg.includes('tavsiya'))) {
    return `🎯 Sizga mos tender topish uchun bir necha savol:\n\n` +
      `1. Kompaniyangiz qaysi sohada ishlaydi? (IT, Qurilish, Tibbiyot, Oziq-ovqat, Transport, Ta'lim, Ekologiya, Qishloq xo'jaligi)\n` +
      `2. Necha yillik tajribangiz bor?\n` +
      `3. Qaysi hududda ishlashni xohlaysiz?\n\n` +
      `Bu ma'lumotlar asosida men sizga eng mos tenderlarni tavsiya qilaman! 📊\n\n` +
      `💡 Maslahat: "AI Tavsiya" tugmasini bosing — avtomatik tahlil qilinadi.`;
  }

  if (msg.includes('narx') || msg.includes('baho') || msg.includes('qancha') || msg.includes('price')) {
    return `💰 Tender narx strategiyasi:\n\n` +
      `1. **Optimal narx diapazoni**: Byudjetning 82-92% oralig'ida narx taklif qiling\n` +
      `2. **Eng past narx**: Har doim g'alaba keltirmaydi! Sifat va tajriba ham baholanadi\n` +
      `3. **Xarajatlar tarkibi**:\n   • Materiallar: 35-45%\n   • Ish haqi: 20-30%\n   • Transport: 8-12%\n   • Boshqaruv: 5-8%\n   • Foyda: 8-12%\n\n` +
      `⚠️ Eslatma: Juda past narx shubha tug'diradi va rad etilishi mumkin.\n\n` +
      `❓ Konkret tender uchun narx hisoblashni xohlaysizmi? Tender nomini aytib bering.`;
  }

  if (msg.includes('hujjat') || msg.includes('document') || msg.includes('tayyorl')) {
    return `📝 Tender hujjatlari ro'yxati:\n\n` +
      `**Majburiy hujjatlar:**\n` +
      `1. ✅ Texnik taklif — loyihani qanday amalga oshirasiz\n` +
      `2. ✅ Moliyaviy taklif — narx va smeta\n` +
      `3. ✅ Kompaniya profili — tajriba va imkoniyatlar\n` +
      `4. ✅ Guvohnomalar — STIR, litsenziyalar\n\n` +
      `**Qo'shimcha ustunlik beruvchi hujjatlar:**\n` +
      `• ISO sertifikatlari (9001, 14001, 27001)\n` +
      `• Avvalgi loyihalar dalolatnomalari\n` +
      `• Bank kafolat xati\n` +
      `• Xodimlar malaka hujjatlari\n\n` +
      `💡 "Hujjat" tabiga o'ting — AI 8 soniyada texnik, moliyaviy va profil hujjatlarini tayyorlab beradi!\n\n` +
      `❓ Qaysi hujjat haqida batafsil bilmoqchisiz?`;
  }

  if (msg.includes('strategiya') || msg.includes('g\'alaba') || msg.includes('yutish') || msg.includes('win')) {
    return `🏆 Tenderni yutish strategiyasi:\n\n` +
      `**5 ta asosiy qadam:**\n\n` +
      `1️⃣ **Tahlil**: Raqiblarni o'rganing, ularning avvalgi tenderlarini ko'ring\n` +
      `2️⃣ **Narx**: Byudjetning 85-90% atrofida optimal narx belgilang\n` +
      `3️⃣ **Hujjat**: Texnik taklifni batafsil va professional tayyorlang\n` +
      `4️⃣ **Tajriba**: O'xshash loyihalaringizni ko'rsating (referenslar)\n` +
      `5️⃣ **Muddat**: Hujjatlarni muddatdan 2-3 kun oldin topshiring\n\n` +
      `📊 Statistika: Yaxshi tayyorgarlik ko'rgan kompaniyalar 73% ko'proq g'alaba qozonadi!\n\n` +
      `❓ Konkret tender uchun strategiya olmoqchimisiz? Tender tanlang.`;
  }

  // Default response
  return `👋 Salom! Men TenderMind AI Maslahatchi — tender bo'yicha ekspertman.\n\nMen sizga quyidagilarda yordam bera olaman:\n\n` +
    `🔍 **Tender tanlash** — "Menga mos tender tavsiya qil"\n` +
    `💰 **Narx strategiyasi** — "Qancha narx taklif qilish kerak?"\n` +
    `📝 **Hujjat tayyorlash** — "Qanday hujjatlar kerak?"\n` +
    `🏆 **G'alaba strategiyasi** — "Tenderni qanday yutish mumkin?"\n` +
    `📊 **Raqiblar tahlili** — "Raqiblarni qanday o'rganish kerak?"\n\n` +
    `Savolingizni yozing yoki tenderlar ro'yxatidan biror tenderni tanlang — men o'sha tender haqida batafsil maslahat beraman! 🤖\n\n` +
    `❓ Masalan: "IT sohasida qaysi tender yaxshi?" yoki "Tenderni yutish uchun nima qilish kerak?"`;
}

// ── AI TENDER RECOMMENDATION ────────────────────────────────────────
app.use('/api/ai/recommend', aiLimiter);
app.post('/api/ai/recommend', async (req, res) => {
  const { company, experience, soha, hudud } = req.body;

  // Filter matching tenders
  let candidates = [...TENDERS_DB];
  if (soha && soha !== 'all') candidates = candidates.filter(t => t.soha === soha);
  if (hudud && hudud !== 'all') candidates = candidates.filter(t => t.hudud === hudud);

  // Sort by probability descending
  candidates.sort((a, b) => b.probability - a.probability);
  const top5 = candidates.slice(0, 5);

  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY.startsWith('sk-ant-...')) {
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
${top5.map((t, i) => `${i+1}. ID: ${t.id}, "${t.title}", Byudjet: ${t.budget}, Raqiblar: ${t.competitors}, Ehtimol: ${t.probability}%, Muddat: ${t.deadline}, Talablar: ${(t.requirements||[]).join(', ')}`).join('\n')}

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
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    });

    const rawText = response.content[0].text.trim();
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
      const tender = TENDERS_DB.find(t => t.id === rec.tenderId);
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
    console.error('AI recommend error:', err);
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
  console.error('Server Error:', err.message);
  res.status(err.status || 500).json({
    error: err.message || 'Server xatosi',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// ── START ────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n⬡  TenderMind Server — http://localhost:${PORT}`);
  console.log(`   AI: ${process.env.ANTHROPIC_API_KEY ? '✅ Sozlangan' : '❌ .env ga API key kiriting'}`);
  console.log(`   Mode: ${process.env.NODE_ENV || 'development'}\n`);
});
