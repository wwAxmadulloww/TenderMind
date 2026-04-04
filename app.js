/* ═══════════════════════════════════════
   TENDERMIND — app.js  v2.0
   Full production frontend
   ═══════════════════════════════════════ */

'use strict';

const API = ''; // same-origin (server.js serves static files)

// ── State ──────────────────────────────────────────────────────────
const state = {
  tenders: [],
  totalTenders: 0,
  currentPage: 1,
  totalPages: 1,
  filters: { soha: 'all', hudud: 'all', search: '', sort: 'probability', status: 'all' },
  selectedTender: null,
  savedIds: new Set(),
  wonIds: new Set(),
  user: null,
  token: null,
  strategyTender: null,
};

// ── INIT ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initAuth();
  initParticles();
  animateCounters();
  fetchTenders();
  renderSavedTab();
});

// ── PAGE NAVIGATION ──────────────────────────────────────────────
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById(id);
  if (target) { target.classList.add('active'); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  if (id === 'app-page') { fetchTenders(); switchTab('tenderlar'); }
}

function scrollToSection(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
}

// ── NAVBAR SCROLL ────────────────────────────────────────────────
window.addEventListener('scroll', () => {
  const nav = document.getElementById('navbar');
  if (nav) nav.classList.toggle('scrolled', window.scrollY > 20);
});

// ── COUNTER ANIMATION ────────────────────────────────────────────
function animateCounters() {
  document.querySelectorAll('[data-target]').forEach(el => {
    const target = +el.dataset.target;
    const suffix = el.dataset.suffix || '';
    let current = 0, step = target / 60;
    const timer = setInterval(() => {
      current = Math.min(current + step, target);
      el.textContent = Math.floor(current).toLocaleString('uz') + suffix;
      if (current >= target) clearInterval(timer);
    }, 20);
  });
}
const statsObs = new IntersectionObserver((entries) => {
  entries.forEach(e => { if (e.isIntersecting) { animateCounters(); statsObs.disconnect(); } });
}, { threshold: 0.3 });
document.addEventListener('DOMContentLoaded', () => {
  const el = document.querySelector('.stats-bar');
  if (el) statsObs.observe(el);
});

// ── HERO PARTICLES ───────────────────────────────────────────────
function initParticles() {
  const container = document.getElementById('hero-particles');
  if (!container) return;
  for (let i = 0; i < 30; i++) {
    const dot = document.createElement('div');
    dot.style.cssText = `position:absolute;width:${Math.random()*3+1}px;height:${Math.random()*3+1}px;
      background:rgba(200,255,0,${Math.random()*0.3+0.05});border-radius:50%;
      left:${Math.random()*100}%;top:${Math.random()*100}%;
      animation:floatParticle ${Math.random()*6+4}s ease-in-out ${Math.random()*4}s infinite alternate;`;
    container.appendChild(dot);
  }
  if (!document.getElementById('particle-kf')) {
    const style = document.createElement('style');
    style.id = 'particle-kf';
    style.textContent = `@keyframes floatParticle{0%{transform:translateY(0) scale(1)}100%{transform:translateY(-20px) scale(1.2)}}`;
    document.head.appendChild(style);
  }
}

// ══════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════
function initAuth() {
  const token = localStorage.getItem('tm_token');
  const user  = localStorage.getItem('tm_user');
  if (token && user) {
    state.token = token;
    state.user  = JSON.parse(user);
    updateAuthUI();
    fetchSavedIds();
    fetchWonIds();
  }
}

function updateAuthUI() {
  const btn = document.getElementById('auth-nav-btn');
  const userInfo = document.getElementById('user-info');
  if (state.user) {
    if (btn) { btn.textContent = '👤 Mening profilim'; btn.onclick = showProfileMenu; }
    if (userInfo) userInfo.textContent = state.user.name;
  } else {
    if (btn) { btn.textContent = 'Kirish'; btn.onclick = () => showModal('auth-modal'); }
  }
  // Saved tab and Won tab and Cabinet tab
  const savedTab = document.getElementById('tab-saved');
  const wonTab = document.getElementById('tab-won');
  const cabTab = document.getElementById('tab-cabinet');
  if (savedTab) savedTab.style.display = state.user ? 'flex' : 'none';
  if (wonTab) wonTab.style.display = state.user ? 'flex' : 'none';
  if (cabTab) cabTab.style.display = state.user ? 'flex' : 'none';
}

function showModal(id) {
  document.getElementById(id)?.classList.add('visible');
}
function hideModal(id) {
  document.getElementById(id)?.classList.remove('visible');
}

function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
  document.getElementById(`auth-tab-${tab}`)?.classList.add('active');
  document.getElementById(`auth-form-${tab}`)?.classList.add('active');
}

async function doLogin(e) {
  e.preventDefault();
  const phone = document.getElementById('login-phone').value.trim();
  const password = document.getElementById('login-password').value;
  const btn = document.getElementById('login-btn');
  btn.disabled = true; btn.textContent = 'Kirmoqda...';
  try {
    const r = await fetch(`${API}/api/auth/login`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ phone, password })
    });
    const data = await r.json();
    if (!r.ok) { showToast(data.error || 'Xatolik', 'error'); return; }
    state.token = data.token; state.user = data.user;
    localStorage.setItem('tm_token', data.token);
    localStorage.setItem('tm_user', JSON.stringify(data.user));
    hideModal('auth-modal');
    updateAuthUI(); fetchSavedIds(); fetchWonIds();
    showToast(`Xush kelibsiz, ${data.user.name}! 👋`, 'success');
  } catch { showToast('Serverga ulanib bo\'lmadi', 'error'); }
  finally { btn.disabled = false; btn.textContent = 'Kirish'; }
}

async function doRegister(e) {
  e.preventDefault();
  const name = document.getElementById('reg-name').value.trim();
  const phone = document.getElementById('reg-phone').value.trim();
  const company = document.getElementById('reg-company').value.trim();
  const password = document.getElementById('reg-password').value;
  const btn = document.getElementById('register-btn');
  btn.disabled = true; btn.textContent = "Ro'yxatdan o'tmoqda...";
  try {
    const r = await fetch(`${API}/api/auth/register`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ name, phone, company, password })
    });
    const data = await r.json();
    if (!r.ok) { showToast(data.error || 'Xatolik', 'error'); return; }
    state.token = data.token; state.user = data.user;
    localStorage.setItem('tm_token', data.token);
    localStorage.setItem('tm_user', JSON.stringify(data.user));
    hideModal('auth-modal');
    updateAuthUI();
    showToast('Muvaffaqiyatli ro\'yxatdan o\'tildi! 🎉', 'success');
  } catch { showToast('Serverga ulanib bo\'lmadi', 'error'); }
  finally { btn.disabled = false; btn.textContent = "Ro'yxatdan o'tish"; }
}

function doLogout() {
  state.token = null; state.user = null; state.savedIds.clear(); state.wonIds.clear();
  localStorage.removeItem('tm_token'); localStorage.removeItem('tm_user');
  updateAuthUI(); renderTendersGrid(state.tenders);
  showToast('Chiqildi', 'info');
  hideProfileMenu();
}

function showProfileMenu() {
  const menu = document.getElementById('profile-menu');
  if (menu) menu.classList.toggle('visible');
}
function hideProfileMenu() {
  document.getElementById('profile-menu')?.classList.remove('visible');
}
document.addEventListener('click', (e) => {
  if (!e.target.closest('#auth-nav-btn') && !e.target.closest('#profile-menu')) hideProfileMenu();
});

// ── SAVED IDS ────────────────────────────────────────────────────
async function fetchSavedIds() {
  if (!state.token) return;
  try {
    const r = await fetch(`${API}/api/saved`, { headers: { Authorization: `Bearer ${state.token}` } });
    if (!r.ok) return;
    const data = await r.json();
    state.savedIds = new Set(data.map(t => t.id));
    updateSaveButtons();
  } catch {}
}

async function toggleSave(id, e) {
  if (e) e.stopPropagation();
  if (!state.user) { showModal('auth-modal'); showToast('Saqlash uchun tizimga kiring', 'info'); return; }
  try {
    const r = await fetch(`${API}/api/saved/${id}`, {
      method: 'POST', headers: { Authorization: `Bearer ${state.token}` }
    });
    const data = await r.json();
    if (data.saved) state.savedIds.add(id); else state.savedIds.delete(id);
    updateSaveButtons();
    showToast(data.message, data.saved ? 'success' : 'info');
    if (document.getElementById('content-saved')?.classList.contains('active')) renderSavedTab();
  } catch { showToast('Xatolik yuz berdi', 'error'); }
}

function updateSaveButtons() {
  document.querySelectorAll('.btn-save-tender').forEach(btn => {
    const id = btn.dataset.id;
    btn.classList.toggle('saved', state.savedIds.has(id));
    btn.title = state.savedIds.has(id) ? 'Saqlanganlardan olib tashlash' : 'Saqlash';
    btn.innerHTML = state.savedIds.has(id) ? '🔖' : '🏷️';
  });
}

