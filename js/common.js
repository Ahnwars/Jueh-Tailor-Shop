/*
 * common.js
 * Shared helpers used on every page: talking to the Apps Script backend,
 * escaping text for safe HTML, formatting dates, and the page transition.
 */

const SHEETS_WEBAPP_URL =
  'https://script.google.com/macros/s/AKfycbxCI7z5Q4ouI3XZhbcV2V5nKGIYe0QlGiMQnoRLzF804Zm6xoxc4QjdXFZs2IlJY0aS/exec';

// Also expose on window so other scripts (home.js uploadDesignFile) can reach it
window.SHEETS_WEBAPP_URL = SHEETS_WEBAPP_URL;

const REQUEST_TIMEOUT_MS = 30000;

/**
 * Calls the Google Apps Script backend using JSONP because GitHub Pages is
 * static and the Apps Script endpoint may not allow cross-origin fetch().
 *
 * Errors are classified so callers can show a useful message instead of
 * incorrectly blaming the customer's network for every failure.
 */
function callApi(action, params) {
  return new Promise(function (resolve, reject) {
    const callbackName = 'jt_cb_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    const query = Object.assign({}, params || {}, {
      action: action,
      callback: callbackName
    });
    const url = new URL(SHEETS_WEBAPP_URL);

    Object.keys(query).forEach(function (key) {
      if (query[key] !== undefined && query[key] !== null) {
        url.searchParams.set(key, String(query[key]));
      }
    });

    const script = document.createElement('script');
    let settled = false;
    let timer;

    function cleanup() {
      if (timer) clearTimeout(timer);
      delete window[callbackName];
      script.onload = null;
      script.onerror = null;
      if (script.parentNode) script.parentNode.removeChild(script);
    }

    function fail(code, message) {
      if (settled) return;
      settled = true;
      cleanup();
      const error = new Error(message);
      error.code = code;
      reject(error);
    }

    window[callbackName] = function (data) {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(data);
    };

    script.onload = function () {
      // A script can load successfully without ever calling the JSONP
      // callback, for example if the deployment returns plain JSON/HTML.
      if (!settled) {
        fail(
          'API_NO_CALLBACK',
          'The order service loaded but did not return the expected JSONP callback.'
        );
      }
    };

    script.onerror = function () {
      fail(
        'API_LOAD_ERROR',
        'The order service script could not be loaded. Check the Apps Script URL and deployment access.'
      );
    };

    timer = setTimeout(function () {
      fail(
        'API_TIMEOUT',
        'The order service did not respond within 30 seconds.'
      );
    }, REQUEST_TIMEOUT_MS);

    script.async = true;
    script.src = url.toString();
    document.head.appendChild(script);
  });
}

/** Returns a user-facing explanation for known API connection failures. */
function apiErrorMessage(error, fallback) {
  if (error && error.code === 'API_TIMEOUT') {
    return 'The order system did not respond within 30 seconds. Please try again later; if this keeps happening, the shop owner needs to check the Apps Script deployment.';
  }
  if (error && error.code === 'API_LOAD_ERROR') {
    return 'Could not load the order system. The Apps Script URL, deployment access, or Google service may be unavailable.';
  }
  if (error && error.code === 'API_NO_CALLBACK') {
    return 'The order system responded in an unexpected format. The shop owner needs to check the Apps Script response code and deployment.';
  }
  return fallback || 'Could not connect to the order system. Please try again.';
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
