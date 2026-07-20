---
approved_by: human
approved_at: 2026-07-20T08:40:32.343Z
gate_crossed: implementation → todo
---

---
title: "A link that points at nothing yet is reported as a path inside the tree — the resolver's missing-path walk steps straight over a dangling link"
type: implementation
parent_plan: ctoc-background-engine-rebuild
depends_on: none
priority: CRITICAL
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/lib/real-path-confinement.js"
  - "tests/a-dangling-link-is-not-a-path-inside-the-tree.test.js"
  - "CLAUDE.md"
  - "tests/readme-numbers.test.js"
---

# A link that points at nothing yet is reported as a path inside the tree

## Why this slice exists at all, and why it is first

The slice that just landed built `src/lib/real-path-confinement.js` — the one place in
this codebase that asks the filesystem where a path really leads — and wired it into
the coverage check and into the two protected-directory guards. It closed the proved
chain on the editing channel.

Reading that module against the case it does NOT enumerate shows a hole in the
resolver itself, and because two guards and (after the two sibling slices) two more
call sites all stand on it, the hole is under every one of them. So it is fixed first,
before anything else is wired into it.

## The defect, derived from the shipped code

`resolveExisting` (`src/lib/real-path-confinement.js:84-117`) handles a path that does
not exist yet — the ordinary `Write`-creates-a-file case — by walking up to the nearest
existing ancestor and rejoining the unresolved tail. The header states the reasoning
plainly and it is correct as far as it goes: *"the tail contains no links BECAUSE IT
DOES NOT EXIST, so the result is exact rather than approximate."*

That sentence is true for a tail segment that does not exist. It is **false for a tail
segment that exists as a symbolic link whose target does not.** `realpathSync` answers
`ENOENT` for both, and the walk cannot tell them apart:

```js
if (code !== 'ENOENT') return { ok: false, real: null, reason: 'resolve-failed' };
const parent = path.dirname(current);
if (parent === current) return { ok: false, real: null, reason: 'resolve-failed' };
tail.unshift(path.basename(current));
current = parent;
```

Given a repository at `/repo` with `link → /outside/newfile` where `/outside/newfile`
does not exist yet:

1. `realpathSync('/repo/link')` throws `ENOENT` — the link exists, its target does not;
2. the walk treats `link` as a not-yet-existing name, pushes it onto the tail;
3. `/repo` resolves;
4. the result is `/repo/link` — **reported as inside the tree.**

`escapesRoot` returns `escapes: false`. `resolvesUnder` returns `false`. Both guards
permit. The write follows the link and creates `/outside/newfile`.

The same shape reaches the approval ledger: `link → <repo>/.ctoc/approvals/forged.json`
with no such file yet is a link that points at nothing, so
`isProtectedLedgerPath('src/link')` reports it as an ordinary source path, and the
write mints the file the link names — **inside the ledger.** A forged approval entry is
a file that does not exist until it is forged, so *the dangling case is the ordinary
case for this attack*, not an exotic one.

**VERIFIED by reading**, and by reading only: the walk's `ENOENT` branch performs no
test for a link, so it cannot distinguish the two causes. **NOT VERIFIED, and required
to be confirmed or refuted at Step 8**: that `realpathSync` on a dangling link really
answers `ENOENT` on macOS, Linux and Windows rather than some other code. If Step 8
finds it does not, **say so plainly and remove this finding** rather than defending it.

## The fix, and the alternative that was rejected

On the `ENOENT` branch, before treating the segment as absent, ask whether it EXISTS as
a link: `safeFs.lstatSync(current)`. A successful `lstat` on a path `realpathSync`
called missing means exactly one thing — the entry is there and its target is not. That
is a **dangling link**, and its verdict is a returned refusal with the reason
`'dangling'`, which both public predicates already convert to DENY.

`lstatSync` and `readlinkSync` are both exported by `src/lib/safe-fs.js`
(`:106-109`, `:122-124`), so no new dependency is introduced.

