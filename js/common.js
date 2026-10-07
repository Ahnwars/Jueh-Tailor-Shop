/*
 * common.js
 * Shared helpers used on every page: talking to the Apps Script backend,
 * escaping text for safe HTML, formatting dates, and the page transition.
 */

const SHEETS_WEBAPP_URL =
  'https://script.google.com/macros/s/AKfycbzuMffaNSwWTS6-WVNrkcIyAJMedH8XuW4rYbwRKK-fC_YncLELw8c2Ul7N-TudQTuD/exec';

// Also expose on window so other scripts (home.js uploadDesignFile) can reach it
window.SHEETS_WEBAPP_URL = SHEETS_WEBAPP_URL;

const REQUEST_TIMEOUT_MS = 15000;

/**
 * Calls the Google Apps Script backend using JSONP (GitHub Pages is static,
 * so a normal fetch would get blocked by CORS). Resolves with whatever
 * object the script responds with, or rejects after a timeout / network error.
 */
function callApi(action, params) {
  return new Promise(function (resolve, reject) {
    const callbackName = 'jt_cb_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    const query = Object.assign({ action: action, callback: callbackName }, params || {});

    const queryString = Object.keys(query)
      .map(function (key) {
        return encodeURIComponent(key) + '=' + encodeURIComponent(query[key]);
      })
      .join('&');

    const script = document.createElement('script');

    const timer = setTimeout(function () {
      cleanup();
      reject(new Error('timeout'));
    }, REQUEST_TIMEOUT_MS);

    function cleanup() {
      clearTimeout(timer);
      delete window[callbackName];
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    }

    window[callbackName] = function (data) {
      cleanup();
      resolve(data);
    };

    script.onerror = function () {
      cleanup();
      reject(new Error('network error'));
    };

    script.src = SHEETS_WEBAPP_URL + '?' + queryString;
    document.body.appendChild(script);
  });
}

/** Escapes a value for safe insertion into innerHTML. */
function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Formats a timestamp the way customers in the Philippines expect to read it. */
function formatDate(value) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (isNaN(parsed)) return escapeHtml(value);
  return parsed.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
}

/** Today's date in the Philippines (UTC+8), as an ISO string like a date input expects. */
function phToday() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().split('T')[0];
}

/**
 * Makes every internal link do a short fade-out before navigating, so page
 * changes don't feel like a jump cut. External links and #anchors are left alone.
 */
function enablePageTransitions() {
  document.querySelectorAll('a[href]').forEach(function (link) {
    const href = link.getAttribute('href');
    if (!href || href.charAt(0) === '#' || href.indexOf('http') === 0) return;

    link.addEventListener('click', function (event) {
      event.preventDefault();
      document.body.classList.add('leaving');
      setTimeout(function () {
        window.location.href = href;
      }, 300);
    });
  });
}

document.addEventListener('DOMContentLoaded', enablePageTransitions);
