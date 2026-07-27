---
approved_by: human
approved_at: 2026-07-18T13:23:02.190Z
gate_crossed: implementation → todo
---

---
iron_loop: true
title: "A ratcheting fence against checks that report a verdict on input they never received — the false-green defect class that has shipped five times"
type: implementation
parent_plan: none
depends_on: none
priority: critical
files:
  - src/lib/false-green-scan.js
  - src/lib/iron-loop-enforcer.js
  - tests/false-green-fence.test.js
  - .ctoc/false-green-baseline.json
  - CLAUDE.md
---

# The false-green fence

## Problem — one defect class, five confirmed shipments

In the human's words: **a check that reports failure or success based on input it
never actually received.** Every instance below passed review, passed the suite, and
shipped. The suite could not see any of them, because in each case the instrument was
blind and the blindness itself was reported as a value.

| # | Site | Mechanic | Reported |
|---|---|---|---|
| 1 | `src/scripts/test-gate.js` `parseFail` | no-match default was the SUCCESS value `0`; ANSI under `FORCE_COLOR` broke the `^` anchor | `fail 0` over 8 real failures |
| 2 | `src/lib/step-13-verify.js:342` | `.slice(0, 4000)` then parsed the truncated copy for a verdict printed at the END | every plan recorded `passed: false` |
| 3 | `src/scripts/test-gate.js` main | `process.exit` after ~1.4MB of piped writes; piped writes are asynchronous and unflushed output is discarded | consumer received output cut mid-line |
| 4 | `execSync` default 1MB `maxBuffer` | once 3 was fixed the output overflowed, threw ENOBUFS, reported as "Tests failed" | a PASSING suite recorded as a test failure |
| 5 | historic `step-13-verify` + quality agent | returned `0` on parse failure | pass over real failures |

Defect 3 is the tell for the whole class: **it is invisible interactively.** Terminal
writes are synchronous, so running it by hand is correct every time. Only a pipe —
that is, only an automated caller — reveals it. A defect class that hides from the
human doing the review is exactly the class that needs a mechanical fence.

The two fixed exemplars encode what "correct" looks like and are the specification
for the rules below: `src/scripts/test-gate.js` (parsers return `null`, never `0`;
ANSI stripped before parsing; explicit 64MB `maxBuffer`) and `src/lib/request-exit.js`
(`process.exitCode` + return, so Node drains before exiting).

## What this builds

A **test that fails**, inside `npm test`, following this repository's existing
ratcheting-fence pattern (`tests/reachability.test.js`), backed by a scanner module
wired into the live self-check registry.

### The baseline / whitelist distinction — the decision that makes this landable

This repository already runs both patterns, and they mean different things. Conflating
them is what would sink this fence:

| | Meaning | Justification required | Direction |
|---|---|---|---|
| **BASELINE** (`.ctoc/reachability-baseline.json` model) | pre-existing DEBT, tolerated so the fence can land | no — it is debt, not a blessing | may only SHRINK |
| **WHITELIST** (`tests/cache-freshness.test.js` model) | a PERMANENT exemption; the construct is correct and must never be flagged | yes, written, per entry | kept minimal |

The empty-catch signature alone matches **135 sites across 58 files in `src/`**
(measured, not estimated). Demanding a written justification for each of those before
the fence can land guarantees the fence never lands. They go in the BASELINE as debt.
The WHITELIST stays small and justified, for constructs that are genuinely correct.

## The signatures — each verified against the real code before being written as a rule

### S1 · `parse-default` — a parser whose no-match branch returns a verdict

The defect-1 mechanic. Detection is scoped to **parser-named functions** (name matches
`/^(parse|extract|count|read)[A-Z_]/`) that contain a regex operation
(`.match(`, `.matchAll(`, `.exec(`, `.test(`) and contain a `return` of a
verdict-bearing literal — `0`, `true`, `false`, `''`, `[]`, `'pass'`, `'ok'`.

