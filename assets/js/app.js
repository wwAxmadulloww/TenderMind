/* ═══════════════════════════════════════════════════════════════════
   TENDERMIND — ilova mantiqi
   ───────────────────────────────────────────────────────────────────
   Freymvorksiz, ES modul. Tender tafsiloti bu yerda EMAS — u server
   tomonda /tender/:id da render qilinadi, chunki u ulashiladigan va
   qidiruv tizimi indekslaydigan sahifa bo'lishi kerak.
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

// ── Holat ───────────────────────────────────────────────────────────
const state = {
  token: localStorage.getItem('tm_token') || '',
  user: safeParse(localStorage.getItem('tm_user')),
  view: 'browse',
  filters: { search: '', soha: 'all', hudud: 'all', status: 'active', sort: 'newest' },
  page: 1,
  results: { items: [], total: 0, pages: 1 },
  savedIds: new Set(),
  wonIds: new Set(),
  glossary: [],
  plans: [],
  compareSelection: new Set(),
};

function safeParse(raw) {
  try { return raw ? JSON.parse(raw) : null; } catch { return null; }
}

// ── Qisqartmalar ────────────────────────────────────────────────────
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const esc = (s) => String(s ?? '').replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const som = (n) => new Intl.NumberFormat('uz-UZ').format(Math.round(Number(n) || 0));

function daysLeft(deadline) {
  return Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000);
}

/** Muddatni odam o'qiydigan shaklda: "12 kun", "bugun", "tugagan" */
function deadlineText(deadline) {
  const d = daysLeft(deadline);
  if (d < 0) return { text: 'tugagan', urgent: true };
  if (d === 0) return { text: 'bugun tugaydi', urgent: true };
  if (d === 1) return { text: '1 kun qoldi', urgent: true };
  return { text: `${d} kun qoldi`, urgent: d <= 7 };
}

const SOHA = {
  it: 'IT', qurilish: 'Qurilish', tibbiyot: 'Tibbiyot', oziq: 'Oziq-ovqat',
  transport: 'Transport', talim: "Ta'lim", ekologiya: 'Ekologiya',
  qishloq: "Qishloq xo'jaligi", boshqa: 'Boshqa',
};

const HUDUD = {
  toshkent: 'Toshkent', samarqand: 'Samarqand', buxoro: 'Buxoro', andijon: 'Andijon',
  namangan: 'Namangan', fargona: "Farg'ona", qashqadaryo: 'Qashqadaryo',
  surxondaryo: 'Surxondaryo', xorazm: 'Xorazm', navoiy: 'Navoiy', jizzax: 'Jizzax',
  sirdaryo: 'Sirdaryo', qoraqalpogiston: "Qoraqalpog'iston", boshqa: 'Boshqa',
};

const labelOf = (map, key) => map[key] || key;

// ── Server bilan aloqa ──────────────────────────────────────────────
class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data || {};
  }
}

/**
 * Barcha so'rovlar shu yerdan o'tadi: token qo'shiladi, 401 bir joyda
 * boshqariladi. `auth: true` — token bo'lmasa kirish oynasi ochiladi.
 */
async function api(path, { auth = false, ...options } = {}) {
  if (auth && !state.token) {
    openModal('auth-modal');
    throw new ApiError('Bu amal uchun tizimga kiring', 401);
  }

  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;

  let response;
  try {
    response = await fetch(path, { ...options, headers });
  } catch {
    throw new ApiError('Serverga ulanib bo\'lmadi. Internetni tekshiring.', 0);
  }

  if (response.status === 401 && state.token) {
    signOut({ silent: true });
    openModal('auth-modal');
    throw new ApiError('Sessiya tugadi. Qaytadan kiring.', 401);
  }

  return response;
}

async function apiJson(path, options) {
  const response = await api(path, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(data.message || data.error || 'Server xatosi', response.status, data);
  return data;
}

// ── Bildirishnoma ───────────────────────────────────────────────────
function toast(message, kind = '') {
  const el = document.createElement('div');
  el.className = `toast${kind ? ` toast-${kind}` : ''}`;
  el.textContent = message;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), 4000);
}

// ── Oynalar ─────────────────────────────────────────────────────────
let lastFocused = null;

function openModal(id) {
  lastFocused = document.activeElement;
  const modal = document.getElementById(id);
  modal.hidden = false;
  modal.querySelector('input, button, [tabindex]')?.focus();
}

function closeModal(id) {
  document.getElementById(id).hidden = true;
  lastFocused?.focus();
}

document.addEventListener('click', (e) => {
  const closer = e.target.closest('[data-close]');
  if (closer) closeModal(closer.dataset.close);
  if (e.target.classList.contains('modal')) e.target.hidden = true;
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  $$('.modal:not([hidden])').forEach(m => { m.hidden = true; });
  if (!$('#chat').hidden) toggleChat(false);
  $('#term-pop').hidden = true;
});

// ── Ko'rinishlar (hash orqali — orqaga tugmasi ishlashi uchun) ──────
const VIEWS = ['browse', 'docs', 'work', 'account', 'guide', 'plans'];

