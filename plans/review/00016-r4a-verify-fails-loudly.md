---
iron_loop: true
approved_by: human
approved_at: 2026-07-14T20:00:00.000Z
gate_crossed: implementation → todo
approval_note: >
  Gate 2 crossed by the human's standing 2026-07-14 orders ("fix them all",
  "fix everything", "keep fixing the code"). CONFIRMED BY EXECUTION by the
  coordinator: runVerify on a toolchain-less project runs ZERO checks and
  returns {passed:true, summary:"All fallback quality checks passed."} — the
  artifact Gate 3 consumes. Gate 3 opens on a verification that verified
  nothing, and two tests pin the fail-open as the contract.
---

---
title: "R4-A — VERIFY fails loudly: no checks run is NOT a pass; Gate 3 evidence becomes real"
type: implementation
parent_plan: ctoc-background-engine-rebuild
depends_on: none
priority: CRITICAL
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/lib/step-13-verify.js"
  - "src/lib/quality-agent.js"
  - "src/lib/app-runner.js"
  - "src/lib/framework-detector.js"
  - "src/lib/dependency-auditor.js"
  - "src/commands/push.js"
  - "tests/lib-quality2-batch.test.js"
  - "tests/last-mile-wired.test.js"
  - "tests/quality-fleet-wiring.test.js"
  - "tests/verify-fails-loudly.test.js"
  - "tests/app-runner.test.js"
  - "tests/ship-gate-real.test.js"
  - "tests/dependency-auditor-severity.test.js"
  # Added under ambiguity (see Decisions): two VERIFY-domain test files outside the
  # original list pinned the SAME vacuous-pass this slice kills. They are not owned
  # by any other executor (not in the forbidden set) and had to be rewritten to the
  # loud-failure contract, or the suite stays red and the fix is un-shippable.
  - "tests/verify-evidence-wiring.test.js"
  - "tests/ctoc-audit-w05-verify-evidence.test.js"
---

# R4-A — A gate that opens on nothing is not a gate

CONFIRMED BY EXECUTION (coordinator, 2026-07-14):

```
runVerify(<project with no package.json>)
→ { passed: true, method: "fallback-direct", checks: { appRuns: {applicable:false} },
    errors: [], summary: "All fallback quality checks passed." }
```

Zero checks ran. `step-13-verify.js:239-244` `tryCommands` returns
`{success:true, output:'No applicable tool found - skipped'}` when EVERY command
is missing, and `:59` sets `passed = errors.length === 0`. That artifact is what
`validateReviewToDone` reads to open Gate 3. CLAUDE.md's own rule: **"If a test
cannot run, it must FAIL LOUDLY."** Two tests pin the violation as correct
(`lib-quality2-batch.test.js:391,402`), and the last-mile journey test proves
"Gate 3 is passable" on a fixture with no package.json — i.e. on the vacuous
pass itself.

CLAUDE.md declares Step 14 = lint, typecheck, ALL tests, **coverage ≥ 80%, 0
skipped, 0 flaky**. runVerify reads neither coverage nor skip count. Both are
missing entirely.

## Implementation Details

1. **No verifiable toolchain ⇒ FAIL (step-13-verify.js).** `tryCommands` must
   distinguish three outcomes: RAN+passed, RAN+failed, NOT-RUN. A NOT-RUN check
   is never `success:true`. `runVerify` computes `passed` as: at least one
   substantive check RAN, and every check that ran passed, and no required check
   was skipped. A project where nothing could run → `passed:false`, error
   `no-verifiable-toolchain` naming what was looked for. The summary NEVER says
   "All checks passed" when none ran — it says exactly what ran and what did not.
2. **Coverage and skipped-count enter VERIFY (the contract CLAUDE.md states).**
   When a test command runs, parse its output for skipped/todo counts and, where
   a coverage tool is available, the coverage percentage. `skipped > 0` → fail
   (CLAUDE.md: "0 skipped"). Coverage below the project's floor → fail. If
   coverage genuinely cannot be measured, that is a NOT-RUN check (item 1), not
   a pass. Read `.ctoc/coverage-baseline.json` for the floor; do NOT hardcode 80
   (CTOC's own floor is 40 today — the discrepancy between that and CLAUDE.md's
   claimed 80 is a SEPARATE finding; record it in the report, do not silently
   pick one).
3. **The app-run last mile actually runs (app-runner.js + step-13-verify.js).**
   `step-13-verify.js` calls `driveAppSync`, which NO test drives (the excellent
   real-subprocess tests exercise the async `driveApp`). Make the sync path
   test-covered with the same rigor (real boot, real HTTP, real teardown), and
   ensure an app-shaped project whose app does NOT respond FAILS verify. A
   project whose shape is genuinely undeterminable is `applicable:false` — which,
   per item 1, does NOT by itself make the verification a pass.