Prescribed fix, quoting the shipped exemplar: return `null`/`undefined`, or throw.
`test-gate.js` `parseCoveragePct` is the model — it was the only parser that already
did this, and it is the only reason the gate failed at all while `parseFail` was
silently reporting `0` over 8 real failures.

Verified: all three `test-gate.js` parsers now end `matches.length ? … : null` and are
clean under this rule. `evaluateSummary` treats `null` as a failure condition.

### S2 · `truncate-then-parse` — bounding the input before reading it

The defect-2 mechanic. Detection is intra-function: a `.slice(0, N)` or
`.substring(0, N)` whose result is bound to an identifier, where that identifier later
flows into `.match(`/`.matchAll(`/`.exec(`/`parse…(` **within the same function body**.

This is the highest-precision signature in the set — legitimate truncate-then-parse is
close to nonexistent. Prescribed fix, quoting the shipped exemplar: parse the FULL
input first, bound only what is STORED — `src/lib/step-13-verify.js` `boundOutput`
(head + elision marker + TAIL, called only after every parser has read the complete
output, because the runner prints its verdict last).

### S3 · `exit-with-pending-writes` — `process.exit` on a path that has written

The defect-3 mechanic. Detection: a function body containing `process.exit(` that also
contains `process.stdout.write`, `process.stderr.write`, or `console.log`/`console.error`.

Prescribed fix: `requestExit(code)` from `src/lib/request-exit.js`, then return.

Verified live `process.exit` sites in `src/` that this will flag and baseline:
`src/commands/menu.js:434`, `src/commands/update.js:215,222,282`,
`src/lib/coverage-map.js:504,519`, `src/lib/hash-utils.js:304`,
`src/lib/quality-agent.js:1350,1415`, `src/lib/app-runner.js:873,887`,
`src/scripts/build-coverage-map.js:491,504,525`, `src/scripts/run-evals.js:214`,
`src/lib/tui.js:253`, `src/scripts/run-self-check.js:35`.

`src/scripts/test-gate.js` contains no `process.exit` — it was converted to
`requestExit` and must stay clean. That is asserted as a named regression pin, not
merely left to the baseline.

### S4 · `unbounded-capture` — `execSync`/`spawnSync` capturing without `maxBuffer`

The defect-4 mechanic. Detection: an `execSync(`/`spawnSync(` call whose options object
sets `encoding` or a piped `stdio`, and contains no `maxBuffer` key. A call with
`stdio: 'ignore'` captures nothing and is not flagged.

Prescribed fix: set an explicit `maxBuffer` AND distinguish an overflow from a command
failure. `src/lib/step-13-verify.js:726-746` is the shipped exemplar — it reports
`output exceeded the capture buffer of N bytes — the run could not be read`, which is
an unreadable-result verdict, not "the command failed".

Verified: `dependency-auditor.js`, `sca-runner.js`, `sast-runner.js`,
`secrets-scanner.js`, `stale-detector.js`, `quality-agent.js`,
`migration-safety-checker.js`, `test-gate.js` and `stop-test-gate.js` already set
explicit `maxBuffer` and are clean. The capturing calls that do NOT and will be
baselined: `src/commands/update.js:81`, `src/lib/quality-state.js:55`,
`src/lib/deployment.js:205,206`, `src/lib/quality-agent.js:743`,
`src/lib/hooks-installer.js:80,111`, `src/lib/app-runner.js:517,790`,
`src/lib/step-13-verify.js:300` (a `--version` probe).

Several of those genuinely cannot overflow — `git rev-parse --short HEAD` returns a
hash. They are baselined as debt rather than whitelisted, because "this command's
output is small" is an assumption about a subprocess, and assuming a subprocess's
output size is how defect 4 happened. Making the bound explicit costs one line.

### S5 · `silent-catch` — an empty catch whose fall-through is the permissive outcome

Detection: a `catch` block containing no statements (comments do not count as
statements).

