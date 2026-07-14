---
title: "Databases dimension wave 2 — migration-safety check (destructive-DDL) wired to the pipeline"
type: implementation
parent_plan: ctoc-registry-expansion
depends_on: 00044-exp-db-w1-database-dimension
priority: HIGH
program: ctoc-registry-expansion
iron_loop: true
files:
  - "src/lib/migration-safety-checker.js"
  - "src/lib/quality-agent.js"
  - "tests/migration-safety-checker.test.js"
---

# DB-w2 — migration-safety check (the full-pipeline-integration consumer)

DB-w1 detects databases; DB-w2 is the real CHECK: a destructive-migration detector wired
into the quality pipeline, so a migration that drops a table/column is flagged before it
ships. Design: `atlas migrate lint`'s semantic analysis needs a live dev DB (not CI-safe),
so the ALWAYS-ON core is a STATIC scan of migration files for destructive DDL — no running
database, works everywhere, catches the real data-loss risk. Atlas is an optional deeper
mode only when Atlas + a dev-url are configured (do NOT require it).

## src/lib/migration-safety-checker.js (new)
`class MigrationSafetyChecker(projectRoot, options)`:
1. `detectMigrationFiles(projectRoot)` — glob the conventional migration locations
   (safeFs, root-relative, fail-soft): `migrations/`, `prisma/migrations/**`, `db/migrate/`
   (Rails), `alembic/versions/` and `migrations/versions/` (Alembic), `db/migrations/`,
   `supabase/migrations/`. Collect `.sql`, `.rb`, `.py` migration files. Cap the file count
   (e.g. 2000) and per-file bytes (reuse the registry's caps philosophy) to stay bounded.
2. `scanDestructive(content, file)` — match destructive DDL with ReDoS-SAFE anchored regexes
   (no catastrophic backtracking): `DROP\s+TABLE`, `DROP\s+COLUMN`, `ALTER\s+TABLE\b[^;]*\bDROP\b`,
   `TRUNCATE\b`, `DROP\s+DATABASE`, `DROP\s+SCHEMA`. Each hit is a finding {file, line, statement,
   severity: HIGH} — a destructive migration is a data-loss risk that MUST be reviewed. Use the
   shared `regex-utils.safeRegExp`; build the patterns as CONSTANTS (not from user input).
3. `run()` — scan all detected migration files, dedupe by (file,line), return
   `{ scanned, findings, summary }` mirroring sast-runner's shape. HONEST: if NO migration files
   are found, `scanned:false` with reason "no migrations detected" (not a clean pass on a repo
   that has none). Never claim a scan that did not happen.
4. Optional deeper mode (guarded, off by default): if `options.atlas` and `atlas` is available
   AND a dev-url is configured, additionally run `atlas migrate lint` (execFileSync argv-safe)
   and merge its findings. If Atlas is requested but unavailable, record an honest skip — do NOT
   silently drop it. This mode is NOT required for the check to be useful.
5. Export `MigrationSafetyChecker` + `SEVERITY` (reuse the shared severity). No dead exports —
   the live caller is quality-agent (below).

## Wiring (src/lib/quality-agent.js) — MANDATORY, wired-is-done
Add a migration-safety step to `runSecurityScan` AFTER the SCA step, mirroring its structure:
construct the checker, `run()`, print a loud honest skip when `scanned:false` ("migration
safety: no migrations detected" — informational, not a failure), and bump HIGH destructive
findings into the CRITICAL/HIGH gate tally (a destructive migration blocks like any HIGH). Keep
the belt-and-suspenders honesty. This is the live consumer.

## Security / safety
- Every regex is a CONSTANT built via `safeRegExp` — no user-derived pattern, no raw `new RegExp`.
- Any Atlas exec is `execFileSync` argv-safe (copy sast-runner's pattern); no string-concatenated
  shell. The static core executes NOTHING — it only reads + regex-scans files.

## TDD-Red FIRST
`tests/migration-safety-checker.test.js` (real temp-dir fixtures, zero mocks for the static
core; mock ONLY external `atlas` availability for the optional mode, like sast-runner-failclosed):
- a `migrations/001_init.sql` with `DROP TABLE users;` → one HIGH finding {file, line}.
- a `db/migrate/002.rb` with `drop_column :users, :email` → wait, Rails uses `remove_column`;
  scan the RAW text for `DROP`/`remove_column`? Keep it to SQL DDL (`DROP TABLE/COLUMN`,
  `TRUNCATE`, `ALTER…DROP`) for wave 2; Rails/AR method forms are a documented follow-up. So use
  a `.sql` fixture for the positive case and assert a Rails `.rb` with only additive ops → no finding.
- an additive-only migration (`CREATE TABLE`, `ADD COLUMN`) → zero findings.
- a repo with NO migrations → `scanned:false`, reason recorded (not a clean pass).
- quality-agent integration: a destructive migration bumps the HIGH tally (via the wiring).
Run RED first.

## Decisions Taken Under Ambiguity
- **SQL line-comment stripping.** Each line has a trailing `-- …` SQL comment removed
  before matching, so a commented-out `-- DROP TABLE` is not a false positive. Block
  comments and string literals are out of scope for this wave-2 heuristic (documented
  follow-up).
- **`.rb`/`.py` read but SQL-DDL-only matching.** Rails `db/migrate` and Alembic
  `versions` files are read (a raw embedded SQL DDL statement is still caught), but ORM
  METHOD forms (`remove_column`, `op.drop_column`) are NOT matched this wave — kept as
  the documented Rails/AR follow-up, per the plan.
- **Atlas deeper mode carries atlas's verbatim report, not a fabricated JSON schema.**
  Atlas's `migrate lint` JSON schema is not verifiable here (atlas not installed), so
  rather than invent a parser, the guarded run surfaces atlas's OWN output verbatim as
  a loud `errors` entry ("atlas ran and objected"). The tested, reachable behavior is
  the honest skip when atlas is requested-but-unavailable / no dev-url — never a silent
  drop. Static core is unaffected and executes nothing.
- **Bounds.** maxFiles=2000, per-file byte cap=2 MB, walk depth=12 — a pathological
  tree can neither exhaust memory nor hang.

## VERIFY (Step 14) — paste verbatim
`node --test tests/migration-safety-checker.test.js tests/quality-fleet-wiring.test.js
tests/security.test.js` all green; eslint clean; tsc 0; dead-export fence + enforcer 0 block
(MigrationSafetyChecker reachable from quality-agent); NO git. Step 16: report the destructive
patterns detected, the quality-agent wiring edge, and confirm a no-migrations repo yields an
honest scanned:false (never a silent clean pass).
