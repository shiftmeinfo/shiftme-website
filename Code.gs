/**
 * ShiftMe booking system (Google Apps Script)
 * -------------------------------------------
 * Lives inside a Google Sheet in shiftmeinfo@gmail.com.
 *  - The website asks this script which dates are free.
 *  - New bookings are added to the "Bookings" tab.
 *  - Once a date has MAX_BOOKINGS_PER_DAY bookings it is blocked automatically.
 *  - Change a booking's Status to "Cancelled" and that slot opens up again.
 *  - Add a date to the "Blocked dates" tab to close a day (holidays, van service).
 * Setup steps are in SETUP-GUIDE.md, Part 1.
 */

var SETTINGS = {
  MAX_BOOKINGS_PER_DAY: 2,           // keep this the same as config.js on the website
  BUSINESS_EMAIL: "shiftmeinfo@gmail.com",
  BUSINESS_NAME: "ShiftMe",
  WHATSAPP: "+44 7457 411586",
  PHONE: "020 3488 8610",
  TIMEZONE: "Europe/London",
  BOOKINGS_TAB: "Bookings",
  BLOCKED_TAB: "Blocked dates",
  VALID_SLOTS: ["morning", "afternoon"]
};

var HEADERS = ["Ref", "Created", "Status", "Move date", "Slot", "Package", "Extras", "Total (£)", "Deposit (£)",
  "Balance (£)", "Name", "Phone", "Email", "From", "From access", "From parking", "To", "To access", "To parking", "Notes", "Slot id"];

/* Run this once from the editor (select "setup" then press Run) */
function setup() {
  var ss = SpreadsheetApp.getActive();
  var b = ss.getSheetByName(SETTINGS.BOOKINGS_TAB) || ss.insertSheet(SETTINGS.BOOKINGS_TAB);
  if (b.getLastRow() === 0) {
    b.appendRow(HEADERS);
    b.getRange(1, 1, 1, HEADERS.length).setFontWeight("bold").setBackground("#0D1B2A").setFontColor("#FFFFFF");
    b.setFrozenRows(1);
    var rule = SpreadsheetApp.newDataValidation().requireValueInList(["Pending deposit", "Confirmed", "Completed", "Cancelled"], true).build();
    b.getRange("C2:C2000").setDataValidation(rule);
    b.getRange("D2:D2000").setNumberFormat("ddd dd mmm yyyy");
    b.getRange("B2:B2000").setNumberFormat("dd/mm/yyyy hh:mm");
    b.setColumnWidth(6, 160); b.setColumnWidth(7, 240); b.setColumnWidth(14, 240); b.setColumnWidth(17, 240); b.setColumnWidth(20, 240);
    b.hideColumns(HEADERS.length);
  }
  var x = ss.getSheetByName(SETTINGS.BLOCKED_TAB) || ss.insertSheet(SETTINGS.BLOCKED_TAB);
  if (x.getLastRow() === 0) {
    x.appendRow(["Date", "Reason"]);
    x.getRange("A1:B1").setFontWeight("bold").setBackground("#0D1B2A").setFontColor("#FFFFFF");
    x.getRange("A2:A500").setNumberFormat("dd/mm/yyyy");
    x.setFrozenRows(1);
  }
  var s1 = ss.getSheetByName("Sheet1"); if (s1 && ss.getSheets().length > 2 && s1.getLastRow() === 0) ss.deleteSheet(s1);
}

/* ---------- website asks for availability ---------- */
function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || "availability";
  if (action !== "availability") return json({ ok: false, code: "unknown" });
  return json({ ok: true, max: SETTINGS.MAX_BOOKINGS_PER_DAY, days: countDays(), blocked: blockedDates() });
}

/* ---------- website sends a booking ---------- */
function doPost(e) {
  var data;
  try { data = JSON.parse(e.postData.contents); } catch (err) { return json({ ok: false, code: "invalid", message: "Something went wrong sending your booking. Please try again." }); }
  if (data.website) return json({ ok: true, ref: "SM-OK" });           // spam bot filled the hidden field
  var problem = check(data);
  if (problem) return json({ ok: false, code: "invalid", message: problem });

  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (err) { return json({ ok: false, code: "busy", message: "We're busy right now. Please try again in a moment." }); }
  try {
    if (blockedDates().indexOf(data.date) > -1) return json({ ok: false, code: "full" });
    var day = countDays()[data.date] || { count: 0, slots: [] };
    if (day.count >= SETTINGS.MAX_BOOKINGS_PER_DAY) return json({ ok: false, code: "full" });
    if (day.slots.indexOf(data.slot) > -1) return json({ ok: false, code: "slot_taken" });

    var ref = makeRef();
    var sheet = SpreadsheetApp.getActive().getSheetByName(SETTINGS.BOOKINGS_TAB);
    var extras = (data.extras || []).map(function (x) { return clean(x.label) + " £" + num(x.cost); }).join(", ");
    var p = data.date.split("-");
    sheet.appendRow([ref, new Date(), "Pending deposit", new Date(+p[0], +p[1] - 1, +p[2]), clean(data.slotLabel), clean(data.packageName),
      extras, num(data.total), num(data.deposit), num(data.total) - num(data.deposit),
      clean(data.name), textCell(data.phone), clean(data.email), clean(data.from), clean(data.fromAccess), clean(data.fromParking),
      clean(data.to), clean(data.toAccess), clean(data.toParking), clean(data.notes), data.slot]);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }

  try { sendEmails(ref, data, extras); } catch (err) { console.error(err); }   // booking still saved if email fails
  return json({ ok: true, ref: ref });
}