This is the **lowest-precision** signature in the set, and the plan says so plainly.
Comment presence does not discriminate: `test-gate.js:227`
(`catch { /* no baseline file → aspirational default */ }`) is correct and
`src/lib/task-reconcile.js:651` (`catch { /* the quarantine is defensive… */ }`) is
the red-team finding — a concurrent-edit guard that fails silently **open**, letting a
candidate promote over files a possibly-live holder may still be editing. Both carry a
comment; only one is a defect. No regex distinguishes them.

The precision burden therefore sits on the **ratchet**, not the detector: all 135
existing sites are baselined as debt, and a NEW empty catch fails the fence, forcing a
human to look at it and either fix it or add it deliberately. That is the honest
trade, and it is the same trade `tests/reachability.test.js` made with ~92 dead files.

`src/lib/task-reconcile.js:651` is baselined here with the rest. **This plan does not
fix it** — that is a behavior change to the promotion guard and belongs in its own
plan with its own tests. Fixing it inside a fence plan would mix a mechanical guard
with a live scheduling change.

### Signatures REJECTED as too noisy — and why

The main risk is a fence that fires on legitimate code and gets whitelisted into
uselessness. These were considered and deliberately not implemented:

| Rejected | Why |
|---|---|
| any function returning `0` / any `\|\| 0` / `?? 0` | thousands of legitimate sites; a fence at this precision is pure noise and trains people to whitelist |
| any regex match followed by any default value | the default is usually correct; only the parser-named + verdict-literal narrowing (S1) carries signal |
| any `.slice(0, N)` anywhere | display truncation, log excerpting and `boundOutput` itself are all legitimate; only slice-then-parse **in the same function** (S2) is the defect |
| any `catch` that logs instead of rethrowing | correct in every hook in this repo, which must fail OPEN by design |
| any `process.exit` at all | correct in a pure argument-validation path that has printed nothing; S3's co-occurrence with a write is what carries the signal |
| any subprocess without a timeout | a real hazard, but a different defect class (hanging), not a false-green one — out of scope |

## Wiring — the live call sites

`tests/reachability.test.js` and the dead-EXPORT fence both treat a test as *not* a
caller. A scanner module reached only by its own test would be dead on arrival and
would fail the very suite it joins. The wiring is therefore part of THIS plan:

- `scanFalseGreen` is called from `checkFalseGreenFence(root)` in
  `src/lib/iron-loop-enforcer.js`, registered in the `CHECKS` array
  (`scope: 'architecture'`, `mode: 'thorough'`) — the identical shape
  `checkReachabilityFence` uses at line 583/635 to keep `src/lib/reachability.js`
  alive, with the same lazy `require('./false-green-scan')` inside the function body.
- That registry is reachable from a live root via `src/scripts/run-self-check.js`
  (a declared root in `.ctoc/reachability-roots.json`).

**The module exports exactly ONE function.** A second export used only by the test
would itself be flagged by the dead-EXPORT fence. The self-test therefore plants its
known-violating source through the same entry point, via the `sources` option.

## Dependency graph

```
src/lib/false-green-scan.js   ──called-by──> src/lib/iron-loop-enforcer.js (CHECKS registry)
                                                   └──reached-from──> src/scripts/run-self-check.js (live root)
src/lib/false-green-scan.js   ──read-by────> tests/false-green-fence.test.js (the ratchet)
.ctoc/false-green-baseline.json ──read-by──> tests/false-green-fence.test.js
                                              + src/lib/iron-loop-enforcer.js
```

No cycles. `false-green-scan.js` requires only `node:path` and `./safe-fs`.

## File specifications

### File: `src/lib/false-green-scan.js`
**Action:** CREATE
**Purpose:** Scan `src/` for the five false-green signatures and return stable-keyed findings.

