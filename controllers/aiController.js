'use strict';

const aiManager = require('../services/ai');
const tenderRepository = require('../repositories/tenderRepository');
const logger = require('../logger');
const asyncHandler = require('../utils/asyncHandler');

const isGeminiConfigured = () => aiManager.isConfigured();

/**
 * Clean & Parse JSON from AI response block
 */
function parseAIResponseJson(rawText, fallbackData) {
  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    return JSON.parse(jsonMatch ? jsonMatch[0] : rawText);
  } catch (err) {
    logger.warn('Failed to parse AI JSON response, using fallback', err.message);
    return fallbackData;
  }
}

/**
 * Generate 7 Uzbekistan tender documents using AI
 */
async function generateDocuments(req, res) {
  const {
    company, orgForm, director, inn, address, phoneEmail,
    experience, bankDetails, pastProjects, tenderName,
    tenderLot, buyerOrg, price, deliveryTerm, tenderSoha
  } = req.body;

  if (!company || !experience || !tenderName || !price) {
    return res.status(400).json({ error: 'Barcha majburiy maydonlar to\'ldirilishi shart' });
  }

  const MAX_FIELD = 8000;
  const strFields = [
    company, orgForm, director, inn, address, phoneEmail,
    experience, bankDetails, pastProjects, tenderName,
    tenderLot, buyerOrg, deliveryTerm, tenderSoha
  ];
  for (const f of strFields) {
    if (typeof f === 'string' && f.length > MAX_FIELD) {
      return res.status(400).json({ error: `Maydon juda uzun (${MAX_FIELD} belgidan oshmasin)` });
    }
  }

  if (!isGeminiConfigured()) {
    return res.status(503).json({
      error: 'API_KEY_MISSING',
      message: 'AI xizmati hozir mavjud emas. Birozdan keyin urinib ko\'ring.'
    });
  }

  const formatted = new Intl.NumberFormat('uz-UZ').format(Number(price));
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
    const rawText = await aiManager.generate(userPrompt, systemPrompt);
    const parsed = parseAIResponseJson(rawText, {
      ariza: rawText, kafolat: '', kompaniya: '', texnik: '', narx: '', moliya: '', vakolat: ''
    });

    res.json({ success: true, docs: parsed, model: `${aiManager.providerName()} AI — 7 hujjat` });
  } catch (err) {
    logger.error('AI API error', err);
    if (err.status === 401 || (err.message && err.message.includes('API_KEY'))) {
      return res.status(503).json({ error: 'AI xizmati hozir mavjud emas. Birozdan keyin urinib ko\'ring.' });
    }
    if (err.message && err.message.includes('404')) {
      return res.status(503).json({ error: 'AI modeli topilmadi. Administrator bilan bog\'laning.' });
    }
    res.status(500).json({ error: 'AI xizmatida xatolik. Qaytadan urinib ko\'ring.' });
  }
}

/**
 * Generate Strategy for bidding on a tender
 */
async function getStrategy(req, res, next) {
  try {
    const { tenderId, company, experience } = req.body;
    if (!tenderId) return res.status(400).json({ error: 'tenderId talab qilinadi' });

    const tender = await tenderRepository.findById(tenderId);
    if (!tender) return res.status(404).json({ error: 'Tender topilmadi' });

    if (!isGeminiConfigured()) {
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

JSON formatda qaytar:
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
      const rawText = await aiManager.generate(prompt);
      const parsed = parseAIResponseJson(rawText, generateFallbackStrategy(tender, company, experience));
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
}

/**
 * Compare two tenders side-by-side
 */
async function compareTenders(req, res) {
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

    if (!isGeminiConfigured()) {
      const comparison = generateDemoComparison(t1, t2);
      return res.json({ success: true, comparison, aiGenerated: false, model: 'Demo' });
    }

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

    const responseText = await aiManager.generate(comparePrompt);
    const comparison = parseAIResponseJson(responseText, generateDemoComparison(t1, t2));

    res.json({ success: true, comparison, aiGenerated: true, model: `${aiManager.providerName()} AI` });
  } catch (err) {
    logger.error('Compare error', err);
    res.status(500).json({ error: 'AI taqqoslashda xatolik' });
  }
}

/**
 * Chat with AI advisor
 */
async function chatWithAI(req, res) {
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

  // Gemini history/messages mapping compatible with OpenAI/Groq structures
  const userMessageWithContext = message.trim() + contextInfo;

  try {
    const reply = await aiManager.chat(systemPrompt, pastTurns.map(h => ({
      role: h.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: h.content }]
    })), userMessageWithContext);

    res.json({ success: true, aiGenerated: true, reply: reply.trim() });
  } catch (err) {
    logger.error('Chat AI error', err);
    // Try single turn fallback
    try {
      const reply = await aiManager.chat(systemPrompt, [], userMessageWithContext);
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
}

/**
 * Recommend tenders for a company
 */
async function recommendTenders(req, res) {
  const { company, experience, soha, hudud } = req.body;

  const candidatesResult = await tenderRepository.list({ soha, hudud, sort: 'probability', limit: 50 });
  const candidates = candidatesResult.items;
  const top5 = candidates.slice(0, 5);

  if (!isGeminiConfigured()) {
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

  const prompt = `O'zbekiston davlat xaridlari bo'yicha ekspert sifatida quyidagi kompaniya uchun eng mos 5 ta tenderni tavsiya qil va har biri uchun sabab va maslahat ber.

Kompaniya: ${company || 'Noma\'lum'}
Tajriba: ${experience || 'Noma\'lum'} yil
${soha && soha !== 'all' ? `Soha: ${soha}` : ''}
${hudud && hudud !== 'all' ? `Hudud: ${hudud}` : ''}

Mavjud tenderlar:
${top5.map((t, i) => `${i + 1}. ID: ${t.id}, "${t.title}", Byudjet: ${t.budget}, Raqiblar: ${t.competitors}, Ehtimol: ${t.probability}%, Muddat: ${t.deadline}, Talablar: ${(t.requirements || []).join(', ')}`).join('\n')}

JSON formatda qaytar (faqat JSON):
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
    const rawText = await aiManager.generate(prompt);
    let parsed = parseAIResponseJson(rawText, null);
    if (!parsed) {
      parsed = {
        recommendations: top5.map(t => ({ tenderId: t.id, score: t.probability, reason: 'AI tahlil qildi', tips: ['Texnik taklifni yaxshi tayyorlang'] })),
        summary: 'AI tahlili'
      };
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
    const recommendations = top5.map(t => ({
      tenderId: t.id, title: t.title, score: t.probability,
      reason: `G'alaba ehtimoli ${t.probability}%, raqiblar ${t.competitors} ta`,
      tips: ['Texnik taklifni batafsil yozing'], budget: t.budget,
      competitors: t.competitors, deadline: t.deadline, probability: t.probability, soha: t.soha,
    }));
    res.json({ success: true, aiGenerated: false, recommendations, summary: 'Avtomat tahlil' });
  }
}

