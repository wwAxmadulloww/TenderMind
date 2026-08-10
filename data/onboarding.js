'use strict';

/**
 * "BIRINCHI TENDERINGIZ" — bosqichma-bosqich yo'riqnoma
 *
 * Auditoriya: tender haqida umuman tasavvurga ega bo'lmagan odam.
 * Shuning uchun har bir qadam bitta savolga javob beradi va oxirida
 * ilovaning aynan qaysi tugmasiga bosish kerakligi ko'rsatiladi.
 */

const STEPS = [
  {
    id: 'tender-nima',
    order: 1,
    title: 'Tender nima va nega sizga kerak?',
    body: [
      'Davlat idoralari, maktablar, shifoxonalar har yili juda ko\'p narsa sotib oladi: mebel, kompyuter, oziq-ovqat, qurilish ishlari, xizmatlar.',
      'Ular buni "kim xohlasa, o\'sha keladi" tarzida qilmaydi. Ochiq tanlov e\'lon qiladi — bu tender deyiladi.',
      'Ma\'nosi shu: kichik kompaniya ham, katta korxona ham bir xil shartlarda qatnasha oladi. Tanish-bilish shart emas — hujjat va narx muhim.',
    ],
    keyPoint: 'Tender — bu davlat pulini ochiq taqsimlash usuli. Siz ham qatnasha olasiz.',
    action: null,
  },
  {
    id: 'lot-nima',
    order: 2,
    title: 'Lot nima? Nega bu eng muhim so\'z?',
    body: [
      'Bitta tender ichida bir nechta alohida qism bo\'lishi mumkin — har biri "lot" deb ataladi.',
      'Siz butun tenderga emas, aynan bitta LOTga taklif berasiz. Bu juda muhim: hammasini bajarish shart emas.',
      'Masalan tenderda 3 ta lot bor: partalar, stullar, doskalar. Siz faqat partalar ishlab chiqarsangiz — faqat 1-lotga taklif berasiz.',
    ],
    keyPoint: 'Butun tenderni ko\'tarish shart emas. Uddasidan chiqadigan bitta lotni tanlang.',
    action: { label: 'Lotlarni ko\'rish', target: 'tenderlar' },
  },
  {
    id: 'lot-tanlash',
    order: 3,
    title: 'Qaysi lotni tanlash kerak?',
    body: [
      'Birinchi tenderingiz uchun eng mos lot — siz ALLAQACHON qilayotgan ishga eng yaqini.',
      'Uchta narsani tekshiring: (1) buni haqiqatan bajara olasizmi, (2) muddatga ulguraszmi, (3) talab qilingan hujjatlar sizda bormi.',
      'Ilovadagi har bir lotda "Menga mos keladimi?" tugmasi bor — u shu uchta savolni avtomatik tekshirib beradi.',
    ],
    keyPoint: 'Yangi soha tanlamang. Birinchi tenderda o\'zingiz bilgan ishni tanlang.',
    action: { label: '"Menga mos keladimi?" ni sinab ko\'rish', target: 'tenderlar' },
  },
  {
    id: 'hujjatlar',
    order: 4,
    title: 'Qanday hujjat kerak?',
    body: [
      'Odatda uchta asosiy hujjat so\'raladi:',
      '1. Kompaniya haqida — guvohnoma, rekvizitlar, INN. Bu sizda allaqachon bor.',
      '2. Narx taklifi — qancha pulga bajarasiz va bu summa nimalardan tashkil topgan.',
      '3. Texnik taklif — ishni qanday, qancha muddatda va qanday sifatda bajarasiz.',
      'Ba\'zi lotlarda qo\'shimcha litsenziya yoki sertifikat so\'raladi — bu e\'londa aniq yozilgan bo\'ladi.',
    ],
    keyPoint: 'Hujjatlarning ko\'pini TenderMind avtomatik tayyorlab beradi — siz faqat tekshirasiz.',
    action: { label: 'Hujjat yaratishni ochish', target: 'hujjat' },
  },
  {
    id: 'narx',
    order: 5,
    title: 'Narxni qanday belgilash kerak?',
    body: [
      'Boshlang\'ich narx — buyurtmachi ajratgan eng yuqori summa. Sizning taklifingiz shundan past bo\'lishi kerak.',
      'Lekin eng past narx har doim ham yutmaydi. Juda past narx "bu bajara olmaydi" degan shubha uyg\'otadi.',
      'Xarajatlaringizni halol hisoblang: material + ishchi kuchi + transport + soliq + o\'z foydangiz. Shundan chiqqan raqamni yozing.',
      'QQS bilanmi yoki QQSsizmi — buni ALBATTA aniq ko\'rsating. Eng ko\'p uchraydigan xato shu.',
    ],
    keyPoint: 'Yuta olmaydigan narxni yozmang. Yutib, keyin zarar ko\'rgandan ko\'ra yutqazgan yaxshi.',
    action: null,
  },
  {
    id: 'topshirish',
    order: 6,
    title: 'Topshirish va keyingi qadam',
    body: [
      'Hujjatlarni muddatdan kamida 2-3 kun oldin topshiring. Oxirgi kunda tizim band bo\'ladi va texnik muammo chiqishi mumkin.',
      'Topshirgandan keyin tasdiqni saqlang.',
      'Yutmasangiz — tugadi demang. Nima uchun yutmaganingizni bilib oling va keyingisiga tuzating. Ko\'pchilik 3-4-urinishda yutadi.',
    ],
    keyPoint: 'Muddatdan oldin topshiring. Kechikkan taklif ochilmaydi ham.',
    action: null,
  },
];

const TOTAL_STEPS = STEPS.length;

module.exports = { STEPS, TOTAL_STEPS };
