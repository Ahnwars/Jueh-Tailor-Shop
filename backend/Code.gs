/**
 * Jueh Tailoring — hardened Google Apps Script backend.
 * Configure Script Properties:
 *   OWNER_PASSCODE (unique, long password, 20+ chars)
 *   ADMIN_PASSCODE (different unique password, 20+ chars)
 *   TEXTBEE_API_KEY (optional)
 *
 * Deploy as Web app, execute as Me, who has access Anyone. Public actions are
 * limited and validated; administrative operations require server-held secrets.
 */

var ORDERS_SHEET = 'Orders';
var SETTINGS_SHEET = 'Settings';
var DESIGN_FOLDER_NAME = 'Jueh Tailoring — Design Files';
var MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
var MAX_BASE64_LENGTH = 7000000;
var ORDER_HEADERS = [
  'OrderID', 'Timestamp', 'Name', 'Contact', 'Item Type', 'Quantity',
  'Sizes', 'Design Details', 'Needed By', 'Budget Range', 'Status', 'Owner Note',
  'Design File', 'Upload Token Hash'
];
var ALLOWED_STATUSES = ['New', 'Ongoing', 'Done'];
var ALLOWED_MIME_TYPES = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf'
};

function getOrdersSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(ORDERS_SHEET);
  if (!sheet) sheet = ss.insertSheet(ORDERS_SHEET);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(ORDER_HEADERS);
    sheet.hideColumns(14);
    return sheet;
  }
  var lastColumn = Math.max(sheet.getLastColumn(), 1);
  var headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  if (headers.indexOf('Upload Token Hash') === -1) {
    sheet.getRange(1, 14).setValue('Upload Token Hash');
    sheet.hideColumns(14);
  }
  return sheet;
}

function getSettingsSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SETTINGS_SHEET);
  if (!sheet) sheet = ss.insertSheet(SETTINGS_SHEET);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['Key', 'Value']);
    sheet.appendRow(['SiteOpen', 'TRUE']);
  }
  return sheet;
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
function errorOut_(message) {
  return jsonOut_({ status: 'error', message: message });
}
function getSecret_(key) {
  return String(PropertiesService.getScriptProperties().getProperty(key) || '').trim();
}
function constantTimeEquals_(candidate, expected) {
  candidate = String(candidate || '');
  expected = String(expected || '');
  if (!expected || candidate.length !== expected.length) return false;
  var mismatch = 0;
  for (var i = 0; i < expected.length; i++) {
    mismatch |= candidate.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}
function isOwnerOrAdmin_(passcode) {
  return constantTimeEquals_(passcode, getSecret_('OWNER_PASSCODE')) ||
    constantTimeEquals_(passcode, getSecret_('ADMIN_PASSCODE'));
}
function isAdmin_(passcode) {
  return constantTimeEquals_(passcode, getSecret_('ADMIN_PASSCODE'));
}
function makeOrderId_() {
  var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Manila', 'yyMMdd');
  return 'JT-' + stamp + '-' + Utilities.getUuid().replace(/-/g, '').toUpperCase();
}
function makeUploadToken_() {
  return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
}
function hashToken_(token) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(token || ''), Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + ((b & 255).toString(16))).slice(-2); }).join('');
}
function rowToOrder_(headers, row) {
  var order = {};
  for (var j = 0; j < headers.length; j++) {
    var value = row[j];
    order[headers[j]] = value instanceof Date ? value.toISOString() : value;
  }
  delete order['Upload Token Hash'];
  return order;
}
function safeText_(value, maxLength) {
  var s = String(value == null ? '' : value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim().slice(0, maxLength);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}
function normalizeContact_(raw) {
  var s = String(raw || '').trim();
  if (s.indexOf('@') !== -1) return s.toLowerCase();
  var digits = s.replace(/\D/g, '');
  if (digits.indexOf('63') === 0 && digits.length === 12) digits = '0' + digits.slice(2);
  return digits;
}
function validContact_(raw) {
  var s = String(raw || '').trim();
  if (s.indexOf('@') !== -1) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 150;
  var digits = s.replace(/\D/g, '');
  return /^[+0-9\s().-]+$/.test(s) && digits.length >= 7 && digits.length <= 15;
}
function siteIsOpen_() {
  var data = getSettingsSheet_().getDataRange().getValues();
  var open = true;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === 'SiteOpen') open = String(data[i][1]).toUpperCase() === 'TRUE';
  }
  return open;
}
function setSiteOpen_(open) {
  var sheet = getSettingsSheet_();
  var data = sheet.getDataRange().getValues();
  var found = false;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === 'SiteOpen') {
      sheet.getRange(i + 1, 2).setValue(open ? 'TRUE' : 'FALSE');
      found = true;
    }
  }
  if (!found) sheet.appendRow(['SiteOpen', open ? 'TRUE' : 'FALSE']);
}
function getDesignFolder_() {
  var folders = DriveApp.getFoldersByName(DESIGN_FOLDER_NAME);
  var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(DESIGN_FOLDER_NAME);
  folder.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.VIEW);
  return folder;
}

