---
title: "Frameworks dimension wave 2 — client-exposed-secret security check wired to the pipeline"
type: implementation
parent_plan: ctoc-registry-expansion
depends_on: 00047-exp-fw-w1-framework-dimension
priority: HIGH
program: ctoc-registry-expansion
iron_loop: true
files:
  - "src/lib/framework-security-checker.js"
  - "src/lib/quality-agent.js"
  - "tests/framework-security-checker.test.js"
---

# FW-w2 — client-exposed-secret check (the framework-security-check pattern)

FW-w1 records each framework's security.concerns; FW-w2 turns the highest-value concern —
`env-exposure` — into a real gate check, proving the "concerns → checks" pattern (as DB-w2
proved migration-safety). Scoped TIGHT to stay low-false-positive (the migration-heuristic
lesson): NAME-based, not value-entropy.

## The check — client-exposed secrets
A frontend framework's public env-var prefix ships the value to the BROWSER. A public-prefixed
var whose NAME signals a secret is a deliberate secret leak — a real, common, HIGH-severity
class the generic secrets-scanner (value-entropy on hardcoded strings) does NOT flag.

## src/lib/framework-security-checker.js (new) — model on migration-safety-checker
`class FrameworkSecurityChecker(projectRoot, options)`:
1. `run()` gates on RELEVANCE: only checks when a detected framework carries the `env-exposure`
   concern (read via `require('./stack-detector').detectStack(projectRoot).frameworkCapabilities`
   filtered to those whose `security.concerns` includes `env-exposure`). If none, `scanned:false`
   reason "no env-exposure framework detected" (honest — not a clean pass on an unrelated repo).
2. PUBLIC_PREFIXES (CONSTANT): `NEXT_PUBLIC_`, `VITE_`, `REACT_APP_`, `PUBLIC_` (SvelteKit),
   `NUXT_PUBLIC_`, `GATSBY_`, `EXPO_PUBLIC_`. SECRET_INDICATORS (CONSTANT, word-ish):
   `SECRET`, `TOKEN`, `PRIVATE`, `PASSWORD`, `PASSWD`, `CREDENTIAL`, `_KEY` / `APIKEY` /
   `API_KEY` (be careful: a bare `KEY` is too broad — `NEXT_PUBLIC_PUBLISHABLE_KEY` is
   legitimate; require the secret-ish forms `SECRET_KEY`/`PRIVATE_KEY`/`API_KEY`/`APIKEY`,
   NOT a lone `KEY`, to avoid flagging Stripe/Clerk PUBLISHABLE keys which are meant to be public).
3. `scanEnvAndSource(projectRoot)` — scan `.env`, `.env.*` (NOT `.env.example` values, but DO
   read the var NAMES there), and source files (bounded, safeFs, fail-soft) for a token matching
   `<PUBLIC_PREFIX>[A-Z0-9_]*<SECRET_INDICATOR>`. Each match → HIGH finding {file, line, varName}.
   Match on the NAME only (constant regex via safeRegExp, ReDoS-safe) — do NOT inspect the value
   (name alone is the signal, and reading secret VALUES would itself be a leak).
4. `run()` → `{scanned, findings, summary}` mirroring the other checkers. Export
   `FrameworkSecurityChecker` + `SEVERITY`. No dead exports.

## Wiring (src/lib/quality-agent.js) — wired-is-done
Add a framework-security step to `runSecurityScan` after the migration-safety step, mirroring
its structure: run(), honest skip when `scanned:false`, bump HIGH findings into the critical/
high gate tally (a client-exposed secret blocks like any HIGH). The live caller.

## Security / safety
- Every regex is a CONSTANT via safeRegExp (no user-derived pattern, no raw new RegExp).
- The checker reads + regex-scans only — executes nothing. It reads env-var NAMES, never logs a
  secret VALUE.

## TDD-Red FIRST
`tests/framework-security-checker.test.js` (real temp-dir fixtures, zero mocks):
- a Next.js project (package.json `next`) with `.env` containing `NEXT_PUBLIC_API_SECRET=xxx` →
  1 HIGH finding {file, varName: NEXT_PUBLIC_API_SECRET}.
- a Vite project with `VITE_STRIPE_SECRET_KEY=...` → HIGH.
- LOW-FALSE-POSITIVE guards: `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` → 0 (publishable keys are meant
  to be public — a bare KEY is not flagged); `DATABASE_URL=...` (no public prefix) → 0 (that's
  server-only, generic secrets-scanner's job); a backend-only project (no env-exposure framework)
  → scanned:false, honest reason.
- quality-agent integration: a NEXT_PUBLIC_*_SECRET bumps the HIGH tally.
Run RED first.

## VERIFY (Step 14) — paste verbatim
`node --test tests/framework-security-checker.test.js tests/quality-fleet-wiring.test.js
tests/security.test.js` all green; a hand-run: NEXT_PUBLIC_API_SECRET → HIGH,
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY → 0, backend-only → scanned:false; eslint clean; tsc 0;
fence + enforcer 0 block (FrameworkSecurityChecker reachable from quality-agent). Flag the
doc-count delta (new test file + lib module), do not edit CLAUDE.md out of scope. NO git.
Step 16: report the check, the wiring edge, and confirm the publishable-key false-positive guard.
