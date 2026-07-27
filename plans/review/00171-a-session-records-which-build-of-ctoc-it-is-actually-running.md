---
approved_by: human
approved_at: 2026-07-20T10:17:33.167Z
gate_crossed: implementation → todo
---

---
title: "A session records which build of CTOC it is actually running"
type: implementation
parent_plan: ctoc-background-engine-rebuild
depends_on: 00170-the-edit-protection-says-out-loud-when-it-has-stopped-running
priority: HIGH
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/hooks/PostToolUse.status-check.js"
  - "tests/a-session-records-the-build-it-loaded.test.js"
  - "src/lib/enforcement-liveness.js"
---

# A session records which build of CTOC it is actually running

> **PROVENANCE.** This slice is the second half of the finding recorded in
> `00170`: CTOC's edit-protection hooks did not run in a session, and nothing
> noticed. `00170` makes the silence loud using evidence that already exists on
> disk. **This slice adds the one piece of evidence that does not exist yet**, and
> it is the piece that separates the two possible causes. It depends on `00170`
> because it extends that plan's module; it must not be built first.

## What `00170` cannot tell the human, and this can

`00170` compares two observables — the last recorded enforcement decision, and the
last edit to a file an active plan declares — and reports honestly when edits are
happening that no hook recorded. That is a true and useful verdict, and it stops
short of the question the human will immediately ask: **is the hook system dead for
this session, or is it alive and the enforcement hook specifically not recording?**

Those need different responses, and today nothing distinguishes them:

| the hook system | the enforcement hook | what the human should do |
|---|---|---|
| not running for this session | necessarily silent | restart the session — the whole configuration is stale |
| running | not recording | a restart may not help; this is a defect to report, not a stale session |

The enforcement log alone cannot separate these, because in both cases it is
equally silent. **A second, independent beacon can**, and there is a hook already
positioned to be one.

## The beacon, and why it is this hook

`.claude-plugin/hooks.json:9-18` wires `src/hooks/PostToolUse.status-check.js` on
the `PostToolUse` matcher `*`. Reading the file confirms three properties, all of
which matter and none of which is true of the alternatives:

1. **It runs after every tool call**, not only edits — so it beacons on `Read`,
   `Bash`, `Grep`, everything. It cannot be starved by a session that happens not to
   be editing.
2. **It is not in any deny path.** It is `PostToolUse`; it cannot block, allow, or
   change any decision. A bug added here can waste time; it cannot forge a
   permission or drop a gate. Every other candidate — `PreToolUse.Edit.js`,
   `human-gate-check.js` on the `*` PreToolUse matcher — sits in the deny path,
   where the project's own rule is that changes need explicit human approval.
3. **It already fails open by construction** (`main()` wraps everything in a
   `try`/`catch` that swallows and exits 0), so the beacon inherits a shape that
   cannot break a tool call.

### The fact this rests on, verified rather than assumed

`src/lib/version.js:23-47`:

```js
function getPluginRoot() {
  let dir = __dirname;
  for (let i = 0; i < 5; i++) {
    if (safeFs.existsSync(path.join(dir, 'VERSION'))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}
function getVersion() { /* reads VERSION from getPluginRoot() */ }
```

It resolves from `__dirname` — **the directory of the file that is executing.** So a
hook running out of the installed plugin cache reports the installed build's
version, and a hook running out of a development checkout reports the checkout's.
**A hook can therefore honestly stamp which build ran it**, which is the whole
mechanism. This was checked because everything downstream depends on it.

## The irony, stated correctly

The suggestion handed to planning was that the session-start hook could answer this
directly, with the caveat that the session-start hook may itself be stale and is
therefore the wrong instrument.

**That caveat is wrong, and building on it would have been building on a mistake.**
A stale hook recording a stale version is not a broken instrument; it is *exactly
the reading wanted*. Whatever build the harness loaded at session start IS this
session's build, by definition, and a hook from that build recording its own version
is a faithful record of it. Staleness is what the instrument measures, not what
disqualifies it.

