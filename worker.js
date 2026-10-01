/**
 * Peekiva Couple Quiz — Cloudflare Worker backend (100% FREE, no payments).
 *
 * Frontend: Cloudflare Pages (static). Data: Cloudflare D1.
 * One quiz supports MANY responses. Creator permission is proven by the
 * unguessable creator_token — the public quiz id alone can never read answers.
 *
 * Security rules enforced here:
 * - Public quiz endpoint returns title/description/questions ONLY
 *   (no creator_token, no responses, no answers).
 * - Every /manage/ route requires the correct creator_token.
 * - Share preview pages expose title + name + timing ONLY, never answers.
 * - All ids/tokens are high-entropy (crypto.getRandomValues / randomUUID).
 * - Simple per-IP rate limits on quiz/response creation (D1 counts).
 * - Per-question time_spent is computed server-side and clamped.
 */

const QUIZ_ID_LEN = 7;
const TOKEN_LEN = 32; // 192-bit entropy, url-safe
const SHARE_ID_LEN = 12;
const ALPHA_QUIZ = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const ALPHA_SAFE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const MAX_BODY_BYTES = 256 * 1024;
const MAX_TIME_SPENT_MS = 3600 * 1000; // clamp a single answer to 1h (walked away)
const LIMITS = { title: 120, desc: 500, qtext: 300, option: 120, name: 40, answer: 500 };
const MAX_QUESTIONS = 30;
const TYPES = ["choice", "yesno", "short"];

// ---------- helpers ----------
const nowMs = () => Date.now();

function randStr(len, alphabet) {
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  let s = "";
  for (let i = 0; i < len; i++) s += alphabet[buf[i] % alphabet.length];
  return s;
}

function corsHeaders(env) {
  const allowed = (env && env.ALLOWED_ORIGIN) || "";
  const h = {
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
  if (allowed) {
    h["Access-Control-Allow-Origin"] = allowed;
    h["Vary"] = "Origin";
  }
  return h;
}

function json(data, status, env) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: Object.assign(
      { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
      corsHeaders(env)
    ),
  });
}

function finalizeCors(res, req, env) {
  const allowed = (env && env.ALLOWED_ORIGIN) || "";
  if (allowed) {
    const o = req ? req.headers.get("Origin") : null;
    if (o && o !== allowed) res.headers.delete("Access-Control-Allow-Origin");
  }
  return res;
}

const ok = (data, env) => json({ success: true, data }, 200, env);
const fail = (code, message, env, status) => json({ success: false, code, message }, status || 200, env);

function clientIp(req) {
  return req.headers.get("CF-Connecting-IP") || req.headers.get("X-Forwarded-For") || "";
}

