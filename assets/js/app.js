/* ═══════════════════════════════════════════════════════════════════
   TENDERMIND — ilova mantiqi
   ───────────────────────────────────────────────────────────────────
   Freymvorksiz, ES modul. Tender tafsiloti bu yerda EMAS — u server
   tomonda /tender/:id da render qilinadi, chunki u ulashiladigan va
   qidiruv tizimi indekslaydigan sahifa bo'lishi kerak.
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

import {
  t, initLang, setLang, getLang, onLangChange,
  sectorName, regionName, sectorKeys, regionKeys, LANGS,
} from './i18n.js';

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
  if (d < 0) return { text: t('time.expired'), urgent: true };
  if (d === 0) return { text: t('time.today'), urgent: true };
  if (d === 1) return { text: t('time.oneDay'), urgent: true };
  return { text: t('time.days', { n: d }), urgent: d <= 7 };
}

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
    throw new ApiError(t('auth.needSignin'), 401);
  }

  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;

  let response;
  try {
    response = await fetch(path, { ...options, headers });
  } catch {
    throw new ApiError(t('common.offline'), 0);
  }

  if (response.status === 401 && state.token) {
    signOut({ silent: true });
    openModal('auth-modal');
    throw new ApiError(t('auth.expired'), 401);
  }

  return response;
}

async function apiJson(path, options) {
  const response = await api(path, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(data.message || data.error || t('common.serverError'), response.status, data);
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

async function signOut({ silent = false } = {}) {
  // Serverga xabar beramiz — u token avlodini oshiradi va shu paytgacha
  // berilgan barcha tokenlar kuchsizlanadi. Xato bo'lsa ham lokal
  // sessiyani baribir tozalaymiz: foydalanuvchi chiqqanini kutadi.
  if (state.token && !silent) {
    await apiJson('/api/auth/logout', { method: 'POST' }).catch(() => {});
  }

  state.token = '';
  state.user = null;
  state.savedIds.clear();
  state.wonIds.clear();
  localStorage.removeItem('tm_token');
  localStorage.removeItem('tm_user');
  renderAuthState();
  renderResults();
  if (!silent) {
    toast(t('auth.signedOut'));
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

/**
 * Kirish oynasida to'rt holat: kirish, ro'yxatdan o'tish, raqam so'rash
 * va kod kiritish. Yorliqlar faqat birinchi ikkitasini boshqaradi,
 * qolgan ikkitasiga parolni tiklash oqimi olib boradi.
 */
function showAuthMode(mode) {
  const forms = { login: '#login-form', register: '#register-form', forgot: '#forgot-form', reset: '#reset-form' };
  for (const [name, selector] of Object.entries(forms)) {
    $(selector).hidden = name !== mode;
  }

  $$('[data-auth-tab]').forEach(el =>
    el.setAttribute('aria-selected', String(el.dataset.authTab === mode)));

  const titles = {
    login: 'auth.signinTitle', register: 'auth.registerTitle',
    forgot: 'auth.resetTitle', reset: 'auth.resetTitle',
  };
  $('#auth-title').textContent = t(titles[mode]);

  // Yorliqlar faqat kirish/ro'yxat holatlarida mazmunli
  $('.tabs').hidden = mode === 'forgot' || mode === 'reset';
}

$$('[data-auth-tab]').forEach(tab => {
  tab.addEventListener('click', () => showAuthMode(tab.dataset.authTab));
});

// ── Parolni tiklash ─────────────────────────────────────────────────
let resetPhone = '';

$('#forgot-link').addEventListener('click', async () => {
  // SMS ulanmagan bo'lsa oqimni umuman ochmaymiz — foydalanuvchini
  // ishlamaydigan formaga olib borish o'rniga sababini aytamiz.
  try {
    const { available } = await apiJson('/api/auth/sms-status');
    if (!available) return toast(t('auth.smsOff'), 'error');
  } catch { /* holat noma'lum — oqimni ochaveramiz */ }

  $('#f-phone').value = $('#l-phone').value.trim();
  showAuthMode('forgot');
});