// ── Fallback Helpers ──────────────────────────────────────────────────

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
      `${new Intl.NumberFormat('uz').format(t1.budgetRaw)} so'm byudjet`,
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
    timeToBid: '5 kun'
  };
}

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
      '_Hozir men qisqartirilgan rejimda ishlayapman, shuning uchun javoblarim umumiyroq._\n\n' +
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
          : '_Hozir qisqartirilgan rejimdaman — javoblarim umumiyroq._\n\n') +
        `Yana nimani tushuntirish kerak — narx, hujjatlar yoki strategiya?`;
    }
  }

  if (/salom|assalom|hello|hi\b|privet/.test(msg)) {
    return (
      'Salom! Men TenderMind **AI maslahatchi**man.\n\n' +
      'Menga **har qanday** tender haqida savol bering — masalan:\n' +
      '• "Tender va oddiy xarid farqi nima?"\n' +
      '• "Birinchi marta qatnashmoqchiman, nimadan boshlayman?"\n' +
      '• "Texnik taklifda nima bo\'lishi kerak?"\n\n' +
      '_Hozir qisqartirilgan rejimdaman, lekin asosiy savollarga javob bera olaman._'
    );
  }

  if (/xarid\.uz|xarid uz|portal/.test(msg)) {
    return (
      '**xarid.uz** — O\'zbekistonda davlat xaridlari bilan bog\'liq elektron tizimlardan biri (rasmiy portal va qoidalar vaqt o\'tishi bilan yangilanadi).\n\n' +
      'Umuman olganda u yerda **e\'lonlar**, **hujjatlar**, **muddatlar** va **taklif topshirish** bo\'yicha yo\'riqnomalar bo\'ladi. Aniq qadam-qadam uchun portalning o\'zidagi **yordam** yoki yurist bilan tekshirish yaxshi.\n\n' +
      'TenderMind ise **o\'qitish va tayyorgarlik** uchun: demo tenderlar, strategiya va hujjat namunalari.'
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
      `Konkret lot byudjetini aytsangiz, taxminiy diapazon haqida gaplashamiz.`;
  }

  if (msg.includes('hujjat') || msg.includes('document') || msg.includes('tayyorl')) {
    return `**Odatda so'raladigan hujjatlar**\n\n` +
      `• **Texnik taklif** — bajarish usuli, muddat, sifat\n` +
      `• **Moliyaviy / narx taklifi**\n` +
      `• **Kompaniya to'g'risida** — guvohnomalar, tajriba\n` +
      `• **Litsenziya / sertifikat** (soha bo'yicha)\n\n` +
      `TenderMind **Hujjat** bo'limida AI yordamida namunalar yaratish mumkin — lekin yuborishdan oldin **o'zingiz tekshiring**.\n\n` +
      `Hozir men umumiy ro'yxatni beraman — aniq lotni tanlasangiz, batafsilroq aytaman.`;
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

    `Savolingiz: _"${message.slice(0, 200)}${message.length > 200 ? '…' : ''}"_ — yuqoridagi mavzulardan birini tanlang yoki savolni aniqroq yozing.`
  );
}

// Har bir controller asyncHandler bilan o'raladi: try/catch dan tashqarida
// qolgan har qanday `await` xatosi global error handler ga uzatiladi,
// process ni o'ldirmaydi.
module.exports = {
  generateDocuments: asyncHandler(generateDocuments),
  getStrategy: asyncHandler(getStrategy),
  compareTenders: asyncHandler(compareTenders),
  chatWithAI: asyncHandler(chatWithAI),
  recommendTenders: asyncHandler(recommendTenders)
};
