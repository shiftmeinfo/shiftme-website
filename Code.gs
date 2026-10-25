/**
 * ShiftMe booking system with Stripe payments (Google Apps Script)
 * ----------------------------------------------------------------
 * Lives inside the "ShiftMe Bookings" Google Sheet in shiftmeinfo@gmail.com.
 *
 * How a booking works:
 *  1. The customer fills in the form and clicks Pay. This script checks the date is free,
 *     works out the price itself (from the prices in config.js on the website, so nobody
 *     can change the price in their browser), adds a row marked "Awaiting payment",
 *     and sends the customer to a Stripe payment page.
 *  2. The slot is held for 30 minutes while they pay.
 *  3. When Stripe confirms payment the row changes to "Paid" and both of you get an email.
 *     If they don't pay in 30 minutes the row changes to "Expired" and the slot opens again.
 *
 * Rules:
 *  - A date is blocked automatically once it has MAX_BOOKINGS_PER_DAY bookings.
 *  - Change a Status to "Cancelled" to free a slot (refund the customer in Stripe).
 *  - Add a date to the "Blocked dates" tab to close a day.
 *
 * Your Stripe secret key is NOT stored in this code. It goes in
 * Project Settings > Script properties as STRIPE_SECRET_KEY (see the setup steps).
 */

var SETTINGS = {
  MAX_BOOKINGS_PER_DAY: 2,           // keep this the same as config.js on the website
  BUSINESS_EMAIL: "shiftmeinfo@gmail.com",
  BUSINESS_NAME: "ShiftMe",
  WHATSAPP: "+44 7457 411586",
  PHONE: "020 3488 8610",
  TIMEZONE: "Europe/London",
  SITE_URL: "https://shiftme.uk/",
  // Where the script reads your prices from (first one that works is used)
  CONFIG_URLS: [
    "https://raw.githubusercontent.com/shiftmeinfo/shiftme-website/main/config.js",
    "https://shiftme.uk/config.js"
  ],
  HOLD_MINUTES: 30,                  // how long a slot is held while the customer pays (Stripe minimum is 30)
  BOOKINGS_TAB: "Bookings",
  BLOCKED_TAB: "Blocked dates",
  // Google Calendar: every Paid or Confirmed booking is added to this calendar automatically
  CALENDAR_NAME: "ShiftMe Jobs",
  JOB_HOURS: 4,                      // how long each job shows in the calendar
  SLOT_START: { morning: "09:00", afternoon: "13:00" }
};

var HEADERS = ["Ref", "Created", "Status", "Move date", "Slot", "Package", "Extras", "Total (£)", "Paid (£)",
  "Name", "Phone", "Email", "From", "From access", "From parking", "To", "To access", "To parking", "Notes",
  "Stripe session", "Slot id", "Token", "Calendar event"];
var STATUSES = ["Awaiting payment", "Paid", "Completed", "Cancelled", "Expired"];

/* =========================================================================
   SETUP: run once from the editor (choose "setup" and press Run).
   Safe to run again: it updates headings and the payment checker.
   ========================================================================= */