**The rejected alternative — following the link one hop** with `readlinkSync` and
continuing the walk from its target — is more precise: it would correctly permit a
dangling link that points at a not-yet-existing path INSIDE the tree, which the chosen
fix refuses. It is rejected because it re-introduces link-following, with its own cycle
risk and its own hop budget, into the exact module whose entire purpose is to not be
fooled by links. A refusal is bounded, obvious, and fails in the safe direction; the
shape it over-refuses is a symbolic link inside this repository pointing at a file that
does not exist yet, and Step 9 of the sibling slice measured **zero symbolic links** in
this repository outside `node_modules/` and `.git/`. Refusing a shape that occurs zero
times costs nothing measurable.

## Pathological filesystem cases — every one enumerated, with its verdict

"It throws" is not an answer in this module: `PreToolUse.Edit.js`'s outer catch fails
OPEN, so a throw out of a permission check becomes an ALLOW. Every row below is a
RETURNED value.

| case | `resolveExisting` | `escapesRoot` | `resolvesUnder` | verdict |
|---|---|---|---|---|
| path exists, real location inside root | `ok, real` | `escapes:false` | per location | permitted |
| path exists, real location outside root | `ok, real` | `escapes:true` | `false` | DENY (coverage) |
| path missing, no link in the tail (plain new file) | `ok`, ancestor + tail | per location | per location | permitted — the common `Write` |
| **dangling link in the tail (NEW)** | `ok:false, 'dangling'` | `escapes:true` | `true` | **DENY** |
| **dangling link IS the target (NEW)** | `ok:false, 'dangling'` | `escapes:true` | `true` | **DENY** |
| link loop (`a → b`, `b → a`) | `ok:false, 'loop'` | `escapes:true` | `true` | DENY — no throw, no hang |
| a file where a directory is expected (`ENOTDIR`) | `ok:false, 'resolve-failed'` | `escapes:true` | `true` | DENY |
| permission refused (`EACCES`/`EPERM`) | `ok:false, 'denied'` | `escapes:true` | `true` | DENY |
| nothing exists up to the filesystem root | `ok:false, 'resolve-failed'` | `escapes:true` | `true` | DENY |
| ancestor walk exceeds `MAX_ANCESTOR_WALK` | `ok:false, 'resolve-failed'` | `escapes:true` | `true` | DENY |
| not a path at all (absent, non-string, empty) | `ok:false, 'resolve-failed'` | `escapes:true` | **`false`** | see below |
| path containing a NUL byte (`validatePath` TypeError) | `ok:false, 'resolve-failed'` | `escapes:true` | `true` | DENY |
| the root itself unresolvable | — | `escapes:true` | `true` | DENY the whole call |
| lstat itself fails on the `ENOENT` branch | `ok:false, 'resolve-failed'` | `escapes:true` | `true` | DENY |

The one `false` is deliberate and already documented at the definition: a target that
is not a path at all is not a resolver fault, there is nothing to protect, and both
call sites guard `targetFile &&` before asking. Returning `true` there would report a
null target as ledger-protected and change unrelated existing verdicts.

**Not closable here, and stated rather than implied:** the check and the write are two
separate operations, so a link created between them is not seen by any resolution this
module performs. No in-process hook can close that; it is named in the residuals.

## Implementation Details

### Dependency graph

```
src/lib/real-path-confinement.js  (MODIFY)
  ├─requires→ path                     [unchanged]
  └─requires→ src/lib/safe-fs.js       [unchanged edge; lstatSync newly used]
```

No new edge, no new module, no cycle. Nothing that requires this module changes.

### File: `src/lib/real-path-confinement.js`
**Action:** MODIFY — one branch inside `resolveExisting`

Inside the `catch` block, on the `ENOENT` path only, BEFORE `tail.unshift`:

```
// realpathSync answers ENOENT for two different facts: the entry is absent, or the
// entry EXISTS as a link whose target is absent. lstat does not follow links, so a
// successful lstat here means the second — a DANGLING LINK. Treating it as absent
// pushes it onto the not-yet-existing tail, and the header's guarantee ("the tail
// contains no links because it does not exist") is then false for that segment: the
// result is reported as inside the tree while the write follows the link out of it.
```

Then: a `try { safeFs.lstatSync(current); return { ok: false, real: null, reason: 'dangling' }; } catch { /* genuinely absent — continue the walk */ }`.

