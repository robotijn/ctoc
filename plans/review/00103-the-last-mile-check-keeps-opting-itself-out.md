---
approved_by: human
approved_at: 2026-07-19T18:15:13.949Z
gate_crossed: implementation → todo
kickback_counts:
  by_step:
    '14': 1
  total: 1
---

---
title: "The last-mile check stops losing its own verdict — one ladder, three honest opt-outs, and a child process that threw away the answer it had just printed"
type: implementation
parent_plan: ctoc-capability-registry
depends_on: 00100-the-plan-checker-reads-a-quoted-word-as-a-declaration, 00083-last-mile-drives-the-real-entry-point
priority: MEDIUM
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/lib/app-runner.js"
  - "tests/last-mile-drives-entry-point.test.js"
  - ".ctoc/false-green-baseline.json"
---

# The last-mile check stops losing its own verdict

## First question settled: three reasons, ONE ladder, and one of the three is dead

The brief asked whether the three different opt-out reasons are three code paths or
one path with three messages, because three paths would mean the fix that landed
today closed only one of them. **It is one ladder, and the report was wrong on one
of the three.** Read from disk:

`driveApp` (`src/lib/app-runner.js:1026-1050`) and `driveAppSync` (`:1074-1097`) are
the same ladder written twice — async and synchronous — and **both now read the
declaration first**:

```js
// driveApp:1029-1033
// THE DECLARATION IS CONSULTED FIRST — an explicit statement by a project about
// its own entry point outranks every heuristic about it.
const declared = readDeclaredEntryPoint(projectPath);
if (declared.declaration) return driveDeclaredEntryPoint(projectPath, declared.declaration);
if (declared.reason) return malformedDeclarationResult(declared.reason, started);
const shape = detectAppShape(projectPath);
```

```js
// driveAppSync:1079-1082
const declared = readDeclaredEntryPoint(projectPath);
if (declared.reason) return malformedDeclarationResult(declared.reason);
const shape = declared.declaration ? 'declared-entry-point' : detectAppShape(projectPath);
```

Below that single decision point sit **three producers of an opt-out result**:

| Producer | Line | The reason it emits |
|---|---|---|
| `malformedDeclarationResult` | `:426-435` | a declaration was found and could not be understood |
| `nativeNotApplicableResult` | `:363-390` | "Detected a … project via the **capability registry**. Its honest run last mile is build+test …" |
| the inline library/unknown result | `:1042-1049`, via `noRuntimeReason` `:403-408` | "no human-facing runtime" / "shape could not be determined", **plus** `NO_DECLARATION_SUFFIX` naming the settings key |

The second and third rows are the first two reported reasons, exactly. **The third
reported reason — "build and test project, launching is out of scope" — does not
exist in `src/` at all.** Searched: the phrase appears only in
`plans/review/00083-last-mile-drives-the-real-entry-point.md:25`, quoting an
evidence artifact recorded *before* that slice landed. It is a stale artifact, not a
live path.

**So the fix that landed today does cover all of them**: it sits above the branch,
in both functions, so a declaration outranks every producer below. The worry in the
brief is answered and dismissed — and that answer needs to be pinned by a test,
because it is currently true by reading and by nothing else.

## Second question settled: the declaration is NOT turned on here

`CLAUDE.md:158-164` documents this project's entry point in prose:

```json
{ "general": { "entry_point": {
    "command": "node src/commands/menu.js",
    "expect": "CTOC v",
    "timeout_ms": 30000
} } }
```

`.ctoc/settings.json`, read from disk, has **no `entry_point` key**. Its `general`
block contains `environment`, `timezone`, `syncInterval`, `syncEnabled`,
`keyboardLayout` and nothing else. So the declaration exists in prose and not in the
settings the code reads — which is the day's whole theme.

**This slice does not add it, deliberately.** Adding the key turns on a check that
launches a real process during every Step 14 verification on this repository. That
is a switch with real consequences on timing and on gate outcomes, and it belongs to
a quiet moment and to the human, not to the side of a plan about something else. The
brief said so explicitly and this plan obeys it.

What this slice does instead: make sure the switch **works** when it is thrown, and
that the documented block is still valid. The exact JSON above is what goes into
`.ctoc/settings.json`; nothing else is required.

## The real defect this slice fixes: the verdict is discarded after it is printed