```js
/**
 * @typedef {Object} FalseGreenFinding
 * @property {string} file      Repo-relative path, POSIX separators on every platform.
 * @property {number} line      1-based line of the offending construct (for the human).
 * @property {'parse-default'|'truncate-then-parse'|'exit-with-pending-writes'|'unbounded-capture'|'silent-catch'} signature
 * @property {string} key       Stable identity: `${file}:${signature}:${anchor}`.
 * @property {string} evidence  Matched source excerpt, trimmed to 160 chars.
 * @property {string} fix       The prescribed safe shape, naming the exemplar.
 */

/**
 * Scan for false-green signatures.
 *
 * @param {string} root - Project root.
 * @param {{sources?: Array<{path: string, source: string}>}} [opts] - When `sources`
 *   is supplied the scan runs against those in-memory files instead of walking
 *   `root/src`. This is how the fence's self-test plants a known violation without
 *   writing a file, and it is why this module needs only ONE export.
 * @returns {{findings: FalseGreenFinding[], filesScanned: number, bySignature: Record<string, number>}}
 * @throws {TypeError} When `root` is not a non-empty string and no `sources` given —
 *   never returns an empty result for a bad input, since an empty finding list IS the
 *   success value and this module must not commit the defect it exists to catch.
 */
function scanFalseGreen(root, opts = {}) { /* … */ }

module.exports = { scanFalseGreen };
```

**`key` must not contain the line number.** Anchoring on the enclosing function name
means an unrelated edit above a baselined site does not churn the baseline into a
false failure. `anchor` is the nearest preceding `function NAME` or
`const|let NAME =` above the match, or `<module>` at top level; when two findings in
one function share a signature, a `#2`, `#3` … ordinal disambiguates.

**Error handling.** An unreadable file throws with its path — it is never skipped.
Skipping a file it could not read would make this scanner itself a check reporting a
verdict on input it never received.

**Cross-platform.** `path.join` for walking; every emitted `file` is normalized with
`split(path.sep).join('/')` so a baseline committed on macOS matches on Windows.

**No new dependency.** Line-scanning plus literal regexes; `src/` lints
`security/detect-non-literal-regexp` at error, so every pattern is a literal.

### File: `src/lib/iron-loop-enforcer.js`
**Action:** MODIFY
- Add `{ id: 'false-green-fence', scope: 'architecture', mode: 'thorough', fn: checkFalseGreenFence }` to `CHECKS` (after `dead-export-fence`, line ~584).
- Add `checkFalseGreenFence(root)` beside `checkReachabilityFence` (line ~635): lazily
  `require('./false-green-scan')`, return `null` when `filesScanned === 0` (not a CTOC
  source tree) or when no finding is outside the baseline, else
  `{severity: 'block', message: …}` naming file, line, signature and prescribed fix.
- A malformed baseline excuses NOTHING (mirrors `checkDeadExportFence:617`): every
  finding blocks. A baseline that cannot be read must not read as "all clear".

### File: `.ctoc/false-green-baseline.json`
**Action:** CREATE — seeded from a real scan at Step 9, not hand-written.

```json
{
  "maxFindings": 0,
  "note": "DEBT, not blessing. May only ever SHRINK. Never raise a number here to make a run pass.",
  "findings": [],
  "whitelist": {}
}
```

`findings` is the debt list (no per-entry justification — see the table above).
`whitelist` maps a key to a written justification and is for permanent, correct
constructs only; it starts EMPTY and every future addition is a reviewable act.

### File: `CLAUDE.md`
**Action:** MODIFY — add a short paragraph under "Test & Verify", beside the existing
`test-gate.js` fail-closed note, stating the class in the human's own words and
pointing at the fence and its baseline.

## Test plan

### File: `tests/false-green-fence.test.js`
**Action:** CREATE · Framework: `node:test` (`describe`/`it`/`assert/strict`)

1. **Non-vacuous** — `filesScanned > 100`; `bySignature` has all five keys. Guards
   against a path change making the scanner see zero files, which would make every
   assertion below trivially green. This is the fence refusing to commit its own
   defect class.
2. **Self-test per signature (5 cases)** — a planted source per signature is passed
   through `sources` and MUST be flagged; a fixed variant of each MUST NOT be. The
   `parse-default` pair is `return 0` versus `return null`; the
   `exit-with-pending-writes` pair is `process.exit(1)` versus `requestExit(1)`.
