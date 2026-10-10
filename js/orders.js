/*
 * orders.js
 * The order list + edit board shared by owner.html and admin.html.
 * Each page creates one OrderBoard instance and tells it which passcode
 * to send with updateOrder calls.
 */

const ORDERS_PER_PAGE = 20;

function getGoogleDriveFile(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:' || url.hostname !== 'drive.google.com') return null;

    const pathMatch = url.pathname.match(/^\/file\/d\/([A-Za-z0-9_-]{10,})(?:\/|$)/);
    let id = pathMatch ? pathMatch[1] : '';
    if (!id && ['/open', '/uc', '/'].indexOf(url.pathname) !== -1) {
      const queryId = url.searchParams.get('id') || '';
      if (/^[A-Za-z0-9_-]{10,}$/.test(queryId)) id = queryId;
    }
    if (!id || !/^[A-Za-z0-9_-]{10,}$/.test(id)) return null;

    return {
      id: id,
      url: 'https://drive.google.com/file/d/' + id + '/view'
    };
  } catch (error) {
    return null;
  }
}

function OrderBoard(options) {
  this.listEl = options.listEl;
  this.pagerEl = options.pagerEl;
  this.countEl = options.countEl;
  this.searchEl = options.searchEl;
  this.statusFilterEl = options.statusFilterEl;
  this.designOnlyEl = options.designOnlyEl || null;
  this.sortNewestFirst = options.sortNewestFirst === true;
  this.showDesignPreview = options.showDesignPreview === true;
  this.onDataChanged = options.onDataChanged || null;
  this.getPasscode = options.getPasscode;

  this.allOrders = [];
  this.filteredOrders = [];
  this.currentPage = 1;

  this.searchEl.addEventListener('input', this.applyFilters.bind(this));
  this.statusFilterEl.addEventListener('change', this.applyFilters.bind(this));
  if (this.designOnlyEl) {
    this.designOnlyEl.addEventListener('change', this.applyFilters.bind(this));
  }
}

OrderBoard.prototype.setOrders = function (orders) {
  this.allOrders = (orders || []).slice();
  if (this.sortNewestFirst) {
    this.allOrders.sort(function (a, b) {
      const aTime = new Date(a['Timestamp'] || 0).getTime();
      const bTime = new Date(b['Timestamp'] || 0).getTime();
      return (isNaN(bTime) ? 0 : bTime) - (isNaN(aTime) ? 0 : aTime);
    });
  }
  this.applyFilters();
  if (this.onDataChanged) this.onDataChanged(this.allOrders);
};

OrderBoard.prototype.applyFilters = function () {
  const query = this.searchEl.value.trim().toLowerCase();
  const status = this.statusFilterEl.value;
  const designOnly = !!(this.designOnlyEl && this.designOnlyEl.checked);

  this.filteredOrders = this.allOrders.filter(function (order) {
    const matchesStatus = !status || order['Status'] === status || (!order['Status'] && status === 'New');
    const matchesQuery = !query || JSON.stringify(order).toLowerCase().indexOf(query) !== -1;
    const hasDesign = !!String(order['Design File'] || '').trim();
    return matchesStatus && matchesQuery && (!designOnly || hasDesign);
  });

  this.currentPage = 1;
  this.render();
};

OrderBoard.prototype.render = function () {
  const total = this.filteredOrders.length;
  const pageCount = Math.max(1, Math.ceil(total / ORDERS_PER_PAGE));
  this.currentPage = Math.min(this.currentPage, pageCount);

  const start = (this.currentPage - 1) * ORDERS_PER_PAGE;
  const pageItems = this.filteredOrders.slice(start, start + ORDERS_PER_PAGE);

  this.countEl.textContent = total + ' order' + (total !== 1 ? 's' : '');

  if (!total) {
    this.listEl.innerHTML = '<div class="empty">No orders found. Try changing the search or filters.</div>';
    this.pagerEl.innerHTML = '';
    return;
  }

  const self = this;
  this.listEl.innerHTML = pageItems
    .map(function (order, i) {
      return self.renderCard(order, start + i);
    })
    .join('');

  this.attachPreviewFallbacks();
  this.renderPager(pageCount);
  this.attachSaveHandlers();
};

OrderBoard.prototype.attachPreviewFallbacks = function () {
  this.listEl.querySelectorAll('img[data-design-preview]').forEach(function (img) {
    function showFallback() {
      img.hidden = true;
      const fallback = img.parentNode && img.parentNode.querySelector('.design-preview-fallback');
      if (fallback) fallback.hidden = false;
    }
    img.addEventListener('error', showFallback, { once: true });
    if (img.complete && img.naturalWidth === 0) showFallback();
  });
};

