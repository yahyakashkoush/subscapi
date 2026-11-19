// SubscAPI Application State
let appState = {
  currency: 'USD',
  egpRate: 54,
  packages: [],
  adminToken: sessionStorage.getItem('subsc_admin_token') || null,
  activeTab: 'packages-section',
  selectedPkg: null
};

// DOM Elements
const el = {
  // Tabs
  navLinks: document.querySelectorAll('.nav-link'),
  tabPanes: document.querySelectorAll('.tab-pane'),
  // Currency buttons
  currUsdBtn: document.getElementById('curr-usd-btn'),
  currEgpBtn: document.getElementById('curr-egp-btn'),
  // Packages container
  packagesContainer: document.getElementById('packages-container'),
  // Checker
  checkKeyInput: document.getElementById('check-key-input'),
  btnRunCheck: document.getElementById('btn-run-check'),
  checkerResultBox: document.getElementById('checker-result-box'),
  // Guide tabs
  guideNavBtns: document.querySelectorAll('.guide-nav-btn'),
  guidePanes: document.querySelectorAll('.guide-pane'),
  // Modal elements
  checkoutModal: document.getElementById('checkout-modal'),
  modalCloseBtn: document.getElementById('modal-close-btn'),
  modalPkgName: document.getElementById('modal-pkg-name'),
  modalBalText: document.getElementById('modal-bal-text'),
  modalPriceText: document.getElementById('modal-price-text'),
  orderForm: document.getElementById('order-form'),
  orderName: document.getElementById('order-name'),
  orderContact: document.getElementById('order-contact'),
  modalFormStep: document.getElementById('modal-form-step'),
  modalSuccessStep: document.getElementById('modal-success-step'),
  issuedApiKey: document.getElementById('issued-api-key'),
  issuedBaseUrl: document.getElementById('issued-base-url'),
  btnCopyIssuedKey: document.getElementById('btn-copy-issued-key'),
  btnCopyIssuedUrl: document.getElementById('btn-copy-issued-url'),
  modalDoneBtn: document.getElementById('modal-done-btn'),
  // Admin elements
  adminLoginGate: document.getElementById('admin-login-gate'),
  adminDashboardView: document.getElementById('admin-dashboard-view'),
  adminPassInput: document.getElementById('admin-pass-input'),
  btnAdminLogin: document.getElementById('btn-admin-login'),
  btnAdminLogout: document.getElementById('btn-admin-logout'),
  addInventoryForm: document.getElementById('add-inventory-form'),
  invTierSelect: document.getElementById('inv-tier-select'),
  invBalanceInput: document.getElementById('inv-balance-input'),
  invLabelInput: document.getElementById('inv-label-input'),
  invKeysTextarea: document.getElementById('inv-keys-textarea'),
  invBaseUrlInput: document.getElementById('inv-baseurl-input'),
  btnRefreshInv: document.getElementById('btn-refresh-inv'),
  inventoryTableBody: document.getElementById('inventory-table-body'),
  clientsTableBody: document.getElementById('clients-table-body'),
  invTotalBadge: document.getElementById('inv-total-badge'),
  clientsTotalBadge: document.getElementById('clients-total-badge'),
  // Admin stats
  adminStatStockVal: document.getElementById('admin-stat-stock-val'),
  adminStatStockCount: document.getElementById('admin-stat-stock-count'),
  adminStat100: document.getElementById('admin-stat-100'),
  adminStat200: document.getElementById('admin-stat-200'),
  adminStat500: document.getElementById('admin-stat-500'),
  toastContainer: document.getElementById('toast-container')
};

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  initLucide();
  updateBaseUrlDisplay();
  setupEventListeners();
  loadPackages();

  // If already logged in as admin, show dashboard
  if (appState.adminToken) {
    showAdminDashboard();
  }
});

function initLucide() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function updateBaseUrlDisplay() {
  const currentHostV1 = `${window.location.protocol}//${window.location.host}/v1`;
  document.querySelectorAll('.current-host-v1').forEach(el => {
    el.textContent = currentHostV1;
  });
}

