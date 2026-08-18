# TenderMind

O'zbekiston davlat xaridlari platformasi — tenderlarni topish, **har bir lotni oddiy tilda tushunish** va hujjatlarni avtomatik tayyorlash.

Loyihaning maqsadi: tender sohasini bilmagan odam ham qatnasha olsin. Shuning uchun lot tushuntirish, atamalar lug'ati va boshlang'ich yo'riqnoma — mahsulotning yadrosi, qo'shimcha emas.

---

## Tezkor boshlash

```bash
npm install
cp .env.example .env    # qiymatlarni to'ldiring
npm run dev:local       # MongoDB Atlas kerak emas — xotirada ishlaydi
```

`http://localhost:3002` ochiladi. Lokal admin hisobi konsolda ko'rsatiladi.

Haqiqiy baza bilan ishlash uchun `.env` da `MONGODB_URI` ni to'ldiring va `npm start`.

---

## Buyruqlar

| Buyruq | Vazifasi |
|---|---|
| `npm start` | Serverni ishga tushirish |
| `npm run dev` | Avtomatik qayta yuklanadigan rejim |
| `npm run dev:local` | Xotiradagi MongoDB bilan (Atlas kerak emas) |
| `npm test` | Testlar (138 ta) |
| `npm run ingest -- file --path=./data/namuna-tenderlar.json` | Ma'lumot import qilish |
| `npm run bot` | Telegram botni ishga tushirish |
| `npm run make-admin -- +998901234567` | Foydalanuvchini admin qilish |

---

## Arxitektura

```
server.js              Kirish nuqtasi, routerlarni mount qiladi
config/                env, CORS, tariflar
db.js                  Mongoose modellar: User, Tender, Lot, Subscription
models/                Modellarga yagona kirish nuqtasi
repositories/          Bazaga so'rovlar (tender, lot)
services/
  ai/                  AI provayderlar zanjiri (Groq → OpenAI → Gemini)
  lotExplainer.js      "Oddiy tilda tushuntirish" va moslik tahlili
  billing.js           Obuna hayotiy sikli
  ingestion/           Tashqi manbadan ma'lumot yig'ish
  telegram/            Bot va xabarnoma
controllers/           So'rovlarni qayta ishlash
routes/                Yo'llar va middleware zanjiri
middleware/            auth, admin, quota, dbReady
utils/                 asyncHandler, aiJson, searchQuery
data/                  Lug'at, yo'riqnoma, namuna ma'lumot
scripts/               CLI vositalar
tests/                 Testlar (node:test + xotiradagi MongoDB)
index.html             Ilova qobig'i (SPA)
admin.html             Admin panel (/admin)
assets/css/core.css    Dizayn tizimi — rang, shrift, komponentlar
assets/css/app.css     Ilova interfeysi
assets/css/doc.css     Server render qilgan sahifalar + admin
assets/js/app.js       Ilova mantiqi
assets/js/i18n.js      Tarjimalar (uz / ru / en)
assets/js/admin.js     Admin panel mantiqi
.github/workflows/     CI — har push va PR da testlar
```

---

## Asosiy funksiyalar

### Lot va tushuntirish
Foydalanuvchi tenderga emas, **lotga** taklif beradi. Har bir lotda:
- **"Oddiy tilda tushuntir"** — nima sotib olinmoqda, kim qatnasha oladi, qanday hujjat kerak, qancha pul, qachongacha.
- **"Menga mos keladimi?"** — muddat, tajriba, litsenziya, hudud bo'yicha avtomatik tekshiruv.

Tushuntirish **AI ulanmagan bo'lsa ham to'liq ishlaydi** — lot ma'lumotidan quriladi, AI faqat boyitadi. Bir marta yaratilib saqlanadi, keyingi ochilishlarda AI qayta chaqirilmaydi.

### Ta'lim qatlami
- 18 ta atama lug'ati — matnda uchraganda bosilsa izoh va hayotiy misol chiqadi.
- "Birinchi tenderingiz" — 6 qadamli yo'riqnoma, ro'yxatdan o'tmasdan ham o'qiladi.

### Dizayn tizimi
Yo'nalish — **rasmiy hujjat**: oq qog'oz, muhr siyohi ko'k (`--seal`), ma'lumot uchun mono shrift. Uch xil ovoz uchun uch xil shrift:

| Shrift | Qayerda |
|---|---|
| IBM Plex Sans | Interfeys va rasmiy ma'lumot |
| IBM Plex Mono | Summalar, muddatlar, hujjat raqamlari |
| IBM Plex Serif | **Faqat** "oddiy tilda" tushuntirish panellarida |

