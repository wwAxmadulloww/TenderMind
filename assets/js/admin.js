/* ═══════════════════════════════════════════════════════════
   TENDERMIND — Admin panel
   Alohida sahifa (/admin). Huquq API darajasida tekshiriladi:
   bu fayldagi hech narsa xavfsizlik chegarasi emas.
   ═══════════════════════════════════════════════════════════ */

'use strict';

const admin = {
  token: localStorage.getItem('tm_admin_token') || '',
  user: null,
  view: 'dashboard',
  tenders: [],
  users: [],
  subs: [],
};

// ── Yordamchilar ──────────────────────────────────────────────────────
const esc = (s) => String(s ?? '').replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const money = (n) => new Intl.NumberFormat('uz-UZ').format(Number(n) || 0);
const date = (d) => d ? new Date(d).toLocaleDateString('uz-UZ') : '—';

function toast(message, type = 'info') {
  const el = document.getElementById('admin-toast');
  el.textContent = message;
  el.className = `admin-toast show ${type}`;
  setTimeout(() => { el.className = 'admin-toast'; }, 3200);
}

async function api(path, options = {}) {
  const r = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(admin.token ? { Authorization: `Bearer ${admin.token}` } : {}),
      ...(options.headers || {}),
    },
  });

  const data = await r.json().catch(() => ({}));

  if (r.status === 401) {
    adminLogout();
    throw new Error('Sessiya tugadi — qaytadan kiring');
  }
  if (r.status === 403) {
    // Oddiy foydalanuvchi admin panelga kirishga urinsa
    adminLogout();
    throw new Error(data.error || 'Sizda administrator huquqi yo\'q');
  }
  if (!r.ok) throw new Error(data.message || data.error || 'Server xatosi');

  return data;
}

// ── Kirish / chiqish ──────────────────────────────────────────────────
async function adminLogin(event) {
  event.preventDefault();
  const errorBox = document.getElementById('admin-login-error');
  errorBox.textContent = '';

  try {
    const r = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: document.getElementById('admin-phone').value.trim(),
        password: document.getElementById('admin-password').value,
      }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Kirishda xatolik');

    admin.token = data.token;
    admin.user = data.user;

    // Admin ekanini darhol tekshiramiz — oddiy foydalanuvchi panelni
    // umuman ko'rmasligi kerak
    await api('/api/admin/stats');

    localStorage.setItem('tm_admin_token', admin.token);
    startPanel();
  } catch (err) {
    errorBox.textContent = err.message;
  }
}

function adminLogout() {
  admin.token = '';
  admin.user = null;
  localStorage.removeItem('tm_admin_token');
  document.getElementById('admin-panel').style.display = 'none';
  document.getElementById('admin-login').style.display = 'flex';
}

async function startPanel() {
  document.getElementById('admin-login').style.display = 'none';
  document.getElementById('admin-panel').style.display = 'block';
  if (admin.user) {
    document.getElementById('admin-who').textContent = `${admin.user.name} · ${admin.user.phone}`;
  }
  await showAdminView('dashboard');
  refreshPendingBadge();
}

// ── Ko'rinishlar ──────────────────────────────────────────────────────
async function showAdminView(view) {
  admin.view = view;
  document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.view === view);
  });
  document.querySelectorAll('.admin-view').forEach(section => {
    section.style.display = 'none';
  });

  const container = document.getElementById(`view-${view}`);
  container.style.display = 'block';
  container.innerHTML = '<div class="admin-loading">Yuklanmoqda...</div>';

  try {
    if (view === 'dashboard') await renderDashboard(container);
    if (view === 'tenders') await renderTenders(container);
    if (view === 'users') await renderUsers(container);
    if (view === 'subs') await renderSubs(container);
  } catch (err) {
    container.innerHTML = `<div class="admin-error-box">⚠️ ${esc(err.message)}</div>`;
  }
}

async function renderDashboard(container) {
  const s = await api('/api/admin/stats');

  const card = (label, value, hint) => `
    <div class="admin-stat">
      <div class="admin-stat-label">${label}</div>
      <div class="admin-stat-value">${value}</div>
      ${hint ? `<div class="admin-stat-hint">${hint}</div>` : ''}
    </div>`;

  container.innerHTML = `
    <h2 class="admin-h2">Umumiy holat</h2>
    <div class="admin-stats-grid">
      ${card('Foydalanuvchilar', s.users.total, `${s.users.newThisWeek} ta shu hafta`)}
      ${card('Pullik tarifda', s.users.pro, `${s.users.admins} ta admin`)}
      ${card('Tenderlar', s.tenders.total, `${s.tenders.real} ta haqiqiy · ${s.tenders.demo} ta demo`)}
      ${card('Lotlar', s.lots.total, `${s.lots.explained} tasi tushuntirilgan`)}
      ${card('Faol obunalar', s.subscriptions.active, '')}
      ${card('Kutilayotgan to\'lov', s.subscriptions.pending, s.subscriptions.pending > 0 ? '⚠️ tasdiqlash kerak' : '')}
    </div>

    ${s.tenders.real === 0 ? `
      <div class="admin-notice">
        <strong>Bazada haqiqiy tender yo'q.</strong>
        Hozir faqat ${s.tenders.demo} ta namunaviy yozuv bor. Foydalanuvchilar
        buni "DEMO" belgisi orqali ko'rib turibdi. Haqiqiy e'lonlarni qo'lda
        qo'shing yoki ingestion servisini ulang.
      </div>` : ''}
  `;
}