Placement is load-bearing and must be argued in the review: the `lstat` runs ONLY on
the `ENOENT` branch, so a path that exists costs nothing, and a plain new file costs
one extra `lstat` per missing segment — in practice one, because the parent directory
of a new file exists.

`'dangling'` joins the fixed reason vocabulary in the JSDoc
(`'resolve-failed' | 'loop' | 'denied' | 'dangling'`). No caller reads a reason for a
decision — `plan-coverage` discards it entirely and `resolvesUnder` returns a bare
boolean — so no call site changes and nothing new crosses a boundary.

### File: `tests/a-dangling-link-is-not-a-path-inside-the-tree.test.js`
**Action:** CREATE
**Framework:** `node:test`, real `os.tmpdir()` fixtures, `path.join` throughout,
recursive-force cleanup in `finally`, no shell.

| # | Case | Assertion |
|---|---|---|
| 1 | **the defect** — `link → <outside>/newfile` (target absent), `escapesRoot('link', root)` | `escapes: true` |
| 2 | **the ledger shape** — `link → <root>/.ctoc/approvals/forged.json` (absent), `resolvesUnder('link', '.ctoc/approvals', root)` | `true` |
| 3 | **dangling link in the MIDDLE of the path** — `link → <outside>/nodir`, target `link/x.js` | `escapes: true` |
| 4 | **the fence is not vacuous — a plain new file still works** — `src/lib/brand-new.js`, no link anywhere | `escapes: false`. Without this the fix is a blanket denial of every `Write` |
| 5 | **an in-tree dangling link is refused, and that is the accepted over-refusal** — `link → <root>/src/newfile` (absent) | `escapes: true`, asserted as the DOCUMENTED CHOICE (Decision 1), not as an accident |
| 6 | **a live link that stays inside is still permitted** — `inner → src/lib` (exists), target `inner/x.js` | `escapes: false` |
| 7 | **a live link that leaves is still refused** | `escapes: true` |
| 8 | **link loop** — `a → b`, `b → a` | `escapes: true`, **no throw, assert the call returns** |
| 9 | **a file where a directory is expected** — `<file>/x.js` | `escapes: true` |
| 10 | **the root itself unresolvable** | `escapes: true`, no throw |
| 11 | **`resolvesUnder` keeps its documented inversion** — a null / empty / non-string target | `false`, and no throw |
| 12 | **fail closed on a permission fault** — stub `safe-fs`'s `lstatSync` on its cached exports object to throw `EACCES`, restore in `finally` | `escapes: true` and `resolvesUnder` `true`, **and `assert.doesNotThrow`** — a throw reaches the hook's fail-open catch and becomes an ALLOW |
| 13 | **the two live guards inherit the fix** — drive `plan-coverage.findCoveringPlan` with an approved plan declaring `link/**` over a DANGLING link | `null` |
| 14 | **the ledger guard inherits the fix** — drive `isProtectedLedgerPath` through the spawned hook against a dangling link naming a not-yet-existing ledger entry | denied |

Cross-platform: links are created with `fs.symlinkSync(target, linkPath, 'junction')`
for directories and the default type for files, which Windows permits without
elevation for junctions. **If link creation fails, the test FAILS LOUDLY with the
platform and the error** — it does not skip. Zero skipped is a gate here, and a
skipped case is a check that reports a verdict on input it never received.

### Wiring — the live call sites

Nothing new is wired; this slice repairs a predicate that is ALREADY live.

| change | live call site | root |
|---|---|---|
| the `dangling` branch in `resolveExisting` | `escapesRoot` → `plan-coverage.scanForCoverage` | `PreToolUse.Edit.js:463`, every Edit/Write/MultiEdit/NotebookEdit call |
| the same branch | `resolvesUnder` → `isProtectedLedgerPath`, `isProtectedVerifyPath` | `PreToolUse.Edit.js:430` and `:443` |
| `tests/a-dangling-link-is-not-a-path-inside-the-tree.test.js` | the suite | `npm test` |

Nothing here is reachable only from a test.

## What this does NOT fix

