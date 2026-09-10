const navItems = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'recharge', label: 'Recharge' },
  { id: 'packages', label: 'Package Activation', children: [{ id: 'basic-package', label: 'Basic Package' }] },
  { id: 'downline', label: 'Downline', children: [{ id: 'direct-team', label: 'Direct Team' }, { id: 'total-team', label: 'Total Team' }] },
  { id: 'income', label: 'Income', children: [{ id: 'basic-roi', label: 'Basic ROI Income' }, { id: 'basic-referral', label: 'Basic Referral Income' }, { id: 'basic-level', label: 'Basic Level Income' }] },
  { id: 'transactional', label: 'Transactional', children: [{ id: 'transfer-fund', label: 'P2P Transfer' }, { id: 'swap', label: 'Income to Fund' }, { id: 'withdrawal', label: 'Withdrawal' }] },
  { id: 'reports', label: 'Reports', children: [{ id: 'daily-report', label: 'Daily Income Report' }, { id: 'monthly-report', label: 'Monthly Income Report' }, { id: 'fund-summary', label: 'Fund Wallet Summary' }, { id: 'income-summary', label: 'Income Wallet Summary' }] },
  { id: 'support', label: 'Support Ticket' },
  { id: 'logout', label: 'Logout' },
];

const publicPages = new Set(['login', 'register']);
function defaultAppState() { return { availableBalance: 0, availableFund: 0, incomeBalance: 0, totalIncome: 0, totalWithdrawal: 0, activations: 0, directTeamCount: 0, totalTeamCount: 0, team: [], payments: [], transfers: [], swaps: [], withdrawals: [], tickets: [], ledger: [] }; }
function storedUser() { return app.user; }
function currentSession() { return app.session; }
function clearSession() { app.user = null; app.session = null; app.csrfToken = ''; app.state = defaultAppState(); }
function getAppState() { return app.state; }
function amountValue(value) { const amount = Number(String(value).replace(/,/g, '')); return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0; }
function displayMoney(value) { return amountValue(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }
function fieldValue(id) { return document.getElementById(id)?.value.trim() || ''; }
function authError(message) { showToast(message); document.querySelector('.auth-card')?.classList.add('auth-error'); setTimeout(() => document.querySelector('.auth-card')?.classList.remove('auth-error'), 450); }
const app = { active: location.hash.slice(1) || 'login', openGroups: new Set(['packages', 'downline', 'income', 'transactional', 'reports']), user: null, session: null, csrfToken: '', state: defaultAppState(), packagePlans: [], paymentSettings: null };
const content = document.getElementById('content');
const navList = document.getElementById('nav-list');
const toastEl = document.getElementById('toast');

function apiUrl(path) { const configured = String(window.__INFOTECH_API_URL__ || '').replace(/\/$/, ''); const local = (location.protocol === 'file:' || ['localhost', '127.0.0.1'].includes(location.hostname)) && location.port !== '8787' ? 'http://localhost:8787' : ''; return `${configured || local}${path}`; }
async function api(path, options = {}) {
  const headers = { ...(options.body ? { 'content-type': 'application/json' } : {}), ...options.headers };
  if (app.csrfToken && options.method && options.method !== 'GET') headers['x-csrf-token'] = app.csrfToken;
  const response = await fetch(apiUrl(path), { credentials: 'include', ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) { if (response.status === 401) clearSession(); throw new Error(payload.error || 'The request could not be completed.'); }
  return payload;
}

async function hydrateCustomerData() {
  if (!app.user) return;
  const [dashboard, recharges, withdrawals, ledger, transfers, swaps, tickets, team, plans, paymentSettings] = await Promise.all([
    api('/api/me/dashboard'), api('/api/me/recharges'), api('/api/me/withdrawals'), api('/api/me/ledger'), api('/api/me/transfers'), api('/api/me/swaps'), api('/api/me/tickets'), api('/api/me/team'),
    api('/api/me/packages?kind=BASIC'), api('/api/payment-settings'),
  ]);
  const fund = dashboard.balances.find(item => item.type === 'FUND'); const income = dashboard.balances.find(item => item.type === 'INCOME');
  app.state = { ...defaultAppState(), availableBalance: Number(fund?.available_minor || 0) / 100, availableFund: Number(fund?.available_minor || 0) / 100, incomeBalance: Number(income?.available_minor || 0) / 100, totalIncome: Number(dashboard.income || 0) / 100, totalWithdrawal: withdrawals.data.reduce((sum, item) => sum + Number(item.amount_minor || 0) / 100, 0), activations: Number(dashboard.activations || 0), directTeamCount: team.directCount, totalTeamCount: team.totalCount, team: team.data, payments: recharges.data.map(item => ({ paymentId: item.payment_reference, date: new Date(item.submitted_at).toLocaleDateString('en-GB'), method: item.payment_method, amount: Number(item.amount_minor) / 100, status: item.status })), transfers: transfers.data.map(item => ({ date: new Date(item.created_at).toLocaleDateString('en-GB'), target: item.recipient_user_id === app.user.userId ? item.sender_user_id : item.recipient_user_id, amount: Number(item.amount_minor) / 100, status: item.status })), swaps: swaps.data.map(item => ({ date: new Date(item.created_at).toLocaleDateString('en-GB'), amount: Number(item.amount_minor) / 100, status: item.status })), withdrawals: withdrawals.data.map(item => ({ date: new Date(item.submitted_at).toLocaleDateString('en-GB'), amount: Number(item.amount_minor) / 100, charges: Number(item.charges_minor) / 100, payable: Number(item.payable_minor) / 100, status: item.status })), tickets: tickets.data.map(item => ({ date: new Date(item.created_at).toLocaleDateString('en-GB'), subject: item.subject, message: '', status: item.status })), ledger: [...ledger.fund, ...ledger.income].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).map(item => ({ date: new Date(item.created_at).toLocaleDateString('en-GB'), amount: Number(item.amount_minor) / 100, description: item.description })) };
  app.packagePlans = plans.data;
  app.paymentSettings = paymentSettings.settings;
}

const money = (n) => `₹ ${n}`;
const sectionTitle = (_icon, title, extra = '') => `<div class="section-title ${extra}"><h2>${title}</h2></div>`;
const pageHead = (title, crumb = title, subtitle = '') => `<div class="page-head"><div class="title-wrap"><h1>${title}</h1>${subtitle ? `<p>${subtitle}</p>` : ''}</div><div class="breadcrumb">${crumb.includes('/') ? crumb.replace('/', ' / ') : crumb}</div></div>`;
const stat = (label, value, tone = '') => `<div class="stat-card"><div class="stat-label">${label}</div><div class="stat-value ${tone}">${value}</div></div>`;
const emptyMetric = 'No data yet';

function renderNav() {
  navList.innerHTML = navItems.map(item => {
    const isOpen = app.openGroups.has(item.id);
    const active = app.active === item.id || item.children?.some(c => c.id === app.active);
    const button = `<button class="nav-item ${active ? 'active' : ''} ${isOpen ? 'open' : ''}" data-nav="${item.id}"><span class="nav-label">${item.label}</span>${item.children ? '<span class="nav-arrow">⌄</span>' : ''}</button>`;
    const children = item.children ? `<div class="subnav">${item.children.map(child => `<button class="${app.active === child.id ? 'active' : ''}" data-nav="${child.id}">${child.label}</button>`).join('')}</div>` : '';
    return `<div class="nav-group ${isOpen ? 'expanded' : ''}">${button}${children}</div>`;
  }).join('');
  navList.querySelectorAll('[data-nav]').forEach(button => button.addEventListener('click', () => {
    const id = button.dataset.nav;
    const item = navItems.find(x => x.id === id);
    if (item?.children) {
      if (app.openGroups.has(id)) app.openGroups.delete(id); else app.openGroups.add(id);
      renderNav();
      return;
    }
    if (id === 'logout') { void api('/api/auth/logout', { method: 'POST' }).catch(() => {}); clearSession(); app.active = 'login'; location.hash = 'login'; renderNav(); renderPage(); return; }
    toastEl.classList.remove('show');
    app.active = id; location.hash = id; renderNav(); renderPage(); document.querySelector('.sidebar').classList.remove('open');
  }));
}

function renderPage() {
  if (!publicPages.has(app.active) && !currentSession()) {
    app.active = 'login';
    if (location.hash !== '#login') location.hash = 'login';
  }
  const page = pages[app.active] || pages.dashboard;
  if (publicPages.has(app.active)) toastEl.classList.remove('show');
  document.body.classList.toggle('auth-mode', app.active === 'login' || app.active === 'register');
  content.innerHTML = page();
  const accountName = document.getElementById('account-name');
  if (accountName) accountName.textContent = storedUser()?.fullName || 'Account';
  bindPageEvents();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function dashboardPage() {
  const state = getAppState();
  const user = storedUser() || {};
  return `${pageHead('Dashboard')}<div class="dashboard-top">
    <div class="panel profile-card"><div class="profile-emblem">⌂</div><h2>${escapeHtml(user.fullName || 'Member')}</h2><div class="profile-meta"><div class="meta-block"><div class="meta-label">User ID</div><div class="meta-value">${escapeHtml(user.userId || 'Not assigned')}</div></div><div class="meta-block"><div class="meta-label">Status</div><div class="meta-value value-green">Active</div></div><div class="meta-block"><div class="meta-label">Join Date</div><div class="meta-value">${escapeHtml(user.createdAt ? new Date(user.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')}</div></div></div><div class="profile-direct">Direct business : <strong>${emptyMetric}</strong></div><div class="profile-empty">Referral tools will appear here when your account is connected.</div></div>
    <div class="summary-column"><div class="grid grid-2">${stat('Basic Package', `${state.activations} active`)}${stat('Income Balance', money(displayMoney(state.incomeBalance)), 'value-green')}</div>${sectionTitle('', 'Balance Summary')}<div class="grid grid-2">${stat('Available Fund', money(displayMoney(state.availableFund)), 'value-green')}${stat('Available Balance', money(displayMoney(state.availableBalance)), 'value-cyan')}${stat('Total Income', money(displayMoney(state.totalIncome)), 'value-green')}${stat('Total Withdrawal', money(displayMoney(state.totalWithdrawal)), 'value-red')}</div></div>
  </div>${sectionTitle('', 'Team Summary', 'cyan')}<div class="grid grid-2 dashboard-grid" style="max-width:690px">${stat('Direct Team', String(state.directTeamCount))}${stat('Total Team', String(state.totalTeamCount))}</div>${sectionTitle('', 'Basic Income Breakdown')}<div class="grid grid-4">${stat('Joining Bonus', emptyMetric)}${stat('Referral Income', emptyMetric)}${stat('Today ROI Income', emptyMetric)}${stat('Today Level Income', emptyMetric)}${stat('Total ROI Income', emptyMetric)}${stat('Total Level Income', emptyMetric)}</div>`;
}

function rechargePage() {
  return `${pageHead('Recharge', 'Package / Recharge')}<div class="panel qr-card"><h2>Scan QR to Pay</h2><div class="notice">Scan the configured payment QR with your preferred payment app, enter the amount below, then submit your UTR or payment reference for admin verification.</div><div class="gateway-label">Payment QR <span>Manual verification</span></div><div class="qr" id="qr" aria-label="Configured payment QR code"></div><div class="recharge-input"><label class="auth-label" for="recharge-amount">Recharge amount</label><input id="recharge-amount" class="input" type="number" min="1" step="0.01" placeholder="Enter amount" /></div><div class="recharge-input"><label class="auth-label" for="payment-reference">UTR / payment reference</label><input id="payment-reference" class="input" maxlength="160" placeholder="Enter payment reference" /></div><div class="center"><button class="primary-button" data-action="confirm-payment">Submit Recharge Request</button></div><div class="notice" style="margin:9px 0 0">Your request stays pending until the platform owner verifies the payment.</div></div><div class="section-gap"></div>${tablePanel('Payment History', ['SR', 'DATE', 'PAYMENT ID', 'METHOD', 'AMOUNT', 'STATUS'])}`;
}

function authBrand() { return `<div class="auth-brand"><div class="brand-mark">⌂</div><div class="brand-text"><span>INFOTECH</span></div></div>`; }
function authInput(icon, label, placeholder, type = 'text', id = '') {
  const control = id === 'register-country'
    ? `<select class="input" id="${id}"><option value="">${placeholder}</option><option>India</option><option>United Arab Emirates</option><option>United States</option><option>United Kingdom</option><option>Singapore</option></select>`
    : `<input class="input" id="${id}" type="${type}" placeholder="${placeholder}" />`;
  return `<label class="auth-field"><span class="auth-label">${label}</span><span class="input-group"><span class="input-icon">${icon}</span>${control}</span></label>`;
}
function loginPage() {
  return `<div class="auth-page"><div class="auth-card login-card">${authBrand()}<h1>Welcome <span>Back!</span></h1><p class="auth-subtitle">Please sign in to your account to continue.</p><form class="auth-form"><div class="auth-field"><label class="auth-label" for="login-user">User ID</label><span class="input-group"><span class="input-icon">♙</span><input id="login-user" class="input" placeholder="User ID" autocomplete="username" /></span></div><div class="auth-field"><label class="auth-label" for="login-password">Password</label><span class="input-group"><span class="input-icon">♧</span><input id="login-password" class="input" type="password" placeholder="Password" autocomplete="current-password" /><button type="button" class="password-toggle" data-toggle-password="login-password" aria-label="Show password">◉</button></span></div><div class="auth-options"><label class="remember"><input id="remember-me" type="checkbox" /> <span>Remember me</span></label></div><button class="primary-button auth-submit" type="button" data-action="sign-in">Sign In</button></form><p class="auth-switch">Don't have an account? <a href="#register">Create an Account</a></p></div></div>`;
}
function registerPage() {
  return `<div class="auth-page"><div class="auth-card register-card">${authBrand()}<h1>Create an <span>Account</span></h1><p class="auth-subtitle">Join us and experience Infotech.</p><form class="auth-form"><div class="auth-field"><label class="auth-label" for="register-referral">Referral ID</label><span class="input-group"><span class="input-icon">#</span><input id="register-referral" class="input" placeholder="Referral ID" /></span></div><div class="auth-grid">${authInput('▣', 'Full Name', 'Full Name', 'text', 'register-name')}${authInput('✉', 'Email Address', 'Email Address', 'email', 'register-email')}</div><div class="auth-grid">${authInput('◎', 'Country', '-- Select Country --', 'text', 'register-country')}${authInput('▯', 'Mobile (+ISD...)', 'Mobile Number', 'tel', 'register-mobile')}</div><div class="auth-field"><label class="auth-label" for="register-password">Password</label><span class="input-group"><span class="input-icon">♧</span><input id="register-password" class="input" type="password" placeholder="Password" autocomplete="new-password" /><button type="button" class="password-toggle" data-toggle-password="register-password" aria-label="Show password">◉</button></span></div><label class="terms"><input id="terms-check" type="checkbox" /> <span>I agree to the Terms and Conditions</span></label><button class="primary-button auth-submit" type="button" data-action="create-account">Create Account</button></form><p class="auth-switch">Already have an account? <a href="#login">Sign In</a></p></div></div>`;
}

const basicBookCovers = [
  { title: 'The Investor’s Mindset', subtitle: 'Build a disciplined path to long-term wealth', cover: '/assets/package-covers/investors-mindset.jpg' },
  { title: 'Rich Poor Difference', subtitle: 'Mindset creates reality', cover: '/assets/package-covers/rich-poor-difference.jpg' },
  { title: 'The Money Mindset', subtitle: 'Build wealth with intention', cover: '/assets/package-covers/money-mindset.jpg' },
  { title: 'Smart Investing', subtitle: 'Make informed decisions for lasting growth', cover: '/assets/package-covers/smart-investing.jpg' },
  { title: 'The Power of Discipline', subtitle: 'Focus is a daily decision', cover: '/assets/package-covers/power-of-discipline.jpg' },
  { title: 'Financial Freedom', subtitle: 'Make room for a bigger life', cover: '/assets/package-covers/financial-freedom.jpg' },
];

function packagePage() {
  const plans = app.packagePlans.filter(plan => plan.kind === 'BASIC'); const state = getAppState();
  const cards = plans.length ? plans.map((plan, index) => {
    const book = basicBookCovers[index];
    const displayTitle = book?.title || plan.name;
    const cover = book ? `<div class="package-cover"><img src="${book.cover}" alt="${escapeHtml(book.title)} book cover" loading="lazy" width="512" height="768" /><div class="package-cover-shade"></div><div class="package-cover-copy"><span>INFOTECH FINANCE SERIES</span><strong>${escapeHtml(book.title)}</strong><small>${escapeHtml(book.subtitle)}</small></div></div>` : '';
    const purchase = `<button class="purchase-button" data-plan-id="${plan.id}" data-package="${escapeHtml(displayTitle)}" data-amount="${Number(plan.amount_minor) / 100}" data-days="${plan.duration_days}" data-return="${Number(plan.total_return_minor) / 100}">Purchase</button>`;
    const details = `<div class="package-details"><div class="detail-row"><span>Amount :</span><span>${displayMoney(Number(plan.amount_minor) / 100)}</span></div><div class="detail-row"><span>Daily ROI :</span><span>${displayMoney(Number(plan.daily_roi_minor) / 100)}</span></div><div class="detail-row"><span>Days :</span><span>${plan.duration_days}</span></div><div class="detail-row"><span>Total Return :</span><span>${displayMoney(Number(plan.total_return_minor) / 100)}</span></div></div>`;
    return `<article class="package-card book-package-card">${cover}<div class="package-card-body"><div class="package-card-header"><div><span class="package-plan-label">Plan ${String(index + 1).padStart(2, '0')}</span><h3>${escapeHtml(displayTitle)}</h3></div><span class="package-tag">Basic</span></div>${details}${purchase}</div></article>`;
  }).join('') : '<div class="profile-empty">Package plans are not available yet.</div>';
  return `<div class="basic-package-view">${pageHead('E-Book Packages', 'Package / E-Book Plans', '')}<div class="package-header"><div class="available-fund">Available Fund Balance : <span>${displayMoney(state.availableBalance)}</span></div></div><div class="package-grid basic-package-grid">${cards}</div></div>`;
}

function rowsForTable(title, columns) {
  const state = getAppState();
  if (title === 'Payment History') return state.payments.map((item, index) => [index + 1, item.date, item.paymentId, item.method, `₹ ${displayMoney(item.amount)}`, item.status]);
  if (title === 'Withdrawal Request Details') return state.withdrawals.map((item, index) => [index + 1, item.date, `₹ ${displayMoney(item.amount)}`, `₹ ${displayMoney(item.charges)}`, `₹ ${displayMoney(item.payable)}`, item.status]);
  if (title === 'Transfer Income To Fund Details') return state.swaps.map((item, index) => [index + 1, item.date, `₹ ${displayMoney(item.amount)}`, item.status]);
  if (title === 'P2P Transfer History') return state.transfers.map((item, index) => [index + 1, item.date, item.target, `₹ ${displayMoney(item.amount)}`, item.status]);
  if (title === 'My Support Tickets') return state.tickets.map((item, index) => [index + 1, item.date, item.subject, item.message, item.status]);
  if (title.includes('Report') || title.includes('Summary')) return state.ledger.map((item, index) => [index + 1, item.date, item.description, `₹ ${displayMoney(item.amount)}`, item.type]);
  if (title.includes('Income')) return state.ledger.map((item, index) => columns.length === 3 ? [index + 1, item.date, `₹ ${displayMoney(item.amount)}`] : [index + 1, item.date, item.description, '1', `₹ ${displayMoney(item.amount)}`]);
  return [];
}

function tablePanel(title, columns, options = {}) {
  const filters = options.filters === false ? '' : `<div class="filters ${options.three ? 'three' : ''}">${columns.length > 3 && options.three ? '<input class="input" placeholder="dd-mm-yyyy" type="date" /><input class="input" placeholder="dd-mm-yyyy" type="date" /><input class="input" placeholder="Id" />' : '<input class="input" placeholder="dd-mm-yyyy" type="date" /><input class="input" placeholder="dd-mm-yyyy" type="date" />'}</div><div class="filter-actions"><button class="primary-button" data-action="search">Search</button><button class="secondary-button" data-action="reset">Reset</button><button class="success-button" data-action="refresh">Refresh</button></div>`;
  const rows = options.rows || rowsForTable(title, columns);
  const totalIndex = columns.findIndex(column => column === 'AMOUNT' || column === 'PAYABLE');
  const total = totalIndex >= 0 ? rows.reduce((sum, row) => sum + amountValue(row[totalIndex]), 0) : 0;
  const body = rows.length ? rows.map(row => `<tr>${row.map(cell => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('') : `<tr class="empty-row"><td colspan="${columns.length}"><div class="empty-state"><strong>No data available yet</strong><span>Records will appear here once they are added.</span></div></td></tr>`;
  return `<div class="panel table-panel"><div class="table-title"><h2>${title}</h2>${options.total ? `<span class="total-badge">Total : ${displayMoney(total)}</span>` : ''}</div>${filters}<div class="table-toolbar"><div class="entries"><select><option>25</option><option>50</option><option>100</option></select><span>entries per page</span></div><div class="export-buttons"><button data-action="copy-table">Copy</button><button data-action="print">Print</button></div></div><div class="table-wrap"><table><thead><tr>${columns.map(col => `<th>${col}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div><div class="table-foot"><span>${rows.length ? `Showing 1 to ${rows.length} of ${rows.length} entries` : 'No records to display'}</span></div></div>`;
}

function incomePage(kind) {
  const config = { 'basic-roi': ['Basic ROI Return', 'ROI Return', ['SR', 'DATE', 'AMOUNT']], 'basic-referral': ['Basic Referral Income', 'ROI Return', ['SR', 'DATE', 'FROM ID', 'LEVEL', 'AMOUNT']], 'basic-level': ['Basic Level Income', 'Level Income', ['SR', 'DATE', 'FROM ID', 'LEVEL', 'AMOUNT']] }[kind];
  return `${pageHead(config[0], `Income / ${config[0]}`)}${tablePanel(config[1], config[2], { total: true, three: config[2].length > 3 })}`;
}

function transferPage() {
  const state = getAppState();
  return `${pageHead('Transfer Fund', 'Transactional / P2P Transfer')}<div class="form-layout"><div><div class="form-panel"><h2>Transfer Fund</h2><div class="form-field"><label>Available Fund Balance</label><div class="input-prefix"><span class="prefix">₹</span><input class="input" value="${displayMoney(state.availableFund)}" readonly /></div></div><div class="form-field"><label>Target User ID <span>*</span></label><input id="transfer-target" class="input" placeholder="Enter User ID" /></div><div class="form-field"><label>Amount <span>*</span></label><input id="transfer-amount" class="input" type="number" min="1" step="0.01" placeholder="Enter Amount" /></div><div class="form-field"><label>T-Password <span>*</span></label><input id="transfer-password" class="input" type="password" autocomplete="current-password" placeholder="Enter T-Password" /></div><div class="form-actions"><button class="primary-button" data-action="transfer-submit">Submit</button><button class="secondary-button" data-action="reset-form">Reset</button></div></div></div></div>${tablePanel('P2P Transfer History', ['SR', 'DATE', 'TARGET USER', 'AMOUNT', 'STATUS'])}`;
}

function swapPage() {
  const state = getAppState();
  return `${pageHead('Swap', 'Transactional / Transfer to Fund')}<div class="form-layout"><div><div class="form-panel"><h2>Transfer To Fund</h2><div class="form-field"><label>Income Balance</label><input class="input" value="${displayMoney(state.incomeBalance)}" readonly /></div><div class="form-field"><label>Amount</label><input id="swap-amount" class="input" type="number" min="1" step="0.01" placeholder="Enter amount" /></div><div class="form-actions"><button class="primary-button" data-action="swap-submit">Submit</button><button class="secondary-button" data-action="reset-form">Reset</button></div></div></div></div><div style="margin-top:24px">${tablePanel('Transfer Income To Fund Details', ['SR', 'DATE', 'AMOUNT', 'STATUS'])}</div>`;
}

function withdrawalPage() {
  return `${pageHead('Fund Withdrawal', 'Transactional / Fund Withdrawal')}<div class="timing-card panel"><div class="timing-icon">↗</div><p>Withdrawal timing is 10:00 AM to 2:00 PM.</p></div><div class="form-panel" style="margin-bottom:24px"><h2>Request Withdrawal</h2><div class="form-field"><label>Available Fund Balance</label><input class="input" value="${displayMoney(getAppState().availableFund)}" readonly /></div><div class="form-field"><label>Amount <span>*</span></label><input id="withdraw-amount" class="input" type="number" min="1" step="0.01" placeholder="Enter amount" /></div><div class="form-field"><label>Payment Details <span>*</span></label><input id="withdraw-details" class="input" placeholder="UPI ID or bank reference" /></div><div class="form-actions"><button class="primary-button" data-action="withdraw-submit">Submit Request</button><button class="secondary-button" data-action="reset-form">Reset</button></div></div>${tablePanel('Withdrawal Request Details', ['SR', 'DATE', 'AMOUNT', 'CHARGES', 'PAYABLE', 'STATUS'])}`;
}

function reportPage(kind) {
  const names = { 'daily-report': 'Daily Income Report', 'monthly-report': 'Monthly Income Report', 'fund-summary': 'Fund Wallet Summary', 'income-summary': 'Income Wallet Summary' };
  return `${pageHead(names[kind], `Reports / ${names[kind]}`)}${tablePanel(names[kind], ['SR', 'DATE', 'DESCRIPTION', 'AMOUNT', 'STATUS'], { total: true, three: true })}`;
}

function supportPage() { return `${pageHead('Support Ticket', 'Support Ticket')}<div class="form-panel"><h2>Need help?</h2><div class="form-field"><label>Subject</label><input id="ticket-subject" class="input" placeholder="What can we help with?" /></div><div class="form-field"><label>Message</label><textarea id="ticket-message" class="input" rows="6" placeholder="Describe your question"></textarea></div><div class="form-actions"><button class="primary-button" data-action="create-ticket">Submit Ticket</button><button class="secondary-button" data-action="reset-form">Reset</button></div></div><div style="margin-top:24px">${tablePanel('My Support Tickets', ['SR', 'DATE', 'SUBJECT', 'MESSAGE', 'STATUS'], { filters: false })}</div>`; }
function teamPage(title) { const state = getAppState(); const direct = title === 'Direct Team'; const members = state.team.filter(item => direct ? item.level === 1 : true); const rows = members.map((item, index) => [index + 1, item.user_id, item.full_name, new Date(item.created_at).toLocaleDateString('en-GB'), item.status]); return `${pageHead(title, `Downline / ${title}`)}<div class="grid grid-2" style="max-width:720px">${stat('Direct Team', String(state.directTeamCount))}${stat('Total Team', String(state.totalTeamCount))}</div><div style="margin-top:24px">${tablePanel(title, ['SR', 'USER ID', 'NAME', 'JOIN DATE', 'STATUS'], { filters: false, rows })}</div>`; }
const pages = { login: loginPage, register: registerPage, dashboard: dashboardPage, recharge: rechargePage, 'basic-package': packagePage, 'direct-team': () => teamPage('Direct Team'), 'total-team': () => teamPage('Total Team'), 'transfer-fund': transferPage, swap: swapPage, withdrawal: withdrawalPage, support: supportPage, 'basic-roi': () => incomePage('basic-roi'), 'basic-referral': () => incomePage('basic-referral'), 'basic-level': () => incomePage('basic-level'), 'daily-report': () => reportPage('daily-report'), 'monthly-report': () => reportPage('monthly-report'), 'fund-summary': () => reportPage('fund-summary'), 'income-summary': () => reportPage('income-summary') };

function refreshApp() { renderNav(); renderPage(); }
function idempotencyKey() { return window.crypto?.randomUUID?.() || `request-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
async function submitRecharge() {
  const amount = amountValue(fieldValue('recharge-amount')); const paymentReference = fieldValue('payment-reference');
  if (amount <= 0 || !paymentReference) return authError('Enter the amount and payment reference.');
  try { await api('/api/me/recharges', { method: 'POST', body: JSON.stringify({ amount, paymentReference, idempotencyKey: idempotencyKey() }) }); await hydrateCustomerData(); refreshApp(); showToast('Recharge request submitted for admin verification.'); } catch (error) { authError(error.message); }
}
async function submitTransfer() {
  const target = fieldValue('transfer-target').toUpperCase(); const amount = amountValue(fieldValue('transfer-amount')); const password = fieldValue('transfer-password');
  if (!target || !amount || !password) return authError('Complete the transfer form.');
  try { await api('/api/me/transfers', { method: 'POST', body: JSON.stringify({ recipientUserId: target, amount, idempotencyKey: idempotencyKey() }) }); await hydrateCustomerData(); refreshApp(); showToast(`₹ ${displayMoney(amount)} transferred to ${target}.`); } catch (error) { authError(error.message); }
}
async function submitSwap() {
  const amount = amountValue(fieldValue('swap-amount')); if (!amount) return authError('Enter an amount to swap.');
  try { await api('/api/me/swaps', { method: 'POST', body: JSON.stringify({ amount, idempotencyKey: idempotencyKey() }) }); await hydrateCustomerData(); refreshApp(); showToast(`₹ ${displayMoney(amount)} moved to fund balance.`); } catch (error) { authError(error.message); }
}
async function submitWithdrawal() {
  const amount = amountValue(fieldValue('withdraw-amount')); const details = fieldValue('withdraw-details'); if (!amount || !details) return authError('Enter an amount and payment details.');
  try { await api('/api/me/withdrawals', { method: 'POST', body: JSON.stringify({ amount, paymentDetails: details, idempotencyKey: idempotencyKey() }) }); await hydrateCustomerData(); refreshApp(); showToast('Withdrawal request submitted for admin review.'); } catch (error) { authError(error.message); }
}
async function createTicket() {
  const subject = fieldValue('ticket-subject'); const message = fieldValue('ticket-message'); if (!subject || !message) return authError('Add a subject and message before submitting.');
  try { await api('/api/me/tickets', { method: 'POST', body: JSON.stringify({ subject, message }) }); await hydrateCustomerData(); refreshApp(); showToast('Support ticket created.'); } catch (error) { authError(error.message); }
}

function copyText(value) {
  if (!value) return;
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(value).then(() => showToast('Copied to clipboard')).catch(() => showToast('Copy is unavailable in this browser'));
    return;
  }
  showToast('Copy is unavailable in this browser');
}

function resetPanel(button) {
  const panel = button.closest('.form-panel, .table-panel');
  panel?.querySelectorAll('input:not([readonly]), textarea, select').forEach(control => {
    if (control.tagName === 'SELECT') control.selectedIndex = 0;
    else control.value = '';
  });
  showToast('Form reset');
}

function copyTable(button) {
  const table = button.closest('.table-panel')?.querySelector('table');
  if (!table) return;
  const text = [...table.rows].map(row => [...row.cells].map(cell => cell.textContent.trim()).join('\t')).join('\n');
  copyText(text);
}

function bindPageEvents() {
  document.querySelectorAll('[data-copy]').forEach(button => button.addEventListener('click', () => copyText(button.dataset.copy)));
  document.querySelectorAll('[data-toggle-password]').forEach(button => button.addEventListener('click', () => { const input = document.getElementById(button.dataset.togglePassword); input.type = input.type === 'password' ? 'text' : 'password'; }));
  const qr = document.getElementById('qr'); if (qr && app.paymentSettings?.qr_payload) { const image = document.createElement('img'); image.src = app.paymentSettings.qr_payload; image.alt = 'Configured payment QR'; image.loading = 'lazy'; qr.appendChild(image); } else if (qr) qr.innerHTML = '<span>Payment QR is not configured yet.</span>';
  document.querySelectorAll('.purchase-button').forEach(button => button.addEventListener('click', () => openPurchase(button.dataset)));
  document.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', async event => {
    event.preventDefault();
    const action = button.dataset.action;
    if (action === 'search') showToast('Search applied');
    if (action === 'reset' || action === 'reset-form') return resetPanel(button);
    if (action === 'refresh') showToast('Data refreshed');
    if (action === 'export') showToast(`${button.textContent} export prepared`);
    if (action === 'copy-table') return copyTable(button);
    if (action === 'print') window.print();
    if (action === 'confirm-payment') return submitRecharge();
    if (action === 'transfer-submit') return submitTransfer();
    if (action === 'swap-submit') return submitSwap();
    if (action === 'withdraw-submit') return submitWithdrawal();
    if (action === 'create-ticket') return createTicket();
    if (action === 'sign-in') {
      const userId = fieldValue('login-user');
      const password = fieldValue('login-password');
      if (!userId || !password) return authError('Enter your User ID and password.');
      try { const data = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: userId, password }) }); app.user = data.user; app.session = { userId: data.user.userId, signedInAt: new Date().toISOString() }; app.csrfToken = data.csrfToken; await hydrateCustomerData(); location.hash = 'dashboard'; showToast(`Welcome back, ${data.user.fullName}.`); } catch (error) { authError(error.message); }
    }
    if (action === 'create-account') {
      const fullName = fieldValue('register-name');
      const email = fieldValue('register-email').toLowerCase();
      const country = fieldValue('register-country');
      const mobile = fieldValue('register-mobile');
      const referralId = fieldValue('register-referral');
      const password = fieldValue('register-password');
      if (!fullName || !email || !country || !mobile || !password) return authError('Complete every field to create your account.');
      if (!/^\S+@\S+\.\S+$/.test(email)) return authError('Enter a valid email address.');
      if (password.length < 8) return authError('Password must be at least 8 characters.');
      if (!document.getElementById('terms-check')?.checked) return authError('Please accept the Terms and Conditions.');
      try { const data = await api('/api/auth/register', { method: 'POST', body: JSON.stringify({ fullName, email, country, mobile, referralId, password }) }); location.hash = 'login'; showToast(`Account created. Your User ID is ${data.user.userId}.`); } catch (error) { authError(error.message); }
    }
  }));
}

function openPurchase(data) { app.pendingPurchase = data; document.getElementById('modal-title').textContent = `Purchase ${data.package}`; document.getElementById('modal-copy').textContent = 'Review the package details before confirming this purchase.'; document.getElementById('modal-summary').innerHTML = `<div><span>Amount</span><strong>₹ ${data.amount}</strong></div><div><span>Duration</span><strong>${data.days} days</strong></div><div><span>Total return</span><strong>₹ ${data.return}</strong></div>`; document.getElementById('modal-backdrop').classList.add('open'); document.getElementById('modal-backdrop').setAttribute('aria-hidden', 'false'); }
function closeModal() { document.getElementById('modal-backdrop').classList.remove('open'); document.getElementById('modal-backdrop').setAttribute('aria-hidden', 'true'); }
function showToast(text) { toastEl.textContent = text; toastEl.classList.add('show'); clearTimeout(showToast.timer); showToast.timer = setTimeout(() => toastEl.classList.remove('show'), 2600); }

document.getElementById('menu-toggle').addEventListener('click', () => document.querySelector('.sidebar').classList.toggle('open'));
document.querySelector('.main-area').addEventListener('click', event => {
  if (window.innerWidth <= 1280 && !event.target.closest('#menu-toggle')) document.querySelector('.sidebar').classList.remove('open');
});
document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('modal-backdrop').addEventListener('click', (event) => { if (event.target.id === 'modal-backdrop') closeModal(); });
document.getElementById('modal-confirm').addEventListener('click', async () => {
  const purchase = app.pendingPurchase;
  if (!purchase) return closeModal();
  try { await api('/api/me/package-activations', { method: 'POST', body: JSON.stringify({ packagePlanId: purchase.planId, idempotencyKey: idempotencyKey() }) }); await hydrateCustomerData(); closeModal(); refreshApp(); showToast(`${purchase.package} activated successfully.`); } catch (error) { closeModal(); authError(error.message); }
});
window.addEventListener('hashchange', () => { app.active = location.hash.slice(1) || (app.user ? 'dashboard' : 'login'); renderNav(); renderPage(); });
async function boot() {
  try { const session = await api('/api/auth/me'); app.user = session.user; app.session = { userId: session.user.userId }; app.csrfToken = session.csrfToken; await hydrateCustomerData(); } catch { clearSession(); }
  app.active = location.hash.slice(1) || (app.user ? 'dashboard' : 'login'); renderNav(); renderPage();
}
void boot();
