---
approved_by: human
approved_at: 2026-07-19T15:21:51.987Z
gate_crossed: implementation → todo
---

---
title: "The secret scanner keeps the secrets it finds — a non-zero exit carrying verified findings is parsed, not discarded"
type: implementation
parent_plan: ctoc-honest-instruments
depends_on: none
priority: CRITICAL
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/lib/secrets-scanner.js"
  - "src/lib/quality-agent.js"
  - "tests/secrets-scanner-external-tool-findings.test.js"
  - "CLAUDE.md"
  - ".ctoc/false-green-baseline.json"
---

# The secret scanner keeps the secrets it finds

`src/lib/secrets-scanner.js:1159-1161`, verified on disk:

```js
    } catch (e) {
      // TruffleHog may exit with non-zero if findings exist
    }
```

The comment names the exact condition the code discards. `execFileSync` **throws**
on a non-zero exit — that is its documented contract and the reason this `catch`
exists at all. TruffleHog exits non-zero **because it found verified secrets**. So
on the one run that matters, control leaves the `try` before the NDJSON parse loop
at `:1140-1158` ever executes, `findings` returns `[]`, and the scan reports the
same empty result it would report on a clean repository.

The swallow is INSIDE `runTruffleHog`, which is why the outer guard cannot save it.
`runWithExternalTools:1070-1075` wraps the call in its own `try/catch` that pushes
to `this.errors` — but `runTruffleHog` never throws, so that guard never fires and
`this.errors` stays empty. `run():1052-1058` returns `success: true` unconditionally
with `errors: this.errors`. A repository with a live, verified, leaked credential
and a clean repository produce **byte-identical** scan results.

`:1202-1204` is the same shape for detect-secrets:

```js
    } catch (e) {
      // detect-secrets may fail
    }
```

detect-secrets exits non-zero on a plain usage error too, so here the two cases —
"the tool ran and had something to say" and "the tool is broken or mis-invoked" —
are collapsed into the same silent empty array.

The third tracked site is `:1155-1157`, the per-line `JSON.parse` catch commented
"Skip non-JSON lines". TruffleHog interleaves human-readable progress lines with
its NDJSON, so *some* skipping is correct — but skipping **every** line without
counting is how a changed output format degrades into a silent zero-finding scan.

All three are tracked debt in `.ctoc/false-green-baseline.json:165-167`
(`silent-catch:runTruffleHog`, `silent-catch:runTruffleHog#2`,
`silent-catch:runDetectSecrets`). Fixing them must SHRINK that ratchet.

## The finding this plan adds to the brief: today nothing calls this code

Grepped `src/` in full: the only consumer of the scanner is
`src/lib/quality-agent.js` (`:50` requires it, `:846` constructs it), and it calls
`scanner.run()` at `:850` — **never `runWithExternalTools()`**. No file in `src/`
calls `runWithExternalTools`, `runTruffleHog` or `runDetectSecrets`.

So repairing `runTruffleHog` alone would be a well-tested repair to code no human
can reach — precisely the failure this repository fenced with Operating Lesson 16.
The fix is therefore two things in one slice: **make the external-tool path honest,
and wire it to the live security scan.** The tool-availability guard at `:1069`
and `:1079` already makes the wiring a no-op on a machine without the tools
installed, so the default behaviour for most users is unchanged.

## Implementation Details

### File: `src/lib/secrets-scanner.js`
**Action:** MODIFY
**Purpose:** Parse the output on the throw path; separate "the tool found secrets" from "the tool failed".
**Change type:** modify-existing — `runTruffleHog`, `runDetectSecrets`, and one module-private helper

#### Change 1 — a helper that recovers the output an exception carries

`execFileSync` attaches the captured streams to the thrown error (`err.stdout`,
`err.stderr`) and the exit status as `err.status`. Add beside `runTruffleHog`:

```js
/**
 * Recover a child process's stdout from EITHER a clean return or the exception
 * execFileSync throws on a non-zero exit.
 *
 * A scanner that exits non-zero BECAUSE IT FOUND SOMETHING is the single most
 * important run this class ever performs, and it is the one run where the output
 * arrives attached to an exception instead of a return value. Discarding it
 * turns a repository with a verified leaked credential into a clean scan.
 *
 * @param {Error & {stdout?: string|Buffer, status?: number|null, code?: string}} err
 * @returns {{ stdout: string, status: number|null, spawnFailure: boolean }}
 *   `spawnFailure` is true when the process never ran at all (ENOENT, EACCES,
 *   ETIMEDOUT) — a genuine failure, never a finding.
 */
function outputFromError(err) { /* … */ }
```

Rules, exactly:

1. `stdout` is `err.stdout` coerced to a string (`Buffer` → `utf8`), or `''`.
2. `status` is `err.status` when it is a finite number, else `null`.
3. `spawnFailure` is `true` when `status` is `null` **or** `err.code` is one of
   `ENOENT`, `EACCES`, `EPERM`, `ETIMEDOUT`, `ENOMEM`, `EMFILE` — the process
   did not run to completion, so its silence carries no information. A killed
   process (`err.signal` set) is also a spawn failure: a timeout at 300000ms
   truncates output, and a truncated scan is not a clean scan.

#### Change 2 — `runTruffleHog` parses both paths

Restructure so parsing is reached from either path, and a genuine failure is
recorded on `this.errors` rather than returned as an empty array:

```js
async runTruffleHog() {
  const findings = [];
  let raw = '';
  try {
    raw = execFileSync('trufflehog', [...], { encoding: 'utf8', maxBuffer: …, timeout: … });
  } catch (e) {
    // NOT swallowed. TruffleHog exits NON-ZERO precisely when it has verified
    // findings, so this is the success path for the case that matters — the
    // output is attached to the exception and is parsed exactly as a clean
    // return would be. Only a process that never completed is a failure.
    const recovered = outputFromError(e);
    raw = recovered.stdout;
    if (recovered.spawnFailure) {
      this.errors.push({
        tool: 'trufflehog',
        kind: 'error',
        error: `trufflehog did not complete (${e.code || e.signal || 'unknown'}): ${e.message} — the external secret scan DID NOT RUN`
      });
      return findings;
    }
  }
  // … the existing NDJSON loop, now reached on both paths …
}
```

The NDJSON loop is unchanged except for Change 4.

#### Change 3 — `runDetectSecrets`, same shape with one added distinction

detect-secrets exits non-zero for real usage errors as well, and its output is a
single JSON document rather than NDJSON, so the discriminator is whether the
recovered stdout **parses**:

- Recover stdout the same way; a `spawnFailure` records the same style of error
  and returns.
- `JSON.parse` the recovered text. On success, walk `data.results` exactly as
  today — a non-zero exit with parseable output is a report, not a failure.
- On a parse failure, push
  `{ tool: 'detect-secrets', kind: 'error', error: 'detect-secrets exited <status> and produced no parseable report — the external secret scan DID NOT RUN' }`
  and return `[]`. The error message must NOT contain the raw output: it can
  contain the secret itself.

#### Change 4 — an unparseable NDJSON line is counted, not vanished

In the per-line loop, count skipped lines instead of discarding them, and after
the loop:

```js
if (skippedLines > 0 && findings.length === 0) {
  this.errors.push({
    tool: 'trufflehog',
    kind: 'error',
    error: `trufflehog produced ${skippedLines} unparseable output line(s) and ZERO parseable findings — treat this scan as NOT PERFORMED, not as clean`
  });
}
```

The condition is deliberate: progress lines alongside real findings are normal and
must stay quiet; **only** all-noise-and-no-findings is the signature of a changed
output format, and that is exactly when a zero must not read as clean. No raw line
content is included in the message.

---

### File: `src/lib/quality-agent.js`
**Action:** MODIFY
**Purpose:** Reach the repaired path from the live security scan.
**Change type:** modify-existing — the secrets block of `runSecurityScan` (`:844-895`)