The real disqualifiers are different, and two of the three are fundamental:

1. **There is no trustworthy reference to compare the stamp against.** Detecting
   staleness requires the *installed* version. Inside a development checkout,
   `getVersion()` in a menu process returns the repository's `VERSION` — `6.12.98`
   as read today — while the installed plugin is `6.12.97`. Those differ
   legitimately and permanently while anyone is developing, so a naive comparison
   raises a false alarm on every developer's machine every day. Locating the
   installed plugin requires walking the Claude plugin cache layout, which planning
   has **not verified from inside this repository and refuses to hardcode.**
2. **The retro-fit gap.** The stamp exists only in builds that ship it. Every
   session running when this lands writes none, so an absent stamp means *the
   session predates the feature*, or *the hook did not run*, or *the feature broke*
   — three causes behind one absence, for an unbounded period. It must read as
   "cannot tell", never as healthy.
3. `src/hooks/SessionStart.js` is declared by an active plan (`00067`), so the
   session-start hook is not available to edit today. Scheduling, not design.

**This slice therefore ships the half that is sound and refuses the half that is
not.** The beacon records *what ran and when*. It does **not** compare against an
installed version, because planning cannot verify where to read one. Point 1 above
is the open question, and it is the human's to schedule — see "What this does NOT
fix".

## Implementation Details

### Dependency graph

```
src/hooks/PostToolUse.status-check.js  (MODIFY)
  ├─requires→ src/lib/safe-fs.js       [existing, already required]
  ├─requires→ src/lib/version.js       [existing, unchanged — getVersion()]
  └─requires→ path                     [node builtin, already required]

src/lib/enforcement-liveness.js  (MODIFY — from 00170)
  └─reads→ .ctoc/state/hook-beacon.json     [the artifact, no new module edge]
```

No cycle: `version.js` requires `safe-fs`, `path`, `https` and `crypto`, none of
which reaches a hook. Step 11 verifies by reading the require graph.

### File: `src/hooks/PostToolUse.status-check.js`
**Action:** MODIFY — add the beacon write; change nothing that exists

The beacon is one synchronous write of a tiny fixed-shape record to
`.ctoc/state/hook-beacon.json`:

```
{ "version": "<the build actually executing>", "at": "<ISO-8601>", "pid": <n> }
```

It **overwrites** rather than appends. This is a liveness beacon, not a log: only
the most recent one carries information, and an append-only beacon on every tool
call would grow without bound for no benefit. `enforcement.json` remains the
append-only decision record; these are different artifacts with different jobs and
must not be merged.

Three properties the write must have, each for a stated reason:

- **Synchronous** (`safeFs.writeFileSync`). The file ends with `process.exit(0)`,
  and `process.exit` discards pending asynchronous writes — a defect class this
  repository has already been bitten by and fences by name. An asynchronous beacon
  would be lost precisely often enough to look like an outage.
- **Guarded independently** of the existing body, in its own `try`/`catch`, so a
  beacon fault cannot suppress the pending-agent or quality-gate output that already
  runs here. It must be strictly additive.
- **First**, before `findPendingAgents()`. That function walks `plans/` and can
  throw or be slow; the beacon's whole purpose is to record that the hook ran, so it
  must not sit behind work that can fail.

**One structural change is required and is not cosmetic.** The file today calls
`main()` unguarded at the bottom and has no `module.exports`, so it cannot be
imported without executing. Add the standard `require.main === module` guard and
export the beacon function, matching the convention already used in
`src/hooks/PreToolUse.Edit.js:510`. Without it the beacon can only be tested by
spawning a subprocess, and a hook whose behaviour is only reachable through a
subprocess is a hook nobody writes edge-case tests for. **This changes no
behaviour when the file is run as a hook** — verify that explicitly at Step 11.

Also record at Step 11, and do **not** fix here: the trailing `process.exit(0)` with
`console.log` output pending above it is the `exit-with-pending-writes` signature
this repository fences. It is pre-existing, it is outside this slice's finding, and
the beacon deliberately sidesteps it by writing synchronously. Report it; the human
schedules it.

