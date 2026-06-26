/* ═══════════════════════════════════════════════════════
   TENDERMIND — seed-tenders.js
   MongoDB'ga barcha tenderlarni bir marta yuklaydi.
   Ishlatish: node seed-tenders.js
   ═══════════════════════════════════════════════════════ */
'use strict';

require('dotenv').config();
const { connectDB, Tender, mongoose } = require('./db');

const TENDERS_SEED = [
  // ── IT ──────────────────────────────────────────────────────────────
  {
    id: 'it-001', soha: 'it', hudud: 'toshkent', status: 'active', isFresh: true,
    title: 'Toshkent shahar davlat idoralarini IT infratuzilmasini modernizatsiyalash',
    budget: '4 200 000 000', budgetRaw: 4200000000, probability: 87, competitors: 3,
    deadline: '2026-08-28', postedDate: '2026-05-15',
    tags: ['Tarmoq', 'Server', 'Bulut'], org: 'Toshkent shahar hokimiyati',
    description: 'Toshkent shahar 47 ta davlat idorasi uchun zamonaviy IT infratuzilma: fiber optik tarmoq, bulut serverlar, kiberxavfsizlik tizimi.',
    requirements: ['ISO 27001 sertifikati', '5+ yillik tajriba', '200+ xodim'],
    contactEmail: 'it@tashkent.gov.uz', contactPhone: '+998 71 239 01 01', isVerified: true
  },
  {
    id: 'it-002', soha: 'it', hudud: 'samarqand', status: 'active', isFresh: false,
    title: 'Samarqand viloyati elektron hukumat platformasini joriy etish',
    budget: '2 800 000 000', budgetRaw: 2800000000, probability: 72, competitors: 5,
    deadline: '2026-08-10', postedDate: '2026-05-10',
    tags: ['E-gov', 'Portal', 'API'], org: 'Samarqand viloyat hokimiyati',
    description: 'Fuqarolar uchun 120+ ta davlat xizmati online platformasi. Mobile app + web portal.',
    requirements: ['E-gov tajribasi', 'REST API', 'Mobile dev'],
    contactEmail: 'egov@samarkand.gov.uz', contactPhone: '+998 66 234 00 00', isVerified: true
  },
  {
    id: 'it-003', soha: 'it', hudud: 'namangan', status: 'active', isFresh: false,
    title: 'Namangan shahar kuzatuv kamera tizimini o\'rnatish',
    budget: '1 500 000 000', budgetRaw: 1500000000, probability: 63, competitors: 7,
    deadline: '2026-08-20', postedDate: '2026-05-05',
    tags: ['Kamera', 'Xavfsizlik', 'AI'], org: 'Namangan shahar IIB',
    description: '500+ ta HD kuzatuv kamera, AI yuz tanish tizimi, 24/7 monitoring markazi.',
    requirements: ['Xavfsizlik litsenziyasi', 'AI/ML tajriba'],
    contactEmail: 'info@namangan-iib.uz', contactPhone: '+998 69 222 00 00', isVerified: false
  },
  {
    id: 'it-004', soha: 'it', hudud: 'andijon', status: 'active', isFresh: true,
    title: 'Andijon viloyati tibbiyot axborot tizimini modernizatsiyalash (MIS)',
    budget: '1 800 000 000', budgetRaw: 1800000000, probability: 79, competitors: 4,
    deadline: '2026-09-10', postedDate: '2026-05-20',
    tags: ['MIS', 'EMR', 'HL7'], org: 'Andijon Tibbiyot Boshqarmasi',
    description: '40+ poliklinika va kasalxona uchun yagona tibbiy axborot tizimi.',
    requirements: ['Tibbiy dasturiy ta\'minot tajribasi', 'HL7 FHIR', 'Postgres'],
    contactEmail: 'mis@andijan-health.uz', contactPhone: '+998 74 223 00 00', isVerified: true
  },
  {
    id: 'it-005', soha: 'it', hudud: 'fargona', status: 'active', isFresh: false,
    title: 'Farg\'ona viloyati soliq inspeksiyasi uchun CRM tizimi',
    budget: '950 000 000', budgetRaw: 950000000, probability: 68, competitors: 6,
    deadline: '2026-09-01', postedDate: '2026-05-18',
    tags: ['CRM', 'Soliq', 'Dashboard'], org: 'Farg\'ona Soliq Boshqarmasi',
    description: 'Soliq to\'lovchilar bilan ishlash uchun CRM, avtomatik hisobot, analytics dashboard.',
    requirements: ['CRM tajribasi', 'React yoki Vue.js', 'PostgreSQL'],
    contactEmail: 'crm@fergana-tax.uz', contactPhone: '+998 73 241 00 00', isVerified: true
  },
  {
    id: 'it-006', soha: 'it', hudud: 'toshkent', status: 'urgent', isFresh: true,
    title: 'Toshkent metro kartasi va to\'lov tizimini yangilash',
    budget: '3 600 000 000', budgetRaw: 3600000000, probability: 55, competitors: 9,
    deadline: '2026-07-20', postedDate: '2026-05-25',
    tags: ['NFC', 'Contactless', 'Payment'], org: 'Toshkent Metro',
    description: 'Barcha stantsiyalarga NFC kontaktsiz to\'lov va QR kod tizimi o\'rnatish.',
    requirements: ['PCI DSS sertifikati', 'NFC tajriba', 'Banking protocol'],
    contactEmail: 'tender@tashkent-metro.uz', contactPhone: '+998 71 244 00 00', isVerified: true
  },
  // ── QURILISH ─────────────────────────────────────────────────────────
  {
    id: 'q-001', soha: 'qurilish', hudud: 'toshkent', status: 'active', isFresh: false,
    title: 'Toshkent metro liniyasi — yangi bekatlar qurilishi',
    budget: '12 800 000 000', budgetRaw: 12800000000, probability: 45, competitors: 12,
    deadline: '2026-07-15', postedDate: '2026-04-01',
    tags: ['Yer osti', 'Beton', 'Infra'], org: 'O\'zbekiston Temir Yo\'llari',
    description: 'M3 liniyasi: 6 ta yangi bekat, 8.5 km tunnel. Loyiha muddati 36 oy.',
    requirements: ['TBM tajribasi', 'ISO 9001', '500+ xodim', '5 mlrd kafolat'],
    contactEmail: 'tender@uzmetro.uz', contactPhone: '+998 71 299 00 00', isVerified: true
  },
  {
    id: 'q-002', soha: 'qurilish', hudud: 'andijon', status: 'active', isFresh: false,
    title: 'Andijon viloyati yo\'l ta\'miri va qoplama yotqizish',
    budget: '7 500 000 000', budgetRaw: 7500000000, probability: 68, competitors: 4,
    deadline: '2026-08-05', postedDate: '2026-04-15',
    tags: ['Asfalt', 'Yo\'l', 'Region'], org: 'Andijon Avtomobil Yo\'llari',
    description: '120 km shaharlararo yo\'l ta\'miri va yangi asfalt qoplama.',
    requirements: ['Yo\'l qurilish litsenziyasi', 'GOST standartlar', 'Asfalt zavodi'],
    contactEmail: 'tender@andijan-roads.uz', contactPhone: '+998 74 225 00 00', isVerified: true
  },
  {
    id: 'q-003', soha: 'qurilish', hudud: 'buxoro', status: 'active', isFresh: true,
    title: 'Buxoro shahrini obodonlashtirish — markaziy maydon rekonstruksiyasi',
    budget: '3 200 000 000', budgetRaw: 3200000000, probability: 79, competitors: 3,
    deadline: '2026-08-25', postedDate: '2026-05-01',
    tags: ['Obodon', 'Landshaft', 'Meros'], org: 'Buxoro shahar hokimiyati',
    description: 'Labi-Hovuz maydonini rekonstruksiya: yo\'lak, chiroqlar, suv fontan, daraxt ekish.',
    requirements: ['Landshaft dizayn tajribasi', 'UNESCO koordinatsiya'],
    contactEmail: 'obod@bukhara.gov.uz', contactPhone: '+998 65 223 00 00', isVerified: false
  },
  {
    id: 'q-004', soha: 'qurilish', hudud: 'samarqand', status: 'active', isFresh: true,
    title: 'Samarqand xalqaro aeroporti kengaytirish loyihasi — 2-terminal',
    budget: '28 000 000 000', budgetRaw: 28000000000, probability: 38, competitors: 15,
    deadline: '2026-07-30', postedDate: '2026-04-20',
    tags: ['Aeroport', 'Terminal', 'Infra'], org: 'O\'zbekiston Havo Yo\'llari',
    description: 'Yangi terminal: 2000 kv.m yo\'lovchi zali, 10 ta yo\'lakcha, 5 yulduzli VIP lounge.',
    requirements: ['ICAO standartlar', 'Xalqaro qurilish tajriba', '10 mlrd kafolat'],
    contactEmail: 'tender@uzairways.uz', contactPhone: '+998 71 140 00 00', isVerified: true
  },
  // ── TIBBIYOT ─────────────────────────────────────────────────────────
  {
    id: 't-001', soha: 'tibbiyot', hudud: 'namangan', status: 'active', isFresh: false,
    title: 'Namangan viloyati shifoxonalari uchun tibbiy jihozlar yetkazib berish',
    budget: '2 100 000 000', budgetRaw: 2100000000, probability: 81, competitors: 4,
    deadline: '2026-07-30', postedDate: '2026-05-01',
    tags: ['Jihozlar', 'MRI', 'Laboratoriya'], org: 'Sog\'liqni Saqlash Vazirligi',
    description: '3 ta kasalxona uchun MRI 1.5T, KT skaner, laparoskopik uskunalar.',
    requirements: ['Tibbiy qurilma sertifikati', 'CE/FDA', 'Servis kafolati 5 yil'],
    contactEmail: 'jihozlar@ssv.gov.uz', contactPhone: '+998 71 214 00 00', isVerified: true
  },
  {
    id: 't-002', soha: 'tibbiyot', hudud: 'qashqadaryo', status: 'active', isFresh: false,
    title: 'Qashqadaryo viloyati klinik diagnostika markazini jihozlash',
    budget: '980 000 000', budgetRaw: 980000000, probability: 74, competitors: 6,
    deadline: '2026-08-15', postedDate: '2026-05-08',
    tags: ['Diagnostika', 'PCR', 'Ultratovush'], org: 'Qashqadaryo SSB',
    description: 'PCR laboratoriya, 5 ta ultratovush apparati, bioximiya analizatori.',
    requirements: ['ISO 15189 tajriba', 'CE sertifikat', 'Reagentlar ta\'minoti'],
    contactEmail: 'lab@qashkadaryo-ssb.uz', contactPhone: '+998 75 221 55 00', isVerified: false
  },
  {
    id: 't-003', soha: 'tibbiyot', hudud: 'toshkent', status: 'urgent', isFresh: true,
    title: 'Respublika shoshilinch tibbiy yordam markazi uchun reanimatsiya jihozlari',
    budget: '4 500 000 000', budgetRaw: 4500000000, probability: 76, competitors: 5,
    deadline: '2026-07-22', postedDate: '2026-05-22',
    tags: ['Reanimatsiya', 'Ventilatsiya', 'Monitoring'], org: 'Sog\'liqni Saqlash Vazirligi',
    description: '50 ta ICU karavot, sun\'iy nafas oldirish, neinvaziv monitoring.',
    requirements: ['CE/FDA', 'Xalqaro tibbiy kompaniya', '10 yil servis'],
    contactEmail: 'reanm@ssv.gov.uz', contactPhone: '+998 71 214 11 00', isVerified: true
  },
  // ── OZIQ-OVQAT ───────────────────────────────────────────────────────
  {
    id: 'o-001', soha: 'oziq', hudud: 'fargona', status: 'active', isFresh: false,
    title: 'Farg\'ona viloyati maktablari uchun ovqatlanish xizmatini ko\'rsatish',
    budget: '890 000 000', budgetRaw: 890000000, probability: 88, competitors: 2,
    deadline: '2026-07-20', postedDate: '2026-05-12',
    tags: ['Maktab', 'Ovqat', 'HACCP'], org: 'Farg\'ona Xalq Ta\'limi Boshqarmasi',
    description: '120 ta maktab, 85,000 o\'quvchi uchun kun bo\'yi 3 mahal ovqat.',
    requirements: ['HACCP sertifikati', '3+ yil tajriba', 'Sanitariya ruxsati'],
    contactEmail: 'oziq@fergana-edu.uz', contactPhone: '+998 73 244 00 00', isVerified: true
  },
  {
    id: 'o-002', soha: 'oziq', hudud: 'samarqand', status: 'active', isFresh: false,
    title: 'Samarqand viloyati kasalxonalari uchun dieta ovqatlari yetkazish',
    budget: '650 000 000', budgetRaw: 650000000, probability: 91, competitors: 2,
    deadline: '2026-08-01', postedDate: '2026-05-15',
    tags: ['Dieta', 'Kasalxona', 'ISO22000'], org: 'Samarqand SSB',
    description: '8 ta kasalxona, 1200 karavot uchun kuniga 3 mahal dieta ovqat.',
    requirements: ['ISO 22000', 'Tibbiy dieta tajribasi', 'Laboratoriya sertifikati'],
    contactEmail: 'ovqat@samarkand-ssb.uz', contactPhone: '+998 66 235 00 00', isVerified: true
  },
  // ── TRANSPORT ─────────────────────────────────────────────────────────
  {
    id: 'tr-001', soha: 'transport', hudud: 'qashqadaryo', status: 'active', isFresh: false,
    title: 'Qashqadaryo viloyati shaharlararo avtobus xizmati konsessiyasi',
    budget: '3 400 000 000', budgetRaw: 3400000000, probability: 55, competitors: 8,
    deadline: '2026-08-12', postedDate: '2026-05-01',
    tags: ['Avtobus', 'Marshurt', 'GPS'], org: 'Qashqadaryo Hudud Transport',
    description: '15 ta marshrut, 80 ta yangi avtobus, real-time GPS monitoring.',
    requirements: ['Transport litsenziyasi', 'GPS tizim', '5+ yil tajriba'],
    contactEmail: 'transport@qashkadaryo.gov.uz', contactPhone: '+998 75 222 00 00', isVerified: true
  },
  {
    id: 'tr-002', soha: 'transport', hudud: 'toshkent', status: 'active', isFresh: true,
    title: 'Toshkent shahri elektr avtobuslar parki shakllantirish',
    budget: '18 500 000 000', budgetRaw: 18500000000, probability: 47, competitors: 11,
    deadline: '2026-09-01', postedDate: '2026-05-25',
    tags: ['Elektr', 'EV Bus', 'Charging'], org: 'Toshkent Shahar Transport',
    description: '200 ta elektr avtobus, 20 ta zaryadlash stantsiyasi.',
    requirements: ['EV tajriba', 'Xitoy/Korea zavod', 'Servis markazi'],
    contactEmail: 'ev@tashkent-transport.uz', contactPhone: '+998 71 244 55 00', isVerified: false
  },
  // ── TA'LIM ────────────────────────────────────────────────────────────
  {
    id: 'ta-001', soha: 'talim', hudud: 'buxoro', status: 'active', isFresh: false,
    title: 'Buxoro viloyati maktablari uchun ta\'lim texnologiyalari va interaktiv doskalar',
    budget: '890 000 000', budgetRaw: 890000000, probability: 82, competitors: 3,
    deadline: '2026-07-22', postedDate: '2026-05-10',
    tags: ['EdTech', 'Doska', 'Tablet'], org: 'Buxoro Xalq Ta\'limi',
    description: '150 ta maktabga interaktiv doskalar, 3000 ta o\'quvchi plansheti, LMS platform.',
    requirements: ['EdTech tajribasi', 'Mahalliy texnik qo\'llab-quvvatlash', 'Warranty 3 yil'],
    contactEmail: 'edtech@bukhara-edu.uz', contactPhone: '+998 65 224 00 00', isVerified: true
  },
  {
    id: 'ta-002', soha: 'talim', hudud: 'toshkent', status: 'active', isFresh: false,
    title: 'Toshkent shahri maktab kutubxonalari uchun elektron kitoblar platformasi',
    budget: '540 000 000', budgetRaw: 540000000, probability: 76, competitors: 5,
    deadline: '2026-09-01', postedDate: '2026-05-15',
    tags: ['E-kitob', 'Platform', 'API'], org: 'Toshkent Xalq Ta\'limi',
    description: '200,000+ elektron kitob, 300 ta maktab, offline rejim.',
    requirements: ['Digital publishing tajriba', 'Mobile app (iOS/Android)', 'Mualliflik huquqlari'],
    contactEmail: 'ekitob@tashkent-edu.uz', contactPhone: '+998 71 239 55 00', isVerified: true
  },
  {
    id: 'ta-003', soha: 'talim', hudud: 'namangan', status: 'active', isFresh: true,
    title: 'Namangan IT Park — dasturlash o\'quv markazi jihozlash',
    budget: '750 000 000', budgetRaw: 750000000, probability: 84, competitors: 3,
    deadline: '2026-08-05', postedDate: '2026-05-22',
    tags: ['IT Park', 'Server', 'Mac'], org: 'IT Park O\'zbekiston',
    description: '300 xonali o\'quv sinf: Mac/Windows kompyuterlar, server lab, AI/ML workstation.',
    requirements: ['Apple reseller yoki HP/Dell', 'Tarmoq muhendisi', '3 yil kafolat'],
    contactEmail: 'tender@itpark.uz', contactPhone: '+998 71 202 00 00', isVerified: true
  },
  // ── EKOLOGIYA ────────────────────────────────────────────────────────
  {
    id: 'ek-001', soha: 'ekologiya', hudud: 'toshkent', status: 'active', isFresh: true,
    title: 'Toshkent shahar chiqindilarni qayta ishlash zavodi',
    budget: '35 000 000 000', budgetRaw: 35000000000, probability: 32, competitors: 18,
    deadline: '2026-09-01', postedDate: '2026-05-01',
    tags: ['Recycling', 'Zavodla', 'Ekologiya'], org: 'Ekologiya Vazirligi',
    description: 'Kuniga 1500 tonna chiqindi qayta ishlash zavodi.',
    requirements: ['Zavodchilik tajribasi', 'EU standartlar', '50 mlrd kafolat'],
    contactEmail: 'tender@ekologiya.gov.uz', contactPhone: '+998 71 200 88 00', isVerified: true
  },
  {
    id: 'ek-002', soha: 'ekologiya', hudud: 'buxoro', status: 'active', isFresh: false,
    title: 'Buxoro viloyati quyosh energiyasi stantsiyasi (50 MVt)',
    budget: '42 000 000 000', budgetRaw: 42000000000, probability: 28, competitors: 20,
    deadline: '2026-08-25', postedDate: '2026-04-15',
    tags: ['Quyosh', 'Solar', 'Energiya'], org: 'Energetika Vazirligi',
    description: '50 MVt quvvatli quyosh elektr stantsiyasi.',
    requirements: ['Xalqaro solar tajriba', 'IFC/EBRD moliyasi', 'EPC shartnoma'],
    contactEmail: 'solar@energetika.gov.uz', contactPhone: '+998 71 238 55 00', isVerified: true
  },
  // ── QISHLOQ XO'JALIGI ────────────────────────────────────────────────
  {
    id: 'qx-001', soha: 'qishloq', hudud: 'xorazm', status: 'active', isFresh: true,
    title: 'Xorazm viloyati dehqonchilik uchun smart agro texnologiyalari',
    budget: '1 600 000 000', budgetRaw: 1600000000, probability: 73, competitors: 4,
    deadline: '2026-08-15', postedDate: '2026-05-20',
    tags: ['Smart Agro', 'Drone', 'IoT'], org: 'Qishloq Xo\'jalik Vazirligi',
    description: 'Dron purkash tizimi, IoT namlik sensori, avtomatik sug\'orish.',
    requirements: ['Agro-tech tajribasi', 'Drone litsenziyasi', 'IoT platforma'],
    contactEmail: 'agro@qxv.gov.uz', contactPhone: '+998 71 239 77 00', isVerified: false
  },
  {
    id: 'qx-002', soha: 'qishloq', hudud: 'surxondaryo', status: 'active', isFresh: false,
    title: 'Surxondaryo viloyati issiqxona kompleksi qurilishi',
    budget: '2 800 000 000', budgetRaw: 2800000000, probability: 61, competitors: 7,
    deadline: '2026-08-30', postedDate: '2026-05-05',
    tags: ['Issiqxona', 'Gidroponik', 'Export'], org: 'Qishloq Xo\'jalik Vazirligi',
    description: '20 gektar zamonaviy Venlo-tip issiqxona, gidroponik tizim.',
    requirements: ['Issiqxona qurilish tajribasi', 'Export sertifikati', 'Netherlands standart'],
    contactEmail: 'issiqxona@qxv.gov.uz', contactPhone: '+998 71 239 88 00', isVerified: false
  },
];

async function seed() {
  await connectDB();
  console.log('⏳ Tenderlar MongoDB ga yuklanmoqda...');

  let inserted = 0;
  let skipped = 0;

  for (const t of TENDERS_SEED) {
    const existing = await Tender.findOne({ id: t.id });
    if (existing) {
      skipped++;
      continue;
    }
    await Tender.create(t);
    inserted++;
    process.stdout.write(`  ✅ ${t.id}: ${t.title.slice(0, 50)}\n`);
  }

  console.log(`\n📊 Natija: ${inserted} ta yangi, ${skipped} ta allaqachon bor`);
  console.log(`📦 Jami MongoDB da: ${await Tender.countDocuments()} ta tender`);

  await mongoose.disconnect();
  console.log('✅ Seeding tugadi!');
}

if (require.main === module) {
  seed().catch(err => {
    console.error('❌ Seeding xatosi:', err.message);
    process.exit(1);
  });
}

module.exports = { TENDERS_SEED, seed };