`src/lib/app-runner.js:1174-1201`, the `--drive` child that `driveAppSync` spawns to
get a real verdict from a synchronous caller:

```js
driveApp(projectPath, opts)
  .then((result) => {
    process.stdout.write(RESULT_MARKER + JSON.stringify(result));
    process.exit(0);
  })
  .catch((e) => {
    process.stdout.write(RESULT_MARKER + JSON.stringify({ … errors: [ … ] }));
    process.exit(0);
  });
```

This is the **exit-with-pending-writes** signature by name — one of the five this
repository fences — and it is **already tracked debt**, listed verbatim in
`.ctoc/false-green-baseline.json:74-75`:

```
"src/lib/app-runner.js:exit-with-pending-writes:<module>"
"src/lib/app-runner.js:exit-with-pending-writes:<module>#2"
```

The child's stdout is a **pipe** (`spawnSync`), so writes are asynchronous and
`process.exit` discards whatever is still buffered. The parent then fails to find or
parse the marker and returns, at `:1135-1145`, a result with `launched: false` and a
"Could not parse app-runner driver verdict" error.

**Being precise about the failure mode**, because overstating it would be the same
dishonesty this repository fences: this is a **flaky false red**, not a false green.
The gate fails rather than passing. But it fails on a verdict that was computed
correctly and then thrown away, and the larger the evidence payload the likelier it
is — which means it gets worse exactly as the check gets more useful. The fixed
exemplar is in the tree: `src/lib/request-exit.js`, written after this identical
defect made Gate 3 un-passable for every plan.

## Implementation Details

### File: `src/lib/app-runner.js`
**Action:** MODIFY — the `--drive` child's two exits
**Purpose:** State the exit status; let Node drain the pipe.

- `require('./request-exit')` and replace both `process.exit(0)` calls with
  `requestExit(0)` followed by a return from the handler, per that module's
  documented contract — it sets `process.exitCode` and returns, and Node exits once
  stdout has flushed.
- Add a comment at the site naming why: the verdict is printed **last**, so it is
  exactly what a discarded buffer loses.
- **Nothing else in this file changes.** Not the ladder, not the producers, not the
  reasons, not the declaration reader, not the timeout constants, not the retention
  bound, not the substring-on-the-stream matching.

### File: `tests/last-mile-drives-entry-point.test.js`
**Action:** MODIFY — add two groups
**Purpose:** Pin the ladder's answer, and prove the verdict survives its own pipe.

**Group — the ladder is one ladder.**

| # | Case | Assertion |
|---|---|---|
| 1 | the declaration outranks a library shape | a fixture that is library-shaped **and** declares an entry point reaches the driver; the result is not an opt-out |
| 2 | the declaration outranks a registry-detected target | same, for a fixture the capability registry would classify | not an opt-out |
| 3 | the declaration outranks a malformed-free unknown shape | same, for an unshaped fixture | not an opt-out |
| 4 | **the two functions agree** | for each of the three fixtures above plus an undeclared one, `driveApp` and `driveAppSync` produce the same `applicable` and the same producer identity — the async and synchronous ladders cannot drift |
| 5 | each opt-out is identifiable | the three producers emit reasons distinguishable from one another; each names the settings key or, for the malformed case, the specific defect |
| 6 | the malformed declaration is not degraded to "none declared" | a fixture with `entry_point: {}` produces the malformed reason, never the no-runtime reason |
| 7 | **the documented block is still valid** | the JSON fenced in `CLAUDE.md` is located, parsed, and accepted by `readDeclaredEntryPoint` against a fixture. If the block cannot be found or cannot be parsed, the case **FAILS LOUDLY** naming what it looked for — it never passes on a document it could not read |
| 8 | this repository is honestly undeclared | `readDeclaredEntryPoint(repoRoot)` returns no declaration and no reason — the recorded, deliberate state, so that turning the switch on later is a visible change to this case rather than a silent one |

**Group — the verdict survives the pipe.**

| # | Case | Assertion |
|---|---|---|
| 9 | **a large verdict is delivered whole** | drive a fixture whose evidence payload is comfortably larger than a pipe buffer through the real `--drive` child, captured through a pipe; the parent parses a complete verdict with no truncation error. This is the case that is red today |
| 10 | the failure path also delivers | the child's `catch` branch, forced by a fixture that makes `driveApp` reject, delivers its complete error verdict |
| 11 | an unparseable verdict is still an error, never a pass | corrupt the child's output deliberately; the parent reports an error and `launched: false` — the fail-closed behaviour is preserved, not traded away |
| 12 | the exit status is unchanged | the child still exits 0 in both branches |