### File: `src/lib/enforcement-liveness.js`
**Action:** MODIFY — read the beacon as a third source; change no existing verdict

`00170` ships this module with `sources` reporting `log` and `edits`. Add `beacon`,
reported with the same independence: `'fresh' | 'stale' | 'absent' | 'unreadable'`.

**`'absent'` is the state that carries all the subtlety and must not collapse into
`'stale'`.** For an unbounded period after this lands, every running session will
have no beacon, because the beacon did not exist when those sessions started. An
absent beacon therefore means *the session predates this feature*, or *the hook
system is not running*, or *the beacon broke*, and it cannot distinguish them.

The verdict mapping, which is the point of the slice:

| beacon | `00170`'s two observables | what the human is told |
|---|---|---|
| fresh | disagree (edits unrecorded) | "CTOC's hooks are running, but edits are not being checked" — a defect to report; a restart may not help |
| stale or absent | disagree | "CTOC's hooks do not appear to be running in this session" — restart, as `00170` already advises |
| fresh | agree | active; the calm line |
| unreadable | anything | the existing "cannot tell" text, naming the beacon as the unreadable instrument |

**Every existing verdict from `00170` is preserved.** The beacon refines the WORDS
in the `not-recording` case and adds no new state. Specifically: an absent beacon
must never downgrade a `not-recording` verdict that `00170` would have reported at
high confidence — a missing new instrument cannot be allowed to silence a working
old one. That is the regression this slice must not introduce, and case 9 below is
the test for it.

**Freshness of the beacon is the one place a duration is defensible, and it is still
avoided.** A beacon is written on *every tool call*, so any session doing anything at
all rewrites it continuously. Rather than a duration, compare the beacon's time
against the same edit witness `00170` already computes: **a beacon older than the
newest unrecorded edit is stale**, because a tool call that changed a file must have
produced a beacon. Same two-observable discipline, same `GRANULARITY_MS` allowance,
no new constant.

### File: `tests/a-session-records-the-build-it-loaded.test.js`
**Action:** CREATE
**Framework:** `node:test`, real `os.tmpdir()` fixtures, `path.join` throughout,
recursive-force cleanup in `finally`. Beacon fixtures are minted by calling the
exported beacon function against a fixture root, never by hand-writing the JSON.
Times are set with `fs.utimesSync` and an injected `opts.now`; no test sleeps.

| # | Case | Assertion |
|---|---|---|
| 1 | **the beacon records the executing build** | after the beacon runs, `.ctoc/state/hook-beacon.json` holds `version === getVersion()`, a parseable ISO time, and a numeric pid |
| 2 | **it overwrites, never grows** | run it three times; the file holds exactly one record and the newest time |
| 3 | **it is written synchronously** | the file is readable immediately on return, with no await and no timer |
| 4 | **a beacon fault cannot break the hook** | make `.ctoc/state/` unwritable; the existing pending-agent output is still produced and the process still exits 0 |
| 5 | **importing the module runs nothing** | requiring the hook file writes no beacon and produces no output — the `require.main` guard |
| 6 | **fresh beacon + unrecorded edits → hooks alive, enforcement not recording** | the description says the hooks are running and does NOT advise a restart |
| 7 | **stale beacon + unrecorded edits → hooks not running** | the description advises restarting, matching `00170`'s wording |
| 8 | **THE FENCE — an absent beacon is `'absent'`, never `'stale'`** | no beacon file at all → `sources.beacon === 'absent'`; the text says the session may predate the feature and does not assert the hooks are dead |
| 9 | **an absent beacon NEVER downgrades `00170`'s verdict** | `00170`'s case 1 fixture, with no beacon → still `not-recording` at `high` confidence with restart advice. The regression guard |
| 10 | **an unreadable beacon is `'unreadable'`, never `'fresh'`** | beacon replaced by a directory, and beacon holding `{not json` → `unreadable`; the verdict is never healthier for it |
| 11 | **a beacon from a DIFFERENT build is still fresh** | the beacon's `version` is recorded and reported but does not affect freshness — **this slice draws no conclusion from a version mismatch** |
| 12 | **never throws** | fixture root that is a file, `''`, `null` → `sources.beacon === 'unreadable'`; no throw |
| 13 | **the fence is not vacuous** | case 8's assertion applied to case 1's fixture FAILS |

