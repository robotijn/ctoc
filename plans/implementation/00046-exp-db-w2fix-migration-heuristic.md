---
title: "DB-w2 fix — migration-safety heuristic (location hole + comment/string false positives)"
type: implementation
parent_plan: ctoc-registry-expansion
depends_on: 00045-exp-db-w2-migration-safety
priority: HIGH
program: ctoc-registry-expansion
iron_loop: true
files:
  - "src/lib/migration-safety-checker.js"
  - "tests/migration-safety-checker.test.js"
---

# DB-w2 fix — 3 confirmed heuristic defects (adversarial review)

The migration-safety architecture/wiring/data are sound; the destructive-scan HEURISTIC has
3 confirmed defects. All reproduced by execution. Fix in migration-safety-checker.js only.

## F1 (HIGH) — destructive DDL in an unlisted directory ships GREEN
CONFIRMED: `sql/003.sql` and `database/migrate/004.sql` each with `DROP TABLE users;` →
`scanned:false, reason:"no migrations detected"` → gate passes. The 7 hardcoded
MIGRATION_LOCATIONS miss `sql/`, `database/`, Django `<app>/migrations/`, Sqitch `deploy/`,
etc. "No migrations detected" conflates *none exist* with *none in my 7 dirs*.

FIX (two parts):
1. WIDEN discovery: in `detectMigrationFiles`, ALSO include (a) any directory ANYWHERE in the
   tree whose basename matches `/migrat/i` (migrations|migrate|migration) — bounded by the
   existing depth/file caps, discovered via a safeFs walk; (b) common SQL roots `sql/`,
   `database/`, `db/`. Keep the known tool dirs. Dedupe discovered files. This catches Django
   `<app>/migrations/`, `database/migrate/`, `sql/003.sql`.
2. HONEST skip message: when zero migration files are found, the `reason` must NAME the
   locations searched (e.g. "no migration files found under: migrations/, sql/, database/,
   any *migrat* dir, prisma/migrations, …") so "no migrations" can never be read as "nothing
   to check." Keep `scanned:false` (a genuine no-migrations repo is still an honest skip).

## F2 (MEDIUM) — `#` comment in .py/.rb flagged as destructive
CONFIRMED: a Python migration line `# TODO: drop table legacy_users later` → 1 HIGH. The
checker reads `.py`/`.rb` but `stripSqlLineComment` strips only SQL `--`.
FIX: make comment-stripping file-type aware — strip `--` for `.sql`, and strip `#...` for
`.py`/`.rb` (a leading-or-inline `#` comment), before matching. (A `#` inside a SQL string is
rare and out of scope; document it.)

## F3 (MEDIUM) — string-literal / block-comment false positives fail legitimate migrations
CONFIRMED: `INSERT INTO settings VALUES ('auto-truncate logs nightly');` → 1 HIGH (a benign
seed blocks the gate); `/* DROP TABLE users; */` → HIGH. The bare-word patterns match anywhere
on a line.
FIX (two parts):
1. STRIP `/* … */` block comments (including multi-line) from the content before scanning.
2. ANCHOR the destructive patterns to STATEMENT POSITION — the keyword must be the statement
   verb, i.e. at line start (after optional whitespace) OR immediately after a `;`. Rewrite the
   CONSTANT patterns (still safeRegExp, still ReDoS-safe) as e.g.
   `(?:^|;)\s*DROP\s+TABLE\b`, `(?:^|;)\s*TRUNCATE\b`, `(?:^|;)\s*ALTER\s+TABLE\b[^;]*\bDROP\b`,
   `(?:^|;)\s*DROP\s+(DATABASE|SCHEMA|COLUMN)\b`. This keeps the true positives
   (`DROP TABLE users;`, `TRUNCATE x;`, `DROP TABLE IF EXISTS`, and a second statement after
   `;` on the same line) while dropping string-embedded / comment / mid-line mentions.
   NOTE: `DROP COLUMN` usually appears as `ALTER TABLE … DROP COLUMN` (caught by the ALTER
   rule) — keep a statement-anchored `DROP COLUMN` too for standalone dialects, but verify the
   ALTER rule still fires for `ALTER TABLE t DROP COLUMN c;`.

## F4 (LOW) — DROP split across lines (`DROP\nTABLE`) — DOCUMENT, do not fix
Low probability (formatters keep `DROP TABLE` together) and it conflicts with statement
anchoring. Add it to the documented scope limitations comment; no code change.

## TDD-Red FIRST — add to tests/migration-safety-checker.test.js (real fixtures)
- F1: `sql/003.sql` with `DROP TABLE` → 1 HIGH (was scanned:false); Django-style
  `myapp/migrations/0002.py` with embedded `op.execute("DROP TABLE x")` → detected; a genuine
  no-migrations repo → scanned:false with a reason that NAMES searched dirs.
- F2: a `.py` line `# drop table foo` → 0 findings; a `.py` with real `op.execute("DROP TABLE foo")`
  → 1 finding (# stripping must not hide real embedded SQL).
- F3: `INSERT ... VALUES ('auto-truncate ...')` → 0 findings; `/* DROP TABLE x */` → 0 findings;
  a real `DROP TABLE users;` → 1 finding; `CREATE TABLE x; DROP TABLE y;` (two statements) → 1
  finding (the post-`;` DROP); `ALTER TABLE t DROP COLUMN c;` → 1 finding (still fires).
Run RED first (F1 sql/ and the F2/F3 false positives fail before the fix).

## VERIFY (Step 14) — paste verbatim
`node --test tests/migration-safety-checker.test.js tests/quality-fleet-wiring.test.js
tests/security.test.js` all green; a hand-run replaying the 3 reproductions (sql/ DROP now
HIGH; 'auto-truncate' string → 0; `#` comment → 0); eslint clean; tsc 0; enforcer 0 block;
NO git. Step 16: confirm the location hole is closed, the honest skip names searched dirs, and
the 3 false-positive classes no longer fire while true positives still do.