1. **The Bash channel is untouched.** An agent can still create the link, and — as the
   sibling slice's Step 13 probe proved — writes through it on the Bash channel are a
   separate hole with a separate guard. That is the next slice.
2. **`isWhitelisted` is untouched** and still reaches outside the repository through a
   link. That is the slice after it.
3. **Hard links remain invisible.** Real-path resolution resolves them to a path inside
   the tree because that is what they are.
4. **The check-then-write race is not closable here.** A link created between the
   resolution and the write is not seen. No in-process hook can see it.
5. **Every other pure-arithmetic path check in the codebase is untouched.**
6. **An in-tree dangling link is now REFUSED**, which is a behaviour change and a
   deliberate over-refusal. If a legitimate one appears later, this is the plan that
   caused it and Decision 1 is the reasoning.

## Execution Plan (Steps 8-16)

### Step 8: TEST
Write `tests/a-dangling-link-is-not-a-path-inside-the-tree.test.js` in full and run
**only that file, before touching `src/`**. Record the starting state verbatim.

- **Cases 1, 2, 3, 5, 13 and 14 must be RED.** If they are not, planning's reading is
  wrong: **STOP, report which, and do not fix what is not broken.** In particular case
  2 is the claim that the ledger is reachable through a link that points at nothing
  yet; if it is GREEN, say so plainly and strike the finding.
- **Cases 4, 6, 7, 8, 9, 10 and 11 must be GREEN already** and must stay green. Case 4
  is the proof this is not a blanket denial of every file creation.
- **Case 12** — record whether a `lstat`/`realpath` fault currently reaches the hook's
  fail-open catch.
- Record the exact errno `realpathSync` returns for a dangling link on this platform.
  If it is not `ENOENT`, the fix as written does not fire and the plan is wrong —
  **stop and report** rather than widening the branch to make red go green.

### Step 9: PREPARE
Read from disk, in full: `src/lib/real-path-confinement.js`; `src/lib/safe-fs.js`'s
`lstatSync`, `realpathSync`, `readlinkSync` and `validatePath`;
`src/lib/plan-coverage.js:333-480`; `src/hooks/PreToolUse.Edit.js:57-64` and `:170-211`.

Then MEASURE:

1. **Timing before and after**, 200 iterations after 20 warm-up, on the real
   repository, for: an existing covered target, a **non-existent** target (the
   `Write` path — this is the only path that gains a syscall), and an uncovered
   target. Record all six numbers. The sibling slice measured 1.130 / 0.926 / 1.050
   milliseconds per call. **Above roughly 10 milliseconds per call, stop and report.**
2. **How many extra `lstat` calls a single new-file `Write` costs**, counted rather
   than assumed. If it is more than the depth of the missing tail, the branch is in
   the wrong place.
3. **Whether this repository contains any dangling symbolic link** outside
   `node_modules/` and `.git/`. The sibling slice measured zero links of any kind; if
   that has changed, **report it to the human BEFORE Step 10** — a dangling link
   inside a directory a plan can declare will now be refused.

Where the code disagrees with this plan, **the code wins and the discrepancy is
recorded.**

### Step 10: IMPLEMENT
One step, files as sub-items.
- `src/lib/real-path-confinement.js` — the `dangling` branch on the `ENOENT` path,
  the reason added to the JSDoc vocabulary, the header paragraph on the missing-path
  walk corrected so it no longer states a guarantee that was false for a link.
- `tests/a-dangling-link-is-not-a-path-inside-the-tree.test.js` — the fourteen cases.
- `CLAUDE.md` and `tests/readme-numbers.test.js` — **count ratchets ONLY**, and only
  if adding one test file trips them. Measured live, nothing else touched, no
  assertion loosened. Declared here so the executor is covered rather than stopping.

### Step 11: REVIEW
Confirm the `lstat` runs on the `ENOENT` branch ONLY and never on a path that exists.
Confirm the walk still terminates: the new branch RETURNS, so it cannot extend the
loop. Confirm the function still cannot throw — the new `lstat` is inside its own
`try`, and its failure continues the walk rather than escaping. Confirm no caller
reads the new reason for a decision. Confirm `MAX_ANCESTOR_WALK` still bounds the loop.
Confirm the header no longer asserts the guarantee that this defect falsified.