// ── WON IDS ──────────────────────────────────────────────────────
async function fetchWonIds() {
  if (!state.token) return;
  try {
    const r = await fetch(`${API}/api/won`, { headers: { Authorization: `Bearer ${state.token}` } });
    if (!r.ok) return;
    const data = await r.json();
    state.wonIds = new Set(data.map(t => t.id));
    updateWonButtons();
  } catch {}
}

async function toggleWon(id, e) {
  if (e) e.stopPropagation();
  if (!state.user) { showModal('auth-modal'); showToast('Buning uchun tizimga kiring', 'info'); return; }
  try {
    const r = await fetch(`${API}/api/won/${id}`, {
      method: 'POST', headers: { Authorization: `Bearer ${state.token}` }
    });
    const data = await r.json();
    if (data.won) state.wonIds.add(id); else state.wonIds.delete(id);
    updateWonButtons();
    showToast(data.message, data.won ? 'success' : 'info');
    if (document.getElementById('content-won')?.classList.contains('active')) renderWonTab();
    if (document.getElementById('content-cabinet')?.classList.contains('active')) renderCabinet();
  } catch { showToast('Xatolik yuz berdi', 'error'); }
}

function updateWonButtons() {
  document.querySelectorAll('.btn-won-tender').forEach(btn => {
    const id = btn.dataset.id;
    btn.classList.toggle('won', state.wonIds.has(id));
    btn.title = state.wonIds.has(id) ? 'Yutganlardan olib tashlash' : "Yutganlarga qo'shish";
    btn.innerHTML = state.wonIds.has(id) ? '🏆' : '🏅';
    btn.style.color = state.wonIds.has(id) ? 'var(--yellow)' : 'currentColor';
  });
}

// ══════════════════════════════════════════════
// TENDERS — API
// ══════════════════════════════════════════════
async function fetchTenders(page = 1) {
  const { soha, hudud, search, sort, status } = state.filters;
  const params = new URLSearchParams({ page, limit:12, soha, hudud, sort });
  if (search) params.set('search', search);
  if (status !== 'all') params.set('status', status);

  setLoadingTenders(true);
  try {
    const r = await fetch(`${API}/api/tenders?${params}`);
    const data = await r.json();
    state.tenders     = data.items;
    state.totalTenders = data.total;
    state.currentPage  = data.page;
    state.totalPages   = data.pages;
    renderTendersGrid(data.items);
    renderPagination(data);
    document.getElementById('results-count').textContent = `${data.total} ta tender topildi`;
  } catch (err) {
    console.error(err);
    showToast('Serverga ulanib bo\'lmadi', 'error');
    // Fallback: load inline data
    loadFallbackTenders();
  } finally { setLoadingTenders(false); }
}

function setLoadingTenders(loading) {
  const grid = document.getElementById('tenders-grid');
  if (!grid) return;
  if (loading) {
    grid.innerHTML = Array(6).fill(0).map(() => `
      <div class="tender-card skeleton">
        <div class="sk-line sk-short"></div>
        <div class="sk-line"></div>
        <div class="sk-line sk-med"></div>
        <div class="sk-block"></div>
      </div>`).join('');
  }
}

function filterTenders() {
  state.filters.soha   = document.getElementById('filter-soha')?.value || 'all';
  state.filters.hudud  = document.getElementById('filter-hudud')?.value || 'all';
  state.filters.search = document.getElementById('filter-search')?.value || '';
  state.filters.status = document.getElementById('filter-status')?.value || 'all';
  state.currentPage = 1;
  fetchTenders(1);
}

function sortTenders(by) {
  document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  state.filters.sort = by;
  fetchTenders(1);
}

function goToPage(page) {
  if (page < 1 || page > state.totalPages) return;
  fetchTenders(page);
}

// ══════════════════════════════════════════════
// RENDER TENDERS
// ══════════════════════════════════════════════
function renderTendersGrid(list) {
  const grid = document.getElementById('tenders-grid');
  if (!grid) return;
  if (!list.length) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:60px;color:var(--text-3)">
      <div style="font-size:40px;margin-bottom:12px">🔍</div>
      <p>Hech narsa topilmadi. Filtrlarni o'zgartiring.</p></div>`;
    return;
  }
  grid.innerHTML = list.map(t => renderTenderCard(t)).join('');
  updateSaveButtons();
}

function renderTenderCard(t) {
  const probClass = t.probability >= 75 ? 'prob-high fill-high' : t.probability >= 50 ? 'prob-mid fill-mid' : 'prob-low fill-low';
  const [probColor, fillColor] = probClass.split(' ');
  const daysLeft = Math.ceil((new Date(t.deadline) - new Date()) / 86400000);
  const deadlineColor = daysLeft < 10 ? '#ff4d6a' : daysLeft < 20 ? '#ffd700' : 'var(--text-3)';
  const isNew = t.isNew ? '<span class="badge-new">Yangi</span>' : '';
  const isUrgent = t.status === 'urgent' ? '<span class="badge-urgent">Shoshilinch</span>' : '';

  return `
  <div class="tender-card" id="tc-${t.id}" onclick="openTenderDetail('${t.id}')">
    <div class="tender-card-header">
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
        <span class="tender-soha-badge badge-${t.soha}">${sohaLabel(t.soha)}</span>
        ${isNew}${isUrgent}
      </div>
      <span class="tender-deadline" style="color:${deadlineColor}">⏰ ${daysLeft} kun</span>
    </div>
    <div class="tender-title">${t.title}</div>
    <div class="tender-meta">
      <div class="tender-meta-item">
        <div class="tender-meta-label">Byudjet</div>
        <div class="tender-meta-value budget">${t.budget} so'm</div>
      </div>
      <div class="tender-meta-item">
        <div class="tender-meta-label">Raqiblar</div>
        <div class="tender-meta-value">${t.competitors} ta</div>
      </div>
    </div>
    <div class="tender-probability">
      <div class="probability-header">
        <span class="probability-label">G'alaba ehtimoli</span>
        <span class="probability-value ${probColor}">${t.probability}%</span>
      </div>
      <div class="prob-bar"><div class="prob-fill ${fillColor}" style="width:${t.probability}%"></div></div>
    </div>
    <div class="tender-card-footer">
      <div class="tender-tags">${t.tags.map(tag => `<span class="tender-tag">${tag}</span>`).join('')}</div>
      <button class="btn-won-tender" data-id="${t.id}" onclick="toggleWon('${t.id}',event)" title="Yutganlarga qo'shish" style="margin-left:5px">🏅</button>
      <button class="btn-save-tender" data-id="${t.id}" onclick="toggleSave('${t.id}',event)" title="Saqlash">🏷️</button>
    </div>
  </div>`;
}

function renderPagination({ page, pages, total }) {
  const container = document.getElementById('pagination');
  if (!container || pages <= 1) { if (container) container.innerHTML = ''; return; }
  let btns = '';
  if (page > 1) btns += `<button class="page-btn" onclick="goToPage(${page-1})">←</button>`;
  for (let i = Math.max(1, page-2); i <= Math.min(pages, page+2); i++) {
    btns += `<button class="page-btn ${i===page?'active':''}" onclick="goToPage(${i})">${i}</button>`;
  }
  if (page < pages) btns += `<button class="page-btn" onclick="goToPage(${page+1})">→</button>`;
  container.innerHTML = `<div class="pagination-wrap">${btns}<span class="page-info">${page} / ${pages} sahifa · ${total} ta</span></div>`;
}

function sohaLabel(soha) {
  const map = { it:'IT', qurilish:'Qurilish', tibbiyot:'Tibbiyot', oziq:'Oziq-ovqat', transport:'Transport', talim:"Ta'lim", ekologiya:'Ekologiya', qishloq:"Qishloq xo'jaligi" };
  return map[soha] || soha;
}

// ══════════════════════════════════════════════
// TENDER DETAIL MODAL
// ══════════════════════════════════════════════
async function openTenderDetail(id) {
  let tender = state.tenders.find(t => t.id === id);
  if (!tender) {
    try {
      const r = await fetch(`${API}/api/tenders/${id}`);
      tender = await r.json();
    } catch { showToast('Tender ma\'lumotlarini yuklab bo\'lmadi', 'error'); return; }
  }
  state.selectedTender = tender;
  renderTenderModal(tender);
  showModal('tender-detail-modal');
}