/** Run once manually after deployment to privatize files uploaded before this patch. */
function lockDownDesignFiles() {
  var folders = DriveApp.getFoldersByName(DESIGN_FOLDER_NAME);
  if (!folders.hasNext()) return 'No design folder found.';
  var folder = folders.next();
  folder.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.VIEW);
  var files = folder.getFiles();
  var count = 0;
  while (files.hasNext()) {
    files.next().setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.VIEW);
    count++;
  }
  return 'Made the folder private and updated ' + count + ' files.';
}

function normalizeSmsPhone_(contact) {
  if (String(contact || '').indexOf('@') !== -1) return '';
  var digits = String(contact || '').replace(/\D/g, '');
  if (digits.indexOf('0') === 0 && digits.length === 11) {
    digits = '63' + digits.slice(1);
  } else if (digits.length === 10 && digits.charAt(0) === '9') {
    digits = '63' + digits;
  }
  // TextBee expects E.164 Philippine mobile numbers in 639XXXXXXXXX format.
  return /^639\d{9}$/.test(digits) ? digits : '';
}

function sendDoneEmail_(contact, name, orderId) {
  try {
    MailApp.sendEmail({
      to: contact,
      subject: 'Your Jueh Tailoring order is ready! 🎉',
      body: 'Hi ' + name + ',\n\n' +
        'Great news — your order (' + orderId + ') is done and ready for pick-up!\n\n' +
        'If you have any questions, message us on Facebook:\n' +
        'https://www.facebook.com/profile.php?id=100090775430928\n\n' +
        'Thank you for choosing Jueh Tailoring. 🙏\n' +
        '— Jueh Tailoring, Manolo Fortich, Bukidnon'
    });
  } catch (err) {
    Logger.log('Email error for ' + orderId + ': ' + err.message);
  }
}

