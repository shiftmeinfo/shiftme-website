/* ShiftMe website logic. Prices and rules live in config.js */
(function () {
  "use strict";
  var C = window.SHIFTME_CONFIG;
  var DEMO = !C.API_URL;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var PK = {}; C.PACKAGES.forEach(function (p) { PK[p.id] = p; });
  var AD = {}; C.ADDONS.forEach(function (a) { AD[a.id] = a; });
  var GROUP_LABEL = { flat: "Flats", house: "Houses", small: "Call outs" };

  var S = {
    pkg: "f1", addons: {}, date: null, slot: null, step: 1,
    avail: { days: {}, blocked: [] }, loaded: false, loading: false,
    month: null, submitting: false
  };

  /* ---------- helpers ---------- */
  function money(n) {
    var r = Math.round(n * 100) / 100;
    return "£" + (r % 1 === 0 ? r.toLocaleString("en-GB") : r.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function ymd(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function parseYmd(s) { var p = s.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function today() { var d = new Date(); d.setHours(0, 0, 0, 0); return d; }
  function prettyDate(s, long) {
    return parseYmd(s).toLocaleDateString("en-GB", long
      ? { weekday: "long", day: "numeric", month: "long", year: "numeric" }
      : { weekday: "short", day: "numeric", month: "short" });
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function slotById(id) { return C.SLOTS.filter(function (s) { return s.id === id; })[0]; }
  function addonCost(id) { var a = AD[id], q = S.addons[id] || 0; return q * a.price; }
  function addonLabel(id) {
    var a = AD[id], q = S.addons[id];
    if (a.per === "hour") return a.name + " (" + q + " hr" + (q > 1 ? "s" : "") + ")";
    if (a.per === "item" && q > 1) return a.name + " x" + q;
    return a.name;
  }
  function chosenAddons() { return Object.keys(S.addons).filter(function (k) { return S.addons[k] > 0; }); }
  function total() { return PK[S.pkg].price + chosenAddons().reduce(function (t, k) { return t + addonCost(k); }, 0); }
  var minDate = addDays(today(), C.MIN_NOTICE_DAYS);
  var maxDate = addDays(today(), C.BOOK_AHEAD_DAYS);

  /* ---------- contact links ---------- */
  var waUrl = "https://wa.me/" + C.WHATSAPP + "?text=" + encodeURIComponent("Hi ShiftMe, I'd like to ask about a move.");
  ["heroWhatsapp", "cWhatsapp", "waFloat"].forEach(function (id) { var el = document.getElementById(id); el.href = waUrl; el.target = "_blank"; el.rel = "noopener"; });
  ["heroPhone", "cPhone"].forEach(function (id) { document.getElementById(id).href = "tel:" + C.PHONE_LINK; });
  $("#cEmail").href = "mailto:" + C.EMAIL;
  $("#cInsta").href = "https://instagram.com/" + C.INSTAGRAM;
  $("#cWhatsappText").textContent = "+" + C.WHATSAPP.replace(/^44/, "44 ");
  $("#cPhoneText").textContent = C.PHONE_DISPLAY;
  $("#cEmailText").textContent = C.EMAIL;
  $("#cInstaText").textContent = "@" + C.INSTAGRAM;
  $("#joinTeam").href = "mailto:" + C.EMAIL + "?subject=" + encodeURIComponent("Joining the ShiftMe team");
  $("#year").textContent = new Date().getFullYear();
  if (DEMO) $("#demoBanner").hidden = false;

  /* ---------- tabs ---------- */
  function wireSeg(el, onPick) {
    $$("button", el).forEach(function (b) {
      b.addEventListener("click", function () {
        $$("button", el).forEach(function (x) { x.setAttribute("aria-selected", x === b ? "true" : "false"); });
        onPick(b.dataset.group);
      });
    });
  }
  function setSeg(el, group) { $$("button", el).forEach(function (x) { x.setAttribute("aria-selected", x.dataset.group === group ? "true" : "false"); }); }

  /* ---------- hero quote ---------- */
  var qGroup = "flat", shownPrice = 0, shownLoad = 0;
  function sizeLabel(p) {
    if (p.group === "small") return p.size + (p.size > 1 ? " movers" : " mover");
    return p.size + " bed";
  }
  function renderSizes() {
    var list = C.PACKAGES.filter(function (p) { return p.group === qGroup; });
    if (PK[S.pkg].group !== qGroup) S.pkg = list[0].id;
    $("#qSizes").innerHTML = list.map(function (p) {
      return '<button role="radio" aria-checked="' + (p.id === S.pkg) + '" data-id="' + p.id + '">' + sizeLabel(p) + "<small>" + money(p.price) + "</small></button>";
    }).join("");
    $$("#qSizes button").forEach(function (b) {
      b.addEventListener("click", function () { choosePkg(b.dataset.id); });
    });
  }
  function renderQuote() {
    var p = PK[S.pkg];
    $$("#qSizes button").forEach(function (b) { b.setAttribute("aria-checked", b.dataset.id === S.pkg ? "true" : "false"); });
    countTo($("#qPrice"), shownPrice, p.price); shownPrice = p.price;
    $("#qName").textContent = p.name;
    $("#qItems").innerHTML = p.items.map(function (i) { return "<li>" + esc(i) + "</li>"; }).join("");
    loadVan(p.load);
  }
  function countTo(el, from, to) {
    var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || from === 0) { el.textContent = money(to); return; }
    var t0 = performance.now(), dur = 420;
    (function tick(t) {
      var k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      var v = from + (to - from) * e;
      el.textContent = k < 1 ? "£" + Math.round(v).toLocaleString("en-GB") : money(to);
      if (k < 1) requestAnimationFrame(tick);
    })(t0);
  }
  function loadVan(n) {
    var g = $("#vanLoad"), NS = "http://www.w3.org/2000/svg";
    var slots = [];
    for (var r = 0; r < 3; r++) for (var c = 0; c < 5; c++) slots.push({ x: 21 + c * 35.5, y: 89 - (r + 1) * 20.5 });
    var count = Math.min(n, 15);
    while (g.childNodes.length > count) g.removeChild(g.lastChild);
    for (var i = g.childNodes.length; i < count; i++) {
      var rect = document.createElementNS(NS, "rect");
      rect.setAttribute("x", slots[i].x); rect.setAttribute("y", slots[i].y);
      rect.setAttribute("width", 33); rect.setAttribute("height", 19);
      rect.setAttribute("class", "pop");
      rect.style.animationDelay = ((i - shownLoad) * 45) + "ms";
      g.appendChild(rect);
    }
    if (n !== shownLoad) { var v = $(".van"); v.classList.remove("bump"); void v.getBoundingClientRect(); v.classList.add("bump"); }
    shownLoad = count;
  }
  wireSeg($("#qGroup"), function (g) { qGroup = g; renderSizes(); renderQuote(); syncAll(); });
  $("#qIncluded").addEventListener("click", function () {
    var open = $("#qItems").hidden;
    $("#qItems").hidden = !open; this.setAttribute("aria-expanded", open ? "true" : "false");
    this.textContent = open ? "Hide what's included" : "What's included";
  });
  $("#qBook").addEventListener("click", function () { goStep(2); scrollToBook(); });

  function priceUnit(a) {
    if (a.per === "hour") return money(a.price) + " an hour";
    if (a.per === "item") return money(a.price) + " each";
    return money(a.price);
  }

  /* ---------- step 1: package + extras ---------- */
  function renderPkgSelect() {
    $("#pkgSelect").innerHTML = ["flat", "house", "small"].map(function (g) {
      return '<div class="pkg-group"><p>' + GROUP_LABEL[g] + '</p><div class="pkg-options">' +
        C.PACKAGES.filter(function (p) { return p.group === g; }).map(function (p) {
          return '<div class="pkg-opt"><input type="radio" name="pkg" id="pk_' + p.id + '" value="' + p.id + '"' + (p.id === S.pkg ? " checked" : "") + '>' +
            '<label for="pk_' + p.id + '"><b>' + esc(p.name.replace(/^Call out, /, "")) + "</b><span>" + money(p.price) + "</span></label></div>";
        }).join("") + "</div></div>";
    }).join("");
    $$("#pkgSelect input").forEach(function (i) { i.addEventListener("change", function () { choosePkg(i.value); }); });
  }
  function renderAddons() {
    $("#addonList").innerHTML = C.ADDONS.map(function (a) {
      var q = S.addons[a.id] || 0;
      var ctrl = a.per === "once"
        ? '<label class="toggle"><input type="checkbox" data-addon="' + a.id + '"' + (q ? " checked" : "") + ' aria-label="Add ' + esc(a.name) + '"><span></span></label>'
        : '<div class="stepper"><button type="button" data-dec="' + a.id + '" aria-label="Fewer">−</button><output aria-live="polite">' + q + '</output><button type="button" data-inc="' + a.id + '" aria-label="More">+</button></div>';
      return '<div class="addon' + (q ? " on" : "") + '" data-row="' + a.id + '"><div class="addon-info"><b>' + esc(a.name) + "</b><span>" + priceUnit(a) + (a.per === "hour" && a.min > 1 ? ", " + a.min + " hr min" : "") + "</span></div>" + ctrl + "</div>";
    }).join("");
    $$("#addonList [data-addon]").forEach(function (c) { c.addEventListener("change", function () { setAddon(c.dataset.addon, c.checked ? 1 : 0); }); });
    $$("#addonList [data-inc]").forEach(function (b) { b.addEventListener("click", function () { var a = AD[b.dataset.inc], q = S.addons[a.id] || 0; setAddon(a.id, q === 0 && a.per === "hour" ? (a.min || 1) : Math.min(q + 1, 20)); }); });
    $$("#addonList [data-dec]").forEach(function (b) { b.addEventListener("click", function () { var a = AD[b.dataset.dec], q = S.addons[a.id] || 0; setAddon(a.id, a.per === "hour" && q <= (a.min || 1) ? 0 : Math.max(q - 1, 0)); }); });
  }
  function setAddon(id, q) {
    S.addons[id] = q;
    var row = $('[data-row="' + id + '"]');
    row.classList.toggle("on", q > 0);
    var out = $("output", row); if (out) out.textContent = q;
    renderSummary();
  }
  function choosePkg(id) {
    S.pkg = id;
    var g = PK[id].group;
    if (g !== qGroup) { qGroup = g; setSeg($("#qGroup"), g); renderSizes(); }
    var r = document.getElementById("pk_" + id); if (r) r.checked = true;
    renderQuote(); renderSummary();
  }
  function syncAll() { var r = document.getElementById("pk_" + S.pkg); if (r) r.checked = true; renderSummary(); }

  /* ---------- availability ---------- */
  function demoStore(read, val) {
    try {
      if (read) return JSON.parse(localStorage.getItem("shiftme_demo") || "[]");
      localStorage.setItem("shiftme_demo", JSON.stringify(val));
    } catch (e) { return read ? (window.__demo || []) : (window.__demo = val); }
  }
  function demoAvailability() {
    var t = today(), days = {};
    function add(off, slot) { var k = ymd(addDays(t, off)); days[k] = days[k] || { count: 0, slots: [] }; days[k].count++; if (slot) days[k].slots.push(slot); }
    add(3, "morning"); add(3, "afternoon"); add(5, "morning"); add(9, "morning"); add(9, "afternoon"); add(11, "afternoon"); add(16, "morning"); add(16, "afternoon");
    demoStore(true).forEach(function (b) { days[b.date] = days[b.date] || { count: 0, slots: [] }; days[b.date].count++; days[b.date].slots.push(b.slot); });
    return { ok: true, days: days, blocked: [ymd(addDays(t, 20))] };
  }
  function loadAvailability() {
    S.loading = true; renderCalendar();
    var done = function (data) {
      S.loading = false;
      if (data && data.ok) { S.avail = { days: data.days || {}, blocked: data.blocked || [] }; S.loaded = true; if (!$("#calStatus").dataset.err) $("#calStatus").textContent = ""; }
      else { $("#calStatus").textContent = "We couldn't load live availability. Please try again, or WhatsApp us."; }
      if (S.date && dayState(S.date) !== "free" && dayState(S.date) !== "one") { S.date = null; S.slot = null; }
      renderCalendar(); renderSlots(); renderSummary();
    };
    if (DEMO) { setTimeout(function () { done(demoAvailability()); }, 350); return; }
    fetch(C.API_URL + "?action=availability&t=" + Date.now())
      .then(function (r) { return r.json(); })
      .then(done)
      .catch(function () { done(null); });
  }
  function dayInfo(ds) { return S.avail.days[ds] || { count: 0, slots: [] }; }
  function dayState(ds) {
    var d = parseYmd(ds);
    if (d < minDate || d > maxDate) return "off";
    if (C.CLOSED_WEEKDAYS.indexOf(d.getDay()) > -1 || S.avail.blocked.indexOf(ds) > -1) return "closed";
    var n = dayInfo(ds).count, cap = Math.min(C.MAX_BOOKINGS_PER_DAY, daySlots(ds).length);
    if (n >= cap || !freeSlots(ds).length) return "full";
    if (n > 0 && cap - n === 1) return "one";
    return "free";
  }

  /* ---------- calendar ---------- */
  S.month = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  function renderCalendar() {
    var m = S.month, y = m.getFullYear(), mo = m.getMonth();
    $("#calMonth").textContent = m.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
    $("#calPrev").disabled = (y === minDate.getFullYear() && mo === minDate.getMonth());
    $("#calNext").disabled = (y > maxDate.getFullYear() || (y === maxDate.getFullYear() && mo >= maxDate.getMonth()));
    var lead = (new Date(y, mo, 1).getDay() + 6) % 7, dim = new Date(y, mo + 1, 0).getDate(), html = "", tStr = ymd(today());
    for (var i = 0; i < lead; i++) html += '<span class="day empty" aria-hidden="true"></span>';
    for (var d = 1; d <= dim; d++) {
      var ds = y + "-" + pad(mo + 1) + "-" + pad(d);
      if (S.loading && !S.loaded) { html += '<span class="day skeleton">' + d + "</span>"; continue; }
      var st = dayState(ds), cls = "day", label = prettyDate(ds, true), inner = d, dis = false;
      if (st === "off") { dis = true; label += ", not available"; }
      else if (st === "closed") { dis = true; cls += " closed"; label += ", closed"; }
      else if (st === "full") { dis = true; cls += " full"; label += ", fully booked"; inner = d + '<span class="tag">Full</span>'; }
      else if (st === "one") { cls += " one"; label += ", 1 slot left"; inner = d + '<span class="dot"></span>'; }
      else { label += ", available"; inner = d + '<span class="dot"></span>'; }
      if (ds === tStr) cls += " today";
      if (ds === S.date) cls += " selected";
      html += '<button type="button" class="' + cls + '" data-date="' + ds + '" aria-label="' + label + '"' + (dis ? " disabled" : "") + (ds === S.date ? ' aria-pressed="true"' : "") + ">" + inner + "</button>";
    }
    $("#calGrid").innerHTML = html;
    $$("#calGrid button.day").forEach(function (b) { b.addEventListener("click", function () { pickDate(b.dataset.date); }); });
  }
  $("#calPrev").addEventListener("click", function () { S.month = new Date(S.month.getFullYear(), S.month.getMonth() - 1, 1); renderCalendar(); });
  $("#calNext").addEventListener("click", function () { S.month = new Date(S.month.getFullYear(), S.month.getMonth() + 1, 1); renderCalendar(); });

  function daySlots(ds) {
    var wd = parseYmd(ds).getDay();
    return C.SLOTS.filter(function (s) { return !s.days || s.days.indexOf(wd) > -1; });
  }
  function freeSlots(ds) {
    var taken = dayInfo(ds).slots || [];
    return daySlots(ds).filter(function (s) { return taken.indexOf(s.id) === -1; });
  }
  function pickDate(ds) {
    S.date = ds;
    var free = freeSlots(ds);
    if (!S.slot || free.map(function (s) { return s.id; }).indexOf(S.slot) === -1) S.slot = free.length === 1 ? free[0].id : null;
    clearErr();
    renderCalendar(); renderSlots(); renderSummary();
  }
  function renderSlots() {
    if (!S.date) { $("#slots").hidden = true; return; }
    $("#slots").hidden = false;
    $("#slotDate").textContent = prettyDate(S.date);
    var free = freeSlots(S.date).map(function (s) { return s.id; });
    $("#slotRow").innerHTML = daySlots(S.date).map(function (s) {
      var ok = free.indexOf(s.id) > -1;
      return '<button type="button" class="slot" data-slot="' + s.id + '" aria-pressed="' + (S.slot === s.id) + '"' + (ok ? "" : " disabled") + "><b>" + s.label + "</b><span>" + (ok ? s.time : "Taken") + "</span></button>";
    }).join("");
    $$("#slotRow .slot").forEach(function (b) { b.addEventListener("click", function () { S.slot = b.dataset.slot; clearErr(); renderSlots(); renderSummary(); }); });
  }

  /* ---------- summary ---------- */
  function renderSummary() {
    $("#sMove").textContent = PK[S.pkg].name + ", " + money(PK[S.pkg].price);
    $("#sDate").textContent = S.date ? prettyDate(S.date) + (S.slot ? ", " + slotById(S.slot).label.toLowerCase() + " (" + slotById(S.slot).time + ")" : "") : "Not chosen";
    var ex = chosenAddons();
    $("#sExtrasRow").hidden = !ex.length;
    $("#sExtras").textContent = ex.map(addonLabel).join(", ");
    $("#sTotal").textContent = money(total());
    $("#payAmt").textContent = "Pay " + money(total()) + " securely";
  }

  /* ---------- wizard ---------- */
  function scrollToBook() { document.getElementById("book").scrollIntoView({ behavior: "smooth", block: "start" }); }
  function clearErr() { $("#formError").hidden = true; var st = $("#calStatus"); if (st.dataset.err) { st.textContent = ""; delete st.dataset.err; } }
  function stepError(step, msg) {
    if (step === 2) { var st = $("#calStatus"); st.textContent = msg; st.dataset.err = "1"; }
    else { $("#formError").textContent = msg; $("#formError").hidden = false; }
  }
  function validate(step) {
    if (step === 2) {
      if (!S.date) { stepError(2, "Pick a date to continue."); return false; }
      if (!S.slot) { stepError(2, "Pick a morning or afternoon arrival."); return false; }
    }
    if (step === 3) {
      var ok = true, f = $("#wizard");
      $$(".field-msg", f).forEach(function (m) { m.remove(); });
      ["name", "phone", "email", "from", "to"].forEach(function (n) {
        var el = f.elements[n], v = el.value.trim(), msg = "";
        if (!v) msg = "Please fill this in.";
        else if (n === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) msg = "Check your email address.";
        else if (n === "phone" && v.replace(/\D/g, "").length < 10) msg = "Check your mobile number.";
        el.classList.toggle("invalid", !!msg);
        if (msg) { ok = false; var s = document.createElement("span"); s.className = "field-msg"; s.textContent = msg; el.insertAdjacentElement("afterend", s); }
      });
      if (!ok) { var first = $(".invalid", f); if (first) first.focus(); }
      return ok;
    }
    return true;
  }
  function goStep(n) {
    S.step = n;
    $$("[data-panel]").forEach(function (p) { p.hidden = +p.dataset.panel !== n; });
    $$(".progress li").forEach(function (li) {
      var k = +li.dataset.step;
      li.classList.toggle("is-current", k === n); li.classList.toggle("is-done", k < n);
    });
    $(".progress").hidden = n === 5;
    if (n === 2 && !S.loaded && !S.loading) loadAvailability();
    if (n === 2 && S.loaded) { renderCalendar(); renderSlots(); }
    if (n === 4) renderReview();
  }
  $$("[data-next]").forEach(function (b) {
    b.addEventListener("click", function () {
      if (!validate(S.step)) return;
      goStep(S.step + 1);
      var legend = $('[data-panel="' + S.step + '"] legend'); if (legend) { legend.setAttribute("tabindex", "-1"); legend.focus({ preventScroll: true }); }
      scrollToBook();
    });
  });
  $$("[data-back]").forEach(function (b) { b.addEventListener("click", function () { clearErr(); goStep(S.step - 1); }); });

  function formVals() {
    var f = $("#wizard"), o = {};
    ["name", "phone", "email", "from", "fromAccess", "fromParking", "to", "toAccess", "toParking", "notes", "website"].forEach(function (n) { o[n] = f.elements[n].value.trim(); });
    return o;
  }
  function renderReview() {
    var v = formVals(), sl = slotById(S.slot);
    var rows = [
      ["Move", PK[S.pkg].name + ", " + money(PK[S.pkg].price)],
      ["Extras", chosenAddons().length ? chosenAddons().map(function (k) { return addonLabel(k) + " " + money(addonCost(k)); }).join("<br>") : "None"],
      ["Date", prettyDate(S.date, true) + "<br>" + sl.label + ", " + sl.time],
      ["From", esc(v.from) + "<br><span class='muted'>" + esc(v.fromAccess) + ", " + esc(v.fromParking) + "</span>"],
      ["To", esc(v.to) + "<br><span class='muted'>" + esc(v.toAccess) + ", " + esc(v.toParking) + "</span>"],
      ["Contact", esc(v.name) + "<br>" + esc(v.phone) + "<br>" + esc(v.email)],
      ["Total to pay now", "<strong>" + money(total()) + "</strong>"]
    ];
    if (v.notes) rows.splice(6, 0, ["Notes", esc(v.notes)]);
    $("#review").innerHTML = rows.map(function (r) { return "<div><dt>" + r[0] + "</dt><dd>" + r[1] + "</dd></div>"; }).join("");
  }

  $("#wizard").addEventListener("submit", function (e) {
    e.preventDefault();
    if (S.submitting) return;
    if (!$("#wizard").elements.agree.checked) { stepError(4, "Please confirm you've read the booking policy."); return; }
    var v = formVals(), sl = slotById(S.slot);
    var payload = {
      action: "book",
      date: S.date, slot: S.slot, slotLabel: sl.label + " (" + sl.time + ")",
      packageId: S.pkg, packageName: PK[S.pkg].name, packagePrice: PK[S.pkg].price,
      extras: chosenAddons().map(function (k) { return { id: k, qty: S.addons[k], label: addonLabel(k), cost: addonCost(k) }; }),
      total: total(),
      name: v.name, phone: v.phone, email: v.email,
      from: v.from, fromAccess: v.fromAccess, fromParking: v.fromParking,
      to: v.to, toAccess: v.toAccess, toParking: v.toParking,
      notes: v.notes, website: v.website
    };
    S.submitting = true;
    var btn = $("#submitBtn"), btnHtml = btn.innerHTML; btn.disabled = true; btn.textContent = "Opening secure payment…";
    var finish = function (res) {
      if (res && res.ok && res.url) { savePending(); window.location.href = res.url; return; }
      S.submitting = false; btn.disabled = false; btn.innerHTML = btnHtml;
      if (res && res.ok) return showDone({ ref: res.ref, email: v.email, paid: false });
      if (res && (res.code === "full" || res.code === "slot_taken")) {
        S.loaded = false; S.date = null; S.slot = null; goStep(2);
        stepError(2, "Sorry, someone just booked that slot. Please pick another time.");
        return;
      }
      stepError(4, (res && res.message) || "Your booking didn't go through. Check your connection and try again, or WhatsApp us and we'll book it for you.");
    };
    if (DEMO) {
      setTimeout(function () {
        var info = demoAvailability().days[S.date] || { count: 0, slots: [] };
        if (info.count >= C.MAX_BOOKINGS_PER_DAY) return finish({ ok: false, code: "full" });
        if (info.slots.indexOf(S.slot) > -1) return finish({ ok: false, code: "slot_taken" });
        var list = demoStore(true); list.push({ date: S.date, slot: S.slot }); demoStore(false, list);
        finish({ ok: true, ref: "SM-DEMO" + Math.floor(1000 + Math.random() * 9000), demo: true });
      }, 600);
      return;
    }
    fetch(C.API_URL, { method: "POST", body: JSON.stringify(payload) })
      .then(function (r) { return r.json(); })
      .then(finish)
      .catch(function () { finish(null); });
  });

  function showDone(r) {
    $("#doneText").innerHTML = "Your reference is <strong>" + esc(r.ref || "") + "</strong>. We've emailed your confirmation to <strong>" + esc(r.email || "you") + "</strong>.";
    $("#doneTitle").textContent = r.paid ? "Your move is booked" : "Booking received";
    $("#doneDetail").innerHTML = r.paid
      ? '<div class="dep-box"><p><strong>' + money(Number(r.total) || 0) + " paid.</strong> " + (r.date ? esc(prettyDate(r.date, true)) + (r.slot ? ", " + esc(String(r.slot).toLowerCase()) : "") + ". " : "") + "See you then!</p></div>"
      : '<div class="dep-box"><p>' + (DEMO ? "Preview mode, so no payment was taken." : "We'll be in touch to confirm your move.") + "</p></div>";
    goStep(5);
    var done = $('[data-panel="5"]'); done.focus({ preventScroll: true });
    scrollToBook();
    S.loaded = false;
  }
  function showReturnMessage(title, html) {
    $("#doneTitle").textContent = title;
    $("#doneText").innerHTML = html;
    $("#doneDetail").innerHTML = "";
    goStep(5); scrollToBook();
  }

  /* ---------- coming back from Stripe ---------- */
  function savePending() { try { sessionStorage.setItem("shiftme_pending", JSON.stringify({ pkg: S.pkg, addons: S.addons })); } catch (e) {} }
  function restorePending() {
    try { var p = JSON.parse(sessionStorage.getItem("shiftme_pending") || "null"); if (p) { S.addons = p.addons || {}; choosePkg(p.pkg); renderAddons(); } } catch (e) {}
  }
  function handleReturn() {
    var q = new URLSearchParams(location.search), paid = q.get("paid"), cancelled = q.get("cancelled");
    if (!paid && !cancelled) return false;
    try { history.replaceState(null, "", location.pathname + "#book"); } catch (e) {}
    if (paid) {
      showReturnMessage("Confirming your payment…", "This only takes a moment.");
      var tries = 0;
      (function check() {
        fetch(C.API_URL + "?action=confirm&session_id=" + encodeURIComponent(paid))
          .then(function (r) { return r.json(); })
          .then(function (res) {
            if (res.ok && res.paid) { try { sessionStorage.removeItem("shiftme_pending"); } catch (e) {} return showDone(res); }
            if (++tries < 6) return setTimeout(check, 2000);
            showReturnMessage("We're checking your payment", "If your payment went through you'll get a confirmation email shortly. Questions? WhatsApp us on +" + esc(C.WHATSAPP) + ".");
          })
          .catch(function () {
            if (++tries < 6) return setTimeout(check, 2000);
            showReturnMessage("We're checking your payment", "If your payment went through you'll get a confirmation email shortly. Questions? WhatsApp us on +" + esc(C.WHATSAPP) + ".");
          });
      })();
    } else {
      restorePending();
      fetch(C.API_URL + "?action=cancel&ref=" + encodeURIComponent(cancelled) + "&token=" + encodeURIComponent(q.get("t") || ""))
        .catch(function () {})
        .then(function () { S.loaded = false; goStep(2); stepError(2, "Payment cancelled, so nothing was charged. Pick a date to try again."); scrollToBook(); });
    }
    return true;
  }

  $("#newBooking").addEventListener("click", function () {
    $("#wizard").reset(); S.addons = {}; S.date = null; S.slot = null; S.submitting = false;
    renderAddons(); renderSummary(); goStep(1);
  });

  /* ---------- start ---------- */
  /* ---------- quick quote: postcode to postcode price ---------- */
  (function quickQuote() {
    var M = C.MILEAGE || { PER_MILE: 0.3, ROAD_FACTOR: 1.2, LONDON: { lat: 51.5074, lon: -0.1278 } };
    var LONDON_AREAS = ["E", "EC", "N", "NW", "SE", "SW", "W", "WC", "BR", "CR", "DA", "EN", "HA", "IG", "KT", "RM", "SM", "TW", "UB"];
    // Postcode area centres, only used if the postcode lookup service is unreachable
    var AREAS = {AB:[57.15,-2.15],AL:[51.76,-0.33],B:[52.48,-1.89],BA:[51.33,-2.45],BB:[53.75,-2.4],BD:[53.8,-1.8],BH:[50.74,-1.9],BL:[53.58,-2.43],BN:[50.85,-0.15],BR:[51.39,0.03],BS:[51.46,-2.59],BT:[54.6,-5.93],CA:[54.85,-3],CB:[52.2,0.13],CF:[51.5,-3.2],CH:[53.2,-2.95],CM:[51.75,0.4],CO:[51.88,0.85],CR:[51.37,-0.1],CT:[51.28,1.1],CV:[52.4,-1.5],CW:[53.1,-2.45],DA:[51.44,0.2],DD:[56.47,-2.97],DE:[52.92,-1.48],DG:[55.07,-3.6],DH:[54.8,-1.6],DL:[54.5,-1.6],DN:[53.55,-1],DT:[50.7,-2.45],DY:[52.48,-2.1],E:[51.53,-0.03],EC:[51.52,-0.09],EH:[55.94,-3.2],EN:[51.66,-0.08],EX:[50.72,-3.53],FK:[56,-3.8],FY:[53.82,-3.03],G:[55.86,-4.25],GL:[51.86,-2.24],GU:[51.24,-0.7],HA:[51.58,-0.34],HD:[53.64,-1.78],HG:[54,-1.54],HP:[51.75,-0.7],HR:[52.06,-2.72],HS:[58.2,-6.38],HU:[53.75,-0.35],HX:[53.72,-1.86],IG:[51.57,0.07],IP:[52.06,1.15],IV:[57.48,-4.22],KA:[55.6,-4.5],KT:[51.38,-0.3],KW:[58.6,-3.5],KY:[56.15,-3.15],L:[53.41,-2.98],LA:[54.05,-2.8],LD:[52.24,-3.38],LE:[52.63,-1.13],LL:[53.12,-3.8],LN:[53.23,-0.54],LS:[53.8,-1.55],LU:[51.88,-0.42],M:[53.48,-2.24],ME:[51.33,0.55],MK:[52.04,-0.76],ML:[55.78,-3.98],N:[51.57,-0.11],NE:[54.97,-1.61],NG:[52.95,-1.15],NN:[52.24,-0.89],NP:[51.58,-3],NR:[52.63,1.3],NW:[51.55,-0.18],OL:[53.54,-2.12],OX:[51.75,-1.26],PA:[55.85,-4.6],PE:[52.57,-0.24],PH:[56.4,-3.45],PL:[50.38,-4.14],PO:[50.82,-1.08],PR:[53.76,-2.7],RG:[51.45,-0.98],RH:[51.2,-0.2],RM:[51.56,0.2],S:[53.38,-1.47],SA:[51.62,-3.94],SE:[51.47,-0.06],SG:[51.9,-0.2],SK:[53.4,-2.15],SL:[51.51,-0.6],SM:[51.36,-0.19],SN:[51.56,-1.78],SO:[50.91,-1.4],SP:[51.07,-1.8],SR:[54.9,-1.38],SS:[51.55,0.7],ST:[53,-2.18],SW:[51.46,-0.17],SY:[52.71,-2.75],TA:[51.02,-3.1],TD:[55.6,-2.4],TF:[52.68,-2.45],TN:[51.13,0.26],TQ:[50.46,-3.53],TR:[50.26,-5.05],TS:[54.57,-1.23],TW:[51.45,-0.37],UB:[51.53,-0.42],W:[51.51,-0.2],WA:[53.39,-2.59],WC:[51.52,-0.12],WD:[51.66,-0.4],WF:[53.68,-1.5],WN:[53.55,-2.63],WR:[52.19,-2.22],WS:[52.58,-1.98],WV:[52.59,-2.13],YO:[53.96,-1.08],ZE:[60.15,-1.15]};
    var group = "flat", sizeSel = $("#qqSize"), lastPkg = "f2";

    function fillSizes() {
      sizeSel.innerHTML = C.PACKAGES.filter(function (p) { return p.group === group; }).map(function (p) {
        return '<option value="' + p.id + '">' + esc(p.name) + " (" + (p.group === "small" ? "from " : "") + money(p.price) + ")</option>";
      }).join("");
    }
    $$("#qqType button").forEach(function (b) {
      b.addEventListener("click", function () {
        $$("#qqType button").forEach(function (x) { x.setAttribute("aria-selected", x === b ? "true" : "false"); });
        group = b.dataset.group; fillSizes(); run();
      });
    });
    sizeSel.addEventListener("change", run);

    function clean(pc) { return String(pc).toUpperCase().replace(/\s+/g, ""); }
    function valid(pc) { return /^[A-Z]{1,2}[0-9][A-Z0-9]?[0-9][A-Z]{2}$/.test(clean(pc)); }
    function outward(pc) { var c = clean(pc); return c.slice(0, c.length - 3); }
    function pretty(pc) { var c = clean(pc); return outward(c) + " " + c.slice(-3); }
    function area(pc) { return clean(pc).match(/^[A-Z]{1,2}/)[0]; }
    function miles(a, b) {
      var R = 3958.8, t = Math.PI / 180, dLat = (b.lat - a.lat) * t, dLon = (b.lon - a.lon) * t;
      var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a.lat * t) * Math.cos(b.lat * t) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
      return 2 * R * Math.asin(Math.sqrt(h)) * M.ROAD_FACTOR;
    }
    function locate(pc) {
      function fallback() { var a = AREAS[area(pc)]; return a ? { lat: a[0], lon: a[1], london: LONDON_AREAS.indexOf(area(pc)) > -1 } : null; }
      return fetch("https://api.postcodes.io/postcodes/" + encodeURIComponent(clean(pc)))
        .then(function (r) { return r.status === 404 ? null : (r.ok ? r.json() : Promise.reject()); })
        .then(function (j) { if (!j) return null; var x = j.result; return { lat: x.latitude, lon: x.longitude, london: x.region === "London" }; })
        .catch(fallback);
    }

    function render(from, to, a, b, isExample) {
      var p = PK[sizeSel.value], trip = miles(a, b);
      var outside = !a.london || !b.london;
      var round = outside ? Math.round(miles(M.LONDON, a) + trip + miles(b, M.LONDON)) : 0;
      var mileCost = round * M.PER_MILE, small = p.group === "small";
      lastPkg = p.id;
      $("#qqRFrom").textContent = outward(from); $("#qqRTo").textContent = outward(to);
      $("#qqMiles").textContent = "about " + Math.max(1, Math.round(trip)) + " miles";
      $("#qqLines").innerHTML =
        "<li><span>" + esc(p.name) + "</span><span>" + (small ? "from " : "") + money(p.price) + "</span></li>" +
        (outside
          ? "<li><span>Round trip mileage from London (" + round + " miles at " + Math.round(M.PER_MILE * 100) + "p)</span><span>" + money(mileCost) + "</span></li>"
          : '<li><span>Mileage</span><span class="qq-free">Included, London move</span></li>');
      $("#qqTotalLbl").textContent = isExample ? "Example quote" : (small ? "Estimated total from" : "Estimated total");
      $("#qqTotal").textContent = money(p.price + mileCost);
      var tr = $("#qqTrack"); tr.classList.remove("go"); void tr.offsetWidth; tr.classList.add("go");
    }

    function run(e) {
      if (e && e.preventDefault) e.preventDefault();
      var from = $("#qqFrom").value, to = $("#qqTo").value, err = $("#qqErr");
      if (!from && !to && !e) return showExample();
      if (!valid(from) || !valid(to)) { err.textContent = "Please enter a full UK postcode for both addresses, for example SE1 7PB."; return; }
      err.textContent = "";
      $("#qqGo").textContent = "Working it out..."; $("#qqGo").disabled = true;
      Promise.all([locate(from), locate(to)]).then(function (r) {
        $("#qqGo").textContent = "Get my quote"; $("#qqGo").disabled = false;
        if (!r[0] || !r[1]) { err.textContent = "We couldn't find " + pretty(!r[0] ? from : to) + ". Check the postcode and try again."; return; }
        render(from, to, r[0], r[1], false);
      });
    }
    // Opens on a worked example (SE1 to Luton) so visitors can see how it works
    function showExample() {
      render("SE17PB", "LU12HN", { lat: 51.5011, lon: -0.1093, london: true }, { lat: 51.8787, lon: -0.4200, london: false }, true);
    }
    $("#qqForm").addEventListener("submit", run);
    ["#qqFrom", "#qqTo"].forEach(function (s) { $(s).addEventListener("keydown", function (e) { if (e.key === "Enter") run(e); }); });

    $("#qqBook").addEventListener("click", function () {
      choosePkg(lastPkg);
      var f = $('#book input[name="from"]'), t = $('#book input[name="to"]');
      if (f && !f.value && valid($("#qqFrom").value)) f.value = pretty($("#qqFrom").value);
      if (t && !t.value && valid($("#qqTo").value)) t.value = pretty($("#qqTo").value);
      goStep(2); scrollToBook();
    });

    fillSizes(); sizeSel.value = "f2"; showExample();
  })();

  renderSizes(); renderQuote(); renderPkgSelect(); renderAddons(); renderSummary(); renderCalendar();
  if (!(C.API_URL && handleReturn())) loadAvailability();
})();