function renderTenderModal(t) {
  const daysLeft = Math.ceil((new Date(t.deadline) - new Date()) / 86400000);
  const deadlineColor = daysLeft < 10 ? '#ff4d6a' : daysLeft < 20 ? '#ffd700' : 'var(--green)';
  const probColor = t.probability >= 75 ? 'var(--green)' : t.probability >= 50 ? 'var(--yellow)' : 'var(--red)';
  const isSaved = state.savedIds.has(t.id);

  const modal = document.getElementById('tender-detail-modal');
  if (!modal) return;

  modal.querySelector('.modal-content').innerHTML = `
    <div class="modal-header">
      <div class="modal-header-left">
        <span class="tender-soha-badge badge-${t.soha}">${sohaLabel(t.soha)}</span>
        ${t.isNew ? '<span class="badge-new">Yangi</span>' : ''}
        ${t.status === 'urgent' ? '<span class="badge-urgent">Shoshilinch</span>' : ''}
      </div>
      <div class="modal-header-actions">
        <button class="modal-save-btn ${isSaved?'saved':''}" onclick="toggleSave('${t.id}',event)" data-id="${t.id}">
          ${isSaved ? '🔖 Saqlangan' : '🏷️ Saqlash'}
        </button>
        <button class="modal-close" onclick="hideModal('tender-detail-modal')">✕</button>
      </div>
    </div>
    <div class="modal-body">
      <h2 class="modal-title">${t.title}</h2>
      <p class="modal-org">🏛️ ${t.org}</p>
      
      <div class="modal-stats-grid">
        <div class="modal-stat">
          <div class="modal-stat-label">Byudjet</div>
          <div class="modal-stat-value accent">${t.budget} so'm</div>
        </div>
        <div class="modal-stat">
          <div class="modal-stat-label">G'alaba ehtimoli</div>
          <div class="modal-stat-value" style="color:${probColor}">${t.probability}%</div>
        </div>
        <div class="modal-stat">
          <div class="modal-stat-label">Raqiblar</div>
          <div class="modal-stat-value">${t.competitors} ta</div>
        </div>
        <div class="modal-stat">
          <div class="modal-stat-label">Muddat</div>
          <div class="modal-stat-value" style="color:${deadlineColor}">${daysLeft} kun qoldi</div>
        </div>
      </div>

      ${t.description ? `<div class="modal-section"><h4>Loyiha haqida</h4><p>${t.description}</p></div>` : ''}
      
      ${t.requirements?.length ? `
      <div class="modal-section">
        <h4>Talablar</h4>
        <ul class="modal-reqs">${t.requirements.map(r => `<li>✓ ${r}</li>`).join('')}</ul>
      </div>` : ''}

      <div class="modal-section">
        <h4>Aloqa</h4>
        <div class="modal-contact">
          ${t.contactEmail ? `<a href="mailto:${t.contactEmail}">📧 ${t.contactEmail}</a>` : ''}
          ${t.contactPhone ? `<span>📞 ${t.contactPhone}</span>` : ''}
        </div>
      </div>

      <div class="modal-tags">${t.tags.map(tag => `<span class="tender-tag">${tag}</span>`).join('')}</div>
    </div>
    <div class="modal-footer">
      <button class="btn-modal-action primary" onclick="goToDocFromTender('${t.id}')">
        📝 Hujjat yaratish
      </button>
      <button class="btn-modal-action secondary" onclick="goToStrategyFromTender('${t.id}')">
        🎯 Strategiya ko'rish
      </button>
      <button class="btn-modal-action ai-action" onclick="showComparisonSelector('${t.id}')">
        ⚖️ Taqqoslash
      </button>
      <button class="btn-modal-action ai-action" onclick="askAIAboutTender('${t.id}')">
        🤖 AI dan maslahat
      </button>
    </div>`;
}

function goToDocFromTender(id) {
  const t = state.tenders.find(x => x.id === id) || state.selectedTender;
  hideModal('tender-detail-modal');
  switchTab('hujjat');
  if (t) {
    setTimeout(() => {
      const tn = document.getElementById('tender-name');
      const ts = document.getElementById('doc-tender-soha');
      if (tn) tn.value = t.title;
      if (ts) ts.value = t.soha;
    }, 100);
  }
}

async function goToStrategyFromTender(id) {
  hideModal('tender-detail-modal');
  switchTab('strategiya');
  loadStrategy(id);
}

// ── Tender Comparison (Taqqoslash) ──────────────────────────────────
function showComparisonSelector(tender1Id) {
  hideModal('tender-detail-modal');
  
  // Show dialog to select tender 2
  const otherTenders = state.tenders.filter(t => t.id !== tender1Id).slice(0, 10);
  const selectHtml = `
    <div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:20px;z-index:10000;max-width:400px;width:90%;box-shadow:0 10px 40px rgba(0,0,0,0.3)">
      <h3 style="margin:0 0 16px;color:var(--text)">Taqqoslash uchun 2-tender tanlang</h3>
      <div style="max-height:300px;overflow-y:auto;margin-bottom:16px">
        ${otherTenders.map(t => `
          <div onclick="compareTwoTenders('${tender1Id}', '${t.id}');this.closest('div').parentElement.remove()" 
               style="padding:10px;margin:4px 0;background:var(--bg-2);border-radius:6px;cursor:pointer;border-left:3px solid var(--accent);transition:all 0.2s">
            <div style="font-size:12px;font-weight:600;color:var(--text)">${t.title.substring(0,50)}...</div>
            <div style="font-size:11px;color:var(--text-3);margin-top:4px">${t.budget} • ${t.competitors} raqib</div>
          </div>
        `).join('')}
      </div>
      <button onclick="this.closest('div').remove()" style="width:100%;padding:8px;background:var(--border);color:var(--text);border:none;border-radius:6px;cursor:pointer">Bekor qilish</button>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', selectHtml);
}

function showComparisonModal(tender1Id, tender2Id) {
  state.selectedTender = null; // Clear selection
  compareTwoTenders(tender1Id, tender2Id);
}

async function compareTwoTenders(tender1Id, tender2Id) {
  const modal = document.getElementById('tender-compare-modal');
  const loading = document.getElementById('compare-loading');
  const result = document.getElementById('compare-result');
  const error = document.getElementById('compare-error');
  
  loading.style.display = 'flex';
  result.style.display = 'none';
  error.style.display = 'none';
  
  showModal('tender-compare-modal');

  try {
    const r = await fetch(`${API}/api/ai/compare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tender1Id, tender2Id })
    });
    const data = await r.json();

    if (!r.ok || !data.success) {
      error.style.display = 'block';
      error.innerHTML = `<strong>Xatolik:</strong> ${data.error || 'Taqqoslash xizmatida muammo'}`;
      loading.style.display = 'none';
      return;
    }

    const t1 = state.tenders.find(t => t.id === tender1Id);
    const t2 = state.tenders.find(t => t.id === tender2Id);

    loading.style.display = 'none';
    result.style.display = 'block';
    result.innerHTML = renderComparison(t1, t2, data.comparison, data.aiGenerated);
  } catch (err) {
    console.error(err);
    error.style.display = 'block';
    error.innerHTML = '<strong>Xatolik:</strong> Serverga ulanib bo\'lmadi';
    loading.style.display = 'none';
  }
}

function renderComparison(t1, t2, comp, aiGenerated) {
  const badge = aiGenerated ? '✨ AI tahlili' : '📊 Avtomат tahlil';
  
  return `
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px">
    <!-- TENDER 1 -->
    <div style="padding:16px;background:rgba(200,255,0,0.05);border-radius:8px;border-left:3px solid var(--accent)">
      <h4 style="color:var(--accent);margin:0 0 8px;font-size:0.9em">${t1.title.substring(0,50)}...</h4>
      <div style="font-size:12px;color:var(--text-2);line-height:1.6">
        <div><b>Byudjet:</b> ${t1.budget}</div>
        <div><b>Raqiblar:</b> ${t1.competitors} ta</div>
        <div><b>G'alaba:</b> <span style="color:${t1.probability >= 75 ? 'var(--green)' : t1.probability >= 50 ? 'var(--yellow)' : 'var(--red)'}">${t1.probability}%</span></div>
        <div><b>Muddati:</b> ${t1.deadline}</div>
      </div>
    </div>

    <!-- TENDER 2 -->
    <div style="padding:16px;background:rgba(100,200,255,0.05);border-radius:8px;border-left:3px solid var(--blue)">
      <h4 style="color:var(--blue);margin:0 0 8px;font-size:0.9em">${t2.title.substring(0,50)}...</h4>
      <div style="font-size:12px;color:var(--text-2);line-height:1.6">
        <div><b>Byudjet:</b> ${t2.budget}</div>
        <div><b>Raqiblar:</b> ${t2.competitors} ta</div>
        <div><b>G'alaba:</b> <span style="color:${t2.probability >= 75 ? 'var(--green)' : t2.probability >= 50 ? 'var(--yellow)' : 'var(--red)'}">${t2.probability}%</span></div>
        <div><b>Muddati:</b> ${t2.deadline}</div>
      </div>
    </div>
  </div>

  <!-- AI SUMMARY -->
  <div style="padding:16px;background:rgba(200,255,0,0.08);border-radius:8px;margin-bottom:20px;border:1px solid rgba(200,255,0,0.2)">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;font-size:12px">
      <span>${badge}</span>
      <span style="color:var(--text-3)">Model: ${aiGenerated ? 'Claude AI' : 'Smart Template'}</span>
    </div>
    <h4 style="margin:0 0 8px;color:var(--text)">📋 Tafsili Taqqoslash</h4>
    <p style="margin:0;font-size:13px;color:var(--text-2);line-height:1.6">${comp.summary || ''}</p>
  </div>

  <!-- ADVANTAGES -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
    <div>
      <h5 style="color:var(--accent);margin:0 0 10px;font-size:12px">✓ Tender 1 ni Afzalliklari</h5>
      <div style="font-size:12px;color:var(--text-2)">
        ${(comp.advantages1 || []).map(a => `<div style="margin-bottom:6px">• ${a}</div>`).join('')}
      </div>
    </div>
    <div>
      <h5 style="color:var(--blue);margin:0 0 10px;font-size:12px">✓ Tender 2 ni Afzalliklari</h5>
      <div style="font-size:12px;color:var(--text-2)">
        ${(comp.advantages2 || []).map(a => `<div style="margin-bottom:6px">• ${a}</div>`).join('')}
      </div>
    </div>
  </div>

  <!-- RISKS -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
    <div>
      <h5 style="color:var(--red);margin:0 0 10px;font-size:12px">⚠️ Tender 1 ni Xavflari</h5>
      <div style="font-size:12px;color:var(--text-2)">
        ${(comp.risks1 || []).map(r => `<div style="margin-bottom:6px">• ${r}</div>`).join('')}
      </div>
    </div>
    <div>
      <h5 style="color:var(--red);margin:0 0 10px;font-size:12px">⚠️ Tender 2 ni Xavflari</h5>
      <div style="font-size:12px;color:var(--text-2)">
        ${(comp.risks2 || []).map(r => `<div style="margin-bottom:6px">• ${r}</div>`).join('')}
      </div>
    </div>
  </div>

  <!-- RECOMMENDATION -->
  <div style="padding:16px;background:rgba(76,175,80,0.1);border-radius:8px;border-left:3px solid var(--green);margin-bottom:16px">
    <h5 style="margin:0 0 8px;color:var(--green);font-size:12px">🎯 TAKLIF</h5>
    <p style="margin:0;font-size:13px;color:var(--text);line-height:1.6">${comp.recommendation || ''}</p>
  </div>

  <!-- METADATA -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:12px;background:var(--bg-2);border-radius:6px;font-size:11px;color:var(--text-3)">
    <div><b>Qiyinchi:</b> ${comp.difficulty || 'Noma\'lum'}</div>
    <div><b>Hujjatlar vaqti:</b> ${comp.timeToBid || '3-5 kun'}</div>
  </div>
  `;
}

