---
title: "Wave 3 fix — SCA CVSS-vector severity, DependencyAuditor overlap, npm error envelope"
type: implementation
parent_plan: ctoc-registry-expansion
depends_on: 00041-exp-w4-projecttype-globs
priority: HIGH
program: ctoc-registry-expansion
iron_loop: true
files:
  - "src/lib/cvss.js"
  - "src/lib/sca-runner.js"
  - "src/lib/dependency-auditor.js"
  - "src/lib/quality-agent.js"
  - "src/lib/capability-registry.js"
  - "tests/sca-runner.test.js"
  - "tests/cvss.test.js"
  - "CLAUDE.md"
  - "README.md"
  - "tests/readme-numbers.test.js"
---

# Wave 3 fix — 3 confirmed SCA defects (adversarial review), most-severe first

The critic found a HIGH gate defect + 2 MEDIUM honesty defects in the wave-3 SCA runner.
All confirmed against disk. Wave 4 (globs) is sound — leave it, only tighten one JSDoc line.

## F1 (HIGH) — CVSS VECTOR severities silently downgraded to non-blocking MEDIUM
`sca-runner.js` `mapOSVSeverity` and `mapCvssSeverity` only accept a NUMERIC score, but OSV
(`severity[].score`) and RustSec (`advisory.cvss`) emit a CVSS **vector string** (e.g.
`CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H` = 9.8 CRITICAL). `parseFloat('CVSS:3.1/…')`
→ NaN → returns MEDIUM. The gate blocks only on CRITICAL/HIGH (`quality-agent.js:430-434`),
so a CRITICAL dependency CVE ships GREEN on the osv-scanner-universal path (go/php/ruby/
java/dart/kotlin/… — the exact languages SCA exists to cover) and the cargo path.

The CORRECT scorer already exists: `dependency-auditor.js:828 _cvssVectorBaseScore` +
`:745 mapCvssOrLabel` (a full CVSS-v3 vector base-score implementation). Do NOT reimplement.