Serif tasodifiy tanlanmagan: rasmiy hujjat va uni tushuntirayotgan odam — ikki xil ovoz, shuning uchun ikki xil harf. Tushuntirish paneli (`.plain`) shu tufayli sahifada alohida ajralib turadi — bu mahsulotning asosiy g'oyasi.

Barcha rang va o'lcham qiymatlari `assets/css/core.css` da CSS o'zgaruvchilari sifatida. Boshqa faylda qo'lda rang yozilmaydi.

### Tillar
Interfeys **uz / ru / en**. O'zbekiston biznesida rus tili keng ishlatiladi, shuning uchun RU to'liq qo'llab-quvvatlanadi.

Brauzer tili bo'yicha avtomatik tanlash **ataylab qilinmagan**: e'lon sarlavhalari va tashkilot nomlari bazada o'zbekcha, interfeysni inglizchaga o'girish ularni tarjima qilmaydi va aralash sahifa chiqadi. Standart til — o'zbekcha, tanlov `localStorage` da saqlanadi.

Yangi matn qo'shganda: HTML da `data-i18n="kalit"`, JS da `t('kalit')`. Kod ichida qo'lda yozilgan matn qolmasin — u til almashtirilganda o'zbekcha bo'lib qolaveradi.

### Qidiruv tizimlari uchun sahifalar
SPA mazmuni JavaScript'siz ko'rinmaydi, shuning uchun har bir tender uchun alohida server tomonda render qilinadigan sahifa bor:

| Manzil | Nima |
|---|---|
| `/tender/:id` | To'liq HTML: lotlar, tushuntirishlar, meta teglar, JSON-LD |
| `/tenderlar/:soha` | Soha bo'yicha ro'yxat — crawler tenderlarga shu orqali o'tadi |
| `/sitemap.xml` | Faqat indekslanadigan yozuvlar |
| `/robots.txt` | `/admin` va `/api/` yopiq |

**DEMO yozuvlar `noindex` bilan chiqadi** — o'ylab topilgan tender qidiruv natijalariga tushmasligi kerak. Muddati tugaganlar ham shunday.

### Tarif va limitlar
`config/plans.js` da — narx, imkoniyat va limitlar bir joyda. Sayt narxlar bo'limi shu manbadan render qilinadi, ya'ni reklama va amaldagi limit har doim mos.

Limit **muvaffaqiyatli so'rovdan keyin** sarflanadi: AI xato bersa yoki javob keshdan kelsa — limit yonmaydi.

### Xavfsizlik

| Chora | Nima qiladi |
|---|---|
| **Token avlodi** | Chiqish yoki parol o'zgarishida oshiriladi — eski tokenlar darhol kuchsizlanadi. "Hamma qurilmadan chiqish" ham shu. |
| **CSP** | `script-src 'self'`, inline skript yo'q. Tender sarlavhalari tashqi manbadan keladi, ya'ni ishonchsiz matn — bu oxirgi to'siq. |
| **Qidiruv tozalash** | Foydalanuvchi kiritmasi hech qachon `new RegExp()` ga bermaydi. Busiz oddiy `C++` so'rovi ham serverni yiqitardi. |
| **Rol bazadan** | Har so'rovda tekshiriladi, tokendan olinmaydi. |

Parolni unutgan foydalanuvchi uchun admin vaqtinchalik parol yaratadi (`/admin` → Foydalanuvchilar). O'z-o'zini tiklash SMS yetkazishni talab qiladi — u ulanmagan, shuning uchun yolg'on "kod yubordik" xabari o'rniga ishlaydigan yo'l qoldirilgan.

### Admin panel — `/admin`
Statistika, tender/lot qo'shish va o'chirish, foydalanuvchi tariflari, to'lov tasdiqlash.

Birinchi adminni faqat CLI orqali yaratish mumkin:
```bash
npm run make-admin -- +998901234567
```
API orqali o'zini admin qilish yo'li ataylab qoldirilmagan. Rol har so'rovda **bazadan** o'qiladi — huquq olib tashlansa token darhol kuchini yo'qotadi.

---

## Ma'lumot manbalari

### Hozirgi holat
Bazadagi namunaviy tenderlar **DEMO** deb belgilangan va interfeysda shunday ko'rsatiladi. Ular o'rganish uchun; haqiqiy e'lon emas.

`probability` va `competitors` maydonlari haqiqiy e'lonlarda **bo'sh** qoladi — hisoblanmagan raqamni fakt sifatida ko'rsatmaslik uchun. Demo yozuvlarda ular "(demo)" belgisi bilan chiqadi.

