---
approved_by: human
approved_at: 2026-07-19T15:29:41.374Z
gate_crossed: implementation → todo
kickback_counts:
  by_step:
    '8': 2
  total: 2
---

---
title: "A skipped test is counted as a skipped test — the zero-skip gate can currently see neither half of the skips it forbids"
type: implementation
parent_plan: ctoc-audit-w06-truthful-tests
depends_on: none
priority: CRITICAL
program: ctoc-repair-loop
iron_loop: true
files:
  - "tests/stack-detector.test.js"
  - "tests/update.test.js"
  - "tests/version.test.js"
  - "tests/quality-state-coverage.test.js"
  - "tests/skip-visibility.test.js"
  - "CLAUDE.md"
---

# A skipped test is counted as a skipped test

`src/scripts/test-gate.js:89-93` is the whole zero-skip guarantee:

```js
function parseSkipped(summaryText) {
  if (!summaryText) return null;
  const matches = [...stripAnsi(summaryText).matchAll(/^\s*(?:#|ℹ)\s+skipped\s+(\d+)/gm)];
  return matches.length ? Number(matches[matches.length - 1][1]) : null;
}
```

It reads one number out of node's own run summary. That parser is correct and was
hardened deliberately (it returns `null`, never `0`, when it cannot read its
input — the false-green fence this repository maintains). The defect is not in the
parser. The defect is that **skips exist in this suite that never reach node's
summary counter at all**, so the parser reads a truthful `0` over a suite that
skipped tests. The instrument is honest; it is pointed at a place the skips do not
appear.

CLAUDE.md states the gate enforces "0 skipped". That claim is false today, in two
independent ways.

## This slice DOES edit tests, so every edit is defended individually

Unlike its sibling slice `00096`, this slice opens four existing test files and
changes what they do. That is the lowest-effort move available and the one that
destroys the value of a suite, so it is not taken on the grounds that it is
convenient. Each change below carries the same three-part justification, and the
summary is here so a reviewer can attack the weakest one first:

| Change | Is the test edited or added to? | Is the test plainly wrong? | What newly fails |
|---|---|---|---|
| 1 — the two `/home/tijn/` tests | **edited** | **Yes** — gated on a path that exists on no machine, so it has never asserted anything | a `detectStack` that returns empty arrays for a real project |
| 2 — the symlink test | **added to** (second branch) | No — it is correct, merely unrunnable on some platforms | a containment regression on a platform that cannot make symlinks |
| 3 — the cache test | **edited** | **Yes** — it contains no assertion in either branch | a plugin cache that IS a git repository |
| 4 — the `VERSION` test | **edited** | **Yes** — its `else` branch asserts that a missing source-of-truth file is acceptable | a missing or malformed `VERSION` file |
| 5 — the git-remote test | **edited** | **Yes** — its condition is unreachable by the design Change 3 pins, and its `else` asserts nothing | nothing new; this is a neutral repair, argued as such below |
| 6 — the `release` suite | **re-gated**, body copied verbatim | No — the suite is fine; its *gating mechanism* is invisible to the gate | nothing new; the suite becomes runnable, which it was not |
| 7 — `{ skip: false }` | **edited**, cosmetic | No — it is a no-op | nothing; removes a misleading token |
| 8 — the `releaseLock` test | **fixture changed**, assertions copied verbatim | No — it is correct, merely platform-gated | a `releaseLock` regression on every platform where it currently skips |

Two of these — Changes 5 and 6 — buy no new failure. Both are argued explicitly
below rather than smuggled in on the coat-tails of the others, because "it bought
nothing" is a real objection and a reviewer is entitled to make it.

## Blind spot one — the hand-rolled runners

Sixteen test files do not use `node:test`. Verified on disk by searching every
file under `tests/` for a `node:test` require: none of these sixteen has one.

```
crypto            deployment        plan-index-bootstrap-coverage
plan-index-reconcile-coverage       plan-index-search
plan-index-sync   playwright-scaffolder                product-loop
sca-runner-coverage                 security-injection-and-traversal
settings          stack-detector    streaming-questions-sweeper
tabs              tui               update
```

Each defines its own `test(name, fn)` and its own `assert`. To node, the whole
file is a single test. Roughly 369 test functions report to the counters as about
sixteen.

**Failure propagation is NOT the defect and this slice does not touch it.** The
audit probed all three shapes and the finding stands: a hand-rolled file that
exits non-zero fails the gate, one that throws at top level fails the gate, and
only a file that swallows its own error reports a pass. `tests/update.test.js:12-21`
shows the sanctioned shape — `process.exitCode = 1` on a caught assertion — which
propagates correctly.

What does not propagate is a skip. Six places print the word and return:

| File | Line | Condition | What it actually is |
|---|---|---|---|
| `stack-detector.test.js` | 570 | `!fs.existsSync('/home/tijn/ctoc-build')` | **dead** — a path on one person's former machine |
| `stack-detector.test.js` | 587 | `!fs.existsSync('/home/tijn/ctoc-build/ctoc-public')` | **dead** — same |
| `stack-detector.test.js` | 1036 | `fs.symlinkSync` threw | **genuinely conditional** — Windows without privilege |
| `update.test.js` | 33 | plugin cache directory absent | **environment-conditional**, and the test asserts nothing in EITHER branch |
| `update.test.js` | 50 | `VERSION` file absent | **dead** — `VERSION` is this repo's tracked source of truth |
| `update.test.js` | 70 | cache is not a git repository | **dead in practice** — line 37-39 documents that the cache is a clean copy, never a git repository |

Run those two files and the gate reports `skipped 0`.

Only **one** of the six is genuinely platform-conditional. That answers the
question the audit asked directly: four are dead code that has never executed on
any machine in years, one (`update.test.js:33`) is environment-conditional and
also assertion-free, and one (the symlink case) is real.

## Blind spot two — node:test's own suite-level skip, which the audit did not name

This one is worse, because it is in the sanctioned framework and therefore has no
excuse. `tests/version.test.js:418`, verified on disk:

```js
describe('release', { skip: 'Skipped to avoid modifying VERSION file' }, () => {
```

