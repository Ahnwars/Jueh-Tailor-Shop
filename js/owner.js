/*
 * owner.js — owner-only order dashboard.
 * The server verifies the passcode; it is kept in memory only.
 */
document.addEventListener('DOMContentLoaded', function () {
  const gate = document.getElementById('gate');
  const dashboard = document.getElementById('dashboard');
  const passcodeInput = document.getElementById('passcode');
  const loginBtn = document.getElementById('login-btn');
  const gateError = document.getElementById('gate-error');
  const logoutBtn = document.getElementById('logout-btn');
  const refreshBtn = document.getElementById('refresh-orders');
  const feedback = document.getElementById('owner-feedback');

  let savedPasscode = '';

  function updateSummary(orders) {
    const totals = { New: 0, Ongoing: 0, Done: 0, designs: 0 };
    (orders || []).forEach(function (order) {
      const status = order['Status'] || 'New';
      if (Object.prototype.hasOwnProperty.call(totals, status)) totals[status]++;
      if (String(order['Design File'] || '').trim()) totals.designs++;
    });
    document.getElementById('new-count').textContent = totals.New;
    document.getElementById('ongoing-count').textContent = totals.Ongoing;
    document.getElementById('done-count').textContent = totals.Done;
    document.getElementById('design-count').textContent = totals.designs;
  }

  const board = new OrderBoard({
    listEl: document.getElementById('order-list'),
    pagerEl: document.getElementById('pager'),
    countEl: document.getElementById('order-count'),
    searchEl: document.getElementById('search-box'),
    statusFilterEl: document.getElementById('status-filter'),
    designOnlyEl: document.getElementById('design-only-filter'),
    sortNewestFirst: true,
    showDesignPreview: true,
    onDataChanged: updateSummary,
    getPasscode: function () { return savedPasscode; }
  });

  function showDashboard(orders) {
    gate.classList.add('hidden');
    dashboard.classList.remove('hidden');
    logoutBtn.classList.remove('hidden');
    board.setOrders(orders || []);
  }

  function login() {
    const passcode = passcodeInput.value.trim();
    if (!passcode) {
      gateError.textContent = 'Enter your passcode.';
      return;
    }

    loginBtn.disabled = true;
    loginBtn.textContent = 'Checking…';
    gateError.textContent = '';

    callApi('getOrders', { passcode: passcode })
      .then(function (res) {
        loginBtn.disabled = false;
        loginBtn.textContent = 'Open Orders';

        if (!res || res.status !== 'ok') {
          gateError.textContent = (res && res.message) || 'Wrong passcode.';
          return;
        }

        savedPasscode = passcode;
        showDashboard(res.orders || []);
        feedback.textContent = 'Orders loaded. Use Refresh orders to check for new submissions.';
      })
      .catch(function () {
        loginBtn.disabled = false;
        loginBtn.textContent = 'Open Orders';
        gateError.textContent = 'Connection error. Check your internet connection and try again.';
      });
  }

  function refreshOrders() {
    if (!savedPasscode || refreshBtn.disabled) return;

    refreshBtn.disabled = true;
    refreshBtn.textContent = 'Refreshing…';
    feedback.textContent = '';

    callApi('getOrders', { passcode: savedPasscode })
      .then(function (res) {
        if (!res || res.status !== 'ok') {
          feedback.textContent = (res && res.message) || 'Could not refresh orders. Please sign in again if your session expired.';
          return;
        }

        board.setOrders(res.orders || []);
        feedback.textContent = 'Orders refreshed at ' + new Date().toLocaleTimeString('en-PH', {
          hour: 'numeric',
          minute: '2-digit'
        }) + '.';
      })
      .catch(function () {
        feedback.textContent = 'Could not refresh orders. Check your connection and try again.';
      })
      .finally(function () {
        refreshBtn.disabled = false;
        refreshBtn.textContent = '↻ Refresh orders';
      });
  }

  loginBtn.addEventListener('click', login);
  passcodeInput.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') login();
  });
  refreshBtn.addEventListener('click', refreshOrders);

  logoutBtn.addEventListener('click', function () {
    savedPasscode = '';
    dashboard.classList.add('hidden');
    gate.classList.remove('hidden');
    logoutBtn.classList.add('hidden');
    passcodeInput.value = '';
    gateError.textContent = '';
    feedback.textContent = '';
    document.getElementById('search-box').value = '';
    document.getElementById('status-filter').value = '';
    document.getElementById('design-only-filter').checked = false;
    board.setOrders([]);
  });
});