function go(view, { push = true } = {}) {
  if (!VIEWS.includes(view)) view = 'browse';
  state.view = view;

  $$('.view').forEach(v => v.classList.toggle('is-active', v.id === `view-${view}`));
  $$('[data-go]').forEach(link => {
    const active = link.dataset.go === view;
    if (link.classList.contains('topnav-link') || link.classList.contains('mobilenav-link')) {
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
  });

  if (push && location.hash !== `#${view}`) history.pushState({ view }, '', `#${view}`);
  window.scrollTo({ top: 0, behavior: 'instant' });

  if (view === 'work') loadWork();
  if (view === 'account') loadAccount();
  if (view === 'guide') loadGuide();
  if (view === 'plans') loadPlans();
}

document.addEventListener('click', (e) => {
  const link = e.target.closest('[data-go]');
  if (!link) return;
  e.preventDefault();
  const view = link.dataset.go;
  if ((view === 'work' || view === 'account') && !state.token) {
    openModal('auth-modal');
    return;
  }
  go(view);
});

window.addEventListener('popstate', () => go(location.hash.slice(1) || 'browse', { push: false }));

// ═══════════════════════════════════════════════════════════════════
// AUTENTIFIKATSIYA
// ═══════════════════════════════════════════════════════════════════
function renderAuthState() {
  const signedIn = Boolean(state.token && state.user);

  $('#signin-btn').hidden = signedIn;
  $('#account').hidden = !signedIn;

  if (!signedIn) return;

  const name = state.user.name || 'Foydalanuvchi';
  $('#account-initial').textContent = name.trim().charAt(0).toUpperCase();
  $('#account-name').textContent = name.split(' ')[0];
  $('#menu-name').textContent = name;
  $('#menu-plan').textContent = state.user.phone || '';
}

function persistSession(data) {
  state.token = data.token;
  state.user = data.user;
  localStorage.setItem('tm_token', data.token);
  localStorage.setItem('tm_user', JSON.stringify(data.user));
  renderAuthState();
}

function signOut({ silent = false } = {}) {
  state.token = '';
  state.user = null;
  state.savedIds.clear();
  state.wonIds.clear();
  localStorage.removeItem('tm_token');
  localStorage.removeItem('tm_user');
  renderAuthState();
  renderResults();
  if (!silent) {
    toast('Hisobdan chiqdingiz');
    go('browse');
  }
}

$('#signin-btn').addEventListener('click', () => openModal('auth-modal'));
$('#signout-btn').addEventListener('click', () => signOut());

$('#account-btn').addEventListener('click', () => {
  const menu = $('#account-menu');
  const open = menu.hidden;
  menu.hidden = !open;
  $('#account-btn').setAttribute('aria-expanded', String(open));
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('#account')) {
    $('#account-menu').hidden = true;
    $('#account-btn')?.setAttribute('aria-expanded', 'false');
  }
});

$$('[data-auth-tab]').forEach(tab => {
  tab.addEventListener('click', () => {
    const mode = tab.dataset.authTab;
    $$('[data-auth-tab]').forEach(t => t.setAttribute('aria-selected', String(t === tab)));
    $('#login-form').hidden = mode !== 'login';
    $('#register-form').hidden = mode !== 'register';
    $('#auth-title').textContent = mode === 'login' ? 'Hisobingizga kiring' : 'Yangi hisob yarating';
  });
});

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const error = $('#login-error');
  error.textContent = '';
  form.querySelector('button').disabled = true;

  try {
    const data = await apiJson('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        phone: form.phone.value.trim(),
        password: form.password.value,
      }),
    });
    persistSession(data);
    closeModal('auth-modal');
    form.reset();
    toast(`Xush kelibsiz, ${data.user.name.split(' ')[0]}`, 'success');
    await Promise.all([loadSaved(), loadWon()]);
    renderResults();
  } catch (err) {
    error.textContent = err.message;
  } finally {
    form.querySelector('button').disabled = false;
  }
});

$('#register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const error = $('#register-error');
  error.textContent = '';
  form.querySelector('button').disabled = true;

  try {
    const data = await apiJson('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: form.name.value.trim(),
        phone: form.phone.value.trim(),
        company: form.company.value.trim(),
        password: form.password.value,
      }),
    });
    persistSession(data);
    closeModal('auth-modal');
    form.reset();
    toast('Hisob yaratildi. Qo\'llanmadan boshlashni tavsiya qilamiz.', 'success');
  } catch (err) {
    // Server maydonlar bo'yicha xato qaytarsa, birinchisini ko'rsatamiz
    const details = err.data.errors;
    error.textContent = details ? Object.values(details)[0] : err.message;
  } finally {
    form.querySelector('button').disabled = false;
  }
});

// ═══════════════════════════════════════════════════════════════════
// TENDERLARNI KO'RISH
// ═══════════════════════════════════════════════════════════════════
function buildQuery() {
  const params = new URLSearchParams({ page: String(state.page), limit: '12' });
  const { search, soha, hudud, status, sort } = state.filters;
  if (search) params.set('search', search);
  if (soha !== 'all') params.set('soha', soha);
  if (hudud !== 'all') params.set('hudud', hudud);
  if (status !== 'all') params.set('status', status);
  params.set('sort', sort);
  return params.toString();
}

async function loadResults() {
  renderSkeleton();
  try {
    const data = await apiJson(`/api/tenders?${buildQuery()}`);
    state.results = data;
    renderResults();
    renderPagination();
  } catch (err) {
    $('#results').innerHTML = `
      <div class="empty">
        <h3>Ro'yxatni yuklab bo'lmadi</h3>
        <p>${esc(err.message)}</p>
        <button type="button" class="btn btn-secondary" id="retry-results">Qaytadan urinish</button>
      </div>`;
    $('#retry-results')?.addEventListener('click', loadResults);
    $('#results-count').textContent = '';
  }
}

function renderSkeleton() {
  $('#results').innerHTML = Array.from({ length: 5 }, () => `
    <div class="row-skeleton">
      <div class="skeleton" style="width:22%"></div>
      <div class="skeleton" style="width:70%;height:15px"></div>
      <div class="skeleton" style="width:40%"></div>
    </div>`).join('');
  $('#results-count').textContent = 'Yuklanmoqda…';
}

function renderResults() {
  const { items, total } = state.results;
  const list = $('#results');

  $('#results-count').innerHTML = total
    ? `<b>${som(total)}</b> ta e'lon topildi`
    : 'Hech narsa topilmadi';

  if (!items.length) {
    list.innerHTML = `
      <div class="empty">
        <h3>Bu shartlarga mos e'lon yo'q</h3>
        <p>Filtrlarni kengaytiring yoki boshqa so'z bilan qidiring.</p>
        <button type="button" class="btn btn-secondary" id="empty-reset">Filtrlarni tozalash</button>
      </div>`;
    $('#empty-reset')?.addEventListener('click', resetFilters);
    return;
  }

  list.innerHTML = items.map(renderRow).join('');
}

