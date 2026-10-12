/*
 * lookup.js
 * Behaviour for lookup.html — order status check + Order ID recovery.
 */

document.addEventListener('DOMContentLoaded', function () {
  var orderIdInput = document.getElementById('order-id');
  var contactInput = document.getElementById('contact');
  var checkBtn     = document.getElementById('check-btn');
  var errorEl      = document.getElementById('lookup-error');
  var result       = document.getElementById('result');
  var badgeWrap    = document.getElementById('badge-wrap');
  var detailGrid   = document.getElementById('detail-grid');
  var noteBox      = document.getElementById('note-box');
  var noteText     = document.getElementById('note-text');
  var copyBtn      = document.getElementById('copy-btn');

  var forgotToggle  = document.getElementById('forgot-toggle');
  var recoverCard   = document.getElementById('recover-card');
  var recoverName   = document.getElementById('recover-name');
  var recoverContact = document.getElementById('recover-contact');
  var recoverBtn    = document.getElementById('recover-btn');
  var recoverError  = document.getElementById('recover-error');
  var recoverResults = document.getElementById('recover-results');

  var lastOrderId = '';

  /* ── helpers ── */

  function detailRow(label, value) {
    return '<div><dt class="label">' + escapeHtml(label) + '</dt>' +
           '<dd>' + escapeHtml(value || '—') + '</dd></div>';
  }

  /* ── main lookup ── */

  function runLookup() {
    var orderId = orderIdInput.value.trim();
    var contact = contactInput.value.trim();

    errorEl.textContent = '';
    result.classList.remove('show');

    if (!orderId || !contact) {
      errorEl.textContent = 'Please enter both fields.';
      return;
    }

    checkBtn.disabled = true;
    checkBtn.textContent = 'Checking…';

    var isEmail = contact.indexOf('@') !== -1;
    var contactToSend = isEmail ? contact : contact.replace(/[\s\-().]/g, '');

    callApi('lookupOrder', { orderId: orderId, contact: contactToSend })
      .then(function (res) {
        checkBtn.disabled = false;
        checkBtn.textContent = 'Check Status';

        if (!res || res.status !== 'ok') {
          errorEl.textContent = (res && res.message) || 'Order not found.';
          return;
        }

        var order = res.order;
        lastOrderId = orderId;

        var status = order['Status'] || 'New';
        var badgeClass = status === 'Ongoing' ? 'ongoing' : status === 'Done' ? 'done' : '';
        badgeWrap.innerHTML = '<span class="badge ' + badgeClass + '">' + escapeHtml(status) + '</span>';

        detailGrid.innerHTML =
          detailRow('Item',       order['Item Type']) +
          detailRow('Quantity',   String(order['Quantity'] || '—')) +
          detailRow('Ordered on', formatDate(order['Timestamp'])) +
          detailRow('Needed by',  order['Needed By']);

        if (order['Owner Note']) {
          noteBox.classList.remove('hidden');
          noteText.textContent = order['Owner Note'];
        } else {
          noteBox.classList.add('hidden');
        }

        copyBtn.textContent = 'Copy Order ID';
        copyBtn.classList.remove('copied');
        result.classList.add('show');
      })
      .catch(function () {
        checkBtn.disabled = false;
        checkBtn.textContent = 'Check Status';
        errorEl.textContent = 'Could not reach the order system. Check your connection and try again.';
      });
  }

  checkBtn.addEventListener('click', runLookup);
  orderIdInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') runLookup(); });
  contactInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') runLookup(); });

  /* ── copy button ── */

  copyBtn.addEventListener('click', function () {
    if (!lastOrderId) return;

    function showCopied() {
      copyBtn.textContent = '✓ Copied!';
      copyBtn.classList.add('copied');
      setTimeout(function () {
        copyBtn.textContent = 'Copy Order ID';
        copyBtn.classList.remove('copied');
      }, 2000);
    }

    if (navigator.clipboard) {
      navigator.clipboard.writeText(lastOrderId).then(showCopied).catch(fallbackCopy);
    } else {
      fallbackCopy();
    }

    function fallbackCopy() {
      var textarea = document.createElement('textarea');
      textarea.value = lastOrderId;
      textarea.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      showCopied();
    }
  });

  /* ── forgot Order ID toggle ── */

  forgotToggle.addEventListener('click', function () {
    var hidden = recoverCard.classList.toggle('hidden');
    forgotToggle.textContent = hidden ? 'Forgot your Order ID?' : 'Hide recovery form';
    if (!hidden) recoverName.focus();
  });

  /* ── Order ID recovery ── */

  recoverBtn.addEventListener('click', function () {
    var name    = recoverName.value.trim();
    var contact = recoverContact.value.trim();

    recoverError.textContent = '';
    recoverResults.classList.add('hidden');
    recoverResults.innerHTML = '';

    var nameErr    = document.getElementById('recover-name-error');
    var contactErr = document.getElementById('recover-contact-error');
    if (nameErr)    nameErr.textContent = '';
    if (contactErr) contactErr.textContent = '';

    var valid = true;
    if (!name)    { if (nameErr)    nameErr.textContent    = 'Required.'; valid = false; }
    if (!contact) { if (contactErr) contactErr.textContent = 'Required.'; valid = false; }
    if (!valid) return;

    recoverBtn.disabled = true;
    recoverBtn.textContent = 'Searching…';

    var isEmail = contact.indexOf('@') !== -1;
    var contactToSend = isEmail ? contact : contact.replace(/[\s\-().]/g, '');

    callApi('recoverOrderId', { name: name, contact: contactToSend })
      .then(function (res) {
        recoverBtn.disabled = false;
        recoverBtn.textContent = 'Find My Orders';

        if (!res || res.status !== 'ok') {
          recoverError.textContent = (res && res.message) || 'No orders found.';
          return;
        }

        var orders = res.orders || [];
        if (!orders.length) {
          recoverError.textContent = 'No orders found for that name and contact.';
          return;
        }

        var html = '<p class="recover-hint">Click an order to fill in the form above:</p>';
        orders.forEach(function (o) {
          var statusClass = o.status === 'Ongoing' ? 'ongoing' : o.status === 'Done' ? 'done' : '';
          html +=
            '<div class="recover-row" data-id="' + escapeHtml(o.orderId) + '">' +
              '<span class="recover-id">'   + escapeHtml(o.orderId)  + '</span>' +
              '<span class="recover-item">' + escapeHtml(o.itemType) + '</span>' +
              '<span class="recover-date">' + escapeHtml(formatDate(o.timestamp)) + '</span>' +
              '<span class="badge ' + statusClass + '">' + escapeHtml(o.status) + '</span>' +
            '</div>';
        });

        recoverResults.innerHTML = html;
        recoverResults.classList.remove('hidden');

        recoverResults.querySelectorAll('.recover-row').forEach(function (row) {
          row.addEventListener('click', function () {
            orderIdInput.value = row.dataset.id;
            contactInput.value = contact;
            recoverCard.classList.add('hidden');
            forgotToggle.textContent = 'Forgot your Order ID?';
            window.scrollTo({ top: 0, behavior: 'smooth' });
            setTimeout(runLookup, 200);
          });
        });
      })
      .catch(function () {
        recoverBtn.disabled = false;
        recoverBtn.textContent = 'Find My Orders';
        recoverError.textContent = 'Connection error. Try again.';
      });
  });

  recoverName.addEventListener('keydown',    function (e) { if (e.key === 'Enter') recoverBtn.click(); });
  recoverContact.addEventListener('keydown', function (e) { if (e.key === 'Enter') recoverBtn.click(); });

  /* ── auto-fill from URL params (redirect after order) ── */

  var params           = new URLSearchParams(window.location.search);
  var prefilledId      = params.get('orderId');
  var prefilledContact = params.get('contact');

  if (prefilledId)      orderIdInput.value = prefilledId;
  if (prefilledContact) contactInput.value = prefilledContact;
  if (prefilledId && prefilledContact) setTimeout(runLookup, 300);
});
