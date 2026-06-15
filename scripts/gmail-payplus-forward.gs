// Kids & Fun - forward PayPlus failure emails to the CRM (safety net for flow 9)
// Lives inside the Gmail of office@kidsandfun.co.il.
// Every 10 minutes it finds new PayPlus emails and posts them to the CRM endpoint.
// The CRM endpoint decides which are real failures (Hebrew subject check happens
// server-side, where UTF-8 is safe). Each forwarded thread is labeled so it is
// never sent twice.
//
// INSTALL (one time):
//   1. Paste this whole file into script.google.com
//   2. Run the "setup" function -> Google asks for permission -> Approve
//   3. Done. checkPayPlusFailures then runs automatically every 10 minutes.

var WEBHOOK_URL = 'https://kids-fun-app-psi.vercel.app/api/webhooks/payplus-email';
var SECRET      = 'PASTE_EMAIL_WEBHOOK_SECRET_HERE'; // קח מ-Vercel env / .env.local לפני הדבקה
var LABEL       = 'payplus-sent-to-crm';

// Run once: create the 10-minute trigger (and do an immediate first run).
function setup() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'checkPayPlusFailures') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger('checkPayPlusFailures').timeBased().everyMinutes(10).create();
  Logger.log('Trigger installed - checkPayPlusFailures runs every 10 minutes.');
  checkPayPlusFailures();
}

// Runs automatically: find recent PayPlus emails, post each to the CRM.
function checkPayPlusFailures() {
  var label = GmailApp.getUserLabelByName(LABEL) || GmailApp.createLabel(LABEL);
  // All PayPlus emails from the last 3 days that were not forwarded yet.
  // The CRM endpoint filters receipts/security/login mails by itself.
  var threads = GmailApp.search('from:payplus.co.il newer_than:3d -label:' + LABEL);
  for (var i = 0; i < threads.length; i++) {
    var msgs = threads[i].getMessages();
    for (var j = 0; j < msgs.length; j++) {
      var m = msgs[j];
      var payload = {
        subject: m.getSubject() || '',
        html:    m.getBody(),
        text:    m.getPlainBody()
      };
      try {
        UrlFetchApp.fetch(WEBHOOK_URL, {
          method:             'post',
          contentType:        'application/json',
          headers:            { 'x-email-secret': SECRET },
          payload:            JSON.stringify(payload),
          muteHttpExceptions: true
        });
        Logger.log('Sent to CRM: ' + payload.subject);
      } catch (e) {
        Logger.log('Send error: ' + e);
      }
    }
    threads[i].addLabel(label); // mark as forwarded
  }
}
