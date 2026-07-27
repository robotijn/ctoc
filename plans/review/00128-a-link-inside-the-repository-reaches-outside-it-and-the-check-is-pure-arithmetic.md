---
approved_by: human
approved_at: 2026-07-19T21:31:41.110Z
gate_crossed: implementation → todo
---

---
title: "A link inside the repository reaches outside it — root confinement is pure path arithmetic and cannot see through a symbolic link"
type: implementation
parent_plan: ctoc-background-engine-rebuild
depends_on: none
priority: CRITICAL
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/lib/real-path-confinement.js"
  - "tests/a-link-cannot-leave-the-repository.test.js"
  - "src/lib/plan-coverage.js"
  - "src/hooks/PreToolUse.Edit.js"
---

# A link inside the repository reaches outside it

## The defect, reproduced by the sibling executor and confirmed by reading

An approved plan declaring a path through an in-repository symbolic link that points
outside matched a file whose real location is outside the repository. The sibling
slice probed this at its Step 13 and recorded it: **PROBED AND CONFIRMED (reported,
not fixed).**

Reading the code shows exactly why, and it is not subtle.
`plan-coverage.scanForCoverage` computes confinement at `:376-407`:

```js
const absTarget = path.isAbsolute(targetFile) ? targetFile : path.join(root, targetFile);
relRaw = path.relative(root, absTarget);
relTarget = relRaw.replace(/\\/g, '/');
```

then rejects `relTarget === '..'`, a `../` prefix, or an absolute result. Every
operation there is **string arithmetic on the `path` module**. `path.relative` does
not touch the filesystem and has no idea whether any segment is a link. Given a
repository at `/repo` containing `link → /outside`, a target of `/repo/link/x.js`
produces `relTarget === 'link/x.js'` — a clean, confined, repository-relative path.
Confinement passes. The file written is `/outside/x.js`.

## What is NOT wrong, stated precisely so this is not read as a broken guard

The sibling slice read the confinement logic line by line and it holds in every
dimension it can see:

- the target-side check rejects `..`, a `../` prefix on either separator, and an
  absolute result including the Windows cross-drive case;
- `globEscapesRoot` (`:344-351`) normalizes and rejects a glob resolving to `..` or
  `../…`, so `files: ["../../**"]` is ignored;
- an absolute glob such as `/etc/passwd` survives the glob check but can never match,
  because the target side is always a root-relative path.

This is a gap in **one dimension**: the check reasons about names, and a link is a
fact about the filesystem rather than about a name. No amount of better arithmetic
closes it. Only asking the filesystem does.

## The finding planning made that the report did not name, and it is worse

The same blindness sits under the **approval ledger** guard, which is the thing that
makes every other permission real.

`PreToolUse.Edit.js` denies writes beneath `.ctoc/approvals/` at `:405-409`, via
`isProtectedLedgerPath` → `normalizeForProtection` (`:130-143`) →
`isUnderProtectedDir` (`:157-162`). Read them: `path.relative`,
`path.posix.normalize`, `startsWith`. **Pure arithmetic again.** So:

