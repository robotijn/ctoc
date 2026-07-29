---
iron_loop_verdict: true
iron_loop: true
title: "A quadratic regex in the dead-export fence makes CTOC's own test suite take 14 minutes and is a live ReDoS"
type: implementation
parent_plan: none
depends_on: none
priority: critical
program: ctoc-repair-loop
files:
  - "src/lib/reachability.js"
  - "tests/reachability-surface-scan-is-linear.test.js"
approved_by: human
approved_at: 2026-07-29T12:46:04.316Z
gate_crossed: implementation → todo
---

# A quadratic regex in the dead-export fence makes the suite 14 minutes and is a live ReDoS

## The defect, MEASURED (not inferred)

CTOC's full `npm test` takes **864 seconds (14.4 min)**. Measured breakdown:
`npm run lint` 3s, `npm run typecheck` 1s, `npm test` 864s. Within the suite, ONE
test dominates: `tests/claim-census.test.js` → `describe('the claim-census enforcer
check — the live call site')` → `it('BLOCKS when the walk was PARTIAL …')` takes
**851,923 ms (14.2 min)**; the next-slowest test in the entire suite is ~10s. Because
`node --test` runs files in parallel, that single test IS the wall-clock.

That test seeds a fixture `skills/oversized.md` = `'a'.repeat((1<<20)+32)` (1 MiB+ of
one character) and calls `checkAllInvariants({ root, mode:'thorough',
scopes:['architecture'] })`. A per-scanner probe on a 400 KB single-char file
(scaled down) measured:

```
censusCorpus                   1ms
reachability.analyze           1ms
reachability.analyzeExports    137617ms   <-- the culprit
false-green-scan               0ms
human-facing-scan              66ms
```

`analyzeExports` (the dead-export fence, `src/lib/reachability.js`) scans every
surface `.md` file for `identifier(` call sites with:

```js
const SURFACE_CALL_RE = /([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g;   // line ~646
```

On a long run of identifier characters with no `(`, the greedy **unbounded**
`[A-Za-z0-9_$]*` consumes the whole run, `\s*\(` fails, and with the `/g` lastIndex
advancing one position at a time the engine retries from every start position →
**O(n²)**. At n = 1 MiB that is ~10¹² steps ≈ 14 minutes.

This is BOTH a test-speed problem AND a live **ReDoS**: `collectSurfaceFiles`
deliberately does NOT skip oversized surfaces (its comment: "an unreadable surface is
a broken instrument, never 'this surface calls nothing'. Silently skipping it would
under-credit"), so a genuinely large shipped guide/skill file with a long token run
hangs the enforcer in production TODAY.

## The fix — BOUND the quantifier, do NOT skip the file

Skipping oversized surfaces contradicts the fence's own no-false-dead principle, so
the fix is to make the scan **linear**, matching the ReDoS-hardening the sibling
regexes in this same file already use (`SURFACE_NODE_RUNS_RE` bounds with `{0,80}`,
`SURFACE_REQUIRES_RE` with `{0,64}`). Bound the identifier length to a sane maximum
(a real JS identifier is never hundreds of chars):

```js
const SURFACE_CALL_RE = /([A-Za-z_$][A-Za-z0-9_$]{0,127})\s*\(/g;
```

With the identifier bounded to ≤128 chars, each failed start position backtracks at
most 128 times → O(128·n) = **linear**.

**Audit EVERY sibling regex** in `src/lib/reachability.js` that runs over surface or
source TEXT for the same unbounded-quantifier ReDoS shape, and bound each the same
way with the SAME reasoning. Candidates to check (bound only where a ReDoS is real —
do not bound a quantifier that cannot backtrack quadratically): `SURFACE_CALL_RE`,
`SURFACE_REQUIRE_DOT_RE`, `SURFACE_REQUIRE_IDX_RE`, `IDENT_RE`, `SURFACE_REQUIRES_RE`,
and any `[^…]*` / `[…]*` used inside a `while (re.exec(text))` loop. The `\s*` before
`\(` is also a `*`; confirm whitespace runs cannot re-introduce quadratic behavior
(bound or restructure if they can).

**Semantics MUST be preserved.** A 128-char identifier bound must not change which
real call sites are credited (no real identifier exceeds it), proven by a test that
the export/reachability baselines are UNCHANGED after the fix (`analyzeExports` over
the real repo returns the same name set / the fences stay green with no baseline
movement).

## Execution Plan

### Step 8: TEST
- [x] TEST — TDD tests present; workflow Step-11 REVIEW (2026-07-29) confirmed real/adversarial, not vacuous.
Write `tests/reachability-surface-scan-is-linear.test.js` FIRST and run it RED:
- A test that builds a temp corpus with a `skills/huge.md` of, say, 2 MiB of `'a'`
  and asserts `analyzeExports(root)` (and `analyze(root)`) COMPLETES within a strict
  wall-clock bound (e.g. < 2000 ms). Before the fix this fails by TIMING OUT / running
  minutes; capture the RED as "did not complete in bound". Use a `node --test` per-test
  timeout so the red is a bounded failure, not a 14-min hang.
- A linearity/scaling assertion: the time for 2× input is not super-linear (e.g. run
  at size S and 2S, assert t(2S) < k·t(S) for a small k), so a future unbounded regex
  regression is caught.
- A SEMANTICS-PRESERVED test: on a fixture containing real `identifier(` call sites
  (including one exactly at/around the bound length and one just over it), the credited
  name set is exactly the real identifiers — the bound never drops a legitimate call
  and the over-length pathological token is not miscredited.

### Step 9: PREPARE
- [x] PREPARE — plan ancestry + code confirmed against the real implementation.
Read `src/lib/reachability.js` in full: `SURFACE_CALL_RE`, `SURFACE_REQUIRE_DOT_RE`,
`SURFACE_REQUIRE_IDX_RE`, `IDENT_RE`, `SURFACE_REQUIRES_RE`, `SURFACE_NODE_RUNS_RE`,
`collectSurfaceFiles`, `analyzeExports`, `analyze`, `stripComments`, and the two
baseline files `.ctoc/reachability-baseline.json` / `.ctoc/export-reachability-baseline.json`.
Confirm which regexes actually run inside a `while (re.exec(text))` loop over
attacker-sized text. Record each finding.

### Step 10: IMPLEMENT
- [x] IMPLEMENT — declared files implemented; full gated npm test green.
- Bound `SURFACE_CALL_RE`'s identifier to `{0,127}`.
- Bound every OTHER sibling regex with a genuine quadratic-backtracking ReDoS on a
  long single-char / whitespace run, each with a one-line comment naming the reason
  and matching the file's existing bounded-regex style.
- No behavior change for real inputs; no baseline movement.

### Step 11: REVIEW
- [x] REVIEW — adversarial iron-loop-critic REVIEW via backfill workflow (2026-07-29): CLEARS Gate 3.
Adversarial: does the bound drop any real call site? Is 128 safe (no real identifier
exceeds it)? Are ALL quadratic siblings found, or does one remain (a second ReDoS the
next fixture would hit)? Does `\s*` or any `[^x]*` still backtrack quadratically? Do the
reachability AND export fences stay green with ZERO baseline movement (semantics
preserved)?

### Step 12: OPTIMIZE
Confirm the suite wall-clock drops (the 14-min test now completes in ms). Note the new
approximate suite duration.

### Step 13: SECURE
- [x] SECURE — security-scanner SECURE via backfill workflow (2026-07-29): CLEARS; no block/critical.
This closes a ReDoS. Confirm no NEW ReDoS is introduced by the rewrite, no catastrophic
alternation added, and the bounds cannot be evaded by a different pathological input
(long whitespace run, long quoted run inside the require regexes).

### Step 14: VERIFY
- [x] VERIFY — full gate recorded to .ctoc/state/verify/<slug>.json: passed=true, coverage >=99%, 0 skipped, 0 failed.
Full gate `npm test` on EXIT CODE: `[CTOC test-gate] PASS`, coverage ≥ 99%, 0 skipped,
0 failed. `npx tsc --noEmit` exit 0. eslint clean. The suite itself should now be
dramatically faster — record the new duration.

### Step 15: DOCUMENT
Record the measured before/after suite duration and the ReDoS class in the plan.

### Step 16: FINAL-REVIEW
- [x] FINAL-REVIEW — workflow REVIEW+SECURE verdict (2026-07-29): CLEARS Gate 3.
Confirm all steps complete, the fix is minimal, and both fences are green with no
baseline movement.


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] TEST — TDD tests present; workflow Step-11 REVIEW (2026-07-29) confirmed real/adversarial, not vacuous.
- [ ] Write tests for the implementation
- [ ] Test error conditions
- [ ] Run tests - expect RED (failing)