function renderRow(t) {
  const deadline = deadlineText(t.deadline);
  const saved = state.savedIds.has(t.id);
  const lotCount = t.lotCount || 1;

  return `
  <article class="row" role="listitem" data-id="${esc(t.id)}">
    <div class="row-top">
      <span class="row-sector">${esc(labelOf(SOHA, t.soha))}</span>
      <span class="row-dot">·</span>
      <span class="row-region">${esc(labelOf(HUDUD, t.hudud))}</span>
      ${t.isDemo ? '<span class="chip chip-caution">DEMO</span>' : ''}
      ${t.isVerified === false && !t.isDemo ? '<span class="chip chip-neutral">Tekshirilmagan</span>' : ''}
      ${t.isVerified && !t.isDemo ? '<span class="chip chip-verified">Tasdiqlangan</span>' : ''}
    </div>

    <a href="/tender/${esc(t.id)}" class="row-title" style="display:block">${esc(t.title)}</a>
    <p class="row-org">${esc(t.org)}</p>

    <div class="row-facts">
      <span class="row-budget">${esc(t.budget)} so'm</span>

      <span class="row-fact">
        <span class="row-fact-label">Muddat</span>
        <span class="row-fact-value${deadline.urgent ? ' is-urgent' : ''}">${esc(deadline.text)}</span>
      </span>

      <span class="row-fact">
        <span class="row-fact-label">Lot</span>
        <span class="row-fact-value">${lotCount}</span>
      </span>

      <span class="row-actions">
        <button type="button" class="icon-btn" data-explain="${esc(t.id)}"
                title="Oddiy tilda tushuntirish" aria-label="Oddiy tilda tushuntirish">?</button>
        <button type="button" class="icon-btn" data-save="${esc(t.id)}"
                aria-pressed="${saved}" title="${saved ? 'Saqlanganlardan olib tashlash' : 'Saqlash'}"
                aria-label="Saqlash">
          <svg width="15" height="15" viewBox="0 0 20 20" fill="${saved ? 'currentColor' : 'none'}" aria-hidden="true">
            <path d="M5 3h10v14l-5-3.5L5 17z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
          </svg>
        </button>
      </span>
    </div>

    <div class="row-explain" id="explain-${esc(t.id)}" hidden></div>
  </article>`;
}

function renderPagination() {
  const { page, pages } = state.results;
  const nav = $('#pagination');

  if (!pages || pages < 2) { nav.innerHTML = ''; return; }

  // Ko'p sahifa bo'lsa hammasini chiqarmaymiz — joriysining atrofidagilar
  const window_ = 2;
  const numbers = [];
  for (let p = 1; p <= pages; p += 1) {
    if (p === 1 || p === pages || Math.abs(p - page) <= window_) numbers.push(p);
    else if (numbers[numbers.length - 1] !== '…') numbers.push('…');
  }

  nav.innerHTML = `
    <button type="button" class="page-btn" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''} aria-label="Oldingi">‹</button>
    ${numbers.map(n => n === '…'
      ? '<span class="page-btn" style="border:none">…</span>'
      : `<button type="button" class="page-btn" data-page="${n}" ${n === page ? 'aria-current="page"' : ''}>${n}</button>`
    ).join('')}
    <button type="button" class="page-btn" data-page="${page + 1}" ${page >= pages ? 'disabled' : ''} aria-label="Keyingi">›</button>`;
}

$('#pagination').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-page]');
  if (!btn || btn.disabled) return;
  state.page = Number(btn.dataset.page);
  loadResults();
  $('.results-head').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

// ── Qator ichidagi tushuntirish ────────────────────────────────────
$('#results').addEventListener('click', async (e) => {
  const explainBtn = e.target.closest('[data-explain]');
  if (explainBtn) return toggleRowExplain(explainBtn.dataset.explain);

  const saveBtn = e.target.closest('[data-save]');
  if (saveBtn) return toggleSave(saveBtn.dataset.save, saveBtn);
});

async function toggleRowExplain(tenderId) {
  const box = document.getElementById(`explain-${tenderId}`);
  if (!box) return;

  if (!box.hidden) { box.hidden = true; return; }

  box.hidden = false;
  if (box.dataset.loaded) return;

  box.innerHTML = '<span class="small muted">Yuklanmoqda…</span>';

  try {
    const { lots } = await apiJson(`/api/tenders/${tenderId}/lots`);
    const explained = lots.find(l => l.explanation && l.explanation.xulosa);

    if (explained) {
      box.innerHTML = esc(explained.explanation.xulosa)
        + ` <a href="/tender/${esc(tenderId)}" style="white-space:nowrap">Batafsil →</a>`;
    } else {
      // Tushuntirish hali yaratilmagan — yolg'on va'da bermaymiz
      box.innerHTML = `Bu e'lon uchun tushuntirish hali tayyorlanmagan.
        <a href="/tender/${esc(tenderId)}">Lotlarni ko'rish →</a>`;
    }
    box.dataset.loaded = '1';
  } catch (err) {
    box.innerHTML = `<span class="small muted">${esc(err.message)}</span>`;
  }
}

// ── Filtrlar ───────────────────────────────────────────────────────
function renderSectorFilter() {
  $('#filter-sectors').innerHTML = [['all', 'Barchasi'], ...Object.entries(SOHA)]
    .map(([key, name]) => `
      <button type="button" class="filter-option" data-soha="${key}"
              aria-pressed="${state.filters.soha === key}">${esc(name)}</button>`)
    .join('');

  $('#filter-region').innerHTML = '<option value="all">Barcha hududlar</option>'
    + Object.entries(HUDUD).map(([key, name]) =>
        `<option value="${key}"${state.filters.hudud === key ? ' selected' : ''}>${esc(name)}</option>`).join('');
}