$('#forgot-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const error = $('#forgot-error');
  const button = e.target.querySelector('button[type="submit"]');
  error.textContent = '';
  button.disabled = true;

  try {
    resetPhone = e.target.phone.value.trim();
    await apiJson('/api/auth/forgot-password', {
      method: 'POST', body: JSON.stringify({ phone: resetPhone }),
    });
    $('#reset-hint').textContent = t('auth.codeSent', { phone: resetPhone });
    showAuthMode('reset');
    $('#rs-code').focus();
  } catch (err) {
    error.textContent = err.data?.message || err.message;
  } finally {
    button.disabled = false;
  }
});

$('#reset-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const error = $('#reset-error');
  const button = e.target.querySelector('button[type="submit"]');
  error.textContent = '';
  button.disabled = true;

  try {
    const data = await apiJson('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({
        phone: resetPhone,
        code: e.target.code.value.trim(),
        newPassword: e.target.newPassword.value,
      }),
    });

    // Server darhol token beradi — foydalanuvchi qayta kirmaydi
    persistSession(data);
    closeModal('auth-modal');
    e.target.reset();
    showAuthMode('login');
    toast(t('auth.resetDone'), 'success');
    await Promise.all([loadSaved(), loadWon()]);
    renderResults();
  } catch (err) {
    error.textContent = err.message;
  } finally {
    button.disabled = false;
  }
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
    toast(t('auth.welcome', { name: data.user.name.split(' ')[0] }), 'success');
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
    toast(t('auth.registered'), 'success');
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
        <h3>${esc(t('results.failTitle'))}</h3>
        <p>${esc(err.message)}</p>
        <button type="button" class="btn btn-secondary" id="retry-results">${esc(t('results.retry'))}</button>
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
  $('#results-count').textContent = t('results.loading');
}

function renderResults() {
  const { items, total } = state.results;
  const list = $('#results');

  $('#results-count').innerHTML = total
    ? `<b>${som(total)}</b> ${esc(t('results.found'))}`
    : esc(t('results.none'));

  if (!items.length) {
    list.innerHTML = `
      <div class="empty">
        <h3>${esc(t('results.emptyTitle'))}</h3>
        <p>${esc(t('results.emptyText'))}</p>
        <button type="button" class="btn btn-secondary" id="empty-reset">${esc(t('filter.reset'))}</button>
      </div>`;
    $('#empty-reset')?.addEventListener('click', resetFilters);
    return;
  }

  list.innerHTML = items.map(renderRow).join('');
}