Case 11 matters as much as case 9: the point is to stop losing the verdict, not to
start trusting a verdict that could not be read.

Cross-platform: `path.join`, `os.tmpdir()`, `fs.promises.rm(dir, { recursive: true,
force: true })` in teardown, `shell: false` everywhere, no fixed ports, no
platform-specific command.

### File: `.ctoc/false-green-baseline.json`
**Action:** MODIFY — remove two paid-down entries
**Purpose:** Claim the progress; the fence fails loudly if you do not.

Remove both `exit-with-pending-writes` entries for `src/lib/app-runner.js` from
`findings` and lower `maxFindings` by the amount the scanner actually reports.
**Read the live count from the scanner; do not trust a number written in a plan.**
`tests/false-green-fence.test.js` fails on unclaimed progress, which is the check
that will tell the truth. The `whitelist` structure is **not touched** — `findings`
is debt that may only shrink, `whitelist` is a permanent exemption requiring written
justification, and conflating them is what kills a fence.

### Wiring — the live call sites

| change | live call site | root |
|---|---|---|
| `requestExit` in the `--drive` child | the child is spawned by `driveAppSync:1102-1113` | `src/lib/step-13-verify.js` at Step 14, on every verification |
| the two new groups | the suite | `npm test` |
| the baseline entries | `src/lib/false-green-scan.js` via `tests/false-green-fence.test.js` and the self-check's fence | `npm test`, `node src/scripts/run-self-check.js` |

## What this slice does NOT fix

1. **It does not declare this repository's entry point.** The key stays out of
   `.ctoc/settings.json`. Throwing that switch is a separate, deliberate act by the
   human, and case 8 records today's state so the change is visible when it happens.
2. **It does not make the last-mile check applicable here.** Until the declaration
   is added, this repository still opts out — honestly, with a reason that names the
   key. That is the designed behaviour, not a defect.
3. **It does not change any opt-out reason, producer, or verdict.** Only the
   delivery of the verdict changes.
4. **It does not pay down the other six tracked false-green entries** for this file
   (three silent catches, two unbounded captures, one more silent catch). They are
   different signatures with different fixes; bundling them would make this several
   slices wearing one name.
5. **It does not add browser automation, screenshots, network calls, multi-step
   interaction, a warm-up run, or a retry.** Those are the named non-goals of the
   last-mile check and they stay non-goals — a retry turns a flaky check into a slow
   check that lies.
6. **It does not reconcile the stale evidence artifact** that produced the third
   reported reason. That artifact is historical; nothing reads it.

## Execution Plan (Steps 8-16)

### Step 8: TEST
Add both groups and run ONLY this file before touching `src/`. Cases 9 and 10 must
be **RED**, and their red is the evidence — record the verbatim parse error and the
byte count actually received, because "the verdict was computed and then discarded"
is a claim that needs a measured number behind it. Cases 1-6, 8, 11 and 12 must be
green immediately; their staying green is the guarantee that the ladder and the
fail-closed behaviour were not disturbed. Case 7 must be green, and its non-vacuity
is proven by pointing it at a document with no such block and watching it fail
loudly rather than pass.

### Step 9: PREPARE
Read from disk: `src/lib/app-runner.js:100-200` (the declaration reader and its
constants), `:350-440` (the three opt-out producers), `:1015-1146` (both ladders and
the synchronous facade), `:1170-1215` (the child entry point and the exports);
`src/lib/request-exit.js` in full; `src/lib/step-13-verify.js:130-260` (how the
verdict is consumed and what counts as substantive activity);
`.ctoc/false-green-baseline.json` (locate both entries, read the **live**
`maxFindings`); `.ctoc/settings.json`; and `CLAUDE.md:145-170`. Confirm on disk that
the third reported reason is absent from `src/` — if it is present, this plan's
central finding is wrong and that is a discovery to report, not to work around.
Where the code disagrees with this plan, **the code wins** — record the discrepancy.