// ── Tenderlar ─────────────────────────────────────────────────────────
async function renderTenders(container, page = 1) {
  const data = await api(`/api/admin/tenders?page=${page}&limit=20`);
  admin.tenders = data.items;

  container.innerHTML = `
    <div class="admin-view-head">
      <h2 class="admin-h2">Tenderlar <span class="admin-count">${data.total}</span></h2>
      <button class="admin-btn primary" data-action="new-tender">+ Yangi tender</button>
    </div>

    <div id="tender-form-slot"></div>

    <table class="admin-table">
      <thead>
        <tr><th>Nomi</th><th>Soha</th><th>Byudjet</th><th>Muddat</th><th>Holat</th><th></th></tr>
      </thead>
      <tbody>
        ${data.items.map(t => `
          <tr>
            <td>
              <div class="admin-cell-title">${esc(t.title)}</div>
              <div class="admin-cell-sub">${esc(t.org)}</div>
            </td>
            <td>${esc(t.soha)}</td>
            <td>${money(t.budgetRaw)}</td>
            <td>${esc(t.deadline)}</td>
            <td>
              ${t.isDemo ? '<span class="admin-pill demo">DEMO</span>' : '<span class="admin-pill real">Haqiqiy</span>'}
            </td>
            <td class="admin-actions-cell">
              <button class="admin-btn ghost small" data-action="new-lot" data-id="${esc(t.id)}">+ Lot</button>
              <button class="admin-btn danger small" data-action="remove-tender" data-id="${esc(t.id)}">O'chirish</button>
            </td>
          </tr>`).join('')}
      </tbody>
    </table>

    ${data.pages > 1 ? `
      <div class="admin-pagination">
        ${Array.from({ length: data.pages }, (_, i) => i + 1).map(p => `
          <button class="admin-page ${p === data.page ? 'active' : ''}"
                  data-action="page-tenders" data-page="${p}">${p}</button>
        `).join('')}
      </div>` : ''}
  `;
}

function openTenderForm() {
  document.getElementById('tender-form-slot').innerHTML = `
    <form class="admin-form" data-form="tender">
      <h3>Yangi tender</h3>
      <div class="admin-form-grid">
        <label>Nomi *<input name="title" required placeholder="Maktablar uchun parta yetkazib berish"></label>
        <label>Tashkilot *<input name="org" required placeholder="Toshkent shahar hokimiyati"></label>
        <label>Soha *
          <select name="soha" required>
            <option value="it">IT</option><option value="qurilish">Qurilish</option>
            <option value="tibbiyot">Tibbiyot</option><option value="oziq">Oziq-ovqat</option>
            <option value="transport">Transport</option><option value="talim">Ta'lim</option>
            <option value="ekologiya">Ekologiya</option><option value="qishloq">Qishloq xo'jaligi</option>
          </select>
        </label>
        <label>Hudud *<input name="hudud" required placeholder="toshkent"></label>
        <label>Byudjet (so'm) *<input name="budgetRaw" type="number" required placeholder="450000000"></label>
        <label>Muddat *<input name="deadline" type="date" required></label>
        <label class="admin-form-wide">Tavsif<textarea name="description" rows="3"></textarea></label>
        <label class="admin-form-wide">Manba havolasi<input name="sourceUrl" placeholder="https://..."></label>
      </div>
      <div class="admin-form-actions">
        <button type="button" class="admin-btn ghost" data-action="cancel-form">Bekor</button>
        <button type="submit" class="admin-btn primary">Saqlash</button>
      </div>
    </form>`;
}

async function saveTender(event) {
  event.preventDefault();
  const form = new FormData(event.target);
  const body = Object.fromEntries(form.entries());

  try {
    await api('/api/admin/tenders', { method: 'POST', body: JSON.stringify(body) });
    toast('Tender qo\'shildi', 'success');
    await renderTenders(document.getElementById('view-tenders'));
  } catch (err) {
    toast(err.message, 'error');
  }
}

