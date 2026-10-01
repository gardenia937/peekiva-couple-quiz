-- ============================================================
-- Peekiva Couple Quiz — Cloudflare D1 schema (FREE product)
-- Apply with the API or:
--   wrangler d1 execute couple-quiz-db --remote --file=schema.sql
-- One quiz can have MANY responses (partners, friends, family).
-- No payments, no secrets, no auth tables. Creator permission is
-- proven by the unguessable creator_token stored on quizzes.
-- ============================================================

-- Quizzes created by someone (the "creator").
-- id: short PUBLIC quiz id, e.g. 7Hk92Lm (anyone with the link can answer)
-- creator_token: PRIVATE high-entropy token, e.g. 32 url-safe chars
--   (only the creator's /manage/:creatorToken URL contains it)
CREATE TABLE IF NOT EXISTS quizzes (
  id            TEXT PRIMARY KEY,
  creator_token TEXT NOT NULL UNIQUE,
  title         TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'open',   -- open | closed
  created_at    INTEGER NOT NULL,               -- unix ms
  created_ip    TEXT NOT NULL DEFAULT '',
  response_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_quizzes_token ON quizzes(creator_token);

-- Questions belonging to a quiz.
-- question_type: 'choice' | 'yesno' | 'short'
-- options_json: JSON array of strings (only for 'choice')
CREATE TABLE IF NOT EXISTS questions (
  id             TEXT PRIMARY KEY,
  quiz_id        TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  question_order INTEGER NOT NULL,
  question_text  TEXT NOT NULL,
  question_type  TEXT NOT NULL DEFAULT 'choice',
  options_json   TEXT NOT NULL DEFAULT '[]',
  created_at     INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_questions_quiz ON questions(quiz_id, question_order);

-- One response = one person answering one quiz.
-- started_at/completed_at are SERVER timestamps (unix ms).
-- total_time_ms is computed server-side on completion.
CREATE TABLE IF NOT EXISTS responses (
  id             TEXT PRIMARY KEY,   -- uuid v4, unguessable (used as resume token)
  quiz_id        TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  responder_name TEXT NOT NULL,
  started_at     INTEGER NOT NULL,
  completed_at   INTEGER,            -- NULL until finished
  total_time_ms  INTEGER,            -- set on completion
  created_at     INTEGER NOT NULL,
  created_ip     TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_responses_quiz ON responses(quiz_id, completed_at);

-- Per-question answers with per-question timing.
-- started_at/answered_at: client wall-clock (unix ms), validated + clamped server-side.
-- time_spent_ms: computed SERVER-side as answered_at - started_at (clamped 0..1h).
CREATE TABLE IF NOT EXISTS answers (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  response_id   TEXT NOT NULL REFERENCES responses(id) ON DELETE CASCADE,
  question_id   TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  answer_text   TEXT NOT NULL DEFAULT '',
  started_at    INTEGER NOT NULL,
  answered_at   INTEGER NOT NULL,
  time_spent_ms INTEGER NOT NULL,
  UNIQUE(response_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_answers_response ON answers(response_id);

-- Shareable result PREVIEWS (privacy-safe).
-- A share page shows quiz title, responder name and timing ONLY.
-- Full answers are NEVER exposed through a share link.
CREATE TABLE IF NOT EXISTS shares (
  id          TEXT PRIMARY KEY,     -- short public id, e.g. 12 url-safe chars
  quiz_id     TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  response_id TEXT NOT NULL REFERENCES responses(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  UNIQUE(response_id)
);

CREATE INDEX IF NOT EXISTS idx_shares_quiz ON shares(quiz_id);
