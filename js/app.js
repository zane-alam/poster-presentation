/* Citytouch Voice: simulation, moving arrows and cost calculator.
   Plain JavaScript, no build step, no network calls. */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var NS = "http://www.w3.org/2000/svg";

  var reduceMq = window.matchMedia("(prefers-reduced-motion: reduce)");
  var wideMq = window.matchMedia("(min-width: 960px)");
  function reduced() { return reduceMq.matches; }
  function wide() { return wideMq.matches; }

  /* ------------------------------------------------------------------
     Scenarios (illustrative numbers, not real model output)
     ------------------------------------------------------------------ */
  var SCN = {
    routine: {
      bn: "রহিমকে ৫০০ টাকা পাঠাও", en: "Send 500 taka to Rahim", lat: 142,
      q: {
        intent: { v: "send_money", n: 0.97, kind: "conf" },
        payee:  { v: "Rahim (saved)", n: 0.95, kind: "conf" },
        unclear:{ v: "no", n: 0.03, kind: "yes" },
        risk:   { v: "low", n: 0.08, kind: "risk" }
      },
      lane: "a",
      laneText: "Template reply, no LLM call: “Send 500 taka to Rahim?”",
      confirm: "Send 500 taka to Rahim? Approve with fingerprint or PIN.",
      done: "500 taka sent to Rahim."
    },
    advice: {
      bn: "এই মাসের বিল দিতে পারব?", en: "Can I afford this month’s bills?", lat: 187,
      q: {
        intent: { v: "ask_advice", n: 0.91, kind: "conf" },
        payee:  { v: "none needed", n: 0.88, kind: "conf" },
        unclear:{ v: "no", n: 0.12, kind: "yes" },
        risk:   { v: "low", n: 0.1, kind: "risk" }
      },
      lane: "b",
      laneText: "LLM answer: “You have 18,400 taka. Bills due this month: 12,300. You can pay them and still keep 6,100.”",
      confirm: "Optional: pay the 12,300 taka of bills now? Approve with fingerprint or PIN.",
      done: "12,300 taka of bills paid."
    },
    risky: {
      bn: "নতুন একজনকে ৫০,০০০ টাকা পাঠাও", en: "Send 50,000 taka to a new person", lat: 163,
      q: {
        intent: { v: "send_money", n: 0.94, kind: "conf" },
        payee:  { v: "not in saved list", n: 0.41, kind: "conf" },
        unclear:{ v: "no", n: 0.18, kind: "yes" },
        risk:   { v: "high", n: 0.86, kind: "risk" }
      },
      lane: "c",
      laneText: "Safety lane: new payee and a large amount. A human agent joins to verify before anything moves.",
      confirm: "Send 50,000 taka to a new payee? Extra checks: fingerprint and PIN.",
      done: "50,000 taka sent after the extra checks."
    },
    unclear: {
      bn: "ওকে ওটা পাঠিয়ে দাও", en: "Send that to him", lat: 118,
      q: {
        intent: { v: "send_money?", n: 0.62, kind: "conf" },
        payee:  { v: "unknown", n: 0.22, kind: "conf" },
        unclear:{ v: "yes", n: 0.91, kind: "yes" },
        risk:   { v: "medium", n: 0.35, kind: "risk" }
      },
      lane: "c",
      stop: true,
      laneText: "Safety lane: “Who is ‘him’?” The app asks a clarifying question. Nothing is sent.",
      confirm: "Nothing to approve yet.",
      done: ""
    }
  };

  var LANE_LABEL = { a: "Lane A · routine", b: "Lane B · LLM", c: "Lane C · safety" };

  /* ------------------------------------------------------------------
     Cost model (illustrative)
     ------------------------------------------------------------------ */
  var COST = { jevLow: 12.6, jevHigh: 25.2, llm: 160 };

  /* ------------------------------------------------------------------
     Wires: arrows between the nodes
     ------------------------------------------------------------------ */
  var stage = $("stage");
  var svg = $("wires");
  var gWires = $("wires-g");
  var packet = $("packet");
  var wires = {};

  var DEFS = [
    { k: "w1", from: "n-speak", to: "n-stt" },
    { k: "w2", from: "n-stt", to: "n-jev" },
    { k: "a3", from: "n-jev", to: "l-a" },
    { k: "b3", from: "n-jev", to: "l-b" },
    { k: "c3", from: "n-jev", to: "l-c" },
    { k: "a4", from: "l-a", to: "n-confirm" },
    { k: "b4", from: "l-b", to: "n-confirm" },
    { k: "c4", from: "l-c", to: "n-confirm" },
    { k: "w5", from: "n-confirm", to: "n-exec" }
  ];

  DEFS.forEach(function (def) {
    var g = document.createElementNS(NS, "g");
    g.setAttribute("class", "wire-g");
    var base = document.createElementNS(NS, "path");
    base.setAttribute("class", "wire");
    var flow = document.createElementNS(NS, "path");
    flow.setAttribute("class", "wire-flow");
    var chevs = document.createElementNS(NS, "g");
    g.appendChild(base);
    g.appendChild(flow);
    g.appendChild(chevs);
    gWires.appendChild(g);
    wires[def.k] = { def: def, g: g, base: base, flow: flow, chevs: chevs, d: "" };
  });

  function rect(el) {
    var s = stage.getBoundingClientRect();
    var r = el.getBoundingClientRect();
    var o = { l: r.left - s.left, t: r.top - s.top, w: r.width, h: r.height };
    o.r = o.l + o.w; o.b = o.t + o.h; o.cx = o.l + o.w / 2; o.cy = o.t + o.h / 2;
    return o;
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function f(n) { return Math.round(n * 10) / 10; }

  function rounded(pts, r) {
    var d = "M" + f(pts[0][0]) + "," + f(pts[0][1]);
    for (var i = 1; i < pts.length; i++) {
      var p = pts[i];
      if (i === pts.length - 1) { d += " L" + f(p[0]) + "," + f(p[1]); break; }
      var a = pts[i - 1], b = pts[i + 1];
      var l1 = Math.hypot(a[0] - p[0], a[1] - p[1]);
      var l2 = Math.hypot(b[0] - p[0], b[1] - p[1]);
      var rr = Math.min(r, l1 / 2, l2 / 2);
      var x1 = p[0] + (a[0] - p[0]) / l1 * rr, y1 = p[1] + (a[1] - p[1]) / l1 * rr;
      var x2 = p[0] + (b[0] - p[0]) / l2 * rr, y2 = p[1] + (b[1] - p[1]) / l2 * rr;
      d += " L" + f(x1) + "," + f(y1) + " Q" + f(p[0]) + "," + f(p[1]) + " " + f(x2) + "," + f(y2);
    }
    return d;
  }
  function curveV(x1, y1, x2, y2) {
    var ym = (y1 + y2) / 2;
    return "M" + f(x1) + "," + f(y1) + " C" + f(x1) + "," + f(ym) + " " + f(x2) + "," + f(ym) + " " + f(x2) + "," + f(y2);
  }

  var GAP = 3; /* keep arrow tips just outside the card border */

  function geometry(key, A, B, W) {
    var isWide = wide();
    var lane = key.charAt(0);
    var idx = { a: 0, b: 1, c: 2 }[lane];

    if (key === "w1") {
      return isWide ? "M" + f(A.r) + "," + f(A.cy) + " L" + f(B.l - GAP) + "," + f(A.cy)
                    : "M" + f(A.cx) + "," + f(A.b) + " L" + f(A.cx) + "," + f(B.t - GAP);
    }
    if (key === "w2") {
      var x = isWide ? clamp(A.cx, B.l + 40, B.r - 40) : A.cx;
      return "M" + f(x) + "," + f(A.b) + " L" + f(x) + "," + f(B.t - GAP);
    }
    if (key === "w5") {
      return isWide ? "M" + f(A.r) + "," + f(A.cy) + " L" + f(B.l - GAP) + "," + f(A.cy)
                    : "M" + f(A.cx) + "," + f(A.b) + " L" + f(A.cx) + "," + f(B.t - GAP);
    }

    if (key.charAt(1) === "3") { /* Jev to lane */
      if (isWide) {
        var x1 = clamp(B.cx, A.l + 40, A.r - 40);
        return curveV(x1, A.b, B.cx, B.t - GAP);
      }
      var rx = [28, 19, 10][idx];
      var sy = A.t + A.h * [0.7, 0.5, 0.3][idx];
      var ly = B.cy;
      return rounded([[A.l, sy], [rx, sy], [rx, ly], [B.l - GAP, ly]], 9);
    }

    if (key.charAt(1) === "4") { /* lane to Confirm */
      if (isWide) {
        var ex = B.l + B.w * [0.25, 0.5, 0.75][idx];
        return curveV(A.cx, A.b, ex, B.t - GAP);
      }
      var rx2 = W - [10, 19, 28][idx];
      var ey = B.t + B.h * [0.72, 0.5, 0.28][idx];
      return rounded([[A.r, A.cy], [rx2, A.cy], [rx2, ey], [B.r + GAP, ey]], 9);
    }
    return "";
  }

  function addChevrons(w, d) {
    while (w.chevs.firstChild) w.chevs.removeChild(w.chevs.firstChild);
    if (reduced()) return;
    var len = w.base.getTotalLength();
    var n = Math.max(1, Math.round(len / 120));
    var dur = Math.max(1.6, Math.min(6, len / 85));
    for (var i = 0; i < n; i++) {
      var c = document.createElementNS(NS, "path");
      c.setAttribute("class", "chev");
      c.setAttribute("d", "M-5,-5 L4,0 L-5,5 z");
      var am = document.createElementNS(NS, "animateMotion");
      am.setAttribute("dur", dur.toFixed(2) + "s");
      am.setAttribute("begin", "-" + (dur * i / n).toFixed(2) + "s");
      am.setAttribute("repeatCount", "indefinite");
      am.setAttribute("rotate", "auto");
      am.setAttribute("path", d);
      c.appendChild(am);
      w.chevs.appendChild(c);
    }
  }

  function layout() {
    var s = stage.getBoundingClientRect();
    if (!s.width) return;
    svg.setAttribute("viewBox", "0 0 " + f(s.width) + " " + f(s.height));
    DEFS.forEach(function (def) {
      var w = wires[def.k];
      var A = rect($(def.from)), B = rect($(def.to));
      var d = geometry(def.k, A, B, s.width);
      if (d && d !== w.d) {
        w.d = d;
        w.base.setAttribute("d", d);
        w.flow.setAttribute("d", d);
        addChevrons(w, d);
      }
    });
  }

  var layoutQueued = false;
  function queueLayout() {
    if (layoutQueued) return;
    layoutQueued = true;
    requestAnimationFrame(function () { layoutQueued = false; layout(); });
  }

  if ("ResizeObserver" in window) {
    var ro = new ResizeObserver(queueLayout);
    ro.observe(stage);
    DEFS.forEach(function (d) { ro.observe($(d.from)); });
    ro.observe($("n-exec"));
  }
  window.addEventListener("resize", queueLayout);
  window.addEventListener("load", queueLayout);
  if (wideMq.addEventListener) wideMq.addEventListener("change", function () { DEFS.forEach(function (d) { wires[d.k].d = ""; }); queueLayout(); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(queueLayout);
  layout();

  function setWire(k, state) {
    var g = wires[k].g;
    g.classList.remove("is-live", "is-done", "is-skip");
    if (state) g.classList.add("is-" + state);
    if (state === "live") gWires.appendChild(g);
  }

  /* ------------------------------------------------------------------
     Run control
     ------------------------------------------------------------------ */
  var token = 0;
  var decision = null;
  var autoplay = false;
  var selected = "routine";
  var userTouched = false;
  var stats = { n: 0, a: 0, b: 0, c: 0, lat: 0 };

  function ABORT() { this.abort = true; }
  function wait(ms, my) {
    if (reduced()) ms = ms * 0.25;
    return new Promise(function (res, rej) {
      setTimeout(function () { if (my !== token) rej(new ABORT()); else res(); }, ms);
    });
  }
  function check(my) { if (my !== token) throw new ABORT(); }

  function nodeState(id, state) {
    var el = $(id);
    el.classList.remove("is-active", "is-done", "is-skip");
    if (state) el.classList.add("is-" + state);
  }

  function typeInto(el, text, my, speed) {
    el.classList.add("typing");
    el.textContent = "";
    var chars = Array.from(text);
    var i = 0;
    return new Promise(function (res, rej) {
      (function step() {
        if (my !== token) { el.classList.remove("typing"); return rej(new ABORT()); }
        if (i >= chars.length) { el.classList.remove("typing"); return res(); }
        el.textContent += chars[i++];
        setTimeout(step, reduced() ? 2 : speed);
      })();
    });
  }

  function fly(key, ms, my) {
    var w = wires[key];
    var path = w.base;
    var len = path.getTotalLength();
    if (reduced()) ms = 60;
    setWire(key, "live");
    packet.classList.add("is-on");
    return new Promise(function (res, rej) {
      var t0 = null;
      function frame(ts) {
        if (my !== token) { packet.classList.remove("is-on"); return rej(new ABORT()); }
        if (t0 === null) t0 = ts;
        var p = Math.min(1, (ts - t0) / ms);
        var e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        var pt = path.getPointAtLength(len * e);
        packet.setAttribute("transform", "translate(" + f(pt.x) + " " + f(pt.y) + ")");
        if (p < 1) requestAnimationFrame(frame);
        else { setWire(key, "done"); packet.classList.remove("is-on"); res(); }
      }
      var s0 = path.getPointAtLength(0);
      packet.setAttribute("transform", "translate(" + f(s0.x) + " " + f(s0.y) + ")");
      requestAnimationFrame(frame);
    });
  }

  /* log */
  var logEl = $("log");
  function log(step, parts) {
    var empty = logEl.querySelector(".log__empty");
    if (empty) empty.remove();
    var p = document.createElement("p");
    var t = document.createElement("span"); t.className = "t"; t.textContent = step;
    var m = document.createElement("span"); m.className = "m";
    parts.forEach(function (x) {
      if (x.charAt(0) === "*") { var b = document.createElement("b"); b.textContent = x.slice(1); m.appendChild(b); }
      else m.appendChild(document.createTextNode(x));
    });
    p.appendChild(t); p.appendChild(m);
    logEl.appendChild(p);
    logEl.scrollTop = logEl.scrollHeight;
  }

  /* visuals */
  var QS = ["intent", "payee", "unclear", "risk"];

  function resetVisuals() {
    ["n-speak", "n-stt", "n-jev", "l-a", "l-b", "l-c", "n-confirm", "n-exec"].forEach(function (id) { nodeState(id, null); });
    DEFS.forEach(function (d) { setWire(d.k, null); });
    packet.classList.remove("is-on");
    $("wave").classList.remove("is-on");
    ["say-bn", "say-en", "stt-bn", "stt-en", "la-t", "lb-t", "lc-t", "cf-t", "ex-t", "ex-ref"].forEach(function (id) {
      $(id).textContent = ""; $(id).classList.remove("typing");
    });
    $("receipt").classList.remove("is-on");
    $("lat").textContent = "latency —";
    var chip = $("route-chip");
    chip.textContent = "route —"; chip.className = "chip chip--route";
    QS.forEach(function (k) {
      var q = document.querySelector('.q[data-q="' + k + '"]');
      q.classList.remove("is-in"); q.removeAttribute("data-tone");
      $("q-" + k + "-v").textContent = "—";
      $("q-" + k + "-b").style.width = "0";
      $("q-" + k + "-p").textContent = "waiting";
    });
    setConfirmButtons(false);
    decision = null;
  }

  function setConfirmButtons(on) {
    $("btn-approve").disabled = !on;
    $("btn-cancel").disabled = !on;
  }

  function tone(q) {
    if (q.kind === "conf") return q.n >= 0.7 ? "mint" : "amber";
    if (q.kind === "yes") return q.n < 0.5 ? "mint" : "amber";
    return q.n < 0.3 ? "mint" : q.n < 0.5 ? "amber" : "rose";
  }
  function qLabel(q) {
    if (q.kind === "conf") return "confidence " + q.n.toFixed(2);
    if (q.kind === "yes") return "P(yes) " + q.n.toFixed(2);
    return "score " + q.n.toFixed(2);
  }

  function routeOf(s) {
    var q = s.q;
    if (q.risk.n >= 0.5) return "c";
    if (q.intent.n < 0.7 || q.payee.n < 0.7) return "c";
    if (q.unclear.n >= 0.5 || q.intent.v === "ask_advice") return "b";
    return "a";
  }

  function updateStats() {
    $("st-n").textContent = stats.n;
    $("st-a").textContent = stats.a;
    $("st-b").textContent = stats.b;
    $("st-c").textContent = stats.c;
    if (stats.n) {
      var avoided = stats.a + stats.c;
      $("st-avoid").textContent = avoided + " of " + stats.n + " (" + Math.round(avoided / stats.n * 100) + "%)";
      $("st-lat").textContent = Math.round(stats.lat / stats.n) + " ms";
    } else {
      $("st-avoid").textContent = "—";
      $("st-lat").textContent = "—";
    }
  }

  function ask(my, auto) {
    setConfirmButtons(true);
    return new Promise(function (res) {
      decision = res;
      if (auto) {
        setTimeout(function () { if (my === token && decision === res) res("approve"); }, reduced() ? 150 : 1300);
      }
    });
  }

  function refCode() {
    var a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", s = "CT-";
    for (var i = 0; i < 6; i++) s += a.charAt(Math.floor(Math.random() * a.length));
    return s;
  }

  async function run(id, opts) {
    opts = opts || {};
    var my = ++token;
    var s = SCN[id];
    selected = id;
    syncButtons();
    resetVisuals();
    logEl.innerHTML = "";
    $("btn-run").disabled = false;

    try {
      /* Step 1: speak */
      nodeState("n-speak", "active");
      $("wave").classList.add("is-on");
      log("01", ["Customer taps the mic and says: ", "*" + s.en]);
      await wait(500, my);
      await typeInto($("say-bn"), s.bn, my, 55);
      await typeInto($("say-en"), "“" + s.en + "”", my, 22);
      $("wave").classList.remove("is-on");
      await wait(300, my);
      nodeState("n-speak", "done");

      /* Step 2: transcribe */
      await fly("w1", 900, my);
      nodeState("n-stt", "active");
      log("02", ["Speech-to-text returns the words as text."]);
      await wait(250, my);
      await typeInto($("stt-bn"), s.bn, my, 28);
      await typeInto($("stt-en"), s.en, my, 16);
      await wait(350, my);
      nodeState("n-stt", "done");

      /* Step 3: Jev decides */
      await fly("w2", 800, my);
      nodeState("n-jev", "active");
      $("lat").textContent = "thinking…";
      log("03", ["Jev gets the text and answers four questions in one call."]);
      await wait(600, my);
      for (var i = 0; i < QS.length; i++) {
        var k = QS[i], q = s.q[k];
        var box = document.querySelector('.q[data-q="' + k + '"]');
        box.classList.add("is-in");
        box.setAttribute("data-tone", tone(q));
        $("q-" + k + "-v").textContent = q.v;
        $("q-" + k + "-b").style.width = Math.round(q.n * 100) + "%";
        $("q-" + k + "-p").textContent = qLabel(q);
        await wait(260, my);
      }
      $("lat").textContent = s.lat + " ms";
      var lane = routeOf(s);
      var chip = $("route-chip");
      chip.textContent = "route → " + LANE_LABEL[lane];
      chip.className = "chip chip--route is-" + lane;
      stats.n++; stats[lane]++; stats.lat += s.lat;
      updateStats();
      log("03", ["Jev result: ", "*" + LANE_LABEL[lane], " in " + s.lat + " ms. No text was written."]);
      await wait(800, my);
      nodeState("n-jev", "done");

      /* Lane */
      ["a", "b", "c"].forEach(function (x) {
        if (x !== lane) { setWire(x + "3", "skip"); setWire(x + "4", "skip"); nodeState("l-" + x, "skip"); }
      });
      await fly(lane + "3", 850, my);
      nodeState("l-" + lane, "active");
      var laneEl = $("l" + lane + "-t");
      if (lane === "b") {
        laneEl.innerHTML = '<span class="dots" aria-hidden="true"><i></i><i></i><i></i></span> LLM is thinking';
        log("03", ["The LLM lane is used: the only step that costs real money."]);
        await wait(1100, my);
        laneEl.textContent = "";
      } else if (lane === "a") {
        log("03", ["Routine request. A template reply is used, so there is no LLM call."]);
      } else {
        log("03", ["Safety lane: extra care before any money moves."]);
      }
      await typeInto(laneEl, s.laneText, my, 14);
      await wait(500, my);
      nodeState("l-" + lane, "done");

      if (s.stop) {
        setWire(lane + "4", "skip");
        nodeState("n-confirm", "skip"); nodeState("n-exec", "skip"); setWire("w5", "skip");
        $("cf-t").textContent = s.confirm;
        log("··", ["Stopped safely. ", "*No money moved."]);
        return finish(my);
      }

      /* Step 4: confirm */
      await fly(lane + "4", 850, my);
      nodeState("n-confirm", "active");
      await typeInto($("cf-t"), s.confirm, my, 14);
      log("04", ["Waiting for the customer to approve with fingerprint or PIN."]);
      var ans = await ask(my, opts.auto);
      check(my);
      setConfirmButtons(false);

      if (ans === "cancel") {
        $("cf-t").textContent = "Cancelled by the customer.";
        nodeState("n-confirm", "done");
        nodeState("n-exec", "skip"); setWire("w5", "skip");
        log("04", ["Customer cancels. ", "*No money moved."]);
        return finish(my);
      }
      log("04", ["Customer approves."]);
      await wait(350, my);
      nodeState("n-confirm", "done");

      /* Step 5: execute */
      await fly("w5", 800, my);
      nodeState("n-exec", "active");
      await wait(450, my);
      $("ex-t").textContent = s.done;
      $("ex-ref").textContent = refCode() + " · simulated receipt";
      $("receipt").classList.add("is-on");
      log("05", ["Citytouch core runs the payment. ", "*" + s.done, " Receipt sent."]);
      await wait(400, my);
      nodeState("n-exec", "done");
      finish(my);
    } catch (e) {
      if (!(e instanceof ABORT)) { console.error(e); }
    }
  }

  function finish(my) {
    if (my !== token) return;
    packet.classList.remove("is-on");
    if (autoplay) {
      var next = pickAuto();
      setTimeout(function () { if (autoplay && my === token) run(next, { auto: true }); }, reduced() ? 400 : 1800);
    }
  }

  function pickAuto() {
    var e = $("share").value / 100, r = Math.random();
    if (r < e) return "advice";
    if (r < e + (1 - e) * 0.12) return Math.random() < 0.5 ? "risky" : "unclear";
    return "routine";
  }

  function reset() {
    token++;
    autoplay = false;
    syncButtons();
    resetVisuals();
    stats = { n: 0, a: 0, b: 0, c: 0, lat: 0 };
    updateStats();
    logEl.innerHTML = '<p class="log__empty">Run a simulation to see each step appear here.</p>';
  }

  function syncButtons() {
    document.querySelectorAll("#scn .scn__btn").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-id") === selected));
    });
    var a = $("btn-auto");
    a.setAttribute("aria-pressed", String(autoplay));
    a.lastChild.nodeValue = autoplay ? "Stop auto-play" : "Auto-play";
  }

  /* events */
  document.querySelectorAll("#scn .scn__btn").forEach(function (b) {
    b.addEventListener("click", function () {
      userTouched = true; autoplay = false;
      run(b.getAttribute("data-id"));
    });
  });
  $("btn-run").addEventListener("click", function () { userTouched = true; autoplay = false; run(selected); });
  $("btn-auto").addEventListener("click", function () {
    userTouched = true;
    autoplay = !autoplay;
    syncButtons();
    if (autoplay) run(pickAuto(), { auto: true });
    else { token++; resetVisuals(); }
  });
  $("btn-reset").addEventListener("click", function () { userTouched = true; reset(); });
  $("btn-approve").addEventListener("click", function () { if (decision) { var d = decision; decision = null; d("approve"); } });
  $("btn-cancel").addEventListener("click", function () { if (decision) { var d = decision; decision = null; d("cancel"); } });

  /* Start one demo run when the simulation first scrolls into view */
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting && !userTouched && !reduced() && stats.n === 0) {
          io.disconnect();
          run("routine", { auto: true });
        }
      });
    }, { threshold: 0.35 });
    io.observe(stage);
  }

  /* ------------------------------------------------------------------
     Cost calculator
     ------------------------------------------------------------------ */
  var share = $("share");
  function money(v) { return "$" + Math.round(v); }
  function ratioFmt(x) { return x < 10 ? x.toFixed(1) : String(Math.round(x)); }

  function updateCost() {
    var e = share.value / 100;
    var lo = COST.jevLow + COST.llm * e;
    var hi = COST.jevHigh + COST.llm * e;
    var max = Math.max(COST.llm, hi);
    $("share-out").textContent = share.value + "%";
    share.style.setProperty("--p", share.value + "%");
    $("bar-base").style.cssText = "left:0;width:" + (COST.llm / max * 100) + "%";
    $("bar-jev").style.cssText = "left:0;width:" + (lo / max * 100) + "%";
    $("bar-jev-r").style.cssText = "left:" + (lo / max * 100) + "%;width:" + ((hi - lo) / max * 100) + "%";
    $("val-base").textContent = money(COST.llm);
    $("val-jev").textContent = money(lo) + "–" + money(hi).slice(1);

    var rLo = COST.llm / hi, rHi = COST.llm / lo;
    var txt = ratioFmt(rLo) === ratioFmt(rHi) ? ratioFmt(rLo) : ratioFmt(rLo) + "–" + ratioFmt(rHi);
    var v = $("verdict").parentNode;
    v.classList.remove("is-mid", "is-bad");
    if (rHi < 1) {
      $("ratio").textContent = "No saving";
      v.classList.add("is-bad");
      $("verdict").textContent = "When nearly every request needs the LLM, Jev only adds cost.";
    } else if (rLo < 1.5) {
      $("ratio").textContent = txt + "×";
      v.classList.add("is-mid");
      $("verdict").textContent = "lower than the LLM-only baseline. The saving is small at this share.";
    } else {
      $("ratio").textContent = txt + "×";
      $("verdict").textContent = "lower than the LLM-only baseline.";
    }
    var beLo = Math.round((COST.llm - COST.jevHigh) / COST.llm * 100);
    var beHi = Math.round((COST.llm - COST.jevLow) / COST.llm * 100);
    $("breakeven").textContent = "Jev stops saving money above about " + beLo + "–" + beHi + "% LLM share. Illustrative estimate.";
  }
  share.addEventListener("input", updateCost);
  updateCost();
  syncButtons();
  updateStats();
})();
