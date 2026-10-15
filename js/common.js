/*
 * common.js
 * Shared helpers and backend transport for the Jueh Tailoring site.
 */

const SHEETS_WEBAPP_URL =
  'https://script.google.com/macros/s/AKfycbxCI7z5Q4ouI3XZhbcV2V5nKGIYe0QlGiMQnoRLzF804Zm6xoxc4QjdXFZs2IlJY0aS/exec';

// Deploy cloudflare-worker.js and put its actual HTTPS URL here before testing.
const API_PROXY_URL = 'PASTE_YOUR_CLOUDFLARE_WORKER_URL_HERE';

// Expose configuration for the design-file upload helper in home.js.
window.SHEETS_WEBAPP_URL = SHEETS_WEBAPP_URL;
window.API_PROXY_URL = API_PROXY_URL;

const REQUEST_TIMEOUT_MS = 20000;

/**
 * Public site status is the only action allowed over GET by the Apps Script
 * backend, so it remains JSONP. All other actions must use POST through the
 * configured proxy; sending them as JSONP GETs is rejected by doGet().
 */
function callApi(action, params) {
  if (action === 'getSiteStatus') {
    return callStatusJsonp(action, params);
  }

  return new Promise(function (resolve, reject) {
    if (!API_PROXY_URL || API_PROXY_URL.indexOf('PASTE_YOUR_') === 0) {
      reject(new Error('Backend proxy is not configured. Deploy cloudflare-worker.js and set API_PROXY_URL in js/common.js.'));
      return;
    }

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = setTimeout(function () {
      if (controller) controller.abort();
    }, REQUEST_TIMEOUT_MS);

    fetch(API_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ action: action }, params || {})),
      signal: controller ? controller.signal : undefined
    })
      .then(function (response) {
        if (!response.ok) {
          return response.json().catch(function () { return {}; }).then(function (body) {
            throw new Error(body.message || 'Backend request failed (HTTP ' + response.status + ').');
          });
        }
        return response.json();
      })
      .then(function (data) {
        clearTimeout(timer);
        resolve(data);
      })
      .catch(function (error) {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function callStatusJsonp(action, params) {
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
      reject(new Error('The site-status check timed out.'));
    }, REQUEST_TIMEOUT_MS);
    function cleanup() {
      clearTimeout(timer);
      delete window[callbackName];
      if (script.parentNode) script.parentNode.removeChild(script);
    }
    window[callbackName] = function (data) {
      cleanup();
      resolve(data);
    };
    script.onerror = function () {
      cleanup();
      reject(new Error('Could not load the Apps Script site-status endpoint.'));
    };
    script.src = SHEETS_WEBAPP_URL + '?' + queryString;
    document.body.appendChild(script);
  });
}

/** Escapes a value for safe insertion into innerHTML. */
function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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

/** Fade internal page links before navigating. */
function enablePageTransitions() {
  document.querySelectorAll('a[href]').forEach(function (link) {
    const href = link.getAttribute('href');
    if (!href || href.charAt(0) === '#' || href.indexOf('http') === 0) return;
    link.addEventListener('click', function (event) {
      event.preventDefault();
      document.body.classList.add('leaving');
      setTimeout(function () { window.location.href = href; }, 300);
    });
  });
}
document.addEventListener('DOMContentLoaded', enablePageTransitions);