$('#filter-sectors').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-soha]');
  if (!btn) return;
  state.filters.soha = btn.dataset.soha;
  state.page = 1;
  renderSectorFilter();
  loadResults();
});

$('#filter-region').addEventListener('change', (e) => {
  state.filters.hudud = e.target.value;
  state.page = 1;
  loadResults();
});

$('#filter-status').addEventListener('change', (e) => {
  state.filters.status = e.target.value;
  state.page = 1;
  loadResults();
});

$('#sort-select').addEventListener('change', (e) => {
  state.filters.sort = e.target.value;
  state.page = 1;
  loadResults();
});

$('#search-form').addEventListener('submit', (e) => {
  e.preventDefault();
  state.filters.search = $('#search-input').value.trim();
  state.page = 1;
  loadResults();
});

function resetFilters() {
  state.filters = { search: '', soha: 'all', hudud: 'all', status: 'active', sort: 'newest' };
  state.page = 1;
  $('#search-input').value = '';
  $('#filter-status').value = 'active';
  $('#sort-select').value = 'newest';
  renderSectorFilter();
  loadResults();
}

$('#filter-reset').addEventListener('click', resetFilters);

// ── Saqlash / yutganlar ────────────────────────────────────────────
async function loadSaved() {
  if (!state.token) return;
  try {
    const items = await apiJson('/api/saved');
    state.savedIds = new Set(items.map(t => t.id));
  } catch { /* jimgina — bu yordamchi ma'lumot */ }
}

async function loadWon() {
  if (!state.token) return;
  try {
    const items = await apiJson('/api/won');
    state.wonIds = new Set(items.map(t => t.id));
  } catch { /* jimgina */ }
}