/* ---------- helpers ---------- */
function countDays() {
  var sheet = SpreadsheetApp.getActive().getSheetByName(SETTINGS.BOOKINGS_TAB);
  var days = {};
  if (!sheet || sheet.getLastRow() < 2) return days;
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.length).getValues();
  var todayKey = key(new Date());
  rows.forEach(function (r) {
    var status = String(r[2]).toLowerCase(), d = r[3];
    if (!d || status === "cancelled") return;
    var k = key(d);
    if (!k || k < todayKey) return;
    days[k] = days[k] || { count: 0, slots: [] };
    days[k].count++;
    var slotId = String(r[20] || guessSlot(r[4]));
    if (slotId) days[k].slots.push(slotId);
  });
  return days;
}
function guessSlot(label) {
  label = String(label || "").toLowerCase();
  if (label.indexOf("morning") > -1) return "morning";
  if (label.indexOf("afternoon") > -1) return "afternoon";
  return "";
}
function blockedDates() {
  var sheet = SpreadsheetApp.getActive().getSheetByName(SETTINGS.BLOCKED_TAB);
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues()
    .map(function (r) { return key(r[0]); }).filter(Boolean);
}
function key(d) {
  if (!d) return "";
  if (!(d instanceof Date)) {
    var s = String(d).trim(), m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) d = new Date(+m[3], +m[2] - 1, +m[1]); else d = new Date(s);
    if (isNaN(d)) return "";
  }
  return Utilities.formatDate(d, SETTINGS.TIMEZONE, "yyyy-MM-dd");
}
function check(d) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date || "")) return "Please pick a date.";
  if (d.date <= key(new Date())) return "Please pick a date from tomorrow onwards.";
  if (SETTINGS.VALID_SLOTS.indexOf(d.slot) === -1) return "Please pick a morning or afternoon arrival.";
  if (!d.name || !d.phone || !d.email || !d.from || !d.to) return "Please fill in your name, contact details and both addresses.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) return "Please check your email address.";
  return "";
}
function makeRef() {
  return "SM" + Utilities.formatDate(new Date(), SETTINGS.TIMEZONE, "yyMMdd") + "-" + Math.floor(100 + Math.random() * 900);
}
function clean(v) { v = String(v == null ? "" : v).slice(0, 1000); return /^[=+\-@]/.test(v) ? "'" + v : v; }  // stops formula injection
function textCell(v) { v = clean(v); return v.charAt(0) === "'" ? v : "'" + v; }   // keeps the leading 0 on phone numbers
function num(v) { var n = Number(v); return isNaN(n) ? 0 : Math.round(n * 100) / 100; }
function money(n) { return "£" + (n % 1 === 0 ? n : n.toFixed(2)); }
function json(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function sendEmails(ref, d, extras) {
  var p = d.date.split("-");
  var nice = Utilities.formatDate(new Date(+p[0], +p[1] - 1, +p[2]), SETTINGS.TIMEZONE, "EEEE d MMMM yyyy");
  var lines = [
    "Reference: " + ref,
    "Date: " + nice + ", " + d.slotLabel,
    "Move: " + d.packageName,
    extras ? "Extras: " + extras : "",
    "From: " + d.from + " (" + d.fromAccess + ", " + d.fromParking + ")",
    "To: " + d.to + " (" + d.toAccess + ", " + d.toParking + ")",
    d.notes ? "Notes: " + d.notes : "",
    "Total: " + money(num(d.total)),
    "Deposit: " + money(num(d.deposit)),
    "Balance on the day: " + money(num(d.total) - num(d.deposit))
  ].filter(Boolean).join("\n");

  // To you
  MailApp.sendEmail({
    to: SETTINGS.BUSINESS_EMAIL,
    replyTo: d.email,
    subject: "New booking " + ref + ": " + nice + " " + d.slotLabel,
    body: "New ShiftMe booking\n\n" + lines + "\n\nCustomer: " + d.name + "\nPhone: " + d.phone + "\nEmail: " + d.email +
      "\n\nNext: send the deposit link, then change Status to Confirmed in the sheet."
  });

  // To the customer
  MailApp.sendEmail({
    to: d.email,
    replyTo: SETTINGS.BUSINESS_EMAIL,
    name: SETTINGS.BUSINESS_NAME,
    subject: "Your ShiftMe booking " + ref,
    body: "Hi " + d.name.split(" ")[0] + ",\n\nThanks for booking with ShiftMe. Here are your details:\n\n" + lines +
      "\n\nWe'll be in touch shortly about your deposit. Your date is confirmed once it's paid.\n\n" +
      "Need to change anything? Reply to this email or WhatsApp us on " + SETTINGS.WHATSAPP + ".\n\nThe ShiftMe team\nTap. Book. Move."
  });
}