// ── SAVED TAB ───────────────────────────────────────────────────
async function renderSavedTab() {
  const container = document.getElementById('saved-tenders-list');
  if (!container) return;
  if (!state.user) {
    container.innerHTML = `<div class="saved-empty"><div class="placeholder-icon">🔒</div>
      <h3>Tizimga kiring</h3><p>Saqlangan tenderlarni ko'rish uchun ro'yxatdan o'ting</p>
      <button class="btn-primary nav-cta" onclick="showModal('auth-modal')">Kirish</button></div>`;
    return;
  }
  container.innerHTML = `<div class="sk-line" style="height:60px;border-radius:12px"></div>`;
  try {
    const r = await fetch(`${API}/api/saved`, { headers: { Authorization: `Bearer ${state.token}` } });
    const data = await r.json();
    if (!data.length) {
      container.innerHTML = `<div class="saved-empty"><div class="placeholder-icon">🏷️</div>
        <h3>Saqlangan tenderlar yo'q</h3>
        <p>Tenderlar sahifasida 🏷️ tugmasini bosib saqlang</p>
        <button class="btn-primary nav-cta" onclick="switchTab('tenderlar')">Tenderlarni ko'rish</button></div>`;
      return;
    }
    container.innerHTML = `<div class="tenders-grid">${data.map(t => renderTenderCard(t)).join('')}</div>`;
    updateSaveButtons();
  } catch {
    container.innerHTML = `<div class="saved-empty"><p>Xatolik yuz berdi</p></div>`;
  }
}

// ── WON TAB ───────────────────────────────────────────────────────
async function renderWonTab() {
  const container = document.getElementById('won-tenders-list');
  if (!container) return;
  if (!state.user) {
    container.innerHTML = `<div class="saved-empty"><div class="placeholder-icon">🔒</div>
      <h3>Tizimga kiring</h3>
      <button class="btn-primary nav-cta" onclick="showModal('auth-modal')">Kirish</button></div>`;
    return;
  }
  container.innerHTML = `<div class="sk-line" style="height:60px;border-radius:12px"></div>`;
  try {
    const r = await fetch(`${API}/api/won`, { headers: { Authorization: `Bearer ${state.token}` } });
    const data = await r.json();
    if (!data.length) {
      container.innerHTML = `<div class="saved-empty"><div class="placeholder-icon" style="color:var(--yellow)">🏆</div>
        <h3>Yutgan tenderlaringiz yo'q</h3>
        <p>Qatnashgan va g'olib bo'lgan tenderlaringizni shu yerda saqlang.</p>
        <button class="btn-primary nav-cta" onclick="switchTab('tenderlar')">Tenderlarni ko'rish</button></div>`;
      return;
    }
    container.innerHTML = `<div class="tenders-grid">${data.map(t => renderTenderCard(t)).join('')}</div>`;
    updateWonButtons();
    updateSaveButtons();
  } catch {
    container.innerHTML = `<div class="saved-empty"><p>Xatolik yuz berdi</p></div>`;
  }
}

// ── CABINET TAB ───────────────────────────────────────────────────
function renderCabinet() {
  if (!state.user) return;
  document.getElementById('cab-profile-info').innerHTML = `
    <div style="font-size:1.1em;font-weight:600;margin-bottom:10px">${state.user.company || 'Kompaniya nomi kiritilmagan'}</div>
    <div><b>Ism:</b> ${state.user.name}</div>
    <div><b>Telefon:</b> ${state.user.phone}</div>
  `;
  document.getElementById('stat-saved').textContent = state.savedIds.size;
  document.getElementById('stat-won').textContent = state.wonIds.size;
}

// ══════════════════════════════════════════════
// TABS
// ══════════════════════════════════════════════
function switchTab(name) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.getElementById(`tab-${name}`)?.classList.add('active');
  document.getElementById(`content-${name}`)?.classList.add('active');
  if (name === 'strategiya') loadStrategy(state.selectedTender?.id || state.strategyTender?.id);
  if (name === 'saved') renderSavedTab();
  if (name === 'won') renderWonTab();
  if (name === 'cabinet') renderCabinet();
}

