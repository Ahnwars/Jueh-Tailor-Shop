/*
 * owner.js
 * Behaviour for owner.html — passcode gate, then hands off to OrderBoard.
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
    gate.classList.add('hidden');
    dashboard.classList.remove('hidden');
    logoutBtn.classList.remove('hidden');
    board.setOrders(orders);
  }

  function login() {
    const passcode = passcodeInput.value.trim();
    if (!passcode) {
      gateError.textContent = 'Enter your passcode.';
      return;
    }

    loginBtn.disabled = true;
    loginBtn.textContent = 'Checking…';

    callApi('getOrders', { passcode: passcode })
      .then(function (res) {
        loginBtn.disabled = false;
        loginBtn.textContent = 'Enter';

        if (res.status !== 'ok') {
          gateError.textContent = res.message || 'Wrong passcode.';
          return;
        }

        savedPasscode = passcode;
        sessionStorage.setItem('ownerPasscode', passcode);
        showDashboard(res.orders || []);
      })
      .catch(function () {
        loginBtn.disabled = false;
        loginBtn.textContent = 'Enter';
        gateError.textContent = 'Connection error. Try again.';
      });
  }

  loginBtn.addEventListener('click', login);
  passcodeInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') login();
  });

  logoutBtn.addEventListener('click', function () {
    sessionStorage.removeItem('ownerPasscode');
    savedPasscode = '';
    dashboard.classList.add('hidden');
    gate.classList.remove('hidden');
    logoutBtn.classList.add('hidden');
    passcodeInput.value = '';
    gateError.textContent = '';
  });

  // Stay logged in across refreshes within the same tab session.
  const stored = sessionStorage.getItem('ownerPasscode');
  if (stored) {
    savedPasscode = stored;
    loginBtn.disabled = true;
    callApi('getOrders', { passcode: stored })
      .then(function (res) {
        loginBtn.disabled = false;
        if (res.status === 'ok') showDashboard(res.orders || []);
      })
      .catch(function () {
        loginBtn.disabled = false;
      });
  }
});