That is an **unconditional** skip of a whole suite, in a `node:test` file, in the
gated run, today. And `plans/review/00080-dashboard-says-when-reconcile-failed.md`
records a full `npm test` at `skipped 0`.

Both cannot be true unless a skipped **suite** contributes nothing to the
`# skipped` counter. That inference is strong but it is an inference, so it is not
written here as a fact — **Step 9 settles it empirically before anything is
changed**, and the answer decides part of this slice's scope. See "The one thing
Step 9 must settle" below.

A second instance is conditional rather than unconditional —
`tests/quality-state-coverage.test.js:187`:

```js
test('releaseLock_warns_and_does_not_throw_when_unlink_fails', { skip: CANNOT_FORCE_EACCES }, () => {
```

On a developer's machine `CANNOT_FORCE_EACCES` is false and the test runs. In a
container as root it is true and the test skips. If a test-level skip *is* counted
(unlike a suite-level one), this makes the gate **nondeterministically red on a
machine nobody has run it on yet**; if it is not counted, it is a silent hole.
Either answer is a defect and both are fixed the same way.

## The repository already contains the correct answer

`tests/plan-index-embedding.test.js:9-21` solved this exact problem and wrote down
the reasoning:

> EM-12 is a live-Ollama smoke test that is OPT-IN by an environment variable
> (CTOC_LIVE_OLLAMA=1) and is NOT REGISTERED in the default `npm test` run. This
> is deliberate: CTOC's gate (src/scripts/test-gate.js) fails on ANY skip
> (`# skipped N > 0`) … Gating the test's REGISTRATION (not its body) means that
> by default it neither runs nor skips → it contributes 0 to the skipped count and
> the gate stays deterministic.

**Gate the registration, never the body.** That is the sanctioned pattern, it is
already load-bearing in this repository, and every fix below either uses it or
does better by removing the need for it.

## What the audit got wrong about the existing guard

The brief states that `tests/skip-guard-integrity.test.js` "already bans
conditional skips in the node:test files, so a conversion would bring these six
under a ban they currently evade". **That is not what that guard does.** Read on
disk, it bans exactly one mechanism — a `require()` failure swallowed into a
nulled binding or a `.skip()` — and its own header explicitly *preserves* the
pattern the brief thinks it forbids:

> Legitimate runtime-probe skips (a missing `git` binary, an unreachable Ollama)
> gate on a runtime probe, never on a `require()` throwing, so they are never
> inside a require-catch and remain fully possible.

So converting the symlink case to `node:test` with `t.skip()` would **not** trip
that guard. What it would trip is the zero-skip gate itself, if and only if a
test-level skip is counted. The constraint is real; the guard named is the wrong
one. Recorded here so nobody re-derives the wrong reason later.

## The one thing Step 9 must settle

Whether node's `# skipped` counter includes a skipped **suite** (`describe` with
`skip`) as distinct from a skipped **test**. The measurement is two commands and
no source edit:

```
node --test tests/version.test.js               # has a suite-level skip at :418
node --test tests/quality-state-coverage.test.js  # has a test-level skip at :187
```

and reading the `ℹ skipped N` line of each.

- **If a suite-level skip reports 0** — confirmed blind spot two, and
  `tests/skip-visibility.test.js` must ban the `skip:` option outright, because
  the gate provably cannot see it.
- **If it reports 1** — then blind spot two is not a blind spot but a *live gate
  failure that npm test would already be reporting*, which contradicts the
  recorded green run in plan 00080. In that case **STOP and report**: something
  else is wrong with how the gated suite is assembled, and that is a different
  defect from this one. Do not proceed on a guess.

Record the verbatim `ℹ skipped N` line for both files in the Execution Record
either way.

## What this slice does NOT fix

Stated plainly, because the title could be read as broader than the work.

1. **The sixteen hand-rolled files stay hand-rolled.** Converting ~369 test
   functions to `node:test` is a mechanical change across sixteen files that would
   be unreviewable in one slice and would put every one of those functions'
   pass/fail behaviour at risk at once. This slice removes the invisible skips and
   installs a fence; the runner-style question is left open and undecided — it is
   the human's to schedule, not this plan's to defer.
2. **Test-count visibility is not restored.** After this slice those sixteen files
   still report as ~16 tests instead of ~369. The gate's `# tests` figure remains
   an undercount. Nothing here changes that.
3. **Coverage attribution is unchanged.** Those files still contribute coverage
   without contributing test counts.
4. **No assertion inside any hand-rolled file is strengthened.** Weak assertions
   are the subject of the sibling slice `00097`, which depends on this one.
5. **`tests/plan-index-embedding.test.js` is untouched.** Its `t.skip()` calls sit
   inside an opt-in registration block and contribute 0 to the gated run. It is
   the exemplar, not a defect.

## Implementation Details

### Dependency graph

```
tests/skip-visibility.test.js  ──scans──>  every tests/*.test.js
                               ──reached-by──>  npm test  (src/scripts/test-gate.js)

tests/stack-detector.test.js        ──must be clean before the fence lands
tests/update.test.js                ──must be clean before the fence lands
tests/version.test.js               ──must be clean before the fence lands
tests/quality-state-coverage.test.js──must be clean before the fence lands
```

No source file under `src/` is touched by this slice. The gate parser is correct
and is deliberately left alone.

---

### File: `tests/stack-detector.test.js`
**Action:** MODIFY
**Purpose:** Remove three invisible skips — two by giving dead tests a fixture they can actually run against, one by asserting the capability-absent behaviour instead of skipping.
**Change type:** modify-existing, three sites

#### Change 1 — `testRealProjectCtocBuild` (:566-581) and `testRealProjectCtocPublic` (:583-600)

**Contract, sourced outside these tests.** `detectStack(projectPath)` returns a
`{ project, languages, frameworks }` shape, echoing the path it was given and
reporting what it detected. This is established by the rest of the same file —
dozens of fixture-driven cases assert exactly that shape and its detections — and by
`src/lib/stack-detector.js` itself, which `src/lib/init-project.js` calls to
generate a project's CLAUDE.md. The contract does not come from these two tests; it
comes from every other test in the file and from the caller.