// ══════════════════════════════════════════════
// AI HUJJAT GENERATOR — 7 ta O'zbekiston tender hujjati
// ══════════════════════════════════════════════
async function generateDocument(e) {
  e.preventDefault();
  const company   = document.getElementById('company-name').value.trim();
  const orgForm   = document.getElementById('org-form')?.value?.trim() || 'MChJ';
  const director  = document.getElementById('director-name')?.value?.trim() || '___';
  const inn       = document.getElementById('inn-number')?.value?.trim() || '___';
  const address   = document.getElementById('legal-address')?.value?.trim() || '___';
  const phoneEmail = document.getElementById('phone-email')?.value?.trim() || '___';
  const exp       = document.getElementById('experience').value;
  const bankDetails = document.getElementById('bank-details')?.value?.trim() || '___';
  const pastProjects = document.getElementById('past-projects')?.value?.trim() || '___';
  const tenderName = document.getElementById('tender-name').value.trim();
  const tenderLot = document.getElementById('tender-lot')?.value?.trim() || '___';
  const buyerOrg  = document.getElementById('buyer-org')?.value?.trim() || '___';
  const price     = Number(document.getElementById('tender-price').value);
  const deliveryTerm = document.getElementById('delivery-term')?.value?.trim() || '90 kalendar kun';
  const tenderSoha = document.getElementById('doc-tender-soha')?.value || '';
  if (!company || !exp || !tenderName || !price) return;

  const formatted = new Intl.NumberFormat('uz').format(price);

  showDocLoading(true);

  try {
    const r = await fetch(`${API}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company, orgForm, director, inn, address, phoneEmail, experience: exp, bankDetails, pastProjects, tenderName, tenderLot, buyerOrg, price, deliveryTerm, tenderSoha })
    });
    const data = await r.json();

    if (!r.ok) {
      if (data.error === 'API_KEY_MISSING') {
        showToast('AI API key sozlanmagan. Demo hujjat yaratilmoqda...', 'warning');
        fillDocs7({ company, orgForm, director, inn, address, phoneEmail, exp, bankDetails, pastProjects, tenderName, tenderLot, buyerOrg, formatted, deliveryTerm, tenderSoha });
      } else {
        showToast(data.error || 'Hujjat yaratishda xatolik', 'error');
        showDocLoading(false);
      }
      return;
    }

    // If server returns 7 docs
    if (data.docs) {
      document.getElementById('doc-output-ariza').textContent = data.docs.ariza || '';
      document.getElementById('doc-output-kafolat').textContent = data.docs.kafolat || '';
      document.getElementById('doc-output-kompaniya').textContent = data.docs.kompaniya || '';
      document.getElementById('doc-output-texnik').textContent = data.docs.texnik || '';
      document.getElementById('doc-output-narx').textContent = data.docs.narx || '';
      document.getElementById('doc-output-moliya').textContent = data.docs.moliya || '';
      document.getElementById('doc-output-vakolat').textContent = data.docs.vakolat || '';
    }

    const aiLabel = document.getElementById('ai-model-label');
    if (aiLabel) aiLabel.textContent = `✨ ${data.model || 'AI'} tomonidan yaratildi — 7 ta hujjat`;

    showDocLoading(false);
    showGenerated(true);
    showToast('7 ta hujjat muvaffaqiyatli yaratildi! ✨', 'success');
  } catch {
    showToast('Serverga ulanib bo\'lmadi. Demo rejimda yaratmoqda...', 'warning');
    fillDocs7({ company, orgForm, director, inn, address, phoneEmail, exp, bankDetails, pastProjects, tenderName, tenderLot, buyerOrg, formatted, deliveryTerm, tenderSoha });
  }
}

function fillDocs7(d) {
  setTimeout(() => {
    const today = new Date().toLocaleDateString('uz-Cyrl-UZ', { year:'numeric', month:'long', day:'numeric' });

    // ── HUJJAT 1: ARIZA (Shakl №1)
    document.getElementById('doc-output-ariza').textContent =
`ARIZA (Shakl №1)
═══════════════════════════════════════════
Sana: ${today}

"O'zekspomarkaz" MKK AJ
Xarid komissiyasi raisi
${d.buyerOrg} ga

ARIZA

"${d.company}" ${d.orgForm}, tender hujjatlarini o'rganib chiqqandan so'ng,
"${d.tenderName}" (${d.tenderLot}) bo'yicha tenderda qatnashish
niyatimizni bildiramiz.

Biz tender hujjatlarining barcha shartlarini qabul qilamiz va
tender taklifimiz amal qilish muddati davomida o'z kuchida
qolishini kafolatlaymiz.

Tender taklifimiz bilan birga quyidagi hujjatlar ilova qilinadi:
1. Kafolat xati (Shakl №2)
2. Kompaniya ma'lumotlari (Shakl №3)
3. Texnik taklif (Shakl №6)
4. Narx taklifi (Shakl №7)
5. Moliyaviy holat (Shakl №3, 2-ilova)
6. Vakolatnoma (Shakl №5)

Mas'ul shaxs: ${d.director}
Tel: ${d.phoneEmail}
Manzil: ${d.address}

Rahbar: ${d.director}
M.O'                                    Imzo: ___________`;

    // ── HUJJAT 2: KAFOLAT XATI (Shakl №2)
    document.getElementById('doc-output-kafolat').textContent =
`KAFOLAT XATI (Shakl №2)
═══════════════════════════════════════════
Sana: ${today}
Kompaniya: "${d.company}" ${d.orgForm}
INN: ${d.inn}

"${d.buyerOrg}" Xarid komissiyasiga

KAFOLAT XATI

"${d.company}" ${d.orgForm} quyidagilarni kafolatlaydi:

✓ Kompaniya qayta tashkil etish, tugatish yoki bankrotlik 
  bosqichida EMAS

✓ Buyurtmachi bilan sud yoki hakamlik nizosi holatida EMAS

✓ Ilgari tuzilgan shartnomalar bo'yicha muddati o'tgan 
  debitorlik qarzlar YO'Q

✓ Davlat soliq organlari oldida muddati o'tgan qarzlar YO'Q

✓ Shartnomani to'liq va sifatli bajarish uchun zarur texnik 
  va moliyaviy resurslar MAVJUD

✓ Tender taklifini amal qilish muddati davomida 
  bajarishni KAFOLATLAYDI

✓ Taqdim etilgan barcha ma'lumotlar to'g'ri va haqqoniy

Rahbar:          ${d.director}
Bosh buxgalter:  _______________
Yurist:          _______________

M.O'                          Imzo: ___________`;

    // ── HUJJAT 3: KOMPANIYA MA'LUMOTLARI (Shakl №3)
    document.getElementById('doc-output-kompaniya').textContent =
`KOMPANIYA MA'LUMOTLARI (Shakl №3)
═══════════════════════════════════════════
Sana: ${today}

┌──────────────────────────┬────────────────────────────────────┐
│ KOMPANIYA TO'LIQ NOMI    │ "${d.company}" ${d.orgForm}                │
├──────────────────────────┼────────────────────────────────────┤
│ TASHKILIY SHAKLI         │ ${d.orgForm}                              │
├──────────────────────────┼────────────────────────────────────┤
│ RAHBAR F.I.SH            │ ${d.director}                             │
├──────────────────────────┼────────────────────────────────────┤
│ INN RAQAMI               │ ${d.inn}                                  │
├──────────────────────────┼────────────────────────────────────┤
│ YURIDIK MANZIL           │ ${d.address}                              │
├──────────────────────────┼────────────────────────────────────┤
│ TELEFON / EMAIL          │ ${d.phoneEmail}                           │
├──────────────────────────┼────────────────────────────────────┤
│ BANK REKVIZITLARI        │ ${d.bankDetails}                          │
├──────────────────────────┼────────────────────────────────────┤
│ FAOLIYAT TAJRIBASI       │ ${d.exp} yil                              │
├──────────────────────────┼────────────────────────────────────┤
│ XODIMLAR SONI            │ ~${d.exp > 10 ? '100+' : d.exp > 5 ? '50-100' : '20-50'}  │
├──────────────────────────┼────────────────────────────────────┤
│ ASOSIY LOYIHALAR         │ ${d.pastProjects}                         │
└──────────────────────────┴────────────────────────────────────┘

Rahbar: ${d.director}
M.O'                          Imzo: ___________`;

    // ── HUJJAT 4: TEXNIK TAKLIF (Shakl №6)
    document.getElementById('doc-output-texnik').textContent =
`TEXNIK TAKLIF (Shakl №6 — Qiyosiy jadval)
═══════════════════════════════════════════
Sana: ${today}
Kompaniya: "${d.company}" ${d.orgForm}
Tender: "${d.tenderName}"
LOT: ${d.tenderLot}
Buyurtmachi: ${d.buyerOrg}

──────────────────────────────────────────

"${d.company}" ${d.orgForm} "${d.tenderName}" bo'yicha texnik taklifni 
taqdim etadi.

1. LOYIHA TUSHUNISHI
────────────────────
${d.exp} yillik tajribamiz va ${d.pastProjects || 'shu sohada muvaffaqiyatli loyihalar'} 
asosida buyurtmachi tomonidan qo'yilgan barcha texnik talablarni 
to'liq bajarishni kafolatlaymiz.

2. AMALGA OSHIRISH METODOLOGIYASI
─────────────────────────────────
Bosqich 1 (1-2 oy): Tashkiliy ishlar, jamoani shakllantirish
Bosqich 2 (2-4 oy): Asosiy ishlarni amalga oshirish
Bosqich 3 (4-5 oy): Sifat nazorati va sinov bosqichi
Bosqich 4 (5-oy): Topshirish va hujjatlashtirish

3. TEXNIK IMKONIYATLAR
──────────────────────
✓ Zamonaviy uskunalar va texnologiyalar parki
✓ Malakali mutaxassislar jamoasi
✓ ISO 9001:2015 sifat menejmenti tizimi
✓ Loyiha boshqaruvi (Agile/PMBOK metodologiyasi)

4. BAJARISH MUDDATI
───────────────────
Shartnoma imzolanganidan boshlab: ${d.deliveryTerm}

5. KAFOLATLAR
─────────────
• Barcha ishlarning qonunchilik va standartlar talablariga muvofiqligi
• Kafolat muddati: 12 oy (topshirilganidan boshlab)
• Texnik qo'llab-quvvatlash: 24 oy

Rahbar: ${d.director}
M.O'                          Imzo: ___________`;

    // ── HUJJAT 5: NARX TAKLIFI (Shakl №7)
    document.getElementById('doc-output-narx').textContent =
`NARX TAKLIFI (Shakl №7)
═══════════════════════════════════════════
Sana: ${today}
Kompaniya: "${d.company}" ${d.orgForm}
Tender: "${d.tenderName}"
LOT: ${d.tenderLot}
Buyurtmachi: ${d.buyerOrg}

──────────────────────────────────────────

Tender shartlariga muvofiq "${d.tenderName}" uchun 
narx taklifimizni taqdim etamiz:

UMUMIY TAKLIF NARXI: ${d.formatted} so'm
(QQS 12% bilan)
═════════════════════════════════════════

XARAJATLAR TARKIBI:
┌───────────────────────────┬──────────┬──────────────────┐
│ BAND                      │ ULUSHI   │ SUMMA            │
├───────────────────────────┼──────────┼──────────────────┤
│ Materiallar va uskunalar  │   40%    │ ___              │
│ Ish haqi va mehnat        │   25%    │ ___              │  
│ Transport va logistika    │   10%    │ ___              │
│ Boshqaruv xarajatlari     │    8%    │ ___              │
│ Kafolat fondi             │    7%    │ ___              │
│ Foyda                     │   10%    │ ___              │
├───────────────────────────┼──────────┼──────────────────┤
│ JAMI                      │  100%    │ ${d.formatted}   │
└───────────────────────────┴──────────┴──────────────────┘

TO'LOV SHARTLARI:
• 50% — oldindan to'lov (shartnoma imzolanganidan keyin)
• 50% — ishlar bajarilgandan va dalolatnoma imzolanganidan keyin

TAKLIFNING AMAL QILISH MUDDATI: 30 kalendar kun

BANK KAFOLATI: Talab bo'yicha taqdim etiladi

Rahbar: ${d.director}
M.O'                          Imzo: ___________`;

    // ── HUJJAT 6: MOLIYAVIY HOLAT (Shakl №3, 2-ilova)
    document.getElementById('doc-output-moliya').textContent =
`MOLIYAVIY HOLAT (Shakl №3, 2-ilova)
═══════════════════════════════════════════
Sana: ${today}
Kompaniya: "${d.company}" ${d.orgForm}
INN: ${d.inn}

Bank rekvizitlari:
${d.bankDetails}

MOLIYAVIY KO'RSATKICHLAR JADVALI:
┌──────────────────────────┬────────────┬────────────┬────────────┐
│ KO'RSATKICH              │  2022 yil  │  2023 yil  │  2024 yil  │
├──────────────────────────┼────────────┼────────────┼────────────┤
│ Yalpi daromad (mln so'm) │ ___        │ ___        │ ___        │
├──────────────────────────┼────────────┼────────────┼────────────┤
│ Sof foyda (mln so'm)     │ ___        │ ___        │ ___        │
├──────────────────────────┼────────────┼────────────┼────────────┤
│ Aktivlar (mln so'm)      │ ___        │ ___        │ ___        │
├──────────────────────────┼────────────┼────────────┼────────────┤
│ Majburiyatlar (mln so'm) │ ___        │ ___        │ ___        │
├──────────────────────────┼────────────┼────────────┼────────────┤
│ O'z kapitali (mln so'm)  │ ___        │ ___        │ ___        │
├──────────────────────────┼────────────┼────────────┼────────────┤
│ Xodimlar soni            │ ___        │ ___        │ ___        │
└──────────────────────────┴────────────┴────────────┴────────────┘

SOLIQ HOLATI:
• Soliq qarzdorligi: YO'Q
• Oxirgi tekshiruv: ___
• Soliq to'lovchining reytingi: ___

Bosh buxgalter: _______________
Rahbar: ${d.director}
M.O'                          Imzo: ___________`;

    // ── HUJJAT 7: VAKOLATNOMA (Shakl №5)
    document.getElementById('doc-output-vakolat').textContent =
`VAKOLATNOMA (Shakl №5)
═══════════════════════════════════════════
Sana: ${today}

"${d.company}" ${d.orgForm}
INN: ${d.inn}
Manzil: ${d.address}

VAKOLATNOMA № ____

"${d.company}" ${d.orgForm}, joriy Ustav asosida faoliyat yurituvchi, 
ushbu vakolatnoma bilan:

${d.director} ga

quyidagi vakolatlarni beradi:

1. "${d.tenderName}" (${d.tenderLot}) bo'yicha tender 
   hujjatlarini taqdim etish

2. Xarid komissiyasi bilan muzokaralar olib borish

3. Komissiya majlislarida kompaniya nomidan qatnashish

4. Tender bilan bog'liq barcha hujjatlarga imzo chekish

5. Savol-javoblarda kompaniya manfaatlarini himoya qilish

Vakolatnoma amal qilish muddati: 
tender natijalari e'lon qilinguniga qadar

Kompaniya rahbari: ${d.director}
Lavozimi: Bosh direktor

M.O'                          Imzo: ___________
Sana: ${today}`;

    showDocLoading(false);
    showGenerated(true);
    const aiLabel = document.getElementById('ai-model-label');
    if (aiLabel) aiLabel.textContent = '📄 Demo shablon (AI ulanganida to\'liq professional hujjat yaratiladi)';
    showToast('7 ta hujjat yaratildi ✅', 'success');
  }, 4800);
}