3. **Regression pins on the fixed exemplars** — `src/scripts/test-gate.js` yields zero
   `parse-default` and zero `exit-with-pending-writes` findings;
   `src/lib/step-13-verify.js` yields zero `truncate-then-parse`. A refactor that
   reintroduces any of the five shipped defects fails here by name.
4. **NO NEW FINDING** — every finding key is in the baseline or the whitelist.
   Failure message names file, line, signature and the prescribed fix.
5. **RATCHET ONLY TIGHTENS** — `findings.length <= maxFindings`.
6. **LOWER THE BASELINE** — `findings.length === maxFindings`; when it drops, the
   message tells the human the new number to write. Mirrors `reachability.test.js:87`.
7. **Baseline honesty** — no phantom entry for a file that no longer exists.
8. **Whitelist honesty** — every whitelist key is currently flagged (else dead weight
   masking something) and carries a justification longer than 20 characters. Mirrors
   `cache-freshness.test.js:705`.
9. **Key stability** — scanning a source, then the same source with a blank line
   inserted at the top, produces identical keys. This is the assertion that stops the
   baseline from churning on unrelated edits.
10. **Error path** — `scanFalseGreen('')` with no `sources` throws `TypeError`.

Coverage target ≥ 80% on the new module, every signature branch and the throw path
exercised.

## Security review

- **Path traversal** — the walk is confined to `path.join(root, 'src')`; no
  user-supplied path is joined. Symlinks are not followed.
- **Non-literal regexp** — every pattern is a literal, satisfying the `src/` lint rule
  at `--max-warnings 0`.
- **Catastrophic backtracking** — patterns are line-scoped and anchored; no nested
  unbounded quantifier. A 10,000-line synthetic file is scanned in the test to pin it.
- **No secrets** — the scanner reads source and emits path/line/excerpt only; the
  160-char `evidence` cap bounds what a finding can echo into a log.
- **No shell, no subprocess, no network.**
- **Fails loud, not open** — an unreadable file throws; a malformed baseline excuses
  nothing.

## Decisions Taken Under Ambiguity

1. **The second defect class — an instruction that can never execute — is SPLIT into
   its own plan. This is a recommendation, not a scheduling decision; the human
   chooses when it is built.** The three confirmed instances (the `menu task add
   precompute` invalid kind that silently killed the whole question fleet;
   `src/hooks/SessionStart.js:200` instructing agents to call a JavaScript function
   when every one of them holds only Read/Grep/Write; `enforcement.mode` documented in
   CLAUDE.md, written into every new project by `src/lib/init-project.js:504-511`, and
   read by nothing) share the root — something claims to work and never runs — but
   share no mechanic. They need three unrelated cross-reference detectors: a command
   registry versus its accepted-kind enumeration; agent markdown frontmatter tool
   grants versus instruction verbs across 123 agent files; and config keys written
   versus config keys read. None is a source-pattern scan. Building it here would more
   than double the module, the baseline and the test file, against the slice-sizing
   rule. The technical dependency is nil — the two plans are independent and can be
   built in either order.
2. **Baseline as debt, whitelist as blessing** — resolved in favour of two separate
   structures rather than one justified list, because 135 justifications would prevent
   the fence from landing. Both patterns already exist in this repository.
3. **`task-reconcile.js:651` is baselined, not fixed here** — fixing the silently-open
   concurrent-edit guard is a behavior change to promotion and needs its own tests.
4. **Anchor keys on enclosing function name, not line number** — a line-numbered
   baseline would fail on every unrelated edit and be disabled within a week.
5. **Small-output subprocesses are baselined, not whitelisted** — "this command's
   output is small" is an assumption about a subprocess, and that assumption is
   defect 4.
6. **Regex/line scanning, not a JavaScript parser** — no stdlib parser exists and no
   new dependency is permitted. The precision limit is stated in the plan rather than
   hidden.

### Decisions taken during execution (Steps 10–14)