`runSecurityScan` is reachable: `src/commands/push.js:26` requires this module, and
`push.js` is a sanctioned live root.

Two edits, both narrow:

1. **After** the existing internal scan completes and before
   `scanner.deduplicateFindings()`, run the external tools when they are present:

   ```js
   // The external scanners run ONLY when installed (isToolAvailable), so this is a
   // no-op on a machine without them. It is wired here because a repaired scanner
   // no human can reach is not a repair: quality-agent is the only consumer of this
   // class, and it called run() — the path that never invokes trufflehog at all.
   for (const tool of ['trufflehog', 'detect-secrets']) {
     if (!scanner.isToolAvailable(tool)) { skipped.push(`secrets: ${tool} not installed (external verification NOT performed)`); continue; }
     try {
       const external = tool === 'trufflehog' ? await scanner.runTruffleHog() : await scanner.runDetectSecrets();
       scanner.findings.push(...external);
     } catch (toolErr) {
       skipped.push(`secrets: ${tool} failed (external verification NOT performed) — ${toolErr.message}`);
     }
   }
   ```

   A missing tool becomes a visible skip rather than an invisible one, matching how
   this function already reports the dependency, SAST and SCA scanners
   (`:804-813`).

2. The existing `for (const e of (scanner.errors || []))` loop at `:889` already
   folds recorded errors into `skipped[]`. Confirm at Step 9 that a `{tool, kind:
   'error'}` entry is labelled correctly by that loop's `label()` helper — the
   helper at `:1341` already reads `e.file || e.tool || e.path`, so a tool error
   renders with the tool name. If the live code differs from this reading, **the
   code wins** and the plan is corrected in the Step 9 record.

**The gate consequence, stated plainly:** a verified TruffleHog finding carries
`severity: 'CRITICAL'` (`:1147`), and `runSecurityScan` fails the gate on any
CRITICAL. So on a machine with TruffleHog installed, a verified leaked credential
will now **block a push that previously passed**. That is the entire point of the
repair, and it is called out here so nobody meets it as a surprise.

---

### Wiring — the live call sites

| new / repaired code | live call site | root |
|---|---|---|
| `outputFromError` | `runTruffleHog` + `runDetectSecrets` (this slice) | `/ctoc:push` |
| repaired `runTruffleHog` | `quality-agent.runSecurityScan` (this slice — its FIRST live caller) | `src/commands/push.js` |
| repaired `runDetectSecrets` | `quality-agent.runSecurityScan` (this slice — its FIRST live caller) | `src/commands/push.js` |
| the new `this.errors` entries | the existing `scanner.errors` fold at `quality-agent.js:889` | `src/commands/push.js` |

No follow-up wiring. No dead code.

## Test Plan

### Tests: `tests/secrets-scanner-external-tool-findings.test.js`
**Action:** CREATE
**Framework:** `node:test` (`describe` / `it` / `before` / `after` / `node:assert`)

The external binaries are not installed on the test machine and must never be
required, so the child-process boundary is driven at the seam: replace the module's
`execFileSync` binding through the `require.cache` seam this repository already uses
(the pattern in `tests/dashboard-reconcile-failure.test.js`). The seam is the
process boundary — every line of the recovery, parsing and classification logic
under test is the real code.

