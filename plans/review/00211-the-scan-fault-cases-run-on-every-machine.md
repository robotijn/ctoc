---
approved_by: human
approved_at: 2026-07-21T11:13:58.165Z
gate_crossed: implementation → todo
---

---
title: "The scan's could-not-look cases run on every machine — a branch covered only on POSIX is a branch measured differently on every platform"
type: implementation
parent_plan: 00210-the-coverage-floor-gets-margin-it-can-rely-on
depends_on: none
priority: HIGH
program: ctoc-repair-loop
iron_loop: true
files:
  - "tests/stale-scan-says-when-it-could-not-look.test.js"
---

# The scan's could-not-look cases run on every machine

## The gap, read on disk

`tests/stale-scan-says-when-it-could-not-look.test.js:44–57`:

```js
const CAN_REVOKE_READ =
  process.platform !== 'win32' &&
  typeof process.getuid === 'function' &&
  process.getuid() !== 0;

const NO_REVOKE_REASON =
  process.platform === 'win32'
    ? 'SKIPPED (stated reason): this platform is win32, where mode bits do not revoke read access, …'
    : 'SKIPPED (stated reason): running as uid 0 (root), which bypasses permission bits, …';
```

The permission-dependent cases induce their fault with `chmod` (`revoke`, `:98–102`).
On Windows mode bits do not revoke read; as root they are bypassed. In either
environment the fault cannot be induced, the case announces a stated skip, and the
branches it exists to fence go unexercised.

**The skip itself is correct and must not be removed.** The file header (`:20–23`) is
explicit: a permissions test that silently no-ops would itself be a check reporting a
verdict it never earned — the exact defect under test. This slice does not touch that
design. It ADDS cases that induce the same faults by a mechanism available everywhere,
so the branches are always covered and the loud skip remains as the stronger,
environment-dependent proof where it can run.

## Why this matters beyond the percentage

The subject is `scanCheapCandidates` in `src/lib/stale-detector.js`, which runs on the
**menu hot path** (`src/lib/inbox.js`, `src/lib/menu-screens.js`). Its documented
contract is that `unreadCount === 0` is the only thing that licenses reading a `count`
of 0 as "the backlog is clean". An unreadable `plans/review/` must render as a PARTIAL
scan, never as "no stale plans".

`REASONS` at `:119` is the closed enum: `stage-unreadable`, `stat-failed`, `oversized`,
`read-failed`. Two of the four — `stage-unreadable` and `read-failed` — are the
chmod-induced ones. On Windows and as root, **the two branches that carry the partial-scan
signal for a whole missing stage are the ones not being driven.**

## The mechanism — real faults, no mocking

Both faults have a cross-platform inducer that is a genuine I/O error, not a stub. Both
techniques are already used in this repository, so this is not a new invention:

| Branch | Inducer | Error | Precedent in-repo |
|---|---|---|---|
| `stage-unreadable` | make the stage path a FILE, so `readdirSync` fails | `ENOTDIR` | `tests/the-edit-protection-says-whether-it-is-running.test.js:552` |
| `read-failed` | make the plan path a DIRECTORY, so `readFileSync` fails | `EISDIR` | `tests/the-edit-protection-says-whether-it-is-running.test.js:299` |

Neither requires permission manipulation, so both work on Windows and as uid 0. Neither
mocks `safe-fs` or any core logic — the filesystem really does raise the error the
production code catches.

## Cases to add, and what each asserts a caller relies on

**Case A — a stage directory that is a file yields a `stage-unreadable` entry, on every
platform.**
Arrange a sandbox, write one clean plan in `todo`, then replace `plans/review/` with a
regular file. Act: `scanCheapCandidates(root)`.
Asserts: `unreadCount >= 1`; some `unread` entry has `reason === 'stage-unreadable'` and
`stage === 'review'`; and `unreadCount > 0` even though `candidates` may be empty.
**What a caller relies on:** `inbox.js` may only read `count === 0` as a clean backlog
when `unreadCount === 0`. This is the assertion that keeps a dropped stage from
rendering as good news.

**Case B — an unreadable plan file yields a `read-failed` entry, on every platform.**
Arrange a sandbox with one readable plan and one path named `…​.md` that is a directory.
Act: `scanCheapCandidates(root)`.
Asserts: an `unread` entry with `reason === 'read-failed'`; the readable plan is still
scanned (the scan does not abort); `path` is repository-RELATIVE, never absolute.
**What a caller relies on:** one unreadable plan must not crash the menu nor silently
shrink the scan, and the rendered value must not leak an absolute path or a user name.