OrderBoard.prototype.renderCard = function (order, index) {
  const status = order['Status'] || 'New';
  const badgeClass = status === 'Ongoing' ? 'ongoing' : status === 'Done' ? 'done' : '';

  const orderId = order['OrderID'] || order['Order ID'] || '—';
  const fileUrl = order['Design File'] || '';
  let fileHtml = '';

  if (fileUrl && this.showDesignPreview) {
    const driveFile = getGoogleDriveFile(fileUrl);
    if (driveFile) {
      const previewUrl = 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(driveFile.id) + '&sz=w600';
      fileHtml =
        '<div class="order-design">' +
          '<a class="design-preview-link" href="' + escapeHtml(driveFile.url) + '" target="_blank" rel="noopener" aria-label="Open attached design in Google Drive">' +
            '<img class="design-preview" data-design-preview src="' + escapeHtml(previewUrl) + '" alt="Design attachment preview" loading="lazy">' +
            '<span class="design-preview-fallback" hidden>Preview unavailable<br>Open in Drive</span>' +
          '</a>' +
          '<div class="design-file-info">' +
            '<span class="label">Customer design</span>' +
            '<strong>Design attached</strong>' +
            '<p>Select the preview to view or download the original file.</p>' +
            '<a class="file-link" href="' + escapeHtml(driveFile.url) + '" target="_blank" rel="noopener">↗ Open design</a>' +
          '</div>' +
        '</div>';
    } else {
      fileHtml =
        '<div class="order-design order-design-unavailable">' +
          '<span class="label">Customer design</span>' +
          '<span>Attachment found, but its Google Drive link could not be recognized.</span>' +
        '</div>';
    }
  } else if (fileUrl) {
    fileHtml =
      '<div class="order-file">' +
        '<span class="label">Design File</span>' +
        '<a class="file-link" href="' + escapeHtml(fileUrl) + '" target="_blank" rel="noopener">' +
          '📎 View / Download' +
        '</a>' +
      '</div>';
  } else if (this.showDesignPreview) {
    fileHtml =
      '<div class="order-design-missing">' +
        '<span aria-hidden="true">📎</span>' +
        '<div><strong>No design attached</strong><br>There is no file on this order yet.</div>' +
      '</div>';
  }

  const sizes = order['Sizes'] || '';
  const details = order['Design Details'] || '';
  const budget = order['Budget Range'] || '';

  const extraHtml =
    (sizes || details || budget)
      ? '<div class="order-extra">' +
          (sizes ? '<div><span class="label">Sizes</span>' + escapeHtml(sizes) + '</div>' : '') +
          (details ? '<div><span class="label">Details</span>' + escapeHtml(details) + '</div>' : '') +
          (budget ? '<div><span class="label">Budget</span>' + escapeHtml(budget) + '</div>' : '') +
        '</div>'
      : '';

  return (
    '<div class="order">' +
      '<div class="order-head">' +
        '<span class="order-id">' + escapeHtml(orderId) + '</span>' +
        '<span class="badge ' + badgeClass + '">' + escapeHtml(status) + '</span>' +
        '<span class="order-time">' + formatDate(order['Timestamp']) + '</span>' +
      '</div>' +
      fileHtml +
      '<div class="order-info">' +
        '<div><span class="label">Name</span>' + escapeHtml(order['Name'] || '—') + '</div>' +
        '<div><span class="label">Contact</span>' + escapeHtml(order['Contact'] || '—') + '</div>' +
        '<div><span class="label">Item</span>' + escapeHtml(order['Item Type'] || '—') + '</div>' +
        '<div><span class="label">Qty</span>' + escapeHtml(order['Quantity'] || '—') + '</div>' +
        '<div><span class="label">Needed by</span>' + escapeHtml(order['Needed By'] || '—') + '</div>' +
      '</div>' +
      extraHtml +
      '<div class="order-edit">' +
        '<div class="field">' +
          '<label>Status</label>' +
          '<select class="status-select" data-idx="' + index + '">' +
            '<option' + (status === 'New' ? ' selected' : '') + '>New</option>' +
            '<option' + (status === 'Ongoing' ? ' selected' : '') + '>Ongoing</option>' +
            '<option' + (status === 'Done' ? ' selected' : '') + '>Done</option>' +
          '</select>' +
        '</div>' +
        '<div class="field">' +
          '<label>Note to customer</label>' +
          '<textarea class="note-input" data-idx="' + index + '" placeholder="Leave a note visible to the customer…">' +
            escapeHtml(order['Owner Note'] || '') +
          '</textarea>' +
        '</div>' +
        '<div class="order-actions">' +
          '<button class="btn-save" data-idx="' + index + '">Save</button>' +
        '</div>' +
      '</div>' +
    '</div>'
  );
};