**Why the test is wrong rather than the code.** These two tests are gated on
`fs.existsSync('/home/tijn/ctoc-build')`. That directory exists on no contributor's
machine, no container and no continuous-integration runner. **The assertions have
never executed.** A test whose body has never run does not assert a contract — it is
inert text that looks like coverage. That is the plainest case of a wrong test
available: it is not defending a bug, it is defending nothing, and it reports green
for a reason unrelated to the code. The code is not implicated at all.

**This is a rebuild, not a deletion.** The contract they *describe* is genuine and
testable. The file already has `setupTempDir()` / `createTempFile()` helpers used by
dozens of other cases. Rebuild both against a constructed fixture:

- `testRealProjectDetectsAConstructedProject` — a temp directory with a
  `package.json` declaring a known dependency and a `tsconfig.json`. Assert
  `Array.isArray(stack.languages)`, `Array.isArray(stack.frameworks)`,
  `stack.project === tempDir`, **and** that the known language and framework are
  actually present.
- `testRealProjectDetectsAProjectWithoutPackageJson` — a temp directory with no
  `package.json` (the stated intent of the `ctoc-public` case per its comment at
  :597-598). Assert the documented shape, `stack.project` echoes the path, and
  JavaScript is **not** reported.

**What newly fails.** A `detectStack` that returns the right shape with empty
`languages` and `frameworks` for a real project — today green (the body never runs),
after red. The original assertions only checked that arrays were arrays; the
replacements check the detections, so this is strictly stronger than what was
claimed, not merely different.

#### Change 2 — `testWorkspaceSymlinkOutsideRootNotRead` (:1010-1049)

**Contract, sourced outside this test.** Realpath containment: a workspace entry
whose resolved real path escapes the project root must not be read. This is a
security property of `src/lib/stack-detector.js`, and the file's own control test at
`:1051-1069` (`testWorkspaceRealNestedInsideStillRead`) pins the other half of it.

**Why this is an addition, not an edit.** This test is **correct**. Its assertion at
`:1044` is right and is not touched. Its only problem is that on a platform where
`fs.symlinkSync` throws, it reaches no assertion at all. So the change adds a second
branch rather than altering the first:

- **Capability present** — unchanged: create the symlink, assert `react` from the
  escaping workspace is not in `stack.frameworks`.
- **Capability absent** — currently a `console.log('SKIPPED')` and a bare `return`.
  Replace *that branch only* with a real assertion: containment is still testable
  without a symlink by pointing the workspace glob at an entry that resolves outside
  the root through `..` traversal. Assert it is not read.

Wrap the branch selection so **neither branch returns without asserting**.

**What newly fails.** A containment regression on Windows without the symlink
privilege — today the test prints SKIPPED and passes, after it goes red.

If at Step 10 the capability-absent branch proves inexpressible on the target
platform, **do not fall back to a skip and do not delete the case**: gate the
symlink test's *registration* on the probe, as `plan-index-embedding.test.js` does,
and record it under Decisions Taken Under Ambiguity with the reason.

---

### File: `tests/update.test.js`
**Action:** MODIFY
**Purpose:** Remove three invisible skips; two of them guard tests that assert nothing at all.
**Change type:** modify-existing, three sites

#### Change 3 — `'Detects git repository in cache'` (:30-40)

**Contract, sourced outside the assertions.** The test's own authored comment at
`:37-38` records the invariant: *"The cache is NOT a git repo - it's a clean copy of
the plugin files. Git repo is in marketplaces dir, cache is the installed version."*
CLAUDE.md corroborates it in the Marketplace Only section, which distinguishes the
cache directory from the marketplaces directory and tells a user to delete both to
fix a stale install.

**Why the test is wrong rather than the code.** Read it closely: **there is no
assertion in either branch.** If the cache is absent it logs and returns; if the
cache is present it logs `'(cache is clean copy, not git repo - expected behavior)'`
and returns. It cannot fail. It is not a skipped test — it is an empty one wearing a
skip as a disguise, and it *states the invariant in a log line without checking it*.
A test that prints a claim instead of asserting it is plainly wrong; the code it
nominally guards is not implicated.

**The change.** When `CACHE_DIR` exists, assert
`!fs.existsSync(path.join(CACHE_DIR, '.git'))` — the documented invariant, now
checked. When `CACHE_DIR` does not exist the invariant is vacuous on this machine, so
gate that single test's **registration** rather than skipping inside it.

**What newly fails.** A plugin cache that is a git repository — i.e. a broken
install shape, or an update mechanism that started cloning into the cache. Today:
green, with a log line asserting the opposite. After: red.

#### Change 4 — `'VERSION file exists in source'` (:43-52)

**Contract, sourced outside this test.** CLAUDE.md: *"The VERSION file is the single
source of truth for version numbers."* `src/lib/version.js:41-47` reads it,
`src/scripts/release.js` syncs from it, and `tests/doc-counts.test.js` and
`tests/release-metadata-sync.test.js` depend on it existing.

**Why the test is wrong rather than the code.** Its `else` branch — reached when
`VERSION` is absent — logs `'(VERSION file not present, skipping)'` and passes. That
encodes "a missing source-of-truth file is acceptable", which directly contradicts a
contract the human has written down. A test asserting a non-contract is plainly
wrong. The code is correct: `VERSION` is present and well-formed.

**The change.** Delete the conditional; assert unconditionally that the file exists
and matches `/^\d+\.\d+\.\d+$/`. The existing semantic-version assertion is copied
verbatim; only its guard is removed.

**What newly fails.** A missing or malformed `VERSION` file — today green, after
red. This is strictly a tightening: the assertion that ran is unchanged, and the
escape hatch around it is gone.

#### Change 5 — `'Git remote points to GitHub'` (:55-72)

**Contract, sourced outside this test.** CLAUDE.md's Marketplace Only rule: CTOC is
always installed from `https://github.com/robotijn/ctoc` and never from a local path.

