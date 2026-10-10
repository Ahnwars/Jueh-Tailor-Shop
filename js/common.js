/*
 * common.js
 * Shared helpers for the static site.
 * API requests use POST so passwords, contact details, and order data do not
 * appear in URL query strings. Pair with the hardened Apps Script backend.
 */
const SHEETS_WEBAPP_URL =
  'https://script.google.com/macros/s/AKfycbzuMffaNSwWTS6-WVNrkcIyAJMedH8XuW4rYbwRKK-fC_YncLELw8c2Ul7N-TudQTuD/exec';
window.SHEETS_WEBAPP_URL = SHEETS_WEBAPP_URL;
const REQUEST_TIMEOUT_MS = 15000;

function callApi(action, params) {
  const controller = new AbortController();
  const timer = setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT_MS);
  const payload = Object.assign({}, params || {}, { action: action });

  return fetch(SHEETS_WEBAPP_URL, {
    method: 'POST',
    mode: 'cors',
    redirect: 'follow',
    credentials: 'omit',
    cache: 'no-store',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: JSON.stringify(payload),
    signal: controller.signal
  })
    .then(function (response) {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.json();
    })
    .then(function (data) {
      if (!data || typeof data !== 'object') throw new Error('Invalid API response');
      return data;
    })
    .catch(function (error) {
      if (error && error.name === 'AbortError') throw new Error('timeout');
      throw error;
    })
    .finally(function () { clearTimeout(timer); });
}

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function formatDate(value) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (isNaN(parsed)) return escapeHtml(value);
  return parsed.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
}
function phToday() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().split('T')[0];
}
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