function sendTextBeeSms_(contact, message, orderId) {
  var apiKey = getSecret_('TEXTBEE_API_KEY');
  if (!apiKey) return; // SMS optional until configured.
  var phone = normalizeSmsPhone_(contact);
  if (!phone) return; // Skip email contacts and malformed numbers.
  try {
    var payload = { recipients: [phone], message: message };
    // Optional device ID; omit it to use the default/most recently active device.
    var deviceId = getSecret_('TEXTBEE_DEVICE_ID');
    if (deviceId) payload.deviceId = deviceId;
    var response = UrlFetchApp.fetch('https://api.textbee.dev/api/v1/gateway/send-sms', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-api-key': apiKey },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    var code = response.getResponseCode();
    if (code < 200 || code >= 300) {
      Logger.log('TextBee SMS failed for order ' + orderId + '. HTTP ' + code);
    }
  } catch (err) {
    // Order operations must never fail because a notification provider is unavailable.
    Logger.log('TextBee SMS failed for order ' + orderId + ': ' + err.message);
  }
}

function sendOrderReceivedSms_(contact, orderId) {
  sendTextBeeSms_(contact,
    'Jueh Tailoring: We received your order ' + orderId +
    '. Keep this ID to check your order status. We will text you when it is ready.',
    orderId);
}

function sendDoneSms_(contact, name, orderId) {
  sendTextBeeSms_(contact,
    'Hi ' + name + '! Your Jueh Tailoring order (' + orderId +
    ') is ready for pick-up. Questions? Message us on FB. Thank you!',
    orderId);
}

function mimeMatchesBytes_(bytes, mimeType) {
  function b(i) { return bytes[i] & 255; }
  if (mimeType === 'application/pdf') return bytes.length >= 5 && b(0) === 37 && b(1) === 80 && b(2) === 68 && b(3) === 70 && b(4) === 45;
  if (mimeType === 'image/jpeg') return bytes.length >= 3 && b(0) === 255 && b(1) === 216 && b(2) === 255;
  if (mimeType === 'image/png') return bytes.length >= 8 && b(0) === 137 && b(1) === 80 && b(2) === 78 && b(3) === 71 && b(4) === 13 && b(5) === 10 && b(6) === 26 && b(7) === 10;
  if (mimeType === 'image/webp') return bytes.length >= 12 && b(0) === 82 && b(1) === 73 && b(2) === 70 && b(3) === 70 && b(8) === 87 && b(9) === 69 && b(10) === 66 && b(11) === 80;
  return false;
}

function processUpload_(p) {
  var lock = LockService.getScriptLock();
  var locked = false;
  try {
    lock.waitLock(5000);
    locked = true;
    return processUploadLocked_(p);
  } catch (err) {
    Logger.log('Upload processing error: ' + err.message);
    return errorOut_('Upload failed. Please try again.');
  } finally {
    if (locked) {
      try { lock.releaseLock(); } catch (ignore) {}
    }
  }
}
function processUploadLocked_(p) {
  var orderId = String(p.orderId || '').trim();
  var token = String(p.uploadToken || '').trim();
  var data64 = String(p.data || '').trim();
  var mimeType = String(p.mimeType || '').toLowerCase().trim();
  if (!orderId || !token || !data64) return errorOut_('Missing file, authorization token, or order ID.');
  if (data64.length > MAX_BASE64_LENGTH) return errorOut_('File is too large. Maximum size is 5 MB.');
  if (!Object.prototype.hasOwnProperty.call(ALLOWED_MIME_TYPES, mimeType)) {
    return errorOut_('File type not allowed. Upload a JPG, PNG, WEBP, or PDF.');
  }

  var sheet = getOrdersSheet_();
  var rows = sheet.getDataRange().getValues();
  var rowNumber = -1;
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === orderId) {
      rowNumber = i + 1;
      if (!rows[i][13] || !constantTimeEquals_(hashToken_(token), String(rows[i][13]))) {
        return errorOut_('Upload authorization failed.');
      }
      if (String(rows[i][12] || '').trim()) return errorOut_('A design file is already attached to this order.');
      break;
    }
  }
  if (rowNumber < 0) return errorOut_('Order not found.');

  var createdFile = null;
  try {
    var bytes = Utilities.base64Decode(data64);
    if (!bytes || bytes.length === 0) return errorOut_('The uploaded file is empty.');
    if (bytes.length > MAX_UPLOAD_BYTES) return errorOut_('File is too large. Maximum size is 5 MB.');
    if (!mimeMatchesBytes_(bytes, mimeType)) return errorOut_('File content does not match its declared type.');

    var baseName = String(p.filename || 'design').replace(/\.[^.]*$/, '');
    baseName = baseName.replace(/[^a-zA-Z0-9 _-]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 80) || 'design';
    var filename = baseName + ALLOWED_MIME_TYPES[mimeType];
    createdFile = getDesignFolder_().createFile(Utilities.newBlob(bytes, mimeType, filename));
    createdFile.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.VIEW);
    sheet.getRange(rowNumber, 13).setValue(createdFile.getUrl());
    sheet.getRange(rowNumber, 14).clearContent(); // token is single-use
    return jsonOut_({ status: 'ok' });
  } catch (err) {
    if (createdFile) {
      try { createdFile.setTrashed(true); } catch (ignore) {}
    }
    Logger.log('Upload save error: ' + err.message);
    return errorOut_('Could not save the file. Use a JPG, PNG, WEBP, or PDF under 5 MB.');
  }
}