4. **The secrets gate is scoped to the PUSH delta, not the last commit.**
   `push.js:102` calls `runSecurityScan(tools)` with no opts → `quality-agent.js`
   scopes to `git diff HEAD~1` — the last commit only. A secret committed two
   commits back and not yet pushed is NEVER scanned, and every planted-secret
   test runs with `allFiles:true`, a mode production never uses. Fix the scoping
   to the real push delta (`@{upstream}..HEAD`, falling back to all tracked files
   when no upstream exists), and test the LIVE default path with a planted secret
   two commits back.
5. **The wiring test stops injecting what it verifies.**
   `quality-fleet-wiring.test.js:46` injects its own `runSecurityScan` and then
   asserts its own wrapper ran — the gate could be replaced by
   `async () => ({passed:true})` and this test would still pass. Rewrite: assert
   the DEFAULT binding identity (`push` internals' default deps ===
   `qualityAgent.runSecurityScan`) AND drive `push.run` with NO deps against a
   temp git repo with a planted secret → BLOCKED.
6. **Rewrite the two tests that pin the fail-open.**
   `lib-quality2-batch.test.js:391` ("all not-found falls through to skipped
   sentinel" asserting `success:true`) and `:402` ("no toolchain markers means no
   checks, no errors") assert behavior CLAUDE.md forbids. Rewrite them to the
   loud-failure contract. This is the sanctioned last-resort test change: they
   pin a defect.
7. **The journey test proves the real thing.**
   `last-mile-wired.test.js` fixture becomes a REAL project: package.json, a real
   test script, a real passing test → verify RUNS and passes → Gate 3 opens on
   REAL evidence. Add the complements: a project whose tests FAIL → evidence
   `passed:false` → Gate 3 refuses; a project with NO toolchain → `passed:false`
   (`no-verifiable-toolchain`) → Gate 3 refuses. The claim "a greenfield human
   crosses Gate 3 on real evidence" must be true of a project that actually has
   code, or it is not a claim worth making.

8. **VERIFY is broken in the OTHER direction too (C2 — a normal project FAILS).**
   `step-13-verify.js:234`: `tryCommands` only falls through to the next
   candidate when stderr contains the literal `not found`. npm says
   `npm error Missing script: "lint"` — no such substring — so a MISSING script
   is counted as a FAILING check. A normal Node project (tests, but no `lint`
   or `typecheck` script) therefore mints `passed:false` and Gate 3 refuses it →
   straight back to "Approve anyway". So: no manifest ⇒ vacuous pass; normal
   manifest ⇒ spurious fail. Fix: probe `pkg.scripts[name]` (and the equivalent
   for python/go/rust) BEFORE running; an ABSENT script is `applicable:false`
   (recorded, not an error); a PRESENT script exiting non-zero is a real
   failure. Item 1's rule still holds: if NOTHING substantive ran, that is not
   a pass.
9. **The app-run last mile can be satisfied by SOMEONE ELSE'S process (C6).**
   `app-runner.js:308` uses the framework's DEFAULT port (3000 for Next.js,
   5173 for Vite). If the human already has a dev server on 3000, the spawned
   child fails to bind and dies, but the poll checks `probe.ok` BEFORE the
   `exited` branch — so the probe hits the OTHER process, `responded:true`, and
   the Gate-3 artifact attests that an app CTOC never launched "responded".
   Fix: ALWAYS `getFreePort()` and pass it via PORT (the code already does when
   there is no framework default); never trust a default port. Check `exited`
   BEFORE trusting a probe. Also `DEFAULT_TIME_BUDGET_MS = 15000` is below a
   cold Next.js/Vite first compile — make the budget configurable and raise the
   default, so a CORRECT app does not fail the gate.
10. **Severity under-report residue (C8).** `mapCvssOrLabel` is safe for plain
    labels now, but three real inputs still under-report to MODERATE: a CVSS
    VECTOR string (`"CVSS:3.1/AV:N/..."` — which is exactly what the Go path
    reads at `dependency-auditor.js:617`, `osv.severity[0].score`), a mixed form
    (`"7.5 HIGH"`), and array/object score shapes. Every govulncheck CRITICAL is
    currently banded MODERATE in the push-blocking path. Fix: scan for a label
    token AND a numeric token and take the MAX; parse a CVSS vector's base score
    (or, failing that, band HIGH — never MODERATE).