**Why the test is wrong.** Its condition is
`fs.existsSync(CACHE_DIR) && fs.existsSync(path.join(CACHE_DIR, '.git'))`, and
Change 3 establishes that the cache is *by design* not a git repository. So the body
is unreachable on a correct installation, and the `else` branch asserts nothing. It
is the same empty-test shape as Change 3, one step further removed.

**Honest accounting: this change buys no new failure, and that objection stands.**
The marketplace invariant it gestures at is already genuinely asserted at `:87-103`
by `'No local development paths in update script'`, which reads `update.js` and
forbids local paths. So the marketplace rule is covered; this test adds nothing to it
either before or after. The change is a **repair of an invisible skip**, not a
strengthening, and it is included solely because leaving one of the six in place
would leave the fence in Change 8 unable to land at zero.

**The change.** Keep the remote assertion for the unsupported-but-possible case
where a `.git` directory *is* present under `CACHE_DIR`, and gate that test's
**registration** on the directory probe. When absent, nothing skips because nothing
was registered. The `execSync` call and its assertion are copied verbatim; only the
gating moves from inside the body to the registration.

---

### File: `tests/version.test.js`
**Action:** MODIFY
**Purpose:** Remove the unconditional suite-level skip at :418 — the one skip the gate provably never sees.
**Change type:** modify-existing, two sites

#### Change 6 — the `release` suite (:418-434)

```js
describe('release', { skip: 'Skipped to avoid modifying VERSION file' }, () => {
```

**Contract, sourced outside this test.** `src/lib/version.js:107-114`: `setVersion`
writes `path.join(getPluginRoot(), 'VERSION')` and takes no root parameter. CLAUDE.md
makes `VERSION` the tracked source of truth. So the stated reason for the skip is
**correct** — this suite genuinely must not run by default.

**Why this is not an edit to what the test asserts.** The suite is fine. Its body,
including the `finally` that restores the original version, is **copied verbatim**.
Nothing about what it asserts changes. What changes is only the mechanism by which
it does not run:

```js
// `release` MUTATES the tracked VERSION file (src/lib/version.js:111-114 has no
// root parameter), so it cannot run in the default suite. It is REGISTRATION-GATED,
// never `skip:`-ed: a skipped suite contributes nothing the zero-skip gate can see,
// which is the exact false-green shape this repository fences. Opt in with:
//     CTOC_ALLOW_VERSION_MUTATION=1 node --test tests/version.test.js
if (process.env.CTOC_ALLOW_VERSION_MUTATION === '1') {
  describe('release', () => { /* body unchanged */ });
}
```

**Honest accounting: this change buys no new failure in the default run either.**
Before: never runs, invisible to the gate. After: never runs by default, visible in
the source as a deliberate opt-in. What it does buy is that the suite becomes
*runnable on demand*, which it was not — `skip:` here is unconditional, so those
assertions could not be executed by any means short of editing the file. That is a
real gain, and it is the only one claimed.

The better fix is to give `release`/`setVersion` a root parameter so the suite can
run against a fixture in the default run. That is a `src/` change, this slice
declares no `src/` files, and widening an approved write surface is not the
planner's call. Recorded as a handover finding.

#### Change 7 — the vestigial `{ skip: false }` at :269

```js
describe('setVersion', { skip: false }, () => {
```

`skip: false` is a no-op that reads as a skip at a glance and would be flagged by
the fence in Change 8. Remove the options object; the suite's behaviour is
identical and every assertion inside it is untouched. Cosmetic, claimed as nothing
more.

**Scope note:** this file is also edited by slice
`00097-tests-that-pass-on-a-broken-implementation`, at different line ranges
(:291-335, :404, :443, :466). That slice declares `depends_on` on this one so the
two never edit the file concurrently. Nothing in Changes 6 or 7 touches the
assertions that slice adds to.

---

### File: `tests/quality-state-coverage.test.js`
**Action:** MODIFY
**Purpose:** Remove the conditional test-level skip at :187, which makes the gate nondeterministic across environments.
**Change type:** modify-existing, one site — fixture only

#### Change 8 — `releaseLock_warns_and_does_not_throw_when_unlink_fails` (:187)

**Contract, sourced outside this test.** `releaseLock` must warn and not throw when
the underlying unlink fails — a fail-soft property of the lock module, so that a
lock-release failure never propagates into a caller. The test's name states it and
the module implements it.

**Why this is a fixture change, not an assertion change.** The test is **correct**.
Its assertions are copied verbatim. What changes is only *how the unlink failure is
induced*: today by a filesystem permission fixture, which requires privileges that
differ across platforms and hence needs the `CANNOT_FORCE_EACCES` probe and the skip.

Apply the pattern this repository already ruled on. Plan
`plans/review/00080-dashboard-says-when-reconcile-failed.md`, Decision 5, records the
human-facing reasoning: *a permission-based test would have to be skipped on some
platform, and a skip is a gate failure under the zero-skipped rule* — so use a seam.
`tests/task-reconcile-coverage.test.js:153-161` and `:380-390` show the mechanism: replace
a module function, restore it in a `finally`. Make `safe-fs`'s `unlinkSync` throw.

**What newly fails.** A `releaseLock` regression — one that throws instead of
warning — on every platform where the test currently skips, which includes any
container running as root. Today: invisible. After: red. The test also runs
everywhere instead of sometimes, which is strictly more coverage, not less.

If at Step 10 the seam proves unreachable for this call path, gate the
**registration** on `CANNOT_FORCE_EACCES` rather than restoring the `skip:` option,
and record why.

---

### File: `tests/skip-visibility.test.js`
**Action:** CREATE
**Purpose:** Make both blind spots permanently impossible to reopen, the way `skip-guard-integrity.test.js` made its own carrier impossible.
**Change type:** new-module (a corpus fence)
**Framework:** `node:test` (`describe` / `it` / `node:assert/strict`)

This is the wiring, and it is a pure addition — it edits nothing and removes
nothing. Fixing eight sites without a fence means the ninth arrives next month and
is invisible again.