### Step 12: OPTIMIZE
Confirm an existing target costs exactly the syscalls it cost before. Record the
after-timing against Step 9's before-numbers, all six. Confirm the extra cost falls
only on the missing-path branch and is bounded by the depth of the missing tail.

### Step 13: SECURE
This is the security step of a security fix; do it adversarially.
- Re-attack by hand against the built code: a dangling link at the target, in the
  middle of the path, and chained (`a → b`, `b → <absent>`).
- Confirm every fault path DENIES by RETURNING: `ENOENT` genuinely absent, dangling,
  `ELOOP`, `EACCES`, `ENOTDIR`, an unresolvable root, a `validatePath` TypeError, and
  a failing `lstat`. Assert the absence of a throw explicitly.
- Confirm the deny path leaks no absolute paths, no file contents and no stack traces.
- **PROBE and REPORT, do not fix**: whether a link created BETWEEN the resolution and
  the write is seen (it will not be — record the shape so the residual is evidence
  rather than an assumption).

### Step 14: VERIFY
Targeted run first: the new file, plus `tests/a-link-cannot-leave-the-repository.test.js`,
`tests/plan-coverage-coverage.test.js`, `tests/unapproved-plan-grants-nothing.test.js`,
`tests/enforcement-hook.test.js`, `tests/pretooluse-edit-coverage.test.js`,
`tests/security-enforcement-evasion.test.js`, `tests/w01-edit-write-deny-protocol.test.js`,
`tests/w01-multiedit-notebookedit-parity.test.js`,
`tests/gate3-verify-evidence-write-deny.test.js`, `tests/ledger-forgery-closed.test.js`,
`tests/e2e-enforcement-and-gates.test.js`, `tests/false-green-fence.test.js`,
`tests/architecture-invariants.test.js`, `tests/doc-counts.test.js`,
`tests/readme-numbers.test.js`.

Then the full gated run `npm test`; record `tests`, `suites`, `pass`, `fail`, the
zero-skipped counter and the coverage line **verbatim**. The floor must not be lowered.
Lint every changed JavaScript file at `--max-warnings 0` and run `npx tsc --noEmit -p .`.

Then prove the pipeline still runs: every declared glob across every plan in `todo/`
and `in-progress/` must still resolve through `findCoveringPlan`. The sibling slice
counted 74. **A fix that denies everything looks exactly like a fix that works until
someone tries to build.** If a plan that should be buildable is not, stop and report.
**No git operations.**

### Step 15: DOCUMENT
Correct the module header's missing-path paragraph: state that `realpathSync` answers
`ENOENT` for two different facts, that only `lstat` separates them, and that the tail's
"contains no links because it does not exist" guarantee holds only after a dangling
segment has been excluded. Add the rejected one-hop-follow alternative and why. Add
`'dangling'` to the reason vocabulary in the JSDoc.

### Step 16: FINAL-REVIEW
Report: the paths; the Step 8 verbatim red, naming separately whether case 2 confirmed
or **refuted** the ledger claim; the errno observed for a dangling link on this
platform; all six timing numbers and the counted extra `lstat` calls; any dangling link
found in this repository; the Step 13 re-attack results; the verbatim green from Step
14; the six things this does NOT fix; and every decision taken under ambiguity.

## Ordering and file conflicts

This slice declares `src/lib/real-path-confinement.js`, which no plan in `todo/` or
`in-progress/` declares. Its two siblings (the Bash channel and the whitelist) declare
`src/hooks/PreToolUse.Bash.js` and `src/hooks/PreToolUse.Edit.js` respectively and do
not touch this file. Plans build **sequentially**, so there is no concurrent-edit
hazard; the executor reads live at Step 9 and never takes content from a plan.

**This slice is first in its set** and both siblings inherit its repair. It is
independent of them and can build alone.

If an existing enforcement test breaks, it is **not declared here**: stop, name the
file and the exact change, and ask.

## Decisions Taken Under Ambiguity

1. **A dangling link is REFUSED rather than followed one hop.** Following would be more
   precise and would permit an in-tree dangling link, but it re-introduces
   link-following, cycle risk and a hop budget into the module whose whole purpose is
   to not be fooled by links. The refused shape measured zero occurrences in this
   repository. Fail-closed and bounded beats precise and recursive in a permission
   check.