// Event Listeners
function setupEventListeners() {
  // Navigation Tabs Switching
  el.navLinks.forEach(link => {
    link.addEventListener('click', () => {
      const targetId = link.getAttribute('data-tab');
      switchTab(targetId);
    });
  });

  // Currency Toggle
  el.currUsdBtn.addEventListener('click', () => setCurrency('USD'));
  el.currEgpBtn.addEventListener('click', () => setCurrency('EGP'));

  // Guide Sub-Tabs Switching
  el.guideNavBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      el.guideNavBtns.forEach(b => b.classList.remove('active'));
      el.guidePanes.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const target = btn.getAttribute('data-guide');
      const pane = document.getElementById(`guide-${target}`);
      if (pane) pane.classList.add('active');
      initLucide();
    });
  });

  // Copy Code Buttons in Guide
  document.querySelectorAll('.copy-code-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      const targetEl = document.getElementById(targetId);
      if (targetEl) {
        navigator.clipboard.writeText(targetEl.innerText);
        showToast('تم نسخ الكود بنجاح!', 'success');
      }
    });
  });

  // Balance Check Button
  el.btnRunCheck.addEventListener('click', runBalanceCheck);
  el.checkKeyInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') runBalanceCheck();
  });

  // Modal Close
  el.modalCloseBtn.addEventListener('click', closeModal);
  el.checkoutModal.addEventListener('click', (e) => {
    if (e.target === el.checkoutModal) closeModal();
  });
  el.modalDoneBtn.addEventListener('click', closeModal);

  // Copy buttons in modal
  el.btnCopyIssuedKey.addEventListener('click', () => {
    navigator.clipboard.writeText(el.issuedApiKey.textContent);
    showToast('تم نسخ مفتاح الـ API بنجاح!', 'success');
  });
  el.btnCopyIssuedUrl.addEventListener('click', () => {
    navigator.clipboard.writeText(el.issuedBaseUrl.textContent);
    showToast('تم نسخ رابط الـ API بنجاح!', 'success');
  });

  // Confirm Order Form
  el.orderForm.addEventListener('submit', handleOrderSubmit);

  // Admin Tier Select Change
  el.invTierSelect.addEventListener('change', (e) => {
    const val = e.target.value;
    if (val !== 'custom') {
      el.invBalanceInput.value = val;
    }
  });

  // Admin Login Form
  el.btnAdminLogin.addEventListener('click', handleAdminLogin);
  el.adminPassInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleAdminLogin();
  });
  el.btnAdminLogout.addEventListener('click', handleAdminLogout);

  // Add Inventory Form
  el.addInventoryForm.addEventListener('submit', handleAddInventory);

  // Refresh Inventory Button
  el.btnRefreshInv.addEventListener('click', () => {
    loadAdminStats();
    loadAdminInventory();
    loadAdminClients();
    showToast('تم تحديث بيانات المخزن', 'info');
  });
}

// Navigation Tabs
function switchTab(tabId) {
  el.navLinks.forEach(l => l.classList.remove('active'));
  el.tabPanes.forEach(p => p.classList.remove('active'));

  const targetLink = document.querySelector(`.nav-link[data-tab="${tabId}"]`);
  const targetPane = document.getElementById(tabId);

  if (targetLink) targetLink.classList.add('active');
  if (targetPane) targetPane.classList.add('active');

  appState.activeTab = tabId;

  // Refresh data if opening admin tab
  if (tabId === 'admin-section' && appState.adminToken) {
    loadAdminStats();
    loadAdminInventory();
    loadAdminClients();
  }

  initLucide();
}

// Currency Toggle
function setCurrency(curr) {
  appState.currency = curr;
  if (curr === 'USD') {
    el.currUsdBtn.classList.add('active');
    el.currEgpBtn.classList.remove('active');
  } else {
    el.currEgpBtn.classList.add('active');
    el.currUsdBtn.classList.remove('active');
  }
  renderPackages();
}

function formatPrice(pkg) {
  if (appState.currency === 'EGP') {
    const egp = Math.round(pkg.tier * appState.egpRate);
    return { val: egp.toLocaleString(), symbol: 'ج.م' };
  }
  return { val: pkg.tier.toLocaleString(), symbol: 'USD ($)' };
}