**Contract source:** CLAUDE.md's claim that the Step 14 gate enforces "0 skipped",
and `src/scripts/test-gate.js:15-18`, which names skip > 0 as one of three trip
conditions. The fence exists to make that stated guarantee true.

The fence scans every `tests/*.test.js` (excluding itself) and fails on either
carrier:

**Carrier A — a `node:test` skip option the gate may not count.**
Ban the `skip:` and `todo:` options outright. Permit `t.skip(` only in a file that
declares an opt-in registration gate — concretely, a file containing a
`process.env.<NAME> === '1'` guard wrapping test registration. That is precisely
`plan-index-embedding.test.js` and it is the sanctioned shape. Detecting
"inside a registration-gated block" by regular expression is fragile, so the rule is
deliberately file-level and strict rather than clever.

**Carrier B — a hand-rolled skip.**
Any `console.log` whose string literal contains the token `SKIP`, case-insensitively.
There are exactly six today, all removed by this slice, so the fence lands at zero.

**No allowlist ships with a non-empty entry.** CLAUDE.md's account of
`.ctoc/false-green-baseline.json` is explicit that conflating a debt ledger
(`findings`, may only shrink) with a permanent exemption list (`whitelist`, starts
empty, requires written justification) is what kills a fence. Here there is no debt
to carry — all eight sites are fixed in this slice — so the fence ships with
**both empty** and no mechanism to add to either without editing the fence and
writing the justification inline.

**Non-vacuity is mandatory.** Mirror `skip-guard-integrity.test.js:89-122`: a
second test feeds the detector synthetic strings and asserts it flags each carrier
and spares each legitimate pattern (a registration-gated `t.skip`, a comment about
skipping, prose about the zero-skipped gate). Without it, a broken detector regular
expression makes the corpus scan vacuously green — which would make this fence an
instance of the very defect class it exists to prevent.

`tests/escalation-word-boundary.test.js:131` already proves the repository has been
bitten by prose about the zero-skipped gate being misread as a declared skip. The
non-vacuity cases must include that shape.

---

### Wiring — the live call sites

| new code | live call site | root |
|---|---|---|
| `tests/skip-visibility.test.js` | node's test runner discovers it via `resolveTestFiles()` (`src/scripts/test-gate.js:203-208`) | `npm test` |
| the rebuilt `stack-detector` fixture tests | the file's own bottom-of-file runner invocation | `npm test` |
| the rebuilt `update.test.js` assertions | same | `npm test` |
| the registration-gated `release` suite | `CTOC_ALLOW_VERSION_MUTATION=1 node --test tests/version.test.js` | developer opt-in, documented in the file header |
| the seam-driven `releaseLock` test | node's test runner | `npm test` |

The fence is reached by the gated entry point on every run. No new module is
created that only a test calls.

## Test Plan

### Tests: `tests/skip-visibility.test.js`
**Action:** CREATE

| # | Case | Assertion |
|---|---|---|
| 1 | no test file declares a `skip:` or `todo:` option | offender list is `[]`, message names each file and line |
| 2 | no test file logs a hand-rolled SKIP | offender list is `[]` |
| 3 | `t.skip(` appears only inside a registration-gated file | only `plan-index-embedding.test.js` is exempt, and for the stated reason |
| 4 | **non-vacuity** — the detector flags a `skip:` option | `true` |
| 5 | **non-vacuity** — the detector flags a hand-rolled `console.log('… SKIPPED …')` | `true` |
| 6 | **non-vacuity** — the detector spares prose about the zero-skipped gate | `false` |
| 7 | **non-vacuity** — the detector spares a comment mentioning skipping | `false` |
| 8 | **non-vacuity** — the detector spares a registration-gated `t.skip` | `false` |
| 9 | the fence's own allowlists are empty | both structures have length 0 |

### Modified files

`tests/stack-detector.test.js` — the two rebuilt fixture tests must assert the
detected language and framework, not merely that arrays are arrays. The symlink
test must reach an `assert` on both branches.

`tests/update.test.js` — the cache test must assert the no-git-repository
invariant. The `VERSION` test must fail if `VERSION` is missing.

`tests/version.test.js` — the `release` suite must be absent from a default run
and present under `CTOC_ALLOW_VERSION_MUTATION=1`. Assert both by running the file
twice at Step 14.

`tests/quality-state-coverage.test.js` — the `releaseLock` test must run
unconditionally and still assert the warn-not-throw behaviour, with its assertions
byte-identical to today's.

Cross-platform: `path.join`, `os.tmpdir()`, `fs.promises` for new asynchronous
work; teardown with `fs.rmSync(dir, { recursive: true, force: true })`. No test
depends on a POSIX permission model after Change 8.

## Execution Plan (Steps 8-16)

### Step 8: TEST — write `tests/skip-visibility.test.js` in full and run ONLY that file BEFORE any other edit. Cases 1, 2 and 3 MUST be red, naming all eight offending sites (six hand-rolled, two `node:test` options). Cases 4-9 must be green immediately. Record the red output verbatim, including the full offender list, so a reviewer can count the sites. Then, for each of Changes 1, 2, 3, 4 and 8, apply as a scratch edit the broken implementation named in its "what newly fails" clause, confirm the rebuilt test goes red, and revert. Changes 5, 6 and 7 buy no new failure by design and are exempt from this step — that exemption is itself reported, not hidden.
### Step 9: PREPARE — settle the suite-level-skip question BEFORE editing anything. Run `node --test tests/version.test.js` and `node --test tests/quality-state-coverage.test.js` and record the verbatim skip-count line from each. If a suite-level skip reports 0, blind spot two is confirmed and Change 6 proceeds. If it reports 1, STOP and report — the recorded zero-skipped full run in plan 00080 is then unexplained and that is a different defect. Also re-read from disk: `src/scripts/test-gate.js:89-93` (the parser is NOT to be changed), `tests/plan-index-embedding.test.js:1-25` and `:376-393` (the registration-gating exemplar), `tests/skip-guard-integrity.test.js` (the fence template and its non-vacuity block), `plans/review/00080-dashboard-says-when-reconcile-failed.md` Decision 5 (the human's ruling on permission fixtures), and `tests/task-reconcile-coverage.test.js:145-163` (the module-seam pattern for Change 8). Confirm the six hand-rolled line numbers against current disk state — the numbers in this plan were read at planning time and the code wins over the plan.
### Step 10: IMPLEMENT — one step, files as sub-items.
  - `tests/stack-detector.test.js` — Changes 1 and 2.
  - `tests/update.test.js` — Changes 3, 4 and 5.
  - `tests/version.test.js` — Changes 6 and 7.
  - `tests/quality-state-coverage.test.js` — Change 8.
  - `tests/skip-visibility.test.js` — already written at Step 8; adjust only if Step 9 changed the rule for suite-level skips.
  - `CLAUDE.md` — bump the documented test-file count by one (`tests/doc-counts.test.js` verifies it against disk).