function openLotForm(tenderId) {
  document.getElementById('tender-form-slot').innerHTML = `
    <form class="admin-form" data-form="lot" data-tender="${esc(tenderId)}">
      <h3>Yangi lot</h3>
      <div class="admin-form-grid">
        <label>Lot nomi *<input name="title" required></label>
        <label>Boshlang'ich narx (so'm) *<input name="startPrice" type="number" required></label>
        <label>Miqdori<input name="quantity" type="number"></label>
        <label>O'lchov birligi<input name="unit" placeholder="dona"></label>
        <label>Muddat *<input name="deadline" type="date" required></label>
        <label>Yetkazib berish sharti<input name="deliveryTerm" placeholder="90 kalendar kun"></label>
        <label class="admin-form-wide">Tavsif<textarea name="description" rows="3"></textarea></label>
        <label class="admin-form-wide">Talablar (vergul bilan)<input name="requirements" placeholder="3+ yil tajriba, ISO sertifikati"></label>
      </div>
      <div class="admin-form-actions">
        <button type="button" class="admin-btn ghost" data-action="cancel-form">Bekor</button>
        <button type="submit" class="admin-btn primary">Saqlash</button>
      </div>
    </form>`;
}

async function saveLot(event, tenderId) {
  event.preventDefault();
  const body = Object.fromEntries(new FormData(event.target).entries());
  body.tenderId = tenderId;
  body.requirements = body.requirements
    ? body.requirements.split(',').map(s => s.trim()).filter(Boolean)
    : [];

  try {
    await api('/api/admin/lots', { method: 'POST', body: JSON.stringify(body) });
    toast('Lot qo\'shildi', 'success');
    await renderTenders(document.getElementById('view-tenders'));
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function removeTender(id) {
  if (!confirm('Bu tender va uning barcha lotlari o\'chiriladi. Davom etasizmi?')) return;
  try {
    const result = await api(`/api/admin/tenders/${id}`, { method: 'DELETE' });
    toast(`O'chirildi (${result.deletedLots} ta lot bilan)`, 'success');
    await renderTenders(document.getElementById('view-tenders'));
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ── Foydalanuvchilar ──────────────────────────────────────────────────
async function renderUsers(container, page = 1) {
  const data = await api(`/api/admin/users?page=${page}&limit=20`);

  container.innerHTML = `
    <h2 class="admin-h2">Foydalanuvchilar <span class="admin-count">${data.total}</span></h2>
    <table class="admin-table">
      <thead>
        <tr><th>Ism</th><th>Telefon</th><th>Kompaniya</th><th>Tarif</th><th>Amal qiladi</th><th></th></tr>
      </thead>
      <tbody>
        ${data.items.map(u => `
          <tr>
            <td>
              <div class="admin-cell-title">${esc(u.name)}</div>
              ${u.role === 'admin' ? '<span class="admin-pill admin-role">ADMIN</span>' : ''}
            </td>
            <td>${esc(u.phone)}</td>
            <td>${esc(u.company || '—')}</td>
            <td><span class="admin-pill plan-${esc(u.plan)}">${esc(u.plan)}</span></td>
            <td>${date(u.planExpiresAt)}</td>
            <td class="admin-actions-cell">
              <select class="admin-mini-select" data-action="change-plan" data-id="${esc(u.id)}">
                <option value="">Tarif...</option>
                <option value="free">free</option>
                <option value="pro">pro (1 oy)</option>
                <option value="corporate">corporate (1 oy)</option>
              </select>
              <button class="admin-btn ghost small" data-action="reset-password"
                      data-id="${esc(u.id)}" data-name="${esc(u.name)}">Parolni tiklash</button>
            </td>
          </tr>`).join('')}
      </tbody>
    </table>

    ${data.pages > 1 ? `
      <div class="admin-pagination">
        ${Array.from({ length: data.pages }, (_, i) => i + 1).map(p => `
          <button class="admin-page ${p === data.page ? 'active' : ''}"
                  data-action="page-users" data-page="${p}">${p}</button>
        `).join('')}
      </div>` : ''}
  `;
}

async function changePlan(userId, plan, selectEl) {
  if (!plan) return;
  try {
    await api(`/api/admin/users/${userId}/plan`, {
      method: 'PUT',
      body: JSON.stringify({ plan, months: 1 }),
    });
    toast('Tarif o\'zgartirildi', 'success');
    await renderUsers(document.getElementById('view-users'));
  } catch (err) {
    toast(err.message, 'error');
    selectEl.value = '';
  }
}

// ── Obunalar ──────────────────────────────────────────────────────────
async function renderSubs(container) {
  const data = await api('/api/admin/subscriptions');
  const pending = data.items.filter(s => s.status === 'pending');

  container.innerHTML = `
    <h2 class="admin-h2">Obunalar <span class="admin-count">${data.total}</span></h2>

    ${pending.length ? `
      <div class="admin-notice warn">
        <strong>${pending.length} ta to'lov tasdiqlashni kutmoqda.</strong>
        Pul kelganini tekshirib, tasdiqlang — shundan keyingina tarif faollashadi.
      </div>` : ''}

    <table class="admin-table">
      <thead>
        <tr><th>Foydalanuvchi</th><th>Tarif</th><th>Summa</th><th>Hisob-faktura</th><th>Holat</th><th></th></tr>
      </thead>
      <tbody>
        ${data.items.map(s => `
          <tr>
            <td>
              <div class="admin-cell-title">${esc(s.user.name)}</div>
              <div class="admin-cell-sub">${esc(s.user.phone || '')}</div>
            </td>
            <td>${esc(s.plan)}</td>
            <td>${money(s.amount)} ${esc(s.currency)}</td>
            <td class="admin-mono">${esc(s.invoiceNumber || '—')}</td>
            <td><span class="admin-pill status-${esc(s.status)}">${esc(s.status)}</span></td>
            <td class="admin-actions-cell">
              ${s.status === 'pending' ? `
                <button class="admin-btn primary small" data-action="approve-sub" data-id="${esc(s.id)}">Tasdiqlash</button>
                <button class="admin-btn danger small" data-action="reject-sub" data-id="${esc(s.id)}">Rad etish</button>
              ` : '—'}
            </td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

async function approveSub(id) {
  const transactionId = prompt('To\'lov (tranzaksiya) raqami — ixtiyoriy:') || '';
  try {
    await api(`/api/admin/subscriptions/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ transactionId }),
    });
    toast('Obuna faollashtirildi', 'success');
    await showAdminView('subs');
    refreshPendingBadge();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function rejectSub(id) {
  const reason = prompt('Rad etish sababi:') || '';
  try {
    await api(`/api/admin/subscriptions/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
    toast('Obuna rad etildi', 'info');
    await showAdminView('subs');
    refreshPendingBadge();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function refreshPendingBadge() {
  try {
    const s = await api('/api/admin/stats');
    const badge = document.getElementById('subs-badge');
    if (s.subscriptions.pending > 0) {
      badge.textContent = s.subscriptions.pending;
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }
  } catch {
    // jimgina — badge muhim emas
  }
}

// ══════════════════════════════════════════════════════════════════════
// HODISALARNI DELEGATSIYA QILISH
// Inline `onclick` ishlatilmaydi — u Content Security Policy tomonidan
// bloklanadi. Barcha tugmalar `data-action` bilan belgilanadi.
// ══════════════════════════════════════════════════════════════════════
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.tagName === 'SELECT') return;

  const { action, id, page, name } = el.dataset;

  const handlers = {
    logout: () => adminLogout(),
    'new-tender': () => openTenderForm(),
    'new-lot': () => openLotForm(id),
    'remove-tender': () => removeTender(id),
    'cancel-form': () => { document.getElementById('tender-form-slot').innerHTML = ''; },
    'page-tenders': () => renderTenders(document.getElementById('view-tenders'), Number(page)),
    'page-users': () => renderUsers(document.getElementById('view-users'), Number(page)),
    'approve-sub': () => approveSub(id),
    'reject-sub': () => rejectSub(id),
    'reset-password': () => resetPassword(id, name),
  };

  handlers[action]?.();
});

document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-action="change-plan"]');
  if (el) changePlan(el.dataset.id, el.value, el);
});

document.addEventListener('submit', (e) => {
  const form = e.target;
  if (form.id === 'admin-login-form') return adminLogin(e);
  if (form.dataset.form === 'tender') return saveTender(e);
  if (form.dataset.form === 'lot') return saveLot(e, form.dataset.tender);
});

// Bo'lim yorliqlari — `data-view` allaqachon markupda bor
document.addEventListener('click', (e) => {
  const tab = e.target.closest('.admin-tab[data-view]');
  if (tab) showAdminView(tab.dataset.view);
});

/** Foydalanuvchi parolini tiklash — vaqtinchalik parol beriladi */
async function resetPassword(userId, userName) {
  if (!confirm(`${userName} uchun yangi vaqtinchalik parol yaratilsinmi?\n\nEski parol ishlamay qoladi va barcha sessiyalari yopiladi.`)) return;

  try {
    const result = await api(`/api/admin/users/${userId}/reset-password`, { method: 'POST' });
    // Parol faqat shu yerda bir marta ko'rsatiladi
    window.prompt(result.message, result.temporaryPassword);
    toast('Vaqtinchalik parol yaratildi', 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ── Ishga tushirish ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  if (!admin.token) return;
  try {
    const me = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${admin.token}` } });
    if (me.ok) admin.user = (await me.json()).user;
    await api('/api/admin/stats');   // admin huquqini tasdiqlash
    startPanel();
  } catch {
    adminLogout();
  }
});