| # | Case | Setup | Assertion |
|---|---|---|---|
| 1 | **a non-zero exit carrying findings YIELDS those findings** | `execFileSync` throws an error with `status: 183`, `stdout` = two valid TruffleHog NDJSON records | `runTruffleHog()` returns 2 findings, each `severity: 'CRITICAL'`, `verified: true`, with the detector name and file from the payload |
| 2 | **the secret value is still redacted on the throw path** | as case 1, `Raw` = a high-entropy literal | no finding's `match` contains the literal; `redactSecret` shape preserved |
| 3 | **a genuine tool failure is an ERROR, not a clean scan** | `execFileSync` throws with `code: 'ENOENT'`, no `stdout` | `runTruffleHog()` returns `[]` **and** `scanner.errors` contains a `{tool:'trufflehog', kind:'error'}` entry whose message contains `DID NOT RUN` |
| 4 | **a timeout is a failure, never a clean scan** | throws with `signal: 'SIGTERM'`, partial stdout | `[]` returned, error recorded — a truncated scan must not read as complete |
| 5 | **a clean zero-finding scan stays clean** | `execFileSync` returns `''` | `[]` returned and `scanner.errors` is empty — no false alarm |
| 6 | **all-noise output is reported as not-performed** | returns three non-JSON progress lines, no records | `[]` returned **and** an error mentioning `unparseable output line` |
| 7 | **noise alongside a real finding stays quiet** | one progress line + one valid record | 1 finding, `scanner.errors` empty |
| 8 | **detect-secrets: non-zero exit with a parseable report yields findings** | throws with `status: 1`, `stdout` = a valid detect-secrets JSON document with one result | 1 finding, `severity: 'MEDIUM'`, no error recorded |
| 9 | **detect-secrets: non-zero exit with unparseable output is an error** | throws with `status: 2`, `stdout` = `usage: detect-secrets …` | `[]` returned, error recorded containing `DID NOT RUN` |
| 10 | **no raw output reaches an error message** | as case 9, with a high-entropy literal in the stderr text | the recorded error string does not contain that literal |
| 11 | **the live security scan reaches the repaired path** | drive `qualityAgent.runSecurityScan` on a temporary project with `isToolAvailable` seamed to `true` and `execFileSync` seamed as in case 1 | the returned `critical` count includes the TruffleHog finding, and `details` names it |
| 12 | **an uninstalled tool is a visible skip** | `isToolAvailable` seamed to `false` | `runSecurityScan` result's `skipped[]` contains an entry naming `trufflehog` and `NOT performed`; `passed` is unchanged from today's behaviour |
| 13 | **a tool failure does not crash the push path** | `isToolAvailable` true, `execFileSync` throws `ENOENT` | `runSecurityScan` resolves, `skipped[]` or the folded `scanner.errors` names the failure, no throw |

Cross-platform: `fs.promises`, `path.join`, `os.tmpdir()`; teardown with
`fs.promises.rm(root, { recursive: true, force: true })`. No test invokes a real
external binary, so no case can be platform-skipped — a skip is a gate failure
under the zero-skipped rule.

## Execution Plan (Steps 8-16)

### Step 8: TEST — write `tests/secrets-scanner-external-tool-findings.test.js` in full, run ONLY that file, record the red output verbatim. Cases 1, 2, 3, 4, 6, 8, 9, 11 and 12 MUST be red today: the throw path discards everything, and `runSecurityScan` never reaches the external tools at all.
### Step 9: PREPARE — re-read from disk before editing: `src/lib/secrets-scanner.js:1118-1210` (the two runners and `isToolAvailable`), `:1030-1098` (`run` / `runWithExternalTools`, to confirm `errors` is the same array reference the caller reads), `src/lib/quality-agent.js:827-900` (the secrets block and the `scanner.errors` fold), and `.ctoc/false-green-baseline.json` for the three tracked keys. If any line number or shape in this plan disagrees with the file, THE CODE WINS — record the discrepancy here.
### Step 10: IMPLEMENT — one step, files as sub-items.
  - `src/lib/secrets-scanner.js` — Changes 1, 2, 3 and 4 (`outputFromError`; both runners parse the throw path; spawn-failure and unparseable-report errors; the unparseable-line counter).
  - `src/lib/quality-agent.js` — wire the external scanners into `runSecurityScan`, with an uninstalled tool reported as a visible skip.