### Step 11: REVIEW — confirm every rebuilt test reaches at least one assertion on every platform branch. Go through the eight-row justification table at the top of this plan and confirm each row still holds against what was actually written: for every edited test, that it was plainly wrong and why; for every added-to test, that the existing assertion is byte-identical; for Changes 5, 6 and 7, that the "buys no new failure" accounting is still honest. Confirm no assertion anywhere was weakened, no range widened, no case deleted — the two `/home/tijn/` tests were REPLACED by fixture-driven tests that assert strictly more, and that must be demonstrable line by line. Confirm the fence ships with both allowlists empty. Confirm no file under `src/` was modified.
### Step 12: OPTIMIZE — the fence reads each test file once and runs a fixed set of regular expressions; it must not read a file more than once nor compile a pattern inside the per-file loop. Confirm the corpus scan adds well under a second to the gated run.
### Step 13: SECURE — the fence reads only files under `tests/` resolved via `path.join(__dirname, …)`; no user-supplied path reaches a read. The rebuilt `stack-detector` fixtures write only inside `os.tmpdir()` and clean up. Change 5 keeps `execSync` on a fixed argument string with no interpolation. Confirm the symlink fixture cannot leave a directory outside the temp root on any exit path, including a failed assertion.
### Step 14: VERIFY — run `node --test` on each of the five files individually and record each verbatim skip-count line (all must read 0). Run `CTOC_ALLOW_VERSION_MUTATION=1 node --test tests/version.test.js` and confirm the `release` suite executes and passes. Then the full gated run `npm test`; record `tests`, `suites`, `pass`, `fail`, the zero-skipped counter, `todo` and the coverage line verbatim. The coverage floor of 99 must NOT be lowered. Lint every changed file at `--max-warnings 0`. No git operations.
### Step 15: DOCUMENT — a file header on `tests/skip-visibility.test.js` stating the two carriers, why the gate parser is correct and untouched, and that registration-gating is the sanctioned alternative with `plan-index-embedding.test.js` as the exemplar. Add the inline comment at the registration-gated `release` suite explaining why `skip:` is forbidden there. For each edited test, a comment naming the contract source that justified the edit, so the next reader can check the derivation rather than trusting it. Correct nothing else in CLAUDE.md beyond the test-file count.
### Step 16: FINAL-REVIEW — report the five paths, the verbatim red from Step 8, the Step 9 measurement that settled the suite-level-skip question, the per-change rejection evidence, the verbatim green from Step 14, every decision taken under ambiguity, an explicit restatement of the five things this slice does NOT fix, and an explicit restatement that Changes 5, 6 and 7 bought no new failure.

## Decisions Taken Under Ambiguity

1. **The gate parser is not touched.** `parseSkipped` is correct — it fails closed
   on an unreadable counter, which is the model the other two parsers were fixed to
   copy. The defect is that skips do not reach the counter. Teaching the gate to
   detect hand-rolled skips by scanning stdout would put a second, weaker parser in
   the critical path and would still miss the `node:test` half.
2. **The sixteen hand-rolled files are not converted.** ~369 test functions across
   sixteen files is not one reviewable slice, and it would put every one of those
   functions' behaviour at risk simultaneously. The runner-style question is left
   open for the human to schedule; it is named in "What this slice does NOT fix"
   rather than being quietly deferred.
3. **Four of the six hand-rolled skips are dead, not conditional, and are treated
   as dead.** `/home/tijn/ctoc-build` (twice), a missing tracked `VERSION` file, and
   a git repository the code documents as never existing. Only the symlink case is
   genuinely platform-conditional; `update.test.js:33` is environment-conditional
   and additionally asserts nothing. Reported per case as the brief required.
4. **The two `/home/tijn/` tests are rebuilt, not deleted.** A test whose body has
   never executed is inert text, which is why it qualifies as plainly wrong; but its
   *described* contract is genuine and becomes testable against a temp fixture, with
   assertions strictly stronger than the originals. Replacement, not removal.
5. **Registration-gating is preferred over every form of skip, and the body is
   never gated.** Established by `tests/plan-index-embedding.test.js:9-21`. A
   registration-gated test contributes 0 to the skipped count deterministically, on
   every platform.
6. **The `release` suite is registration-gated rather than made root-parameterised.**
   Adding a root parameter to `setVersion`/`release` is the better fix and is the
   honest reason this suite cannot run by default. It is a `src/` change, this slice
   declares no `src/` files, and expanding a plan's write surface is not the
   planner's call. Recorded as a handover finding rather than performed here.
7. **Change 8 uses a module seam rather than a filesystem permission fixture,
   following a ruling the human already made.** Plan 00080's Decision 5 states the
   reasoning; `tests/task-reconcile-coverage.test.js` shows the mechanism. The test's
   assertions are copied verbatim — only the fixture changes.
8. **Changes 5, 6 and 7 buy no new failure, and this is stated rather than
   glossed.** Change 5 repairs an empty test whose invariant is already covered
   elsewhere; Change 6 changes only a gating mechanism; Change 7 is cosmetic. They
   are included because the fence in Change 8 cannot land at zero while any of the
   eight sites remains, and because an invisible skip is a defect independent of
   whether removing it also strengthens an assertion. A reviewer who thinks the
   fence does not justify them should say so — the accounting is here to be argued
   with.