FIX (single source of truth):
1. Extract the CVSS logic to a NEW pure module `src/lib/cvss.js`: `cvssVectorBaseScore(vector)`
   (port `_cvssVectorBaseScore` verbatim) and `severityFromCvss(scoreOrVectorOrLabel, SEVERITY)`
   (port `mapCvssOrLabel`'s numeric/vector/label handling). Zero deps, pure functions.
2. `dependency-auditor.js`: replace its private `_cvssVectorBaseScore`/`mapCvssOrLabel` bodies
   with delegations to `src/lib/cvss.js` — BEHAVIOR-PRESERVING (its existing tests must stay
   green; verify).
3. `sca-runner.js`: `mapOSVSeverity`/`mapCvssSeverity` route the score/vector through
   `require('./cvss').severityFromCvss(...)` instead of `parseFloat`. A CVSS-vector CRITICAL
   now maps to CRITICAL and BLOCKS.

## F2 (MEDIUM) — DependencyAuditor + SCA double-count the same CVE into the human-facing tally
`quality-agent.js` runs BOTH DependencyAuditor (step 2) and SCA (step 4). For js/python/rust/
go both pick the SAME native tool (npm/pip/cargo audit) — the same CVE is counted twice, the
human sees "6 critical" when there are 3 (a "measure is the human / honesty" violation), and
the tool runs twice.
FIX (partition — no overlap, no double-run): read DependencyAuditor's covered ecosystems/
languages (its ECOSYSTEM/config map — js/ts, python, rust, go, pnpm; read the ACTUAL set, do
not hardcode). In the quality-agent SCA step, run SCA ONLY for detected languages whose
ecosystem DependencyAuditor does NOT cover — i.e. SCA becomes the osv-universal extender for
the ~15 long-tail ecosystems (dart, kotlin, scala, elixir, c, cpp, lua, r, swift, php, ruby,
java, csharp, sql, …). DependencyAuditor keeps js/python/rust/go. Print an honest note that
SCA defers those to DependencyAuditor. SCARunner keeps its native parsers (still usable), but
the LIVE path no longer overlaps. Document the partition under Decisions.

## F3 (MEDIUM) — npm audit error envelope reads as a clean scan
`sca-runner.js` `parseNpmAuditResults`: a JS project with NO lockfile → `npm audit --json`
exits 1 printing `{"error":{"code":"EAUDITNOLOCK",…}}`; the parser sees no `vulnerabilities`
key → returns clean, no error → `scanned:true, findings:[]` (reads clean though nothing was
audited), violating the module's own honesty contract.
FIX: `parseNpmAuditResults` detects the `{ error: … }` envelope and pushes a loud skip /
records scanned:false-for-that-language with the npm error summary. (After the F2 partition
this only matters if npm ends up on SCA's path, but fix it regardless — honesty contract.)

## F4 (LOW) — pip-audit findings hard-pinned to MEDIUM → Python dep CVEs never block
`sca-runner.js:476` defaults every pip-audit finding to MEDIUM (pip-audit --format json omits
severity). Net effect: a Python dependency RCE is non-blocking. FIX (fail-secure): default an
unrated pip-audit finding to **HIGH** (a real, known advisory the human must review) with a
comment — never fabricate a precise score, but do not let a real advisory ship green. (After
F2, pip/python is DependencyAuditor's anyway, but keep SCA honest for the standalone case.)

## F5 (LOW) — npm v6 format + wave-4 JSDoc overstatement
- `parseNpmAuditResults` handles only npm v7+ (`vulnerabilities`); add the npm-6 `advisories`
  shape (mirror `dependency-auditor.js:512-552`) so an npm-6 report is not silently empty.
- `capability-registry.js` projectTypeFor glob JSDoc overstates "never a ReDoS" — safeRegExp
  centralizes construction but caps no backtracking. Soften the comment to "escaped +
  centralized (safeRegExp); the only shipped globs are single-`*`, linear-time" — no code change.

## TDD-Red FIRST
- `tests/cvss.test.js` (NEW): `cvssVectorBaseScore('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H')`
  ≈ 9.8; `severityFromCvss` of that vector → CRITICAL; a numeric 9.8 → CRITICAL; a label 'HIGH'
  → HIGH. Port dependency-auditor's own CVSS test vectors if present.
- `tests/sca-runner.test.js`: an OSV fixture whose vulnerability carries ONLY a CVSS_V3 vector
  (score 9.8, no database_specific label) → the finding is CRITICAL (RED before F1); a cargo
  fixture with a vector `advisory.cvss` → CRITICAL; an npm `{error:EAUDITNOLOCK}` envelope →
  scanned:false / loud skip (not clean); a pip-audit finding with no severity → HIGH.
Run RED first.

## VERIFY (Step 14) — paste verbatim
`node --test tests/cvss.test.js tests/sca-runner.test.js tests/security.test.js
tests/quality-fleet-wiring.test.js tests/sast-runner-failclosed.test.js` (+ any
dependency-auditor test file) all green — dependency-auditor behavior PRESERVED after the
extraction; eslint clean on all touched files; `tsc --noEmit` 0; dead-export fence +
iron-loop-enforcer 0 block (cvss.js exports have live callers in both runners); NO git.
Step 16: show a CVSS-vector CRITICAL now blocking, confirm the DependencyAuditor/SCA
partition (no shared language), and confirm dependency-auditor tests stayed green.

## Decisions Taken Under Ambiguity

- **F1 single-source extraction removes now-dead private helpers.** The plan said to
  "replace the bodies with delegations". Delegating `mapCvssOrLabel` to
  `cvss.severityFromCvss` leaves `_labelToSeverity`/`_severityRank`/`_maxSeverity`/
  `bandCvss` on DependencyAuditor with zero callers. Keeping dead duplicates would
  defeat the single-source goal and rot, so they were DELETED. `_cvssVectorBaseScore`
  is retained as a one-line delegation to `cvss.cvssVectorBaseScore` — it is the live
  in-module caller that keeps that export reachable (and its documented surface). The
  same superseded `mapCvssScore` was removed from SCARunner. `cvss.js` exports exactly
  the two functions the plan named (`cvssVectorBaseScore`, `severityFromCvss`);
  `bandCvss` is module-internal (not exported) to avoid a dead export.
- **F1 severity vocabularies unified via a mid-band resolver.** DependencyAuditor's
  mid band is `MODERATE`; SCARunner's is `MEDIUM`. `severityFromCvss(value, SEVERITY)`
  takes the caller's vocabulary and resolves the mid band as `SEVERITY.MODERATE ??
  SEVERITY.MEDIUM`, so one implementation is behavior-preserving for both. Side effect
  (intended, more honest): SCARunner's `mapCvssScore(0)` used to return `INFO`; it now
  returns the mid band for a 0/unknown score — over-report, never under-report.
- **F2 partition excludes EVERY DependencyAuditor-covered language, not just
  js/python/rust/go.** The task said "read DependencyAuditor's ACTUAL covered set (do
  not hardcode)". Its real coverage (from `PACKAGE_MANAGERS`) is js/ts, python, go,
  rust, java, ruby, php — so the osv-universal pass would ALSO double-count java
  (maven/gradle), ruby (bundler) and php (composer), not only the four native tools.
  The honest "no overlap, no double-run" reading excludes ALL seven. The exclusion set
  is the new exported `DependencyAuditor.COVERED_LANGUAGES` (derived from
  `MANAGER_LANGUAGES`), consumed by quality-agent and passed into
  `new SCARunner(root, { excludeLanguages })` — never hardcoded in quality-agent.
- **F4 honors an explicit pip-audit severity if present, else fails secure to HIGH.**
  The task said "default an unrated finding to HIGH". pip-audit's JSON usually omits
  severity → HIGH (never a non-blocking MEDIUM). When a severity IS present it is
  honored verbatim via the shared scorer — strictly more honest, never fabricated.
- **Doc-count reconciliation is in scope.** Adding `src/lib/cvss.js` (90→91 modules)
  and `tests/cvss.test.js` (281→282 test files) trips the ground-truth count guards
  (`tests/doc-counts.test.js`, `tests/readme-numbers.test.js`) that fence CLAUDE.md /
  README numbers against disk. Those guards exist precisely to force a doc update when
  a counted artifact is added; leaving them red would ship the fix dishonestly. The
  affected files (`CLAUDE.md`, `README.md`, `tests/readme-numbers.test.js`) were added
  to this plan's `files:` and the counts updated to the true disk values (91 / 282).
  This is an exact-count reconciliation, not a loosened assertion.