async function toggleSave(id, button) {
  if (!state.token) { openModal('auth-modal'); return; }

  try {
    const data = await apiJson(`/api/saved/${id}`, { method: 'POST', auth: true });
    if (data.saved) state.savedIds.add(id); else state.savedIds.delete(id);

    button.setAttribute('aria-pressed', String(data.saved));
    button.querySelector('svg').setAttribute('fill', data.saved ? 'currentColor' : 'none');
    toast(data.saved ? 'Saqlandi' : 'Saqlanganlardan olib tashlandi');
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ═══════════════════════════════════════════════════════════════════
// MENING ISHIM
// ═══════════════════════════════════════════════════════════════════
async function loadWork() {
  if (!state.token) return;

  const [saved, won] = await Promise.all([
    apiJson('/api/saved').catch(() => []),
    apiJson('/api/won').catch(() => []),
  ]);

  state.savedIds = new Set(saved.map(t => t.id));
  state.wonIds = new Set(won.map(t => t.id));

  renderWorkList('#saved-list', saved, 'Hali hech narsa saqlamagansiz.',
    'Tenderlar ro\'yxatida yoqqan e\'lonni belgilab qo\'ying — shu yerda to\'planadi.');
  renderWorkList('#won-list', won, 'Hali yutgan tenderingiz belgilanmagan.',
    'Tenderni yutganingizda uni shu yerga qo\'shing — statistikangiz to\'planib boradi.');

  $('#compare-btn').hidden = saved.length < 2;
}

function renderWorkList(selector, items, emptyTitle, emptyText) {
  const box = $(selector);
  if (!items.length) {
    box.innerHTML = `<div class="empty"><h3>${esc(emptyTitle)}</h3><p>${esc(emptyText)}</p></div>`;
    return;
  }

  box.innerHTML = items.map(t => {
    const deadline = deadlineText(t.deadline);
    const selectable = selector === '#saved-list';
    return `
    <article class="row">
      <div class="row-top">
        <span class="row-sector">${esc(labelOf(SOHA, t.soha))}</span>
        <span class="row-dot">·</span>
        <span class="row-region">${esc(labelOf(HUDUD, t.hudud))}</span>
        ${t.isDemo ? '<span class="chip chip-caution">DEMO</span>' : ''}
      </div>
      <a href="/tender/${esc(t.id)}" class="row-title" style="display:block">${esc(t.title)}</a>
      <p class="row-org">${esc(t.org)}</p>
      <div class="row-facts">
        <span class="row-budget">${esc(t.budget)} so'm</span>
        <span class="row-fact">
          <span class="row-fact-label">Muddat</span>
          <span class="row-fact-value${deadline.urgent ? ' is-urgent' : ''}">${esc(deadline.text)}</span>
        </span>
        ${selectable ? `
        <span class="row-actions">
          <label class="small muted" style="display:flex;align-items:center;gap:6px">
            <input type="checkbox" data-compare="${esc(t.id)}"> solishtirish
          </label>
        </span>` : ''}
      </div>
    </article>`;
  }).join('');
}

$('#saved-list').addEventListener('change', (e) => {
  const box = e.target.closest('[data-compare]');
  if (!box) return;

  if (box.checked) state.compareSelection.add(box.dataset.compare);
  else state.compareSelection.delete(box.dataset.compare);

  // Ikkitadan ortiq tanlanmasin — solishtirish aynan ikkita uchun
  if (state.compareSelection.size > 2) {
    box.checked = false;
    state.compareSelection.delete(box.dataset.compare);
    toast('Bir vaqtda ikkitasini solishtirish mumkin');
  }
});

$('#compare-btn').addEventListener('click', async () => {
  if (state.compareSelection.size !== 2) {
    toast('Solishtirish uchun ikkita e\'lonni belgilang');
    return;
  }

  const [first, second] = [...state.compareSelection];
  openInfo('Solishtirish', '<p class="muted">Tahlil tayyorlanmoqda…</p>');

  try {
    const data = await apiJson('/api/ai/compare', {
      method: 'POST', auth: true,
      body: JSON.stringify({ tender1Id: first, tender2Id: second }),
    });
    renderComparison(data.comparison, data.aiGenerated);
  } catch (err) {
    $('#info-body').innerHTML = `<div class="notice notice-urgent">${esc(err.message)}</div>`;
  }
});

function renderComparison(c, aiGenerated) {
  const list = (items) => (items || []).map(x => `<li>${esc(x)}</li>`).join('');
  $('#info-body').innerHTML = `
    <div class="plain">
      <span class="plain-label">Xulosa</span>
      <div class="plain-item"><p>${esc(c.summary || '')}</p></div>
    </div>
    <div class="grid-2" style="margin-top:var(--s4)">
      <div>
        <h4 class="eyebrow" style="margin-bottom:var(--s2)">Birinchisining afzalliklari</h4>
        <ul style="list-style:disc;padding-left:18px">${list(c.advantages1)}</ul>
      </div>
      <div>
        <h4 class="eyebrow" style="margin-bottom:var(--s2)">Ikkinchisining afzalliklari</h4>
        <ul style="list-style:disc;padding-left:18px">${list(c.advantages2)}</ul>
      </div>
    </div>
    <div class="notice notice-seal" style="margin-top:var(--s4)">
      <strong>Tavsiya:</strong> ${esc(c.recommendation || '')}
    </div>
    ${!aiGenerated ? '<p class="small muted" style="margin-top:var(--s3)">Bu tahlil AI siz, faqat raqamlar asosida tuzildi.</p>' : ''}`;
}

function openInfo(title, html) {
  $('#info-title').textContent = title;
  $('#info-body').innerHTML = html;
  openModal('info-modal');
}

// ═══════════════════════════════════════════════════════════════════
// SOZLAMALAR
// ═══════════════════════════════════════════════════════════════════
async function loadAccount() {
  if (!state.token) return;

  $('#p-name').value = state.user?.name || '';
  $('#p-company').value = state.user?.company || '';

  renderBillingPanel();
  renderTelegramPanel();

  // Admin bo'lsa menyuda havola ko'rsatamiz
  try {
    const response = await api('/api/admin/stats');
    $('#menu-admin').hidden = !response.ok;
  } catch { /* admin emas — normal holat */ }
}

async function renderBillingPanel() {
  const panel = $('#panel-plan');
  try {
    const data = await apiJson('/api/billing/me');
    const pending = data.subscriptions.find(s => s.status === 'pending');

    const meter = (label, used, limit) => {
      const percent = Math.min(100, Math.round((used / limit) * 100));
      return `
        <div class="meter">
          <div class="meter-top"><span>${label}</span><b>${used} / ${limit}</b></div>
          <div class="meter-track"><div class="meter-fill${percent >= 100 ? ' is-full' : ''}" style="width:${percent}%"></div></div>
        </div>`;
    };

    panel.innerHTML = `
      <div class="panel-head">
        <h3>Tarif</h3>
        <span class="chip ${data.plan === 'free' ? 'chip-neutral' : 'chip-verified'}">${esc(data.planName)}</span>
      </div>
      <div class="grid-2" style="margin-bottom:var(--s4)">
        ${meter('Bugungi hujjatlar', data.usedToday.doc, data.limits.docPerDay)}
        ${meter('Bugungi AI xabarlar', data.usedToday.chat, data.limits.chatPerDay)}
      </div>
      ${data.planExpiresAt ? `<p class="small muted">Amal qilish muddati: ${new Date(data.planExpiresAt).toLocaleDateString('uz-UZ')}</p>` : ''}
      ${pending ? `
        <div class="notice notice-caution" style="margin-top:var(--s3)">
          <strong>To'lov kutilmoqda.</strong> Hisob-faktura ${esc(pending.invoiceNumber)} —
          ${som(pending.amount)} so'm. To'lov tasdiqlangach tarif faollashadi.
        </div>` : ''}
      ${data.plan === 'free' ? '<button type="button" class="btn btn-secondary" data-go="plans" style="margin-top:var(--s4)">Tariflarni ko\'rish</button>' : ''}`;
  } catch {
    panel.innerHTML = '<p class="muted small">Tarif ma\'lumotini yuklab bo\'lmadi.</p>';
  }
}

async function renderTelegramPanel() {
  const panel = $('#panel-telegram');
  try {
    const data = await apiJson('/api/auth/telegram-code');

    if (data.linked) {
      panel.innerHTML = `
        <div class="panel-head">
          <h3>Telegram xabarnomasi</h3>
          <span class="chip chip-verified">Ulangan</span>
        </div>
        <p class="small muted">Yangi mos e'lonlar chiqqanda xabar beramiz.
           Sozlamalarni botning o'zida o'zgartirasiz: <code>/sozlama</code></p>
        <button type="button" class="btn btn-secondary btn-sm" id="tg-unlink" style="margin-top:var(--s3)">Uzish</button>`;
      $('#tg-unlink').addEventListener('click', unlinkTelegram);
      return;
    }

    if (!data.botUsername) {
      panel.innerHTML = `
        <div class="panel-head">
          <h3>Telegram xabarnomasi</h3>
          <span class="chip chip-neutral">Yoqilmagan</span>
        </div>
        <p class="small muted">Bu funksiya hozircha ulanmagan.</p>`;
      return;
    }

    panel.innerHTML = `
      <div class="panel-head">
        <h3>Telegram xabarnomasi</h3>
        <span class="chip chip-neutral">Ulanmagan</span>
      </div>
      <p class="small muted" style="margin-bottom:var(--s3)">Yangi e'lonlar haqida Telegram orqali xabar oling.</p>
      <div style="display:flex;align-items:center;gap:var(--s3);flex-wrap:wrap">
        <code class="num" style="font-size:17px;font-weight:600;letter-spacing:.12em;background:var(--paper-sunk);padding:8px 14px;border-radius:6px">${esc(data.code)}</code>
        <a class="btn btn-primary" href="${esc(data.deepLink)}" target="_blank" rel="noopener noreferrer">Telegramda ochish</a>
      </div>
      <p class="small muted" style="margin-top:var(--s3)">Yoki botga yuboring: <code>/ulash ${esc(data.code)}</code></p>`;
  } catch {
    panel.innerHTML = '<p class="muted small">Telegram ma\'lumotini yuklab bo\'lmadi.</p>';
  }
}

async function unlinkTelegram() {
  if (!confirm('Telegram xabarnomasi uziladi. Davom etasizmi?')) return;
  try {
    await apiJson('/api/auth/telegram-unlink', { method: 'POST', auth: true });
    toast('Telegram uzildi');
    renderTelegramPanel();
  } catch (err) {
    toast(err.message, 'error');
  }
}

$('#profile-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const data = await apiJson('/api/auth/profile', {
      method: 'PUT', auth: true,
      body: JSON.stringify({
        name: e.target.name.value.trim(),
        company: e.target.company.value.trim(),
      }),
    });
    state.user = data.user;
    localStorage.setItem('tm_user', JSON.stringify(data.user));
    renderAuthState();
    toast('Saqlandi', 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
});