7. **FILES OUTSIDE THE DECLARED SET WERE TOUCHED — surfaced, not silent.** Adding one
   source module and one test file made three committed documentation counts stale and
   the full gate failed on them. Two files outside this plan's `files:` set were edited,
   each by exactly one number:
   - `README.md` — "103 JS modules" → "104", pinned by `tests/readme-numbers.test.js`.
   - `tests/readme-numbers.test.js` — the same count hardcoded twice (lines 136 and 265),
     updated 103 → 104.

   The declared `CLAUDE.md` absorbed the rest (104 modules, 420 test files, twice).
   These are mechanical count reconciliations, not behavior changes, and updating a
   count pin to the TRUE live count tightens the assertion toward real behavior rather
   than weakening it to make red go green. Without them the plan cannot pass its own
   Step 14. **This widening is for the human to accept or reject.**

8. **Two `process.exit` sites the plan predicted would be flagged are correctly NOT
   flagged** — `src/commands/menu.js:434` and `src/lib/tui.js:253`. Both were read: in
   each, the enclosing function contains no write, so under S3's stated rule ("S3's
   co-occurrence with a write is what carries the signal") they are correct code, not
   misses. The plan's prediction list was optimistic; the rule as written is right and
   was NOT loosened to match the prediction.

9. **S3 checks the INNERMOST enclosing function only, not the ancestor chain.** Walking
   outward would make almost every top-level `process.exit` in a script co-occur with
   some `console.log` elsewhere in the file, flagging exactly the pure
   argument-validation exits the plan explicitly calls correct. The literal plan text —
   "a function body containing `process.exit(` that also contains a write" — is
   implemented as written. The cost is a missed exit inside a nested callback whose
   writing sibling is in the outer function; that is a known precision limit, stated
   here rather than hidden.

10. **`parse-default` fires on some legitimate coercions** — for example
    `budget.js parseYamlValue`'s `if (v === 'true') return true;`, which is a real value
    parse, not a no-match default. This is a known cost of the plan's stated
    regex-not-parser limit. No signature was narrowed or added to chase it: the plan
    forbids adding signatures, and narrowing S1 further would risk missing the actual
    defect-1 shape. These 16 sites sit in the debt list where a human can review them.

## Execution Plan

### Step 8: TEST — [x] DONE (TDD Red confirmed)
Wrote `tests/false-green-fence.test.js` (17 cases: the 10 planned + the per-signature
split + the backtracking pin) against an empty baseline, and ran it BEFORE any
implementation existed.

**Red evidence, verbatim (`NO_COLOR=1 node --test tests/false-green-fence.test.js`):**

```
ℹ tests 17
ℹ pass 1
ℹ fail 16
ℹ cancelled 0
ℹ skipped 0
```

Every failure was `Error: Cannot find module '../src/lib/false-green-scan'`, e.g.:

```
✖ detects parse-default, and does NOT flag its fixed form (0.131708ms)
✖ NO NEW FALSE-GREEN SITE: every finding is already baselined or whitelisted (0.090625ms)
✖ a bad root throws rather than returning an empty (success-looking) result (0.291541ms)
    actual: Error: Cannot find module '../src/lib/false-green-scan'
```

The single pass is the baseline-honesty case, which reads only the (empty) baseline
file and legitimately holds with zero entries.

### Step 9: PREPARE — [x] DONE
`.ctoc/` writable (baseline created). `src/scripts/run-self-check.js` confirmed
present in `.ctoc/reachability-roots.json`. No dependency added.
Confirm `.ctoc/` is writable and `src/scripts/run-self-check.js` is a declared root in
`.ctoc/reachability-roots.json`. Confirm no dependency is added. Baseline stays empty
until Step 12 — it is seeded from a real scan, never hand-written.

### Step 10: IMPLEMENT — [x] DONE
- [x] `src/lib/false-green-scan.js` — the walker, the five signature detectors, anchor
  extraction, the `sources` option, POSIX path normalization, the `TypeError` path.
  Exports exactly ONE function.