function setup() {
  var ss = SpreadsheetApp.getActive();
  var b = ss.getSheetByName(SETTINGS.BOOKINGS_TAB) || ss.insertSheet(SETTINGS.BOOKINGS_TAB);
  b.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS])
    .setFontWeight("bold").setBackground("#0D1B2A").setFontColor("#FFFFFF");
  b.setFrozenRows(1);
  var rule = SpreadsheetApp.newDataValidation().requireValueInList(STATUSES.concat(["Confirmed"]), true).build();
  b.getRange("C2:C2000").setDataValidation(rule);
  b.getRange("D2:D2000").setNumberFormat("ddd dd mmm yyyy");
  b.getRange("B2:B2000").setNumberFormat("dd/mm/yyyy hh:mm");
  b.setColumnWidth(6, 160); b.setColumnWidth(7, 240); b.setColumnWidth(13, 240); b.setColumnWidth(16, 240); b.setColumnWidth(19, 240);
  b.showColumns(1, b.getMaxColumns());
  b.hideColumns(20, 4);   // Stripe session, Slot id, Token, Calendar event
  jobsCalendar();         // creates the "ShiftMe Jobs" calendar if it doesn't exist

  var x = ss.getSheetByName(SETTINGS.BLOCKED_TAB) || ss.insertSheet(SETTINGS.BLOCKED_TAB);
  if (x.getLastRow() === 0) {
    x.appendRow(["Date", "Reason"]);
    x.getRange("A1:B1").setFontWeight("bold").setBackground("#0D1B2A").setFontColor("#FFFFFF");
    x.getRange("A2:A500").setNumberFormat("dd/mm/yyyy");
    x.setFrozenRows(1);
  }

  // Checks unpaid bookings every 5 minutes (catches customers who paid but closed the page)
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === "reconcile") ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("reconcile").timeBased().everyMinutes(5).create();

  var sk = PropertiesService.getScriptProperties().getProperty("STRIPE_SECRET_KEY");
  Logger.log(sk ? "Setup done. Stripe key found (" + (sk.indexOf("_live_") > -1 ? "LIVE mode" : "TEST mode") + ")."
                 : "Setup done. Now add STRIPE_SECRET_KEY in Project Settings > Script properties.");
}

/* =========================================================================
   WEBSITE REQUESTS
   ========================================================================= */
function doGet(e) {
  var p = (e && e.parameter) || {};
  var action = p.action || "availability";
  try {
    if (action === "availability") return json({ ok: true, max: SETTINGS.MAX_BOOKINGS_PER_DAY, days: countDays(), blocked: blockedDates() });
    if (action === "confirm") return json(confirmPayment(p.session_id));
    if (action === "cancel") return json(cancelUnpaid(p.ref, p.token));
  } catch (err) {
    console.error(err);
    return json({ ok: false, code: "error", message: "Something went wrong. Please WhatsApp us on " + SETTINGS.WHATSAPP + "." });
  }
  return json({ ok: false, code: "unknown" });
}

function doPost(e) {
  var data;
  try { data = JSON.parse(e.postData.contents); } catch (err) { return json({ ok: false, code: "invalid", message: "Something went wrong sending your booking. Please try again." }); }
  if (data.website) return json({ ok: false, code: "invalid", message: "Please try again." });   // spam bot filled the hidden field
  try { return json(startBooking(data)); }
  catch (err) {
    console.error(err);
    return json({ ok: false, code: "error", message: "We couldn't start your payment. Please try again, or WhatsApp us on " + SETTINGS.WHATSAPP + "." });
  }
}