### Step 10: IMPLEMENT
One step, files as sub-items.
- `src/lib/app-runner.js` — both child exits through `requestExit`, with the comment.
- `tests/last-mile-drives-entry-point.test.js` — the twelve cases in two groups.
- `.ctoc/false-green-baseline.json` — both entries removed, `maxFindings` lowered to
  the live measured count.

### Step 11: REVIEW
Confirm the ladder, the producers and every reason string are byte-identical to
before. Confirm the child still exits 0 on both branches and that neither handler
continues past its `requestExit`. Confirm the fail-closed parse behaviour at
`:1135-1145` is untouched and still covered by case 11. Confirm no assertion in the
file was weakened, no range widened, no case deleted.

### Step 12: OPTIMIZE
No new subprocess, no new read, no new timer. The change removes an abrupt
termination and adds nothing. Confirm the large-payload case does not materially
lengthen the suite, and that the retention bound on captured output is unchanged.

### Step 13: SECURE
Confirm the verdict written by the child still carries only a byte count and a
matched flag for a declared entry point's output — never the output itself, which
may contain secrets and is written to a Gate-3 evidence artifact on disk. Confirm
the new cases assert on that property rather than on captured output. Confirm
fixtures write only under `os.tmpdir()`, are removed on every exit path including a
failed assertion, and that no fixture command reaches a shell.

### Step 14: VERIFY
Run `node --test` on `tests/last-mile-drives-entry-point.test.js`,
`tests/last-mile-wired.test.js`, `tests/last-mile-integration.test.js`,
`tests/false-green-fence.test.js`, `tests/capability-registry.test.js` and
`tests/verify-evidence-wiring.test.js`. Then the full gated run `npm test`; record
`tests`, `suites`, `pass`, `fail`, the zero-skipped counter and the coverage line
verbatim. The coverage floor must not be lowered. Report the `maxFindings` movement
with its **live measured** value. Lint every changed JavaScript file at
`--max-warnings 0`. No git operations. **Report the last-mile result recorded for
this slice's own verification verbatim** — it will still be an opt-out, and it must
name the settings key. That is the honest outcome, and reporting it is the point.

### Step 15: DOCUMENT
A comment at the child's exits naming the discarded-buffer defect and pointing at
`src/lib/request-exit.js` as the exemplar. A file-header note on the test naming the
settled finding: the three reasons are three producers below **one** decision point,
duplicated across the async and synchronous ladders, and case 4 is what keeps those
two from drifting. Add nothing to `CLAUDE.md` — the documented block there is
already correct and case 7 now guards it.

### Step 16: FINAL-REVIEW
Report the three paths, the Step 8 verbatim red for cases 9 and 10 with the measured
byte counts, the confirmation or refutation of the third reported reason's absence
from `src/`, the verbatim green from Step 14, the live `maxFindings` movement, the
verbatim last-mile result for this slice's own verification, an explicit restatement
of the six things this slice does NOT fix, an explicit restatement that the entry
point was **not** declared and why, and every decision taken under ambiguity.

## Ordering and file conflicts

**`depends_on: 00100-the-plan-checker-reads-a-quoted-word-as-a-declaration`.** This
slice's subject is a verdict whose name is one of the status words that checker
matches on a step line. Without that fix its author is pushed toward the same
rewording that hid the checker's defect in the first place, and a plan that cannot
say what it is about is not a plan.

**`depends_on: 00083-last-mile-drives-the-real-entry-point` — a hard file
conflict.** That plan sits in `review/`, is not yet through Gate 3, and declares
**both** `src/lib/app-runner.js` and `tests/last-mile-drives-entry-point.test.js`.
This slice must not build until it has crossed. Everything above is written against
the post-`00083` state of those files, which is what is on disk today.

**`.ctoc/false-green-baseline.json` is also declared by
`00098-the-coverage-floor-stops-silently-dropping-to-80`**, which is in `review/`.
Its edit is already on disk, so there is no live race — but this is exactly why the
`maxFindings` count is read live at Step 14 rather than taken from any plan.

The concurrently-edited `src/lib/reachability.js` is not involved in this slice.

## Decisions Taken Under Ambiguity

1. **The entry point is NOT declared here.** Turning the check on changes what every
   Step 14 verification does on this repository. That is the human's switch to throw
   in a quiet moment, and doing it as a side effect of a plan about verdict delivery
   would be exactly the kind of quiet decision that is not mine to make.