OrderBoard.prototype.attachSaveHandlers = function () {
  const self = this;
  this.listEl.querySelectorAll('.btn-save').forEach(function (button) {
    button.addEventListener('click', function () {
      self.saveOrder(button);
    });
  });
};

OrderBoard.prototype.saveOrder = function (button) {
  if (button.disabled) return;

  const self = this;
  const index = parseInt(button.dataset.idx, 10);
  const card = button.closest('.order');
  const newStatus = card.querySelector('.status-select').value;
  const note = card.querySelector('.note-input').value.trim();
  const order = this.filteredOrders[index];
  const orderId = order['OrderID'] || order['Order ID'];
  const contact = order['Contact'] || '';
  const contactIsEmail = contact.indexOf('@') !== -1;
  const wasAlreadyDone = order['Status'] === 'Done';
  const isNowDone = newStatus === 'Done';

  button.disabled = true;
  button.textContent = 'Saving…';

  callApi('updateOrder', { passcode: this.getPasscode(), orderId: orderId, status: newStatus, note: note })
    .then(function (res) {
      button.disabled = false;

      if (!res || res.status !== 'ok') {
        button.textContent = 'Save';
        alert((res && res.message) || 'Save failed.');
        return;
      }

      order['Status'] = newStatus;
      order['Owner Note'] = note;

      const original = self.allOrders.find(function (o) {
        return (o['OrderID'] || o['Order ID']) === orderId;
      });
      if (original) {
        original['Status'] = newStatus;
        original['Owner Note'] = note;
      }
      if (self.onDataChanged) self.onDataChanged(self.allOrders);

      button.textContent = '✓ Saved';
      button.classList.add('saved');

      if (isNowDone && !wasAlreadyDone) {
        self.showNotifyTag(card, contactIsEmail, !!contact);
      }

      setTimeout(function () {
        button.textContent = 'Save';
        button.classList.remove('saved');
      }, 2000);
    })
    .catch(function () {
      button.disabled = false;
      button.textContent = 'Save';
      alert('Connection error. Try again.');
    });
};

OrderBoard.prototype.showNotifyTag = function (card, isEmail, hasContact) {
  const actionsRow = card.querySelector('.order-actions');
  if (!actionsRow) return;
  const existing = actionsRow.querySelector('.notice-tag');
  if (existing) existing.remove();

  if (!hasContact) return;

  const tag = document.createElement('span');
  tag.className = 'notice-tag ' + (isEmail ? 'email' : 'sms');
  tag.textContent = isEmail ? '📧 Email notification attempted' : '📱 SMS notification attempted';
  actionsRow.insertBefore(tag, actionsRow.firstChild);

  setTimeout(function () {
    if (tag.parentNode) tag.parentNode.removeChild(tag);
  }, 6000);
};

OrderBoard.prototype.renderPager = function (pageCount) {
  if (pageCount <= 1) {
    this.pagerEl.innerHTML = '';
    return;
  }

  const current = this.currentPage;
  let html = '<button' + (current === 1 ? ' disabled' : '') + ' data-page="' + (current - 1) + '">‹ Prev</button>';

  for (let page = 1; page <= pageCount; page++) {
    const farFromCurrent = pageCount > 7 && page > 2 && page < pageCount - 1 && Math.abs(page - current) > 1;
    if (farFromCurrent) {
      if (page === 3 || page === pageCount - 2) html += '<span>…</span>';
      continue;
    }
    html += '<button class="' + (page === current ? 'active' : '') + '" data-page="' + page + '">' + page + '</button>';
  }

  html += '<button' + (current === pageCount ? ' disabled' : '') + ' data-page="' + (current + 1) + '">Next ›</button>';
  this.pagerEl.innerHTML = html;

  const self = this;
  this.pagerEl.querySelectorAll('button[data-page]').forEach(function (button) {
    button.addEventListener('click', function () {
      self.currentPage = parseInt(button.dataset.page, 10);
      self.render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
};
