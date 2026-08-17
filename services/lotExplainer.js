'use strict';

const aiManager = require('./ai');
const logger = require('../logger');
const { parseAIJson } = require('../utils/aiJson');

const formatSom = (n) => new Intl.NumberFormat('uz-UZ').format(Math.round(Number(n) || 0));

function daysLeft(deadline) {
  const diff = new Date(deadline).getTime() - Date.now();
  return Math.ceil(diff / 86400000);
}

/**
 * ── ASOSIY QOIDA ──────────────────────────────────────────────────────
 * "Oddiy tilda tushuntirish" — mahsulotning yadrosi. Shuning uchun u AI
 * ULANMAGAN bo'lsa ham ishlashi SHART. Quyidagi funksiya faqat lotning
 * o'z ma'lumotidan tushunarli matn quradi; AI esa uni boyitadi, o'rnini
 * bosmaydi.
 */
function buildBasicExplanation(lot, tender) {
  const kun = daysLeft(lot.deadline);
  const narx = formatSom(lot.startPrice);
  const miqdor = lot.quantity ? `${lot.quantity} ${lot.unit || 'dona'}` : null;

  const muddatMatni = kun < 0
    ? `Bu lotning muddati ${Math.abs(kun)} kun oldin tugagan — taklif qabul qilinmaydi.`
    : kun === 0
      ? 'Muddat bugun tugaydi — bugunoq topshirish kerak.'
      : `Taklifni ${lot.deadline} sanasigacha topshirish kerak — ya'ni ${kun} kun qoldi.`;

  const hujjatlar = [
    'Kompaniya haqida ma\'lumot (guvohnoma, rekvizitlar)',
    'Narx taklifi — qancha pulga bajarishingiz',
    'Texnik taklif — qanday va qancha muddatda bajarasiz',
  ];
  if (lot.requirements && lot.requirements.length) {
    hujjatlar.push(`E'londa alohida talab qilingan: ${lot.requirements.join(', ')}`);
  }

  return {
    nima: miqdor
      ? `Bu lotda ${miqdor} ${lot.title} sotib olinmoqda.`
      : `Bu lotda quyidagi ish yoki xizmat sotib olinmoqda: ${lot.title}.`,
    kim: (lot.requirements && lot.requirements.length)
      ? `Qatnashish uchun quyidagi talablarga javob berish kerak: ${lot.requirements.join(', ')}. Bu talablarga mos har qanday tashkilot qatnasha oladi.`
      : 'E\'londa alohida maxsus talab ko\'rsatilmagan — ro\'yxatdan o\'tgan har qanday tashkilot qatnasha oladi.',
    hujjatlar,
    pul: `Boshlang'ich narx — ${narx} so'm. Siz shu summadan past taklif berasiz; odatda eng foydali taklif g'olib bo'ladi. Juda past narx esa shubha uyg'otishi mumkin.`,
    muddat: muddatMatni,
    xulosa: `${tender && tender.org ? tender.org : 'Buyurtmachi'} ${lot.title} uchun taklif kutmoqda. Boshlang'ich narx ${narx} so'm, ${kun > 0 ? `${kun} kun vaqt bor` : 'muddat tugagan'}.`,
  };
}

/**
 * AI orqali boyitilgan tushuntirish. AI ishlamasa — asosiy variant qaytadi.
 * Chaqiruvchi natijani lot hujjatida saqlaydi (keshlash), shuning uchun
 * bu funksiya har sahifa ochilishida emas, faqat bir marta chaqiriladi.
 */