11. **The ungated-push grep fence is shallow (C11).**
    `tests/ship-gate-real.test.js:349` matches only `execSync('git push'` and
    `runCommand('git push'` — it would MISS `spawn('git', ['push'])` /
    `execFile` / `runFile('git', ['push', ...])`, which is the argv-array idiom
    this codebase actually prefers (deployment.js already uses it). Widen the
    fence to any git spawn/exec whose argv contains `push`.

### Wiring — the live call sites (MANDATORY)
All changes are inside already-live paths (runVerify ← completeExecution ←
`menu task complete`; runSecurityScan ← /ctoc:push). No new exports without a
live caller; if you add one, name its call site here.

### Test Plan (TDD-Red first) — new tests/verify-fails-loudly.test.js
THE VACUITY TEST (the point of the slice): `runVerify` on a temp project with no
package.json, no tests, no linter → `passed:false`, error names
`no-verifiable-toolchain`, summary does NOT claim checks passed. Real project
with real passing tests → `passed:true` with the checks named. Real project with
a FAILING test → `passed:false`. Project with 1 skipped test → `passed:false`
("0 skipped" is the contract). Coverage below floor → `passed:false`. App-shaped
project whose app does not boot → `passed:false` (drive the sync path).
Secrets: planted secret two commits back, `push.run` with real defaults →
BLOCKED (this fails today).

## Execution Plan (Steps 8-16)
### Step 8: TEST — write the tests, run ONLY the named files, record the red.
### Step 9: PREPARE — read step-13-verify.js, quality-agent.js, app-runner.js,
push.js, plan-validator.js validateReviewToDone (READ-ONLY: it consumes your
artifact) IN FULL from disk.
### Step 10: IMPLEMENT — items 1–7.
### Step 11: REVIEW — enumerate every path by which `passed:true` can be
returned; each must name at least one check that actually RAN.
### Step 12: OPTIMIZE — verify stays a single pass; no redundant tool probes.
### Step 13: SECURE — the secrets scoping fix is a security surface: prove the
new scope catches a secret the old one missed, with a real git repo.
### Step 14: VERIFY — node --test on the named files + eslint; no git.
### Step 15: DOCUMENT — step-13-verify's header states the fail-closed contract
plainly: a check that did not run is not a check that passed.
### Step 16: FINAL-REVIEW — report. State plainly whether Gate 3 evidence is now
real, and name the test that proves it on a project WITH code.

## Decisions Taken Under Ambiguity

1. **Coverage floor = the baseline file, and the 40-vs-80 discrepancy is REAL.**
   `.ctoc/coverage-baseline.json` declares `minPct: 40` (a ratchet established
   2026-07-13, measured 40.85%). CLAUDE.md's Step 14 text claims "coverage ≥ 80%".
   These disagree. As instructed I implemented against the BASELINE FILE
   (`readCoverageFloor` reads `minPct`), did NOT hardcode 80, and did NOT silently
   pick one. FINDING for the human: the 40% ratchet is the *suite-wide* floor for a
   codebase that predates coverage instrumentation; the 80% is the *new-code at
   review* standard. They are two different gates, but the text does not say so and
   reads as a contradiction. RECOMMENDATION: state both explicitly in CLAUDE.md, or
   reconcile. When NO baseline file exists (a greenfield project), coverage is not
   gated at all (I do not invent a floor) — coverage only gates when both a floor is
   declared AND a percentage was actually parsed from real test output.

2. **Two VERIFY test files OUTSIDE the `files:` list had to be rewritten.**
   `tests/verify-evidence-wiring.test.js` (line 88: "clean project passes VERIFY
   via the no-toolchain fallback") and `tests/ctoc-audit-w05-verify-evidence.test.js`
   (line 63: "empty project should pass via fallback") asserted the EXACT vacuous
   pass this slice exists to kill. They are not owned by any other executor (not in
   the forbidden set; they are VERIFY-domain, mine). Leaving them makes the suite
   red and the fix un-shippable; weakening my fix to keep them green would preserve
   the defect. Per CLAUDE.md lesson 14 and this plan's own item 6 (rewriting
   defect-pinning tests is the sanctioned last-resort), I converted their EMPTY
   fixtures to REAL projects with a passing test script — preserving each test's
   actual intent ("a clean project passes and the machinery writes evidence") while
   removing its reliance on a pass-on-nothing. I added both to `files:` above.