/* ---------- 1. Customer clicks Pay ---------- */
function startBooking(d) {
  var cfg = siteConfig();
  var quote = priceBooking(cfg, d);
  if (quote.error) return { ok: false, code: "invalid", message: quote.error };
  var problem = checkDetails(cfg, d);
  if (problem) return { ok: false, code: "invalid", message: problem };
  var sk = stripeKey();
  if (!sk) return { ok: false, code: "error", message: "Online payment isn't set up yet. Please WhatsApp us on " + SETTINGS.WHATSAPP + " to book." };

  var ref, token = Utilities.getUuid().replace(/-/g, "").slice(0, 16), rowNum;
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (err) { return { ok: false, code: "busy", message: "We're busy right now. Please try again in a moment." }; }
  try {
    if (blockedDates().indexOf(d.date) > -1) return { ok: false, code: "full" };
    var day = countDays()[d.date] || { count: 0, slots: [] };
    if (day.count >= SETTINGS.MAX_BOOKINGS_PER_DAY) return { ok: false, code: "full" };
    if (day.slots.indexOf(d.slot) > -1) return { ok: false, code: "slot_taken" };

    ref = makeRef();
    var sheet = bookingsSheet(), p = d.date.split("-");
    var row = {
      "Ref": ref, "Created": new Date(), "Status": "Awaiting payment",
      "Move date": new Date(+p[0], +p[1] - 1, +p[2]), "Slot": quote.slotLabel, "Package": quote.pkg.name,
      "Extras": quote.extrasText, "Total (£)": quote.total, "Paid (£)": "",
      "Name": clean(d.name), "Phone": textCell(d.phone), "Email": clean(d.email),
      "From": clean(d.from), "From access": clean(d.fromAccess), "From parking": clean(d.fromParking),
      "To": clean(d.to), "To access": clean(d.toAccess), "To parking": clean(d.toParking),
      "Notes": clean(d.notes), "Stripe session": "", "Slot id": d.slot, "Token": token
    };
    sheet.appendRow(HEADERS.map(function (h) { return row[h]; }));
    rowNum = sheet.getLastRow();
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }

  // Create the Stripe payment page
  try {
    var session = createCheckout(sk, ref, token, d, quote);
    setCell(rowNum, "Stripe session", session.id);
    return { ok: true, ref: ref, url: session.url };
  } catch (err) {
    console.error(err);
    setCell(rowNum, "Status", "Expired");   // release the slot again
    return { ok: false, code: "error", message: "We couldn't open the payment page. Please try again, or WhatsApp us on " + SETTINGS.WHATSAPP + "." };
  }
}

function createCheckout(sk, ref, token, d, q) {
  var nice = niceDate(d.date);
  var f = {
    "mode": "payment",
    "customer_email": d.email,
    "client_reference_id": ref,
    "metadata[ref]": ref,
    "metadata[move_date]": d.date,
    "metadata[slot]": d.slot,
    "payment_intent_data[description]": "ShiftMe " + ref + ", " + q.pkg.name + ", " + nice,
    "payment_intent_data[metadata][ref]": ref,
    "expires_at": String(Math.floor(Date.now() / 1000) + SETTINGS.HOLD_MINUTES * 60 + 60),
    "success_url": SETTINGS.SITE_URL + "?paid={CHECKOUT_SESSION_ID}#book",
    "cancel_url": SETTINGS.SITE_URL + "?cancelled=" + encodeURIComponent(ref) + "&t=" + token + "#book",
    "locale": "en-GB"
  };
  var lines = [{ name: q.pkg.name + " removal", desc: nice + ", " + q.slotLabel, amount: q.pkg.price, qty: 1 }]
    .concat(q.extras.map(function (x) { return { name: x.name, desc: x.unitLabel, amount: x.unit, qty: x.qty }; }));
  lines.forEach(function (l, i) {
    var k = "line_items[" + i + "]";
    f[k + "[quantity]"] = String(l.qty);
    f[k + "[price_data][currency]"] = "gbp";
    f[k + "[price_data][unit_amount]"] = String(Math.round(l.amount * 100));
    f[k + "[price_data][product_data][name]"] = l.name;
    if (l.desc) f[k + "[price_data][product_data][description]"] = l.desc;
  });
  return stripe(sk, "post", "checkout/sessions", f);
}

/* ---------- 2. Customer comes back from Stripe ---------- */
function confirmPayment(sessionId) {
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId || "")) return { ok: false, code: "invalid" };
  var session = stripe(stripeKey(), "get", "checkout/sessions/" + sessionId);
  var r = applySession(session);
  if (!r) return { ok: false, code: "not_found", message: "We couldn't find your booking. Please WhatsApp us on " + SETTINGS.WHATSAPP + "." };
  return { ok: true, paid: r.status === "Paid" || r.status === "Completed", status: r.status, ref: r.ref, email: r.email, total: r.total, date: r.date, slot: r.slot, pkg: r.pkg };
}