Cases 8, 9 and 11 are the plan. Case 11 pins the deliberate restraint: the version
is recorded now so it is available later, and **nothing is concluded from it in this
slice.**

### Wiring — the live call sites

| change | live call site | root |
|---|---|---|
| the beacon write | `main()` in `PostToolUse.status-check.js` | the `PostToolUse` `*` matcher in `.claude-plugin/hooks.json` — every tool call |
| the `beacon` source | `protectionLiveness` in `enforcement-liveness.js` | `src/areas/system.js` render → `/ctoc:menu` System screen (wired by `00170`) |
| the test file | the suite | `npm test` |

Nothing here is reachable only from a test. The beacon's own root is the hook
manifest — which is, with full awareness of the irony, **the same manifest whose
possible staleness is the thing being investigated.** That is not a flaw in the
design: a beacon that does not fire is itself the reading, and case 8 is precisely
the state that says so honestly instead of guessing.

## What this does NOT fix

1. **It does not make the hooks run.** Same headline as `00170`. If the hook system
   is not running, the beacon is not written either — and the absence is the signal.
2. **It does not detect a stale session directly.** Recording the build is half the
   mechanism; comparing it against the *installed* build is the other half, and
   planning could not verify where the installed version can be read from without
   hardcoding a plugin cache layout. **This is the open question this slice
   deliberately leaves open**, and it is named for the human to schedule.
3. **It cannot answer for sessions that predate it.** For an unbounded period after
   release, every running session has no beacon. Case 8 makes that read as "cannot
   tell", which is honest and is also unhelpful — the limitation is real.
4. **It does not prove the ENFORCEMENT hook runs.** A fresh beacon proves the
   `PostToolUse` `*` matcher fired. Those are separate manifest entries; they
   plausibly go stale together and that is an inference, not a measurement. The
   wording says "CTOC's hooks are running", never "enforcement is running".
5. **It does not warn proactively.** The verdict still appears only when a human
   opens the System screen.
6. **It does not fix the pre-existing `process.exit(0)`-with-pending-writes shape**
   in the host file. Reported at Step 11, not repaired here.

## Execution Plan (Steps 8-16)

### Step 8: TEST

Write `tests/a-session-records-the-build-it-loaded.test.js` in full and run **only
that file, before touching `src/`**. Record the starting state verbatim. Cases 1-5
must be RED because the beacon does not exist; cases 6-12 must be RED because
`sources.beacon` does not exist. **Case 9 must be GREEN from the start** — it
asserts `00170`'s behaviour is unchanged, so a red case 9 means `00170` is not in
place and this slice must not proceed. Report which state case 9 started in; it is
the dependency check.

### Step 9: PREPARE

Read from disk, in full, and let the code win over this plan where they differ:

- `src/hooks/PostToolUse.status-check.js` — the whole file, especially `main()`'s
  `try`/`catch` and the trailing `process.exit(0)`.
- `src/hooks/PreToolUse.Edit.js:500-512` — the `require.main === module` convention
  to mirror exactly.
- `src/lib/version.js:23-47` — **re-confirm `getPluginRoot()` still resolves from
  `__dirname`.** The whole mechanism rests on it.
- `src/lib/enforcement-liveness.js` as `00170` actually shipped it — the real
  `sources` shape and the real `describeProtection` return, not this plan's summary.
- `.claude-plugin/hooks.json` — confirm the `PostToolUse` `*` matcher still wires
  this file. **If it does not, STOP: the beacon would have no root and would be dead
  code from birth.**

Then measure and **report before writing code**:

1. Does `.ctoc/state/hook-beacon.json` exist? It must not; planning expects absent.
2. What does `getVersion()` return when run from this checkout, and what version is
   the installed plugin? Planning read `6.12.98` in the tree and `6.12.97` installed.
   **This gap is the reason no version comparison is built** — confirm it is still
   real.
3. Re-run `00170`'s Step 9 measurement 3 (declared files changed after the last
   recorded decision) so the two slices are measured against the same moment.

### Step 10: IMPLEMENT

One step, files as sub-items.

- `src/hooks/PostToolUse.status-check.js` — the beacon write, synchronous,
  independently guarded, first in `main()`; the `require.main === module` guard and
  a `module.exports` carrying the beacon function. Nothing existing changes.
- `src/lib/enforcement-liveness.js` — the `beacon` source with four states; the
  refined wording for `not-recording`; **no new state, no changed verdict**.
- `tests/a-session-records-the-build-it-loaded.test.js` — the thirteen cases.

### Step 11: REVIEW

Confirm the beacon is strictly additive: read the diff and confirm no existing line
of `main()` changed behaviour, that the pending-agent output and the quality-gate
check still run in the same order, and that adding the `require.main` guard did not
stop the file executing when run directly (**drive it as a subprocess and see the
beacon appear** — this is the one place where the guard could silently disarm the
hook, and reasoning about it is not sufficient).

Confirm `00170`'s verdicts are unchanged for every fixture it shipped. Confirm no
duration constant was added — the beacon's freshness reuses `00170`'s
`GRANULARITY_MS` and its edit witness. **Confirm by reading the require graph that
no cycle exists.**

Report the pre-existing `process.exit(0)`-with-pending-`console.log` shape in the
host file against the false-green baseline, and whether it is already recorded there.
Do not fix it.

### Step 12: OPTIMIZE

This runs on **every tool call**, so cost is not a formality. The beacon must be one
small synchronous write and nothing else — no directory scan, no glob, no read, no
`JSON.parse` of anything. Confirm the state directory is created at most once
(`existsSync` then `mkdirSync`, matching `enforcement-log.js:42-43`). **Measure and
report the added wall time per tool call**; if it is not comfortably under a
millisecond, say so rather than shipping a tax on every action.

### Step 13: SECURE

- The beacon records a version string, a timestamp and a pid. **Confirm no
  environment variable, no tool input, no file path and no user content reaches it**
  — a file written on every tool call is the worst possible place for anything
  sensitive to land.
- Confirm the version string is validated before being written and before being
  rendered: a `VERSION` file containing a newline, a terminal escape or 10,000
  characters must not reach the human's screen through the System line. Bound and
  sanitize at the render, per `00170`'s Step 13.
- Confirm the beacon writes only under the resolved project's `.ctoc/state/`, and
  that a `root` containing `..`, a NUL, or a symbolic link out of the tree cannot
  redirect it.
- Confirm the beacon file is written with ordinary permissions and never contains a
  path outside the repository.
- Confirm every fault path returns rather than throws: unwritable state directory,
  `.ctoc` that is a file, a full disk simulated by a write failure.

### Step 14: VERIFY

Targeted run first: the new test file, plus `00170`'s test file (unchanged and still
green — this is the regression gate), `tests/hooks.test.js`,
`tests/architecture-invariants.test.js`, `tests/export-reachability.test.js`,
`tests/false-green-fence.test.js`, `tests/doc-counts.test.js`,
`tests/readme-numbers.test.js`.

Then the full gated run `npm test`; record `tests`, `suites`, `pass`, `fail`, the
zero-skipped counter and the coverage line **verbatim**. The floor must not be
lowered. Lint every changed JavaScript file at `--max-warnings 0`.

Then prove it **the way a human would**: open the System screen and read the
protection line. **Report which of the four wordings appeared and why**, and state
plainly whether a beacon exists at that moment. If none does — the expected result
in a session that predates this build — that is a **PASS**: it is case 8's honest
"cannot tell", produced by the real system rather than a fixture. **No git
operations.**

### Step 15: DOCUMENT

