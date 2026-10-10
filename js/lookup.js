/*
 * lookup.js
 * Behaviour for lookup.html — the page customers use to check order status.
 */

document.addEventListener('DOMContentLoaded', function () {
  const orderIdInput = document.getElementById('order-id');
  const contactInput = document.getElementById('contact');
  const checkBtn = document.getElementById('check-btn');
  const errorEl = document.getElementById('lookup-error');
  const autofillNotice = document.getElementById('autofill-notice');
  const result = document.getElementById('result');
  const badgeWrap = document.getElementById('badge-wrap');
  const detailGrid = document.getElementById('detail-grid');
  const noteBox = document.getElementById('note-box');
  const noteText = document.getElementById('note-text');
  const copyBtn = document.getElementById('copy-btn');

  let lastOrderId = '';
  let wasAutoFilled = false;

  function detailRow(label, value) {
    return (
      '<div><dt class="label">' + escapeHtml(label) + '</dt>' +
      '<dd>' + escapeHtml(value || '—') + '</dd></div>'
    );
  }

  function runLookup() {
    const orderId = orderIdInput.value.trim();
    const contact = contactInput.value.trim();

    errorEl.textContent = '';
    result.classList.remove('show');

    if (!orderId || !contact) {
      errorEl.textContent = 'Please enter both fields.';
      return;
    }

    checkBtn.disabled = true;
    checkBtn.textContent = 'Checking…';

    // Strip spaces/dashes from phone numbers before sending, but leave
    // email addresses untouched so the dot in "name@site.com" survives.
    const isEmail = contact.indexOf('@') !== -1;
    const contactToSend = isEmail ? contact : contact.replace(/[\s\-().]/g, '');

    callApi('lookupOrder', { orderId: orderId, contact: contactToSend })
      .then(function (res) {
        checkBtn.disabled = false;
        checkBtn.textContent = 'Check Status';

        if (!res || res.status !== 'ok') {
          errorEl.textContent = (res && res.message) || 'Order not found.';
          if (wasAutoFilled && autofillNotice) {
            autofillNotice.textContent = 'Your details were filled in automatically, but the order could not be verified. Check the message above and try again.';
          }
          return;
        }

        const order = res.order;
        lastOrderId = orderId;

        const status = order['Status'] || 'New';
        const badgeClass = status === 'Ongoing' ? 'ongoing' : status === 'Done' ? 'done' : '';
        badgeWrap.innerHTML = '<span class="badge ' + badgeClass + '">' + escapeHtml(status) + '</span>';

        detailGrid.innerHTML =
          detailRow('Item', order['Item Type']) +
          detailRow('Quantity', order['Quantity']) +
          detailRow('Ordered on', formatDate(order['Timestamp'])) +
          detailRow('Needed by', order['Needed By']);

        if (order['Owner Note']) {
          noteBox.classList.remove('hidden');
          noteText.textContent = order['Owner Note'];
        } else {
          noteBox.classList.add('hidden');
        }

        copyBtn.textContent = 'Copy Order ID';
        copyBtn.classList.remove('copied');
        result.classList.add('show');
        if (wasAutoFilled && autofillNotice) {
          autofillNotice.textContent = '✅ Your order details transferred automatically. Your latest status is shown below.';
        }
      })
      .catch(function () {
        checkBtn.disabled = false;
        checkBtn.textContent = 'Check Status';
        errorEl.textContent = 'Could not reach the order system. Check your connection and try again.';
        if (wasAutoFilled && autofillNotice) {
          autofillNotice.textContent = 'Your details were filled in automatically, but the order system could not be reached. Check your connection and press Check Status again.';
        }
      });
  }

  checkBtn.addEventListener('click', runLookup);
  orderIdInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') runLookup(); });
  contactInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') runLookup(); });

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
      const textarea = document.createElement('textarea');
      textarea.value = lastOrderId;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      showCopied();
    }
  });

  // Consume the one-time prefill from sessionStorage; never put contact data in the URL.
  let prefill = null;
  try {
    const rawPrefill = sessionStorage.getItem('jt_lookup_prefill');
    sessionStorage.removeItem('jt_lookup_prefill');
    if (rawPrefill) prefill = JSON.parse(rawPrefill);
  } catch (ignore) {}

  if (prefill && prefill.orderId) orderIdInput.value = prefill.orderId;
  if (prefill && prefill.contact) contactInput.value = prefill.contact;

  if (prefill && prefill.orderId && prefill.contact) {
    wasAutoFilled = true;
    if (autofillNotice) {
      autofillNotice.textContent = 'Your Order ID and contact were copied from your order form. Checking your order now…';
      autofillNotice.classList.remove('hidden');
    }
    setTimeout(runLookup, 300);
  } else if (prefill && prefill.orderId) {
    if (autofillNotice) {
      autofillNotice.textContent = 'Your Order ID was filled in automatically. Enter the phone number or email you used to place the order.';
      autofillNotice.classList.remove('hidden');
    }
  }
});
