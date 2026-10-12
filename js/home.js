/*
 * home.js
 * Behaviour for index.html: the consent popup, sticky header, mobile menu,
 * dark mode toggle, animated counters, FAQ accordion, and the order form.
 */

document.addEventListener('DOMContentLoaded', function () {
  setupConsent();
  setupHeader();
  setupTheme();
  setupScrollReveal();
  setupCounters();
  setupFaq();
  setupOrderForm();
});

/* ---------- Consent popup ---------- */

function setupConsent() {
  if (localStorage.getItem('jt_consent') === '1') return;

  const overlay = document.getElementById('consent');
  const checkbox = document.getElementById('consent-checkbox');
  const agreeBtn = document.getElementById('consent-agree');
  const leaveBtn = document.getElementById('consent-leave');

  overlay.classList.add('open');

  checkbox.addEventListener('change', function () {
    agreeBtn.disabled = !checkbox.checked;
  });

  agreeBtn.addEventListener('click', function () {
    localStorage.setItem('jt_consent', '1');
    overlay.classList.remove('open');
  });

  leaveBtn.addEventListener('click', function () {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = 'about:blank';
    }
  });
}

/* ---------- Header: scroll shadow + mobile menu ---------- */

function setupHeader() {
  const header = document.getElementById('site-header');
  const menuBtn = document.getElementById('menu-btn');

  window.addEventListener(
    'scroll',
    function () {
      header.classList.toggle('scrolled', window.scrollY > 20);
    },
    { passive: true }
  );

  menuBtn.addEventListener('click', function () {
    const open = header.classList.toggle('menu-open');
    menuBtn.textContent = open ? '✕' : '☰';
    menuBtn.setAttribute('aria-expanded', open);
  });

  document.addEventListener('click', function (event) {
    if (header.classList.contains('menu-open') && !header.contains(event.target)) {
      closeMenu();
    }
  });

  document.querySelectorAll('.nav-links a').forEach(function (link) {
    link.addEventListener('click', closeMenu);
  });

  function closeMenu() {
    header.classList.remove('menu-open');
    menuBtn.textContent = '☰';
    menuBtn.setAttribute('aria-expanded', 'false');
  }
}

/* ---------- Dark mode ---------- */

function setupTheme() {
  const toggleBtn = document.getElementById('theme-btn');
  const root = document.documentElement;

  const saved = localStorage.getItem('jt_theme');
  if (saved) {
    root.dataset.theme = saved;
    toggleBtn.textContent = saved === 'dark' ? '☀' : '🌙';
  }

  toggleBtn.addEventListener('click', function () {
    const goingDark = root.dataset.theme !== 'dark';
    root.dataset.theme = goingDark ? 'dark' : 'light';
    toggleBtn.textContent = goingDark ? '☀' : '🌙';
    localStorage.setItem('jt_theme', root.dataset.theme);
  });
}

/* ---------- Fade-in-on-scroll ---------- */

function setupScrollReveal() {
  const items = document.querySelectorAll('.reveal');
  const observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
  );

  items.forEach(function (item) {
    observer.observe(item);
  });
}

/* ---------- Animated stat counters ---------- */

function setupCounters() {
  const counters = document.querySelectorAll('[data-count-to]');
  const observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        animateCounter(entry.target);
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.6 }
  );

  counters.forEach(function (el) {
    observer.observe(el);
  });
}

