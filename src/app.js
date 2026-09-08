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

const app = { active: location.hash.slice(1) || 'dashboard', openGroups: new Set(['packages', 'income', 'transactional', 'reports']) };
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
    if (id === 'logout') { showToast('You are already in demo mode.'); return; }
    app.active = id; location.hash = id; renderNav(); renderPage(); document.querySelector('.sidebar').classList.remove('open');
  }));
}

function renderPage() {
  const page = pages[app.active] || pages.dashboard;
  content.innerHTML = page();
  bindPageEvents();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function dashboardPage() {
  return `${pageHead('Dashboard')}<div class="dashboard-top">
    <div class="panel profile-card"><div class="profile-emblem">⌂</div><h2>AMAN</h2><div class="profile-meta"><div class="meta-block"><div class="meta-label">User ID</div><div class="meta-value">IF496224</div></div><div class="meta-block"><div class="meta-label">Status</div><div class="meta-value status-inactive">Inactive</div></div><div class="meta-block"><div class="meta-label">Join Date</div><div class="meta-value">08 Sep 2026</div></div></div><div class="profile-direct">Direct Business : <strong>₹ 0.00</strong></div><div class="referral"><span>🔗 https://www.indiafinance.online/register?r=IF496224</span><button class="copy-button" data-copy="https://www.indiafinance.online/register?r=IF496224">Copy</button></div><div class="social-row"><strong>Join Us :</strong><span>◉</span><span>➤</span></div></div>
    <div class="summary-column"><div class="grid grid-2">${stat('Basic Package', money('0.00'))}${stat('FD Package', money('0.00'))}</div>${sectionTitle('🎁', 'Balance Summary')}<div class="grid grid-2">${stat('Available Fund', money('0.00'), 'value-green')}${stat('Available Balance', money('50.00'), 'value-cyan')}${stat('Total Income', money('50.00'), 'value-green')}${stat('Total Withdrawal', money('0.00'), 'value-red')}</div></div>
  </div>${sectionTitle('♣', 'Team Summary', 'cyan')}<div class="grid grid-2 dashboard-grid" style="max-width:690px">${stat('Direct Team', '0', 'value-green')}${stat('Total Team', '0')}</div>${sectionTitle('🎁', 'Basic Income Breakdown')}<div class="grid grid-4">${stat('Joining Bonus', money('50.00'), 'value-yellow')}${stat('Referral Income', money('0.00'), 'value-blue')}${stat('Today ROI Income', money('0.00'), 'value-green')}${stat('Today Level Income', money('0.00'), 'value-cyan')}${stat('Total ROI Income', money('0.00'), 'value-green')}${stat('Total Level Income', money('0.00'), 'value-cyan')}</div>${sectionTitle('🎁', 'FD Income Breakdown')}<div class="grid grid-4">${stat('Today ROI Income', money('0.00'), 'value-green')}${stat('Today Level Income', money('0.00'), 'value-cyan')}${stat('Total ROI Income', money('0.00'), 'value-green')}${stat('Total Level Income', money('0.00'), 'value-cyan')}${stat('Referral Income', money('0.00'), 'value-blue')}${stat('FD Released', money('0.00'), 'value-blue')}</div>`;
}

function rechargePage() {
  return `${pageHead('Recharge', 'Package / Recharge')}<div class="panel qr-card"><h2>Scan QR to Deposit USDT</h2><div class="notice">Only send Tether USD (BEP20) assets to this address. Other assets will be lost forever.</div><div class="order-id">Order Id: IF-USDT_b14fee38</div><div class="qr" id="qr"></div><div class="address-row"><span>0xF3112053d0C7d0F810096F8B416d588bF2f3593C</span><button data-copy="0xF3112053d0C7d0F810096F8B416d588bF2f3593C">Copy</button></div><div class="center"><button class="primary-button" data-action="confirm-payment">Confirm Payment</button></div><div class="notice" style="margin:9px 0 0">Please do not refresh or close this page for deposit payment. We will verify your transaction on the blockchain.</div></div><div style="height:24px"></div>${tablePanel('Payment History', ['SR', 'DATE', 'ADDRESS', 'HASH', 'AMOUNT'])}`;
}

function packagePage(type) {
  const isFD = type === 'fd-package'; const items = isFD ? fdPackages : basicPackages;
  return `${pageHead(isFD ? 'FD Package' : 'Basic Package', `Package / ${isFD ? 'FD Package' : 'Base Package'}`, '')}<div class="package-header"><div class="available-fund">Available Fund Balance : <span>0.00</span></div></div><div class="package-grid">${items.map(item => isFD ? `<article class="package-card"><div class="package-card-header"><div class="package-icon">◇</div><h3>${item[0]}</h3></div><div class="package-details"><div class="detail-row"><span>Amount :</span><span>${item[1]}</span></div><div class="detail-row"><span>Days :</span><span>${item[2]}</span></div><div class="detail-row"><span>Total Return :</span><span>${item[3]}</span></div></div><button class="purchase-button" data-package="${item[0]}" data-amount="${item[1]}" data-days="${item[2]}" data-return="${item[3]}">Purchase</button></article>` : `<article class="package-card"><div class="package-card-header"><div class="package-icon">◇</div><h3>${item[0]}</h3></div><div class="package-details"><div class="detail-row"><span>Amount :</span><span>${item[1]}</span></div><div class="detail-row"><span>Daily ROI :</span><span>${item[2]}</span></div><div class="detail-row"><span>Days :</span><span>${item[3]}</span></div><div class="detail-row"><span>Total Return :</span><span>${item[4]}</span></div></div><button class="purchase-button" data-package="${item[0]}" data-amount="${item[1]}" data-days="${item[3]}" data-return="${item[4]}">Purchase</button></article>`).join('')}</div>`;
}

function tablePanel(title, columns, options = {}) {
  const filters = options.filters === false ? '' : `<div class="filters ${options.three ? 'three' : ''}">${columns.length > 3 && options.three ? '<input class="input" placeholder="dd-mm-yyyy" type="date" /><input class="input" placeholder="dd-mm-yyyy" type="date" /><input class="input" placeholder="Id" />' : '<input class="input" placeholder="dd-mm-yyyy" type="date" /><input class="input" placeholder="dd-mm-yyyy" type="date" />'}</div><div class="filter-actions"><button class="primary-button" data-action="search">Search</button><button class="secondary-button" data-action="reset">Reset</button><button class="success-button" data-action="refresh">Refresh</button></div>`;
  return `<div class="panel table-panel"><div class="table-title"><h2><span class="title-icon">▥</span>${title}</h2>${options.total ? '<span class="total-badge">Total : 0.00</span>' : ''}</div>${filters}<div class="table-toolbar"><div class="entries"><select><option>25</option><option>50</option><option>100</option></select><span>entries per page</span></div><div class="export-buttons"><button data-action="copy-table">Copy</button><button data-action="export">Excel</button><button data-action="export">PDF</button><button data-action="print">Print</button></div></div><div class="table-wrap"><table><thead><tr>${columns.map(col => `<th>${col}</th>`).join('')}</tr></thead><tbody><tr class="empty-row"><td colspan="${columns.length}">No data available in table</td></tr></tbody></table></div><div class="table-foot"><span>Showing 0 to 0 of 0 entries</span><div class="pagination"><button>«</button><button>‹</button><button>›</button><button>»</button></div></div></div>`;
}

function incomePage(kind) {
  const config = { 'basic-roi': ['Basic ROI Return', 'ROI Return', ['SR', 'DATE', 'AMOUNT']], 'basic-referral': ['Basic Referral Income', 'ROI Return', ['SR', 'DATE', 'FROM ID', 'LEVEL', 'AMOUNT']], 'basic-level': ['Basic Level Income', 'Level Income', ['SR', 'DATE', 'FROM ID', 'LEVEL', 'AMOUNT']], 'fd-roi': ['FD ROI Income', 'FD ROI Income', ['SR', 'DATE', 'AMOUNT']], 'fd-referral': ['FD Referral Income', 'FD Referral Income', ['SR', 'DATE', 'FROM ID', 'LEVEL', 'AMOUNT']], 'fd-level': ['FD Level Income', 'FD Level Income', ['SR', 'DATE', 'FROM ID', 'LEVEL', 'AMOUNT']] }[kind];
  return `${pageHead(config[0], `Income / ${config[0]}`)}${tablePanel(config[1], config[2], { total: true, three: config[2].length > 3 })}`;
}

function transferPage() {
  return `${pageHead('Transfer Fund', 'Transactional / P2P Transfer')}<div class="form-layout"><div><div class="form-panel"><h2>Transfer Fund</h2><div class="form-field"><label>Available Fund Balance</label><div class="input-prefix"><span class="prefix">₹</span><input class="input" value="0.00" readonly /></div></div><div class="form-field"><label>Target User ID <span>*</span></label><input class="input" placeholder="Enter User ID" /></div><div class="form-field"><label>Amount <span>*</span></label><input class="input" placeholder="Enter Amount" /></div><div class="form-field"><label>T-Password <span>*</span></label><input class="input" placeholder="Enter T-Password" type="password" /></div><a class="link-button" href="#" data-action="forgot">Forgot T-Password?</a><div class="form-actions"><button class="primary-button" data-action="submit">Submit</button><button class="secondary-button" data-action="reset-form">Reset</button></div></div></div></div>`;
}

function swapPage() {
  return `${pageHead('Swap', 'Transactional / Transfer to Fund')}<div class="form-layout"><div><div class="form-panel"><h2>Transfer To Fund</h2><div class="form-field"><label>Income Balance</label><input class="input" value="50.00" readonly /></div><div class="form-field"><label>Amount</label><input class="input" value="50" /></div><div class="form-actions"><button class="primary-button" data-action="submit">Submit</button><button class="secondary-button" data-action="reset-form">Reset</button></div></div></div></div><div style="margin-top:24px">${tablePanel('Transfer Income To Fund Details', ['SR', 'DATE', 'AMOUNT', 'STATUS'])}</div>`;
}

function withdrawalPage() {
  return `${pageHead('Fund Withdrawal', 'Transactional / Fund Withdrawal')}<div class="timing-card panel"><div class="timing-icon">↗</div><p>Withdrawal timing is 10:00 AM to 2:00 PM.</p></div>${tablePanel('Withdrawal Request Details', ['SR', 'DATE', 'AMOUNT', 'CHARGES', 'PAYABLE', 'STATUS'])}`;
}

function reportPage(kind) {
  const names = { 'daily-report': 'Daily Income Report', 'monthly-report': 'Monthly Income Report', 'fund-summary': 'Fund Wallet Summary', 'income-summary': 'Income Wallet Summary' };
  return `${pageHead(names[kind], `Reports / ${names[kind]}`)}${tablePanel(names[kind], ['SR', 'DATE', 'DESCRIPTION', 'AMOUNT', 'STATUS'], { total: true, three: true })}`;
}

function supportPage() { return `${pageHead('Support Ticket', 'Support Ticket')}<div class="form-panel"><h2>Need help?</h2><div class="form-field"><label>Subject</label><input class="input" placeholder="What can we help with?" /></div><div class="form-field"><label>Message</label><textarea class="input" rows="6" placeholder="Describe your question"></textarea></div><div class="form-actions"><button class="primary-button" data-action="submit">Submit Ticket</button><button class="secondary-button" data-action="reset-form">Reset</button></div></div>`; }

const pages = { dashboard: dashboardPage, recharge: rechargePage, 'basic-package': () => packagePage('basic-package'), 'fd-package': () => packagePage('fd-package'), 'transfer-fund': transferPage, swap: swapPage, withdrawal: withdrawalPage, support: supportPage, 'basic-roi': () => incomePage('basic-roi'), 'basic-referral': () => incomePage('basic-referral'), 'basic-level': () => incomePage('basic-level'), 'fd-roi': () => incomePage('fd-roi'), 'fd-referral': () => incomePage('fd-referral'), 'fd-level': () => incomePage('fd-level'), 'daily-report': () => reportPage('daily-report'), 'monthly-report': () => reportPage('monthly-report'), 'fund-summary': () => reportPage('fund-summary'), 'income-summary': () => reportPage('income-summary') };

function bindPageEvents() {
  document.querySelectorAll('[data-copy]').forEach(button => button.addEventListener('click', () => { navigator.clipboard?.writeText(button.dataset.copy); showToast('Copied to clipboard'); }));
  const qr = document.getElementById('qr'); if (qr) { for (let i = 0; i < 441; i++) { const cell = document.createElement('i'); const x = i % 21, y = Math.floor(i / 21); const finder = (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13); const inner = (x > 1 && x < 5 && y > 1 && y < 5) || (x > 15 && x < 19 && y > 1 && y < 5) || (x > 1 && x < 5 && y > 15 && y < 19); if (finder ? (x === 0 || x === 6 || y === 0 || y === 6 || x === 14 || x === 20 || y === 0 || y === 6 || y === 14 || y === 20 || inner) : ((x * 7 + y * 11 + x * y) % 5 < 2)) cell.className = 'dark'; qr.appendChild(cell); } }
  document.querySelectorAll('.purchase-button').forEach(button => button.addEventListener('click', () => openPurchase(button.dataset)));
  document.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', event => { event.preventDefault(); const action = button.dataset.action; if (action === 'search') showToast('Search applied'); if (action === 'reset' || action === 'reset-form') showToast('Form reset'); if (action === 'refresh') showToast('Data refreshed'); if (action === 'export') showToast(`${button.textContent} export prepared`); if (action === 'copy-table') showToast('Table copied'); if (action === 'print') window.print(); if (action === 'submit') showToast('Demo submission complete'); if (action === 'confirm-payment') showToast('Payment confirmation received'); if (action === 'forgot') showToast('Password reset flow opened'); }));
}

function openPurchase(data) { document.getElementById('modal-title').textContent = `Purchase ${data.package}`; document.getElementById('modal-copy').textContent = 'This demo keeps the package flow interactive without processing a real payment.'; document.getElementById('modal-summary').innerHTML = `<div><span>Amount</span><strong>₹ ${data.amount}</strong></div><div><span>Duration</span><strong>${data.days} days</strong></div><div><span>Total return</span><strong>₹ ${data.return}</strong></div>`; document.getElementById('modal-backdrop').classList.add('open'); document.getElementById('modal-backdrop').setAttribute('aria-hidden', 'false'); }
function closeModal() { document.getElementById('modal-backdrop').classList.remove('open'); document.getElementById('modal-backdrop').setAttribute('aria-hidden', 'true'); }
function showToast(text) { toastEl.textContent = text; toastEl.classList.add('show'); clearTimeout(showToast.timer); showToast.timer = setTimeout(() => toastEl.classList.remove('show'), 2600); }

document.getElementById('menu-toggle').addEventListener('click', () => document.querySelector('.sidebar').classList.toggle('open'));
document.getElementById('theme-toggle').addEventListener('click', () => { document.body.classList.toggle('light'); showToast(document.body.classList.contains('light') ? 'Light mode enabled' : 'Dark mode enabled'); });
document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('modal-backdrop').addEventListener('click', (event) => { if (event.target.id === 'modal-backdrop') closeModal(); });
document.getElementById('modal-confirm').addEventListener('click', () => { closeModal(); showToast('Purchase request submitted'); });
window.addEventListener('hashchange', () => { app.active = location.hash.slice(1) || 'dashboard'; renderNav(); renderPage(); });
renderNav(); renderPage();