/* ---------- Customer pressed Back on the Stripe page ---------- */
function cancelUnpaid(ref, token) {
  var found = findRow("Ref", ref);
  if (!found || !token || found.get("Token") !== token) return { ok: false, code: "not_found" };
  if (found.get("Status") !== "Awaiting payment") return { ok: true, status: found.get("Status") };
  var sid = found.get("Stripe session");
  if (sid) {
    var session = stripe(stripeKey(), "get", "checkout/sessions/" + sid);
    if (session.payment_status === "paid") { applySession(session); return { ok: true, status: "Paid" }; }
    if (session.status === "open") { try { stripe(stripeKey(), "post", "checkout/sessions/" + sid + "/expire", {}); } catch (e) { console.error(e); } }
  }
  setCell(found.row, "Status", "Expired");
  return { ok: true, status: "Expired" };
}

/* ---------- Runs every 5 minutes ---------- */
function reconcile() {
  var sk = stripeKey(); if (!sk) return;
  var sheet = bookingsSheet(); if (sheet.getLastRow() < 2) return;
  var col = colMap(sheet);
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  rows.forEach(function (r, i) {
    if (r[col["Status"]] !== "Awaiting payment") return;
    var sid = r[col["Stripe session"]], created = r[col["Created"]];
    var ageMin = created instanceof Date ? (Date.now() - created.getTime()) / 60000 : 999;
    if (!sid) { if (ageMin > 10) setCell(i + 2, "Status", "Expired"); return; }
    try { applySession(stripe(sk, "get", "checkout/sessions/" + sid)); } catch (e) { console.error(e); }
  });
  try { syncCalendar(); } catch (e) { console.error(e); }
}

/* Updates the sheet from a Stripe session. Sends emails the first time a booking becomes Paid. */
function applySession(session) {
  var ref = session.client_reference_id || (session.metadata && session.metadata.ref);
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  var found, justPaid = false;
  try {
    found = findRow("Ref", ref);
    if (!found || found.get("Stripe session") !== session.id) return null;
    var status = found.get("Status");
    if (session.payment_status === "paid" && status !== "Paid" && status !== "Completed") {
      setCell(found.row, "Status", "Paid");
      setCell(found.row, "Paid (£)", (session.amount_total || 0) / 100);
      justPaid = true;
    } else if (session.status === "expired" && status === "Awaiting payment") {
      setCell(found.row, "Status", "Expired");
    }
    SpreadsheetApp.flush();
    found = findRow("Ref", ref);
  } finally { lock.releaseLock(); }
  if (justPaid) {
    try { sendPaidEmails(found); } catch (e) { console.error(e); }
    try { syncCalendar(); } catch (e) { console.error(e); }
  }
  return {
    status: found.get("Status"), ref: ref, email: found.get("Email"), total: found.get("Total (£)"),
    date: key(found.get("Move date")), slot: found.get("Slot"), pkg: found.get("Package")
  };
}

/* =========================================================================
   PRICES (read from the website's config.js so there's only one price list)
   ========================================================================= */
function siteConfig() {
  var cache = CacheService.getScriptCache(), hit = cache.get("site_config");
  if (hit) return JSON.parse(hit);
  var lastErr;
  for (var i = 0; i < SETTINGS.CONFIG_URLS.length; i++) {
    try {
      var res = UrlFetchApp.fetch(SETTINGS.CONFIG_URLS[i] + "?t=" + Date.now(), { muteHttpExceptions: true });
      if (res.getResponseCode() !== 200) continue;
      var win = {};
      new Function("window", res.getContentText())(win);
      var cfg = win.SHIFTME_CONFIG;
      if (cfg && cfg.PACKAGES) { cache.put("site_config", JSON.stringify(cfg), 300); return cfg; }
    } catch (e) { lastErr = e; }
  }
  throw new Error("Could not load prices from the website. " + (lastErr || ""));
}

