---
title: "Databases dimension wave 1 — top-10 database capability data + dep detection, wired to the stack"
type: implementation
parent_plan: ctoc-registry-expansion
depends_on: 00043-exp-w5-yaml-gha
priority: HIGH
program: ctoc-registry-expansion
iron_loop: true
files:
  - "src/lib/capability-registry.js"
  - "src/lib/stack-detector.js"
  - "src/hooks/SessionStart.js"
  - ".ctoc/capabilities/databases/postgresql.yaml"
  - ".ctoc/capabilities/databases/mysql.yaml"
  - ".ctoc/capabilities/databases/mongodb.yaml"
  - ".ctoc/capabilities/databases/redis.yaml"
  - ".ctoc/capabilities/databases/sqlite.yaml"
  - ".ctoc/capabilities/databases/sqlserver.yaml"
  - ".ctoc/capabilities/databases/oracle.yaml"
  - ".ctoc/capabilities/databases/clickhouse.yaml"
  - ".ctoc/capabilities/databases/duckdb.yaml"
  - ".ctoc/capabilities/databases/pgvector.yaml"
  - ".ctoc/capabilities/schema.md"
  - "tests/capability-databases.test.js"
---

# Databases dimension — wave 1 (full-pipeline-integration path, per the human)

The human chose FULL pipeline integration. Databases are a two-wave sub-program: THIS wave
adds the databases capability dimension + dep-based detection + a LIVE consumer (the stack
summary shows the detected database and its security posture). DB-w2 adds the real check
(migration-safety lint + connection/RLS validation). Databases live in DEPENDENCIES (pg,
mongoose, redis), not marker files — so detection is dep-parsing in stack-detector (mirror
FRAMEWORK_PATTERNS), and the registry holds the capability data. Wired-is-done: the registry
data flows through stack-detector → detectStack → SessionStart in THIS wave (not dead).

## The 10 database capability YAMLs (.ctoc/capabilities/databases/*.yaml, web-grounded 2026)
Schema (add to schema.md as the databases contract):
```yaml
database: postgresql
category: relational        # relational | document | keyvalue | analytics | vector
deps: [pg, postgres, psycopg2, asyncpg]   # stack-detector matches these (JS + Python names)
security:
  injection: parameterized-queries        # the concern (real SAST covers query code)
  rls: supported                          # supported | not-applicable
  connection: tls-required                # TLS 1.2+/1.3 (2026 best practice)
  leastPrivilege: separate-app-migration-analytics-identities
migration:
  tools: [prisma, atlas, flyway, liquibase, sqitch, alembic, drizzle]   # any of these
  safetyLint: "atlas migrate lint"        # the 2026 destructive-op detector (DB-w2 runs it)
configScaffold: [migrations/, .env.example]
verified: web-2026-07
```
The 10 (DB-Engines 2026 + AI): postgresql (rls supported), mysql (rls via views, mark
UNVERIFIED), mongodb (document, rls not-applicable), redis (keyvalue, rls n/a), sqlite
(relational, rls n/a — file-based), sqlserver (relational, rls supported), oracle
(relational, rls supported/VPD), clickhouse (analytics, rls supported), duckdb (analytics,
rls n/a — embedded), pgvector (vector, inherits postgres — rls supported). Every
security/rls/migration value web-grounded or flagged UNVERIFIED honestly (mysql RLS is not
native — flag it).

## Engine (src/lib/capability-registry.js)
Add `loadDatabases(projectRoot)` (mirrors loadProjectTypes: bundled + optional override,
fail-open per-entry, zero-warning) and `databaseCapability(name, projectRoot)`. Export both;
they MUST have a live caller (stack-detector below) — no dead exports.

## Detection + wiring (src/lib/stack-detector.js)
Add `detectDatabases(projectPath)`: read the project deps (reuse readPackageDeps +
readPythonDeps) and match each database's `deps` list from `capabilityRegistry.loadDatabases`.
Return each detected database ENRICHED with its capability (category + security). Add
`databases` to `detectStack`'s return object (alongside languages/frameworks). Keep the
existing detectStack shape ADDITIVE — do not remove languages/frameworks/primary.

## Live consumer (src/hooks/SessionStart.js)
SessionStart renders the detected stack. Add a one-line render of detected databases + their
security posture (e.g. "Databases: PostgreSQL (RLS supported, TLS required)"). This is the
live human-facing consumer that makes the registry data wired-is-done. Keep hooks.test.js
green — additive render only, do not change the existing output shape/contract.

## TDD-Red FIRST
`tests/capability-databases.test.js` (real temp-dir fixtures, zero mocks): all 10 load with
zero warnings + carry category/security/migration; loadDatabases + databaseCapability work;
a package.json with `pg` → detectDatabases returns postgresql enriched (rls supported, tls);
a requirements.txt with `psycopg2` → postgresql; `mongoose` → mongodb (rls not-applicable);
detectStack includes databases additively (languages/frameworks unchanged); every verified is
web-2026-07 or UNVERIFIED. Run RED first.

## Decisions Taken Under Ambiguity (executor, DB-w1)
1. **MySQL RLS.** MySQL has NO native row-level security (only DEFINER-view or
   app-layer emulation). Encoded honestly as `security.rls: not-native` and the whole
   `mysql.yaml` entry is `verified: UNVERIFIED` — the RLS posture is not a native 2026
   guarantee. It is asserted in tests to never be `supported`.
2. **safetyLint = none** for oracle, clickhouse, mongodb, redis, duckdb — there is no
   established 2026 destructive-migration linter for these (Atlas `migrate lint` robustly
   covers postgres/mysql/sqlite/sqlserver/pgvector only). DB-w2 selects the linter for the
   rest; a fabricated command would violate the provenance rule, so `none` is the honest value.
3. **pgvector deps = [pgvector] only** (not `pg`). A pgvector project that also declares
   `pg` will additionally detect `postgresql` — correct, it IS Postgres + a vector extension.
4. **Doc-count tripwire (out of plan-file scope).** Adding `tests/capability-databases.test.js`
   moves the live test-file count 282 → 283, so `tests/doc-counts.test.js` reports the two
   CLAUDE.md count claims ("Run all 282 test files" / "tests/ 282 test files") as stale.
   That test's own docstring states it "does NOT edit CLAUDE.md" and the reconciliation is
   owned by the release/metadata-truth workstream; CLAUDE.md is not in this plan's `files:`
   list and is not whitelisted by the enforcement hook. FLAGGED, not silently edited — the
   one-line 282 → 283 correction is a release-step follow-up.

## VERIFY (Step 14) — paste verbatim
`node --test tests/capability-databases.test.js tests/stack-detector.test.js tests/hooks.test.js
tests/capability-registry.test.js` all green (stack-detector + SessionStart consumers unbroken);
a hand-run: 10 databases load zero-warning; a `pg`-dep project detects postgresql with its
security posture; detectStack.databases is populated and languages/frameworks unchanged;
eslint clean; tsc 0; dead-export fence + enforcer 0 block (loadDatabases/databaseCapability
reachable from stack-detector); NO git. Step 16: report the 10 databases, the detection→
stack→SessionStart wiring edge, and any UNVERIFIED security value (e.g. mysql RLS).