async function explainLot(lot, tender) {
  const basic = buildBasicExplanation(lot, tender);

  if (!aiManager.isConfigured()) {
    return { ...basic, model: 'asosiy (AI ulanmagan)' };
  }

  const kun = daysLeft(lot.deadline);
  const systemPrompt = `Sen O'zbekiston davlat xaridlari bo'yicha tushuntiruvchisan. Vazifang — tender lotini TENDER HAQIDA HECH NARSA BILMAYDIGAN oddiy odamga tushuntirish.

QAT'IY QOIDALAR:
1. Sodda o'zbek tilida yoz. Jargon ishlatma; ishlatsang — darhol qavs ichida ochib ber.
2. FAQAT berilgan ma'lumotga tayan. Raqam, sana yoki talabni O'YLAB TOPMA.
3. Ma'lumot yetishmasa — "e'londa ko'rsatilmagan" deb yoz.
4. Har bir jumla qisqa bo'lsin. Rasmiy uslubdan qoch.
5. Va'da berma ("albatta yutasiz" kabi). Faqat tushuntir.`;

  const userPrompt = `Quyidagi lotni oddiy odamga tushuntir.

LOT: ${lot.title}
Tavsif: ${lot.description || 'berilmagan'}
${lot.quantity ? `Miqdori: ${lot.quantity} ${lot.unit || ''}` : ''}
Boshlang'ich narx: ${formatSom(lot.startPrice)} so'm
Muddat: ${lot.deadline} (${kun} kun qoldi)
Talablar: ${(lot.requirements || []).join(', ') || 'ko\'rsatilmagan'}
Yetkazib berish sharti: ${lot.deliveryTerm || 'ko\'rsatilmagan'}
Buyurtmachi: ${tender && tender.org ? tender.org : 'ko\'rsatilmagan'}
Soha: ${tender && tender.soha ? tender.soha : 'ko\'rsatilmagan'}

Faqat JSON qaytar:
{
  "nima": "Bu lotda nima sotib olinmoqda — 1-2 sodda jumla",
  "kim": "Kim qatnasha oladi, qanday shart bor — 1-2 jumla",
  "hujjatlar": ["Kerakli hujjat 1", "Kerakli hujjat 2", "Kerakli hujjat 3"],
  "pul": "Qancha pul, narx qanday belgilanadi — 1-2 jumla",
  "muddat": "Qachongacha ulgurish kerak — 1 jumla",
  "xulosa": "Umumiy xulosa — 2-3 jumla, oddiy tilda"
}`;

  try {
    const raw = await aiManager.generate(userPrompt, systemPrompt, { temperature: 0.4 });
    const parsed = parseAIJson(raw, null);
    if (!parsed || !parsed.xulosa) return { ...basic, model: 'asosiy (AI javobi o\'qilmadi)' };

    // AI biror maydonni tashlab ketsa — asosiy variantdan to'ldiriladi
    return {
      nima: parsed.nima || basic.nima,
      kim: parsed.kim || basic.kim,
      hujjatlar: Array.isArray(parsed.hujjatlar) && parsed.hujjatlar.length
        ? parsed.hujjatlar.map(String)
        : basic.hujjatlar,
      pul: parsed.pul || basic.pul,
      muddat: parsed.muddat || basic.muddat,
      xulosa: parsed.xulosa,
      model: aiManager.providerName(),
    };
  } catch (err) {
    logger.warn('Lot tushuntirishda AI xatosi — asosiy variant ishlatildi', err.message);
    return { ...basic, model: 'asosiy (AI xatosi)' };
  }
}

/**
 * "Menga mos keladimi?" — foydalanuvchi profili bilan lot talablarini
 * solishtirish. Bu ham AI siz ishlaydi: aniq, tekshiriladigan mezonlar.
 */
function analyzeFit(lot, tender, profile = {}) {
  const reasons = [];
  const blockers = [];
  const kun = daysLeft(lot.deadline);

  if (kun < 0) {
    blockers.push('Muddat tugagan — bu lotga endi taklif berib bo\'lmaydi.');
  } else if (kun <= 3) {
    reasons.push(`⚠️ Muddatga atigi ${kun} kun qoldi — hujjat tayyorlashga vaqt juda kam.`);
  } else {
    reasons.push(`✅ Muddatga ${kun} kun bor — hujjat tayyorlashga yetadi.`);
  }

  const experience = Number(profile.experience) || 0;
  const requirementText = (lot.requirements || []).join(' ').toLowerCase();
  const requiredYears = requirementText.match(/(\d+)\s*\+?\s*yil/);
  if (requiredYears) {
    const need = Number(requiredYears[1]);
    if (experience >= need) {
      reasons.push(`✅ Tajriba talabi ${need} yil — sizda ${experience} yil, mos keladi.`);
    } else {
      blockers.push(`Tajriba talabi ${need} yil, sizda ${experience} yil ko'rsatilgan.`);
    }
  }

  const needsLicense = /litsenziya|sertifikat|iso/i.test(requirementText);
  if (needsLicense) {
    reasons.push('⚠️ Litsenziya yoki sertifikat talab qilinadi — sizda borligini tekshiring.');
  }

  if (profile.soha && tender && tender.soha && profile.soha !== 'all') {
    if (profile.soha === tender.soha) {
      reasons.push('✅ Lot sizning sohangizga to\'g\'ri keladi.');
    } else {
      reasons.push('ℹ️ Lot sizning asosiy sohangizdan farq qiladi.');
    }
  }

  if (profile.hudud && tender && tender.hudud && profile.hudud !== 'all') {
    if (profile.hudud === tender.hudud) {
      reasons.push('✅ Lot sizning hududingizda.');
    } else {
      reasons.push(`ℹ️ Lot boshqa hududda (${tender.hudud}) — yetkazib berish xarajatini hisobga oling.`);
    }
  }

  const verdict = blockers.length ? 'mos_emas' : (kun <= 3 ? 'shoshilinch' : 'mos');
  const verdictText = {
    mos: 'Bu lot sizga mos ko\'rinadi — hujjat tayyorlashni boshlashingiz mumkin.',
    shoshilinch: 'Mos, lekin vaqt juda kam. Bugunoq boshlasangizgina ulgurasiz.',
    mos_emas: 'Bu lot hozircha sizga mos emas — quyidagi to\'siqlar bor.',
  }[verdict];

  return { verdict, verdictText, reasons, blockers, daysLeft: kun };
}

module.exports = { explainLot, buildBasicExplanation, analyzeFit };