2. **The detection is `lstat`, not `readlink`.** `lstat` answers the only question that
   matters — does the entry exist — without reading the target, so nothing about the
   link's contents enters the decision or the logs.
3. **The `lstat` failure continues the walk rather than denying.** A failing `lstat`
   after a failing `realpath` means the entry is genuinely absent, which is the
   ordinary new-file case; denying there would deny every `Write`. A fault that is
   NOT absence still lands on the existing non-`ENOENT` DENY one line up.
4. **`'dangling'` is a new reason rather than a reuse of `'resolve-failed'`.** No caller
   branches on a reason, so this costs nothing at runtime, and Step 13's report is
   evidence only if it can name which fault fired.
5. **The count ratchets are declared in `files:` rather than left to be moved out of
   scope.** The sibling slice had to record them as an out-of-scope move; declaring
   them is honest about what the slice touches. Ratchet-only is stated at the
   declaration, so the width is bounded by the plan text even though the glob is not.
6. **Nothing is asserted that planning could not verify.** The errno for a dangling
   link, the timing, the extra syscall count and the presence of dangling links in
   this repository are all marked MEASURE. The defect itself is marked derived from
   reading and **required to be confirmed or refuted at Step 8**, with refutation
   reported plainly rather than defended.

## Execution Record

All steps 8–16 executed. Files changed:

- `src/lib/real-path-confinement.js` — the `dangling` branch on the `ENOENT` path; a new
  internal `resolveBasis` for strict root resolution; the header's missing-path paragraph
  corrected; `'dangling'` added to the reason vocabulary.
- `tests/a-dangling-link-is-not-a-path-inside-the-tree.test.js` — CREATED, 14 cases.
- `CLAUDE.md` — count ratchet only, 437 → 438 test files, in two places, measured live.
- `tests/readme-numbers.test.js` — NOT changed. Its live-disk equality is on `src/lib`
  (106 modules, unchanged by this slice), so nothing tripped and nothing was touched.

### Step 8: TEST — TDD RED, recorded verbatim BEFORE any src/ change

`node --test tests/a-dangling-link-is-not-a-path-inside-the-tree.test.js`:
`tests 14 · suites 1 · pass 6 · fail 8 · cancelled 0 · skipped 0 · todo 0`

RED as planning derived: case 1, case 2, case 3, case 5, case 13, case 14.
RED and NOT predicted: **case 10** (see the surprise below) and case 12 (a permission
fault on `lstat` — it could not reach the fail-open catch because nothing on either
path called `lstat` at all).
GREEN already, and still green after the fix: case 4, case 6, case 7, case 8, case 9,
case 11.

Case 2 — the ledger claim — was **CONFIRMED, not refuted**: `resolvesUnder('src/anywhere',
'.ctoc/approvals', root)` returned `false` for a link pointing at a not-yet-forged
approval entry, i.e. the write that mints the forged record was reported as an ordinary
source write. Case 13 actual: `{ plan: 'todo/p-link', stage: 'todo', glob: 'link' }` where
`null` was required. Case 14 actual: the real spawned hook emitted no deny at all.

**The errno, MEASURED rather than assumed** — darwin 25.5.0, Node v24.14.1:
`realpathSync` on a dangling link throws `ENOENT` (`syscall: 'stat'`), identical to a
genuinely absent path; `lstatSync` on the same path SUCCEEDS with
`isSymbolicLink() === true`, and on a genuinely absent path throws `ENOENT`. So `lstat`
separates the two facts exactly as the plan required, and the fix fires. The same
`ENOENT` is returned for a dangling link in the middle of a path (`dlink/x.js`).

### THE SURPRISE — a second silent allow in the same walk, not predicted by the plan

The plan's pathological table states "the root itself unresolvable → `escapes: true` →
DENY the whole call". **That row was FALSE in the shipped code.** Measured:

```
escapesRoot('src/x.js', '/tmp/ctoc-absent-99999/nope')  →  {"escapes":false,"reason":null}
resolvesUnder('x.json', '.ctoc/approvals', <same>)      →  false
```

