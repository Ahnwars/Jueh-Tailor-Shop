/*
 * admin.js
 * Behaviour for admin.html — two-tab passcode gate (owner vs. admin),
 * the open/closed site toggle, and the OrderBoard.
 *
 * The Apps Script backend has two separate passcodes: OWNER_PASSCODE for
 * reading/updating orders, and ADMIN_PASSCODE for the site on/off switch.
 * An admin logs in with the admin passcode here, but order calls still go
 * out with the owner passcode, since that's what the backend expects.
 */

const OWNER_PASSCODE = 'OWNER';
const ADMIN_PASSCODE = 'ADMIN';

document.addEventListener('DOMContentLoaded', function () {
  const gate = document.getElementById('gate');
  const dashboard = document.getElementById('dashboard');
  const gateError = document.getElementById('gate-error');
  const logoutBtn = document.getElementById('logout-btn');
  const siteControl = document.getElementById('site-control');

  let isAdmin = false;
  let apiPasscode = ''; // passcode sent with getOrders / updateOrder
  let siteOpen = true;
  let toggling = false;

  const board = new OrderBoard({
    listEl: document.getElementById('order-list'),
    pagerEl: document.getElementById('pager'),
    countEl: document.getElementById('order-count'),
    searchEl: document.getElementById('search-box'),
    statusFilterEl: document.getElementById('status-filter'),
    getPasscode: function () { return apiPasscode; }
  });

  setupTabs();
  setupLogins();
  setupSiteToggle();
  setupLogout();
  restoreSession();

  /* ---------- Tabs ---------- */

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

  /* ---------- Login ---------- */

  function setupLogins() {
    const ownerInput = document.getElementById('owner-passcode');
    const ownerBtn = document.getElementById('owner-login-btn');
    const adminInput = document.getElementById('admin-passcode');
    const adminBtn = document.getElementById('admin-login-btn');

    ownerBtn.addEventListener('click', function () {
      loginAsOwner(ownerInput.value.trim(), ownerBtn);
    });
    adminBtn.addEventListener('click', function () {
      loginAsAdmin(adminInput.value.trim(), adminBtn);
    });

    ownerInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') ownerBtn.click(); });
    adminInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') adminBtn.click(); });
  }

  function loginAsOwner(passcode, button) {
    if (!passcode) {
      gateError.textContent = 'Enter your passcode.';
      return;
    }

    button.disabled = true;
    button.textContent = 'Checking…';

    callApi('getOrders', { passcode: passcode })
      .then(function (res) {
        button.disabled = false;
        button.textContent = 'Enter as Owner';

        if (res.status !== 'ok') {
          gateError.textContent = res.message || 'Wrong passcode.';
          return;
        }

        isAdmin = false;
        apiPasscode = passcode;
        sessionStorage.setItem('adminGatePasscode', passcode);
        sessionStorage.setItem('adminGateRole', '0');
        enterDashboard(res.orders || []);
      })
      .catch(function () {
        button.disabled = false;
        button.textContent = 'Enter as Owner';
        gateError.textContent = 'Connection error. Try again.';
      });
  }

  function loginAsAdmin(passcode, button) {
    if (!passcode) {
      gateError.textContent = 'Enter your passcode.';
      return;
    }
    if (passcode !== ADMIN_PASSCODE) {
      gateError.textContent = 'Invalid passcode.';
      return;
    }

    button.disabled = true;
    button.textContent = 'Checking…';

    // The admin passcode is only checked locally; orders are still fetched
    // with the owner passcode because that's what the backend accepts.
    callApi('getOrders', { passcode: OWNER_PASSCODE })
      .then(function (res) {
        button.disabled = false;
        button.textContent = 'Enter as Admin';

        if (res.status !== 'ok') {
          gateError.textContent = res.message || 'Could not load orders.';
          return;
        }

        isAdmin = true;
        apiPasscode = OWNER_PASSCODE;
        sessionStorage.setItem('adminGatePasscode', ADMIN_PASSCODE);
        sessionStorage.setItem('adminGateRole', '1');
        enterDashboard(res.orders || []);
      })
      .catch(function () {
        button.disabled = false;
        button.textContent = 'Enter as Admin';
        gateError.textContent = 'Connection error. Try again.';
      });
  }

  function enterDashboard(orders) {
    gate.classList.add('hidden');
    dashboard.classList.remove('hidden');
    logoutBtn.classList.remove('hidden');

    if (isAdmin) {
      siteControl.classList.remove('hidden');
      loadSiteStatus();
    }

    board.setOrders(orders);
  }

  /* ---------- Site open/closed toggle ---------- */

  function setupSiteToggle() {
    const toggle = document.getElementById('site-toggle');
    toggle.addEventListener('change', function () {
      if (toggling) {
        toggle.checked = siteOpen;
        return;
      }

      const wantsOpen = toggle.checked;
      const confirmed = window.confirm(
        wantsOpen ? 'Open the site to orders?' : 'Close the site? Customers will see a "closed" message.'
      );
      if (!confirmed) {
        toggle.checked = siteOpen;
        return;
      }

      toggling = true;
      document.getElementById('site-status-desc').textContent = 'Updating…';

      callApi('setSiteStatus', { passcode: ADMIN_PASSCODE, open: wantsOpen ? 'true' : 'false' })
        .then(function (res) {
          toggling = false;
          if (res && res.status === 'ok') {
            siteOpen = wantsOpen;
            updateToggleUI();
          } else {
            toggle.checked = siteOpen;
            document.getElementById('site-status-desc').textContent = 'Update failed.';
          }
        })
        .catch(function () {
          toggling = false;
          toggle.checked = siteOpen;
          document.getElementById('site-status-desc').textContent = 'Connection error.';
        });
    });
  }

  function loadSiteStatus() {
    document.getElementById('site-status-desc').textContent = 'Loading…';
    callApi('getSiteStatus', {})
      .then(function (res) {
        if (res && res.status === 'ok') {
          siteOpen = res.open !== false;
          updateToggleUI();
        }
      })
      .catch(function () {
        document.getElementById('site-status-desc').textContent = 'Could not load status.';
      });
  }

  function updateToggleUI() {
    document.getElementById('site-toggle').checked = siteOpen;
    document.getElementById('toggle-label').textContent = siteOpen ? 'Open' : 'Closed';
    document.getElementById('site-status-desc').textContent = siteOpen
      ? 'Accepting new orders.'
      : 'Orders are paused — customers see a closed banner.';
  }

  /* ---------- Logout + session restore ---------- */

  function setupLogout() {
    logoutBtn.addEventListener('click', function () {
      sessionStorage.removeItem('adminGatePasscode');
      sessionStorage.removeItem('adminGateRole');
      isAdmin = false;
      apiPasscode = '';
      dashboard.classList.add('hidden');
      gate.classList.remove('hidden');
      logoutBtn.classList.add('hidden');
      document.getElementById('owner-passcode').value = '';
      document.getElementById('admin-passcode').value = '';
      gateError.textContent = '';
    });
  }

  function restoreSession() {
    const storedPasscode = sessionStorage.getItem('adminGatePasscode');
    const storedRole = sessionStorage.getItem('adminGateRole');
    if (!storedPasscode) return;

    isAdmin = storedRole === '1';
    apiPasscode = isAdmin ? OWNER_PASSCODE : storedPasscode;

    callApi('getOrders', { passcode: apiPasscode })
      .then(function (res) {
        if (res.status === 'ok') enterDashboard(res.orders || []);
      })
      .catch(function () {});
  }
});