3. **A launched-but-unresponsive app counts as a substantive check that RAN.**
   For counting "did any real check run?", an app that was LAUNCHED counts even if
   it did not respond (whether it responded is the pass/fail, recorded as an error).
   This keeps an app-shaped project that boots-and-crashes from ALSO emitting the
   `no-verifiable-toolchain` error — it ran something; it just failed. Rationale:
   the vacuity error is for "nothing ran", not "something ran and failed".

4. **CVSS vectors: compute the real base score; band HIGH only when un-computable.**
   `mapCvssOrLabel` now parses a CVSS v3.0/3.1 vector string and computes its base
   score by the standard formula (verified against the canonical 9.8 network-RCE
   vector → CRITICAL and a 7.5 confidentiality-only vector → HIGH). A vector missing
   a required metric bands HIGH (never MODERATE, never LOW) — the sanctioned
   fallback. Mixed strings ("7.5 HIGH") take the MAX of the numeric and label
   tokens; arrays/objects take the MAX across entries.

5. **App time budget raised to 60s (was 15s), overridable.** A cold Next.js/Vite
   first compile exceeds 15s, so a CORRECT app could fail the gate on latency alone.
   Default is now 60s, overridable per call (`opts.timeBudgetMs`) and per
   environment (`CTOC_APP_TIME_BUDGET_MS`). A genuinely dead app still fails fast
   because the poll breaks on child `exit` rather than waiting out the budget.

6. **`push.run` now takes `opts.projectRoot`.** The live security scan defaulted to
   `process.cwd()`, so it scanned whatever directory happened to be current rather
   than the repo being pushed. `main()` passes `process.cwd()`; the seam lets the
   real default scanner be driven against a specific repo (the two-commits-back
   secret test). No new export; the live call site is `main()` → `run()`.

## Execution Log (Steps 8–16)
- **Step 8 TEST (TDD-Red):** wrote `tests/verify-fails-loudly.test.js` (V1 vacuity,
  V2/V3 real test run, V4 C2 normal-project, V5 skipped, V6 coverage floor, V7
  app-run sync); added driveAppSync + free-port tests to `app-runner.test.js`;
  CVSS-vector/mixed/shape tests to `dependency-auditor-severity.test.js`; the
  `hasUngatedPush` widened fence to `ship-gate-real.test.js`; rewrote the injected
  wiring test + two-commits-back BLOCKED tests in `quality-fleet-wiring.test.js`;
  rewrote the three fail-open-pinning assertions in `lib-quality2-batch.test.js`;
  made `last-mile-wired.test.js` a real project + added J7 vacuity complement.
  Confirmed RED: V1/V2/V4/V5/V6/V7 + all CVSS cases failed against the old code.
- **Step 9 PREPARE:** read step-13-verify.js, app-runner.js, quality-agent.js,
  push.js, dependency-auditor.js, framework-detector.js, and (read-only)
  plan-validator.js `validateReviewToDone` in full from disk.
- **Step 10 IMPLEMENT:** items 1–11. Fail-closed VERIFY (three-state checks,
  substantive-count gate, no-verifiable-toolchain), coverage + skipped contracts,
  C2 absent-script fix, always-free-port + exit-before-probe + 60s budget, push
  delta secrets scoping (`@{upstream}..HEAD`), `push.run` projectRoot, CVSS
  vector/mixed/shape severity, widened ungated-push fence.
- **Step 11 REVIEW:** enumerated every `passed:true` path (see report). Each now
  names at least one check that actually RAN.
- **Step 12 OPTIMIZE:** VERIFY stays a single pass; tool probes run only when the
  matching manifest is present; npm scripts are read once from the parsed package.
- **Step 13 SECURE:** the secrets-scoping fix is proven with a real git repo — a
  secret two commits back (invisible to the old `HEAD~1` scope) now BLOCKS the
  push through the LIVE default path.
- **Step 14 VERIFY:** `node --test` green on all named + affected files (VERIFY
  core 42, journey 8, quality-fleet 23-incl, severity 9, ship-gate, app-runner,
  last-mile-integration, verify-evidence-wiring, w05-verify-evidence, plan-validator,
  framework-detector, subplan, w10-push, security, reachability). ESLint clean on
  all five changed source files. NOTE: 6 unrelated failures in the shared tree
  (dead-export fence, menu.md recipe, deploy handover) belong to OTHER executors'
  in-flight files (actions.js, compliance-regime.js, stale-detector.js, menu.md,
  reachability.js, sync.js, vision-decomposer.js) — none of my five files appear.
- **Step 15 DOCUMENT:** step-13-verify.js header now states the fail-closed
  contract plainly ("a check that did not run is not a check that passed").
- **Step 16 FINAL-REVIEW:** report delivered.