**Case C — the reason vocabulary stays closed.**
Assert every `reason` produced by cases A and B is a member of `REASONS` (`:119`).
**What a caller relies on:** the value is rendered on a dashboard; a raw error string
would carry absolute paths. This asserts the enum, not the spelling of a message.

**Case D — the vacuity guard.**
Apply case A's assertion to a CLEAN sandbox (all stages present and readable) inside
`assert.throws(…, assert.AssertionError)`.
**What this asserts:** that case A discriminates on real evidence rather than matching
anything. This mirrors case 18 of
`tests/the-edit-protection-says-whether-it-is-running.test.js` and is the house pattern
for proving a new case is not vacuous.

## What this slice does NOT cover

- **`stat-failed` and `oversized`** — already inducible without permissions and already
  driven by the existing cases. Adding duplicates would move no line and assert nothing new.
- **The two deliberate non-faults.** A non-regular file (a symlink — a security
  exclusion) and an ABSENT stage directory are NOT faults and must not be reported as
  such. Reporting either would make every repository with a symlinked plan permanently
  "partial", or invent a false partial for a stage with no plans in it. The enum stays
  closed at four. **No case here asserts they produce an `unread` entry**, and a future
  reader must not add one.
- **Rendering.** `unreadCount` is produced and tested but no consumer displays it; the
  menu still shows a partial scan as a clean one. That is a real, documented, unfinished
  gap — and it is a FEATURE, not coverage. It is not in scope here and this slice must
  not be read as closing it.
- **The chmod cases.** Untouched. They remain the stronger proof of the same branches
  where the environment allows, and their loud skip stays exactly as written.

## Expected coverage effect, and the derivation

**On macOS as a non-root user: no measurable change**, because `CAN_REVOKE_READ` is
already true there and the branches are already covered. Derivation: `:44–47`.

**On Windows or as uid 0: two `continue` branches of `scanCheapCandidates` move from
unexercised to exercised.** I am not quoting a percentage, because I could not run the
suite when writing this and an invented figure is the defect this repository fences.

**The executor measures first and reports the real numbers** (see Step 8). If the
measurement contradicts anything above, say so and stop — do not proceed on the plan's
word.

## No test file is created — deliberately

This slice MODIFIES one existing test file. It creates none. So it does **not** change
the top-level test-file count, and therefore does **not** require `CLAUDE.md` or
`tests/readme-numbers.test.js` in `files:`. Three builds were forced out of scope today
by missing that declaration; the reverse error — declaring files a slice has no reason
to touch — widens a permission grant for nothing, so both are avoided.

**If the executor finds it must create a file or edit anything outside the one declared
path, it must STOP and ask.** The `files:` list is the permission grant.

## Wiring — the live call sites

No new module is created, so there is nothing to wire. The code under test is already
live: `scanCheapCandidates` is reached from `src/lib/inbox.js` and
`src/lib/menu-screens.js` on the menu hot path. This slice adds callers (tests) to
existing, reachable production code.

## Execution Plan

### Step 8: TEST
Run `npm test` FIRST and record the per-file coverage line for
`src/lib/stale-detector.js` — the before-state, in the plan, as measured rather than
assumed. Then write cases A–D and see them RED before any of them can pass: temporarily
neuter the `unread` push in `scanCheapCandidates` and confirm A, B and C fail. Restore
immediately. Case D must pass only once A is real. **A case that is green before the
mechanism exists is either already covered or vacuous — account for every one.**

### Step 9: PREPARE
Confirm the sandbox helpers already present (`makeSandbox` `:65`, `writePlan` `:78`,
`revoke` `:98`, `restoreModes` `:63`) and reuse them. Add no new dependency. Confirm the
`after` hook restores modes and removes sandboxes so the new cases leak nothing.

### Step 10: IMPLEMENT
Add cases A–D to `tests/stale-scan-says-when-it-could-not-look.test.js`. Sub-items:
(a) a helper that makes a path unreadable-by-shape (file-as-directory,
directory-as-file) with no permission manipulation; (b) cases A and B; (c) case C over
both; (d) case D, the vacuity guard. Leave `CAN_REVOKE_READ`, `NO_REVOKE_REASON`,
`announceSkip` and every existing case untouched.

### Step 11: REVIEW
Verify no case asserts a symlink or an absent stage produces an `unread` entry. Verify
no case mocks `safe-fs`. Verify each assertion names a behaviour a caller depends on,
not a line that executed.

### Step 12: OPTIMIZE
Fold A–D into the existing `describe` rather than a parallel structure. No sleeps, no
timing dependence.

### Step 13: SECURE
Assert `path` in every `unread` entry is repository-relative. Assert no absolute path,
username or raw error string reaches the result. Sandboxes stay under `os.tmpdir()` and
the real repository is never written to.