Both predicates PERMITTED. The cause is the same ancestor walk: an unresolvable root has
no nearest existing ancestor worth anchoring to, so the walk SYNTHESISED a fictional root
out of whatever real directory lay above it, and the target — equally non-existent,
walking up through the same fiction — compared as INSIDE it. The sibling slice's own
case 12 passed over this: it asserted `findCoveringPlan` returned `null`, which it did,
but only because a non-existent directory contains no plans to match. The predicate
itself never denied. Fixed here by resolving a comparison BASIS strictly, with no walk.

### Step 9: PREPARE — measured, not assumed

Symbolic links in this repository outside `node_modules/` and `.git/`: **ZERO**, so
dangling links outside those directories are necessarily zero too. The over-refusal in
Decision 1 therefore costs nothing measurable here, and nothing had to be reported to the
human before Step 10.

Extra `lstat` calls for a single new-file `Write`, COUNTED by instrumenting `safe-fs`:

| shape | extra lstat |
|---|---|
| new file whose parent exists (tail depth 1) | **1** |
| the same with a `..` segment | 1 |
| tail depth 5 (`a/b/c/d/new.js`) | 5 |
| an EXISTING target | **0** |

Bounded exactly by the depth of the missing tail, and zero on the existing-path branch —
confirming the placement inside the `ENOENT` branch only.

### Step 12: OPTIMIZE — all six timing numbers, measured on the real repository

200 iterations after 20 warm-up, `findCoveringPlan`, before and after, by installing the
pre-fix module in a controlled window and restoring a byte-identical copy (verified with
`diff`).

| target | BEFORE | AFTER |
|---|---|---|
| existing covered target | 1.114 ms/call | **1.101 ms/call** |
| non-existent target (the `Write` ancestor-walk path) | 1.026 ms/call | **1.014 ms/call** |
| uncovered target | 1.077 ms/call | **1.051 ms/call** |

The added cost is inside run-to-run noise — at most a few hundredths of a millisecond,
roughly 100× under the 10 ms budget, and it falls only on the missing-path branch.

### Step 13: SECURE — the re-attack, by hand, against the built code

| attack | verdict |
|---|---|
| dangling link AT the target | `{"escapes":true,"reason":"dangling"}` |
| dangling link in the MIDDLE of the path | `{"escapes":true,"reason":"dangling"}` |
| CHAINED — `a → b`, `b → <absent>` | `{"escapes":true,"reason":"dangling"}` |
| ledger via a link at a not-yet-forged entry | `resolvesUnder` → `true` (DENY) |
| ledger via a live directory link + a new entry | `true` (DENY) |
| ledger via a PARENT link + a new entry | `true` (DENY) |
| genuinely absent new file (the CONTROL) | `{"escapes":false}` — permitted |
| NUL byte | `{"escapes":true,"reason":"resolve-failed"}` |
| unresolvable root | `{"escapes":true,"reason":"root-resolve-failed"}` |
| link LOOP | `{"escapes":true,"reason":"loop"}` |
| `ENOTDIR` (a file where a directory is expected) | `{"escapes":true}` |
| permission fault on the `lstat` itself | DENY both directions, `assert.doesNotThrow` |

Every one RETURNED. No throw anywhere: a throw reaches `PreToolUse.Edit.js`'s fail-OPEN
catch and becomes an ALLOW, which is the defect this module exists to prevent.

The deny path leaks nothing: `plan-coverage` discards the reason and returns
`{ ok: true, match: null }`, `resolvesUnder` returns a bare boolean. No absolute paths,
no file contents, no stack traces, no errno objects cross the boundary. The link's
CONTENTS are never read — detection is `lstat`, never `readlink`.

**PROBED AND REPORTED, NOT FIXED — the check-then-write race is real and demonstrated:**

```
1. hook resolves      -> {"escapes":false,"reason":null} (permitted)
   <attacker creates a dangling link at that exact path>
2. write landed at    -> OUTSIDE the repository
3. re-resolving NOW   -> {"escapes":true,"reason":"outside-root"} (would deny)
```

