# TenderMind

O'zbekiston davlat xaridlari platformasi — tenderlarni topish, **har bir lotni oddiy tilda tushunish** va hujjatlarni avtomatik tayyorlash.

Loyihaning maqsadi: tender sohasini bilmagan odam ham qatnasha olsin. Shuning uchun lot tushuntirish, atamalar lug'ati va boshlang'ich yo'riqnoma — mahsulotning yadrosi, qo'shimcha emas.

---

## Tezkor boshlash

```bash
npm install
npm run dev:local
```

`http://localhost:3002` ochiladi. Lokal admin hisobi konsolda ko'rsatiladi.

**Tashqi baza kerak emas.** `dev:local` MongoDB ni o'zi ko'taradi va ma'lumotni `.data/mongo` da **saqlaydi** — yaratgan tenderlaringiz va foydalanuvchilar server qayta ishga tushganda ham joyida qoladi.

```bash
npm run dev:local -- --fresh   # bazani tozalab boshlash
```

`npm start` esa `.env` dagi `MONGODB_URI` ga ulanadi. Agar u ishlamasa, server ishga tushadi, lekin **bazaga bog'liq har bir so'rov 503 qaytaradi** — sayt ochiladi, tenderlar kelmaydi, kirish ishlamaydi. Buni ishga tushirish logi aniq aytadi.

---

## Buyruqlar

| Buyruq | Vazifasi |
|---|---|
| `npm start` | Serverni ishga tushirish |
| `npm run dev` | Avtomatik qayta yuklanadigan rejim |
| `npm run dev:local` | Xotiradagi MongoDB bilan (Atlas kerak emas) |
| `npm test` | Testlar (177 ta) |
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

Tushuntirish **AI ulanmagan bo'lsa ham to'liq ishlaydi** — lot ma'lumotidan quriladi, AI faqat boyitadi.

Asosiy variant **lot yaratilishi bilan** tayyorlanadi, chunki u na tarmoq, na pul, na limit talab qiladi. Shuning uchun u ro'yxatdan o'tmagan mehmonga ham darhol ko'rinadi — ilgari u faqat kirgan foydalanuvchi tugmani bosganda va kunlik limit sarflanganda yaratilardi, ya'ni mahsulotning asosiy va'dasi birinchi tashrifda umuman ko'rinmasdi.

Server render qiladigan sahifalarga ham shu matn tushadi — qidiruv tizimi uchun ham foydali.

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

**Bosh ekrandagi namuna kartasi** — bezak emas: chapda rasmiy e'lon, pastda uning odam tilidagi izohi. Tashrif buyuruvchi birinchi ekrandayoq mahsulot nima qilishini ko'radi. Karta «NAMUNA» deb belgilangan, chunki u haqiqiy e'londan farq qilmaydi.

**Soha ranglari** ham bezak emas: o'nlab e'lonni ko'z bilan chopib chiqayotgan odam kerakli sohani chap chiziq rangi bo'yicha topadi.

**Muddat ko'rsatkichi** faqat 45 kundan kam qolganda ko'rinadi. Har doim ko'rinsa u har doim to'la bo'lardi va hech narsa bildirmasdi — chiziq paydo bo'lishining o'zi «bu e'lon tugayapti» degani.

**Bosh sahifadagi uchala raqam ham o'lchanadi.** Soha va hudud soni ilgari lug'atdagi kalitlar sonidan olinardi: bazada bironta ham qurilish e'loni bo'lmasa ham «9 soha» deb turaverardi. Haqiqiy son yonida turgan o'ylab topilgan son ikkalasiga ham ishonchni yo'qotadi.

**Soha filtridagi sanoq** ham shundan: odam bo'sh sohani bosib, bo'sh ro'yxatni ko'rib qaytmasligi uchun.

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

### E'lon holati — sanadan hisoblanadi

`status` bazada saqlanadi, lekin u faqat bitta savolga javob beradi: **e'lon qo'lda yopilganmi?** Faol / shoshilinch / tugagan — har doim `deadline` dan hisoblanadi.

Sababi oddiy: saqlangan holatni hech kim yangilab turmaydi. Ilgari muddati o'tgan e'lon abadiy «faol» bo'lib qolardi va odam qatnasha olmaydigan tenderni ko'rardi; «Shoshilinch» filtri esa qo'lda yozilgan yorliqni qaytarardi — eng tez tugaydigan e'lon unga tushmasdi.

Bir joyda hisoblanadi (`repositories/tenderRepository.js`) va API, kategoriya sahifasi hamda sitemap shu bitta shartdan foydalanadi.

### Tarif va limitlar
`config/plans.js` da — narx, imkoniyat va limitlar bir joyda. Sayt narxlar bo'limi shu manbadan render qilinadi, ya'ni reklama va amaldagi limit har doim mos.

Limit **muvaffaqiyatli so'rovdan keyin** sarflanadi: AI xato bersa yoki javob keshdan kelsa — limit yonmaydi.

Ro'yxatda **faqat amalda tekshiriladigan** farq yoziladi. Ilgari Pro «Tenderlarni taqqoslash» va «G'alaba strategiyasi» ni sotardi, holbuki ikkalasi bepul tarifda ham ochiq edi — kod ularni hech qachon cheklamagan. Tekshirilmaydigan limit — limit emas, va'da.

### Xavfsizlik

| Chora | Nima qiladi |
|---|---|
| **Token avlodi** | Chiqish yoki parol o'zgarishida oshiriladi — eski tokenlar darhol kuchsizlanadi. "Hamma qurilmadan chiqish" ham shu. |
| **CSP** | `script-src 'self'`, inline skript yo'q. Tender sarlavhalari tashqi manbadan keladi, ya'ni ishonchsiz matn — bu oxirgi to'siq. |
| **Qidiruv tozalash** | Foydalanuvchi kiritmasi hech qachon `new RegExp()` ga bermaydi. Busiz oddiy `C++` so'rovi ham serverni yiqitardi. |
| **Rol bazadan** | Har so'rovda tekshiriladi, tokendan olinmaydi. |

**Cheklovlar** (`config/index.js` → `rateLimits`): ro'yxatdan o'tish soatiga 5, kirish 15 daqiqada 10 (muvaffaqiyatli kirish sanalmaydi), SMS kodi soatiga 5. Test muhitida ular ataylab yuqori — barcha testlar bitta IP dan keladi.

### SMS: telefon tasdiqlash va parolni tiklash
`.env` da Eskiz.uz yoki Play Mobile kaliti bo'lsa yoqiladi:

- **Parolni unutdim** — kirish oynasida havola, SMS kodi bilan yangi parol o'rnatiladi
- **Telefonni tasdiqlash** — sozlamalarda

Kod 6 xonali, 5 daqiqa amal qiladi, 5 ta noto'g'ri urinishdan keyin bloklanadi. Bazada faqat hash saqlanadi.

`forgot-password` **raqam bazada bor-yo'qligini oshkor qilmaydi** — javob har doim bir xil, aks holda bu endpoint foydalanuvchilar ro'yxatini yig'ish vositasiga aylanardi.

Kalit yo'q bo'lsa interfeys buni ochiq aytadi. Development uchun `SMS_CONSOLE=true` — kod SMS o'rniga logga yoziladi.

Kalit umuman bo'lmasa, admin `/admin` → Foydalanuvchilar bo'limida vaqtinchalik parol bera oladi.

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

177 ta test. Integratsion testlar xotiradagi MongoDB bilan ishlaydi — tashqi klaster kerak emas.

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
