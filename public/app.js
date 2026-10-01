/* ============================================================
   Peekiva Couple Quiz — frontend SPA (no build step, no framework).
   Pages + Cloudflare Worker API + D1. All copy is English.
   ============================================================ */
(function () {
  "use strict";

  var DEFAULT_API = "https://couple-quiz-api.gardenia937.workers.dev";
  var DISCOVER_URL = "https://peekiva.com";
  // Contact email lives in public/index.html footer (single place to edit).

  function apiBase() {
    try {
      var o = localStorage.getItem("peekiva_api_base");
      if (o) return o.replace(/\/+$/, "");
    } catch (e) {}
    return DEFAULT_API;
  }

  var app = document.getElementById("app");
  var toastEl = document.getElementById("toast");
  var footerCta = document.getElementById("footer-cta");
  var toastTimer = null;

  /* ---------- tiny helpers ---------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("show"); }, 2600);
  }
  function fmtDur(ms) {
    ms = Math.max(0, Math.round(ms || 0));
    if (ms < 60000) return (ms / 1000).toFixed(1) + " sec";
    var m = Math.floor(ms / 60000);
    var s = Math.round((ms % 60000) / 1000);
    if (s === 60) { m += 1; s = 0; }
    return m + (m === 1 ? " min " : " min ") + s + " sec";
  }
  function setMeta(title, desc) {
    document.title = title;
    var m = document.querySelector('meta[name="description"]');
    if (m) m.setAttribute("content", desc);
    var og = document.querySelector('meta[property="og:title"]');
    if (og) og.setAttribute("content", title);
    var ogd = document.querySelector('meta[property="og:description"]');
    if (ogd) ogd.setAttribute("content", desc);
  }
  function setFooterCta(show) {
    footerCta.innerHTML = show
      ? '<p>Discover more quizzes on Peekiva.</p><a class="peekiva-cta" href="' + DISCOVER_URL + '">Discover More</a>'
      : "";
  }

  async function api(path, opts) {
    opts = opts || {};
    var res = await fetch(apiBase() + path, {
      method: opts.method || "GET",
      headers: { "Content-Type": "application/json" },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    var data = null;
    try { data = await res.json(); } catch (e) { /* ignore */ }
    if (!data) throw { code: "NETWORK", message: "Something went wrong. Please try again." };
    if (!data.success) throw { code: data.code || "ERROR", message: data.message || "Something went wrong. Please try again." };
    return data.data;
  }

  async function copyText(text, okMsg) {
    try {
      await navigator.clipboard.writeText(text);
      toast(okMsg || "Link copied!");
      return;
    } catch (e) { /* fallback below */ }
    try {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      toast(okMsg || "Link copied!");
    } catch (e2) {
      toast("Copy didn't work — long-press the link instead.");
    }
  }

  async function shareLink(url, title, text) {
    if (navigator.share) {
      try { await navigator.share({ title: title, text: text, url: url }); return; }
      catch (e) { if (e && e.name === "AbortError") return; /* fall through to copy */ }
    }
    copyText(url, "Link copied!");
  }

  function quizUrl(id) { return location.origin + "/quiz/" + id; }
  function manageUrl(token) { return location.origin + "/manage/" + token; }
  function shareUrl(id) { return location.origin + "/r/" + id; }

  function progressStore(quizId) {
    var key = "peekiva_progress_" + quizId;
    return {
      load: function () { try { return JSON.parse(sessionStorage.getItem(key) || "null"); } catch (e) { return null; } },
      save: function (v) { try { sessionStorage.setItem(key, JSON.stringify(v)); } catch (e) {} },
      clear: function () { try { sessionStorage.removeItem(key); } catch (e) {} },
    };
  }

  /* ---------- router ---------- */
  var routes = [];
  function route(re, fn) { routes.push({ re: re, fn: fn }); }

  function navigate(path) {
    history.pushState(null, "", path);
    render();
  }
  window.addEventListener("popstate", render);
  document.addEventListener("click", function (e) {
    var a = e.target.closest ? e.target.closest("[data-nav]") : null;
    if (!a) return;
    var href = a.getAttribute("data-nav") || a.getAttribute("href");
    if (!href || href.indexOf("http") === 0) return;
    e.preventDefault();
    navigate(href);
  });

  function notFound(message, hint) {
    setMeta("Page not found | Peekiva", "This page doesn't exist.");
    setFooterCta(false);
    app.innerHTML =
      '<div class="wrap center"><div class="hero">' +
      '<h1>This page<br><em>doesn\'t exist.</em></h1>' +
      '<p class="sub">' + esc(message || "The link you followed may be broken, or the page moved.") + "</p>" +
      (hint ? '<p class="note">' + esc(hint) + "</p>" : "") +
      '<div class="btn-row"><a class="btn btn-primary" href="/" data-nav="/">Back to Home</a>' +
      '<a class="btn btn-ghost" href="/create" data-nav="/create">Create a Quiz</a></div>' +
      "</div></div>";
  }

  function render() {
    var path = location.pathname.replace(/\/+$/, "") || "/";
    window.scrollTo(0, 0);
    for (var i = 0; i < routes.length; i++) {
      var m = path.match(routes[i].re);
      if (m) { routes[i].fn(m); return; }
    }
    notFound();
  }

  /* ============================================================
     1. LANDING
     ============================================================ */
  route(/^\/$/, function () {
    setMeta(
      "Couple Quizzes & Fun Relationship Questions | Peekiva",
      "Create a free couple quiz, send it to someone you love, and discover what they really think."
    );
    setFooterCta(false);
    app.innerHTML =
      '<div class="wrap"><div class="hero">' +
      '<span class="eyebrow">Free · No sign-up · Takes minutes</span>' +
      "<h1>Ask the questions<br>you've <em>always wanted</em> to ask.</h1>" +
      '<p class="sub">Create a private quiz, send it to someone who matters, and see what they really say.</p>' +
      '<div class="btn-row"><a class="btn btn-primary" href="/create" data-nav="/create">Create a Quiz</a>' +
      '<button class="btn btn-ghost" id="take-quiz">Take a Quiz</button></div>' +
      '<p class="free-line"><span class="free-dot"></span>Free to create. Free to answer.</p>' +
      '<ol class="steps">' +
      "<li><b>Create</b>Pick a quiz</li>" +
      "<li><b>Send</b>Share the link</li>" +
      "<li><b>Answer</b>They respond</li>" +
      "<li><b>Discover</b>Read everything</li>" +
      "</ol>" +
      '<div class="card blush"><h3>How it works</h3>' +
      '<p class="note" style="font-size:15px">Make a quiz in about a minute. You get a private link to view every answer — including how long they thought about each one. Your person just opens their link and answers. No accounts, no apps, no awkward “download this” moment.</p></div>' +
      '<div class="card"><h3>Made for the group chat</h3>' +
      '<p class="note" style="font-size:15px">Built for couples, but works just as well for best friends, siblings, wedding parties, or that one friend who claims they “know you so well”.</p>' +
      '<a class="btn btn-blush" href="/create" data-nav="/create" style="margin-top:8px">Start — it\'s free</a></div>' +
      "</div></div>";
    $("#take-quiz").addEventListener("click", function () {
      var code = prompt("Paste the quiz link or code they sent you:");
      if (!code) return;
      var m = String(code).match(/\/quiz\/([A-Za-z0-9_-]{5,12})/);
      var id = m ? m[1] : String(code).trim().split(/[\s/]+/).pop();
      if (id) navigate("/quiz/" + id);
    });
  });

  /* ============================================================
     2. CREATE (templates)
     ============================================================ */
  route(/^\/create$/, function () {
    setMeta("Create a quiz | Peekiva", "Pick a starting point — or build your own from scratch. Free, no sign-up.");
    setFooterCta(false);
    var cards = window.PEEKIVA_TEMPLATES.map(function (t) {
      var n = t.id === "custom" ? "Blank canvas" : t.questions.length + " questions";
      return (
        '<button class="tpl" data-tpl="' + esc(t.id) + '"><b>' + esc(t.title) + "</b>" +
        "<span>" + esc(t.blurb) + '</span><br><span class="count">' + esc(n) + "</span></button>"
      );
    }).join("");
    app.innerHTML =
      '<div class="wrap"><div class="hero" style="padding-top:24px">' +
      '<span class="eyebrow">Step 1 of 2</span>' +
      "<h2>Start with a vibe, <em>or a blank page.</em></h2>" +
      '<p class="sub">Every template is fully editable. Tweak a few questions, or keep them as they are.</p>' +
      '<div class="tpl-grid">' + cards + "</div>" +
      "</div></div>";
    Array.prototype.forEach.call(document.querySelectorAll("[data-tpl]"), function (btn) {
      btn.addEventListener("click", function () {
        navigate("/build?template=" + encodeURIComponent(btn.getAttribute("data-tpl")));
      });
    });
  });

  /* ============================================================
     3. BUILDER
     ============================================================ */
  var builder = null; // {title, description, questions:[{text,type,options[]}]}

  function builderFromTemplate(tplId) {
    var tpl = null;
    (window.PEEKIVA_TEMPLATES || []).forEach(function (t) { if (t.id === tplId) tpl = t; });
    if (!tpl) tpl = (window.PEEKIVA_TEMPLATES || [])[0];
    return {
      title: tpl.id === "custom" ? "" : tpl.title,
      description: "",
      questions: tpl.questions.map(function (q) {
        return { text: q.text, type: q.type, options: (q.options || []).slice() };
      }),
    };
  }

  function optionLetter(i) { return "ABCD EF".replace(" ", "").charAt(i) || String(i + 1); }

  function renderBuilder() {
    setMeta("Create your quiz | Peekiva", "Write your questions, pick your types, and send it to someone who matters.");
    setFooterCta(false);
    var b = builder;
    var html =
      '<div class="wrap wrap-wide"><div style="padding-top:24px">' +
      '<span class="eyebrow">Step 2 of 2</span>' +
      "<h2>Create your <em>quiz.</em></h2>" +
      '<label class="f-label" for="b-title">Quiz title</label>' +
      '<input type="text" id="b-title" maxlength="120" placeholder="How Well Do You Know Me?" value="' + esc(b.title) + '" aria-label="Quiz title">' +
      '<label class="f-label" for="b-desc">Description <span style="font-weight:400">(optional)</span></label>' +
      '<textarea id="b-desc" maxlength="500" placeholder="Answer honestly. There are no wrong answers — I just want to know what you really think." aria-label="Quiz description">' + esc(b.description) + "</textarea>" +
      '<div class="char-count"><span id="b-desc-count">' + b.description.length + "</span> / 500</div>" +
      '<label class="f-label">Questions</label><div id="b-questions">';
    b.questions.forEach(function (q, i) {
      html +=
        '<div class="q-card" data-qi="' + i + '">' +
        '<div class="q-head"><span class="q-num">Question ' + String(i + 1).padStart(2, "0") + "</span>" +
        '<div class="q-tools">' +
        '<button class="icon-btn" data-act="up" aria-label="Move question up">↑</button>' +
        '<button class="icon-btn" data-act="down" aria-label="Move question down">↓</button>' +
        '<button class="icon-btn" data-act="del" aria-label="Delete question">×</button>' +
        "</div></div>" +
        '<textarea data-f="text" maxlength="300" rows="2" placeholder="Type your question…" aria-label="Question text">' + esc(q.text) + "</textarea>" +
        '<label class="f-label" style="margin-top:12px">Question type</label>' +
        '<select data-f="type" aria-label="Question type">' +
        '<option value="choice"' + (q.type === "choice" ? " selected" : "") + ">Multiple choice</option>" +
        '<option value="yesno"' + (q.type === "yesno" ? " selected" : "") + ">Yes / No</option>" +
        '<option value="short"' + (q.type === "short" ? " selected" : "") + ">Short answer</option>" +
        "</select>";
      if (q.type === "choice") {
        html += '<div style="margin-top:12px">';
        q.options.forEach(function (op, oi) {
          html +=
            '<div class="opt-edit"><span class="key">' + optionLetter(oi) + "</span>" +
            '<input type="text" data-opt="' + oi + '" maxlength="120" placeholder="Option ' + optionLetter(oi) + '" value="' + esc(op) + '" aria-label="Option ' + optionLetter(oi) + '">' +
            (q.options.length > 2 ? '<button class="icon-btn" data-optdel="' + oi + '" aria-label="Remove option">×</button>' : "") +
            "</div>";
        });
        if (q.options.length < 6) html += '<button class="link-btn" data-act="addopt">+ Add option</button>';
        html += "</div>";
      } else if (q.type === "yesno") {
        html += '<p class="tiny" style="margin:10px 0 0">They\'ll answer with a simple Yes or No.</p>';
      } else {
        html += '<p class="tiny" style="margin:10px 0 0">They\'ll answer in their own words (up to 500 characters).</p>';
      }
      html += "</div>";
    });
    html += "</div>";
    if (b.questions.length < 30) html += '<button class="add-btn" id="b-add">+ Add question</button>';
    html +=
      '<div class="btn-row" style="margin-top:24px"><button class="btn btn-primary" id="b-create">Create Quiz</button>' +
      '<button class="btn btn-ghost" id="b-back">Back to templates</button></div>' +
      '<p class="note center">You\'ll get a link to send them — plus a private link just for you to read their answers.</p>' +
      "</div></div>";
    app.innerHTML = html;

    var titleEl = $("#b-title"), descEl = $("#b-desc");
    titleEl.addEventListener("input", function () { b.title = titleEl.value; });
    descEl.addEventListener("input", function () {
      b.description = descEl.value;
      $("#b-desc-count").textContent = String(descEl.value.length);
    });

    Array.prototype.forEach.call(document.querySelectorAll("#b-questions .q-card"), function (card) {
      var i = parseInt(card.getAttribute("data-qi"), 10);
      var q = b.questions[i];
      card.querySelector('[data-f="text"]').addEventListener("input", function (e) { q.text = e.target.value; });
      card.querySelector('[data-f="type"]').addEventListener("change", function (e) {
        q.type = e.target.value;
        if (q.type === "choice" && (!q.options || q.options.length < 2)) q.options = ["", ""];
        renderBuilder();
      });
      Array.prototype.forEach.call(card.querySelectorAll("[data-opt]"), function (inp) {
        inp.addEventListener("input", function (e) { q.options[parseInt(inp.getAttribute("data-opt"), 10)] = e.target.value; });
      });
      var addOpt = card.querySelector('[data-act="addopt"]');
      if (addOpt) addOpt.addEventListener("click", function () { if (q.options.length < 6) { q.options.push(""); renderBuilder(); } });
      Array.prototype.forEach.call(card.querySelectorAll("[data-optdel]"), function (btn) {
        btn.addEventListener("click", function () {
          q.options.splice(parseInt(btn.getAttribute("data-optdel"), 10), 1);
          renderBuilder();
        });
      });
      Array.prototype.forEach.call(card.querySelectorAll(".q-tools .icon-btn"), function (btn) {
        btn.addEventListener("click", function () {
          var act = btn.getAttribute("data-act");
          if (act === "del") {
            if (b.questions.length <= 1) { toast("A quiz needs at least one question."); return; }
            if (!confirm("Delete this question?")) return;
            b.questions.splice(i, 1);
          } else if (act === "up" && i > 0) {
            b.questions.splice(i - 1, 0, b.questions.splice(i, 1)[0]);
          } else if (act === "down" && i < b.questions.length - 1) {
            b.questions.splice(i + 1, 0, b.questions.splice(i, 1)[0]);
          } else return;
          // re-read text inputs before re-render (they're already synced on input)
          renderBuilder();
        });
      });
    });

    var addBtn = $("#b-add");
    if (addBtn) addBtn.addEventListener("click", function () {
      b.questions.push({ text: "", type: "choice", options: ["", ""] });
      renderBuilder();
      window.scrollTo(0, document.body.scrollHeight);
    });
    $("#b-back").addEventListener("click", function () { navigate("/create"); });
    $("#b-create").addEventListener("click", submitQuiz);
  }

  async function submitQuiz() {
    var b = builder;
    var btn = $("#b-create");
    var payload = {
      title: (b.title || "").trim(),
      description: (b.description || "").trim(),
      questions: b.questions.map(function (q) {
        return { text: (q.text || "").trim(), type: q.type, options: (q.options || []).map(function (o) { return (o || "").trim(); }) };
      }),
    };
    if (!payload.title) { toast("Give your quiz a title first."); $("#b-title").focus(); return; }
    for (var i = 0; i < payload.questions.length; i++) {
      var q = payload.questions[i];
      if (!q.text) { toast("Question " + (i + 1) + " is still empty."); return; }
      if (q.type === "choice") {
        q.options = q.options.filter(Boolean);
        if (q.options.length < 2) { toast("Question " + (i + 1) + " needs at least 2 options."); return; }
      } else { q.options = []; }
    }
    btn.disabled = true;
    btn.textContent = "Saving…";
    try {
      var data = await api("/api/quizzes", { method: "POST", body: payload });
      try { sessionStorage.setItem("peekiva_created", JSON.stringify({ quizId: data.quizId, creatorToken: data.creatorToken, title: payload.title })); } catch (e) {}
      navigate("/created");
    } catch (e) {
      toast(e.message || "Something went wrong. Please try again.");
      btn.disabled = false;
      btn.textContent = "Create Quiz";
    }
  }

  route(/^\/build$/, function () {
    var params = new URLSearchParams(location.search);
    var tplId = params.get("template") || "know-me";
    builder = builderFromTemplate(tplId);
    renderBuilder();
  });

  /* ============================================================
     4. CREATED (share + private manage link)
     ============================================================ */
  route(/^\/created$/, function () {
    var saved = null;
    try { saved = JSON.parse(sessionStorage.getItem("peekiva_created") || "null"); } catch (e) {}
    if (!saved) {
      notFound("We couldn't find your new quiz.", "If you just created one, go back and create it again — it only takes a minute.");
      return;
    }
    setMeta("Your quiz is ready | Peekiva", "Send the link to them and see what they say.");
    setFooterCta(false);
    var qUrl = quizUrl(saved.quizId);
    var mUrl = manageUrl(saved.creatorToken);
    app.innerHTML =
      '<div class="wrap"><div class="hero center" style="padding-top:24px">' +
      '<span class="eyebrow">All yours</span>' +
      "<h2>Your quiz <em>is ready.</em></h2>" +
      '<p class="sub">Send this link to them and see what they say.</p>' +
      '<div class="share-box"><div class="link">' + esc(qUrl) + "</div>" +
      '<div class="btn-row split" style="margin-bottom:0"><button class="btn btn-blush" id="c-copy">Copy Link</button>' +
      '<button class="btn btn-ghost" id="c-share" style="background:transparent;color:#fff;border-color:rgba(255,255,255,.4)">Share</button></div></div>' +
      '<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin:4px 0 8px">' +
      '<button class="link-btn" id="c-wa">WhatsApp</button>' +
      '<button class="link-btn" id="c-sms">Messages</button>' +
      "</div>" +
      '<div class="save-warning"><b>Save this private link.</b> You\'ll need it to view responses later. ' +
      "Anyone with your quiz link can answer — but only this link shows answers:<br><br>" +
      '<span style="word-break:break-all">' + esc(mUrl) + '</span><br><br>' +
      '<button class="btn btn-ghost" id="c-copy-manage" style="min-height:48px">Copy private link</button></div>' +
      '<div class="btn-row"><a class="btn btn-ghost" href="/manage/' + esc(saved.creatorToken) + '" data-nav="/manage/' + esc(saved.creatorToken) + '">Open my dashboard</a></div>' +
      "</div></div>";
    $("#c-copy").addEventListener("click", function () { copyText(qUrl, "Link copied! Now send it to them."); });
    $("#c-share").addEventListener("click", function () { shareLink(qUrl, saved.title + " | Peekiva", "I made you a quiz. Come answer it."); });
    $("#c-wa").addEventListener("click", function () { location.href = "https://wa.me/?text=" + encodeURIComponent("I made you a quiz. Come answer it: " + qUrl); });
    $("#c-sms").addEventListener("click", function () { location.href = "sms:?&body=" + encodeURIComponent("I made you a quiz. Come answer it: " + qUrl); });
    $("#c-copy-manage").addEventListener("click", function () { copyText(mUrl, "Private link copied — keep it somewhere safe."); });
  });

  /* ============================================================
     5. RESPONDER INTRO  /quiz/:id
     ============================================================ */
  route(/^\/quiz\/([A-Za-z0-9_-]{5,12})$/, function (m) {
    var quizId = m[1];
    setFooterCta(false);
    app.innerHTML = '<div class="wrap"><p class="note" style="padding-top:40px">Loading your quiz…</p></div>';
    api("/api/quiz/" + encodeURIComponent(quizId)).then(function (data) {
      var q = data.quiz;
      setMeta(q.title + " | Peekiva", q.description || "Someone made you a quiz. Come answer it — it only takes a few minutes.");
      var existing = progressStore(quizId).load();
      app.innerHTML =
        '<div class="wrap"><div class="hero" style="padding-top:24px">' +
        '<span class="eyebrow">Someone made this for you</span>' +
        "<h2>" + esc(q.title) + "</h2>" +
        (q.description ? '<p class="sub">' + esc(q.description) + "</p>" : "") +
        '<p class="note">' + q.questionCount + (q.questionCount === 1 ? " question" : " questions") + " · a few minutes · no sign-up</p>" +
        '<div class="card"><label class="f-label" for="r-name" style="margin-top:0">Your name</label>' +
        '<input type="text" id="r-name" maxlength="40" placeholder="What should they call you?" value="' + esc(existing && existing.name ? existing.name : "") + '" aria-label="Your name" autocomplete="nickname">' +
        '<p class="tiny">Your name will be shown to the person who created this quiz.</p>' +
        '<div class="btn-row"><button class="btn btn-primary" id="r-start">' + (existing && existing.responseId ? "Continue Quiz" : "Start Quiz") + "</button></div>" +
        (existing && existing.responseId ? '<button class="link-btn" id="r-restart">Start over instead</button>' : "") +
        "</div></div></div>";
      var nameEl = $("#r-name");
      nameEl.focus();
      $("#r-start").addEventListener("click", function () {
        var name = nameEl.value.trim();
        if (!name) { toast("Tell them your name first."); nameEl.focus(); return; }
        startResponse(quizId, name, existing);
      });
      nameEl.addEventListener("keydown", function (e) {
        if (e.key === "Enter") $("#r-start").click();
      });
      var rs = $("#r-restart");
      if (rs) rs.addEventListener("click", function () {
        if (confirm("Start over? Your saved progress for this quiz will be cleared.")) {
          progressStore(quizId).clear();
          render();
        }
      });
    }).catch(function (e) {
      if (e.code === "QUIZ_NOT_FOUND") notFound("This quiz doesn't exist.", "Check the link — it may have a typo.");
      else if (e.code === "QUIZ_CLOSED") notFound("This quiz is no longer available.", "The person who made it may have closed it.");
      else { setMeta("Something went wrong | Peekiva", "Please try again."); setFooterCta(false); app.innerHTML = '<div class="wrap"><div class="alert">Something went wrong. Please try again.</div></div>'; }
    });
  });

  async function startResponse(quizId, name, existing) {
    var btn = $("#r-start");
    btn.disabled = true;
    btn.textContent = "Getting ready…";
    try {
      if (existing && existing.responseId && existing.name === name) {
        navigate("/quiz/" + quizId + "/answer");
        return;
      }
      var data = await api("/api/quiz/" + encodeURIComponent(quizId) + "/responses", {
        method: "POST", body: { responderName: name },
      });
      progressStore(quizId).save({ responseId: data.responseId, name: name, index: 0, cache: {} });
      navigate("/quiz/" + quizId + "/answer");
    } catch (e) {
      toast(e.message || "Something went wrong. Please try again.");
      btn.disabled = false;
      btn.textContent = "Start Quiz";
    }
  }

  /* ============================================================
     6. ANSWER FLOW  /quiz/:id/answer
     ============================================================ */
  var answering = null;

  route(/^\/quiz\/([A-Za-z0-9_-]{5,12})\/answer$/, function (m) {
    var quizId = m[1];
    var prog = progressStore(quizId).load();
    if (!prog || !prog.responseId) { navigate("/quiz/" + quizId); return; }
    setFooterCta(false);
    app.innerHTML = '<div class="wrap"><p class="note" style="padding-top:40px">Loading your quiz…</p></div>';
    // Reconcile with server (handles refresh + multi-tab).
    loadAnswerState(quizId, prog).then(function (data) {
      var answeredById = {};
      data.answers.forEach(function (a) { answeredById[a.question_id] = a; });
      var firstOpen = 0;
      for (var i = 0; i < data.quiz.questions.length; i++) {
        if (!answeredById[data.quiz.questions[i].id]) { firstOpen = i; break; }
        firstOpen = i + 1;
      }
      if (firstOpen >= data.quiz.questions.length) { finishResponse(quizId, prog.responseId); return; }
      answering = {
        quiz: data.quiz, quizId: quizId, responseId: prog.responseId, name: prog.name,
        index: Math.min(prog.index || 0, firstOpen),
        answeredById: answeredById,
        qStart: 0, hideStart: 0,
      };
      setMeta(data.quiz.title + " | Peekiva", "Answer honestly — there are no wrong answers.");
      showQuestion();
    }).catch(function (e) {
      if (e.code === "ALREADY_COMPLETED") { navigate("/done"); return; }
      if (e.code === "RESPONSE_NOT_FOUND") { progressStore(quizId).clear(); navigate("/quiz/" + quizId); return; }
      app.innerHTML = '<div class="wrap"><div class="alert">Something went wrong. Please try again.</div><div class="btn-row"><button class="btn btn-ghost" id="e-retry">Try again</button></div></div>';
      $("#e-retry").addEventListener("click", render);
    });
  });

  function beginTiming() {
    answering.qStart = Date.now();
    answering.hideStart = 0;
  }
  document.addEventListener("visibilitychange", function () {
    if (!answering) return;
    if (document.hidden) { answering.hideStart = Date.now(); }
    else if (answering.hideStart) {
      // Time spent in another app doesn't count as thinking time —
      // but they can always keep answering, nothing is blocked.
      answering.qStart += Date.now() - answering.hideStart;
      answering.hideStart = 0;
    }
  });

  function showQuestion() {
    var a = answering;
    var qs = a.quiz.questions;
    var i = a.index;
    var q = qs[i];
    beginTiming();
    var prev = a.answeredById[q.id];
    var prevText = prev ? prev.answer_text : "";
    var pct = Math.round((i / qs.length) * 100);
    var html =
      '<div class="wrap"><div style="padding-top:20px" class="fade-in">' +
      '<p class="q-count">' + esc(a.quiz.title) + "</p>" +
      "<h3>Question " + (i + 1) + " of " + qs.length + "</h3>" +
      '<div class="progress" role="progressbar" aria-valuenow="' + i + '" aria-valuemax="' + qs.length + '" aria-label="Quiz progress"><i style="width:' + pct + '%"></i></div>' +
      '<p class="q-text">' + esc(q.text) + "</p><div>";
    if (q.type === "choice") {
      html += q.options.map(function (op, oi) {
        return '<button class="opt' + (prevText === op ? " picked" : "") + '" data-ans="' + esc(op) + '"><span class="key">' + optionLetter(oi) + "</span><span>" + esc(op) + "</span></button>";
      }).join("");
    } else if (q.type === "yesno") {
      html += '<button class="opt' + (prevText === "Yes" ? " picked" : "") + '" data-ans="Yes"><span class="key">Y</span><span>Yes</span></button>' +
        '<button class="opt' + (prevText === "No" ? " picked" : "") + '" data-ans="No"><span class="key">N</span><span>No</span></button>';
    } else {
      html += '<textarea id="a-short" maxlength="500" rows="4" placeholder="Say it in your own words…" aria-label="Your answer">' + esc(prevText) + "</textarea>" +
        '<div class="char-count"><span id="a-count">' + prevText.length + "</span> / 500</div>" +
        '<div class="btn-row"><button class="btn btn-primary" id="a-next">' + (i === qs.length - 1 ? "Finish" : "Continue") + "</button></div>";
    }
    html += "</div>";
    if (i > 0) html += '<button class="link-btn" id="a-back">← Back</button>';
    html += "</div></div>";
    app.innerHTML = html;

    var locked = false; // ignore double-taps: one answer per question render
    Array.prototype.forEach.call(document.querySelectorAll("[data-ans]"), function (btn) {
      btn.addEventListener("click", function () {
        if (locked) return;
        locked = true;
        Array.prototype.forEach.call(document.querySelectorAll("[data-ans]"), function (x) { x.classList.remove("picked"); });
        btn.classList.add("picked");
        var val = btn.getAttribute("data-ans");
        var qid = answering && answering.quiz.questions[answering.index] ? answering.quiz.questions[answering.index].id : null;
        setTimeout(function () { answerAndNext(val, qid); }, 200);
      });
    });
    var shortEl = $("#a-short");
    if (shortEl) {
      shortEl.addEventListener("input", function () { $("#a-count").textContent = String(shortEl.value.length); });
      $("#a-next").addEventListener("click", function () {
        if (locked) return;
        var v = shortEl.value.trim();
        if (!v) { toast("Write a little something first."); shortEl.focus(); return; }
        locked = true;
        var qid2 = answering && answering.quiz.questions[answering.index] ? answering.quiz.questions[answering.index].id : null;
        answerAndNext(v, qid2);
      });
    }
    var back = $("#a-back");
    if (back) back.addEventListener("click", function () {
      if (a.index > 0) { a.index--; persistProg(); showQuestion(); }
    });
  }

  function persistProg() {
    var a = answering;
    progressStore(a.quizId).save({ responseId: a.responseId, name: a.name, index: a.index, cache: {} });
  }

  async function answerAndNext(value, qid) {
    var a = answering;
    if (!a) return;
    var q = a.quiz.questions[a.index];
    if (!q || q.id !== qid) return; // stale tap after navigation — ignore
    var ended = Date.now();
    var started = a.qStart || ended;
    var payload = { answers: [{ questionId: q.id, answerText: value, startedAt: started, answeredAt: ended }] };
    // Optimistic: move on immediately, sync in background (queued on failure).
    a.answeredById[q.id] = { question_id: q.id, answer_text: value };
    if (a.index < a.quiz.questions.length - 1) {
      a.index++;
      persistProg();
      showQuestion();
    } else {
      a.index++;
      persistProg();
    }
    try {
      await api("/api/responses/" + encodeURIComponent(a.responseId) + "/answers", { method: "POST", body: payload });
    } catch (e) {
      // Keep a pending queue in session storage; flushed on next save + before finish.
      try {
        var k = "peekiva_pending_" + a.responseId;
        var q2 = JSON.parse(sessionStorage.getItem(k) || "[]");
        q2.push(payload.answers[0]);
        sessionStorage.setItem(k, JSON.stringify(q2));
      } catch (e2) {}
    }
    if (a.index >= a.quiz.questions.length) finishResponse(a.quizId, a.responseId);
  }

  async function flushPending(responseId) {
    var k = "peekiva_pending_" + responseId;
    var items = [];
    try { items = JSON.parse(sessionStorage.getItem(k) || "[]"); } catch (e) {}
    if (!items.length) return;
    try {
      await api("/api/responses/" + encodeURIComponent(responseId) + "/answers", { method: "POST", body: { answers: items } });
      try { sessionStorage.removeItem(k); } catch (e) {}
    } catch (e) { /* will retry on next visit */ }
  }

  async function loadAnswerState(quizId, prog) {
    // First push any answers that failed to save while offline,
    // then read the fresh server state (handles refresh + multi-tab).
    try { await flushPending(prog.responseId); } catch (e) {}
    return api("/api/responses/" + encodeURIComponent(prog.responseId) + "/state");
  }

  async function finishResponse(quizId, responseId) {
    app.innerHTML = '<div class="wrap center"><p class="note" style="padding-top:60px">Sending your answers…</p></div>';
    try {
      await flushPending(responseId);
      await api("/api/responses/" + encodeURIComponent(responseId) + "/complete", { method: "POST", body: {} });
    } catch (e) {
      // Even if the network failed, answers were queued; still move on gracefully.
    }
    progressStore(quizId).clear();
    answering = null;
    navigate("/done");
  }

  /* ============================================================
     7. DONE
     ============================================================ */
  route(/^\/done$/, function () {
    setMeta("You're done | Peekiva", "Your answers have been sent.");
    setFooterCta(true);
    app.innerHTML =
      '<div class="wrap"><div class="hero center" style="padding-top:40px">' +
      '<span class="eyebrow">Sent with care</span>' +
      "<h1>You're <em>done.</em></h1>" +
      '<p class="sub">Your answers have been sent.<br>Now let them see what you really think.</p>' +
      '<div class="btn-row"><a class="btn btn-primary" href="/create" data-nav="/create">Create Your Own Quiz</a></div>' +
      "</div></div>";
  });

  /* ============================================================
     8. DASHBOARD  /manage/:token
     ============================================================ */
  route(/^\/manage\/([A-Za-z0-9_-]{20,64})$/, function (m) {
    var token = m[1];
    setFooterCta(false);
    app.innerHTML = '<div class="wrap"><p class="note" style="padding-top:40px">Opening your dashboard…</p></div>';
    api("/api/manage/" + encodeURIComponent(token)).then(function (data) {
      var quiz = data.quiz;
      setMeta("My quiz | Peekiva", "Your private dashboard — only you can see this page.");
      var qUrl = quizUrl(quiz.id);
      var rows = data.responses.map(function (r) {
        return '<a class="resp-row" href="/manage/' + esc(token) + "/response/" + esc(r.id) + '" data-nav="/manage/' + esc(token) + "/response/" + esc(r.id) + '">' +
          "<div><b>" + esc(r.responderName) + "’s Answers</b><span>" + r.answeredCount + " answered · " + esc(fmtDur(r.totalTimeMs)) + " · " + esc(r.timeAgo) + "</span></div>" +
          '<span class="go">→</span></a>';
      }).join("");
      app.innerHTML =
        '<div class="wrap"><div style="padding-top:24px">' +
        '<span class="eyebrow">My quiz · private</span>' +
        "<h2>" + esc(quiz.title) + "</h2>" +
        '<p class="note">' + quiz.questionCount + (quiz.questionCount === 1 ? " question" : " questions") + " · " +
        data.responses.length + (data.responses.length === 1 ? " response" : " responses") +
        (quiz.status === "closed" ? " · <b>closed</b>" : "") + "</p>" +
        (data.responses.length === 0
          ? '<div class="card blush"><h3>No answers yet</h3><p class="note" style="font-size:15px">Send your quiz link to someone — their answers will show up here the moment they finish.</p>' +
            '<div class="btn-row"><button class="btn btn-primary" id="d-copy">Copy quiz link</button></div></div>'
          : "<h3>Responses</h3>" + rows) +
        '<div class="card" style="margin-top:20px"><h3>Your links</h3>' +
        '<p class="tiny">Quiz link (send this to people):<br><b style="word-break:break-all">' + esc(qUrl) + '</b></p>' +
        '<div class="btn-row split"><button class="btn btn-ghost" id="d-copy">Copy quiz link</button>' +
        (quiz.status === "open"
          ? '<button class="btn btn-ghost" id="d-close">Close quiz</button>'
          : '<button class="btn btn-ghost" id="d-reopen">Reopen quiz</button>') +
        "</div>" +
        '<button class="btn btn-danger-ghost" id="d-delete" style="margin-top:4px">Delete quiz</button></div>' +
        "</div></div>";
      $("#d-copy").addEventListener("click", function () { copyText(qUrl, "Link copied!"); });
      var closeBtn = $("#d-close"), reopenBtn = $("#d-reopen");
      if (closeBtn) closeBtn.addEventListener("click", async function () {
        if (!confirm("Close this quiz? No one new will be able to answer it.")) return;
        try { await api("/api/manage/" + encodeURIComponent(token) + "/close", { method: "POST", body: {} }); toast("Quiz closed."); render(); }
        catch (e) { toast(e.message || "Something went wrong. Please try again."); }
      });
      if (reopenBtn) reopenBtn.addEventListener("click", async function () {
        try { await api("/api/manage/" + encodeURIComponent(token) + "/reopen", { method: "POST", body: {} }); toast("Quiz reopened."); render(); }
        catch (e) { toast(e.message || "Something went wrong. Please try again."); }
      });
      $("#d-delete").addEventListener("click", async function () {
        if (!confirm("Delete this quiz and all responses? This cannot be undone.")) return;
        try {
          await api("/api/manage/" + encodeURIComponent(token), { method: "DELETE" });
          toast("Quiz deleted.");
          navigate("/");
        } catch (e) { toast(e.message || "Something went wrong. Please try again."); }
      });
    }).catch(function (e) {
      if (e.code === "DASHBOARD_INVALID") notFound("This private dashboard link is invalid.", "Double-check the link — it should be the private one from your creation page, not the quiz link.");
      else { app.innerHTML = '<div class="wrap"><div class="alert">Something went wrong. Please try again.</div></div>'; }
    });
  });

  /* ============================================================
     9. ANSWERS  /manage/:token/response/:id
     ============================================================ */
  route(/^\/manage\/([A-Za-z0-9_-]{20,64})\/response\/([0-9a-f-]{20,64})$/, function (m) {
    var token = m[1], rid = m[2];
    setFooterCta(true);
    app.innerHTML = '<div class="wrap"><p class="note" style="padding-top:40px">Loading answers…</p></div>';
    api("/api/manage/" + encodeURIComponent(token) + "/responses/" + encodeURIComponent(rid)).then(function (data) {
      var s = data.stats;
      setMeta(data.response.responderName + "’s Answers | Peekiva", "Private results — only visible with your dashboard link.");
      var cards = data.answers.map(function (a) {
        return '<div class="card answer-card"><p class="tiny">Question ' + String(a.order).padStart(2, "0") + "</p>" +
          "<h3>" + esc(a.questionText) + "</h3>" +
          '<p class="who">' + esc(data.response.responderName) + "’s answer</p>" +
          (a.answered ? '<p class="ans">' + esc(a.answerText) + "</p>" : '<p class="ans note">No answer given.</p>') +
          (a.answered ? '<span class="time">Response time · ' + esc(fmtDur(a.timeSpentMs)) + "</span>" : "") +
          "</div>";
      }).join("");
      var slow = s.slowestThree.map(function (x, i) {
        return "<li><span>" + (i + 1) + ". " + esc(x.questionText) + '</span><span class="t">' + esc(fmtDur(x.timeSpentMs)) + "</span></li>";
      }).join("");
      app.innerHTML =
        '<div class="wrap"><div style="padding-top:24px">' +
        '<p><a href="/manage/' + esc(token) + '" data-nav="/manage/' + esc(token) + '" style="color:var(--brown-deep);font-size:14px">← All responses</a></p>' +
        "<h2>" + esc(data.response.responderName) + "’s <em>answers.</em></h2>" +
        '<p class="note">Finished ' + esc(data.response.timeAgo) + "</p>" +
        '<div class="stat-row">' +
        "<div class='stat'><b>" + s.answeredCount + "/" + s.questionCount + "</b><span>Answered</span></div>" +
        "<div class='stat'><b>" + esc(fmtDur(s.totalTimeMs)) + "</b><span>Total time</span></div>" +
        "<div class='stat'><b>" + esc(fmtDur(s.avgTimeMs)) + "</b><span>Average</span></div>" +
        "</div>" +
        '<div class="card"><h3>Response time</h3>' +
        '<div class="stat-row" style="margin-top:0">' +
        "<div class='stat'><b>" + esc(fmtDur(s.fastestMs)) + "</b><span>Fastest answer</span></div>" +
        "<div class='stat'><b>" + esc(fmtDur(s.longestMs)) + "</b><span>Longest think</span></div>" +
        "<div class='stat'><b>" + esc(fmtDur(s.avgTimeMs)) + "</b><span>Average</span></div>" +
        "</div>" +
        (slow ? "<h3 style='margin-top:8px'>Questions they thought about the longest</h3><ul class='slow-list'>" + slow + "</ul>" +
        '<p class="tiny">They took this long to answer — nothing more, nothing less.</p>' : "") +
        "</div>" +
        cards +
        '<div class="card blush center"><h3>Want to show this off?</h3>' +
        '<p class="note">Share a little preview — your full answers stay private.</p>' +
        '<div class="btn-row"><button class="btn btn-primary" id="v-share">Share Results</button></div>' +
        '<div id="v-share-out"></div></div>' +
        "</div></div>";
      $("#v-share").addEventListener("click", async function () {
        var btn = this;
        btn.disabled = true;
        btn.textContent = "Creating preview…";
        try {
          var d = await api("/api/manage/" + encodeURIComponent(token) + "/share", { method: "POST", body: { responseId: rid } });
          var url = shareUrl(d.shareId);
          $("#v-share-out").innerHTML =
            '<div class="share-box" style="margin-top:16px"><div class="link">' + esc(url) + "</div>" +
            '<p class="tiny" style="color:#e8d5cd">This preview shows the quiz title, name and time only — never the full answers.</p>' +
            '<div class="btn-row split" style="margin-bottom:0"><button class="btn btn-blush" id="v-copy">Copy Link</button>' +
            '<button class="btn btn-ghost" id="v-send" style="background:transparent;color:#fff;border-color:rgba(255,255,255,.4)">Share</button></div></div>';
          $("#v-copy").addEventListener("click", function () { copyText(url, "Link copied!"); });
          $("#v-send").addEventListener("click", function () { shareLink(url, "Our Peekiva quiz result", "Someone just finished my Peekiva quiz."); });
          btn.disabled = false;
          btn.textContent = "Share Results";
        } catch (e) {
          toast(e.message || "Something went wrong. Please try again.");
          btn.disabled = false;
          btn.textContent = "Share Results";
        }
      });
    }).catch(function (e) {
      if (e.code === "DASHBOARD_INVALID") notFound("This private dashboard link is invalid.");
      else if (e.code === "RESPONSE_NOT_FOUND") notFound("These answers couldn't be found.", "They may have been deleted.");
      else app.innerHTML = '<div class="wrap"><div class="alert">Something went wrong. Please try again.</div></div>';
    });
  });

  /* ============================================================
     10. SHARED PREVIEW  /r/:id  (privacy-safe: no answers)
     ============================================================ */
  route(/^\/r\/([A-Za-z0-9_-]{6,32})$/, function (m) {
    var shareId = m[1];
    setFooterCta(true);
    app.innerHTML = '<div class="wrap"><p class="note" style="padding-top:40px">Loading…</p></div>';
    api("/api/shared/" + encodeURIComponent(shareId)).then(function (data) {
      var s = data.share;
      setMeta("Someone just completed a Peekiva quiz | Peekiva", "Think you know them better? Make your own free quiz and find out.");
      app.innerHTML =
        '<div class="wrap"><div class="hero center" style="padding-top:40px">' +
        '<span class="eyebrow">Fresh off the press</span>' +
        "<h2>Someone just finished<br>a <em>Peekiva quiz.</em></h2>" +
        '<div class="card" style="text-align:left;margin-top:20px">' +
        '<p class="tiny">Quiz</p><h3>' + esc(s.quizTitle) + "</h3>" +
        '<p class="tiny">Completed by</p><h3>' + esc(s.responderName) + "</h3>" +
        '<div class="stat-row"><div class="stat"><b>' + s.answeredCount + "</b><span>Answered</span></div>" +
        '<div class="stat"><b>' + esc(fmtDur(s.totalTimeMs)) + "</b><span>Total time</span></div></div>" +
        '<p class="tiny">Full answers stay private between them — this is just the highlight reel.</p></div>' +
        '<div class="btn-row"><a class="btn btn-primary" href="/create" data-nav="/create">Create Your Own Quiz</a>' +
        '<a class="btn btn-ghost" href="/quiz/' + esc(s.quizId) + '" data-nav="/quiz/' + esc(s.quizId) + '">Take this quiz</a></div>' +
        "</div></div>";
    }).catch(function () {
      notFound("This shared result isn't available.", "The link may be old, or the quiz may have been deleted.");
    });
  });

  /* ---------- boot ---------- */
  render();
})();
