/**
 * Jueh Tailoring — Order Logger
 * Logs each website order request as a new row in this Sheet.
 *
 * SETUP:
 * 1. Open (or create) the Google Sheet you want orders logged to.
 * 2. Extensions > Apps Script.
 * 3. Delete the default code and paste this whole file in.
 * 4. Click "Deploy" > "New deployment".
 * 5. Under "Select type", choose "Web app".
 * 6. Set "Execute as": Me. Set "Who has access": Anyone.
 * 7. Click Deploy, approve the permissions Google asks for.
 * 8. Copy the "Web app URL" (it ends in /exec) and send it back —
 *    that's the only piece needed to wire up the website form.
 *
 * ADMIN PAGE:
 * The same URL also serves order data to admin.html so the shop owner
 * can view orders on the website instead of opening this Sheet directly.
 * Set ADMIN_PASSCODE below to whatever passcode you want to protect it with,
 * then use that same passcode on the admin page.
 */

var ADMIN_PASSCODE = 'CHANGE_ME'; // set this, then use it to log into admin.html

function doGet(e) {
  var p = e.parameter || {};
  if (p.passcode !== ADMIN_PASSCODE) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: 'Invalid passcode' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Orders');
  if (!sheet || sheet.getLastRow() < 2) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'ok', orders: [] }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var orders = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var order = {};
    for (var j = 0; j < headers.length; j++) {
      var val = row[j];
      order[headers[j]] = (val instanceof Date) ? val.toISOString() : val;
    }
    orders.push(order);
  }
  // Most recent first
  orders.reverse();

  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok', orders: orders }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Orders') || ss.insertSheet('Orders');

  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      'Timestamp', 'Name', 'Contact', 'Item Type', 'Quantity',
      'Sizes', 'Design Details', 'Needed By', 'Budget Range'
    ]);
  }

  var p = e.parameter || {};
  sheet.appendRow([
    new Date(),
    p.name || '',
    p.contact || '',
    p.itemType || '',
    p.quantity || '',
    p.sizes || '',
    p.details || '',
    p.deadline || '',
    p.budget || ''
  ]);

  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok' }))
    .setMimeType(ContentService.MimeType.JSON);
}
