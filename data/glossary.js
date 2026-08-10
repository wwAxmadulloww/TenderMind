'use strict';

/**
 * ATAMALAR LUG'ATI
 *
 * Maqsad — tender sohasiga birinchi marta kirayotgan odam matnda notanish
 * so'zga duch kelganda darhol javob olsin. Ta'riflar ataylab QISQA va
 * JARGONSIZ; har birida "oddiy misol" bor.
 *
 * `aliases` — matnda uchrashi mumkin bo'lgan shakllar (qo'shimchalar bilan).
 * Interfeys shu ro'yxat bo'yicha matndan atamalarni topib belgilaydi.
 */

const GLOSSARY = [
  {
    term: 'Tender',
    aliases: ['tender', 'tenderga', 'tenderda', 'tenderni', 'tenderlar'],
    short: 'Ochiq tanlov: tashkilot biror narsani sotib olmoqchi bo\'lsa, kim arzon va sifatli qilishini tanlaydi.',
    example: 'Maktabga 500 ta parta kerak. Hokimiyat e\'lon beradi, kompaniyalar narx taklif qiladi, eng mosi tanlanadi.',
  },
  {
    term: 'Lot',
    aliases: ['lot', 'lotga', 'lotda', 'lotni', 'lotlar', 'lotlarni'],
    short: 'Tender ichidagi alohida qism. Siz butun tenderga emas, aynan lotga taklif berasiz.',
    example: 'Bitta tenderda 3 ta lot bo\'lishi mumkin: 1-lot — partalar, 2-lot — stullar, 3-lot — doskalar. Faqat partalarga taklif berishingiz mumkin.',
  },
  {
    term: 'Buyurtmachi',
    aliases: ['buyurtmachi', 'buyurtmachining', 'buyurtmachiga'],
    short: 'Sotib oluvchi tomon — odatda davlat idorasi, maktab, shifoxona yoki korxona.',
    example: 'Toshkent shahar hokimiyati partalarni sotib olmoqchi — demak u buyurtmachi.',
  },
  {
    term: 'Ishtirokchi',
    aliases: ['ishtirokchi', 'ishtirokchilar', 'ishtirokchining'],
    short: 'Taklif beruvchi tomon — ya\'ni siz yoki sizning kompaniyangiz.',
    example: 'Partalarni yetkazib bera oladigan har qanday kompaniya ishtirokchi bo\'la oladi.',
  },
  {
    term: 'Boshlang\'ich narx',
    aliases: ['boshlang\'ich narx', 'boshlangich narx', 'boshlang\'ich narxi'],
    short: 'Buyurtmachi ajratgan eng yuqori summa. Sizning taklifingiz shundan past bo\'lishi kerak.',
    example: 'Boshlang\'ich narx 100 mln so\'m bo\'lsa, siz 95 mln taklif qilishingiz mumkin — lekin 105 mln emas.',
  },
  {
    term: 'Kotirovka',
    aliases: ['kotirovka', 'kotirovkada', 'kotirovkalar'],
    short: 'Kichik summadagi soddalashtirilgan xarid turi. Hujjat kamroq, jarayon tezroq.',
    example: 'Idoraga 20 ta kompyuter kerak bo\'lsa — katta tender emas, kotirovka e\'lon qilinishi mumkin.',
  },
  {
    term: 'Texnik taklif',
    aliases: ['texnik taklif', 'texnik taklifni', 'texnik taklifda'],
    short: 'Ishni QANDAY bajarishingizni tushuntiruvchi hujjat: usul, muddat, sifat, jamoa.',
    example: '"Partalarni 45 kunda yetkazamiz, materiali — E1 sinf LDSP, 2 yil kafolat" — bu texnik taklif.',
  },
  {
    term: 'Narx taklifi',
    aliases: ['narx taklifi', 'narx taklifini', 'moliyaviy taklif'],
    short: 'Ishni QANCHAGA bajarishingizni ko\'rsatuvchi hujjat, xarajatlar tarkibi bilan.',
    example: 'Material 60 mln + ishchi kuchi 20 mln + transport 5 mln = 85 mln so\'m.',
  },
  {
    term: 'Kafolat xati',
    aliases: ['kafolat xati', 'kafolat', 'kafolatni'],
    short: 'Siz bergan va\'dalarni yozma tasdiqlash: shartlarga rozilik, ishni bajarishga majburiyat.',
    example: '"Biz e\'lon shartlari bilan tanishdik va ularni to\'liq bajarishga kafolat beramiz" — shunday hujjat.',
  },
  {
    term: 'Vakolatnoma',
    aliases: ['vakolatnoma', 'vakolatnomani', 'vakolat'],
    short: 'Kimdir sizning nomingizdan hujjat imzolashi mumkinligini tasdiqlovchi qog\'oz.',
    example: 'Direktor safarda bo\'lsa, o\'rinbosariga vakolatnoma berib, hujjat imzolash huquqini beradi.',
  },
  {
    term: 'INN',
    aliases: ['inn', 'stir'],
    short: 'Soliq to\'lovchining identifikatsiya raqami — 9 xonali raqam (ilgari 12 xonali edi).',
    example: 'Har bir ro\'yxatdan o\'tgan tashkilotda o\'z INN raqami bo\'ladi, guvohnomada yozilgan.',
  },
  {
    term: 'QQS',
    aliases: ['qqs'],
    short: 'Qo\'shilgan qiymat solig\'i. Narx taklifida "QQS bilan" yoki "QQSsiz" ekanini aniq yozish kerak.',
    example: '100 mln so\'m + 12% QQS = 112 mln so\'m. Qaysi raqamni yozayotganingizni aniq ko\'rsating.',
  },
  {
    term: 'MChJ',
    aliases: ['mchj'],
    short: 'Mas\'uliyati cheklangan jamiyat — O\'zbekistondagi eng keng tarqalgan tashkilot shakli.',
    example: '"Farand" MChJ — ya\'ni kompaniya MChJ shaklida ro\'yxatdan o\'tgan.',
  },
  {
    term: 'YaTT',
    aliases: ['yatt', 'yakka tartibdagi tadbirkor'],
    short: 'Yakka tartibdagi tadbirkor — kompaniya ochmasdan ishlaydigan tadbirkor.',
    example: 'Kichik lotlarga YaTT sifatida ham qatnashish mumkin, agar e\'londa taqiqlanmagan bo\'lsa.',
  },
  {
    term: 'Deadline',
    aliases: ['deadline', 'muddat', 'muddati', 'muddatgacha'],
    short: 'Taklifni topshirishning oxirgi sanasi. Bir daqiqa kechiksangiz ham qabul qilinmaydi.',
    example: 'Muddat 25-may soat 18:00 bo\'lsa, 18:01 da yuborilgan taklif rad etiladi.',
  },
  {
    term: 'Yetkazib berish sharti',
    aliases: ['yetkazib berish sharti', 'yetkazib berish', 'yetkazish muddati'],
    short: 'Tovarni qayerga, qachon va kimning hisobidan yetkazish kerakligi.',
    example: '"90 kalendar kun ichida, buyurtmachi omboriga, yetkazib beruvchi hisobidan."',
  },
  {
    term: 'Litsenziya',
    aliases: ['litsenziya', 'litsenziyasi', 'sertifikat', 'sertifikati'],
    short: 'Ayrim faoliyat turlari uchun majburiy rasmiy ruxsatnoma yoki sifat tasdig\'i.',
    example: 'Qurilish yoki tibbiy uskuna yetkazishda odatda alohida litsenziya talab qilinadi.',
  },
  {
    term: 'Xarid',
    aliases: ['xarid', 'xaridlar', 'davlat xaridlari'],
    short: 'Davlat yoki byudjet tashkiloti tomonidan tovar, ish yoki xizmat sotib olish jarayoni.',
    example: 'Davlat xaridlari maxsus qoidalar bo\'yicha, ochiq tarzda amalga oshiriladi.',
  },
];

/** Atama nomi bo'yicha tez qidirish uchun indeks */
const BY_ALIAS = new Map();
for (const entry of GLOSSARY) {
  for (const alias of entry.aliases) {
    BY_ALIAS.set(alias.toLowerCase(), entry);
  }
}

function findTerm(word) {
  return BY_ALIAS.get(String(word || '').toLowerCase().trim()) || null;
}

module.exports = { GLOSSARY, findTerm };
