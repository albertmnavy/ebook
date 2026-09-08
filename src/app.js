const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: '⌁', tone: 'blue' },
  { id: 'recharge', label: 'Recharge', icon: '▰', tone: 'green' },
  { id: 'packages', label: 'Package Activation', icon: '◆', tone: 'yellow', children: [{ id: 'basic-package', label: 'Basic Package' }, { id: 'fd-package', label: 'FD package' }] },
  { id: 'downline', label: 'Downline', icon: '♣', tone: 'cyan', children: [{ id: 'direct-team', label: 'Direct Team' }, { id: 'total-team', label: 'Total Team' }] },
  { id: 'income', label: 'Income', icon: '▣', tone: 'green', children: [{ id: 'basic-roi', label: 'Basic ROI Income' }, { id: 'basic-referral', label: 'Basic Referral Income' }, { id: 'basic-level', label: 'Basic Level Income' }, { id: 'fd-roi', label: 'FD ROI Income' }, { id: 'fd-referral', label: 'FD Referral Income' }, { id: 'fd-level', label: 'FD Level Income' }] },
  { id: 'transactional', label: 'Transactional', icon: '↻', tone: 'blue', children: [{ id: 'transfer-fund', label: 'P2P Transfer' }, { id: 'swap', label: 'Income to Fund' }, { id: 'withdrawal', label: 'Withdrawal' }] },
  { id: 'reports', label: 'Reports', icon: '▥', tone: 'yellow', children: [{ id: 'daily-report', label: 'Daily Income Report' }, { id: 'monthly-report', label: 'Monthly Income Report' }, { id: 'fund-summary', label: 'Fund Wallet Summary' }, { id: 'income-summary', label: 'Income Wallet Summary' }] },
  { id: 'support', label: 'Support Ticket', icon: '♧', tone: 'cyan' },
  { id: 'logout', label: 'Logout', icon: '↪', tone: 'red' },
];

const basicPackages = [
  ['Base Plan 1', '200.00', '10.00', '25', '250.00'], ['Base Plan 2', '500.00', '25.00', '25', '625.00'], ['Base Plan 3', '1,000.00', '50.00', '25', '1,250.00'], ['Base Plan 4', '2,000.00', '100.00', '25', '2,500.00'], ['Base Plan 5', '5,000.00', '250.00', '25', '6,250.00'], ['Base Plan 6', '10,000.00', '500.00', '25', '12,500.00'], ['Base Plan 7', '50,000.00', '2,500.00', '25', '62,500.00'], ['Base Plan 8', '100,000.00', '5,000.00', '25', '125,000.00'],
];
const fdPackages = [
  ['Base FD Plan 1', '1,000.00', '365', '3,650.00'], ['Prime FD Plan 1', '1,000.00', '515', '7,725.00'], ['Base FD Plan 2', '2,000.00', '365', '7,300.00'], ['Prime FD Plan 2', '2,000.00', '515', '15,450.00'], ['Base FD Plan 3', '5,000.00', '365', '18,250.00'], ['Prime FD Plan 3', '5,000.00', '515', '38,625.00'], ['Base FD Plan 4', '10,000.00', '365', '36,500.00'], ['Prime FD Plan 4', '10,000.00', '515', '77,250.00'], ['Base FD Plan 5', '25,000.00', '365', '91,250.00'], ['Prime FD Plan 5', '25,000.00', '515', '193,125.00'], ['Base FD Plan 6', '50,000.00', '365', '182,500.00'], ['Prime FD Plan 6', '50,000.00', '515', '386,250.00'],
];

const AUTH_KEY = 'infotech.auth.user';
const SESSION_KEY = 'infotech.auth.session';
const DEMO_CREDENTIALS = { userId: 'INF-DEMO', password: 'Infotech@123', fullName: 'Demo User', email: 'demo@infotech.local', country: 'India', mobile: '+91 90000 00000' };
const publicPages = new Set(['login', 'register']);