### Step 14: VERIFY
`npm test` — lint, typecheck, ALL tests, coverage at or above the floor in
`.ctoc/coverage-baseline.json` (99), 0 skipped, 0 flaky. Record the AFTER per-file
coverage for `src/lib/stale-detector.js` next to the Step 8 before-state. Run twice and
record both, so the spread is observed rather than assumed. **Do not change `minPct`.**

### Step 15: DOCUMENT
Record the before/after coverage and both run values in this plan. If the measurement
contradicts the expectations above, write down what was actually true — the measurement
outranks the plan.

### Step 16: FINAL-REVIEW
Confirm: no test file created; no source file modified; the loud-skip design intact; no
assertion that would pass vacuously; the two deliberate non-faults still not treated as
faults; `minPct` untouched.

## Decisions Taken Under Ambiguity

### Case B was DROPPED — `read-failed` has no cross-platform inducer, and here is why the next reader must not re-attempt it

The plan's Case B proposed to induce `read-failed` by making the plan path a
DIRECTORY so `readFileSync` throws `EISDIR`. That mechanism is wrong for this
subject and was proven wrong empirically before any code was written. In
`scanCheapCandidates` the stat-gate at `src/lib/stale-detector.js:979`
(`if (!st.isFile()) continue;`) excludes every non-regular file — a directory or a
symlink — as a DELIBERATE non-fault, and it runs BEFORE the read at
`:991`. A directory named `something.md` therefore hits that `continue` and never
reaches the `read-failed` branch: a probe returned `unread: []`, `unreadCount: 0`
for exactly that arrangement. The cited precedent
(`the-edit-protection-says-whether-it-is-running.test.js`) works only because its
subject, `protectionLiveness`, does NOT stat-gate; this subject does.

There is no genuine cross-platform I/O error that reaches `read-failed` at all. To
reach it a path must be a present, regular, sub-`1` MiB file whose `readFileSync`
still throws. The only mechanisms that do that are: permission bits — the exact
platform-dependent `chmod` this slice exists to escape (a no-op on win32, bypassed
as root); a delete-race between `lstat` and `readFile` — non-deterministic and so a
flaky test, forbidden; or a mock of `safe-fs` — which tests the mock, not the code,
also forbidden. Filesystem physics leave no fourth option. So `read-failed` stays
covered ONLY where `chmod` can revoke read (POSIX non-root), by the existing cases
`3`, `11`, `12`, whose loud skip remains the honest signal elsewhere. This is a
filesystem limit, not laziness. The source is CORRECT and was not touched — the
non-fault exclusion at `:979` is a documented security boundary and must not be
weakened to make `read-failed` reachable.

### The plan's claim that `stat-failed` is "already inducible without permissions" is also wrong

The plan excluded `stat-failed` from scope on the grounds that it was "already
inducible without permissions and already driven by the existing cases." That is
incorrect. Case `5` induces `stat-failed` with `chmod 0o400` (read but no search
permission on the stage directory, so `lstatSync` on a child fails `EACCES`), and it
is guarded by `CAN_REVOKE_READ` like the other chmod cases. There is no
non-permission, non-race way to make `lstatSync` throw on an entry `readdirSync` just
returned: the entry provably exists and its parent is a real directory, so the only
failures left are permission bits or the file vanishing mid-scan. `stat-failed`
therefore also remains covered only on POSIX non-root, exactly as `read-failed` does.

### What DID land, and what it closes

Cases A, C and D were added, all UNCONDITIONAL — no `CAN_REVOKE_READ` guard — using a
new helper `replaceStageWithFile` that replaces a stage directory with a regular file
so `readdirSync` throws `ENOTDIR` while `existsSync` stays true. This drives the
`stage-unreadable` branch (`:938`) on EVERY platform. That is the single
highest-value could-not-look branch: one unreadable stage directory drops a WHOLE
stage — up to a third of the backlog — and a whole stage silently rendering as a
clean backlog is the loudest false-green. Case A was proven to BITE by mutation:
removing the `markUnread(stage, 'stage-unreadable')` call at `:938` turned cases A and
C RED, and reverting restored green; the source is byte-identical to `HEAD`. Case D is
the vacuity guard (the same assertion against a clean sandbox must throw
`AssertionError`) and correctly stayed green under the mutation because it induces no
fault.

The existing chmod cases and their loud skip are UNTOUCHED — the always-runnable
cases run BESIDE them, not instead of them, so the stronger environment-dependent
proof remains wherever the environment allows it. This slice closes the biggest of
the three platform-varying branches, not all three; `read-failed` and `stat-failed`
remain permission-gated by the filesystem limit described above.