function showDocLoading(show) {
  document.getElementById('output-placeholder').style.display = show ? 'none' : 'flex';
  document.getElementById('generated-docs').style.display     = 'none';
  document.getElementById('doc-loading').style.display        = show ? 'flex' : 'none';
  document.getElementById('btn-generate').disabled            = show;

  if (show) {
    const steps = ['ls-1','ls-2','ls-3','ls-4','ls-5'];
    const delays = [0, 800, 1600, 2600, 3800];
    steps.forEach((id, i) => {
      setTimeout(() => {
        const el = document.getElementById(id);
        if (el) {
          el.classList.remove('dim');
          const prev = document.getElementById(steps[i-1]);
          if (prev) prev.querySelector('.ls-indicator').innerHTML = '<div class="ls-done">✓</div>';
        }
      }, delays[i]);
    });
  } else {
    const steps = ['ls-1','ls-2','ls-3','ls-4','ls-5'];
    steps.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.classList.add('dim');
        el.querySelector('.ls-indicator').innerHTML = '<div class="ls-spinner"></div>';
      }
    });
    document.getElementById('ls-1')?.classList.remove('dim');
  }
}

function showGenerated(show) {
  document.getElementById('generated-docs').style.display = show ? 'flex' : 'none';
  if (show) {
    const last = document.getElementById('ls-5');
    if (last) last.querySelector('.ls-indicator').innerHTML = '<div class="ls-done">✓</div>';
    document.getElementById('doc-loading').style.display = 'none';
  }
}

function switchDocTab(name) {
  document.querySelectorAll('.doc-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.doc-output').forEach(d => d.classList.add('hidden'));
  event.target.classList.add('active');
  document.getElementById(`doc-output-${name}`)?.classList.remove('hidden');
}

function copyDoc() {
  const active = document.querySelector('.doc-output:not(.hidden)');
  if (!active) return;
  navigator.clipboard.writeText(active.textContent).then(() => {
    const btn = document.querySelector('.btn-copy');
    const orig = btn.textContent;
    btn.textContent = '✓ Nusxalandi!';
    setTimeout(() => btn.textContent = orig, 2000);
    showToast('Matn nusxalandi', 'success');
  });
}

function downloadDoc() {
  const active = document.querySelector('.doc-output:not(.hidden)');
  if (!active) return;
  const blob = new Blob([active.textContent], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'TenderMind_Hujjat.txt';
  a.click();
  showToast('Hujjat yuklab olindi ⬇️', 'success');
}

function restartDoc() {
  document.getElementById('generated-docs').style.display = 'none';
  document.getElementById('output-placeholder').style.display = 'flex';
  document.getElementById('doc-form').reset();
}

// ── EXPORT DOCS ───────────────────────────────────────────────────
async function exportDoc(type) {
  const activeTab = document.querySelector('.doc-tab.active');
  const typeId = activeTab ? activeTab.getAttribute('onclick').match(/'([^']+)'/)[1] : 'technical';
  const outEl = document.getElementById(`doc-output-${typeId}`);
  if (!outEl || !outEl.textContent) {
    showToast('Oldin hujjat generatsiya qiling!', 'warning');
    return;
  }
  
  const titleMap = { technical: "Texnik Taklif", financial: "Moliyaviy Taklif", profile: "Kompaniya Profili" };
  const filename = `${titleMap[typeId] || 'Hujjat'}_${document.getElementById('company-name').value || 'Mijoz'}`;
  
  showToast(`Hujjat (${type.toUpperCase()}) tayyorlanmoqda...`, 'info');

  if (type === 'pdf') {
    // Beautiful Frontend PDF Generation
    const opt = {
      margin: 10,
      filename: `${filename}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    try {
      await html2pdf().set(opt).from(outEl).save();
      showToast('PDF muvaffaqiyatli saqlandi', 'success');
    } catch (err) {
      console.error(err);
      showToast('PDF saqlashda xatolik', 'error');
    }
  } else {
    // Backend Word export
    try {
      const r = await fetch(`/api/export/${type}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: filename, content: outEl.textContent })
      });
      if (!r.ok) throw new Error('Export error');
      
      const blob = await r.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename}.docx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      showToast(`Hujjat (WORD) saqlandi`, 'success');
    } catch (err) {
      console.error(err);
      showToast('Word eksport qilishda xatolik yuz berdi', 'error');
    }
  }
}

// ══════════════════════════════════════════════
// STRATEGIYA — AI
// ══════════════════════════════════════════════
async function loadStrategy(tenderId) {
  const container = document.getElementById('strategy-content');
  if (!container) return;
  
  if (!tenderId) {
    container.innerHTML = renderDefaultStrategy();
    animateKPIs();
    return;
  }

  const tender = state.tenders.find(t => t.id === tenderId) || state.selectedTender;
  const company = state.user?.company || '';
  const exp = document.getElementById('company-name')?.value ? document.getElementById('experience')?.value : '';

  container.innerHTML = `<div class="strategy-loading">
    <div class="ls-spinner" style="width:40px;height:40px;border-width:3px"></div>
    <p style="margin-top:16px;color:var(--text-2)">AI strategiya tayyorlamoqda...</p>
  </div>`;

  try {
    const r = await fetch(`${API}/api/strategy`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenderId, company, experience: exp })
    });
    const data = await r.json();
    if (data.success) {
      state.strategyTender = tender;
      container.innerHTML = renderStrategyContent(data.strategy, tender, data.aiGenerated);
      animateKPIs();
    }
  } catch {
    container.innerHTML = renderDefaultStrategy();
    animateKPIs();
  }
}