$('#password-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const error = $('#password-error');
  error.textContent = '';
  try {
    await apiJson('/api/auth/change-password', {
      method: 'PUT', auth: true,
      body: JSON.stringify({
        currentPassword: e.target.currentPassword.value,
        newPassword: e.target.newPassword.value,
      }),
    });
    e.target.reset();
    toast('Parol o\'zgartirildi', 'success');
  } catch (err) {
    error.textContent = err.message;
  }
});

// ═══════════════════════════════════════════════════════════════════
// HUJJATLAR
// ═══════════════════════════════════════════════════════════════════
const DOC_ORDER = [
  ['ariza', 'Ariza (Shakl №1)'],
  ['kafolat', 'Kafolat xati (Shakl №2)'],
  ['kompaniya', 'Kompaniya ma\'lumotlari (Shakl №3)'],
  ['texnik', 'Texnik taklif (Shakl №6)'],
  ['narx', 'Narx taklifi (Shakl №7)'],
  ['moliya', 'Moliyaviy holat'],
  ['vakolat', 'Vakolatnoma (Shakl №5)'],
];

let generatedDocs = null;

$('#doc-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!state.token) { openModal('auth-modal'); return; }

  const button = $('#doc-submit');
  const error = $('#doc-error');
  error.textContent = '';
  button.disabled = true;
  button.innerHTML = '<span class="spinner"></span> Tayyorlanmoqda…';

  const body = Object.fromEntries(new FormData(e.target).entries());

  try {
    const data = await apiJson('/api/generate', {
      method: 'POST', auth: true, body: JSON.stringify(body),
    });
    generatedDocs = data.docs;
    renderDocs(data.docs, data.model);
  } catch (err) {
    error.textContent = err.message;
  } finally {
    button.disabled = false;
    button.textContent = '7 ta hujjatni tayyorlash';
  }
});