2. **Case 8 records the undeclared state as an assertion.** Recording today's state
   is not the same as enforcing it: when the human adds the key, that one case turns
   red and names itself, which makes the switch visible rather than silent. A case
   that merely tolerated either state would document nothing.
3. **The failure mode is described as a flaky false RED, not a false green.** The
   parent fails closed on an unparseable verdict, so the gate does not pass on
   nothing. Calling it a false green would overstate the defect, and overstating is
   the same failure of honesty as understating.
4. **Only the two `exit-with-pending-writes` entries are paid down.** The other six
   tracked entries for this file are different signatures needing different fixes.
   Paying down what this slice actually touches keeps the ratchet honest and the
   slice one unit of work.
5. **`requestExit` is used rather than a hand-rolled flush.** The exemplar exists,
   is documented, throws on a bad code rather than coercing it, and was written
   after this identical defect made Gate 3 un-passable. Re-inventing it would be a
   second encoding of one rule.
6. **Case 7 validates the documented block against the real reader, and fails loudly
   when it cannot find it.** A documentation check that silently passes on a
   document it could not read is the ninth instance of this repository's central
   defect class, inside a plan whose whole subject is that class.
7. **The third reported reason is treated as a stale artifact, and the executor is
   asked to confirm that at Step 9.** The search found it only in a plan quoting an
   older evidence file. Recording that as certain without re-confirming against disk
   would be exactly the kind of inherited claim this batch exists to check.
8. **The two ladders are pinned against each other rather than merged.** Merging the
   async and synchronous ladders into one implementation is a larger, riskier change
   than this slice's subject warrants; case 4 makes their drift a test failure,
   which buys the safety without the risk. If the human wants them merged, that is a
   separate slice with its own gate.
9. **EXECUTOR — the large verdict is produced by a declared command containing a
   shell operator.** A verdict only exceeds a pipe buffer if some unbounded field
   carries the weight, and every evidence field is bounded (byte counts, a 500-char
   command-line output slice) EXCEPT the declared command itself, which is echoed
   into `evidence.command` and again into the diagnosis. A command containing `&&`
   is rejected as undrivable BEFORE anything is spawned, so a 120018-byte command
   inflates the verdict to roughly 240KB through real code with no process ever
   receiving a long argument — no operating-system argument-length limit, no
   platform difference, no test double.
10. **EXECUTOR — case 10 (the catch branch) was GREEN at Step 8, and the plan
   predicted red.** The plan is wrong on this detail. The catch branch's payload is
   a fixed sentence plus `e.message`, and Node truncates an inspected value in an
   argument-type error to 25 characters, so that payload cannot be made to exceed a
   pipe buffer through any real input. The case is kept — it pins the branch, its
   verdict delivery and its exit status — but it was never red and is reported as
   such rather than dressed up.
11. **EXECUTOR — case 11 (fail-closed) is forced with an invalid `NODE_OPTIONS`
   rather than a corrupted stream.** The parse site is internal to `driveAppSync`
   and its input comes from a child this module spawns itself, so there is no seam
   to inject corrupt output through without a test double. Setting an unknown Node
   flag for the duration of one call makes the real child fail to start, so the
   parent genuinely sees no parseable verdict — the same state a truncated one
   produced. The environment variable is restored in a `finally`.
12. **EXECUTOR — case 9's size guard measures the DECLARATION, not the response.**
   The first draft asserted the RECEIVED payload exceeded 64KB, which is incoherent:
   the received payload is the thing under test, so a truncated read would have
   excused itself by looking small. It now measures the declared command, whose
   length is known before the child runs.
13. **EXECUTOR — `maxFindings` lowered 213 → 211, measured live.** `scanFalseGreen`
   reports 211 findings after the fix, and both
   `src/lib/app-runner.js:exit-with-pending-writes:<module>` entries are gone from
   the live scan. The number in this plan was not trusted. The `whitelist` structure
   was not touched and no entry was added to it.
14. **EXECUTOR — the entry point was NOT declared, confirming the plan.** Left off
   deliberately; ladder case 8 records the undeclared state so throwing the switch
   turns exactly one case red and names itself.
15. **EXECUTOR — the plan's central finding is CONFIRMED against disk.** The third
   reported opt-out reason ("build and test project, launching is out of scope")
   does not occur anywhere in `src/`. Both ladders read the declaration first, above
   all three producers.