function renderStrategyContent(s, tender, aiGenerated) {
  const stepStatusMap = { done:'✓ Bajarildi', active:'⚡ Jarayonda', pending:'🕐 Kutilmoqda' };
  const stepClassMap  = { done:'completed', active:'active', pending:'pending' };

  return `
  <div class="strategiya-header">
    <h2 class="panel-title">G'alaba Strategiyasi${tender ? ` — <span style="color:var(--accent);font-size:0.7em">${tender.title.substring(0,50)}...</span>` : ''}</h2>
    <p class="strategiya-subtitle">${aiGenerated ? '✨ AI tahlili asosida' : '📊 Avtomat tahlil asosida'} ishlab chiqilgan reja</p>
    <div class="human-loop-warning compact">
      <span>⚠️</span>
      <span>Bu strategiya tavsiyalar xususiyatida. Barcha qarorlar inson tomonidan qabul qilinishi kerak.</span>
    </div>
  </div>
  
  <div class="kpi-grid">
    ${(s.kpis || []).map((k,i) => `
    <div class="kpi-card" id="kpi-${i+1}">
      <div class="kpi-icon">${k.icon}</div>
      <div class="kpi-value" data-target="${parseFloat(k.value) || 0}" data-suffix="${k.value.replace(/[\d.]/g,'')}">${k.value}</div>
      <div class="kpi-label">${k.label}</div>
      <div class="kpi-trend up">${k.trend}</div>
      <div class="kpi-bar"><div class="kpi-fill ${k.color||''}" style="width:${Math.min(100, parseFloat(k.value)||50)}%"></div></div>
    </div>`).join('')}
  </div>

  <div class="strategy-section">
    <h3 class="strategy-section-title">5 Qadamli G'alaba Rejasi</h3>
    <div class="strategy-steps">
      ${(s.steps || []).map((step, i) => `
      <div class="strategy-step ${stepClassMap[step.status] || 'pending'}" id="ss-${i+1}">
        <div class="ss-num">${i+1}</div>
        <div class="ss-content">
          <div class="ss-header">
            <h4>${step.title}</h4>
            <span class="ss-status ${step.status}">${stepStatusMap[step.status] || step.status}</span>
          </div>
          <p>${step.description}</p>
          ${step.tag ? `<div class="ss-tags"><span class="ss-tag ${step.status === 'active' ? 'highlight' : ''}">${step.tag}</span></div>` : ''}
        </div>
      </div>`).join('')}
    </div>
  </div>

  ${s.risks?.length ? `
  <div class="risk-matrix">
    <h3 class="strategy-section-title">Xavf Tahlili</h3>
    <div class="risk-grid">
      ${s.risks.map(r => `
      <div class="risk-item ${r.level}">
        <div class="risk-level">${r.level === 'low' ? 'Past xavf' : r.level === 'medium' ? "O'rta xavf" : 'Yuqori xavf'}</div>
        <p>${r.text}</p>
      </div>`).join('')}
    </div>
  </div>` : ''}

  ${s.keyAdvantages?.length ? `
  <div class="strategy-section" style="margin-top:24px">
    <h3 class="strategy-section-title">Asosiy Ustunliklar</h3>
    <div class="advantages-grid">
      ${s.keyAdvantages.map(a => `<div class="advantage-item">✓ ${a}</div>`).join('')}
    </div>
  </div>` : ''}`;
}

function renderDefaultStrategy() {
  return `
  <div class="strategiya-header">
    <h2 class="panel-title">G'alaba Strategiyasi</h2>
    <p class="strategiya-subtitle">Tender tanlang va AI strategiya ko'ring</p>
  </div>
  <div class="kpi-grid">
    <div class="kpi-card" id="kpi-1"><div class="kpi-icon">📊</div><div class="kpi-value" data-target="87" data-suffix="%">0%</div><div class="kpi-label">O'rtacha g'alaba</div><div class="kpi-trend up">↑ 12%</div><div class="kpi-bar"><div class="kpi-fill" style="width:87%"></div></div></div>
    <div class="kpi-card" id="kpi-2"><div class="kpi-icon">🏆</div><div class="kpi-value" data-target="23">0</div><div class="kpi-label">Yutilgan tenderlar</div><div class="kpi-trend up">↑ 5 ta yangi</div><div class="kpi-bar"><div class="kpi-fill green" style="width:65%"></div></div></div>
    <div class="kpi-card" id="kpi-3"><div class="kpi-icon">⚡</div><div class="kpi-value" data-target="30">0</div><div class="kpi-label">Aktiv tenderlar</div><div class="kpi-trend up">↑ 2 ta yangi</div><div class="kpi-bar"><div class="kpi-fill blue" style="width:55%"></div></div></div>
  </div>
  <div class="tender-select-hint">
    <div class="hint-icon">🎯</div>
    <h3>Tender uchun AI strategiya oling</h3>
    <p>Tenderlar sahifasida istalgan tenderni oching va "Strategiya ko'rish" tugmasini bosing</p>
    <button class="btn-primary nav-cta" style="margin-top:16px" onclick="switchTab('tenderlar')">Tenderlarni ko'rish →</button>
  </div>`;
}

function animateKPIs() {
  document.querySelectorAll('.kpi-value[data-target]').forEach(el => {
    const target = +el.dataset.target;
    if (!target) return;
    const suffix = el.dataset.suffix || '';
    let current = 0, step = target / 50;
    const timer = setInterval(() => {
      current = Math.min(current + step, target);
      el.textContent = Math.floor(current) + suffix;
      if (current >= target) clearInterval(timer);
    }, 25);
  });
}

// ══════════════════════════════════════════════
// FALLBACK (when server is not running)
// ══════════════════════════════════════════════
function loadFallbackTenders() {
  // Inline fallback data
  const fallback = [
    { id:'it-001', soha:'it', hudud:'toshkent', status:'active', isNew:true, title:'Toshkent shahar davlat idoralarini IT infratuzilmasini modernizatsiyalash', budget:'4 200 000 000', budgetRaw:4200000000, probability:87, competitors:3, deadline:'2026-05-28', tags:['Tarmoq','Server','Bulut'], org:'Toshkent shahar hokimiyati' },
    { id:'it-002', soha:'it', hudud:'samarqand', status:'active', isNew:false, title:'Samarqand viloyati elektron hukumat platformasini joriy etish', budget:'2 800 000 000', budgetRaw:2800000000, probability:72, competitors:5, deadline:'2026-05-10', tags:['E-gov','Portal','API'], org:'Samarqand viloyat hokimiyati' },
    { id:'q-001', soha:'qurilish', hudud:'toshkent', status:'active', isNew:false, title:'Toshkent metro liniyasi — yangi bekatlar qurilishi', budget:'12 800 000 000', budgetRaw:12800000000, probability:45, competitors:12, deadline:'2026-04-15', tags:['Yer osti','Beton','Infra'], org:"O'zbekiston Temir Yo'llari" },
    { id:'t-001', soha:'tibbiyot', hudud:'namangan', status:'active', isNew:false, title:'Namangan viloyati shifoxonalari uchun tibbiy jihozlar yetkazib berish', budget:'2 100 000 000', budgetRaw:2100000000, probability:81, competitors:4, deadline:'2026-04-30', tags:['Jihozlar','MRI','Laboratoriya'], org:"Sog'liqni Saqlash Vazirligi" },
    { id:'o-001', soha:'oziq', hudud:'fargona', status:'active', isNew:false, title:"Farg'ona viloyati maktablari uchun ovqatlanish xizmatini ko'rsatish", budget:'890 000 000', budgetRaw:890000000, probability:88, competitors:2, deadline:'2026-04-20', tags:['Maktab','Ovqat','HACCP'], org:"Farg'ona Xalq Ta'limi Boshqarmasi" },
    { id:'ta-001', soha:'talim', hudud:'buxoro', status:'active', isNew:false, title:"Buxoro viloyati maktablari uchun ta'lim texnologiyalari", budget:'890 000 000', budgetRaw:890000000, probability:82, competitors:3, deadline:'2026-04-22', tags:['EdTech','Doska','Tablet'], org:"Buxoro Xalq Ta'limi" },
  ];
  state.tenders = fallback;
  state.totalTenders = fallback.length;
  renderTendersGrid(fallback);
  document.getElementById('results-count').textContent = `${fallback.length} ta tender (offline rejim)`;
  document.getElementById('pagination').innerHTML = '';
}

// ══════════════════════════════════════════════
// TOAST NOTIFICATIONS
// ══════════════════════════════════════════════
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container') || createToastContainer();
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  const icons = { success:'✅', error:'❌', warning:'⚠️', info:'ℹ️' };
  toast.innerHTML = `<span class="toast-icon">${icons[type] || '💬'}</span><span>${message}</span>`;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 3500);
}

function createToastContainer() {
  const el = document.createElement('div');
  el.id = 'toast-container';
  document.body.appendChild(el);
  return el;
}