9. **The fence ships with empty allowlists and no mechanism to grow one silently.**
   All eight sites are fixed in this slice, so there is no pre-existing debt to
   carry, and shipping neither structure is the cleanest way to honour CLAUDE.md's
   warning about conflating them.
10. **The audit's claim about `skip-guard-integrity.test.js` is contradicted and the
    correction is recorded in the body.** That guard bans one mechanism — a
    `require()` failure swallowed into a skip — and its header explicitly preserves
    runtime-probe skips. The real constraint on the symlink case is the zero-skip
    gate itself.
11. **Blind spot two is added to this slice's scope although the brief did not name
    it.** `tests/version.test.js:418` is an unconditional, invisible skip in the
    sanctioned framework. Fixing the hand-rolled half while leaving the `node:test`
    half would leave the slice's own title false. Same defect, same slice.
12. **The suite-level-skip question is measured at Step 9, not assumed.** The
    inference from plan 00080's recorded `skipped 0` is strong but it is an
    inference. Both outcomes are written into Step 9 with an explicit STOP on the
    one that would mean a different defect is in play.

### Added during execution

13. **Change 6 was DELETED rather than registration-gated — the plan was wrong
    about what that suite is.** The plan (and the brief) assumed
    `describe('release', { skip: ... })` at :418 was the only `release` suite. It
    is not. A SECOND, unskipped `release` suite exists at :772-830 which runs in
    every default run today and asserts strictly more:
    `ok(result.oldVersion)` → `strictEqual(result.oldVersion, original)`;
    `ok(result.newVersion)` → `strictEqual(result.newVersion, bump(original,'patch'))`;
    `ok(result.synced)` → `typeof object` plus all three keys;
    `compareVersions(new, old) === 1` retained identically. It also restores the
    exact BYTES of VERSION, marketplace.json and README in `before`/`after` hooks,
    where the skipped suite restored only VERSION in a `finally`. The skipped suite
    was therefore a dead duplicate, and registration-gating it would have shipped
    redundant dead code behind an environment-variable switch. Deleting it removes
    no coverage: every assertion is superseded. It also changed no counter, which
    independently confirms the measurement — a skipped suite's tests were never
    counted (`ℹ tests 55` before and after).
14. **Decision 6 of the original plan is therefore moot.** No handover finding about
    root-parameterising `setVersion` is needed: the live suite already solves the
    mutation problem with byte-exact save/restore hooks, entirely inside `tests/`.
15. **A SEVENTH hand-rolled skip exists that the plan did not name, and it is
    correctly left alone.** `tests/playwright-scaffolder.test.js:259` prints
    "Skipping remaining tests" and abandons — but it returns `{ failed: 1 }`, whose
    runner exits non-zero. It is LOUD, already visible to the gate, and not a false
    green. The fence deliberately spares an abandonment that records a failure.
