/* ShiftMe website logic. Prices and rules live in config.js */
(function () {
  "use strict";
  var C = window.SHIFTME_CONFIG;
  var DEMO = !C.API_URL;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var PK = {}; C.PACKAGES.forEach(function (p) { PK[p.id] = p; });
  var AD = {}; C.ADDONS.forEach(function (a) { AD[a.id] = a; });
  var GROUP_LABEL = { flat: "Flats", house: "Houses", small: "Small moves" };

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
  function deposit() { return Math.round(PK[S.pkg].price * C.DEPOSIT_RATE * 100) / 100; }
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
    $("#qDeposit").textContent = money(deposit());
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

  /* ---------- price list ---------- */
  var pGroup = "flat";
  function renderPrices() {
    var list = C.PACKAGES.filter(function (p) { return p.group === pGroup; });
    $("#priceGrid").innerHTML = list.map(function (p) {
      var show = p.items.slice(0, 6), rest = p.items.length - show.length;
      return '<article class="p-card"><h3>' + esc(p.name) + '</h3>' +
        '<p class="p-price">' + money(p.price) + (p.group === "small" ? " <small>from</small>" : "") + "</p>" +
        '<p class="muted" style="margin:0;font-size:.85rem">' + money(Math.round(p.price * C.DEPOSIT_RATE * 100) / 100) + " deposit to book</p>" +
        '<ul data-all="' + esc(JSON.stringify(p.items)) + '">' + show.map(function (i) { return "<li>" + esc(i) + "</li>"; }).join("") + "</ul>" +
        (rest > 0 ? '<button class="more" type="button">Show all ' + p.items.length + " items</button>" : "") +
        '<button class="btn btn-navy btn-block" type="button" data-book="' + p.id + '">Book this move</button></article>';
    }).join("");
    $$("#priceGrid .more").forEach(function (b) {
      b.addEventListener("click", function () {
        var ul = b.previousElementSibling, all = JSON.parse(ul.dataset.all);
        ul.innerHTML = all.map(function (i) { return "<li>" + esc(i) + "</li>"; }).join(""); b.remove();
      });
    });
    $$("#priceGrid [data-book]").forEach(function (b) {
      b.addEventListener("click", function () { choosePkg(b.dataset.book); goStep(2); scrollToBook(); });
    });
  }
  wireSeg($("#pGroup"), function (g) { pGroup = g; renderPrices(); });

  function priceUnit(a) {
    if (a.per === "hour") return money(a.price) + " an hour";
    if (a.per === "item") return money(a.price) + " each";
    return money(a.price);
  }
  $("#extrasList").innerHTML = C.ADDONS.concat(C.OTHER_CHARGES.map(function (o) { return { name: o.name, note: o.note, price: o.price, per: "once" }; }))
    .map(function (a) { return '<div class="x-row"><div>' + esc(a.name) + "<span>" + esc(a.note) + "</span></div><b>" + priceUnit(a) + "</b></div>"; }).join("");

  /* ---------- step 1: package + extras ---------- */
  function renderPkgSelect() {
    $("#pkgSelect").innerHTML = ["flat", "house", "small"].map(function (g) {
      return '<div class="pkg-group"><p>' + GROUP_LABEL[g] + '</p><div class="pkg-options">' +
        C.PACKAGES.filter(function (p) { return p.group === g; }).map(function (p) {
          return '<div class="pkg-opt"><input type="radio" name="pkg" id="pk_' + p.id + '" value="' + p.id + '"' + (p.id === S.pkg ? " checked" : "") + '>' +
            '<label for="pk_' + p.id + '"><b>' + esc(p.name.replace(/^Small move, /, "")) + "</b><span>" + money(p.price) + "</span></label></div>";
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
    var n = dayInfo(ds).count;
    if (n >= C.MAX_BOOKINGS_PER_DAY) return "full";
    if (n > 0 && n === C.MAX_BOOKINGS_PER_DAY - 1) return "one";
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

  function freeSlots(ds) {
    var taken = dayInfo(ds).slots || [];
    return C.SLOTS.filter(function (s) { return taken.indexOf(s.id) === -1; });
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
    $("#slotRow").innerHTML = C.SLOTS.map(function (s) {
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
    $("#sDeposit").textContent = money(deposit());
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
      ["Total", "<strong>" + money(total()) + "</strong>"],
      ["Deposit today", "<strong>" + money(deposit()) + "</strong>, balance of " + money(total() - deposit()) + " on the day"]
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
      extras: chosenAddons().map(function (k) { return { id: k, label: addonLabel(k), cost: addonCost(k) }; }),
      total: total(), deposit: deposit(),
      name: v.name, phone: v.phone, email: v.email,
      from: v.from, fromAccess: v.fromAccess, fromParking: v.fromParking,
      to: v.to, toAccess: v.toAccess, toParking: v.toParking,
      notes: v.notes, website: v.website
    };
    S.submitting = true;
    var btn = $("#submitBtn"); btn.disabled = true; btn.textContent = "Booking…";
    var finish = function (res) {
      S.submitting = false; btn.disabled = false; btn.textContent = "Confirm booking";
      if (res && res.ok) return showDone(res.ref, v.email);
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
        finish({ ok: true, ref: "SM-DEMO" + Math.floor(1000 + Math.random() * 9000) });
      }, 600);
      return;
    }
    fetch(C.API_URL, { method: "POST", body: JSON.stringify(payload) })
      .then(function (r) { return r.json(); })
      .then(finish)
      .catch(function () { finish(null); });
  });

  function showDone(ref, email) {
    $("#doneRef").textContent = ref;
    $("#doneEmail").textContent = email;
    var link = C.DEPOSIT_LINKS[S.pkg], dep = money(deposit());
    $("#doneDeposit").innerHTML = link
      ? '<div class="dep-box"><p>Pay your <strong>' + dep + "</strong> deposit now to lock in your date.</p>" +
        '<a class="btn btn-green" href="' + esc(link) + '" target="_blank" rel="noopener">Pay ' + dep + " deposit</a></div>"
      : '<div class="dep-box"><p>We\'ll message you shortly with a secure link to pay your <strong>' + dep + "</strong> deposit. Your date is confirmed once it's paid.</p></div>";
    goStep(5);
    var done = $('[data-panel="5"]'); done.focus({ preventScroll: true });
    scrollToBook();
    S.loaded = false;
  }
  $("#newBooking").addEventListener("click", function () {
    $("#wizard").reset(); S.addons = {}; S.date = null; S.slot = null;
    renderAddons(); renderSummary(); goStep(1);
  });

  /* ---------- start ---------- */
  renderSizes(); renderQuote(); renderPrices(); renderPkgSelect(); renderAddons(); renderSummary(); renderCalendar();
  loadAvailability();
})();