A file header comment on the beacon function recording: what it is for (proving the
hook system ran, separately from the enforcement decision record); why it overwrites
rather than appends; why it is synchronous (`process.exit` discards pending writes);
and **why no version COMPARISON is performed** — naming the missing trustworthy
installed-version reference, so the next person does not add a comparison against
the repository's own `VERSION` and ship a false alarm to every developer.

A comment at the `beacon` source in `enforcement-liveness.js` recording why
`'absent'` and `'stale'` must stay distinct, and that an absent beacon may never
downgrade a `not-recording` verdict.

### Step 16: FINAL-REVIEW

Report, in this order:

1. Whether case 9 started GREEN — the `00170` dependency check.
2. The Step 9 measurements, the version gap (`6.12.98` in tree against `6.12.97`
   installed, or whatever is true then) first, since it is the reason no comparison
   is built.
3. The Step 12 measured per-tool-call cost.
4. The Step 14 System line, verbatim, and which of the four wordings it was.
5. The subprocess proof from Step 11 that the `require.main` guard did not disarm
   the hook.
6. The six things this does NOT fix, "it does not detect a stale session directly"
   named as the open question the human must schedule.
7. Every decision taken under ambiguity.

## File conflicts — checked before declaring anything

| file | status |
|---|---|
| `src/hooks/PostToolUse.status-check.js` | **unclaimed** by any plan in `todo`, `implementation` or `in-progress` |
| `src/lib/enforcement-liveness.js` | created by `00170`, this slice's declared dependency — they never build concurrently |
| `src/hooks/SessionStart.js` | declared by `00067` — **not used**, which is why the beacon lives in `PostToolUse` |
| `src/hooks/human-gate-check.js` | unclaimed, but **deliberately not used**: it is in the deny path |
| `src/hooks/PreToolUse.Edit.js` | declared by `00142`, `00129`, `00069`, `00072` |
| `src/lib/enforcement-log.js` | declared by `00069` — the beacon is a separate artifact, not a new log field |
| `src/lib/version.js` | required, **not modified** |

**If Step 9 finds `src/hooks/PostToolUse.status-check.js` has since been claimed,
STOP and ask** rather than editing a file two plans claim.

## Decisions Taken Under Ambiguity

1. **The beacon lives in the `PostToolUse` `*` hook, not in a `PreToolUse` hook or
   session start.** It fires on every tool call rather than only edits, it is
   outside every deny path so a bug cannot forge a permission or drop a gate, and it
   is unclaimed. `human-gate-check.js` is also on a `*` matcher and also unclaimed,
   and was rejected precisely because it *is* in the deny path, where this project
   requires explicit human approval for changes.
2. **No version COMPARISON is built, and that restraint is the main judgement in
   this slice.** Detecting staleness needs the installed version; inside a
   development checkout the repository's `VERSION` is legitimately ahead of it
   (`6.12.98` against `6.12.97` today), so comparing against it would raise a false
   alarm on every developer's machine every day. Finding the real installed version
   means walking a plugin cache layout planning has not verified. The version is
   **recorded now so it is available when that reference is established**, and case
   11 pins that nothing is concluded from it yet.
3. **The stated reason for distrusting a session-start stamp does not hold, and the
   record says so.** A stale hook recording a stale version is the measurement, not
   a flaw in it. The instrument is deferred for three different reasons; leaving the
   wrong reason in the record would let someone build on a mistaken argument.
4. **`'absent'` and `'stale'` are separate beacon states.** Every session running
   when this lands has no beacon, so folding absence into staleness would report
   "your hooks are dead" to a large population of sessions whose hooks are fine.
   Case 8 is that fence.
5. **An absent beacon may NEVER downgrade `00170`'s verdict.** A missing new
   instrument silencing a working old one is this defect class reproducing itself
   inside its own fix. Case 9 is the regression guard and it is expected green from
   the first run.
6. **The beacon overwrites rather than appends.** Only the most recent record
   carries information, and an append on every tool call would grow without bound.
   The append-only decision log is a different artifact with a different job; merging
   them would make both worse.