The resolution is a point-in-time answer. No in-process hook can close this; it stands as
a residual, now backed by evidence rather than by assertion.

## Verification Evidence

Targeted run — the new file plus the 14 suites the plan names, plus both reachability
fences: `tests 343 · pass 343 · fail 0 · skipped 0`.

Full gated run, `npm test`, verbatim:

```
ℹ tests 10229
ℹ suites 1762
ℹ pass 10229
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
[CTOC test-gate] coverage 99.04% (threshold 99%), skipped 0, failed 0
[CTOC test-gate] PASS
```

The floor stayed at **99** — not lowered, not raised. No whitelist entry was added
anywhere. `real-path-confinement.js` measures 96.15% line coverage; the four uncovered
regions are the documented-unreachable ones (the post-`MAX_ANCESTOR_WALK` return and the
three outermost `catch` blocks, which are second, independent bounds whose whole purpose
is that nothing reaches them). Rather than fake a hit, one genuinely reachable new branch
was pinned instead: a root that is itself a link LOOP, asserted to return
`reason: 'root-loop'`.

`npx eslint --max-warnings 0` clean on both changed JavaScript files.
`npx tsc --noEmit -p .` clean.

**The pipeline still runs.** All **82** declared globs across every plan in `todo/` and
`in-progress/` still resolve to an approved covering plan through `findCoveringPlan`;
**zero** were denied. A wrong root resolution would have denied all 82.

## Step 16 Final-Review Report

The defect is confirmed and closed, and planning's ledger claim is confirmed rather than
refuted: a link pointing at a not-yet-forged approval record was reported as an ordinary
source path, and the real spawned hook now denies it. One material surprise was found
beyond the plan — an unresolvable root PERMITTED on both predicates, a second silent
allow with the same root cause, fixed here.

What this does NOT fix, restated: the Bash channel is untouched and an agent can still
create the link; `isWhitelisted` remains pure arithmetic and reaches outside the tree
through a link; hard links stay invisible to real-path resolution; the check-then-write
race is open and now demonstrated rather than assumed; every other pure-arithmetic path
check in the codebase is untouched; and an in-tree dangling link is now REFUSED, which is
a deliberate behaviour change whose reasoning is Decision 1.

## Decisions Taken Under Ambiguity

7. **The plan CONTRADICTED ITSELF on a failing `lstat`, and the contradiction was
   resolved by splitting on the errno.** The pathological table says "lstat itself fails
   on the ENOENT branch → `resolve-failed` → DENY"; Decision 3 says a failing `lstat`
   CONTINUES the walk. Both are right about different faults. `lstat` throwing `ENOENT`
   means the entry is GENUINELY absent — the ordinary new-file case — and continues the
   walk, because denying there would deny every `Write`. `lstat` throwing anything else
   (`EACCES`, `ELOOP`, `ENOTDIR`, a `validatePath` TypeError) is a fault we cannot see
   through and DENIES with `resolve-failed`. Written at the branch so it is not "tidied"
   into one behaviour later.
8. **A comparison BASIS is resolved strictly, by a new internal `resolveBasis`, with no
   ancestor walk.** This is the fix for the unpredicted surprise above. It is not
   exported — `tests/export-reachability.test.js` fails an export whose only caller is a
   test, and its two callers are both in this module.
9. **The PROTECTED DIRECTORY keeps the walking resolver, unlike the root.** A project
   that has never minted an approval has no `.ctoc/approvals` directory yet, and
   requiring one to exist would deny every write in such a project. Its tail is anchored
   to a root already proved real, and a DANGLING protected path still refuses through the
   existing `!ok` branch.
10. **`tests/readme-numbers.test.js` was declared but NOT touched.** Its live-disk
    equality is on `src/lib` (106 modules), which this slice does not change. Only
    `CLAUDE.md`'s test-file count moved, 437 → 438, in the two places it appears.
    Declaring a file is permission to touch it, not an obligation.
11. **The fixture root is reached through an EXPLICIT link in case 13**, not through the
    platform's own tmpdir link, so the root-resolution trap is exercised deterministically
    on Linux and Windows and the case is not vacuous off macOS. This carries forward the
    sibling slice's Decision 15.