function readJson(storage, key) {
  try { return JSON.parse(storage.getItem(key) || 'null'); } catch { return null; }
}
function storedUser() { return readJson(localStorage, AUTH_KEY); }
function currentSession() { return readJson(sessionStorage, SESSION_KEY) || readJson(localStorage, SESSION_KEY); }
function clearSession() { sessionStorage.removeItem(SESSION_KEY); localStorage.removeItem(SESSION_KEY); }
function setSession(userId, remember) {
  const session = JSON.stringify({ userId, signedInAt: new Date().toISOString() });
  sessionStorage.setItem(SESSION_KEY, session);
  if (remember) localStorage.setItem(SESSION_KEY, session); else localStorage.removeItem(SESSION_KEY);
}
async function hashPassword(password) {
  const bytes = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
}
const APP_STATE_PREFIX = 'infotech.app.';
function defaultAppState() { return { availableBalance: 50, availableFund: 0, incomeBalance: 50, totalIncome: 50, totalWithdrawal: 0, packages: [], payments: [], transfers: [], swaps: [], withdrawals: [], tickets: [], ledger: [] }; }
function appStateKey() { return `${APP_STATE_PREFIX}${currentSession()?.userId || 'guest'}`; }
function getAppState() { const saved = readJson(localStorage, appStateKey()); return saved ? { ...defaultAppState(), ...saved } : defaultAppState(); }
function saveAppState(state) { localStorage.setItem(appStateKey(), JSON.stringify(state)); return state; }
function amountValue(value) { const amount = Number(String(value).replace(/,/g, '')); return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0; }
function displayMoney(value) { return amountValue(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function today() { return new Date().toLocaleDateString('en-GB'); }
function addLedger(state, type, amount, description) { state.ledger.unshift({ id: `TX-${Date.now()}`, date: today(), type, amount: amountValue(amount), description }); }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }
function fieldValue(id) { return document.getElementById(id)?.value.trim() || ''; }
function authError(message) { showToast(message); document.querySelector('.auth-card')?.classList.add('auth-error'); setTimeout(() => document.querySelector('.auth-card')?.classList.remove('auth-error'), 450); }
const app = { active: location.hash.slice(1) || (currentSession() ? 'dashboard' : 'login'), openGroups: new Set(['packages', 'income', 'transactional', 'reports']) };
const content = document.getElementById('content');
const navList = document.getElementById('nav-list');
const toastEl = document.getElementById('toast');

const money = (n) => `₹ ${n}`;
const sectionTitle = (icon, title, extra = '') => `<div class="section-title ${extra}"><span class="title-icon">${icon}</span><h2>${title}</h2></div>`;
const pageHead = (title, crumb = title, subtitle = '') => `<div class="page-head"><div class="title-wrap"><h1>${title}</h1>${subtitle ? `<p>${subtitle}</p>` : ''}</div><div class="breadcrumb"><span class="home">⌂</span>&nbsp; ${crumb.includes('/') ? crumb.replace('/', ' / ') : crumb}</div></div>`;
const stat = (label, value, tone = '') => `<div class="stat-card"><div class="stat-label">${label}</div><div class="stat-value ${tone}">${value}</div></div>`;

function renderNav() {
  navList.innerHTML = navItems.map(item => {
    const isOpen = app.openGroups.has(item.id);
    const active = app.active === item.id || item.children?.some(c => c.id === app.active);
    const button = `<button class="nav-item ${active ? 'active' : ''} ${isOpen ? 'open' : ''}" data-nav="${item.id}"><span class="nav-icon icon-${item.tone}">${item.icon}</span><span class="nav-label">${item.label}</span>${item.children ? '<span class="nav-arrow">⌄</span>' : ''}</button>`;
    const children = item.children ? `<div class="subnav">${item.children.map(child => `<button class="${app.active === child.id ? 'active' : ''}" data-nav="${child.id}">${child.label}</button>`).join('')}</div>` : '';
    return `<div class="nav-group ${isOpen ? 'expanded' : ''}">${button}${children}</div>`;
  }).join('');
  navList.querySelectorAll('[data-nav]').forEach(button => button.addEventListener('click', () => {
    const id = button.dataset.nav;
    const item = navItems.find(x => x.id === id);
    if (item?.children) { app.openGroups.has(id) ? app.openGroups.delete(id) : app.openGroups.add(id); renderNav(); return; }
    if (id === 'logout') { clearSession(); app.active = 'login'; location.hash = 'login'; renderNav(); renderPage(); return; }
    app.active = id; location.hash = id; renderNav(); renderPage(); document.querySelector('.sidebar').classList.remove('open');
  }));
}

function renderPage() {
  if (!publicPages.has(app.active) && !currentSession()) {
    app.active = 'login';
    if (location.hash !== '#login') location.hash = 'login';
  }
  const page = pages[app.active] || pages.dashboard;
  document.body.classList.toggle('auth-mode', app.active === 'login' || app.active === 'register');
  content.innerHTML = page();
  bindPageEvents();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function dashboardPage() {
  const state = getAppState();
  const user = storedUser() || {};
  const basicTotal = state.packages.filter(item => item.kind === 'Basic').reduce((sum, item) => sum + amountValue(item.amount), 0);
  const fdTotal = state.packages.filter(item => item.kind === 'FD').reduce((sum, item) => sum + amountValue(item.amount), 0);
  return `${pageHead('Dashboard')}<div class="dashboard-top">
    <div class="panel profile-card"><div class="profile-emblem">⌂</div><h2>${escapeHtml(user.fullName || 'AMAN')}</h2><div class="profile-meta"><div class="meta-block"><div class="meta-label">User ID</div><div class="meta-value">${escapeHtml(user.userId || 'INF000000')}</div></div><div class="meta-block"><div class="meta-label">Status</div><div class="meta-value value-green">Active</div></div><div class="meta-block"><div class="meta-label">Join Date</div><div class="meta-value">${escapeHtml(user.createdAt ? new Date(user.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : today())}</div></div></div><div class="profile-direct">Direct Business : <strong>₹ 0.00</strong></div><div class="referral"><span>🔗 https://www.infotech.online/register?r=${escapeHtml(user.userId || '')}</span><button class="copy-button" data-copy="https://www.infotech.online/register?r=${escapeHtml(user.userId || '')}">Copy</button></div><div class="social-row"><strong>Join Us :</strong><span>◉</span><span>➤</span></div></div>
    <div class="summary-column"><div class="grid grid-2">${stat('Basic Package', money(displayMoney(basicTotal)))}${stat('FD Package', money(displayMoney(fdTotal)))}</div>${sectionTitle('🎁', 'Balance Summary')}<div class="grid grid-2">${stat('Available Fund', money(displayMoney(state.availableFund)), 'value-green')}${stat('Available Balance', money(displayMoney(state.availableBalance)), 'value-cyan')}${stat('Total Income', money(displayMoney(state.totalIncome)), 'value-green')}${stat('Total Withdrawal', money(displayMoney(state.totalWithdrawal)), 'value-red')}</div></div>
  </div>${sectionTitle('♣', 'Team Summary', 'cyan')}<div class="grid grid-2 dashboard-grid" style="max-width:690px">${stat('Direct Team', '0', 'value-green')}${stat('Total Team', '0')}</div>${sectionTitle('🎁', 'Basic Income Breakdown')}<div class="grid grid-4">${stat('Joining Bonus', money(displayMoney(state.totalIncome)), 'value-yellow')}${stat('Referral Income', money('0.00'), 'value-blue')}${stat('Today ROI Income', money('0.00'), 'value-green')}${stat('Today Level Income', money('0.00'), 'value-cyan')}${stat('Total ROI Income', money('0.00'), 'value-green')}${stat('Total Level Income', money('0.00'), 'value-cyan')}</div>${sectionTitle('🎁', 'FD Income Breakdown')}<div class="grid grid-4">${stat('Today ROI Income', money('0.00'), 'value-green')}${stat('Today Level Income', money('0.00'), 'value-cyan')}${stat('Total ROI Income', money('0.00'), 'value-green')}${stat('Total Level Income', money('0.00'), 'value-cyan')}${stat('Referral Income', money('0.00'), 'value-blue')}${stat('FD Released', money('0.00'), 'value-blue')}</div>`;
}

function rechargePage() {
  return `${pageHead('Recharge', 'Package / Recharge')}<div class="panel qr-card"><h2>Scan QR to Pay</h2><div class="notice">Use your preferred UPI or banking app to scan this payment gateway QR. Your payment will be securely verified after checkout.</div><div class="order-id">Payment Id: IF-PAY_b14fee38</div><div class="qr" id="qr"></div><div class="address-row"><span>Infotech Secure Payment Gateway</span><button data-copy="IF-PAY_b14fee38">Copy ID</button></div><div class="recharge-input"><label class="auth-label" for="recharge-amount">Recharge amount</label><input id="recharge-amount" class="input" type="number" min="1" step="0.01" placeholder="Enter amount" /></div><div class="center"><button class="primary-button" data-action="confirm-payment">Confirm Payment</button></div><div class="notice" style="margin:9px 0 0">In local mode, confirmation records the payment in your account and updates your available balance.</div></div><div style="height:24px"></div>${tablePanel('Payment History', ['SR', 'DATE', 'PAYMENT ID', 'METHOD', 'AMOUNT', 'STATUS'])}`;
}

function authBrand() { return `<div class="auth-brand"><div class="brand-mark">⌂</div><div class="brand-text"><span>INFOTECH</span></div></div>`; }
function authInput(icon, label, placeholder, type = 'text', id = '') { return `<label class="auth-field"><span class="auth-label">${label}</span><span class="input-group"><span class="input-icon">${icon}</span><input class="input" id="${id}" type="${type}" placeholder="${placeholder}" /></span></label>`; }
function loginPage() {
  return `<div class="auth-page"><div class="auth-card login-card">${authBrand()}<h1>Welcome <span>Back!</span></h1><p class="auth-subtitle">Please sign in to your account to continue.</p><form class="auth-form"><div class="auth-field"><label class="auth-label" for="login-user">User ID</label><span class="input-group"><span class="input-icon">♙</span><input id="login-user" class="input" placeholder="User ID" autocomplete="username" /></span></div><div class="auth-field"><label class="auth-label" for="login-password">Password</label><span class="input-group"><span class="input-icon">♧</span><input id="login-password" class="input" type="password" placeholder="Password" autocomplete="current-password" /><button type="button" class="password-toggle" data-toggle-password="login-password" aria-label="Show password">◉</button></span></div><div class="auth-options"><label class="remember"><input id="remember-me" type="checkbox" /> <span>Remember me</span></label><a href="#" data-action="forgot">Forgot Password?</a></div><button class="primary-button auth-submit" type="button" data-action="sign-in">Sign In</button></form><p class="auth-switch">Don't have an account? <a href="#register">Create an Account</a></p></div></div>`;
}
function registerPage() {
  return `<div class="auth-page"><div class="auth-card register-card">${authBrand()}<h1>Create an <span>Account</span></h1><p class="auth-subtitle">Join us and experience Infotech.</p><form class="auth-form"><div class="auth-field"><label class="auth-label" for="register-referral">Referral ID</label><span class="input-group"><span class="input-icon">#</span><input id="register-referral" class="input" placeholder="Referral ID" /></span></div><div class="auth-grid">${authInput('▣', 'Full Name', 'Full Name', 'text', 'register-name')}${authInput('✉', 'Email Address', 'Email Address', 'email', 'register-email')}</div><div class="auth-grid">${authInput('◎', 'Country', '-- Select Country --', 'text', 'register-country')}${authInput('▯', 'Mobile (+ISD...)', 'Mobile Number', 'tel', 'register-mobile')}</div><div class="auth-field"><label class="auth-label" for="register-password">Password</label><span class="input-group"><span class="input-icon">♧</span><input id="register-password" class="input" type="password" placeholder="Password" autocomplete="new-password" /><button type="button" class="password-toggle" data-toggle-password="register-password" aria-label="Show password">◉</button></span></div><label class="terms"><input id="terms-check" type="checkbox" /> <span>I agree to the <a href="#" data-action="terms">Terms and Conditions</a></span></label><button class="primary-button auth-submit" type="button" data-action="create-account">Create Account</button></form><p class="auth-switch">Already have an account? <a href="#login">Sign In</a></p></div></div>`;
}

function packagePage(type) {
  const isFD = type === 'fd-package'; const items = isFD ? fdPackages : basicPackages; const state = getAppState();
  return `${pageHead(isFD ? 'FD Package' : 'Basic Package', `Package / ${isFD ? 'FD Package' : 'Base Package'}`, '')}<div class="package-header"><div class="available-fund">Available Fund Balance : <span>${displayMoney(state.availableBalance)}</span></div></div><div class="package-grid">${items.map(item => isFD ? `<article class="package-card"><div class="package-card-header"><div class="package-icon">◇</div><h3>${item[0]}</h3></div><div class="package-details"><div class="detail-row"><span>Amount :</span><span>${item[1]}</span></div><div class="detail-row"><span>Days :</span><span>${item[2]}</span></div><div class="detail-row"><span>Total Return :</span><span>${item[3]}</span></div></div><button class="purchase-button" data-kind="FD" data-package="${item[0]}" data-amount="${item[1]}" data-days="${item[2]}" data-return="${item[3]}">Purchase</button></article>` : `<article class="package-card"><div class="package-card-header"><div class="package-icon">◇</div><h3>${item[0]}</h3></div><div class="package-details"><div class="detail-row"><span>Amount :</span><span>${item[1]}</span></div><div class="detail-row"><span>Daily ROI :</span><span>${item[2]}</span></div><div class="detail-row"><span>Days :</span><span>${item[3]}</span></div><div class="detail-row"><span>Total Return :</span><span>${item[4]}</span></div></div><button class="purchase-button" data-kind="Basic" data-package="${item[0]}" data-amount="${item[1]}" data-days="${item[3]}" data-return="${item[4]}">Purchase</button></article>`).join('')}</div>`;
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
  const body = rows.length ? rows.map(row => `<tr>${row.map(cell => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('') : `<tr class="empty-row"><td colspan="${columns.length}">No data available in table</td></tr>`;
  return `<div class="panel table-panel"><div class="table-title"><h2><span class="title-icon">▥</span>${title}</h2>${options.total ? `<span class="total-badge">Total : ${displayMoney(total)}</span>` : ''}</div>${filters}<div class="table-toolbar"><div class="entries"><select><option>25</option><option>50</option><option>100</option></select><span>entries per page</span></div><div class="export-buttons"><button data-action="copy-table">Copy</button><button data-action="export">Excel</button><button data-action="export">PDF</button><button data-action="print">Print</button></div></div><div class="table-wrap"><table><thead><tr>${columns.map(col => `<th>${col}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div><div class="table-foot"><span>Showing ${rows.length ? 1 : 0} to ${rows.length} of ${rows.length} entries</span><div class="pagination"><button>«</button><button>‹</button><button>›</button><button>»</button></div></div></div>`;
}

function incomePage(kind) {
  const config = { 'basic-roi': ['Basic ROI Return', 'ROI Return', ['SR', 'DATE', 'AMOUNT']], 'basic-referral': ['Basic Referral Income', 'ROI Return', ['SR', 'DATE', 'FROM ID', 'LEVEL', 'AMOUNT']], 'basic-level': ['Basic Level Income', 'Level Income', ['SR', 'DATE', 'FROM ID', 'LEVEL', 'AMOUNT']], 'fd-roi': ['FD ROI Income', 'FD ROI Income', ['SR', 'DATE', 'AMOUNT']], 'fd-referral': ['FD Referral Income', 'FD Referral Income', ['SR', 'DATE', 'FROM ID', 'LEVEL', 'AMOUNT']], 'fd-level': ['FD Level Income', 'FD Level Income', ['SR', 'DATE', 'FROM ID', 'LEVEL', 'AMOUNT']] }[kind];
  return `${pageHead(config[0], `Income / ${config[0]}`)}${tablePanel(config[1], config[2], { total: true, three: config[2].length > 3 })}`;
}

function transferPage() {
  const state = getAppState();
  return `${pageHead('Transfer Fund', 'Transactional / P2P Transfer')}<div class="form-layout"><div><div class="form-panel"><h2>Transfer Fund</h2><div class="form-field"><label>Available Fund Balance</label><div class="input-prefix"><span class="prefix">₹</span><input class="input" value="${displayMoney(state.availableFund)}" readonly /></div></div><div class="form-field"><label>Target User ID <span>*</span></label><input id="transfer-target" class="input" placeholder="Enter User ID" /></div><div class="form-field"><label>Amount <span>*</span></label><input id="transfer-amount" class="input" type="number" min="1" step="0.01" placeholder="Enter Amount" /></div><div class="form-field"><label>T-Password <span>*</span></label><input id="transfer-password" class="input" placeholder="Enter T-Password" type="password" /></div><a class="link-button" href="#" data-action="forgot">Forgot T-Password?</a><div class="form-actions"><button class="primary-button" data-action="transfer-submit">Submit</button><button class="secondary-button" data-action="reset-form">Reset</button></div></div></div></div>${tablePanel('P2P Transfer History', ['SR', 'DATE', 'TARGET USER', 'AMOUNT', 'STATUS'])}`;
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
function teamPage(title) { return `${pageHead(title, `Downline / ${title}`)}<div class="grid grid-2" style="max-width:720px">${stat('Direct Team', '0', 'value-cyan')}${stat('Total Team', '0', 'value-green')}</div><div style="margin-top:24px">${tablePanel(title, ['SR', 'USER ID', 'NAME', 'JOIN DATE', 'STATUS'], { filters: false })}</div>`; }

const pages = { login: loginPage, register: registerPage, dashboard: dashboardPage, recharge: rechargePage, 'basic-package': () => packagePage('basic-package'), 'fd-package': () => packagePage('fd-package'), 'direct-team': () => teamPage('Direct Team'), 'total-team': () => teamPage('Total Team'), 'transfer-fund': transferPage, swap: swapPage, withdrawal: withdrawalPage, support: supportPage, 'basic-roi': () => incomePage('basic-roi'), 'basic-referral': () => incomePage('basic-referral'), 'basic-level': () => incomePage('basic-level'), 'fd-roi': () => incomePage('fd-roi'), 'fd-referral': () => incomePage('fd-referral'), 'fd-level': () => incomePage('fd-level'), 'daily-report': () => reportPage('daily-report'), 'monthly-report': () => reportPage('monthly-report'), 'fund-summary': () => reportPage('fund-summary'), 'income-summary': () => reportPage('income-summary') };

function refreshApp() { renderNav(); renderPage(); }
function recordLocalPayment() {
  const amount = amountValue(fieldValue('recharge-amount'));
  if (amount <= 0) return authError('Enter a recharge amount first.');
  const state = getAppState();
  const paymentId = `IF-PAY-${Date.now().toString().slice(-8)}`;
  state.availableBalance += amount;
  state.payments.unshift({ paymentId, date: today(), method: 'Payment Gateway QR', amount, status: 'Verified' });
  addLedger(state, 'Recharge', amount, 'Payment gateway recharge');
  saveAppState(state);
  refreshApp();
  showToast(`Payment verified. ₹ ${displayMoney(amount)} added to your balance.`);
}
function submitTransfer() {
  const target = fieldValue('transfer-target').toUpperCase(); const amount = amountValue(fieldValue('transfer-amount')); const password = fieldValue('transfer-password'); const state = getAppState();
  if (!target || !amount || !password) return authError('Complete the transfer form.');
  if (amount > state.availableFund) return authError('Insufficient fund balance for this transfer.');
  state.availableFund -= amount; state.transfers.unshift({ date: today(), target, amount, status: 'Completed' }); addLedger(state, 'Transfer', amount, `P2P transfer to ${target}`); saveAppState(state); refreshApp(); showToast(`₹ ${displayMoney(amount)} transferred to ${target}.`);
}
function submitSwap() {
  const amount = amountValue(fieldValue('swap-amount')); const state = getAppState();
  if (!amount) return authError('Enter an amount to swap.');
  if (amount > state.incomeBalance) return authError('Insufficient income balance.');
  state.incomeBalance -= amount; state.availableFund += amount; state.swaps.unshift({ date: today(), amount, status: 'Completed' }); addLedger(state, 'Swap', amount, 'Income transferred to fund'); saveAppState(state); refreshApp(); showToast(`₹ ${displayMoney(amount)} moved to fund balance.`);
}
function submitWithdrawal() {
  const amount = amountValue(fieldValue('withdraw-amount')); const details = fieldValue('withdraw-details'); const state = getAppState();
  if (!amount || !details) return authError('Enter an amount and payment details.');
  if (amount > state.availableFund) return authError('Insufficient fund balance for this withdrawal.');
  const charges = Math.round(amount * 0.02 * 100) / 100; const payable = amount - charges;
  state.availableFund -= amount; state.totalWithdrawal += amount; state.withdrawals.unshift({ date: today(), amount, charges, payable, status: 'Pending' }); addLedger(state, 'Withdrawal', amount, `Withdrawal to ${details}`); saveAppState(state); refreshApp(); showToast(`Withdrawal request for ₹ ${displayMoney(payable)} submitted.`);
}
function createTicket() {
  const subject = fieldValue('ticket-subject'); const message = fieldValue('ticket-message');
  if (!subject || !message) return authError('Add a subject and message before submitting.');
  const state = getAppState(); state.tickets.unshift({ date: today(), subject, message, status: 'Open' }); saveAppState(state); refreshApp(); showToast('Support ticket created.');
}

function bindPageEvents() {
  document.querySelectorAll('[data-copy]').forEach(button => button.addEventListener('click', () => { navigator.clipboard?.writeText(button.dataset.copy); showToast('Copied to clipboard'); }));
  document.querySelectorAll('[data-toggle-password]').forEach(button => button.addEventListener('click', () => { const input = document.getElementById(button.dataset.togglePassword); input.type = input.type === 'password' ? 'text' : 'password'; }));
  const qr = document.getElementById('qr'); if (qr) { for (let i = 0; i < 441; i++) { const cell = document.createElement('i'); const x = i % 21, y = Math.floor(i / 21); const finder = (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13); const inner = (x > 1 && x < 5 && y > 1 && y < 5) || (x > 15 && x < 19 && y > 1 && y < 5) || (x > 1 && x < 5 && y > 15 && y < 19); if (finder ? (x === 0 || x === 6 || y === 0 || y === 6 || x === 14 || x === 20 || y === 0 || y === 6 || y === 14 || y === 20 || inner) : ((x * 7 + y * 11 + x * y) % 5 < 2)) cell.className = 'dark'; qr.appendChild(cell); } }
  document.querySelectorAll('.purchase-button').forEach(button => button.addEventListener('click', () => openPurchase(button.dataset)));
  document.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', async event => {
    event.preventDefault();
    const action = button.dataset.action;
    if (action === 'search') showToast('Search applied');
    if (action === 'reset' || action === 'reset-form') showToast('Form reset');
    if (action === 'refresh') showToast('Data refreshed');
    if (action === 'export') showToast(`${button.textContent} export prepared`);
    if (action === 'copy-table') showToast('Table copied');
    if (action === 'print') window.print();
    if (action === 'submit') showToast('Demo submission complete');
    if (action === 'confirm-payment') return recordLocalPayment();
    if (action === 'transfer-submit') return submitTransfer();
    if (action === 'swap-submit') return submitSwap();
    if (action === 'withdraw-submit') return submitWithdrawal();
    if (action === 'create-ticket') return createTicket();
    if (action === 'forgot') showToast('Password reset needs a connected email service.');
    if (action === 'terms') showToast('Please accept the Terms and Conditions to continue.');
    if (action === 'sign-in') {
      const userId = fieldValue('login-user').toUpperCase();
      const password = fieldValue('login-password');
      const user = storedUser();
      if (!userId || !password) return authError('Enter your User ID and password.');
      if (userId === DEMO_CREDENTIALS.userId && password === DEMO_CREDENTIALS.password) {
        const passwordHash = await hashPassword(password);
        localStorage.setItem(AUTH_KEY, JSON.stringify({ ...DEMO_CREDENTIALS, passwordHash, createdAt: new Date().toISOString() }));
        if (!readJson(localStorage, `${APP_STATE_PREFIX}${userId}`)) localStorage.setItem(`${APP_STATE_PREFIX}${userId}`, JSON.stringify(defaultAppState()));
        setSession(userId, document.getElementById('remember-me')?.checked);
        location.hash = 'dashboard';
        return showToast(`Welcome back, ${DEMO_CREDENTIALS.fullName}.`);
      }
      if (!user) return authError('No local account found. Create an account first.');
      const passwordHash = await hashPassword(password);
      if (user.userId !== userId || user.passwordHash !== passwordHash) return authError('The User ID or password is incorrect.');
      setSession(userId, document.getElementById('remember-me')?.checked);
      location.hash = 'dashboard';
      showToast(`Welcome back, ${user.fullName}.`);
    }
    if (action === 'create-account') {
      const fullName = fieldValue('register-name');
      const email = fieldValue('register-email').toLowerCase();
      const country = fieldValue('register-country');
      const mobile = fieldValue('register-mobile');
      const password = fieldValue('register-password');
      const referralId = fieldValue('register-referral');
      if (!fullName || !email || !country || !mobile || !password) return authError('Complete every field to create your account.');
      if (!/^\S+@\S+\.\S+$/.test(email)) return authError('Enter a valid email address.');
      if (password.length < 6) return authError('Password must be at least 6 characters.');
      if (!document.getElementById('terms-check')?.checked) return authError('Please accept the Terms and Conditions.');
      const existing = storedUser();
      if (existing?.email === email) return authError('An account with this email already exists.');
      const userId = `INF${Math.floor(100000 + Math.random() * 900000)}`;
      const passwordHash = await hashPassword(password);
      localStorage.setItem(AUTH_KEY, JSON.stringify({ userId, fullName, email, country, mobile, referralId, passwordHash, createdAt: new Date().toISOString() }));
      localStorage.setItem(`${APP_STATE_PREFIX}${userId}`, JSON.stringify(defaultAppState()));
      clearSession();
      location.hash = 'login';
      showToast(`Account created. Your User ID is ${userId}.`);
    }
  }));
}

function openPurchase(data) { app.pendingPurchase = data; document.getElementById('modal-title').textContent = `Purchase ${data.package}`; document.getElementById('modal-copy').textContent = 'Review the package details before confirming this purchase.'; document.getElementById('modal-summary').innerHTML = `<div><span>Amount</span><strong>₹ ${data.amount}</strong></div><div><span>Duration</span><strong>${data.days} days</strong></div><div><span>Total return</span><strong>₹ ${data.return}</strong></div>`; document.getElementById('modal-backdrop').classList.add('open'); document.getElementById('modal-backdrop').setAttribute('aria-hidden', 'false'); }
function closeModal() { document.getElementById('modal-backdrop').classList.remove('open'); document.getElementById('modal-backdrop').setAttribute('aria-hidden', 'true'); }
function showToast(text) { toastEl.textContent = text; toastEl.classList.add('show'); clearTimeout(showToast.timer); showToast.timer = setTimeout(() => toastEl.classList.remove('show'), 2600); }

document.getElementById('menu-toggle').addEventListener('click', () => document.querySelector('.sidebar').classList.toggle('open'));
document.getElementById('theme-toggle').addEventListener('click', () => { document.body.classList.toggle('light'); showToast(document.body.classList.contains('light') ? 'Light mode enabled' : 'Dark mode enabled'); });
document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('modal-backdrop').addEventListener('click', (event) => { if (event.target.id === 'modal-backdrop') closeModal(); });
document.getElementById('modal-confirm').addEventListener('click', () => {
  const purchase = app.pendingPurchase;
  if (!purchase) return closeModal();
  const state = getAppState(); const amount = amountValue(purchase.amount);
  if (amount > state.availableBalance) { closeModal(); return authError('Insufficient balance. Use Recharge before purchasing this package.'); }
  state.availableBalance -= amount;
  state.packages.unshift({ kind: purchase.kind, name: purchase.package, amount, days: purchase.days, totalReturn: amountValue(purchase.return), purchasedAt: today() });
  addLedger(state, 'Package', amount, `${purchase.package} purchased`);
  saveAppState(state); closeModal(); refreshApp(); showToast(`${purchase.package} activated successfully.`);
});
window.addEventListener('hashchange', () => { app.active = location.hash.slice(1) || 'dashboard'; renderNav(); renderPage(); });
renderNav(); renderPage();