function priceBooking(cfg, d) {
  var pkg = (cfg.PACKAGES || []).filter(function (p) { return p.id === d.packageId; })[0];
  if (!pkg) return { error: "Please choose a move package." };
  var slot = (cfg.SLOTS || []).filter(function (s) { return s.id === d.slot; })[0];
  if (!slot) return { error: "Please pick a morning or afternoon arrival." };
  var dp = String(d.date || "").split("-"), wd = new Date(+dp[0], +dp[1] - 1, +dp[2]).getDay();
  if (slot.days && slot.days.indexOf(wd) === -1) return { error: "That arrival time isn't available on that day. Please pick another time." };
  var extras = [], total = pkg.price;
  (d.extras || []).forEach(function (x) {
    var a = (cfg.ADDONS || []).filter(function (y) { return y.id === x.id; })[0];
    var qty = Math.floor(Number(x.qty) || 0);
    if (!a || qty <= 0) return;
    if (a.per === "once") qty = 1;
    else if (a.per === "hour") qty = Math.min(Math.max(qty, a.min || 1), 20);
    else qty = Math.min(qty, 20);
    var label = a.per === "hour" ? a.name + " (" + qty + " hr" + (qty > 1 ? "s" : "") + ")" : (a.per === "item" && qty > 1 ? a.name + " x" + qty : a.name);
    extras.push({ name: a.name, label: label, unit: a.price, qty: qty, cost: a.price * qty,
      unitLabel: a.per === "hour" ? "£" + a.price + " an hour" : (a.per === "item" ? "£" + a.price + " each" : "") });
    total += a.price * qty;
  });
  total = Math.round(total * 100) / 100;
  return {
    pkg: pkg, extras: extras, total: total,
    slotLabel: slot.label + " (" + slot.time + ")",
    extrasText: extras.map(function (x) { return x.label + " " + money(x.cost); }).join(", ")
  };
}

function checkDetails(cfg, d) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date || "")) return "Please pick a date.";
  var p = d.date.split("-"), day = new Date(+p[0], +p[1] - 1, +p[2]);
  var today = new Date(); today.setHours(0, 0, 0, 0);
  var minD = new Date(today); minD.setDate(minD.getDate() + (cfg.MIN_NOTICE_DAYS || 1));
  var maxD = new Date(today); maxD.setDate(maxD.getDate() + (cfg.BOOK_AHEAD_DAYS || 120));
  if (day < minD) return "Please pick a later date.";
  if (day > maxD) return "That date is too far ahead to book online. Please WhatsApp us.";
  if ((cfg.CLOSED_WEEKDAYS || []).indexOf(day.getDay()) > -1) return "We're closed that day. Please pick another date.";
  if (!d.name || !d.phone || !d.email || !d.from || !d.to) return "Please fill in your name, contact details and both addresses.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) return "Please check your email address.";
  return "";
}

/* =========================================================================
   AVAILABILITY
   ========================================================================= */