// Load Packages
async function loadPackages() {
  try {
    const res = await fetch('/api/packages');
    const data = await res.json();
    if (data.success) {
      appState.packages = data.packages;
      appState.egpRate = data.egpRate || 54;
      renderPackages();
    }
  } catch (err) {
    console.error('Failed to load packages:', err);
  }
}

// Render Packages Cards
function renderPackages() {
  el.packagesContainer.innerHTML = '';

  appState.packages.forEach(pkg => {
    const priceInfo = formatPrice(pkg);
    const inStock = pkg.availableStock > 0;

    const card = document.createElement('div');
    card.className = `package-card ${pkg.popular ? 'popular' : ''}`;

    let popularBadgeHtml = pkg.popular ? `<div class="popular-badge">${pkg.badge || 'الأكثر طلباً 🔥'}</div>` : '';
    let stockHtml = inStock 
      ? `<div class="pkg-stock-badge stock-in"><i data-lucide="check-circle-2"></i> متوفر في المخزن (${pkg.availableStock} متاح)</div>`
      : `<div class="pkg-stock-badge stock-out"><i data-lucide="alert-circle"></i> يتم التجهيز فوراً عند الطلب</div>`;

    let featuresHtml = pkg.features.map(f => `
      <li class="pkg-feature-item">
        <i data-lucide="check"></i>
        <span>${escapeHtml(f)}</span>
      </li>
    `).join('');

    card.innerHTML = `
      ${popularBadgeHtml}
      <div class="pkg-header">
        <h3 class="pkg-name">${escapeHtml(pkg.name)}</h3>
        <p class="pkg-desc">${escapeHtml(pkg.description)}</p>
      </div>

      <div class="pkg-price-box">
        <span class="pkg-price">${priceInfo.val}</span>
        <span class="pkg-currency">${priceInfo.symbol}</span>
      </div>

      ${stockHtml}

      <ul class="pkg-features">
        ${featuresHtml}
      </ul>

      <button class="btn ${pkg.popular ? 'btn-primary' : 'btn-secondary'} btn-block order-btn" data-id="${pkg.id}">
        <i data-lucide="zap"></i>
        <span>تفعيل واستلام المفتاح فوراً</span>
      </button>
    `;

    card.querySelector('.order-btn').addEventListener('click', () => {
      openCheckoutModal(pkg);
    });

    el.packagesContainer.appendChild(card);
  });

  initLucide();
}

// Modal Checkout
function openCheckoutModal(pkg) {
  appState.selectedPkg = pkg;
  el.modalPkgName.textContent = `تفعيل ${pkg.name}`;
  el.modalBalText.textContent = `$${pkg.tier}.00 USD رصيد كامل`;
  el.modalPriceText.textContent = `$${pkg.tier} USD (${(pkg.tier * appState.egpRate).toLocaleString()} ج.م)`;

  el.modalFormStep.classList.remove('hidden');
  el.modalSuccessStep.classList.add('hidden');
  el.checkoutModal.classList.remove('hidden');

  initLucide();
  el.orderName.focus();
}

function closeModal() {
  el.checkoutModal.classList.add('hidden');
}

async function handleOrderSubmit(e) {
  e.preventDefault();
  if (!appState.selectedPkg) return;

  const name = el.orderName.value.trim();
  const contact = el.orderContact.value.trim();

  const btnConfirm = document.getElementById('btn-confirm-order');
  btnConfirm.disabled = true;
  btnConfirm.innerHTML = '<i data-lucide="loader" class="spin"></i> جاري توليد المفتاح...';
  initLucide();

  try {
    const res = await fetch('/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        packageId: appState.selectedPkg.id,
        customerName: name,
        customerContact: contact
      })
    });

    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || 'Failed to provision key');
    }

    // Show success step in modal
    el.issuedApiKey.textContent = data.keyData.clientKey;
    el.issuedBaseUrl.textContent = `${window.location.protocol}//${window.location.host}/v1`;

    el.modalFormStep.classList.add('hidden');
    el.modalSuccessStep.classList.remove('hidden');

    showToast(data.message || 'تم توليد المفتاح بنجاح! 🚀', 'success');
    loadPackages(); // refresh stock numbers

  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btnConfirm.disabled = false;
    btnConfirm.innerHTML = '<i data-lucide="sparkles"></i> <span>تأكيد واستلام مفتاح الـ API الآن</span>';
    initLucide();
  }
}

