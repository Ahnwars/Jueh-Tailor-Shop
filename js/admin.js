/*
 * admin.js — server-verified owner/admin login, order board, site toggle.
 * No credentials are hardcoded in this public JavaScript or persisted.
 */
document.addEventListener('DOMContentLoaded', function () {
  const gate = document.getElementById('gate');
  const dashboard = document.getElementById('dashboard');
  const gateError = document.getElementById('gate-error');
  const logoutBtn = document.getElementById('logout-btn');
  const siteControl = document.getElementById('site-control');
  let isAdmin = false, apiPasscode = '', siteOpen = true, toggling = false;

  const board = new OrderBoard({
    listEl: document.getElementById('order-list'),
    pagerEl: document.getElementById('pager'),
    countEl: document.getElementById('order-count'),
    searchEl: document.getElementById('search-box'),
    statusFilterEl: document.getElementById('status-filter'),
    getPasscode: function () { return apiPasscode; }
  });

  setupTabs(); setupLogins(); setupSiteToggle(); setupLogout();

  function setupTabs() {
    document.querySelectorAll('.tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        document.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('active'); });
        document.querySelectorAll('.tab-pane').forEach(function (p) { p.classList.remove('active'); });
        tab.classList.add('active');
        document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
        gateError.textContent = '';
      });
    });
  }

  function setupLogins() {
    const ownerInput = document.getElementById('owner-passcode');
    const ownerBtn = document.getElementById('owner-login-btn');
    const adminInput = document.getElementById('admin-passcode');
    const adminBtn = document.getElementById('admin-login-btn');
    ownerBtn.addEventListener('click', function () { login('owner', ownerInput.value.trim(), ownerBtn); });
    adminBtn.addEventListener('click', function () { login('admin', adminInput.value.trim(), adminBtn); });
    ownerInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') ownerBtn.click(); });
    adminInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') adminBtn.click(); });
  }

  function login(role, passcode, button) {
    if (!passcode) { gateError.textContent = 'Enter your passcode.'; return; }
    const originalLabel = role === 'admin' ? 'Enter as Admin' : 'Enter as Owner';
    button.disabled = true; button.textContent = 'Checking…';
    callApi('getOrders', { passcode: passcode }).then(function (res) {
      button.disabled = false; button.textContent = originalLabel;
      if (!res || res.status !== 'ok') {
        gateError.textContent = (res && res.message) || 'Wrong passcode.';
        return;
      }
      isAdmin = role === 'admin';
      apiPasscode = passcode;
      enterDashboard(res.orders || []);
    }).catch(function () {
      button.disabled = false; button.textContent = originalLabel;
      gateError.textContent = 'Connection error. Try again.';
    });
  }

  function enterDashboard(orders) {
    gate.classList.add('hidden'); dashboard.classList.remove('hidden');
    logoutBtn.classList.remove('hidden');
    if (isAdmin) { siteControl.classList.remove('hidden'); loadSiteStatus(); }
    else siteControl.classList.add('hidden');
    board.setOrders(orders);
  }

  function setupSiteToggle() {
    const toggle = document.getElementById('site-toggle');
    toggle.addEventListener('change', function () {
      if (toggling) { toggle.checked = siteOpen; return; }
      const wantsOpen = toggle.checked;
      if (!window.confirm(wantsOpen ? 'Open the site to orders?' : 'Close the site? Customers will see a "closed" message.')) {
        toggle.checked = siteOpen; return;
      }
      toggling = true;
      document.getElementById('site-status-desc').textContent = 'Updating…';
      callApi('setSiteStatus', { passcode: apiPasscode, open: wantsOpen }).then(function (res) {
        toggling = false;
        if (res && res.status === 'ok') { siteOpen = wantsOpen; updateToggleUI(); }
        else {
          toggle.checked = siteOpen;
          document.getElementById('site-status-desc').textContent = (res && res.message) || 'Update failed.';
        }
      }).catch(function () {
        toggling = false; toggle.checked = siteOpen;
        document.getElementById('site-status-desc').textContent = 'Connection error.';
      });
    });
  }

  function loadSiteStatus() {
    document.getElementById('site-status-desc').textContent = 'Loading…';
    callApi('getSiteStatus', {}).then(function (res) {
      if (res && res.status === 'ok') {
        siteOpen = res.open !== false; updateToggleUI();
      } else document.getElementById('site-status-desc').textContent = 'Could not load status.';
    }).catch(function () {
      document.getElementById('site-status-desc').textContent = 'Could not load status.';
    });
  }

  function updateToggleUI() {
    document.getElementById('site-toggle').checked = siteOpen;
    document.getElementById('toggle-label').textContent = siteOpen ? 'Open' : 'Closed';
    document.getElementById('site-status-desc').textContent = siteOpen
      ? 'Accepting new orders.' : 'Orders are paused — customers see a closed banner.';
  }

  function setupLogout() {
    logoutBtn.addEventListener('click', function () {
      isAdmin = false; apiPasscode = '';
      dashboard.classList.add('hidden'); gate.classList.remove('hidden');
      logoutBtn.classList.add('hidden'); siteControl.classList.add('hidden');
      document.getElementById('owner-passcode').value = '';
      document.getElementById('admin-passcode').value = '';
      gateError.textContent = '';
    });
  }
});
