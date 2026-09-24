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
 */

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