function countDays() {
  var sheet = bookingsSheet(), days = {};
  if (!sheet || sheet.getLastRow() < 2) return days;
  var col = colMap(sheet);
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  var todayKey = key(new Date()), holdMs = (SETTINGS.HOLD_MINUTES + 5) * 60000;
  rows.forEach(function (r) {
    var status = String(r[col["Status"]] || "").toLowerCase(), d = r[col["Move date"]];
    if (!d || status === "cancelled" || status === "expired") return;
    if (status === "awaiting payment") {
      var c = r[col["Created"]];
      if (!(c instanceof Date) || Date.now() - c.getTime() > holdMs) return;   // payment window has passed
    }
    var k = key(d);
    if (!k || k < todayKey) return;
    days[k] = days[k] || { count: 0, slots: [] };
    days[k].count++;
    var slotId = String((col["Slot id"] != null && r[col["Slot id"]]) || guessSlot(r[col["Slot"]]));
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

/* =========================================================================
   GOOGLE CALENDAR
   Adds Paid and Confirmed bookings (including ones you type in yourself) to the
   "ShiftMe Jobs" calendar, and removes the event if you change Status to Cancelled.
   Runs straight after payment and every 5 minutes.
   ========================================================================= */
function jobsCalendar() {
  var cals = CalendarApp.getCalendarsByName(SETTINGS.CALENDAR_NAME);
  if (cals.length) return cals[0];
  return CalendarApp.createCalendar(SETTINGS.CALENDAR_NAME, { color: CalendarApp.Color.GREEN, timeZone: SETTINGS.TIMEZONE });
}
function syncCalendar() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return;
  try {
    var sheet = bookingsSheet(); if (sheet.getLastRow() < 2) return;
    var col = colMap(sheet); if (col["Calendar event"] == null) return;   // run setup() first
    var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
    var cal = null;
    rows.forEach(function (r, i) {
      var status = String(r[col["Status"]] || "").toLowerCase();
      var eventId = r[col["Calendar event"]];
      var wanted = (status === "paid" || status === "confirmed" || status === "completed") && r[col["Move date"]];
      if (wanted && !eventId) {
        cal = cal || jobsCalendar();
        var ev = createJobEvent(cal, r, col);
        if (ev) setCell(i + 2, "Calendar event", ev.getId());
      } else if (!wanted && eventId && (status === "cancelled" || status === "expired")) {
        cal = cal || jobsCalendar();
        try { var old = cal.getEventById(eventId); if (old) old.deleteEvent(); } catch (e) { console.error(e); }
        setCell(i + 2, "Calendar event", "");
      }
    });
  } finally { lock.releaseLock(); }
}
function createJobEvent(cal, r, col) {
  var day = key(r[col["Move date"]]); if (!day) return null;
  var slotId = String(r[col["Slot id"]] || guessSlot(r[col["Slot"]]) || "morning");
  var start = Utilities.parseDate(day + " " + (SETTINGS.SLOT_START[slotId] || "09:00"), SETTINGS.TIMEZONE, "yyyy-MM-dd HH:mm");
  var end = new Date(start.getTime() + SETTINGS.JOB_HOURS * 3600000);
  var phone = String(r[col["Phone"]] || "").replace(/^'/, "");
  var title = r[col["Package"]] + ", " + r[col["Name"]] + " (" + r[col["Ref"]] + ")";
  var desc = [
    "Ref: " + r[col["Ref"]],
    "Customer: " + r[col["Name"]] + ", " + phone,
    "Email: " + r[col["Email"]],
    "",
    "From: " + r[col["From"]] + " (" + r[col["From access"]] + ", " + r[col["From parking"]] + ")",
    "To: " + r[col["To"]] + " (" + r[col["To access"]] + ", " + r[col["To parking"]] + ")",
    "",
    "Move: " + r[col["Package"]],
    r[col["Extras"]] ? "Extras: " + r[col["Extras"]] : "",
    r[col["Notes"]] ? "Notes: " + r[col["Notes"]] : "",
    "Paid: " + (r[col["Paid (£)"]] !== "" ? money(r[col["Paid (£)"]]) : "not paid online")
  ].filter(function (x, i, a) { return x !== "" || (a[i - 1] !== ""); }).join("\n");
  var ev = cal.createEvent(title, start, end, { description: desc, location: String(r[col["From"]] || "") });
  ev.addPopupReminder(24 * 60);   // reminder the day before
  ev.addPopupReminder(60);        // and an hour before
  return ev;
}

/* =========================================================================
   EMAILS (sent once payment is received)
   ========================================================================= */
function sendPaidEmails(f) {
  var nice = niceDate(key(f.get("Move date")));
  var lines = [
    "Reference: " + f.get("Ref"),
    "Date: " + nice + ", " + f.get("Slot"),
    "Move: " + f.get("Package"),
    f.get("Extras") ? "Extras: " + f.get("Extras") : "",
    "From: " + f.get("From") + " (" + f.get("From access") + ", " + f.get("From parking") + ")",
    "To: " + f.get("To") + " (" + f.get("To access") + ", " + f.get("To parking") + ")",
    f.get("Notes") ? "Notes: " + f.get("Notes") : "",
    "Paid: " + money(Number(f.get("Paid (£)")) || Number(f.get("Total (£)")))
  ].filter(Boolean).join("\n");
  var first = String(f.get("Name")).split(" ")[0];

  MailApp.sendEmail({
    to: SETTINGS.BUSINESS_EMAIL,
    replyTo: f.get("Email"),
    subject: "Paid booking " + f.get("Ref") + ": " + nice + " " + f.get("Slot"),
    body: "New paid ShiftMe booking\n\n" + lines + "\n\nCustomer: " + f.get("Name") + "\nPhone: " + String(f.get("Phone")).replace(/^'/, "") + "\nEmail: " + f.get("Email")
  });
  MailApp.sendEmail({
    to: f.get("Email"),
    replyTo: SETTINGS.BUSINESS_EMAIL,
    name: SETTINGS.BUSINESS_NAME,
    subject: "Your ShiftMe move is booked: " + nice,
    body: "Hi " + first + ",\n\nThanks for booking with ShiftMe. Your payment has been received and your move is confirmed.\n\n" + lines +
      "\n\nNeed to change anything? Reply to this email or WhatsApp us on " + SETTINGS.WHATSAPP + ".\n\nThe ShiftMe team\nTap. Book. Move."
  });
}

/* =========================================================================
   HELPERS
   ========================================================================= */
function stripeKey() { return PropertiesService.getScriptProperties().getProperty("STRIPE_SECRET_KEY"); }
function stripe(sk, method, path, form) {
  var opts = { method: method, headers: { Authorization: "Bearer " + sk }, muteHttpExceptions: true };
  if (form) opts.payload = form;
  var res = UrlFetchApp.fetch("https://api.stripe.com/v1/" + path, opts);
  var body = JSON.parse(res.getContentText());
  if (res.getResponseCode() >= 300) throw new Error("Stripe: " + (body.error && body.error.message));
  return body;
}
function bookingsSheet() { return SpreadsheetApp.getActive().getSheetByName(SETTINGS.BOOKINGS_TAB); }
function colMap(sheet) {
  var h = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0], m = {};
  h.forEach(function (name, i) { m[String(name).trim()] = i; });
  return m;
}
function findRow(header, value) {
  if (!value) return null;
  var sheet = bookingsSheet(); if (sheet.getLastRow() < 2) return null;
  var col = colMap(sheet);
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  for (var i = rows.length - 1; i >= 0; i--) {
    if (String(rows[i][col[header]]) === String(value)) {
      var r = rows[i];
      return { row: i + 2, get: function (h) { return r[col[h]]; } };
    }
  }
  return null;
}
function setCell(row, header, value) {
  var sheet = bookingsSheet(), col = colMap(sheet);
  sheet.getRange(row, col[header] + 1).setValue(value);
}
function key(d) {
  if (!d) return "";
  if (!(d instanceof Date)) {
    var s = String(d).trim(), m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    if (m) d = new Date(+m[3], +m[2] - 1, +m[1]); else d = new Date(s);
    if (isNaN(d)) return "";
  }
  return Utilities.formatDate(d, SETTINGS.TIMEZONE, "yyyy-MM-dd");
}
function niceDate(ymd) { var p = ymd.split("-"); return Utilities.formatDate(new Date(+p[0], +p[1] - 1, +p[2]), SETTINGS.TIMEZONE, "EEEE d MMMM yyyy"); }
function makeRef() { return "SM" + Utilities.formatDate(new Date(), SETTINGS.TIMEZONE, "yyMMdd") + "-" + Math.floor(1000 + Math.random() * 9000); }
function clean(v) { v = String(v == null ? "" : v).slice(0, 1000); return /^[=+\-@]/.test(v) ? "'" + v : v; }   // stops formula injection
function textCell(v) { v = clean(v); return v.charAt(0) === "'" ? v : "'" + v; }                                    // keeps the leading 0 on phone numbers
function money(n) { n = Math.round(Number(n) * 100) / 100; return "£" + (n % 1 === 0 ? n : n.toFixed(2)); }
function json(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