// Balance Checker
async function runBalanceCheck() {
  const key = el.checkKeyInput.value.trim();
  if (!key) {
    showToast('يرجى إدخال مفتاح الـ API أولاً', 'error');
    el.checkKeyInput.focus();
    return;
  }

  el.btnRunCheck.disabled = true;
  el.btnRunCheck.innerHTML = '<i data-lucide="loader" class="spin"></i> جاري الفحص...';
  initLucide();

  try {
    const res = await fetch('/api/client/check-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientKey: key })
    });

    const result = await fetchJson(res);
    if (!result.success) {
      throw new Error(result.error || 'المفتاح غير موجود أو غير صالح');
    }

    const d = result.data;
    document.getElementById('res-status').textContent = d.status === 'active' ? 'المفتاح نشط وجاهز للعمل' : `الحالة: ${d.status}`;
    document.getElementById('res-pkg-name').textContent = d.packageName;
    document.getElementById('res-customer').textContent = `العميل: ${d.customerName}`;

    document.getElementById('res-remaining').textContent = `$${d.remainingBalance.toFixed(2)}`;
    document.getElementById('res-remaining-percent').textContent = `${d.percentageRemaining}% من الحصة`;

    document.getElementById('res-initial').textContent = `$${d.initialBalance.toFixed(2)}`;
    document.getElementById('res-used').textContent = `$${d.usedBalance.toFixed(2)}`;
    document.getElementById('res-requests').textContent = `${d.totalRequests.toLocaleString()} طلب منفذ`;

    const percentUsed = Math.min(100, Math.max(0, 100 - d.percentageRemaining));
    document.getElementById('res-progress-fill').style.width = `${percentUsed}%`;
    document.getElementById('res-percent-label').textContent = `${percentUsed}% مستهلك`;

    el.checkerResultBox.classList.remove('hidden');
    showToast('تم فحص الرصيد بنجاح! ⚡', 'success');

  } catch (err) {
    el.checkerResultBox.classList.add('hidden');
    showToast(err.message, 'error');
  } finally {
    el.btnRunCheck.disabled = false;
    el.btnRunCheck.innerHTML = '<i data-lucide="search"></i> <span>فحص الرصيد الآن</span>';
    initLucide();
  }
}

// -----------------------------------------------------------------
// ADMIN PANEL LOGIC
// -----------------------------------------------------------------

async function handleAdminLogin() {
  const pass = el.adminPassInput.value.trim();
  if (!pass) return;

  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pass })
    });
    const data = await res.json();
    if (data.success) {
      appState.adminToken = data.token;
      sessionStorage.setItem('subsc_admin_token', data.token);
      showAdminDashboard();
      showToast('تم تسجيل الدخول بنجاح كمسؤول', 'success');
    } else {
      showToast(data.error || 'كلمة المرور غير صحيحة', 'error');
    }
  } catch (err) {
    showToast('فشل تسجيل الدخول', 'error');
  }
}

function handleAdminLogout() {
  appState.adminToken = null;
  sessionStorage.removeItem('subsc_admin_token');
  el.adminLoginGate.classList.remove('hidden');
  el.adminDashboardView.classList.add('hidden');
  showToast('تم تسجيل الخروج', 'info');
}

function showAdminDashboard() {
  el.adminLoginGate.classList.add('hidden');
  el.adminDashboardView.classList.remove('hidden');
  loadAdminStats();
  loadAdminInventory();
  loadAdminClients();
  initLucide();
}

async function loadAdminStats() {
  if (!appState.adminToken) return;
  try {
    const res = await fetch('/api/admin/stats', {
      headers: { 'x-admin-token': appState.adminToken }
    });
    const data = await res.json();
    if (data.success) {
      const s = data.stats;
      el.adminStatStockVal.textContent = `$${s.totalStockValue.toLocaleString()}`;
      el.adminStatStockCount.textContent = `${s.availableKeysCount} مفتاح متاح للبيع`;
      el.adminStat100.textContent = s.tierCounts[100] || 0;
      el.adminStat200.textContent = s.tierCounts[200] || 0;
      el.adminStat500.textContent = s.tierCounts[500] || 0;
    }
  } catch (err) {
    console.error('Stats error:', err);
  }
}