function renderRow(item) {
  const deadline = deadlineText(item.deadline);
  const saved = state.savedIds.has(item.id);
  const lotCount = item.lotCount || 1;

  return `
  <article class="row" role="listitem" data-id="${esc(item.id)}">
    <div class="row-top">
      <span class="row-sector">${esc(sectorName(item.soha))}</span>
      <span class="row-dot">·</span>
      <span class="row-region">${esc(regionName(item.hudud))}</span>
      ${item.isDemo ? `<span class="chip chip-caution">${esc(t('row.demo'))}</span>` : ''}
      ${item.isVerified === false && !item.isDemo ? `<span class="chip chip-neutral">${esc(t('row.unverified'))}</span>` : ''}
      ${item.isVerified && !item.isDemo ? `<span class="chip chip-verified">${esc(t('row.verified'))}</span>` : ''}
    </div>

    <a href="/tender/${esc(item.id)}" class="row-title" style="display:block">${esc(item.title)}</a>
    <p class="row-org">${esc(item.org)}</p>

    <div class="row-facts">
      <span class="row-budget">${esc(item.budget)} ${esc(t('row.som'))}</span>

      <span class="row-fact">
        <span class="row-fact-label">${esc(t('row.deadline'))}</span>
        <span class="row-fact-value${deadline.urgent ? ' is-urgent' : ''}">${esc(deadline.text)}</span>
      </span>

      <span class="row-fact">
        <span class="row-fact-label">${esc(t('row.lots'))}</span>
        <span class="row-fact-value">${lotCount}</span>
      </span>

      <span class="row-actions">
        <button type="button" class="icon-btn" data-explain="${esc(item.id)}"
                title="${esc(t('row.explain'))}" aria-label="${esc(t('row.explain'))}">?</button>
        <button type="button" class="icon-btn" data-save="${esc(item.id)}"
                aria-pressed="${saved}" title="${esc(t(saved ? 'row.unsave' : 'row.save'))}"
                aria-label="${esc(t('row.save'))}">
          <svg width="15" height="15" viewBox="0 0 20 20" fill="${saved ? 'currentColor' : 'none'}" aria-hidden="true">
            <path d="M5 3h10v14l-5-3.5L5 17z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
          </svg>
        </button>
      </span>
    </div>

    <div class="row-explain" id="explain-${esc(item.id)}" hidden></div>
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

  box.innerHTML = `<span class="small muted">${esc(t('results.loading'))}</span>`;

  try {
    const { lots } = await apiJson(`/api/tenders/${tenderId}/lots`);
    const explained = lots.find(l => l.explanation && l.explanation.xulosa);

    if (explained) {
      box.innerHTML = esc(explained.explanation.xulosa)
        + ` <a href="/tender/${esc(tenderId)}" style="white-space:nowrap">${esc(t('row.more'))}</a>`;
    } else {
      // Tushuntirish hali yaratilmagan — yolg'on va'da bermaymiz
      box.innerHTML = `${esc(t('row.noExplanation'))}
        <a href="/tender/${esc(tenderId)}">${esc(t('row.viewLots'))}</a>`;
    }
    box.dataset.loaded = '1';
  } catch (err) {
    box.innerHTML = `<span class="small muted">${esc(err.message)}</span>`;
  }
}

// ── Filtrlar ───────────────────────────────────────────────────────
/**
 * Filtr va saralash ro'yxatlari JS da quriladi — til almashtirilganda
 * ular ham qayta chiziladi. HTML da qo'lda yozilgan variantlar tarjima
 * qilinmay qolib ketardi.
 */
function renderSectorFilter() {
  const sectors = [['all', t('filter.all')], ...sectorKeys().map(k => [k, sectorName(k)])];
  $('#filter-sectors').innerHTML = sectors
    .map(([key, name]) => `
      <button type="button" class="filter-option" data-soha="${key}"
              aria-pressed="${state.filters.soha === key}">${esc(name)}</button>`)
    .join('');

  $('#filter-region').innerHTML = `<option value="all">${esc(t('filter.allRegions'))}</option>`
    + regionKeys().map(key =>
        `<option value="${key}"${state.filters.hudud === key ? ' selected' : ''}>${esc(regionName(key))}</option>`).join('');

  const option = (value, label, selected) =>
    `<option value="${value}"${selected === value ? ' selected' : ''}>${esc(label)}</option>`;

  $('#filter-status').innerHTML =
      option('active', t('filter.statusActive'), state.filters.status)
    + option('all', t('filter.statusAll'), state.filters.status)
    + option('urgent', t('filter.statusUrgent'), state.filters.status);

  $('#sort-select').innerHTML =
      option('newest', t('results.sortNewest'), state.filters.sort)
    + option('date', t('results.sortDeadline'), state.filters.sort)
    + option('budget', t('results.sortBudget'), state.filters.sort);
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
    state.savedIds = new Set(items.map(item => item.id));
  } catch { /* jimgina — bu yordamchi ma'lumot */ }
}

async function loadWon() {
  if (!state.token) return;
  try {
    const items = await apiJson('/api/won');
    state.wonIds = new Set(items.map(item => item.id));
  } catch { /* jimgina */ }
}

async function toggleSave(id, button) {
  if (!state.token) { openModal('auth-modal'); return; }

  try {
    const data = await apiJson(`/api/saved/${id}`, { method: 'POST', auth: true });
    if (data.saved) state.savedIds.add(id); else state.savedIds.delete(id);

    button.setAttribute('aria-pressed', String(data.saved));
    button.querySelector('svg').setAttribute('fill', data.saved ? 'currentColor' : 'none');
    toast(t(data.saved ? 'account.saved' : 'row.unsave'));
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

  state.savedIds = new Set(saved.map(item => item.id));
  state.wonIds = new Set(won.map(item => item.id));

  renderWorkList('#saved-list', saved, t('work.savedEmptyTitle'), t('work.savedEmptyText'));
  renderWorkList('#won-list', won, t('work.wonEmptyTitle'), t('work.wonEmptyText'));

  $('#compare-btn').hidden = saved.length < 2;
}

function renderWorkList(selector, items, emptyTitle, emptyText) {
  const box = $(selector);
  if (!items.length) {
    box.innerHTML = `<div class="empty"><h3>${esc(emptyTitle)}</h3><p>${esc(emptyText)}</p></div>`;
    return;
  }

  box.innerHTML = items.map(item => {
    const deadline = deadlineText(item.deadline);
    const selectable = selector === '#saved-list';
    return `
    <article class="row">
      <div class="row-top">
        <span class="row-sector">${esc(sectorName(item.soha))}</span>
        <span class="row-dot">·</span>
        <span class="row-region">${esc(regionName(item.hudud))}</span>
        ${item.isDemo ? `<span class="chip chip-caution">${esc(t('row.demo'))}</span>` : ''}
      </div>
      <a href="/tender/${esc(item.id)}" class="row-title" style="display:block">${esc(item.title)}</a>
      <p class="row-org">${esc(item.org)}</p>
      <div class="row-facts">
        <span class="row-budget">${esc(item.budget)} ${esc(t('row.som'))}</span>
        <span class="row-fact">
          <span class="row-fact-label">${esc(t('row.deadline'))}</span>
          <span class="row-fact-value${deadline.urgent ? ' is-urgent' : ''}">${esc(deadline.text)}</span>
        </span>
        ${selectable ? `
        <span class="row-actions">
          <label class="small muted" style="display:flex;align-items:center;gap:6px">
            <input type="checkbox" data-compare="${esc(item.id)}"> ${esc(t('work.compareLabel'))}
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
    toast(t('work.compareLimit'));
  }
});

$('#compare-btn').addEventListener('click', async () => {
  if (state.compareSelection.size !== 2) {
    toast(t('work.compareHint'));
    return;
  }

  const [first, second] = [...state.compareSelection];
  openInfo(t('work.compareTitle'), `<p class="muted">${esc(t('work.comparing'))}</p>`);

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
      <span class="plain-label">${esc(t('work.compareTitle'))}</span>
      <div class="plain-item"><p>${esc(c.summary || '')}</p></div>
    </div>
    <div class="grid-2" style="margin-top:var(--s4)">
      <div>
        <h4 class="eyebrow" style="margin-bottom:var(--s2)">${esc(t('work.adv1'))}</h4>
        <ul style="list-style:disc;padding-left:18px">${list(c.advantages1)}</ul>
      </div>
      <div>
        <h4 class="eyebrow" style="margin-bottom:var(--s2)">${esc(t('work.adv2'))}</h4>
        <ul style="list-style:disc;padding-left:18px">${list(c.advantages2)}</ul>
      </div>
    </div>
    <div class="notice notice-seal" style="margin-top:var(--s4)">
      <strong>${esc(t('work.recommendation'))}</strong> ${esc(c.recommendation || '')}
    </div>
    ${!aiGenerated ? `<p class="small muted" style="margin-top:var(--s3)">${esc(t('work.noAi'))}</p>` : ''}`;
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
  renderPhonePanel();
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
        <h3>${esc(t('account.plan'))}</h3>
        <span class="chip ${data.plan === 'free' ? 'chip-neutral' : 'chip-verified'}">${esc(data.planName)}</span>
      </div>
      <div class="grid-2" style="margin-bottom:var(--s4)">
        ${meter(t('account.docsToday'), data.usedToday.doc, data.limits.docPerDay)}
        ${meter(t('account.chatToday'), data.usedToday.chat, data.limits.chatPerDay)}
      </div>
      ${data.planExpiresAt ? `<p class="small muted">${esc(t('account.expires'))}: ${new Date(data.planExpiresAt).toLocaleDateString(getLang())}</p>` : ''}
      ${pending ? `
        <div class="notice notice-caution" style="margin-top:var(--s3)">
          <strong>${esc(t('account.pendingPayment'))}</strong>
          ${esc(t('account.pendingText', { invoice: pending.invoiceNumber, amount: som(pending.amount) }))}
        </div>` : ''}
      ${data.plan === 'free' ? `<button type="button" class="btn btn-secondary" data-go="plans" style="margin-top:var(--s4)">${esc(t('account.viewPlans'))}</button>` : ''}`;
  } catch {
    panel.innerHTML = '<p class="muted small">Tarif ma\'lumotini yuklab bo\'lmadi.</p>';
  }
}

/** Sozlamalardagi telefon tasdiqlash bloki */
async function renderPhonePanel() {
  const panel = $('#panel-phone');
  const phone = state.user?.phone || '';

  let smsAvailable = false;
  try {
    smsAvailable = (await apiJson('/api/auth/sms-status')).available;
  } catch { /* noma'lum — ulanmagan deb hisoblaymiz */ }

  let verified = false;
  try {
    verified = Boolean((await apiJson('/api/auth/me')).user?.phoneVerified);
  } catch { /* jimgina */ }

  const head = (chipClass, chipKey) => `
    <div class="panel-head">
      <h3>${esc(t('phone.title'))}</h3>
      <span class="chip ${chipClass}">${esc(t(chipKey))}</span>
    </div>
    <p class="small muted" style="margin-bottom:var(--s3)">${esc(phone)}</p>`;

  if (verified) {
    panel.innerHTML = head('chip-verified', 'phone.verified');
    return;
  }

  if (!smsAvailable) {
    panel.innerHTML = head('chip-neutral', 'phone.unverified')
      + `<p class="small muted">${esc(t('phone.smsOff'))}</p>`;
    return;
  }

  panel.innerHTML = head('chip-caution', 'phone.unverified')
    + `<p class="small muted" style="margin-bottom:var(--s3)">${esc(t('phone.why'))}</p>
       <button type="button" class="btn btn-secondary btn-sm" id="phone-send">${esc(t('phone.send'))}</button>
       <div id="phone-verify-box" hidden style="margin-top:var(--s3)">
         <div class="field" style="max-width:200px;margin-bottom:var(--s2)">
           <label class="field-label" for="phone-code">${esc(t('phone.enterCode'))}</label>
           <input id="phone-code" class="input" inputmode="numeric" maxlength="6"
                  autocomplete="one-time-code" placeholder="123456">
         </div>
         <p class="field-error" id="phone-error"></p>
         <button type="button" class="btn btn-primary btn-sm" id="phone-verify">${esc(t('phone.verify'))}</button>
       </div>`;

  $('#phone-send').addEventListener('click', async (e) => {
    e.target.disabled = true;
    try {
      await apiJson('/api/auth/send-code', { method: 'POST', auth: true });
      $('#phone-verify-box').hidden = false;
      $('#phone-code').focus();
    } catch (err) {
      toast(err.data?.message || err.message, 'error');
      e.target.disabled = false;
    }
  });

  $('#phone-verify').addEventListener('click', async () => {
    const error = $('#phone-error');
    error.textContent = '';
    try {
      await apiJson('/api/auth/verify-phone', {
        method: 'POST', auth: true,
        body: JSON.stringify({ code: $('#phone-code').value.trim() }),
      });
      toast(t('phone.done'), 'success');
      renderPhonePanel();
    } catch (err) {
      error.textContent = err.message;
    }
  });
}

async function renderTelegramPanel() {
  const panel = $('#panel-telegram');
  try {
    const data = await apiJson('/api/auth/telegram-code');

    if (data.linked) {
      panel.innerHTML = `
        <div class="panel-head">
          <h3>${esc(t('account.telegram'))}</h3>
          <span class="chip chip-verified">${esc(t('account.linked'))}</span>
        </div>
        <p class="small muted">${esc(t('account.telegramText'))}</p>
        <button type="button" class="btn btn-secondary btn-sm" id="tg-unlink" style="margin-top:var(--s3)">${esc(t('account.unlink'))}</button>`;
      $('#tg-unlink').addEventListener('click', unlinkTelegram);
      return;
    }

    if (!data.botUsername) {
      panel.innerHTML = `
        <div class="panel-head">
          <h3>${esc(t('account.telegram'))}</h3>
          <span class="chip chip-neutral">${esc(t('account.telegramOff'))}</span>
        </div>
        <p class="small muted">${esc(t('account.telegramOffText'))}</p>`;
      return;
    }

    panel.innerHTML = `
      <div class="panel-head">
        <h3>${esc(t('account.telegram'))}</h3>
        <span class="chip chip-neutral">${esc(t('account.notLinked'))}</span>
      </div>
      <p class="small muted" style="margin-bottom:var(--s3)">${esc(t('account.telegramInvite'))}</p>
      <div style="display:flex;align-items:center;gap:var(--s3);flex-wrap:wrap">
        <code class="num" style="font-size:17px;font-weight:600;letter-spacing:.12em;background:var(--paper-sunk);padding:8px 14px;border-radius:6px">${esc(data.code)}</code>
        <a class="btn btn-primary" href="${esc(data.deepLink)}" target="_blank" rel="noopener noreferrer">${esc(t('account.openTelegram'))}</a>
      </div>
      <p class="small muted" style="margin-top:var(--s3)">${esc(t('account.orSend'))} <code>/ulash ${esc(data.code)}</code></p>`;
  } catch {
    panel.innerHTML = '<p class="muted small">Telegram ma\'lumotini yuklab bo\'lmadi.</p>';
  }
}

async function unlinkTelegram() {
  if (!confirm(t('account.unlinkConfirm'))) return;
  try {
    await apiJson('/api/auth/telegram-unlink', { method: 'POST', auth: true });
    toast(t('account.unlinked'));
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
    toast(t('account.saved'), 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
});

$('#password-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const error = $('#password-error');
  error.textContent = '';
  try {
    const data = await apiJson('/api/auth/change-password', {
      method: 'PUT', auth: true,
      body: JSON.stringify({
        currentPassword: e.target.currentPassword.value,
        newPassword: e.target.newPassword.value,
      }),
    });

    // Parol almashgach eski tokenlar bekor qilinadi — server yangisini
    // beradi, aks holda foydalanuvchi o'z amalidan keyin tashqarida qolardi.
    if (data.token) {
      state.token = data.token;
      localStorage.setItem('tm_token', data.token);
    }

    e.target.reset();
    toast(data.message || t('account.passwordChanged'), 'success');
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
  button.innerHTML = `<span class="spinner"></span> ${esc(t('docs.generating'))}`;

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
    button.textContent = t('docs.generate');
  }
});

function renderDocs(docs, model) {
  const box = $('#doc-result');
  box.hidden = false;

  box.innerHTML = `
    <div class="panel">
      <div class="panel-head">
        <h3>${esc(t('docs.ready'))}</h3>
        <div style="display:flex;gap:var(--s2)">
          <button type="button" class="btn btn-secondary btn-sm" data-export="word">Word</button>
          <button type="button" class="btn btn-secondary btn-sm" data-export="pdf">PDF</button>
        </div>
      </div>

      <div class="notice notice-caution" style="margin-bottom:var(--s4)">
        <strong>${esc(t('docs.checkFirst'))}</strong> ${esc(t('docs.checkText'))}
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
  $$('#doc-tabs .tab').forEach(el => el.setAttribute('aria-selected', String(el.dataset.doc === key)));
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

  toast(t('docs.exporting', { format: kind.toUpperCase() }));

  try {
    const response = await api(`/api/export/${kind}`, {
      method: 'POST', auth: true,
      body: JSON.stringify({ title, docs: generatedDocs }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new ApiError(err.message || err.error || t('common.serverError'), response.status);
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
    toast(t('docs.downloaded'), 'success');
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
    $('#steps').innerHTML = `<div class="empty"><h3>${esc(t('guide.loadFail'))}</h3><p>${esc(err.message)}</p></div>`;
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
          ${esc(t(done.has(step.id) ? 'guide.done' : 'guide.understood'))}
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
    btn.textContent = t('guide.done');
  } catch (err) {
    toast(err.message, 'error');
  }
});

function renderGlossary(terms) {
  $('#glossary-list').innerHTML = terms.map(entry => `
    <div class="panel" style="margin-bottom:var(--s3)">
      <h3 style="font-size:var(--t-h3);font-weight:600;margin-bottom:var(--s2)">${esc(entry.term)}</h3>
      <p class="muted" style="margin-bottom:var(--s3)">${esc(entry.short)}</p>
      <p style="font-family:var(--font-read);font-size:var(--t-body);font-style:italic;color:var(--ink-2)">
        ${esc(entry.example)}
      </p>
    </div>`).join('');
}

/**
 * Matndagi lug'at atamalarini belgilaydi — ustiga bosilsa izoh chiqadi.
 *
 * Muhim tartib: atamalar XOM matnda qidiriladi, qochirish esa keyin
 * qo'llanadi. Avval qochirilsa, "qo'shimcha" matnda "qo&#39;shimcha"
 * bo'lib qoladi va apostrofli atamalar (masalan "Boshlang'ich narx")
 * hech qachon topilmasdi.
 */
function withTerms(text) {
  const raw = String(text ?? '');
  if (!state.glossary.length) return esc(raw);

  // Bir joyda bitta atama belgilanadi: bo'laklarga ajratib, faqat
  // atamalarni tugmaga o'raymiz, qolganini oddiy matn sifatida qochiramiz.
  const aliases = state.glossary.flatMap(entry =>
    entry.aliases.map(alias => ({ alias, term: entry.term })));

  // Uzunroq alias avval — "lotlarni" ni "lot" dan oldin topsin
  aliases.sort((a, b) => b.alias.length - a.alias.length);

  const pattern = new RegExp(`(${aliases.map(a => escapeRe(a.alias)).join('|')})`, 'giu');
  const byAlias = new Map(aliases.map(a => [a.alias.toLowerCase(), a.term]));

  let result = '';
  let lastIndex = 0;
  const seen = new Set();

  for (const match of raw.matchAll(pattern)) {
    const term = byAlias.get(match[0].toLowerCase());
    result += esc(raw.slice(lastIndex, match.index));

    // Har bir atama matnda faqat bir marta belgilanadi — aks holda
    // bir xil so'z har jumlada tugmaga aylanib, o'qishga xalaqit beradi.
    if (term && !seen.has(term)) {
      seen.add(term);
      result += `<button type="button" class="term" data-term="${esc(term)}">${esc(match[0])}</button>`;
    } else {
      result += esc(match[0]);
    }
    lastIndex = match.index + match[0].length;
  }

  return result + esc(raw.slice(lastIndex));
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

document.addEventListener('click', (e) => {
  const trigger = e.target.closest('[data-term]');
  const pop = $('#term-pop');

  if (!trigger) {
    if (!e.target.closest('#term-pop')) pop.hidden = true;
    return;
  }

  const entry = state.glossary.find(item => item.term === trigger.dataset.term);
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
          <b>${som(plan.priceMonthly)}</b><span>${esc(t('plans.perMonth'))}</span>
        </div>
        <p class="plan-desc">${esc(plan.description)}</p>
        <ul class="plan-features">
          ${plan.features.map(f => `<li>${check}<span>${esc(f)}</span></li>`).join('')}
        </ul>
        ${plan.priceMonthly === 0
          ? `<button type="button" class="btn btn-secondary" data-go="browse">${esc(t('plans.free'))}</button>`
          : `<button type="button" class="btn btn-primary" data-subscribe="${esc(plan.id)}">${esc(t('plans.subscribe'))}</button>`}
      </div>`).join('');

    const automatic = data.paymentMethods.filter(m => m.automatic);
    $('#plans-note').textContent = t(automatic.length ? 'plans.noteAuto' : 'plans.noteManual');
  } catch (err) {
    $('#plans').innerHTML = `<div class="empty"><h3>${esc(t('plans.loadFail'))}</h3><p>${esc(err.message)}</p></div>`;
  }
}

$('#plans').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-subscribe]');
  if (!btn) return;

  if (!state.token) { openModal('auth-modal'); return; }

  const plan = state.plans.find(p => p.id === btn.dataset.subscribe);
  const months = Number(prompt(
    t('plans.months', { plan: plan.name, price: som(plan.priceMonthly) }),
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
  openInfo(t('plans.invoiceTitle'), `
    ${data.alreadyPending ? `<div class="notice notice-caution" style="margin-bottom:var(--s4)">${esc(t('plans.invoicePending'))}</div>` : ''}
    <dl class="facts" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">
      <div><dt>${esc(t('plans.invoicePlan'))}</dt><dd>${esc(inv.planName || inv.plan)}</dd></div>
      <div><dt>${esc(t('plans.invoiceAmount'))}</dt><dd>${som(inv.amount)} ${esc(inv.currency)}</dd></div>
      <div><dt>${esc(t('plans.invoiceNumber'))}</dt><dd>${esc(inv.invoiceNumber)}</dd></div>
    </dl>
    <ol style="list-style:decimal;padding-left:20px;margin-top:var(--s4)">
      ${(data.instructions || []).map(s => `<li style="margin-bottom:6px;color:var(--ink-2)">${esc(s)}</li>`).join('')}
    </ol>
    <p class="small muted" style="margin-top:var(--s4)">${esc(t('plans.invoiceNote'))}</p>`);
}

// ═══════════════════════════════════════════════════════════════════
// AI MASLAHATCHI
// ═══════════════════════════════════════════════════════════════════
const chat = { history: [], busy: false };

const CHAT_SUGGESTION_KEYS = ['chat.s1', 'chat.s2', 'chat.s3', 'chat.s4'];

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
    <div class="msg msg-bot">${esc(t('chat.intro'))}</div>
    <div class="chat-suggestions">
      ${CHAT_SUGGESTION_KEYS.map(key =>
        `<button type="button" class="chat-suggestion">${esc(t(key))}</button>`).join('')}
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
      appendMessage('bot', data.message || data.error || t('common.serverError'));
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
    $('#stat-sectors').textContent = String(sectorKeys().length);
    $('#stat-regions').textContent = String(regionKeys().length);
  } catch {
    $('#search-stats').hidden = true;
  }
}

// ── Til almashtirish ────────────────────────────────────────────────
function renderLangSwitch() {
  $$('[data-lang]').forEach(btn =>
    btn.setAttribute('aria-pressed', String(btn.dataset.lang === getLang())));
}

$$('[data-lang]').forEach(btn => {
  btn.addEventListener('click', () => setLang(btn.dataset.lang));
});

// Til o'zgarganda faqat statik matn emas, JS chizgan hamma narsa ham
// qayta chiziladi — aks holda ro'yxat va panellar eski tilda qolardi.
onLangChange(() => {
  renderLangSwitch();
  renderSectorFilter();
  renderResults();
  renderPagination();
  renderChatIntro();

  if (state.view === 'work') loadWork();
  if (state.view === 'account') loadAccount();
  if (state.view === 'plans') { state.plans = []; loadPlans(); }
  if (state.view === 'guide') { guideLoaded = false; loadGuide(); }
});

async function init() {
  initLang();
  renderLangSwitch();
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