function renderDocs(docs, model) {
  const box = $('#doc-result');
  box.hidden = false;

  box.innerHTML = `
    <div class="panel">
      <div class="panel-head">
        <h3>Tayyor hujjatlar</h3>
        <div style="display:flex;gap:var(--s2)">
          <button type="button" class="btn btn-secondary btn-sm" data-export="word">Word</button>
          <button type="button" class="btn btn-secondary btn-sm" data-export="pdf">PDF</button>
        </div>
      </div>

      <div class="notice notice-caution" style="margin-bottom:var(--s4)">
        <strong>Yuborishdan oldin tekshiring.</strong> Bu matnlar AI tomonidan
        tayyorlangan. Raqamlar, sanalar va rekvizitlarni o'zingiz solishtiring.
      </div>

      <div class="tabs" role="tablist" id="doc-tabs">
        ${DOC_ORDER.map(([key, name], i) => `
          <button type="button" class="tab" role="tab" data-doc="${key}"
                  aria-selected="${i === 0}">${esc(name.split(' (')[0])}</button>`).join('')}
      </div>

      <textarea class="textarea" id="doc-text" rows="18" spellcheck="false"></textarea>
      <p class="small muted" style="margin-top:var(--s2)">${esc(model || '')}</p>
    </div>`;

  showDoc(DOC_ORDER[0][0]);
  box.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function showDoc(key) {
  $('#doc-text').value = generatedDocs?.[key] || '';
  $$('#doc-tabs .tab').forEach(t => t.setAttribute('aria-selected', String(t.dataset.doc === key)));
}

$('#doc-result').addEventListener('click', (e) => {
  const tab = e.target.closest('[data-doc]');
  if (tab) return showDoc(tab.dataset.doc);

  const exportBtn = e.target.closest('[data-export]');
  if (exportBtn) return exportDocs(exportBtn.dataset.export);
});

// Tahrirlangan matn eksportga ham tushishi kerak
$('#doc-result').addEventListener('input', (e) => {
  if (e.target.id !== 'doc-text') return;
  const active = $('#doc-tabs .tab[aria-selected="true"]');
  if (active && generatedDocs) generatedDocs[active.dataset.doc] = e.target.value;
});

async function exportDocs(kind) {
  if (!generatedDocs) return;

  const company = $('#d-company').value.trim() || 'Kompaniya';
  const title = `TenderMind_${company}`.replace(/\s+/g, '_').slice(0, 100);

  toast(`${kind.toUpperCase()} tayyorlanmoqda…`);

  try {
    const response = await api(`/api/export/${kind}`, {
      method: 'POST', auth: true,
      body: JSON.stringify({ title, docs: generatedDocs }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new ApiError(err.message || err.error || 'Eksport xatosi', response.status);
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${title}.${kind === 'word' ? 'docx' : 'pdf'}`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast('Yuklab olindi', 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ═══════════════════════════════════════════════════════════════════
// QO'LLANMA
// ═══════════════════════════════════════════════════════════════════
let guideLoaded = false;

async function loadGuide() {
  if (guideLoaded) return;

  try {
    const [onboarding, glossary] = await Promise.all([
      apiJson('/api/onboarding'),
      apiJson('/api/glossary'),
    ]);

    state.glossary = glossary.terms;
    renderSteps(onboarding);
    renderGlossary(glossary.terms);
    guideLoaded = true;
  } catch (err) {
    $('#steps').innerHTML = `<div class="empty"><h3>Yuklab bo'lmadi</h3><p>${esc(err.message)}</p></div>`;
  }
}

function renderSteps({ steps, progress }) {
  const done = new Set(progress?.completedSteps || []);

  $('#steps').innerHTML = steps.map(step => `
    <article class="step${done.has(step.id) ? ' is-done' : ''}">
      <h3>${esc(step.title)}</h3>
      ${step.body.map(p => `<p>${withTerms(p)}</p>`).join('')}
      ${step.keyPoint ? `<div class="step-key">${esc(step.keyPoint)}</div>` : ''}
      ${state.token ? `
        <button type="button" class="btn btn-secondary btn-sm" data-step="${esc(step.id)}"
                ${done.has(step.id) ? 'disabled' : ''}>
          ${done.has(step.id) ? 'Bajarildi' : 'Tushundim'}
        </button>` : ''}
    </article>`).join('');
}

$('#steps').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-step]');
  if (!btn) return;

  try {
    await apiJson('/api/onboarding/progress', {
      method: 'POST', auth: true,
      body: JSON.stringify({ stepId: btn.dataset.step }),
    });
    btn.closest('.step').classList.add('is-done');
    btn.disabled = true;
    btn.textContent = 'Bajarildi';
  } catch (err) {
    toast(err.message, 'error');
  }
});

function renderGlossary(terms) {
  $('#glossary-list').innerHTML = terms.map(t => `
    <div class="panel" style="margin-bottom:var(--s3)">
      <h3 style="font-size:var(--t-h3);font-weight:600;margin-bottom:var(--s2)">${esc(t.term)}</h3>
      <p class="muted" style="margin-bottom:var(--s3)">${esc(t.short)}</p>
      <p style="font-family:var(--font-read);font-size:var(--t-body);font-style:italic;color:var(--ink-2)">
        ${esc(t.example)}
      </p>
    </div>`).join('');
}

/** Matndagi lug'at atamalarini belgilaydi — ustiga bosilsa izoh chiqadi */
function withTerms(text) {
  let html = esc(text);
  if (!state.glossary.length) return html;

  for (const entry of state.glossary) {
    const pattern = new RegExp(`\\b(${entry.aliases.map(escapeRe).join('|')})\\b`, 'iu');
    html = html.replace(pattern, (match) =>
      `<button type="button" class="term" data-term="${esc(entry.term)}">${match}</button>`);
  }
  return html;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

document.addEventListener('click', (e) => {
  const trigger = e.target.closest('[data-term]');
  const pop = $('#term-pop');

  if (!trigger) {
    if (!e.target.closest('#term-pop')) pop.hidden = true;
    return;
  }

  const entry = state.glossary.find(t => t.term === trigger.dataset.term);
  if (!entry) return;

  pop.innerHTML = `
    <h4>${esc(entry.term)}</h4>
    <p>${esc(entry.short)}</p>
    <p class="term-pop-example">${esc(entry.example)}</p>`;
  pop.hidden = false;

  const rect = trigger.getBoundingClientRect();
  const top = rect.bottom + window.scrollY + 6;
  const left = Math.min(
    rect.left + window.scrollX,
    window.innerWidth - pop.offsetWidth - 16
  );
  pop.style.top = `${top}px`;
  pop.style.left = `${Math.max(16, left)}px`;
});

// ═══════════════════════════════════════════════════════════════════
// TARIFLAR
// ═══════════════════════════════════════════════════════════════════
async function loadPlans() {
  if (state.plans.length) return;

  try {
    const data = await apiJson('/api/billing/plans');
    state.plans = data.plans;

    const check = '<svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M3 8.5l3.2 3.2L13 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    $('#plans').innerHTML = data.plans.map(plan => `
      <div class="plan${plan.id === 'pro' ? ' is-featured' : ''}">
        <div class="plan-name">${esc(plan.name)}</div>
        <div class="plan-price">
          <b>${som(plan.priceMonthly)}</b><span>so'm / oy</span>
        </div>
        <p class="plan-desc">${esc(plan.description)}</p>
        <ul class="plan-features">
          ${plan.features.map(f => `<li>${check}<span>${esc(f)}</span></li>`).join('')}
        </ul>
        ${plan.priceMonthly === 0
          ? '<button type="button" class="btn btn-secondary" data-go="browse">Tenderlarni ko\'rish</button>'
          : `<button type="button" class="btn btn-primary" data-subscribe="${esc(plan.id)}">Obuna bo'lish</button>`}
      </div>`).join('');

    const automatic = data.paymentMethods.filter(m => m.automatic);
    $('#plans-note').textContent = automatic.length
      ? 'To\'lov onlayn amalga oshiriladi.'
      : 'Hozircha to\'lov bank o\'tkazmasi orqali qabul qilinadi. Obuna bo\'lganingizda hisob-faktura beriladi; to\'lov tasdiqlangach tarif faollashadi.';
  } catch (err) {
    $('#plans').innerHTML = `<div class="empty"><h3>Tariflarni yuklab bo'lmadi</h3><p>${esc(err.message)}</p></div>`;
  }
}

$('#plans').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-subscribe]');
  if (!btn) return;

  if (!state.token) { openModal('auth-modal'); return; }

  const plan = state.plans.find(p => p.id === btn.dataset.subscribe);
  const months = Number(prompt(
    `${plan.name} tarifi — necha oyga?\n\n1 oy = ${som(plan.priceMonthly)} so'm\n12 oyga olsangiz 2 oy bepul.`,
    '1'
  ));
  if (!months || months < 1) return;

  try {
    const data = await apiJson('/api/billing/subscribe', {
      method: 'POST', auth: true,
      body: JSON.stringify({ plan: plan.id, months, paymentMethod: 'transfer' }),
    });
    renderInvoice(data);
  } catch (err) {
    toast(err.message, 'error');
  }
});

