/**
 * Jueh Tailoring — Backend (Google Sheets + Apps Script)
 *
 * Powers 4 pages:
 *   1. tailoring-shop.html — customers place orders, get an Order ID
 *   2. owner.html          — shop owner views orders, sets status, replies
 *   3. admin.html          — you: open/close the whole site
 *   4. lookup.html         — customers check their order status
 *
 * SETUP:
 * 1. Open (or create) a Google Sheet.
 * 2. Extensions > Apps Script.
 * 3. Delete the default code, paste this whole file in.
 * 4. Set OWNER_PASSCODE and ADMIN_PASSCODE below to whatever you want.
 * 5. Deploy > New deployment > Web app.
 *    Execute as: Me. Who has access: Anyone.
 * 6. Copy the URL ending in /exec and send it back — same URL goes into
 *    all 4 HTML files.
 */

var OWNER_PASSCODE = 'OWNER';   // shop owner uses this on owner.html
var ADMIN_PASSCODE = 'ADMIN';   // you use this on admin.html

var ORDERS_SHEET = 'Orders';
var SETTINGS_SHEET = 'Settings';
var ORDER_HEADERS = [
  'OrderID', 'Timestamp', 'Name', 'Contact', 'Item Type', 'Quantity',
  'Sizes', 'Design Details', 'Needed By', 'Budget Range', 'Status', 'Owner Note'
];

function getOrdersSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(ORDERS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(ORDERS_SHEET);
    sheet.appendRow(ORDER_HEADERS);
  }
  return sheet;
}

function getSettingsSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SETTINGS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(SETTINGS_SHEET);
    sheet.appendRow(['Key', 'Value']);
    sheet.appendRow(['SiteOpen', 'TRUE']);
  }
  return sheet;
}

function jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function makeOrderId_() {
  var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'UTC', 'yyMMdd');
  var rand = Math.floor(1000 + Math.random() * 9000);
  return 'JT-' + stamp + '-' + rand;
}

function rowToOrder_(headers, row) {
  var order = {};
  for (var j = 0; j < headers.length; j++) {
    var val = row[j];
    order[headers[j]] = (val instanceof Date) ? val.toISOString() : val;
  }
  return order;
}

function normalizePasscode_(value) {
  return String(value == null ? '' : value).trim();
}

function passcodeMatches_(input, expected) {
  return normalizePasscode_(input).toLowerCase() === normalizePasscode_(expected).toLowerCase();
}

function handleRequest_(p) {
  var action = p.action || 'newOrder';

  // ---- Public: submit a new order ----
  if (action === 'newOrder') {
    var sheet = getOrdersSheet_();
    var orderId = makeOrderId_();
    sheet.appendRow([
      orderId,
      new Date(),
      p.name || '',
      p.contact || '',
      p.itemType || '',
      p.quantity || '',
      p.sizes || '',
      p.details || '',
      p.deadline || '',
      p.budget || '',
      'New',
      ''
    ]);
    return jsonOut_({ status: 'ok', orderId: orderId });
  }

  // ---- Public: check site open/closed ----
  if (action === 'getSiteStatus') {
    var s = getSettingsSheet_();
    var data = s.getDataRange().getValues();
    var open = true;
    for (var i = 1; i < data.length; i++) {
      if (data[i][0] === 'SiteOpen') { open = String(data[i][1]).toUpperCase() === 'TRUE'; }
    }
    return jsonOut_({ status: 'ok', open: open });
  }

  // ---- Public: customer looks up their own order ----
  if (action === 'lookupOrder') {
    var osheet = getOrdersSheet_();
    var odata = osheet.getDataRange().getValues();
    var oheaders = odata[0];
    for (var r = 1; r < odata.length; r++) {
      var row = odata[r];
      if (String(row[0]) === String(p.orderId || '').trim() &&
          String(row[3]).trim().toLowerCase() === String(p.contact || '').trim().toLowerCase()) {
        var order = rowToOrder_(oheaders, row);
        return jsonOut_({ status: 'ok', order: order });
      }
    }
    return jsonOut_({ status: 'error', message: 'No matching order found. Check your Order ID and contact info.' });
  }

  // ---- Owner/Admin: view all orders ----
  if (action === 'getOrders') {
    var isOwner = passcodeMatches_(p.passcode, OWNER_PASSCODE);
    var isAdmin = passcodeMatches_(p.passcode, ADMIN_PASSCODE);

    if (!isOwner && !isAdmin) {
      return jsonOut_({ status: 'error', message: 'Invalid passcode' });
    }

    var sh = getOrdersSheet_();
    var d = sh.getDataRange().getValues();
    var headers = d[0];
    var orders = [];

    for (var k = 1; k < d.length; k++) {
      orders.push(rowToOrder_(headers, d[k]));
    }

    orders.reverse();
    return jsonOut_({
      status: 'ok',
      orders: orders,
      role: isAdmin ? 'admin' : 'owner'
    });
  }

  // ---- Owner/Admin: update status / reply note on one order ----
  if (action === 'updateOrder') {
    var isOwner = passcodeMatches_(p.passcode, OWNER_PASSCODE);
    var isAdmin = passcodeMatches_(p.passcode, ADMIN_PASSCODE);

    if (!isOwner && !isAdmin) {
      return jsonOut_({ status: 'error', message: 'Invalid passcode' });
    }

    var sh2 = getOrdersSheet_();
    var d2 = sh2.getDataRange().getValues();

    for (var m = 1; m < d2.length; m++) {
      if (String(d2[m][0]) === String(p.orderId || '').trim()) {
        if (p.status !== undefined) sh2.getRange(m + 1, 11).setValue(p.status);
        if (p.note !== undefined) sh2.getRange(m + 1, 12).setValue(p.note);
        return jsonOut_({ status: 'ok' });
      }
    }

    return jsonOut_({ status: 'error', message: 'Order not found' });
  }

  // ---- Admin only: open/close the site ----
  if (action === 'setSiteStatus') {
    if (!passcodeMatches_(p.passcode, ADMIN_PASSCODE)) {
      return jsonOut_({ status: 'error', message: 'Invalid passcode' });
    }

    var s2 = getSettingsSheet_();
    var d3 = s2.getDataRange().getValues();
    var found = false;

    for (var n = 1; n < d3.length; n++) {
      if (d3[n][0] === 'SiteOpen') {
        s2.getRange(n + 1, 2).setValue(p.open === 'true' || p.open === true ? 'TRUE' : 'FALSE');
        found = true;
      }
    }

    if (!found) {
      s2.appendRow(['SiteOpen', p.open === 'true' || p.open === true ? 'TRUE' : 'FALSE']);
    }

    return jsonOut_({ status: 'ok' });
  }

  return jsonOut_({ status: 'error', message: 'Unknown action' });
}

function mergedParams_(e) {
  var params = (e && e.parameter) || {};
  if (e && e.postData && e.postData.contents) {
    try {
      var body = JSON.parse(e.postData.contents);
      for (var k in body) { params[k] = body[k]; }
    } catch (err) {
      // not JSON — fall back to whatever was in e.parameter
    }
  }
  return params;
}

function doGet(e) {
  var params = mergedParams_(e);
  var result = handleRequest_(params);
  var callback = params.callback;
  if (callback) {
    return ContentService
      .createTextOutput(callback + '(' + result.getContent() + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return result;
}

function doPost(e) {
  return handleRequest_(mergedParams_(e));
}