### Step 11: REVIEW — confirm no path returns `[]` without EITHER a parsed report or a recorded error. Confirm `run()`'s `success: true` is now distinguishable from a failed external scan by a non-empty `errors` array, and say plainly whether `success` itself should become conditional (report the finding; do not widen scope). List every remaining `catch` in this file with a one-line justification.
### Step 12: OPTIMIZE — one extra string coercion on the exception path only; no additional process spawn, no re-scan. Confirm the external tools are invoked at most once each per scan.
### Step 13: SECURE — the recovered stdout contains SECRET MATERIAL by definition. Confirm: no raw output, no stderr text and no unredacted `Raw` value is ever written to `this.errors`, to a log, or to the console; every finding still passes through `redactSecret`; error messages carry only the tool name, the exit status, the error code and a count. Confirm `execFileSync` stays in argv form (no shell) on both runners.
### Step 14: VERIFY — run the new file plus `tests/secrets-scanner*.test.js`, `tests/quality-agent*.test.js`, `tests/false-green-fence.test.js`, `tests/reachability.test.js`, then the full gated run `npm test`. Lint the changed JavaScript. The coverage floor is a ratchet — do not lower it. No git operations.
### Step 15: DOCUMENT — JavaScript doc on `outputFromError` stating why the exception is the success path for the run that matters. Correct the two comments that named the discarded condition. Bump the test-file count in `CLAUDE.md` (both places) by the number of test files added, reading the live count from disk first — `tests/doc-counts.test.js` verifies it.
### Step 16: FINAL-REVIEW — report files, verbatim red evidence, verbatim green evidence, the baseline movement, and every decision taken under ambiguity.

## Step 9 PREPARE — discrepancies found on disk (THE CODE WON)

1. **There is no `label()` helper at `quality-agent.js:1341`.** The plan asserted one
   existed and would render a `{tool, kind:'error'}` entry with the tool name. Line 1341
   is inside `main()`. The real fold (now `:889` region) used an inline
   `const where = e.file || e.path || e.tool || 'unknown'` and hardcoded the wording
   `secrets scan skipped file (NOT scanned): …`. A tool error folded through it would have
   been reported as a *skipped file*, misnaming what went unscanned. Corrected in this
   slice: the fold now branches on `e.file || e.path` and renders a tool error as
   `secrets: <tool> — <error>`. No existing test asserted the old wording (grepped).
2. **Neither external tool is installed on this machine** (`trufflehog not found`,
   `detect-secrets not found`), confirming the wiring is inert by default and confirming
   the plan's requirement that the child-process boundary be seamed rather than invoked.
3. **`execFileSync` is DESTRUCTURED at module load** in both `secrets-scanner.js:17` and
   `quality-agent.js:36`, so the binding cannot be replaced on the live module object. The
   seam is therefore: patch the `child_process` exports, drop both modules from
   `require.cache`, re-require. Only the process boundary is faked; all logic under test
   is real code.
4. **`this.errors` is the same array reference the caller reads** — confirmed;
   `quality-agent` reads `scanner.errors` directly off the instance.
5. **`runWithExternalTools` still has no live caller in `src/`.** The wiring reaches
   `runTruffleHog` / `runDetectSecrets` directly (they are what needed repairing and what
   the gate consequence flows through). Reported, not widened: removing or wiring
   `runWithExternalTools` is a separate decision for the human.

## Step 11 REVIEW — findings

- No path in either runner now returns `[]` without EITHER a parsed report or a recorded
  error. Verified by cases 3, 4, 6, 9.
- **`run()` still returns `success: true` unconditionally.** Per decision 6 this slice
  does not change that boolean's meaning. The honest signal is the populated `errors`
  array, which `runSecurityScan` surfaces into `skipped[]`. Reporting only: making
  `success` conditional would ripple into every consumer and is the human's call.
- Remaining `catch` blocks in `secrets-scanner.js` are all either record-an-error or a
  deliberate, now-COUNTED skip. The false-green fence independently confirms: live count
  fell 217 → 214, exactly the three tracked sites, with **zero whitelist entries added**.

## Step 13 SECURE — confirmations

- `execFileSync` remains in argv form (no shell) on both runners; `this.projectRoot` is
  still a single literal argument.