function renderInvoice(data) {
  const inv = data.invoice;
  openInfo('Hisob-faktura', `
    ${data.alreadyPending ? '<div class="notice notice-caution" style="margin-bottom:var(--s4)">Sizda tasdiqlanmagan hisob-faktura bor. Yangisi yaratilmadi.</div>' : ''}
    <dl class="facts" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">
      <div><dt>Tarif</dt><dd>${esc(inv.planName || inv.plan)}</dd></div>
      <div><dt>Summa</dt><dd>${som(inv.amount)} ${esc(inv.currency)}</dd></div>
      <div><dt>Hisob-faktura</dt><dd>${esc(inv.invoiceNumber)}</dd></div>
    </dl>
    <ol style="list-style:decimal;padding-left:20px;margin-top:var(--s4)">
      ${(data.instructions || []).map(s => `<li style="margin-bottom:6px;color:var(--ink-2)">${esc(s)}</li>`).join('')}
    </ol>
    <p class="small muted" style="margin-top:var(--s4)">
      Tarif to'lov tasdiqlangandan keyin faollashadi. Hozircha bepul tarif imkoniyatlaridan foydalanishingiz mumkin.
    </p>`);
}

// ═══════════════════════════════════════════════════════════════════
// AI MASLAHATCHI
// ═══════════════════════════════════════════════════════════════════
const chat = { history: [], busy: false };

const CHAT_SUGGESTIONS = [
  'Tender nima va qanday ishlaydi?',
  'Birinchi marta qatnashmoqchiman, nimadan boshlayman?',
  'Qanday hujjatlar kerak?',
  'Narxni qanday belgilash kerak?',
];

function toggleChat(open) {
  $('#chat').hidden = !open;
  $('#chat-toggle').hidden = open;
  if (open) {
    if (!chat.history.length) renderChatIntro();
    $('#chat-input').focus();
  }
}

$('#chat-toggle').addEventListener('click', () => toggleChat(true));
$('#chat-close').addEventListener('click', () => toggleChat(false));
$('#chat-clear').addEventListener('click', () => {
  chat.history = [];
  renderChatIntro();
});

function renderChatIntro() {
  $('#chat-body').innerHTML = `
    <div class="msg msg-bot">
      Salom! Tender va davlat xaridlari bo'yicha savolingizga javob beraman.
      Bilmagan narsangizni bemalol so'rang — sodda tilda tushuntiraman.
    </div>
    <div class="chat-suggestions">
      ${CHAT_SUGGESTIONS.map(s => `<button type="button" class="chat-suggestion">${esc(s)}</button>`).join('')}
    </div>`;
}

$('#chat-body').addEventListener('click', (e) => {
  const suggestion = e.target.closest('.chat-suggestion');
  if (!suggestion) return;
  $('#chat-input').value = suggestion.textContent;
  $('#chat-form').requestSubmit();
});

$('#chat-input').addEventListener('input', (e) => {
  e.target.style.height = 'auto';
  e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
});

$('#chat-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    $('#chat-form').requestSubmit();
  }
});

$('#chat-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const input = $('#chat-input');
  const message = input.value.trim();
  if (!message || chat.busy) return;

  if (!state.token) { openModal('auth-modal'); return; }

  // Taklif tugmalari birinchi savoldan keyin kerak emas
  $('.chat-suggestions')?.remove();

  appendMessage('user', message);
  chat.history.push({ role: 'user', content: message });
  input.value = '';
  input.style.height = 'auto';

  chat.busy = true;
  $('#chat-send').disabled = true;
  const typing = appendMessage('bot', '…');

  try {
    const response = await api('/api/chat', {
      method: 'POST', auth: true,
      body: JSON.stringify({ message, history: chat.history.slice(0, -1).slice(-20) }),
    });
    const data = await response.json().catch(() => ({}));
    typing.remove();

    if (!response.ok) {
      appendMessage('bot', data.message || data.error || 'Server xatosi');
      return;
    }

    appendMessage('bot', data.reply, { markdown: true });
    chat.history.push({ role: 'assistant', content: data.reply });
  } catch (err) {
    typing.remove();
    appendMessage('bot', err.message);
  } finally {
    chat.busy = false;
    $('#chat-send').disabled = false;
  }
});

function appendMessage(role, text, { markdown = false } = {}) {
  const el = document.createElement('div');
  el.className = `msg msg-${role}`;
  el.innerHTML = markdown ? miniMarkdown(text) : esc(text);
  $('#chat-body').append(el);
  $('#chat-body').scrollTop = $('#chat-body').scrollHeight;
  return el;
}

/** Juda cheklangan markdown — faqat qalin, kod va qator ko'chirish */
function miniMarkdown(text) {
  return esc(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>');
}

// ═══════════════════════════════════════════════════════════════════
// ISHGA TUSHIRISH
// ═══════════════════════════════════════════════════════════════════
async function loadStats() {
  try {
    const [tenders, glossary] = await Promise.all([
      apiJson('/api/tenders?limit=1&status=active'),
      apiJson('/api/glossary').catch(() => ({ terms: [] })),
    ]);

    state.glossary = glossary.terms || [];

    // Faqat serverdan kelgan haqiqiy son ko'rsatiladi. Lotlar soni uchun
    // umumiy hisob endpointi yo'q — taxmin qilib yozish ma'lumotni
    // soxtalashtirish bo'lardi, shuning uchun u ko'rsatilmaydi.
    $('#stat-tenders').textContent = som(tenders.total);
    $('#stat-sectors').textContent = String(Object.keys(SOHA).length);
    $('#stat-regions').textContent = String(Object.keys(HUDUD).length);
  } catch {
    $('#search-stats').hidden = true;
  }
}

async function init() {
  renderAuthState();
  renderSectorFilter();

  go(location.hash.slice(1) || 'browse', { push: false });

  await loadResults();
  loadStats();

  if (state.token) {
    await Promise.all([loadSaved(), loadWon()]);
    renderResults();
  }
}

init();