- [x] `src/lib/iron-loop-enforcer.js` — `checkFalseGreenFence` + the `CHECKS` entry
  (`scope: 'architecture'`, `mode: 'thorough'`), the live call site. Wiring landed in
  THIS slice, never a follow-up.

### Step 11: REVIEW — [x] DONE
- [x] Dependency direction: `false-green-scan.js` requires only `node:path` and
  `./safe-fs` — no hook, no command, no new dependency.
- [x] One export only (`scanFalseGreen`); `stripAnsi`-style helpers stay internal, so
  the dead-export fence has nothing to flag.
- [x] No key contains a line number — asserted by the key-stability test, which inserts
  a line above each planted site and requires identical keys.
- [x] Every RegExp is a literal (`security/detect-non-literal-regexp` clean).
- [x] The scanner's own failure paths THROW: a bad `root` and a malformed `sources`
  entry raise `TypeError`, and an unreadable file is not wrapped in a catch — it throws
  with its path. It never returns an empty result for input it did not read.

### Step 12: OPTIMIZE — [x] DONE
Seeded `.ctoc/false-green-baseline.json` from a real scan of `src/`: **220 findings** at
seed time, `maxFindings: 220`. Distribution at seed: `silent-catch` 138,
`exit-with-pending-writes` 53, `parse-default` 16, `unbounded-capture` 13,
`truncate-then-parse` 0. The zero is the expected result and is itself evidence — defect
2's only instance was already fixed, and the regression pin on `step-13-verify.js` holds
it fixed.

**Shipped baseline, reconciled to the live tree (v6.13.43):** the ratchet has since
paid the debt down to **209 findings**, `maxFindings: 209` (`silent-catch` 130,
`exit-with-pending-writes` 51, `parse-default` 16, `unbounded-capture` 12,
`truncate-then-parse` 0) — 11 sites fixed by later plans, exactly the tighten-only
direction this fence enforces. `findings.length === maxFindings === 209` and the
whitelist is still EMPTY, so the ratchet's own honesty tests hold.

Every finding was read. **None was fixed in this slice**: every candidate fix lands in a
file outside this plan's declared `files:` set, and the plan already resolved this
direction (decision 3, `task-reconcile.js:651` is baselined rather than fixed, because
changing a promotion guard is a behavior change needing its own tests; decision 5,
small-output subprocesses are baselined rather than whitelisted). Fixing them here would
mix a mechanical guard with live behavior changes across ~50 files. The whitelist stays
EMPTY, which is the correct starting state.

Single-pass file reads confirmed: the whole scan of 157 files is ~45ms.

### Step 13: SECURE — [x] DONE
- [x] Walk confined to `path.join(root, 'src')`; no user-supplied path is joined.
- [x] Symlinks are not followed (`entry.isFile()` / `entry.isDirectory()` only).
- [x] No shell, no subprocess, no network.
- [x] `evidence` capped at 160 characters, bounding what a finding can echo into a log.
- [x] Catastrophic backtracking: the 10,000-line synthetic pin passes. Four patterns
  were REWRITTEN after `security/detect-unsafe-regex` flagged them at error — a chain of
  optional whitespace groups (`\s*(?:export\s+)?(?:async\s+)?…`) and a lazy `.*?` between
  whitespace runs are both star-height-2 backtracking shapes. Modifiers are now stripped
  iteratively, the head-slice is matched in two linear steps, and the catch body is
  located by character-walking rather than by a pattern spanning the optional `(err)`
  clause. `npx eslint --max-warnings 0` and `tsc --noEmit` are both clean.
- [x] Fails loud, not open: unreadable file throws; a malformed baseline excuses NOTHING.

### Step 14: VERIFY — [x] DONE — FULL GATE PASSES

Re-run on the live tree (v6.13.43) via `npm test` (`src/scripts/test-gate.js` — whole
suite + coverage floor 99 + zero-skipped), verbatim tail:

```
ℹ tests 10528
ℹ pass 10528
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ   false-green-scan.js              |  99.29 |    94.82 |  100.00 | 345-347 428 564
[CTOC test-gate] coverage 99.15% (threshold 99%), skipped 0, failed 0
[CTOC test-gate] PASS
```

The suite has grown from 9869 to 10528 tests since this slice was first executed and
still passes with 0 fail / 0 skip; coverage is 99.15%, above the 99 floor. `npx tsc
--noEmit` is clean. The fence's own tests pass 17/17 in isolation.

- [x] `tests/reachability.test.js` + `tests/export-reachability.test.js`: pass — the new
  module is reachable from a live root and its single export has a live caller.
- [x] `false-green-fence` proven live in the CHECKS registry: run against a scratch root
  holding one planted violation, it returns
  `block: 1 NEW false-green site(s) … src/lib/bad.js:3 [exit-with-pending-writes] …`
  with the prescribed fix. Against this repository it correctly returns null, because
  every site is baselined.
- [x] New-module coverage 99.29% line / 94.82% branch, against an 80% target.

### Step 15: DOCUMENT — [x] DONE
JSDoc on `scanFalseGreen` and `checkFalseGreenFence`, both naming the defect class and
the shipped exemplars. A paragraph added to CLAUDE.md under "Test & Verify", beside the
existing fail-closed note. The baseline carries a `note` naming it debt that may only
shrink and a separate `whitelistNote` explaining why the two structures are distinct.

### Step 16: FINAL-REVIEW — [x] DONE
- [x] The fence is a test inside `npm test` (`tests/false-green-fence.test.js`, 17 cases).
- [x] The ratchet only tightens: `findings.length <= maxFindings` AND
  `findings.length === maxFindings`, so unclaimed progress fails loudly too.
- [x] Every failure message names file, line, signature and the prescribed safe shape.
- [x] The whitelist is EMPTY; every future entry needs a justification over 20 chars and
  must be currently flagged, or the whitelist-honesty test fails it as dead weight.
- [x] The six rejected signatures remain documented and unimplemented.
- [x] No stub, no TODO.

Gate 3 is the human's. This plan does not cross it.

## Completion status — RECONCILED to the shipped tree (v6.13.43): the fence is live and the full gate is GREEN

The earlier `passed: false` narrative on this plan is STALE and has been removed. It
described a transient state at first execution — a concurrently-edited neighbouring plan
(`00067-y1-ctoc-start-entry-point`) whose post-approval hash mismatch tripped
`gate-destinations-approved`, plus a `js-yaml` missing from an old plugin cache
(`6.12.85`). Neither survives into the shipped tree: the repository has advanced 40+ patch
versions, the referenced verify-evidence file
(`.ctoc/state/verify/00071-fg1-false-green-fence.json`) does not exist, and the full gate
now passes clean.

**The fence is shipped and live.** All four artifacts are present and integrated:
`src/lib/false-green-scan.js` (the scanner, one export), `src/lib/iron-loop-enforcer.js`
(the `false-green-fence` CHECKS entry + `checkFalseGreenFence`, the live call site),
`tests/false-green-fence.test.js` (the ratchet, 17/17 green), and
`.ctoc/false-green-baseline.json` (209 findings, ratcheted down from the seeded 220). The
class is documented in `CLAUDE.md` under "Test & Verify".

**Full gate, re-run on the live tree, verbatim:**

```
ℹ tests 10528   ℹ pass 10528   ℹ fail 0   ℹ skipped 0   ℹ cancelled 0   ℹ todo 0
[CTOC test-gate] coverage 99.15% (threshold 99%), skipped 0, failed 0
[CTOC test-gate] PASS
```

`npx tsc --noEmit` clean. `false-green-scan.js` at 99.29% line / 94.82% branch. No test
was weakened; the reconciliation touched only this plan's own record numbers (the stale
9869/99.01 snapshot, the seeded-vs-shipped baseline count) to match what actually shipped.

Gate 3 is the human's. This plan does not cross it.