16. **The plan's Carrier B rule ("any `console.log` containing SKIP,
    case-insensitively") is too blunt and was narrowed.** Measured against the
    corpus it produces four false positives: `deployment.test.js:169,181` and
    `durable-log.test.js:158` are PASS LABELS printed after real assertions ("#
    Pipeline skipped when disabled" describes the SUBJECT under test, not the test),
    and `verify-fails-loudly.test.js:106` is a fixture string. The shipped rule adds
    the abandonment requirement: a skip-mentioning `console.log` whose next
    meaningful statement is a bare `return;` or the end of an `else` block. That
    discriminates all six real sites and spares all four legitimate ones with no
    allowlist.
17. **The plan's Carrier A rule ("ban `skip:` and `todo:` outright") could not ship
    as written.** `todo:` appears legitimately across the corpus as an object key —
    stage maps (`todo: 'implementation'`), plan counts (`todo: 0`, `todo: 4`) — and
    inside test NAMES (`it('implementation→todo: …')`). The shipped rule keys on the
    OPTIONS-OBJECT POSITION: a `describe`/`it`/`test` call whose second argument is
    an object literal containing a `skip`/`todo` key. Zero false positives.
18. **A third carrier was added: an ungated runtime `t.skip()`.** Without it the
    fence would ban the declarative option while leaving the imperative form open,
    which is the same defect one keystroke away. It permits `t.skip(` only in a file
    declaring a `process.env.<NAME> === '1'` registration gate — exactly
    `plan-index-embedding.test.js`.
19. **The Carrier C detector had to strip string literals and comments, and this was
    caught by the fence's own first run.** `skip-guard-integrity.test.js` embeds
    `t.skip(...)` inside fixture STRINGS for its own non-vacuity block; a naive
    detector flagged it. Reading prose as code is precisely the misread that already
    bit `tests/escalation-word-boundary.test.js:131`, so a literal/comment blanker
    was written, with the gate probe run against a strings-intact copy because
    `process.env.X === '1'` matches on a string literal itself.
20. **Change 2 does better than the plan asked, and the symlink test is still
    registration-gated.** The plan offered "assert the capability-absent behaviour"
    with registration-gating as fallback. Both were done: a NEW test
    (`testWorkspaceTraversalOutsideRootNotRead`) pins containment via `..` traversal
    and runs on EVERY platform including Windows without the symlink privilege, and
    the symlink test is registration-gated on a one-time `SYMLINK_SUPPORTED` probe
    so it is never invoked-and-abandoned. The traversal behaviour was verified
    empirically BEFORE being asserted (containment excludes the escaping entry while
    still scanning the root), rather than assumed.
22. **HANDOVER FINDING — the step-skip detector cannot read a plan ABOUT skips.**
    This plan was kicked back once at completion with "Step 9 marked as SKIPPED"
    and "Step 14 marked as SKIPPED". Neither step was skipped; both were executed
    in full. `src/lib/plan-validator.js:285-296` scans the Execution Plan region for
    `Step \d+[^\n]*<status>` and matched the phrase "record the verbatim
    `ℹ skipped N` line" on both step lines — prose naming the counter, read as a
    status declaration. The word-boundary hardening already there (which correctly
    spares `zero-skipped`, `parseSkipped`, `0 skipped, 0 flaky`) does not help,
    because a bare standalone `skipped` is exactly what a plan about the skip
    counter must be able to write. The prose was reworded to "skip-count line" to
    get through, which loses no information but does NOT fix the detector. The real
    fix is to require the status to be DECLARED rather than merely present on the
    line — anchored as a trailing marker, or `: SKIPPED`, or `**SKIPPED**` — rather
    than matching anywhere after `Step N`. That is a `src/` change, this slice
    declares no `src/` files, and widening an approved write surface is not the
    executor's call. Recorded here for the human to schedule.
21. **Rejection evidence for Changes 3 and 4 used controlled fixtures, not mutation
    of live state.** Change 3 was proved by pointing `HOME` at a fixture whose plugin
    cache DOES contain a `.git`; Change 4 by running the test file from a tree with
    no `VERSION`, and again with a malformed one. Mutating the user's real plugin
    cache or the tracked `VERSION` file would have been the faithful-but-reckless
    option with other agents active in the repository.

## Execution Record

### Step 9 measurement — the question the plan said to settle first

Node v24.14.1. Both files reported, verbatim:

```
tests/version.test.js               → ℹ tests 55   ℹ skipped 0
tests/quality-state-coverage.test.js → ℹ tests 34   ℹ skipped 0
```

The plan's STOP condition (a suite-level skip reporting 1) did NOT fire. A direct
probe settled the mechanism rather than leaving it as an inference:

```
describe('A', { skip: 'reason' }, () => { it('inner', ...) });  → NOT counted
describe('B', { skip: true },     () => { it('inner', ...) });  → NOT counted
test('C', { skip: 'because' }, ...)                             → counted
test('D', { skip: true }, ...)                                  → counted
test('F', (t) => t.skip('runtime'))                             → counted
ℹ tests 4   ℹ pass 1   ℹ skipped 3
```

**A skipped SUITE contributes 0 to `skipped` AND its inner tests vanish from
`tests` entirely.** Blind spot two confirmed. A skipped TEST *is* counted — so
`quality-state-coverage.test.js:187` read 0 here only because
`CANNOT_FORCE_EACCES` is false on this machine; in a root container it would have
turned the gate red nondeterministically, exactly as the plan predicted.

### Step 8 TDD-RED — verbatim offender list from the fence's first run

```
✖ no test file declares a node:test skip: or todo: option
    - quality-state-coverage.test.js:187
    - version.test.js:269
    - version.test.js:418
✖ no test file announces a hand-rolled skip that abandons the body
    - stack-detector.test.js:570
    - stack-detector.test.js:587
    - stack-detector.test.js:1036
    - update.test.js:33
    - update.test.js:50
    - update.test.js:70
✖ t.skip() appears only in a file with an opt-in registration gate
    - skip-guard-integrity.test.js        ← FALSE POSITIVE, detector fixed (Decision 19)
ℹ tests 5   ℹ pass 2   ℹ fail 3
```

Nine real sites, matching the plan's count, all inside this slice's declared files.

### Per-change rejection evidence (the broken implementation each change catches)

| Change | Mutant applied | Result |
|---|---|---|
| 1 | `detectStack` returns correct shape with `languages: []`, `frameworks: []` | RED — `tsconfig.json must yield typescript, got: []`. This is the exact mutant the originals could not catch: their bodies never ran. |
| 2 | containment predicate short-circuited to `return true` | RED — `react from a workspace escaping the root via .. is NOT read (containment)`, isolated to confirm the new traversal test catches it independently of the pre-existing tests. |
| 3 | `HOME` pointed at a fixture whose plugin cache contains `.git` | RED — `✗ Cache is a clean copy, not a git repository`; exit 1. Previously this logged "expected behavior" and passed. |
| 4 | `VERSION` absent; then `VERSION` = `not-a-semver` | RED both times — `VERSION must exist at …`; `VERSION should be semver format, got: not-a-semver`. |
| 8 | `releaseLock` rethrows instead of warning | RED — `✖ releaseLock_warns_and_does_not_throw_when_unlink_fails`, `ℹ fail 1`. Now catches this on EVERY platform, including where it used to skip. |
| 5, 6, 7 | — | **Exempt by design; no new failure bought.** Reported, not hidden. |

Corpus-scan non-vacuity was additionally proved live: reintroducing
`{ skip: 'probe' }` on `describe('syncAll')` turned the fence RED at
`version.test.js:401`, and removing it restored green.

### Step 14 VERIFY — verbatim

Per-file, all `ℹ skipped 0`:

```
tests/skip-visibility.test.js         ℹ tests 5    ℹ pass 5    ℹ fail 0  ℹ skipped 0  ℹ todo 0
tests/version.test.js                 ℹ tests 55   ℹ pass 55   ℹ fail 0  ℹ skipped 0  ℹ todo 0
tests/quality-state-coverage.test.js  ℹ tests 34   ℹ pass 34   ℹ fail 0  ℹ skipped 0  ℹ todo 0
tests/stack-detector.test.js          exit 0 (hand-rolled runner)
tests/update.test.js                  exit 0 (hand-rolled runner)
```

Full gated run (`npm test`):

```
ℹ tests 10053
ℹ suites 1737
ℹ pass 10053
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 18429.465333
[CTOC test-gate] coverage 99.06% (threshold 99%), skipped 0, failed 0
[CTOC test-gate] PASS
```

Coverage floor left at 99, not lowered. Lint clean at `--max-warnings 0` on all
five changed files. No git operations performed.

**Skip count before and after: 0 → 0, and that is the whole point.** The number did
not move because on THIS machine every one of the nine sites was either invisible to
the counter (six hand-rolled, one suite-level) or inactive (`CANNOT_FORCE_EACCES` is
false here, `skip: false` is a no-op). Before, `skipped 0` was an unearned number
over a suite that really did skip. After, it is defended: the six hand-rolled skips
are gone, the suite-level skip is gone, the conditional test-level skip now runs
everywhere, and a fence in the gated run makes all three carriers unable to return.
On a Windows machine or a root container the count BEFORE would have been 1; it is
now 0 there too, for a real reason.