function handleRequest_(p, method) {
  var action = String(p.action || '').trim();
  method = String(method || 'GET').toUpperCase();

  if (action === 'getSiteStatus') return jsonOut_({ status: 'ok', open: siteIsOpen_() });
  if (method !== 'POST') return errorOut_('This action requires POST.');

  if (action === 'newOrder') {
    if (!siteIsOpen_()) return errorOut_('Orders are currently paused. Please check back later.');
    var name = String(p.name || '').trim();
    var contact = String(p.contact || '').trim();
    var itemType = String(p.itemType || '').trim();
    var quantity = Number(p.quantity);
    if (!name || name.length > 100) return errorOut_('Enter a name under 100 characters.');
    if (!validContact_(contact)) return errorOut_('Enter a valid phone number or email.');
    if (!itemType || itemType.length > 100) return errorOut_('Select a valid item type.');
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1000) return errorOut_('Quantity must be between 1 and 1000.');

    var cacheKey = 'new_order_' + hashToken_(normalizeContact_(contact)).slice(0, 40);
    var cache = CacheService.getScriptCache();
    if (cache.get(cacheKey)) return errorOut_('Please wait one minute before submitting another order with this contact.');
    var lock = LockService.getScriptLock();
    var orderId = '';
    var uploadToken = '';
    try {
      lock.waitLock(5000);
      orderId = makeOrderId_();
      uploadToken = makeUploadToken_();
      getOrdersSheet_().appendRow([
        orderId, new Date(), safeText_(name, 100), safeText_(contact, 150),
        safeText_(itemType, 100), quantity, safeText_(p.sizes, 500),
        safeText_(p.details, 1500), safeText_(p.deadline, 20),
        safeText_(p.budget, 100), 'New', '', '', hashToken_(uploadToken)
      ]);
      cache.put(cacheKey, '1', 60);
    } catch (err) {
      Logger.log('Order creation error: ' + err.message);
      return errorOut_('The order could not be saved. Please try again.');
    } finally {
      try { lock.releaseLock(); } catch (ignore) {}
    }
    // Send SMS outside the sheet lock. Failures never undo the saved order.
    sendOrderReceivedSms_(contact, orderId);
    return jsonOut_({ status: 'ok', orderId: orderId, uploadToken: uploadToken });
  }

  if (action === 'lookupOrder') {
    var lookupId = String(p.orderId || '').trim();
    var lookupContact = normalizeContact_(p.contact);
    if (!lookupId || !lookupContact || lookupId.length > 80 || lookupContact.length > 150) {
      return errorOut_('Enter a valid Order ID and contact.');
    }
    var data = getOrdersSheet_().getDataRange().getValues();
    for (var r = 1; r < data.length; r++) {
      var row = data[r];
      if (String(row[0]) === lookupId && normalizeContact_(row[3]) === lookupContact) {
        return jsonOut_({
          status: 'ok',
          order: {
            'OrderID': String(row[0] || ''),
            'Timestamp': row[1] instanceof Date ? row[1].toISOString() : row[1],
            'Item Type': row[4] || '',
            'Quantity': row[5] || '',
            'Needed By': row[8] || '',
            'Status': row[10] || 'New',
            'Owner Note': row[11] || ''
          }
        });
      }
    }
    return errorOut_('No matching order found. Check your Order ID and contact info.');
  }

  if (action === 'getOrders') {
    if (!isOwnerOrAdmin_(p.passcode)) return errorOut_('Invalid passcode.');
    var orderSheet = getOrdersSheet_();
    var all = orderSheet.getDataRange().getValues();
    var headers = all[0] || ORDER_HEADERS;
    var orders = [];
    for (var k = 1; k < all.length; k++) orders.push(rowToOrder_(headers, all[k]));
    orders.reverse();
    return jsonOut_({ status: 'ok', orders: orders });
  }

  if (action === 'updateOrder') {
    if (!isOwnerOrAdmin_(p.passcode)) return errorOut_('Invalid passcode.');
    var targetId = String(p.orderId || '').trim();
    if (!targetId || targetId.length > 80) return errorOut_('Invalid order ID.');
    var hasStatus = p.status !== undefined && p.status !== null;
    var hasNote = p.note !== undefined && p.note !== null;
    var nextStatus = hasStatus ? String(p.status) : '';
    if (hasStatus && ALLOWED_STATUSES.indexOf(nextStatus) === -1) return errorOut_('Invalid order status.');
    var note = hasNote ? safeText_(p.note, 1500) : '';

    var sh = getOrdersSheet_();
    var d = sh.getDataRange().getValues();
    for (var m = 1; m < d.length; m++) {
      if (String(d[m][0]) !== targetId) continue;
      var previousStatus = String(d[m][10] || 'New');
      var finalStatus = hasStatus ? nextStatus : previousStatus;
      if (hasStatus) sh.getRange(m + 1, 11).setValue(nextStatus);
      if (hasNote) sh.getRange(m + 1, 12).setValue(note);
      SpreadsheetApp.flush();
      if (finalStatus === 'Done' && previousStatus !== 'Done') {
        var cname = String(d[m][2] || '');
        var ccontact = String(d[m][3] || '');
        if (ccontact.indexOf('@') !== -1) sendDoneEmail_(ccontact, cname, targetId);
        else if (ccontact.trim()) sendDoneSms_(ccontact, cname, targetId);
      }
      return jsonOut_({ status: 'ok' });
    }
    return errorOut_('Order not found.');
  }

  if (action === 'uploadFile') return processUpload_(p);

  if (action === 'setSiteStatus') {
    if (!isAdmin_(p.passcode)) return errorOut_('Invalid passcode.');
    if (p.open !== true && p.open !== false && p.open !== 'true' && p.open !== 'false') {
      return errorOut_('Invalid site status.');
    }
    setSiteOpen_(p.open === true || p.open === 'true');
    return jsonOut_({ status: 'ok' });
  }

  return errorOut_('Unknown action.');
}

function mergedParams_(e) {
  var params = {};
  var query = (e && e.parameter) || {};
  Object.keys(query).forEach(function (key) { params[key] = query[key]; });
  if (e && e.postData && e.postData.contents) {
    try {
      var body = JSON.parse(e.postData.contents);
      if (body && typeof body === 'object' && !Array.isArray(body)) {
        Object.keys(body).forEach(function (key) { params[key] = body[key]; });
      }
    } catch (ignore) {
      // HTML form posts, including design file uploads, are already e.parameter.
    }
  }
  return params;
}

function doGet(e) {
  var params = mergedParams_(e);
  if (String(params.action || '') !== 'getSiteStatus') {
    return errorOut_('Only public site status is available over GET.');
  }
  var result = handleRequest_(params, 'GET');
  var callback = String(params.callback || '');
  if (callback) {
    if (!/^[A-Za-z_$][A-Za-z0-9_$]{0,63}$/.test(callback)) return errorOut_('Invalid callback.');
    return ContentService.createTextOutput(callback + '(' + result.getContent() + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return result;
}
function doPost(e) {
  return handleRequest_(mergedParams_(e), 'POST');
}