7. **The write is synchronous.** The host file ends in `process.exit(0)`, which
   discards pending asynchronous writes — a defect class this repository fences by
   name. An asynchronous beacon would be lost often enough to look like an outage,
   which is the false alarm this whole programme exists to avoid.
8. **The `require.main === module` guard is added, and that is a real change to a
   hook file rather than a tidy-up.** Without it the beacon is only reachable by
   spawning a subprocess, and behaviour only reachable that way does not get
   edge-case tests. Step 11 drives the file as a subprocess specifically to prove
   the guard did not disarm the hook, because that is the one way this change could
   silently do harm.
9. **Beacon freshness reuses `00170`'s edit witness rather than a duration.** A
   beacon is written on every tool call, so "older than the newest unrecorded edit"
   is a complete definition of stale, with no new constant. The same reasoning that
   kept a duration out of `00170` keeps one out of here.
10. **The wording says "CTOC's hooks are running", never "enforcement is
    running".** A fresh beacon proves the `PostToolUse` `*` matcher fired. That the
    `PreToolUse` `Edit` matcher goes stale with it is an inference from them sharing
    a manifest, not a measurement, and the human-facing text must not overclaim.
11. **The pre-existing `process.exit(0)`-with-pending-writes shape in the host file
    is reported and NOT fixed.** It is outside this slice's finding, the beacon
    sidesteps it by writing synchronously, and repairing it would widen a hook change
    beyond what was measured. The human schedules it.

### Added during implementation (Steps 10–14)

12. **Beacon freshness compares the beacon FILE's modification time, not the JSON
    `at` field.** The file mtime is filesystem truth about when the hook last wrote,
    it needs no trust in the record's contents, and it is the exact measure
    `countUnrecorded` already uses for edits — an apples-to-apples comparison against
    the same `GRANULARITY_MS`. The `at`/`version`/`pid` fields are still recorded for
    the human and for a future check; freshness simply does not depend on parsing
    them. This also makes the freshness testable with `fs.utimesSync` and no sleep,
    exactly as the plan's Step 8 mandates.
13. **`writeBeacon` self-guards (fail-open inside the function); `main()` calls it
    bare.** The plan asked for "its own try/catch"; putting that guard INSIDE
    `writeBeacon` keeps `main()`'s single pre-existing catch key stable in the
    false-green scanner. A guard added AT the call site created a second catch in
    `main()`, which the signature scanner disambiguates as `main` + `main#2` and
    re-keys the ORIGINAL catch — a spurious "new" finding on unchanged code. The
    self-guard yields exactly one clean new key attributable to genuinely new code.
14. **The beacon's fail-open catch is recorded in the false-green WHITELIST, and
    `maxFindings` rises 209 → 210. The plan did not anticipate this.** An honest
    fail-open beacon write must swallow its fault (a PostToolUse hook may never block
    a tool call), and an honest swallow is a comment-only catch, which the scanner
    flags. Faking a statement to dodge the scanner would be gaming the fence and is
    forbidden. The sanctioned mechanism is a whitelist entry with a written
    justification (the whitelist is "a PERMANENT exemption for a construct that is
    genuinely correct"); `.ctoc/*` is edit-whitelisted and this is a data/baseline
    file, not core logic. Reported to the human as a deviation the plan did not foresee.
15. **Case 4 forces the write fault by making `.ctoc/state` a FILE (ENOTDIR), not by
    `chmod`.** A permission-based fault no-ops as root and on Windows; a stat-shape
    fault throws on every platform, so the "a beacon fault cannot break the hook"
    assertion runs everywhere the suite runs, per the repository's loud-skip rule.
16. **Case 11 rewrites ONLY the `version` field of a minted beacon** to a build that
    is not this one. The exported function cannot mint a foreign version (it always
    records `getVersion()` of the executing build), and the whole point of the case is
    that a version MISMATCH changes nothing — so a minimal content edit of one field
    on an otherwise function-minted record is the honest way to pin that restraint.