// ══════════════════════════════════════════════
// AI CHAT MASLAHATCHI
// ══════════════════════════════════════════════
const chatState = {
  isOpen: false,
  history: [],
  tenderContext: null,
  isLoading: false,
};

function toggleAIChat() {
  chatState.isOpen = !chatState.isOpen;
  const win = document.getElementById('ai-chat-window');
  const fab = document.getElementById('ai-chat-fab');
  if (win) win.classList.toggle('open', chatState.isOpen);
  if (fab) fab.classList.toggle('active', chatState.isOpen);
  if (chatState.isOpen) {
    setTimeout(() => document.getElementById('ai-chat-input')?.focus(), 300);
  }
}

function clearChatHistory() {
  chatState.history = [];
  chatState.tenderContext = null;
  const body = document.getElementById('ai-chat-body');
  if (body) {
    body.innerHTML = `
    <div class="ai-msg ai-msg-bot">
      <div class="ai-msg-avatar">🤖</div>
      <div class="ai-msg-bubble">
        <b>Suhbat tozalandi! 🔄</b><br><br>
        Yangi savol bering yoki tenderlar sahifasidan tender tanlang.
      </div>
    </div>`;
  }
  clearChatContext();
  document.getElementById('ai-chat-suggestions').style.display = 'flex';
  showToast('Suhbat tozalandi', 'info');
}

function clearChatContext() {
  chatState.tenderContext = null;
  const ctx = document.getElementById('ai-chat-context');
  if (ctx) ctx.style.display = 'none';
}

function setChatContext(tenderId, tenderTitle) {
  chatState.tenderContext = tenderId;
  const ctx = document.getElementById('ai-chat-context');
  const badge = document.getElementById('ai-context-badge');
  if (ctx) ctx.style.display = 'flex';
  if (badge) badge.textContent = `📌 ${tenderTitle.substring(0, 40)}...`;
}

function askAIAboutTender(tenderId) {
  const tender = state.tenders.find(t => t.id === tenderId) || state.selectedTender;
  if (!tender) return;
  hideModal('tender-detail-modal');
  setChatContext(tenderId, tender.title);
  if (!chatState.isOpen) toggleAIChat();
  // Auto-send a question about this tender
  setTimeout(() => {
    const input = document.getElementById('ai-chat-input');
    if (input) {
      input.value = `"${tender.title}" tenderida qatnashish kerakmi? Maslahat bering.`;
      sendAIChat(new Event('submit'));
    }
  }, 400);
}

function sendAIChatSuggestion(text) {
  const input = document.getElementById('ai-chat-input');
  if (input) input.value = text;
  sendAIChat(new Event('submit'));
}

async function sendAIChat(e) {
  if (e && e.preventDefault) e.preventDefault();
  const input = document.getElementById('ai-chat-input');
  const message = input?.value?.trim();
  if (!message || chatState.isLoading) return;
  input.value = '';

  // Hide suggestions after first message
  document.getElementById('ai-chat-suggestions').style.display = 'none';

  // Add user message to UI
  appendChatMessage('user', message);
  chatState.history.push({ role: 'user', content: message });

  // Show typing indicator
  chatState.isLoading = true;
  const typingId = showTypingIndicator();
  document.getElementById('ai-chat-send').disabled = true;

  try {
    const r = await fetch(`${API}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        tenderContext: chatState.tenderContext,
        history: chatState.history.slice(-10)
      })
    });
    const data = await r.json();
    removeTypingIndicator(typingId);

    if (data.reply) {
      appendChatMessage('bot', data.reply, data.aiGenerated);
      chatState.history.push({ role: 'assistant', content: data.reply });
    }
  } catch (err) {
    removeTypingIndicator(typingId);
    appendChatMessage('bot', '❌ Serverga ulanib bo\'lmadi. Qaytadan urinib ko\'ring.', false);
  } finally {
    chatState.isLoading = false;
    document.getElementById('ai-chat-send').disabled = false;
  }
}

function appendChatMessage(role, text, aiGenerated = false) {
  const body = document.getElementById('ai-chat-body');
  if (!body) return;
  const div = document.createElement('div');
  div.className = `ai-msg ai-msg-${role === 'user' ? 'user' : 'bot'}`;

  // Format markdown-like text
  let formatted = text
    .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
    .replace(/\n/g, '<br>')
    .replace(/• /g, '&bull; ');

  if (role === 'user') {
    div.innerHTML = `<div class="ai-msg-bubble user-bubble">${formatted}</div>`;
  } else {
    div.innerHTML = `
      <div class="ai-msg-avatar">🤖</div>
      <div class="ai-msg-bubble">
        ${formatted}
        ${aiGenerated !== false ? '<div class="ai-badge">✨ AI Generated</div>' : '<div class="ai-badge demo">📊 Smart Template</div>'}
      </div>`;
  }

  body.appendChild(div);
  // Animate entrance
  requestAnimationFrame(() => div.classList.add('visible'));
  body.scrollTop = body.scrollHeight;
}

function showTypingIndicator() {
  const body = document.getElementById('ai-chat-body');
  const id = 'typing-' + Date.now();
  const div = document.createElement('div');
  div.className = 'ai-msg ai-msg-bot visible';
  div.id = id;
  div.innerHTML = `
    <div class="ai-msg-avatar">🤖</div>
    <div class="ai-msg-bubble typing-bubble">
      <div class="typing-dots">
        <span></span><span></span><span></span>
      </div>
      <span class="typing-text">AI tahlil qilmoqda...</span>
    </div>`;
  body.appendChild(div);
  body.scrollTop = body.scrollHeight;
  return id;
}

function removeTypingIndicator(id) {
  document.getElementById(id)?.remove();
}

// ══════════════════════════════════════════════
// AI TENDER RECOMMENDATIONS
// ══════════════════════════════════════════════
async function getAIRecommendations() {
  const btn = document.getElementById('btn-ai-recommend');
  const results = document.getElementById('ai-recommend-results');
  if (!results) return;

  const company = document.getElementById('rec-company')?.value?.trim() || '';
  const experience = document.getElementById('rec-experience')?.value || '';
  const soha = document.getElementById('rec-soha')?.value || 'all';
  const hudud = document.getElementById('rec-hudud')?.value || 'all';

  btn.disabled = true;
  btn.textContent = '🤖 AI tahlil qilmoqda...';
  results.innerHTML = `
    <div style="text-align:center;padding:40px;color:var(--text-2)">
      <div class="ls-spinner" style="width:36px;height:36px;border-width:3px;margin:0 auto 16px"></div>
      <p>AI sizga mos tenderlarni tahlil qilmoqda...</p>
    </div>`;

  try {
    const r = await fetch(`${API}/api/ai/recommend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company, experience, soha, hudud })
    });
    const data = await r.json();

    if (data.success && data.recommendations?.length) {
      results.innerHTML = renderRecommendations(data);
    } else {
      results.innerHTML = `<div style="text-align:center;padding:30px;color:var(--text-3)">
        <p>Mos tender topilmadi. Filtrlarni o'zgartiring.</p></div>`;
    }
  } catch {
    results.innerHTML = `<div style="text-align:center;padding:30px;color:var(--red)">
      <p>Serverga ulanib bo'lmadi</p></div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = '🤖 AI Tavsiya Olish';
  }
}

function renderRecommendations(data) {
  const { recommendations, summary, aiGenerated } = data;
  return `
    <div class="ai-rec-header">
      <div class="ai-rec-summary">
        <span class="ai-rec-badge">${aiGenerated ? '✨ AI tahlili' : '📊 Avtomat tahlil'}</span>
        <span>${summary || ''}</span>
      </div>
    </div>
    <div class="ai-rec-list">
      ${recommendations.map((rec, i) => {
        const scoreColor = rec.score >= 80 ? 'var(--green)' : rec.score >= 60 ? 'var(--yellow)' : 'var(--red)';
        const daysLeft = rec.deadline ? Math.ceil((new Date(rec.deadline) - new Date()) / 86400000) : '?';
        return `
        <div class="ai-rec-card" onclick="openTenderDetail('${rec.tenderId}');hideModal('ai-recommend-modal')">
          <div class="ai-rec-rank">#${i+1}</div>
          <div class="ai-rec-info">
            <div class="ai-rec-title">${rec.title || rec.tenderId}</div>
            <div class="ai-rec-reason">${rec.reason || ''}</div>
            <div class="ai-rec-meta">
              <span>💰 ${rec.budget || '?'}</span>
              <span>⚔️ ${rec.competitors || '?'} raqib</span>
              <span>⏰ ${daysLeft} kun</span>
            </div>
            ${rec.tips?.length ? `
            <div class="ai-rec-tips">
              ${rec.tips.map(tip => `<div class="ai-rec-tip">💡 ${tip}</div>`).join('')}
            </div>` : ''}
          </div>
          <div class="ai-rec-score" style="color:${scoreColor}">
            <div class="score-value">${rec.score}%</div>
            <div class="score-label">mos</div>
          </div>
        </div>`;
      }).join('')}
    </div>`;
}