function animateCounter(el) {
  const target = Number(el.dataset.countTo);
  const duration = 1300;
  let start = null;

  function step(timestamp) {
    if (start === null) start = timestamp;
    const progress = Math.min((timestamp - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(eased * target) + '+';
    if (progress < 1) requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
}

/* ---------- FAQ accordion ---------- */

function setupFaq() {
  document.querySelectorAll('.faq-question').forEach(function (button) {
    button.addEventListener('click', function () {
      const item = button.closest('.faq-item');
      const answer = item.querySelector('.faq-answer');
      const wasOpen = item.classList.contains('open');

      document.querySelectorAll('.faq-item.open').forEach(function (openItem) {
        openItem.classList.remove('open');
        openItem.querySelector('.faq-answer').style.maxHeight = '';
        openItem.querySelector('.faq-question').setAttribute('aria-expanded', 'false');
      });

      if (!wasOpen) {
        item.classList.add('open');
        answer.style.maxHeight = answer.scrollHeight + 'px';
        button.setAttribute('aria-expanded', 'true');
      }
    });
  });
}

/* ---------- File drop zone ---------- */

function setupFileDrop() {
  const dropZone  = document.getElementById('file-drop');
  const fileInput = document.getElementById('design-file');
  const dropUi    = document.getElementById('file-drop-ui');
  const chosen    = document.getElementById('file-chosen');
  const chosenName = document.getElementById('file-chosen-name');
  const removeBtn = document.getElementById('file-remove');

  if (!dropZone) return;

  // Drag-over highlight
  dropZone.addEventListener('dragover', function (e) {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });

  ['dragleave', 'drop'].forEach(function (evt) {
    dropZone.addEventListener(evt, function () {
      dropZone.classList.remove('dragover');
    });
  });

  fileInput.addEventListener('change', function () {
    showChosen(fileInput.files[0] || null);
  });

  removeBtn.addEventListener('click', function (e) {
    e.stopPropagation(); // don't reopen the file picker
    fileInput.value = '';
    showChosen(null);
  });

  function showChosen(file) {
    if (file) {
      chosenName.textContent = file.name;
      chosen.classList.remove('hidden');
      dropUi.style.display = 'none';
    } else {
      chosen.classList.add('hidden');
      dropUi.style.display = '';
    }
  }
}

/*
 * uploadDesignFile — sends the file to Apps Script via a hidden <form> POST
 * targeting a hidden <iframe>. This sidesteps the CORS restriction on
 * cross-origin XHR/fetch while still delivering the data server-side.
 * Because we cannot read the iframe's response, this is fire-and-forget:
 * the order is already saved; Apps Script will attach the Drive link to it.
 */
function uploadDesignFile(file, orderId) {
  return new Promise(function (resolve) {
    var reader = new FileReader();

    reader.onload = function (evt) {
      // Strip the data:mime;base64, prefix — keep only the raw base64
      var base64Data = evt.target.result.split(',')[1];

      // Unique iframe name so concurrent uploads don't collide
      var frameName = 'jt-upload-' + Date.now();

      var iframe = document.createElement('iframe');
      iframe.name = frameName;
      iframe.style.display = 'none';
      document.body.appendChild(iframe);

      var form = document.createElement('form');
      form.method  = 'POST';
      form.action  = window.SHEETS_WEBAPP_URL || '';
      form.target  = frameName;
      // application/x-www-form-urlencoded so Apps Script reads e.parameter
      form.enctype = 'application/x-www-form-urlencoded';

      var fields = {
        action:   'uploadFile',
        orderId:  orderId,
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
        data:     base64Data
      };

      Object.keys(fields).forEach(function (key) {
        var inp   = document.createElement('input');
        inp.type  = 'hidden';
        inp.name  = key;
        inp.value = fields[key];
        form.appendChild(inp);
      });

      document.body.appendChild(form);
      form.submit();

      // Clean up DOM after a few seconds — the POST already happened
      setTimeout(function () {
        if (form.parentNode)   form.parentNode.removeChild(form);
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      }, 6000);

      // Resolve right away — the upload continues in the background
      resolve();
    };

    reader.onerror = function () {
      // Don't block the redirect if the file can't be read
      resolve();
    };

    reader.readAsDataURL(file);
  });
}

/* ---------- Order form ---------- */

function setupOrderForm() {
  const form = document.getElementById('order-form');
  const submitBtn = document.getElementById('submit-btn');
  const message = document.getElementById('form-message');
  const closedBanner = document.getElementById('closed-banner');

  setupFileDrop();

  let siteOpen = true;
  let submitting = false;

  // Check once on load so the banner shows immediately if orders are paused.
  callApi('getSiteStatus', {})
    .then(function (res) {
      if (res && res.status === 'ok' && res.open === false) {
        markClosed();
      }
    })
    .catch(function () {
      /* if the status check fails, just let people try to submit */
    });

  function markClosed() {
    siteOpen = false;
    closedBanner.classList.add('show');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Orders Paused';
  }

  function setFieldError(id, text) {
    const errorEl = document.getElementById(id + '-error');
    const inputEl = document.getElementById(id);
    if (errorEl) errorEl.textContent = text;
    if (inputEl) inputEl.classList.toggle('invalid', !!text);
  }

  function clearFieldErrors() {
    document.querySelectorAll('.field-error').forEach(function (el) {
      el.textContent = '';
    });
    document.querySelectorAll('.field input, .field select, .field textarea').forEach(function (el) {
      el.classList.remove('invalid');
    });
  }

  function isValidContact(value) {
    const digitsOnly = value.replace(/\s/g, '');
    const looksLikePhone = /^[\d\-+()]{7,15}$/.test(digitsOnly);
    const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    return looksLikePhone || looksLikeEmail;
  }

  // Validate on blur for quick feedback.
  ['name', 'contact', 'itemType', 'quantity'].forEach(function (id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('blur', function () {
      const value = el.value.trim();
      if (!value) {
        setFieldError(id, 'Required.');
      } else if (id === 'contact' && !isValidContact(value)) {
        setFieldError(id, 'Enter a valid phone or email.');
      } else if (id === 'quantity' && Number(value) < 1) {
        setFieldError(id, 'Must be at least 1.');
      } else {
        setFieldError(id, '');
      }
    });
  });

  document.getElementById('deadline').min = phToday();

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    if (submitting) return;

    clearFieldErrors();
    message.className = 'form-message';

    const name = document.getElementById('name').value.trim();
    const contact = document.getElementById('contact').value.trim();
    const itemType = document.getElementById('itemType').value;
    const quantity = document.getElementById('quantity').value.trim();
    const deadline = document.getElementById('deadline').value;

    let valid = true;
    if (!name) { setFieldError('name', 'Required.'); valid = false; }
    if (!contact) {
      setFieldError('contact', 'Required.'); valid = false;
    } else if (!isValidContact(contact)) {
      setFieldError('contact', 'Enter a valid phone or email.'); valid = false;
    }
    if (!itemType) { setFieldError('itemType', 'Required.'); valid = false; }
    if (!quantity || Number(quantity) < 1) { setFieldError('quantity', 'Enter a valid quantity.'); valid = false; }
    if (deadline && deadline < phToday()) { setFieldError('deadline', 'Cannot be in the past.'); valid = false; }

    if (!valid) return;

    if (!siteOpen) {
      message.className = 'form-message error show';
      message.textContent = 'Sorry, orders are currently paused. Please check back later.';
      return;
    }

    const payload = {
      name: name,
      contact: contact,
      itemType: itemType,
      quantity: quantity,
      sizes: document.getElementById('sizes').value.trim(),
      details: document.getElementById('details').value.trim(),
      deadline: deadline,
      budget: document.getElementById('budget').value
    };

    submitting = true;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending…';

    // Re-check the site status right before sending, in case it changed
    // while the customer was filling out the form.
    callApi('getSiteStatus', {})
      .then(function (statusRes) {
        if (statusRes && statusRes.status === 'ok' && statusRes.open === false) {
          submitting = false;
          submitBtn.disabled = false;
          submitBtn.textContent = 'Send Order Request';
          message.className = 'form-message error show';
          message.textContent = 'Ordering was just closed. Please try again later.';
          markClosed();
          return;
        }
        submitOrder(payload);
      })
      .catch(function () {
        submitOrder(payload);
      });
  });

  function submitOrder(payload) {
    callApi('newOrder', payload)
      .then(function (res) {
        submitting = false;
        submitBtn.disabled = false;
        submitBtn.textContent = 'Send Order Request';

        if (!res || res.status !== 'ok') {
          message.className = 'form-message error show';
          message.textContent = (res && res.message) || 'Something went wrong. Please try again.';
          return;
        }

        const orderId = res.orderId;
        if (navigator.clipboard) {
          navigator.clipboard.writeText(orderId).catch(function () {});
        }

        // If the customer attached a design file, upload it now in the
        // background. The redirect still happens — the file upload is
        // fire-and-forget so it never blocks the customer.
        const fileInput = document.getElementById('design-file');
        const chosenFile = fileInput && fileInput.files && fileInput.files[0];

        if (chosenFile) {
          message.className = 'form-message uploading show';
          message.textContent = '✅ Order received! Uploading your design file…';
          uploadDesignFile(chosenFile, orderId).then(function () {
            redirect(orderId, payload.contact);
          });
        } else {
          message.className = 'form-message success show';
          message.innerHTML = '✅ Order received! Your ID is <strong>' + escapeHtml(orderId) + '</strong> — redirecting…';
          redirect(orderId, payload.contact);
        }

        form.reset();
        // Clear the file drop UI after reset
        var chosen = document.getElementById('file-chosen');
        var dropUi = document.getElementById('file-drop-ui');
        if (chosen) chosen.classList.add('hidden');
        if (dropUi) dropUi.style.display = '';
      })
      .catch(function () {
        submitting = false;
        submitBtn.disabled = false;
        submitBtn.textContent = 'Send Order Request';
        message.className = 'form-message error show';
        message.textContent = 'Connection error — check your network and try again.';
      });
  }

  function redirect(orderId, contact) {
    setTimeout(function () {
      document.body.classList.add('leaving');
      setTimeout(function () {
        const params = new URLSearchParams({ orderId: orderId, contact: contact });
        window.location.href = 'lookup.html?' + params.toString();
      }, 300);
    }, 1200);
  }
}