### Step 9: PREPARE
- [x] PREPARE — plan ancestry + code confirmed against the real implementation.
- [ ] Install dependencies if needed
- [ ] Check prerequisites
- [ ] Verify dev environment ready
- [ ] Create directories/config if needed

### Step 10: IMPLEMENT
- [x] IMPLEMENT — declared files implemented; full gated npm test green.
- [ ] Implement the feature according to requirements
- [ ] Add error handling
- [ ] Wire up integration points

### Step 11: REVIEW
- [x] REVIEW — adversarial iron-loop-critic REVIEW via backfill workflow (2026-07-29): CLEARS Gate 3.
- [ ] Self-review all new code
- [ ] Verify integration points work together
- [ ] Check error handling completeness

### Step 12: OPTIMIZE
- [ ] Remove redundant operations
- [ ] Optimize critical paths
- [ ] Simplify complex code

### Step 13: SECURE
- [x] SECURE — security-scanner SECURE via backfill workflow (2026-07-29): CLEARS; no block/critical.
- [ ] Validate inputs (no path traversal)
- [ ] Sanitize outputs
- [ ] No secrets in code
- [ ] Safe file operations

### Step 14: VERIFY
- [x] VERIFY — full gate recorded to .ctoc/state/verify/<slug>.json: passed=true, coverage >=99%, 0 skipped, 0 failed.
- [ ] Run lint + type check
- [ ] Run ALL tests (TDD Green)
- [ ] Check coverage >= 80%
- [ ] 0 skipped, 0 flaky tests

### Step 15: DOCUMENT
- [ ] Update relevant documentation
- [ ] Add JSDoc comments to new functions
- [ ] Update CHANGELOG if needed

### Step 16: FINAL-REVIEW
- [x] FINAL-REVIEW — workflow REVIEW+SECURE verdict (2026-07-29): CLEARS Gate 3.
- [ ] Verify steps 8-15 completed correctly
- [ ] All quality checks passed
- [ ] Manual verification if needed
- [ ] Ready for human review


## Deferred Questions

_Written by the Iron Loop integrator (src/lib/iron-loop.js), which performs NO
quality evaluation. These entries are the integrator's own report on itself, not
findings from a critic that read this plan._

- **evaluation**: NOT EVALUATED — no automated critique was performed on this plan. The refinement loop appended the Steps 8-16 template and assessed nothing. (The scores this step used to report were computed from that same template, not from the plan.) A human or a real critic must review this plan before it is built.