1. an in-repository link `src/anywhere → ..` (the repository's parent), or directly
   to `.ctoc/approvals`;
2. an executor whose approved plan declares `src/**`;
3. a write to `src/anywhere/.ctoc/approvals/forged.json`.

`normalizeForProtection` yields `src/anywhere/.ctoc/approvals/forged.json`, which does
not START with `.ctoc/approvals`, so the ledger guard does not fire. The whitelist
does not match. Coverage matches `src/**` and **allows**. The write lands in the real
ledger, and the ledger is what the sibling slice called "genuinely unforgeable by an
agent" — the single predicate every approval in this system rests on.

**What is verified and what is not**, kept apart:

- **VERIFIED by reading**: both guards are pure path arithmetic and neither resolves a
  real path. The bypass follows from the code as written.
- **VERIFIED by the sibling executor**: an in-repository link does reach outside
  through the coverage check.
- **NOT VERIFIED**: whether an agent can CREATE such a link on the Bash channel.
  `PreToolUse.Bash.js` guards the ledger by matching path text, and a command like
  `ln -s .. src/anywhere` never mentions `.ctoc/approvals` at all — but whether `ln`
  is treated as a write, and whether the guard fires, **was not tested during
  planning and is not asserted here.** Step 13 probes it and records the result.

The fix does not depend on that answer. A link can arrive from a checkout, a
dependency's install step, a build tool, or a human, and the guard must hold
regardless of who made it. But the answer changes how urgent the Bash side is, so it
is measured rather than assumed in either direction.

## Where resolution belongs — the question asked, answered by the code

**On the TARGET: yes, and it is sufficient.**

**On the PATTERN: no, and it is not even well-defined.** A pattern is a glob, not a
path — `src/**` names no filesystem object, so there is nothing to resolve. Resolving
its literal prefix would be neither necessary nor sufficient: not necessary, because
any target reached through a link is caught on the target side no matter which pattern
matched it; not sufficient, because the link can sit in the part of the path the
wildcard covers, where the pattern has no literal to resolve. **The target check
subsumes the pattern check**, so adding one would be cost with no coverage.

**On the ROOT: yes, and forgetting it breaks everything.** The comparison basis must
itself be a real path. On macOS `/tmp` is a symbolic link to `/private/tmp`, and every
test fixture in this repository lives under `os.tmpdir()`. Comparing a resolved target
against an unresolved root would report **every fixture path as escaping** — the fix
would fail closed on the entire test suite, which is precisely the "worse than the
broad check" outcome that gets a permission fix reverted. Both sides are resolved, or
neither is meaningful.

## The cost, and the honest bound on it

This runs on every Edit, Write, MultiEdit and NotebookEdit call.

- **One resolution per call, not per plan and not per glob.** It is computed once in
  `scanForCoverage`, before the stage loop, immediately after the existing arithmetic
  confinement passes. A target rejected by arithmetic never reaches the filesystem.
- The root's resolution is computed once per call alongside it.
- Resolution of a path that **does not exist yet** — a `Write` creating a new file —
  cannot use `realpathSync` directly, which throws `ENOENT`. Walk up to the nearest
  EXISTING ancestor directory, resolve that, and rejoin the unresolved tail. The tail
  contains no links **because it does not exist**, so the result is exact rather than
  approximate.
- Expected cost is a handful of `lstat`-class syscalls: sub-millisecond on a local
  filesystem, potentially much worse on a network mount.

**MEASURE AT STEP 9.** Planning had no shell. The sibling slice's budget applies
unchanged: **above roughly 10 milliseconds per call, stop and report** rather than
shipping a hook that makes every edit feel slow.

## Fail CLOSED, and again it must be built as never-throw

A permission check that allows because it could not look is the whole defect.
`PreToolUse.Edit.js:468-472` catches everything and fails OPEN, so a **throw** out of
this code becomes an **allow**. Fail-closed here therefore means **return a refusing
value, never throw**:

| situation | verdict |
|---|---|
| resolution succeeds, real path is inside the resolved root | permitted to continue |
| resolution succeeds, real path is OUTSIDE the resolved root | **DENY** |
| the target does not exist, and neither does any ancestor up to the root | resolve the root itself; the tail is unresolvable-but-inside → permitted |
| `realpathSync` fails for any reason other than a missing path (`EACCES`, `ELOOP`, `ENOTDIR`) | **DENY** |
| the root itself cannot be resolved | **DENY the whole call** |
| any unexpected error | **DENY**, returned — never thrown |

`ELOOP` deserves its own line: a link cycle is exactly what an attacker builds to make
a resolver hang or throw, and its verdict must be DENY rather than an exception that
becomes an allow one frame up.

## Implementation Details

### Dependency graph

```
src/lib/real-path-confinement.js  (NEW)
  ├─requires→ path
  └─requires→ src/lib/safe-fs.js      [existing; realpathSync is already exported]

src/lib/plan-coverage.js      ──requires→ src/lib/real-path-confinement.js  [NEW edge]
src/hooks/PreToolUse.Edit.js  ──requires→ src/lib/real-path-confinement.js  [NEW edge]
```

No cycle (the new module requires only `path` and `safe-fs`). No layer violation —
both new edges point into `lib/`.

### File: `src/lib/real-path-confinement.js`
**Action:** CREATE
**Purpose:** The ONE encoding of "where does this path REALLY lead". Two guards need
it, and two encodings of a confinement predicate is the divergence surface this
codebase names by name.

Exports:

- `resolveExisting(p)` → `{ ok: true, real: string } | { ok: false, reason: string }`
  - Resolves `p` with `safeFs.realpathSync`. On a missing path, walks up to the
    nearest existing ancestor, resolves it, and rejoins the unresolved tail with
    `path.join`. Stops at the filesystem root. Any non-missing failure →
    `{ ok: false, reason }` with a fixed-vocabulary reason (`'resolve-failed'`,
    `'loop'`, `'denied'`). **Never throws.**
- `isWithin(realChild, realParent)` → `boolean`
  - Segment-precise containment: equal, or `realChild` starts with
    `realParent + path.sep`. A same-prefix sibling (`/repo-other`) is NOT within
    `/repo`. **Case-insensitive**, following the precedent already set and justified at
    `PreToolUse.Edit.js:157-162`, where a case-sensitive comparison was a HIGH
    gate-bypass on macOS APFS and Windows.
- `escapesRoot(targetFile, root)` → `{ escapes: boolean, reason: string|null }`
  - Resolves both sides and answers the coverage question. `escapes: true` on every
    fault. **Never throws.**
- `resolvesUnder(targetFile, protectedDirRelative, root)` → `boolean`
  - Answers the hook's question: does this target REALLY land inside a protected
    directory, however it was spelled and whatever links it passed through?
  - **Returns `true` on any fault.** Note the inversion relative to `escapesRoot`:
    here `true` means "protected, deny", so the failing direction is `true`. Both
    functions fail toward DENY; they differ only in which boolean means deny, and that
    must be stated at both call sites or someone will make them "consistent" and
    invert one.

### File: `src/lib/plan-coverage.js`
**Action:** MODIFY — one check, once per call

In `scanForCoverage`, immediately AFTER the existing arithmetic confinement block
(`:398-407`) and BEFORE the stage loop:

```
const conf = realPathConfinement.escapesRoot(targetFile, root);
if (conf.escapes) return { ok: true, match: null, denial: null };
```

Returning `{ ok: true, match: null }` — not `FAILED` — matches exactly how the
existing arithmetic escape is handled at `:406`: an out-of-tree target is not a
scan fault, it is a target no plan may ever cover. The behaviour a human sees is
identical to today's out-of-tree denial, so no new message shape is introduced.

Placement is load-bearing: after the arithmetic, so an obviously-escaping target costs
no syscall; before the loop, so the cost is paid once per call rather than once per
plan.

### File: `src/hooks/PreToolUse.Edit.js`
**Action:** MODIFY — the two protected-path guards

`isProtectedLedgerPath` and `isProtectedVerifyPath` keep their existing arithmetic
check and gain a second, independent one:

```
return isUnderProtectedDir(normalizeForProtection(filePath), LEDGER_DIR)
    || realPathConfinement.resolvesUnder(filePath, LEDGER_DIR, process.cwd());
```

**The arithmetic check is kept, not replaced.** It costs nothing, it catches the
spelling-level evasions the existing tests pin (case variants, `..` that resolves back
inside), and it does not depend on the filesystem being readable. The real-path check
catches what names cannot express. Either one firing is a deny.

The `require` is loaded **fail-soft in its own `try`/`catch`**, matching the four
sibling modules at `:49-56` — but with the opposite consequence, which must be written
into the comment: **if the module fails to load, the arithmetic guard alone remains and
the link path is open.** That is a degradation, not a silent one; it is recorded here
so nobody reads the fail-soft require as "this is optional".

Nothing else in this file changes. Not the whitelist, not the coverage call, not the
escape-phrase check, not the block message, not the fail-open outer catch.

### File: `tests/a-link-cannot-leave-the-repository.test.js`
**Action:** CREATE
**Framework:** `node:test`, real `os.tmpdir()` fixtures, `path.join` throughout,
recursive-force cleanup in `finally`, no shell.

Approval fixtures are minted with the **real `approval-ledger`** over the fixture's own
bytes.

| # | Case | Assertion |
|---|---|---|
| 1 | **the reported defect** — repository with `link → <outside dir>`, an APPROVED plan declaring `link/**`, target `link/x.js` | `findCoveringPlan` returns `null` |
| 2 | **the wildcard variant** — the same link, plan declares `**` (acknowledged) or `link/**`, target `link/nested/deep/x.js` | `null` |
| 3 | **a link that stays INSIDE** — `inner → src/lib`, plan declares `inner/**`, target `inner/x.js` | **covered.** An in-tree link is not an escape, and without this the fix is a blanket denial |
| 4 | **the fixture root is itself reached through a link** — the macOS `/tmp → /private/tmp` shape, reproduced deliberately by passing an unresolved root | **covered.** This is the case that would otherwise break every test in the suite |
| 5 | **a target that does not exist yet** — a `Write` creating `src/lib/brand-new.js` under an approved `src/lib/**` | **covered** — nearest-existing-ancestor resolution, not an `ENOENT` denial |
| 6 | **a non-existent target THROUGH a link** — `link/brand-new.js` | `null` |
| 7 | **the ledger through a link** — `src/anywhere → <repo>/.ctoc/approvals`, target `src/anywhere/forged.json` | `isProtectedLedgerPath` returns `true` |
| 8 | **the ledger through a parent link** — `src/up → <repo parent>`, target `src/up/<repo>/.ctoc/approvals/forged.json` | `isProtectedLedgerPath` returns `true` |
| 9 | **verify evidence through a link** — the same shape against `.ctoc/state/verify` | `isProtectedVerifyPath` returns `true` |
| 10 | **the arithmetic guards still fire** — every existing spelling case (case variants, `.ctoc/state/verify/../verify/x`, `.ctoc/approvals/../x`) | unchanged verdicts — the second check adds, it does not replace |
| 11 | **a link LOOP** — `a → b`, `b → a`, target `a/x.js` | `null`, **no throw, no hang** (bounded — assert the call returns) |
| 12 | **an unresolvable root** | `findCoveringPlan` returns `null`, no throw |
| 13 | **fail closed on a permission error** — stub `safe-fs`'s `realpathSync` on its cached exports object to throw `EACCES`, restore in `finally` | `null` and `isProtectedLedgerPath` `true` — **and no throw**. Asserting the absence of a throw is the point: a throw becomes an allow |
| 14 | **the fence is not vacuous** | the identical fixture with NO link — approved plan, real path, real file | **covered**, proving cases 1, 2 and 6 fail for the link reason and not because the harness never matched anything |

Cross-platform: links are created with `fs.symlinkSync(target, linkPath, 'junction')`
for directories, which Windows permits without elevation. **If link creation fails, the
test FAILS LOUDLY with the platform and the error** — it does not skip. Zero skipped is
a gate here, and a skipped case is a check that reports a verdict on input it never
received.

### Wiring — the live call sites

| change | live call site | root |
|---|---|---|
| `escapesRoot` | `plan-coverage.scanForCoverage` | `PreToolUse.Edit.js:438`, on every Edit/Write/MultiEdit/NotebookEdit call |
| `resolvesUnder` | `isProtectedLedgerPath`, `isProtectedVerifyPath` | `PreToolUse.Edit.js:405` and `:418`, ahead of the `.ctoc/` whitelist |
| `resolveExisting`, `isWithin` | the two above | the same |
| `tests/a-link-cannot-leave-the-repository.test.js` | the suite | `npm test` |

Nothing here is reachable only from a test.

## What this does NOT fix

1. **The Bash channel is not changed.** If an agent can create a link with `ln -s`,
   it still can after this ships. What changes is that the link buys nothing on the
   editing channel. The Bash question is **probed and reported at Step 13**, not fixed
   — narrowing the Bash guard was not asked for and belongs to a plan that declares
   that file.
2. **Hard links are not addressed.** A hard link to a file outside the repository
   cannot be distinguished by real-path resolution — the resolved path IS inside the
   tree. Detecting it needs inode comparison, which is a different check with different
   cross-platform behaviour. **Stated as an open residual, not silently absent.**
3. **Every other pure-arithmetic path check in the codebase is untouched.**
   `isWhitelisted` (`PreToolUse.Edit.js:67-89`) is arithmetic too. It is not changed
   here because a whitelist match grants only `plans/*.md`, `.ctoc/`, `VERSION` and
   `.gitignore` — but **whether a link makes that whitelist reach further is a real
   question, and it is probed and reported at Step 13** rather than assumed harmless.
4. **It does not bound how wide a declaration may be** (`00126`), **does not show the
   human what they are granting** (`00127`), and **does not know which plan is
   building** (`00129`).
5. **No existing link in this repository is removed or reported.** If one exists, Step
   9 names it; deciding what to do about it is the human's.

## Execution Plan (Steps 8-16)

### Step 8: TEST
Write `tests/a-link-cannot-leave-the-repository.test.js` in full and run **only that
file, before touching `src/`**. Record the starting state verbatim.

- **Cases 1, 2 and 6 must be RED** — today an approved plan reaches through a link.
  This is the sibling executor's Step 13 probe reproduced inside the suite. **If they
  are not red, STOP**: the finding is wrong and so is this plan.
- **Cases 7, 8 and 9 must be RED** — this is planning's own finding, the ledger
  through a link, and Step 8 is where it stops being a claim and becomes evidence.
  **If they are GREEN, say so plainly in the Step 16 report and remove the finding
  from this plan** rather than defending it.
- **Cases 3, 4, 5, 10 and 14 must be GREEN already** and must stay green. They are the
  proof this is not a blanket denial and, in particular, case 4 is the proof it does
  not break every fixture in the suite.
- **Case 11** — record whether a link loop currently throws, hangs, or returns.
  A hang is neither an error nor time-bounded and would be a worse defect than the one
  being fixed.
- **Case 13** — record whether a `realpathSync` fault currently reaches the hook's
  fail-open catch.

### Step 9: PREPARE
Read from disk, in full: `src/lib/plan-coverage.js:333-480`;
`src/hooks/PreToolUse.Edit.js:58-190` and `:394-473`; `src/lib/safe-fs.js`'s
`realpathSync` and `lstatSync` (including `validatePath`, which every call passes
through and whose refusals must be handled as DENY, not as an exception);
`src/lib/approval-residency.js`.

Then MEASURE:

1. **Whether this repository contains any symbolic link**, and where. `node_modules`
   is expected to contain them (package managers link binaries); the interesting
   question is whether any exists inside `src/`, `tests/`, `plans/`, `agents/`,
   `skills/` or `.ctoc/`. Report the full list. **If one exists inside a directory a
   plan can declare, report it to the human BEFORE Step 10 proceeds** — it may be
   load-bearing for something.
2. **Timing.** `findCoveringPlan` over the real repository, before and after, for: an
   existing covered target, a non-existent target (the `Write` path, which walks
   ancestors), and an uncovered target. Record all six numbers. **Above roughly 10
   milliseconds per call, stop and report.**
3. **`validatePath`'s behaviour in `safe-fs`** on an absolute path outside the project
   — whether it refuses, and with what. The resolver calls into it on exactly such
   paths, and a refusal must land as DENY rather than as a thrown exception.

Where the code disagrees with this plan, **the code wins and the discrepancy is
recorded.**

### Step 10: IMPLEMENT
One step, files as sub-items.
- `src/lib/real-path-confinement.js` — `resolveExisting`, `isWithin`, `escapesRoot`,
  `resolvesUnder`; total, never throws, bounded ancestor walk.
- `src/lib/plan-coverage.js` — one check after the arithmetic confinement, before the
  stage loop.
- `src/hooks/PreToolUse.Edit.js` — the two protected-path guards gain the second check;
  fail-soft require with its degradation documented.
- `tests/a-link-cannot-leave-the-repository.test.js` — the fourteen cases.

### Step 11: REVIEW
Confirm there is exactly ONE encoding of real-path confinement and that neither
`plan-coverage.js` nor `PreToolUse.Edit.js` contains a second copy. Confirm the
resolution runs ONCE per coverage call, not once per plan or per glob — read the loop
and prove it. Confirm the arithmetic guards are intact and that the new check is
additive in both hook guards. Confirm no `require` points from `lib/` into `hooks/`.
Confirm the ancestor walk is bounded and terminates at the filesystem root on every
platform. Confirm the two opposite failing directions (`escapes: true` denies;
`resolvesUnder: true` denies) are documented at both definitions and both call sites.

### Step 12: OPTIMIZE
Confirm a target rejected by the arithmetic check costs zero syscalls. Confirm the
root is resolved once per call, not once per comparison. Confirm the existing-path
fast path is a single `realpathSync` and that the ancestor walk runs only when the
target does not exist. Record the after-timing against Step 9's before-numbers.

### Step 13: SECURE
This is the security step of a security fix; do it adversarially.
- Confirm every fault path DENIES and **returns rather than throws**: missing path,
  `EACCES`, `ELOOP`, `ENOTDIR`, an unresolvable root, a `validatePath` refusal.
- **PROBE the Bash channel**: can an agent create an in-repository symbolic link with
  `ln -s`, and does `PreToolUse.Bash.js` fire? Try a link that never mentions
  `.ctoc/approvals` (for example one pointing at the repository's parent). **Record the
  verdict either way and REPORT it. Do not fix it here.**
- **PROBE `isWhitelisted`**: does a link make the whitelist reach further than
  `plans/*.md`, `.ctoc/`, `VERSION`, `.gitignore`? Record and report; do not fix here.
- Re-run the ledger-through-a-link probe **by hand** against the built code, in both
  the direct and the parent-link shapes, and record both results.
- Confirm the deny path leaks no absolute paths, no file contents and no stack traces.
- Confirm the ledger and verify-evidence denials still fire ahead of the `.ctoc/`
  whitelist, unchanged.

### Step 14: VERIFY
Targeted run first: `tests/a-link-cannot-leave-the-repository.test.js`,
`tests/unapproved-plan-grants-nothing.test.js`,
`tests/plan-coverage-coverage.test.js`, `tests/enforcement-hook.test.js`,
`tests/pretooluse-edit-coverage.test.js`, `tests/security-enforcement-evasion.test.js`,
`tests/w01-edit-write-deny-protocol.test.js`,
`tests/w01-multiedit-notebookedit-parity.test.js`,
`tests/gate3-verify-evidence-write-deny.test.js`,
`tests/ledger-forgery-closed.test.js`, `tests/e2e-enforcement-and-gates.test.js`,
`tests/false-green-fence.test.js`, `tests/architecture-invariants.test.js`,
`tests/doc-counts.test.js`, `tests/readme-numbers.test.js`.

Then the full gated run `npm test`; record `tests`, `suites`, `pass`, `fail`, the
zero-skipped counter and the coverage line **verbatim**. The floor must not be
lowered. Lint every changed JavaScript file at `--max-warnings 0`.

Then prove the pipeline still runs: every plan in `todo/` and `in-progress/` must still
resolve through `findCoveringPlan` for its own declared files. **This matters more here
than anywhere else in the set** — if the root resolution is wrong, everything is denied,
and a fix that denies everything looks exactly like a fix that works until someone tries
to build. If a plan that should be buildable is not, **stop and report**. **No git
operations.**

### Step 15: DOCUMENT
A file header on `real-path-confinement.js` stating: that names cannot see links and
this is the module that asks the filesystem; why the ROOT must be resolved too, naming
the macOS `/tmp → /private/tmp` case explicitly, because that is the trap that makes a
"simplification" break every fixture; why resolution belongs on the target and not on
the pattern; the bounded ancestor walk and why a non-existent tail contains no links;
and the fail-closed inversion in the form "this module must never throw, because the
hook's catch fails open". A comment at each of the three call sites naming which boolean
means deny.

### Step 16: FINAL-REVIEW
Report: the paths; the Step 8 verbatim red for cases 1, 2 and 6 and — separately and
plainly — whether 7, 8 and 9 were red, confirming or **refuting** planning's own ledger
finding; every symbolic link found in this repository; all six timing numbers; the Step
13 probe verdicts for the Bash channel and for `isWhitelisted`, reported and not fixed;
the hard-link residual restated; the verbatim green from Step 14; the five things this
does NOT fix; and every decision taken under ambiguity.

## Ordering and file conflicts

**A concurrent executor is editing `src/lib/iron-loop.js`, `src/lib/actions.js` and
several test files.** This plan declares none of them. It declares
`src/lib/plan-coverage.js` and `src/hooks/PreToolUse.Edit.js`, neither of which that
executor is named as touching — the executor of this plan must confirm that at Step 9
and **stop and ask** if either has changed.

`src/lib/plan-coverage.js` is also declared by `00126` and `00129`; `src/hooks/PreToolUse.Edit.js`
is also declared by `00129` and by the unapproved `00069` and `00072`. Plans build
**sequentially**, so there is no concurrent-edit hazard; each executor reads live at
Step 9 and never takes content from a plan.

**This plan is independent of `00126`, `00127` and `00129`** and can build in any
position. Its priority is CRITICAL because, unlike the other three, it is an active
bypass of the guard that protects human-approval provenance.

If an existing enforcement test breaks, it is **not declared here**: stop, name the
file and the exact change, and ask — per the sibling slice's Decision 18.

## Decisions Taken Under Ambiguity

1. **Resolution goes on the target and the root, never on the pattern.** A glob names
   no filesystem object; the target check subsumes what a pattern check could catch, and
   a link inside a wildcard's span has no literal for a pattern check to resolve.
2. **The root is resolved too, and this is called out as the trap it is.** Every fixture
   in this suite lives under `os.tmpdir()`, which on macOS is reached through a link.
   Comparing a resolved target against an unresolved root denies everything.
3. **The arithmetic guards are KEPT alongside the real-path guard.** They cost nothing,
   they catch spelling-level evasions the existing tests pin, and they work when the
   filesystem does not. Replacing them would trade one blindness for another.
4. **A non-existent target resolves its nearest existing ancestor.** Denying an
   `ENOENT` would block every `Write` that creates a file — the common case — and would
   be discovered within minutes by an irritated human. The unresolved tail contains no
   links because it does not exist, so the result is exact.
5. **The ledger-through-a-link finding ships WITH the coverage fix rather than being
   reported.** It is the same defect, the same fix, and one call site more; the thing it
   bypasses is the predicate every other permission in this system rests on. Shipping the
   milder half while leaving that open would be filing a ticket, not closing a hole.
6. **The Bash channel is probed but NOT changed.** Narrowing it was not asked for, it is
   a large and delicate guard, and the editing-channel fix stands on its own regardless of
   how a link arrives. The probe result is reported so the human can schedule it.
7. **Hard links are named as an open residual rather than silently omitted.**
   Real-path resolution cannot see them; inode comparison is a different check with
   different cross-platform behaviour and belongs to its own plan.
8. **`ELOOP` gets its own explicit verdict.** A link cycle is the shape an attacker
   builds to turn a resolver into a hang or a throw, and a throw here becomes an allow.
9. **Nothing is asserted that planning could not verify.** The timing, the presence of
   links in this repository, `validatePath`'s behaviour, and whether an agent can create
   a link on the Bash channel are all marked MEASURE or PROBE. The ledger finding is
   marked as derived from reading and **required to be confirmed or refuted at Step 8**,
   with refutation reported plainly rather than defended.

## Execution Record

All steps 8–16 executed. Files changed:

- `src/lib/real-path-confinement.js` — CREATED (the one real-path predicate)
- `src/lib/plan-coverage.js` — one `escapesRoot` check, after the arithmetic, before the stage loop
- `src/hooks/PreToolUse.Edit.js` — fail-soft require + both protected-path guards gain the additive `resolvesUnder` check
- `tests/a-link-cannot-leave-the-repository.test.js` — CREATED, 16 cases
- OUT OF DECLARED SCOPE, moved as count RATCHETS only: `CLAUDE.md` (436→437 test files ×2, 105→106 lib modules) and `tests/readme-numbers.test.js` (the live-disk equality 105→106). See Decision 13.

### Step 8: TEST — TDD RED, recorded verbatim BEFORE any src/ change

`node --test tests/a-link-cannot-leave-the-repository.test.js`:
`tests 14 · suites 2 · pass 6 · fail 8 · cancelled 0 · skipped 0 · todo 0`

RED (the defect): case 1, case 2, case 6, case 11, case 13.
RED (planning's own ledger finding — **CONFIRMED, not refuted**): case 7, case 8, case 9.
GREEN already, and still green after the fix: case 3, case 4, case 5, case 10, case 12, case 14.

Case 1 actual: `{ plan: 'todo/p-link', stage: 'todo', glob: 'link/**' }` where `null` was required —
an approved plan covered a file whose real location was a different temp directory entirely.
Case 7/8/9 actual: `false !== true` — `isProtectedLedgerPath` / `isProtectedVerifyPath` reported
a write whose real destination was the approval ledger as an ordinary, unprotected source path.
Case 11 (link loop): it did NOT hang and did NOT throw — it returned a MATCH (`glob: 'a/**'`),
which is the worst of the three outcomes: a silent ALLOW through an ELOOP path.
Case 13 (realpath fault): the fault did not reach the hook's fail-open catch; it simply never
happened, because nothing on either path called `realpathSync` at all.

### Step 9: PREPARE — measured, not assumed

Symbolic links in this repository, excluding `node_modules/` and `.git/`: **NONE**. `src/`,
`tests/`, `plans/`, `agents/`, `skills/`, `.ctoc/` and `docs/` contain zero links, so nothing
load-bearing had to be reported to the human before Step 10.

`src/lib/plan-coverage.js` and `src/hooks/PreToolUse.Edit.js` were both clean in git at start —
the concurrent executor had not touched either.

Timing BEFORE (200 iterations after 20 warm-up, real repository):
existing covered target **1.130 ms/call** · non-existent target (the Write ancestor-walk path)
**0.926 ms/call** · uncovered target **1.050 ms/call**.

DISCREPANCY, code wins: the plan expected `safe-fs`'s `validatePath` to REFUSE an absolute path
outside the project. It does not — it validates only "non-empty string, no NUL byte", so
`validatePath('/etc/passwd')` is ACCEPTED and `realpathSync('/etc/passwd')` returns
`/private/etc/passwd`. There is no out-of-project refusal to handle. What validatePath DOES throw
on is an empty or NUL-byte path (a TypeError, no `code`), which the resolver maps to DENY via its
non-ENOENT branch. Pinned by the NUL-byte assertions in the predicate tests.

### Step 12: OPTIMIZE — timing AFTER, against Step 9

existing covered target **1.192 ms/call** (was 1.130) · non-existent target **0.953 ms/call**
(was 0.926) · uncovered target **0.974 ms/call**. Cost of the fix is ≈**0.03–0.06 ms/call**,
roughly 170× under the 10 ms budget.

An ARITHMETICALLY escaping target (`../outside.js`) costs **0.001 ms/call** — zero syscalls,
confirming the placement after the arithmetic block. The two hook guards cost **0.024 ms** and
**0.025 ms** per call.

### Step 13: SECURE — probe verdicts, reported and NOT fixed

**The Bash channel: an agent CAN create the link.** `PreToolUse.Bash.js` was driven with real
payloads. `WRITE_PATTERNS` does not contain `ln` at all, and the ledger guard matches PATH TEXT:

| command | verdict |
|---|---|
| `ln -s .. src/anywhere` | **ALLOWED** |
| `ln -s /etc src/anywhere` | **ALLOWED** |
| `ln -s ../.. src/up` | **ALLOWED** |
| `ln -s ../../../ plans/out` | **ALLOWED** |
| `ln -s .ctoc/approvals src/anywhere` | BLOCKED (exit 2) |

Only the command that literally spells `.ctoc/approvals` is stopped. An attacker never needs to:
`ln -s .. src/anywhere` is allowed and reaches the ledger at
`src/anywhere/<repo>/.ctoc/approvals/`. So before this fix the full chain was executable
end-to-end by an agent with no human anywhere in it. NOT FIXED here — `PreToolUse.Bash.js` is
not declared by this plan.

**`isWhitelisted` DOES reach further through a link — confirmed, not assumed.** With
`plans/out → <outside>` and `.ctoc/out → <outside>`, `isWhitelisted` returns `true` for
`plans/out/evil.md` and for `.ctoc/out/anything.json`, i.e. the whitelist grants a write to an
arbitrary location outside the repository. The ledger and verify-evidence directories are now
protected against this (both guards run BEFORE the whitelist and both resolve real paths), but
the general out-of-tree whitelist escape remains open. NOT FIXED here — the plan explicitly
scopes the whitelist out.

Fault paths all DENY by RETURNING: missing path (ancestor walk), `ELOOP` → `loop`,
`EACCES`/`EPERM` → `denied`, `ENOTDIR` → `resolve-failed`, unresolvable root, a `validatePath`
TypeError. Verified by assertion, including `assert.doesNotThrow` — a throw would reach
`enforce()`'s fail-OPEN catch and become an ALLOW.

The deny path leaks nothing: `plan-coverage` discards the reason entirely and returns
`{ ok: true, match: null }`, the same shape as today's arithmetic out-of-tree denial;
`resolvesUnder` returns a bare boolean. No absolute paths, no file contents, no stack traces, no
errno objects cross the boundary.

## Verification Evidence

Targeted run (16 files the plan names, plus the reachability fences): `tests 407 · pass 403 ·
fail 4 · skipped 0` — the 4 were the two documented-count ratchets tripped by adding two files,
nothing else. After moving both ratchets: all green.

Full gated run, `npm test`, verbatim:

```
ℹ tests 10213
ℹ suites 1760
ℹ pass 10213
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
[CTOC test-gate] coverage 99.06% (threshold 99%), skipped 0, failed 0
[CTOC test-gate] PASS
```

The floor stayed at 99 — not lowered, not raised. `real-path-confinement.js` measured 94.20% line
coverage on its first pass; two predicate-level tests were added for the input-guard branches
rather than lowering anything. The three remaining uncovered lines (the post-`MAX_ANCESTOR_WALK`
return and the two outermost catches) are documented-unreachable in the test file's header, not
faked.

`npx eslint --max-warnings 0` clean on every changed JavaScript file. `npx tsc --noEmit -p .`
clean — `resolveExisting` returns a UNIFORM `{ok, real, reason}` shape rather than a discriminated
union, because `checkJs` would not narrow the union across the `!ok` guard (TS2339).

**Re-verified at review reconciliation** (shared-repo counters have since grown; direction is up,
floor held): `npm test` → `[CTOC test-gate] coverage 99.14% (threshold 99%), skipped 0, failed 0`
→ `PASS`; `tsc --noEmit -p .` exit 0; the link-confinement test file runs `tests 16 · pass 16 ·
fail 0 · skipped 0`. Nothing weakened.

**The pipeline still runs.** All **74** declared globs across every plan in `todo/` and
`in-progress/` still resolve to an approved covering plan through `findCoveringPlan`. A root
resolution done wrong would have denied all 74; none were denied.

## Step 16 Final-Review Report

The reported defect and planning's derived ledger finding are BOTH confirmed and both closed on
the editing channel. What this does NOT fix, restated: the Bash channel is unchanged (and the
probe shows an agent really can create the link); hard links are an open residual that real-path
resolution cannot see; `isWhitelisted` remains pure arithmetic and demonstrably reaches outside
the tree through a link; declaration width is unbounded and the human is not shown what they are
granting; and no link in this repository was removed, there being none.

## Decisions Taken Under Ambiguity

10. **`resolveExisting` and `isWithin` are NOT exported**, against the plan's export list. They
    have no caller outside this module, and `tests/export-reachability.test.js` fails an export
    whose only caller would be a test. Exporting the two public predicates (`escapesRoot`,
    `resolvesUnder`) is what the two live call sites need; the plan's own wiring table already
    records the other two as reached only "the same" way, i.e. internally.
11. **`ENOTDIR` DENIES rather than walking up**, per the plan's table. An ancestor that is a file
    means the target is not a path at all; treating it as "missing" and walking past it would
    silently accept a path shape the filesystem has already rejected.
12. **`resolvesUnder` returns `false`, not `true`, for a target that is not a path at all**
    (absent, non-string, empty). That is not a resolver fault — there is nothing to protect — and
    both call sites already guard `targetFile &&`. Returning `true` there would report a null
    target as ledger-protected and change unrelated existing verdicts. Every OTHER fault returns
    `true`, and the distinction is written at the definition.
13. **Two count ratchets outside the declared file list were moved, not stopped on.** Adding one
    library module and one test file tripped `tests/doc-counts.test.js` (against `CLAUDE.md`'s
    documented counts) and `tests/readme-numbers.test.js`'s live-disk equality on `src/lib`. Both
    are pure count ratchets whose comment says in as many words "raised because the disk changed",
    and the executor brief puts ratchets in scope by rule, measured live. Nothing was weakened:
    no assertion loosened, no case deleted, no exemption added. Recorded here because the files
    are outside this plan's `files:` declaration.
14. **`resolveExisting` returns a uniform shape rather than the plan's discriminated union.**
    `tsc --checkJs` would not narrow `{ok:true,real} | {ok:false,reason}` across the `!ok` guard.
    Behaviour is identical; only the type shape changed.
15. **Case 4 was strengthened beyond the plan.** The plan reproduces the `/tmp → /private/tmp`
    shape by relying on macOS's own tmpdir link, which would make the case vacuous on Linux. The
    test instead creates an explicit link pointing AT the fixture root and passes that as the
    root, so the trap is exercised deterministically on every platform.

**Record note (review reconciliation, 2026-07-27):** `src/lib/real-path-confinement.js` on disk
now contains hardening that this slice did NOT ship — the strict comparison-basis resolver
(`resolveBasis`, unresolvable-root DENY) and the dangling-symbolic-link refusal (`reason:
'dangling'` via `lstat`). Those belong to the sibling slice
`00140-a-link-that-points-at-nothing-yet-is-reported-as-a-path-inside-the-tree`, which also
declares this file and builds on top of it; they are recorded in THAT plan, not here. This record
describes exactly what this slice created — `escapesRoot`, `resolvesUnder`, `resolveExisting`,
`isWithin`, the one coverage check, and the two additive hook guards — and remains faithful to it.