async function readJson(req, env) {
  try {
    const text = await req.text();
    if (!text) return {};
    if (text.length > MAX_BODY_BYTES) return { __tooLarge: true };
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function str(v, max) {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s || s.length > max) return null;
  return s;
}

function clampTimeSpent(startedAt, answeredAt) {
  if (!Number.isFinite(startedAt) || !Number.isFinite(answeredAt)) return null;
  startedAt = Math.floor(startedAt);
  answeredAt = Math.floor(answeredAt);
  if (answeredAt < startedAt) return null;
  // Reject absurd future timestamps (allow 60s clock skew).
  if (answeredAt > nowMs() + 60000) return null;
  // Reject timestamps older than 30 days (garbage input).
  if (startedAt < nowMs() - 30 * 86400000) return null;
  return Math.min(answeredAt - startedAt, MAX_TIME_SPENT_MS);
}

async function rateLimited(env, ip, kind) {
  // kind: 'quiz' (10/hour) | 'response' (30/hour)
  const cap = kind === "quiz" ? 10 : 30;
  const table = kind === "quiz" ? "quizzes" : "responses";
  const since = nowMs() - 3600000;
  try {
    const row = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM ${table} WHERE created_ip = ? AND created_at > ?`
    ).bind(ip || "unknown", since).first();
    return (row && row.c >= cap) ? cap : 0;
  } catch {
    return 0; // fail open on DB hiccup (abuse impact is low for a free quiz tool)
  }
}

// ---------- public: create quiz ----------
async function hCreateQuiz(env, body, req) {
  if (!body || body.__tooLarge) return fail("BAD_REQUEST", "That quiz is too large. Try fewer questions.", env);
  const title = str(body.title, LIMITS.title);
  const description = typeof body.description === "string" ? body.description.trim().slice(0, LIMITS.desc) : "";
  const qs = body.questions;
  if (!title) return fail("BAD_TITLE", "Please give your quiz a title.", env);
  if (!Array.isArray(qs) || qs.length < 1 || qs.length > MAX_QUESTIONS)
    return fail("BAD_QUESTIONS", `Please add between 1 and ${MAX_QUESTIONS} questions.`, env);

  const clean = [];
  for (let i = 0; i < qs.length; i++) {
    const q = qs[i] || {};
    const text = str(q.text, LIMITS.qtext);
    const type = TYPES.includes(q.type) ? q.type : null;
    if (!text || !type) return fail("BAD_QUESTION", `Question ${i + 1} needs text and a type.`, env);
    let options = [];
    if (type === "choice") {
      if (!Array.isArray(q.options)) return fail("BAD_OPTIONS", `Question ${i + 1} needs 2–6 options.`, env);
      options = q.options.map((o) => (typeof o === "string" ? o.trim() : "")).filter(Boolean);
      if (options.length < 2 || options.length > 6)
        return fail("BAD_OPTIONS", `Question ${i + 1} needs 2–6 options.`, env);
      if (options.some((o) => o.length > LIMITS.option))
        return fail("BAD_OPTIONS", `Question ${i + 1} has an option that is too long.`, env);
    }
    clean.push({ text, type, options });
  }

  const ip = clientIp(req);
  const cap = await rateLimited(env, ip, "quiz");
  if (cap) return fail("RATE_LIMITED", "You are creating quizzes too fast. Please wait a bit and try again.", env, 429);

  // Unique public quiz id (retry on the astronomically unlikely collision).
  let quizId = null;
  for (let t = 0; t < 5; t++) {
    const cand = randStr(QUIZ_ID_LEN, ALPHA_QUIZ);
    const exists = await env.DB.prepare("SELECT id FROM quizzes WHERE id = ?").bind(cand).first();
    if (!exists) { quizId = cand; break; }
  }
  if (!quizId) return fail("SERVER_ERROR", "Something went wrong. Please try again.", env, 500);

  const creatorToken = randStr(TOKEN_LEN, ALPHA_SAFE);
  const t = nowMs();
  const batch = [
    env.DB.prepare(
      "INSERT INTO quizzes (id, creator_token, title, description, status, created_at, created_ip, response_count) VALUES (?,?,?,?,?,?,?,0)"
    ).bind(quizId, creatorToken, title, description, "open", t, ip),
  ];
  clean.forEach((q, i) => {
    batch.push(
      env.DB.prepare(
        "INSERT INTO questions (id, quiz_id, question_order, question_text, question_type, options_json, created_at) VALUES (?,?,?,?,?,?,?)"
      ).bind(crypto.randomUUID(), quizId, i, q.text, q.type, JSON.stringify(q.options), t)
    );
  });
  await env.DB.batch(batch);

  return ok({ quizId, creatorToken, questionCount: clean.length }, env);
}

// ---------- public: read quiz (answerable view — never leaks creator data) ----------
async function hGetQuiz(env, quizId) {
  const quiz = await env.DB.prepare("SELECT id, title, description, status FROM quizzes WHERE id = ?").bind(quizId).first();
  if (!quiz) return fail("QUIZ_NOT_FOUND", "This quiz doesn't exist.", env, 404);
  if (quiz.status !== "open") return fail("QUIZ_CLOSED", "This quiz is no longer available.", env, 410);
  const rows = await env.DB.prepare(
    "SELECT id, question_order, question_text, question_type, options_json FROM questions WHERE quiz_id = ? ORDER BY question_order ASC"
  ).bind(quizId).all();
  return ok({
    quiz: {
      id: quiz.id,
      title: quiz.title,
      description: quiz.description,
      questionCount: (rows.results || []).length,
      questions: (rows.results || []).map((r) => ({
        id: r.id,
        text: r.question_text,
        type: r.question_type,
        options: r.question_type === "choice" ? JSON.parse(r.options_json || "[]") : [],
      })),
    },
  }, env);
}

// ---------- public: start a response ----------
async function hCreateResponse(env, quizId, body, req) {
  const quiz = await env.DB.prepare("SELECT id, status FROM quizzes WHERE id = ?").bind(quizId).first();
  if (!quiz) return fail("QUIZ_NOT_FOUND", "This quiz doesn't exist.", env, 404);
  if (quiz.status !== "open") return fail("QUIZ_CLOSED", "This quiz is no longer available.", env, 410);
  const name = body && str(body.responderName, LIMITS.name);
  if (!name) return fail("BAD_NAME", "Please enter your name (up to 40 characters).", env);
  const ip = clientIp(req);
  const cap = await rateLimited(env, ip, "response");
  if (cap) return fail("RATE_LIMITED", "Too many responses from here. Please wait a bit and try again.", env, 429);
  const id = crypto.randomUUID();
  const t = nowMs();
  // NOTE: NULLs are inlined as SQL literals (not bound params) because
  // bound nulls silently fail to persist on some D1/runtime combinations.
  await env.DB.prepare(
    "INSERT INTO responses (id, quiz_id, responder_name, started_at, completed_at, total_time_ms, created_at, created_ip) VALUES (?,?,?,?,NULL,NULL,?,?)"
  ).bind(id, quizId, name, t, t, ip).run();
  return ok({ responseId: id, startedAt: t }, env);
}

async function getResponse(env, responseId) {
  if (!responseId || typeof responseId !== "string" || responseId.length > 64) return null;
  return env.DB.prepare("SELECT * FROM responses WHERE id = ?").bind(responseId).first();
}

// ---------- public: resume state (refresh recovery) ----------
async function hResponseState(env, responseId) {
  const r = await getResponse(env, responseId);
  if (!r) return fail("RESPONSE_NOT_FOUND", "This answer session wasn't found. Please start again.", env, 404);
  if (r.completed_at) return fail("ALREADY_COMPLETED", "These answers were already sent.", env, 409);
  const quizRes = await hGetQuiz(env, r.quiz_id);
  const quizJson = await quizRes.json();
  if (!quizJson.success) return quizRes;
  const ans = await env.DB.prepare(
    "SELECT question_id, answer_text, started_at, answered_at, time_spent_ms FROM answers WHERE response_id = ?"
  ).bind(responseId).all();
  return ok({
    quiz: quizJson.data.quiz,
    response: { id: r.id, responderName: r.responder_name, startedAt: r.started_at },
    answers: ans.results || [],
  }, env);
}

// ---------- public: save answers (upsert, server-computed timing) ----------
async function hSaveAnswers(env, responseId, body) {
  const r = await getResponse(env, responseId);
  if (!r) return fail("RESPONSE_NOT_FOUND", "This answer session wasn't found. Please start again.", env, 404);
  if (r.completed_at) return fail("ALREADY_COMPLETED", "These answers were already sent.", env, 409);
  if (!body || !Array.isArray(body.answers) || body.answers.length < 1 || body.answers.length > MAX_QUESTIONS)
    return fail("BAD_ANSWERS", "No answers to save.", env);

  const qrows = await env.DB.prepare(
    "SELECT id, question_type, options_json FROM questions WHERE quiz_id = ?"
  ).bind(r.quiz_id).all();
  const qmap = {};
  (qrows.results || []).forEach((q) => { qmap[q.id] = q; });

  const stmts = [];
  let saved = 0;
  for (const a of body.answers) {
    if (!a || typeof a.questionId !== "string") continue;
    const q = qmap[a.questionId];
    if (!q) continue; // ignore answers for unknown questions
    const text = typeof a.answerText === "string" ? a.answerText.trim().slice(0, LIMITS.answer) : "";
    if (q.question_type === "choice") {
      let opts = [];
      try { opts = JSON.parse(q.options_json || "[]"); } catch { opts = []; }
      if (!opts.includes(text)) continue; // must match a real option
    } else if (q.question_type === "yesno") {
      if (text !== "Yes" && text !== "No") continue;
    }
    const spent = clampTimeSpent(a.startedAt, a.answeredAt);
    if (spent === null) continue;
    stmts.push(
      env.DB.prepare(
        "INSERT INTO answers (response_id, question_id, answer_text, started_at, answered_at, time_spent_ms) VALUES (?,?,?,?,?,?) ON CONFLICT(response_id, question_id) DO UPDATE SET answer_text=excluded.answer_text, started_at=excluded.started_at, answered_at=excluded.answered_at, time_spent_ms=excluded.time_spent_ms"
      ).bind(responseId, a.questionId, text, Math.floor(a.startedAt), Math.floor(a.answeredAt), spent)
    );
    saved++;
  }
  if (!stmts.length) return fail("BAD_ANSWERS", "Nothing valid to save.", env);
  await env.DB.batch(stmts);
  return ok({ saved }, env);
}

// ---------- public: complete ----------
async function hComplete(env, responseId) {
  const r = await getResponse(env, responseId);
  if (!r) return fail("RESPONSE_NOT_FOUND", "This answer session wasn't found. Please start again.", env, 404);
  if (r.completed_at) return ok({ already: true, totalTimeMs: r.total_time_ms }, env);
  const t = nowMs();
  const total = Math.max(0, t - r.started_at);
  await env.DB.batch([
    env.DB.prepare("UPDATE responses SET completed_at = ?, total_time_ms = ? WHERE id = ?").bind(t, total, responseId),
    env.DB.prepare("UPDATE quizzes SET response_count = response_count + 1 WHERE id = ?").bind(r.quiz_id),
  ]);
  return ok({ totalTimeMs: total }, env);
}

// ---------- creator: dashboard ----------
async function getQuizByToken(env, token) {
  if (!token || typeof token !== "string" || token.length > 64) return null;
  return env.DB.prepare("SELECT * FROM quizzes WHERE creator_token = ?").bind(token).first();
}

function timeAgo(ts) {
  const d = nowMs() - ts;
  if (d < 60000) return "just now";
  if (d < 3600000) { const m = Math.floor(d / 60000); return m === 1 ? "1 minute ago" : `${m} minutes ago`; }
  if (d < 86400000) { const h = Math.floor(d / 3600000); return h === 1 ? "1 hour ago" : `${h} hours ago`; }
  const days = Math.floor(d / 86400000);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

async function hManage(env, token) {
  const quiz = await getQuizByToken(env, token);
  if (!quiz) return fail("DASHBOARD_INVALID", "This private dashboard link is invalid.", env, 404);
  const qrow = await env.DB.prepare("SELECT COUNT(*) AS c FROM questions WHERE quiz_id = ?").bind(quiz.id).first();
  const rrows = await env.DB.prepare(
    "SELECT id, responder_name, started_at, completed_at, total_time_ms FROM responses WHERE quiz_id = ? AND completed_at IS NOT NULL ORDER BY completed_at DESC"
  ).bind(quiz.id).all();
  const responses = await Promise.all((rrows.results || []).map(async (r) => {
    const arow = await env.DB.prepare("SELECT COUNT(*) AS c, COALESCE(AVG(time_spent_ms),0) AS a FROM answers WHERE response_id = ?").bind(r.id).first();
    return {
      id: r.id,
      responderName: r.responder_name,
      completedAt: r.completed_at,
      timeAgo: timeAgo(r.completed_at),
      totalTimeMs: r.total_time_ms,
      answeredCount: arow ? arow.c : 0,
      avgTimeMs: arow ? Math.round(arow.a) : 0,
    };
  }));
  return ok({
    quiz: {
      id: quiz.id,
      title: quiz.title,
      description: quiz.description,
      status: quiz.status,
      createdAt: quiz.created_at,
      questionCount: qrow ? qrow.c : 0,
      responseCount: responses.length,
    },
    responses,
  }, env);
}

// ---------- creator: full response with timing ----------
async function hManageResponse(env, token, responseId) {
  const quiz = await getQuizByToken(env, token);
  if (!quiz) return fail("DASHBOARD_INVALID", "This private dashboard link is invalid.", env, 404);
  const r = await getResponse(env, responseId);
  if (!r || r.quiz_id !== quiz.id || !r.completed_at)
    return fail("RESPONSE_NOT_FOUND", "These answers couldn't be found.", env, 404);
  const qrows = await env.DB.prepare(
    "SELECT id, question_order, question_text, question_type FROM questions WHERE quiz_id = ? ORDER BY question_order ASC"
  ).bind(quiz.id).all();
  const arows = await env.DB.prepare("SELECT * FROM answers WHERE response_id = ?").bind(responseId).all();
  const amap = {};
  (arows.results || []).forEach((a) => { amap[a.question_id] = a; });
  const items = (qrows.results || []).map((q, i) => {
    const a = amap[q.id] || null;
    return {
      order: i + 1,
      questionId: q.id,
      questionText: q.question_text,
      questionType: q.question_type,
      answerText: a ? a.answer_text : "",
      answered: !!a,
      timeSpentMs: a ? a.time_spent_ms : 0,
    };
  });
  const timed = items.filter((x) => x.answered);
  const total = r.total_time_ms || 0;
  const avg = timed.length ? Math.round(timed.reduce((s, x) => s + x.timeSpentMs, 0) / timed.length) : 0;
  const sorted = timed.slice().sort((a, b) => b.timeSpentMs - a.timeSpentMs);
  return ok({
    response: { id: r.id, responderName: r.responder_name, completedAt: r.completed_at, timeAgo: timeAgo(r.completed_at) },
    stats: {
      questionCount: items.length,
      answeredCount: timed.length,
      totalTimeMs: total,
      avgTimeMs: avg,
      fastestMs: sorted.length ? sorted[sorted.length - 1].timeSpentMs : 0,
      longestMs: sorted.length ? sorted[0].timeSpentMs : 0,
      slowestThree: sorted.slice(0, 3).map((x) => ({ questionText: x.questionText, timeSpentMs: x.timeSpentMs })),
    },
    answers: items,
  }, env);
}

// ---------- creator: share preview (privacy-safe) ----------
async function hShare(env, token, body) {
  const quiz = await getQuizByToken(env, token);
  if (!quiz) return fail("DASHBOARD_INVALID", "This private dashboard link is invalid.", env, 404);
  const responseId = body && body.responseId;
  const r = await getResponse(env, responseId);
  if (!r || r.quiz_id !== quiz.id || !r.completed_at)
    return fail("RESPONSE_NOT_FOUND", "These answers couldn't be found.", env, 404);
  const existing = await env.DB.prepare("SELECT id FROM shares WHERE response_id = ?").bind(responseId).first();
  if (existing) return ok({ shareId: existing.id }, env);
  let shareId = null;
  for (let t = 0; t < 5; t++) {
    const cand = randStr(SHARE_ID_LEN, ALPHA_SAFE);
    const dup = await env.DB.prepare("SELECT id FROM shares WHERE id = ?").bind(cand).first();
    if (!dup) { shareId = cand; break; }
  }
  if (!shareId) return fail("SERVER_ERROR", "Something went wrong. Please try again.", env, 500);
  await env.DB.prepare("INSERT INTO shares (id, quiz_id, response_id, created_at) VALUES (?,?,?,?)")
    .bind(shareId, quiz.id, responseId, nowMs()).run();
  return ok({ shareId }, env);
}

async function hShared(env, shareId) {
  if (!shareId || typeof shareId !== "string" || shareId.length > 32)
    return fail("SHARE_NOT_FOUND", "This shared result isn't available.", env, 404);
  const s = await env.DB.prepare("SELECT * FROM shares WHERE id = ?").bind(shareId).first();
  if (!s) return fail("SHARE_NOT_FOUND", "This shared result isn't available.", env, 404);
  const quiz = await env.DB.prepare("SELECT id, title FROM quizzes WHERE id = ?").bind(s.quiz_id).first();
  const r = await getResponse(env, s.response_id);
  if (!quiz || !r || !r.completed_at) return fail("SHARE_NOT_FOUND", "This shared result isn't available.", env, 404);
  const arow = await env.DB.prepare("SELECT COUNT(*) AS c FROM answers WHERE response_id = ?").bind(r.id).first();
  // NOTE: answers are intentionally never included here.
  return ok({
    share: {
      quizTitle: quiz.title,
      quizId: quiz.id,
      responderName: r.responder_name,
      completedAt: r.completed_at,
      totalTimeMs: r.total_time_ms,
      answeredCount: arow ? arow.c : 0,
    },
  }, env);
}

// ---------- creator: close / reopen / delete ----------
async function hSetStatus(env, token, status) {
  const quiz = await getQuizByToken(env, token);
  if (!quiz) return fail("DASHBOARD_INVALID", "This private dashboard link is invalid.", env, 404);
  await env.DB.prepare("UPDATE quizzes SET status = ? WHERE id = ?").bind(status, quiz.id).run();
  return ok({ status }, env);
}

async function hDelete(env, token) {
  const quiz = await getQuizByToken(env, token);
  if (!quiz) return fail("DASHBOARD_INVALID", "This private dashboard link is invalid.", env, 404);
  const rrows = await env.DB.prepare("SELECT id FROM responses WHERE quiz_id = ?").bind(quiz.id).all();
  const batch = [];
  (rrows.results || []).forEach((r) => {
    batch.push(env.DB.prepare("DELETE FROM answers WHERE response_id = ?").bind(r.id));
    batch.push(env.DB.prepare("DELETE FROM shares WHERE response_id = ?").bind(r.id));
  });
  batch.push(env.DB.prepare("DELETE FROM responses WHERE quiz_id = ?").bind(quiz.id));
  batch.push(env.DB.prepare("DELETE FROM questions WHERE quiz_id = ?").bind(quiz.id));
  batch.push(env.DB.prepare("DELETE FROM shares WHERE quiz_id = ?").bind(quiz.id));
  batch.push(env.DB.prepare("DELETE FROM quizzes WHERE id = ?").bind(quiz.id));
  await env.DB.batch(batch);
  return ok({ deleted: true }, env);
}

// ---------- router ----------
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    if (request.method === "OPTIONS") {
      if ((env.ALLOWED_ORIGIN || "") && request.headers.get("Origin") !== env.ALLOWED_ORIGIN)
        return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: corsHeaders(env) });
    }
    let res;
    try {
      const seg = path.split("/").filter(Boolean); // e.g. ["api","quiz","abc"]
      if (seg[0] !== "api") {
        res = fail("NOT_FOUND", "Endpoint not found.", env, 404);
      } else if (request.method === "GET" && seg.length === 2 && seg[1] === "health") {
        res = ok({ service: "peekiva-couple-quiz", free: true }, env);
      } else if (request.method === "POST" && seg.length === 2 && seg[1] === "quizzes") {
        res = await hCreateQuiz(env, await readJson(request, env), request);
      } else if (request.method === "GET" && seg.length === 3 && seg[1] === "quiz") {
        res = await hGetQuiz(env, decodeURIComponent(seg[2]));
      } else if (request.method === "POST" && seg.length === 4 && seg[1] === "quiz" && seg[3] === "responses") {
        res = await hCreateResponse(env, decodeURIComponent(seg[2]), await readJson(request, env), request);
      } else if (request.method === "GET" && seg.length === 4 && seg[1] === "responses" && seg[3] === "state") {
        res = await hResponseState(env, decodeURIComponent(seg[2]));
      } else if (request.method === "POST" && seg.length === 4 && seg[1] === "responses" && seg[3] === "answers") {
        res = await hSaveAnswers(env, decodeURIComponent(seg[2]), await readJson(request, env));
      } else if (request.method === "POST" && seg.length === 4 && seg[1] === "responses" && seg[3] === "complete") {
        res = await hComplete(env, decodeURIComponent(seg[2]));
      } else if (request.method === "GET" && seg.length === 3 && seg[1] === "manage") {
        res = await hManage(env, decodeURIComponent(seg[2]));
      } else if (request.method === "GET" && seg.length === 5 && seg[1] === "manage" && seg[3] === "responses") {
        res = await hManageResponse(env, decodeURIComponent(seg[2]), decodeURIComponent(seg[4]));
      } else if (request.method === "POST" && seg.length === 4 && seg[1] === "manage" && seg[3] === "share") {
        res = await hShare(env, decodeURIComponent(seg[2]), await readJson(request, env));
      } else if (request.method === "POST" && seg.length === 4 && seg[1] === "manage" && (seg[3] === "close" || seg[3] === "reopen")) {
        res = await hSetStatus(env, decodeURIComponent(seg[2]), seg[3] === "close" ? "closed" : "open");
      } else if (request.method === "DELETE" && seg.length === 3 && seg[1] === "manage") {
        res = await hDelete(env, decodeURIComponent(seg[2]));
      } else if (request.method === "GET" && seg.length === 3 && seg[1] === "shared") {
        res = await hShared(env, decodeURIComponent(seg[2]));
      } else {
        res = fail("NOT_FOUND", "Endpoint not found.", env, 404);
      }
    } catch (e) {
      res = fail("SERVER_ERROR", "Something went wrong on the server.", env, 500);
    }
    return finalizeCors(res, request, env);
  },
};