### Import qilish

**Fayldan (bugunoq ishlaydi):**
```bash
npm run ingest -- file --path=./export.json --dry-run   # avval sinab ko'ring
npm run ingest -- file --path=./export.json
```
JSON va CSV qo'llab-quvvatlanadi. Kutilgan maydonlar uchun `data/namuna-tenderlar.json` ga qarang.

**JSON API dan:**
`.env` da `INGEST_API_URL` va tegishli sozlamalarni to'ldiring, keyin:
```bash
npm run ingest -- http-json
```

Har bir so'rovdan oldin **robots.txt tekshiriladi**. Taqiqlangan bo'lsa ingestion to'xtaydi — buni chetlab o'tish sozlamasi yo'q. So'rovlar orasida pauza bor (`INGEST_DELAY_MS`).

Import qilingan yozuv `isVerified: false` bilan keladi va interfeysda "Tekshirilmagan" deb belgilanadi. Admin ko'rib chiqqach tasdiqlaydi. Qayta importda admin tasdig'i va tayyor AI tushuntirishlari yo'qolmaydi.

**Yangi manba qo'shish:** `services/ingestion/sources/` ga `fetch(options) => Promise<Array>` qaytaruvchi modul yozib, `sources/index.js` ga qo'shing. Normalizatsiya, dedupe va saqlash o'zgarishsiz ishlaydi.

---

## Telegram bot

```bash
# .env: TELEGRAM_BOT_TOKEN va TELEGRAM_BOT_USERNAME
npm run bot
```

Foydalanuvchi kabinetdan kod oladi va botga yuboradi (`/ulash KOD`). Keyin `/sozlama` orqali soha, hudud va minimal byudjetni tanlaydi. Ingestion yangi tender topganda mos obunachilarga xabar boradi.

Token sozlanmagan bo'lsa interfeys buni ochiq aytadi — yolg'on va'da bermaydi.

---

## Muhit o'zgaruvchilari

To'liq ro'yxat `.env.example` da. Eng muhimlari:

| O'zgaruvchi | Izoh |
|---|---|
| `MONGODB_URI` | MongoDB ulanish satri |
| `JWT_SECRET` | Kamida 32 belgilik tasodifiy satr |
| `PORT` | Standart: 3002 |
| `NODE_ENV` | `production` da xavfsizlik qoidalari qattiqlashadi |
| `FRONTEND_URL` | CORS va Telegram havolalari uchun |
| `GROQ_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY` | AI (ixtiyoriy — usiz ham ishlaydi) |

AI kalitlari **formati bo'yicha** tekshiriladi (`gsk_`, `sk-`, `AIza`). Noto'g'ri formatdagi kalit "ulangan" deb ko'rsatilmaydi.

---

## Testlar

```bash
npm test
```

138 ta test. Integratsion testlar xotiradagi MongoDB bilan ishlaydi — tashqi klaster kerak emas.

Qamrov: telefon normalizatsiyasi, tarif limitlari, AI kalit validatsiyasi, route himoyasi, baza uzilgandagi xatti-harakat, lot tushuntirish, ta'lim moduli, admin huquqi, to'lov oqimi, ingestion normalizatsiyasi va dedupe, robots.txt qoidalari, Telegram buyruqlari, SEO sahifalari va indekslash qoidalari.

---

## Productionga chiqishdan oldin

- [ ] `JWT_SECRET` — yangi tasodifiy qiymat
- [ ] MongoDB paroli kuchli
- [ ] `NODE_ENV=production`
- [ ] `FRONTEND_URL` to'g'ri domen
- [ ] Birinchi admin yaratilgan
- [ ] Demo tenderlar o'chirilgan yoki haqiqiy ma'lumot import qilingan
- [ ] To'lov usuli aniqlangan (hozir faqat bank o'tkazmasi + admin tasdig'i)

---

## Ma'lum cheklovlar

Bularni ochiq aytish kerak:

1. **Haqiqiy tender manbasi ulanmagan.** Ingestion karkasi tayyor va test qilingan, lekin portal adapteri yo'q — `xarid.uz` ga ulanish yoki rasmiy kelishuv kerak. Hozircha fayldan import qilinadi.
2. **To'lov qo'lda tasdiqlanadi.** Payme/Click avtomatik integratsiyasi uchun merchant kaliti kerak. Kod tayyor, kalit yo'q — shuning uchun bu usullar "sozlanmagan" deb qaytariladi.
3. **Fond birjasi integratsiyasi yo'q.** Qimmatli qog'ozlar savdosi litsenziyalanadigan faoliyat; bu MVP doirasidan tashqarida.