- No raw stdout, no stderr text and no unredacted `Raw` value reaches `this.errors`, a log
  or the console. Error messages carry only tool name, exit status, error code and a
  count. Pinned by case 10 and by case 6's assertion that no output content appears.
- Every TruffleHog finding still passes through `redactSecret` on the throw path — pinned
  by case 2.

## Step 14 VERIFY — real full-gate evidence (recorded at review reconciliation)

The full gated run is the whole suite plus the coverage floor plus the zero-skipped
gate, via `npm test` (`src/scripts/test-gate.js`) — not a hand-picked subset:

- `[CTOC test-gate] coverage 99.15% (threshold 99%), skipped 0, failed 0` → `[CTOC test-gate] PASS`
- The plan's own new file `tests/secrets-scanner-external-tool-findings.test.js`: 13
  cases, 2 suites, `pass 13 / fail 0 / skipped 0`.
- `npx tsc --noEmit`: clean, no output.
- `tests/false-green-fence.test.js` is inside the green suite: the three tracked
  `silent-catch` sites (`runTruffleHog`, `runTruffleHog#2`, `runDetectSecrets`) are
  no longer present in `.ctoc/false-green-baseline.json` — the ratchet SHRANK, with
  zero whitelist entries added, exactly as Step 11 required.

Working tree is otherwise clean; no VERSION, no `.ctoc/streaming/` and no
`package-lock.json` change is part of this plan.

## Decisions Taken Under Ambiguity

0. **The spawn-failure error message OMITS `e.message`, which the plan's sketch included.**
   `execFileSync`'s message embeds the full command line and, on some failures, captured
   stderr — both of which can carry secret material, which Step 13 forbids. The message
   carries `e.code || e.signal || 'unknown'` instead. This tightens the plan rather than
   loosening it.
1. **The wiring into `quality-agent.runSecurityScan` is IN this slice, not deferred.**
   Nothing in `src/` calls the repaired methods today. A repair no human can reach is
   the dead-code pattern this repository fenced with Operating Lesson 16, and the
   planner's own rule forbids deferring a call site to a follow-up. The tool-availability
   guard makes the wiring inert where the tools are absent.
2. **A verified external finding is allowed to fail the push gate.** It carries
   `severity: 'CRITICAL'` and `runSecurityScan` blocks on CRITICAL. Suppressing that
   would rebuild the defect one layer up. Flagged prominently above because it changes
   push behaviour on machines that have TruffleHog installed.
3. **A killed or timed-out process is a FAILURE, not a finding.** Partial output from a
   truncated scan cannot be distinguished from a complete clean scan, and the whole
   subject of this slice is refusing to report a verdict on input that was never fully
   received.
4. **An unparseable NDJSON line is reported only when there are ZERO findings.**
   TruffleHog legitimately interleaves progress output; alarming on every noise line
   would flood the honesty signal, which `secrets-scanner.js:355-365` already documents
   as the failure mode that buries genuine errors.
5. **Error messages carry no raw output.** The recovered stream is secret material. The
   messages carry the tool name, exit status, error code and counts only.
6. **`run()` keeps returning `success: true`.** Changing that boolean's meaning would
   ripple into every consumer of the scan result and is a separate decision for the
   human; Step 11 reports the finding instead. The honest signal this slice adds is a
   populated `errors` array, which `quality-agent` already surfaces.
7. **The child-process boundary is seamed in tests, never invoked for real.** Requiring
   TruffleHog to be installed would force a platform-conditional skip, and a skip is a
   gate failure under the zero-skipped rule.

## What this plan does NOT fix

- It does not make `run()`'s `success` field reflect external-tool failure (decision 6).
- It does not add a new external scanner, change detector coverage, or alter the
  pure-JavaScript entropy scan.
- It does not touch the other 214 tracked false-green sites; only the three in this
  file move.
- It does not install or vendor TruffleHog or detect-secrets. On a machine without
  them, the external verification is reported as a skip and the scan is exactly as
  strong as it is today — which is the honest statement of what a user gets.
