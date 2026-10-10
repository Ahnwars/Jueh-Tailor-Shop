/*
 * owner.js — server-verified owner login.
 * Passcode remains in memory only; refresh requires signing in again.
 */
document.addEventListener('DOMContentLoaded', function () {
  const gate = document.getElementById('gate');
  const dashboard = document.getElementById('dashboard');
  const passcodeInput = document.getElementById('passcode');
  const loginBtn = document.getElementById('login-btn');
  const gateError = document.getElementById('gate-error');
  const logoutBtn = document.getElementById('logout-btn');
  let savedPasscode = '';

  const board = new OrderBoard({
    listEl: document.getElementById('order-list'),
    pagerEl: document.getElementById('pager'),
    countEl: document.getElementById('order-count'),
    searchEl: document.getElementById('search-box'),
    statusFilterEl: document.getElementById('status-filter'),
    getPasscode: function () { return savedPasscode; }
  });

  function showDashboard(orders) {
    gate.classList.add('hidden'); dashboard.classList.remove('hidden');
    logoutBtn.classList.remove('hidden'); board.setOrders(orders);
  }
  function login() {
    const passcode = passcodeInput.value.trim();
    if (!passcode) { gateError.textContent = 'Enter your passcode.'; return; }
    loginBtn.disabled = true; loginBtn.textContent = 'Checking…';
    callApi('getOrders', { passcode: passcode }).then(function (res) {
      loginBtn.disabled = false; loginBtn.textContent = 'Enter';
      if (!res || res.status !== 'ok') {
        gateError.textContent = (res && res.message) || 'Wrong passcode.'; return;
      }
      savedPasscode = passcode; showDashboard(res.orders || []);
    }).catch(function () {
      loginBtn.disabled = false; loginBtn.textContent = 'Enter';
      gateError.textContent = 'Connection error. Try again.';
    });
  }
  loginBtn.addEventListener('click', login);
  passcodeInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') login(); });
  logoutBtn.addEventListener('click', function () {
    savedPasscode = '';
    dashboard.classList.add('hidden'); gate.classList.remove('hidden');
    logoutBtn.classList.add('hidden'); passcodeInput.value = ''; gateError.textContent = '';
  });
});