async function loadAdminInventory() {
  if (!appState.adminToken) return;
  try {
    const res = await fetch('/api/admin/inventory', {
      headers: { 'x-admin-token': appState.adminToken }
    });
    const data = await res.json();
    if (data.success) {
      renderInventoryTable(data.inventory);
    }
  } catch (err) {
    console.error('Inventory error:', err);
  }
}

function renderInventoryTable(items) {
  el.invTotalBadge.textContent = `${items.length} مفاتيح`;
  el.inventoryTableBody.innerHTML = '';

  if (items.length === 0) {
    el.inventoryTableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 24px; color: var(--text-dim);">المخزن فارغ. يمكنك إضافة مفاتيح جديدة من النموذج أعلاه.</td></tr>`;
    return;
  }

  items.forEach(item => {
    const tr = document.createElement('tr');
    const masked = item.upstreamKey.length > 14 
      ? `${item.upstreamKey.substring(0, 8)}...${item.upstreamKey.substring(item.upstreamKey.length - 4)}` 
      : 'sk-***';

    let statusText = 'متاح';
    if (item.status === 'assigned') statusText = 'مخصص لعميل';
    if (item.status === 'depleted') statusText = 'مستنفد';

    tr.innerHTML = `
      <td><span class="masked-key">${escapeHtml(masked)}</span></td>
      <td><strong class="text-cyan">$${item.tier}</strong></td>
      <td><strong class="text-emerald">$${Number(item.currentBalance).toFixed(2)}</strong></td>
      <td><span class="badge-status ${item.status}">${statusText}</span></td>
      <td><span style="font-size: 0.78rem; color: var(--text-dim);">${escapeHtml(item.baseUrl || 'xingchiapi')}</span></td>
      <td>${escapeHtml(item.assignedTo || '—')}</td>
      <td>
        <div style="display: flex; gap: 6px;">
          <button class="btn-icon-action sync-inv-btn" data-id="${item.id}" title="فحص وتحديث الرصيد الحي من المصدر">
            <i data-lucide="refresh-cw"></i>
          </button>
          <button class="btn-icon-action del-inv-btn" data-id="${item.id}" title="حذف من المخزن" style="color: var(--accent-rose);">
            <i data-lucide="trash-2"></i>
          </button>
        </div>
      </td>
    `;

    // Sync button
    tr.querySelector('.sync-inv-btn').addEventListener('click', () => syncInventoryKey(item.id));
    // Delete button
    tr.querySelector('.del-inv-btn').addEventListener('click', () => deleteInventoryKey(item.id));

    el.inventoryTableBody.appendChild(tr);
  });

  initLucide();
}

async function syncInventoryKey(id) {
  showToast('جاري التحقق من الرصيد الحي للمفتاح...', 'info');
  try {
    const res = await fetch(`/api/admin/inventory/sync/${id}`, {
      method: 'POST',
      headers: { 'x-admin-token': appState.adminToken }
    });
    const data = await res.json();
    if (data.success) {
      showToast(`تم تحديث الرصيد الحي بنجاح: $${Number(data.currentBalance).toFixed(4)}`, 'success');
      loadAdminInventory();
      loadAdminStats();
    } else {
      showToast(data.error || 'فشل التحديث الحي', 'error');
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteInventoryKey(id) {
  if (!confirm('هل أنت متأكد من حذف هذا المفتاح من المخزن؟')) return;
  try {
    const res = await fetch(`/api/admin/inventory/${id}`, {
      method: 'DELETE',
      headers: { 'x-admin-token': appState.adminToken }
    });
    const data = await res.json();
    if (data.success) {
      showToast('تم حذف المفتاح من المخزن', 'info');
      loadAdminInventory();
      loadAdminStats();
      loadPackages();
    }
  } catch (err) {
    showToast('فشل حذف المفتاح', 'error');
  }
}

async function handleAddInventory(e) {
  e.preventDefault();
  const keys = el.invKeysTextarea.value.trim();
  const tier = el.invTierSelect.value === 'custom' ? el.invBalanceInput.value : el.invTierSelect.value;
  const balance = el.invBalanceInput.value;
  const label = el.invLabelInput.value.trim();
  const baseUrl = el.invBaseUrlInput.value.trim();

  if (!keys) {
    showToast('يرجى لصق مفتاح واحد على الأقل', 'error');
    return;
  }

  try {
    const res = await fetch('/api/admin/inventory', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': appState.adminToken
      },
      body: JSON.stringify({
        upstreamKeys: keys,
        tier: Number(tier),
        balance: Number(balance),
        label: label,
        baseUrl: baseUrl
      })
    });

    const data = await res.json();
    if (data.success) {
      showToast(`تمت إضافة ${data.count} مفتاح إلى المخزن بنجاح! 📦`, 'success');
      el.invKeysTextarea.value = '';
      loadAdminInventory();
      loadAdminStats();
      loadPackages();
    } else {
      showToast(data.error || 'فشل إضافة المفاتيح', 'error');
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function loadAdminClients() {
  if (!appState.adminToken) return;
  try {
    const res = await fetch('/api/admin/clients', {
      headers: { 'x-admin-token': appState.adminToken }
    });
    const data = await res.json();
    if (data.success) {
      renderClientsTable(data.clients);
    }
  } catch (err) {
    console.error('Clients error:', err);
  }
}

function renderClientsTable(clients) {
  el.clientsTotalBadge.textContent = `${clients.length} عميل`;
  el.clientsTableBody.innerHTML = '';

  if (clients.length === 0) {
    el.clientsTableBody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding: 24px; color: var(--text-dim);">لم يتم توليد أي مفاتيح للعملاء بعد.</td></tr>`;
    return;
  }

  clients.forEach(c => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="masked-key">${escapeHtml(c.clientKey)}</span></td>
      <td><strong>${escapeHtml(c.customerName)}</strong></td>
      <td><span class="badge-status active">باقة $${c.tier}</span></td>
      <td><strong class="text-emerald">$${Number(c.remainingBalance).toFixed(2)}</strong> / $${c.initialBalance}</td>
      <td>${c.totalRequests || 0}</td>
      <td><span class="badge-status ${c.status}">${c.status === 'active' ? 'نشط' : 'معطل'}</span></td>
      <td style="font-size: 0.78rem; color: var(--text-dim);">${new Date(c.createdAt).toLocaleDateString('ar-EG')}</td>
      <td>
        <button class="pill-btn ${c.status === 'active' ? 'pill-danger' : 'pill-primary'} toggle-client-btn" data-id="${c.id}">
          ${c.status === 'active' ? 'تعطيل' : 'تنشيط'}
        </button>
      </td>
    `;

    tr.querySelector('.toggle-client-btn').addEventListener('click', () => toggleClientStatus(c.id));
    el.clientsTableBody.appendChild(tr);
  });

  initLucide();
}

async function toggleClientStatus(id) {
  try {
    const res = await fetch(`/api/admin/clients/toggle/${id}`, {
      method: 'POST',
      headers: { 'x-admin-token': appState.adminToken }
    });
    const data = await res.json();
    if (data.success) {
      showToast(`تم تغيير حالة العميل إلى: ${data.newStatus}`, 'info');
      loadAdminClients();
    }
  } catch (err) {
    showToast('فشل تعديل الحالة', 'error');
  }
}

// Helpers
async function fetchJson(res) {
  try {
    return await res.json();
  } catch (e) {
    throw new Error('فشل قراءة الاستجابة من السيرفر');
  }
}

function showToast(msg, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  let iconName = 'info';
  if (type === 'success') iconName = 'check-circle-2';
  if (type === 'error') iconName = 'alert-triangle';

  toast.innerHTML = `
    <i data-lucide="${iconName}"></i>
    <span>${escapeHtml(msg)}</span>
  `;

  el.toastContainer.appendChild(toast);
  initLucide();

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(12px)';
    setTimeout(() => toast.remove(), 250);
  }, 3500);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
