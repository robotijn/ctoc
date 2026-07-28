---
approved_by: human
approved_at: 2026-07-20T09:39:54.720Z
gate_crossed: implementation → todo
---

---
approved_by: human
approved_at: 2026-07-20T08:40:32.419Z
gate_crossed: implementation → todo
---

---
title: "The infrastructure whitelist reaches outside the repository through a link — the one door left that is still pure arithmetic"
type: implementation
parent_plan: ctoc-background-engine-rebuild
depends_on: 00140-a-link-that-points-at-nothing-yet-is-reported-as-a-path-inside-the-tree
priority: HIGH
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/hooks/PreToolUse.Edit.js"
  - "tests/the-whitelist-cannot-leave-the-repository.test.js"
  - "CLAUDE.md"
  - "tests/readme-numbers.test.js"
---

# The infrastructure whitelist reaches outside the repository through a link

## The defect, PROVED rather than derived

This is not a reading. The sibling executor probed it at Step 13 and recorded the
result verbatim: with `plans/out → <outside the repository>` and
`.ctoc/out → <outside the repository>`,

```
isWhitelisted('plans/out/evil.md')      → TRUE
isWhitelisted('.ctoc/out/anything.json') → TRUE
```

The whitelist grants a write to an arbitrary location outside the repository.

Reading `src/hooks/PreToolUse.Edit.js:75-97` shows why, and it is the same one-line
cause as everywhere else in this set:

```js
if (norm === '' || norm === '..' || norm.startsWith('../') || norm.includes('/../')) return false;
norm = path.posix.normalize(norm);
if (norm.startsWith('../')) return false;
```

`path.relative`, `path.posix.normalize`, `startsWith`, a regular expression. Every
operation is string arithmetic on the `path` module. Not one touches the filesystem,
and a symbolic link is a fact about the filesystem rather than about a name. The
traversal rejection is correct and complete for what it can see; `plans/out/evil.md`
contains no `..` at all.

## Why this matters, stated at the right size rather than inflated

The approval ledger and the Gate-3 verify-evidence store are **already protected**: both
guards run at `enforce()` steps 0 and 0b, ahead of the whitelist, and both now resolve
real paths. So this is not a second route to forging an approval.

What it is: **the whitelist is the one path in the editing channel that grants a write
with no covering plan at all.** Its whole justification is that the four things it
grants — `plans/*.md`, `.ctoc/`, `.local/`, `VERSION`, `.gitignore`, `.gitattributes` —
are infrastructure inside this repository, small enough and boring enough that
requiring a plan for each would be friction with no safety return. A link makes that
justification false: the grant is no longer bounded by the repository at all, and
`plans/*.md` in particular is a directory every agent writes to routinely, so it is the
most reachable prefix in the list. It is a hole in the same wall the sibling slice
just repaired, one door over.

The write it grants lands **outside** the tree — a user's home directory, a shell
profile, another repository, a Claude configuration file. Nothing in CTOC audits that.

**VERIFIED by the sibling executor**: both probes above, run against the real function.
**VERIFIED by reading**: the cause, at the lines quoted.
**NOT VERIFIED, and measured at Step 9**: what the resolution costs on the hot path,
and whether any legitimate CTOC flow writes to a whitelisted path that is reached
through a link. If one does, **stop and report before Step 10** — this fix would break
it.

## The fix

`isWhitelisted` keeps its entire arithmetic path, and gains one test **after** a pattern
has matched:

```
// The arithmetic above proves the NAME is a whitelisted infrastructure path. It
// cannot prove the path LEADS there: `plans/out → /somewhere/else` produces the
// clean, traversal-free name `plans/out/evil.md`, matches /^plans\/.*\.md$/, and
// grants a write outside the repository. Ask the filesystem before granting.
if (realPathConfinement !== null
    && realPathConfinement.escapesRoot(filePath, process.cwd()).escapes) return false;
return true;
```

**Wiring, not a second encoding** — `escapesRoot` is already built, already live in
`plan-coverage.scanForCoverage`, and repaired for dangling links by the slice this one
depends on. The require already exists in this file at `:57-64`, fail-soft, with its
degradation documented; no new import is added.

**Placement is load-bearing.** The resolution runs only when a whitelist pattern has
already matched. An edit to `src/lib/x.js` matches nothing, returns `false` from the
loop, and costs **zero syscalls** — and that is the overwhelming majority of edits.
Only the small set of infrastructure writes pays for resolution, and the sibling slice
measured that resolution at roughly 0.03 milliseconds.

### What a `false` from `isWhitelisted` actually does — traced, not assumed

Returning `false` is **not** a denial. It falls through `enforce()`:

1. step 2, CTOC-project detection — a CTOC project, so it continues;
2. step 3, plan coverage — `scanForCoverage` now carries its own `escapesRoot` check
   (shipped by the sibling slice), so a target whose real location is outside the tree
   matches no plan;
3. step 4, escape phrase — a phrase the human typed still allows, exactly as it does
   for any other uncovered file, and that is correct: the human's own escape is not
   something this fix should override;
4. step 5, block, with the ordinary "no active plan covers this file" message.

So the human-visible behaviour is the existing uncovered-file denial, with no new
message shape and no new failure mode. That is deliberate: introducing a fifth outcome
into this hook to say "whitelisted but outside" would be a new thing to get wrong for
no gain.

### THE DENIAL SLOT — this plan is NOT a writer, deliberately

Three plans in this repair program write into `plan-coverage.scanForCoverage`'s single
`denial` slot: the shipped unapproved-plan branch, `00126` (`unanchored-declaration`)
and `00129` (`not-building`). **The canonical ranking rule for that slot is defined in
`00126` under "THE DENIAL SLOT"** — reason severity first, glob specificity as a
tiebreak within a reason — and every writer references it rather than restating it.

**This plan adds no reason and writes no denial**, per Decision 1 above and below: a
whitelist miss is a fall-through to coverage, not a recorded denial. That is stated
here explicitly so that nobody building this slice adds a fourth writer to a slot whose
precedence was settled elsewhere. If a future change to this slice ever needs to record
a denial, it must add its reason to `00126`'s severity table first — never rank it
locally.

### Fail CLOSED, and it must be built as return-never-throw

`enforce()` wraps the whole decision in a catch that allows (`PreToolUse.Edit.js:468-472`),
so **a throw out of a permission check is an ALLOW**. `escapesRoot` returns
`escapes: true` on every fault and never throws; the call site must not wrap it in
anything that converts a fault into a permit. The failing direction is written at the
call site because the neighbouring `resolvesUnder` calls in this same file fail in the
**opposite boolean direction** — both mean DENY, they answer opposite questions, and
anyone unifying them will invert one and reopen a hole.

## Pathological cases at this call site — every one enumerated, with its verdict

The resolver's own table lives in 00140. These are the cases specific to the whitelist.

| case | arithmetic | resolution | `isWhitelisted` |
|---|---|---|---|
| ordinary source file (`src/lib/x.js`) | no match | **never runs** | `false` — the common path, zero syscalls |
| genuine infrastructure write (`plans/todo/x.md`, `.ctoc/settings.json`) | match | inside root | `true` |
| infrastructure file that does not exist yet (`plans/todo/new.md`) | match | ancestor walk → inside root | `true` — the ordinary `Write` |
| **whitelisted prefix through a link out of the tree** (`plans/out/evil.md`) | match | outside root | **`false`** — the defect |
| **whitelisted prefix through a DANGLING link** | match | `dangling` fault | **`false`** — inherits 00140 |
| whitelisted prefix through a link that stays INSIDE (`.ctoc/x → .ctoc/state`) | match | inside root | `true` — an in-tree link is not an escape |
| link **loop** under a whitelisted prefix | match | `loop` fault | **`false`** — no throw, no hang |
| a file where a directory is expected | match | `ENOTDIR` fault | **`false`** |
| permission fault (`EACCES`) resolving the target | match | `denied` fault | **`false`** — a rare false non-grant, which falls through to coverage, not to a hard denial |
| the root unresolvable | match | fault | **`false`** |
| target is not a path at all (absent, empty) | guarded at `:76` | never runs | `false`, unchanged |
| traversal spellings (`plans/../../outside.md`) | rejected at `:88` | never runs | `false`, unchanged |
| the confinement module failed to load | match | **skipped** | `true` — **degraded, and documented**: the arithmetic alone remains and this hole is open again |
| the link is created between this check and the write | — | not seen | not closable by any in-process hook |

The fault rows return `false`, which falls through to coverage rather than denying
outright. That is the correct fail-closed direction **for this predicate specifically**:
`isWhitelisted` grants, so refusing to grant is the safe failure, and the target still
faces every check downstream.

## Implementation Details

### Dependency graph

```
src/hooks/PreToolUse.Edit.js  (MODIFY)
  └─requires→ src/lib/real-path-confinement.js   [EXISTING edge, fail-soft, :63-64]
```

No new edge, no new module, no cycle. `escapesRoot` is already exported and already
consumed by `plan-coverage.js`; this adds a second consumer of an existing export.

### File: `src/hooks/PreToolUse.Edit.js`
**Action:** MODIFY — one check at the end of `isWhitelisted`

The whole arithmetic path (`:75-95`) is unchanged: the relativization, the traversal
rejection, the normalization, the pattern loop. Only the `return true` inside the loop
moves behind the new test, so that a match is a grant **only after** the filesystem
agrees.

Nothing else in this file changes. Not the two protected-path guards, not
`normalizeForProtection`, not `isUnderProtectedDir`, not the coverage call, not the
escape-phrase check, not the block message, not `enforce()`'s step ordering, not the
fail-open outer catch.

**Note on a neighbouring change**: `00129` modifies `buildBlockMessage` in this same
file, adding a reason-keyed remedy table. The two changes do not overlap —
`isWhitelisted` and `buildBlockMessage` are separate functions, and this slice must not
touch the message. Plans build sequentially; read live at Step 9 and stop and ask if
the file has changed shape.

### File: `tests/the-whitelist-cannot-leave-the-repository.test.js`
**Action:** CREATE
**Framework:** `node:test`, real `os.tmpdir()` fixtures, `path.join` throughout,
recursive-force cleanup in `finally`, no shell. `isWhitelisted` is not exported, so the
cases drive the **spawned hook** with a real PreToolUse payload and assert on the
decision, matching `tests/pretooluse-edit-coverage.test.js`'s harness — the same
"a test is a caller, so test the live path" discipline the rest of this set follows.

| # | Case | Assertion |
|---|---|---|
| 1 | **the proved defect** — `plans/out → <outside>`, target `plans/out/evil.md` | **denied** |
| 2 | **the `.ctoc/` variant** — `.ctoc/out → <outside>`, target `.ctoc/out/anything.json` | denied |
| 3 | **the `.local/` variant** — `.local/out → <outside>` | denied |
| 4 | **a dangling link under a whitelisted prefix** — `plans/out → <outside>/notyet` | denied — inherits 00140 |
| 5 | **a link loop under a whitelisted prefix** | denied, **and the process returns** — assert it exits, bounded timeout, no hang |
| 6 | **the fence is not vacuous — real infrastructure writes still work** — `plans/todo/x.md`, `.ctoc/settings.json`, `VERSION`, `.gitignore` | **allowed.** Without this the fix breaks every plan write in the product |
| 7 | **a whitelisted file that does not exist yet** — `plans/todo/brand-new.md` | allowed — the ancestor walk, not an `ENOENT` denial |
| 8 | **an in-tree link under a whitelisted prefix** — `.ctoc/x → .ctoc/state` | allowed — an in-tree link is not an escape |
| 9 | **the fixture root reached through a link** — pass a root that is itself a link | allowed. This is the case that would otherwise deny every fixture in the suite |
| 10 | **the arithmetic rejections still fire** — `plans/../../outside.md`, `.ctoc/../src/lib/x.js`, `..`, empty | unchanged verdicts |
| 11 | **the ledger guard still wins the race** — a link to `.ctoc/approvals` is denied by step 0, **before** the whitelist is consulted at all | denied with the LEDGER reason, not the coverage reason — pins the ordering |
| 12 | **the escape phrase still works** — an out-of-tree whitelisted target with a human-typed escape phrase in the transcript | **allowed.** The human's own escape is not overridden by this fix, and that is deliberate |
| 13 | **the module missing degrades rather than crashes** — spawn with the confinement module unloadable | the hook runs, arithmetic verdicts unchanged, the link case allowed, **matching what the code comment predicts** |
| 14 | **fail closed on a resolution fault** — stub `safe-fs`'s `realpathSync` to throw `EACCES` | not granted by the whitelist, **and `assert.doesNotThrow`** — a throw reaches the fail-open catch and becomes an ALLOW |
| 15 | **non-CTOC project still passes silently** — the whitelist runs before detection, so confirm an ordinary infrastructure write in a non-CTOC directory is unaffected | allowed |

Cross-platform: links are created with `fs.symlinkSync(target, linkPath, 'junction')`
for directories. **If link creation fails, the test FAILS LOUDLY with the platform and
the error** — it does not skip. Zero skipped is a gate here.

### Wiring — the live call sites

| change | live call site | root |
|---|---|---|
| the `escapesRoot` test | `isWhitelisted` | `enforce()` step 1 at `PreToolUse.Edit.js:450`, on every Edit/Write/MultiEdit/NotebookEdit call, and on `PreToolUse.Write.js`'s delegation into the same `enforce()` |
| `tests/the-whitelist-cannot-leave-the-repository.test.js` | the suite | `npm test` |

Nothing here is reachable only from a test.

## What this does NOT fix

1. **The whitelist's WIDTH is unchanged.** `/^\.ctoc\//` still grants every file under
   `.ctoc/` except the two protected directories, with no covering plan. Whether that
   grant is too broad is a real question and a different one; this slice only makes the
   grant stop at the repository boundary.
2. **The Bash channel is untouched.** That is 00141, and it is the channel that creates
   the link in the first place.
3. **Hard links remain invisible** — the resolved path genuinely is inside the tree.
4. **The check-then-write race is not closable.** A link created between the resolution
   and the write is not seen by any in-process hook.
5. **A human-typed escape phrase still allows an out-of-tree write**, deliberately. The
   escape is the human's own instrument and this fix does not take it away.
6. **It does not bound how wide a plan declaration may be, does not show the human what
   they are granting, and does not know which plan is building** — those are separate
   plans in this program. On the last of those, note that `00129` measured that the
   building-plan narrowing **cannot be built today**: no witness of a live build is set
   on the dispatch path in use. Do not assume that gap closes.
7. **If the confinement module fails to load, this hole is open again.** The require is
   fail-soft by necessity (a load-time throw would reach the fail-open catch and allow
   EVERY edit), so the degradation is real, documented, and not silent.

## Execution Plan (Steps 8-16)

### Step 8: TEST
Write `tests/the-whitelist-cannot-leave-the-repository.test.js` in full and run **only
that file, before touching `src/`**. Record the starting state verbatim.

- **Cases 1, 2, 3 and 4 must be RED** — this is the sibling executor's probe reproduced
  inside the suite. **If they are not red, STOP**: the probe or this plan is wrong, and
  the report says which rather than defending either.
- **Cases 6, 7, 8, 9, 10, 11, 12 and 15 must be GREEN already** and must stay green.
  Case 6 is the proof this is not a blanket denial of the product's own infrastructure
  writes; case 11 pins that the ledger guard still runs first.
- **Case 5** — record whether a link loop under a whitelisted prefix currently returns,
  throws or hangs. The sibling slice found a loop returning a MATCH on the coverage
  path, a silent allow; do not assume the same shape here, measure it.
- **Case 13 and case 14** — record the degraded and faulting behaviour before the
  change, so the after state is a comparison rather than a claim.

### Step 9: PREPARE
Read from disk, in full: `src/hooks/PreToolUse.Edit.js:57-97`, `:104-211` and
`:419-500`; `src/lib/real-path-confinement.js` as built by 00140;
`src/hooks/PreToolUse.Write.js`'s delegation into `enforce()`;
`src/lib/plan-coverage.js`'s `escapesRoot` call site, so the second consumer matches the
first.

Then MEASURE:

1. **Timing before and after**, 200 iterations after 20 warm-up, on the real
   repository, for: an ordinary source-file edit (must be UNCHANGED — the resolution
   never runs), a whitelisted existing file (`VERSION`), and a whitelisted
   not-yet-existing file (`plans/todo/new.md`). Record all six numbers. **Above roughly
   10 milliseconds per call, stop and report.**
2. **Whether any legitimate CTOC flow writes to a whitelisted path reached through a
   link.** Enumerate what the product itself writes under `plans/`, `.ctoc/` and
   `.local/`, and check for a link on each. The sibling slice measured zero links in
   this repository outside `node_modules/` and `.git/`; **if that has changed, report
   it to the human BEFORE Step 10** — this fix would break that flow.
3. **Confirm the whitelist runs before CTOC detection** and that adding filesystem
   access there is acceptable in a NON-CTOC project, where this hook is supposed to be
   a silent pass-through. If the added cost is visible there, hoist the check or report.

Where the code disagrees with this plan, **the code wins and the discrepancy is
recorded.**

### Step 10: IMPLEMENT
One step, files as sub-items.
- `src/hooks/PreToolUse.Edit.js` — the `escapesRoot` test at the end of
  `isWhitelisted`, with the failing direction and the fall-through consequence written
  at the call site. **`buildBlockMessage` is NOT touched** — that is `00129`'s.
- `tests/the-whitelist-cannot-leave-the-repository.test.js` — the fifteen cases.
- `CLAUDE.md` and `tests/readme-numbers.test.js` — **count ratchets ONLY**, measured
  live, if adding one test file trips them. Nothing else, no assertion loosened.

### Step 11: REVIEW
Confirm the resolution runs ONLY after a pattern matched — read the function and prove
an ordinary source edit costs zero syscalls. Confirm the arithmetic path is byte-for-byte
unchanged. Confirm there is still exactly ONE encoding of real-path confinement and that
this file contains no copy of it. Confirm the two failing directions now present in this
file (`escapes: true` denies in `isWhitelisted`; `resolvesUnder: true` denies in the two
protected-path guards) are documented at all three call sites. Confirm `enforce()`'s step
ordering is unchanged and that the ledger and verify guards still precede the whitelist.
Confirm no `require` points from `lib/` into `hooks/`. Confirm no denial reason was
added — this slice is not a writer of the shared denial slot.

### Step 12: OPTIMIZE
Confirm the non-whitelisted path costs exactly what it cost before — that is the hot
path and it must not regress at all. Confirm the root is resolved once per call.
Record the after-timing against Step 9's six numbers.

### Step 13: SECURE
This is the security step of a security fix; do it adversarially.
- Re-attack by hand against the built code: each whitelisted prefix in turn
  (`plans/`, `.ctoc/`, `.local/`), through a live link, a dangling link and a loop.
- Confirm every fault path returns `false` from the whitelist and **never throws** —
  `assert.doesNotThrow` explicitly, because a throw reaches `enforce()`'s fail-OPEN
  catch and becomes an allow.
- Confirm the ledger and verify-evidence guards still fire **ahead** of the whitelist,
  and that a link into either is denied with the protected-path reason rather than the
  coverage reason.
- Confirm the fall-through really lands on the block message and not on an allow: drive
  an out-of-tree whitelisted target with no covering plan and no escape phrase, and
  read the emitted decision.
- Confirm the deny path leaks no absolute paths, no file contents and no stack traces.

### Step 14: VERIFY
Targeted run first: the new file, plus `tests/pretooluse-edit-coverage.test.js`,
`tests/enforcement-hook.test.js`, `tests/security-enforcement-evasion.test.js`,
`tests/w01-edit-write-deny-protocol.test.js`,
`tests/w01-multiedit-notebookedit-parity.test.js`,
`tests/gate3-verify-evidence-write-deny.test.js`, `tests/ledger-forgery-closed.test.js`,
`tests/a-link-cannot-leave-the-repository.test.js`,
`tests/a-dangling-link-is-not-a-path-inside-the-tree.test.js`,
`tests/unapproved-plan-grants-nothing.test.js`, `tests/plan-coverage-coverage.test.js`,
`tests/e2e-enforcement-and-gates.test.js`, `tests/false-green-fence.test.js`,
`tests/architecture-invariants.test.js`, `tests/doc-counts.test.js`,
`tests/readme-numbers.test.js`.

Then the full gated run `npm test`; record `tests`, `suites`, `pass`, `fail`, the
zero-skipped counter and the coverage line **verbatim**. The floor must not be lowered.
Lint every changed JavaScript file at `--max-warnings 0` and run `npx tsc --noEmit -p .`.

Then prove the product still runs — **this matters more here than in either sibling**,
because the whitelist is how CTOC writes its own plans, settings and state. Drive
`node src/commands/menu.js` far enough to confirm the dashboard renders, and confirm a
real plan write under `plans/` and a real settings write under `.ctoc/` are still
allowed by the spawned hook. **A fix that stops the product writing its own plans looks
exactly like a fix that works until someone opens the menu.** If either is denied, stop
and report. **No git operations.**

### Step 15: DOCUMENT
A comment at the new call site stating: that the arithmetic proves the NAME is
infrastructure and cannot prove the path LEADS there; that `escapes: true` means DENY
here while `resolvesUnder: true` means DENY in the two guards above, that both mean deny
and anyone unifying them will invert one; that a `false` return is a fall-through to
coverage and not a denial, and where it lands; and that the resolution deliberately runs
only after a pattern matched, so the hot path is untouched.

### Step 16: FINAL-REVIEW
Report: the paths; the Step 8 verbatim red, confirming or **refuting** the sibling
executor's probe; all six timing numbers, with the non-whitelisted path shown to be
unchanged; any link found under a whitelisted prefix in this repository; the loop
behaviour observed at case 5; the Step 13 re-attack results; the verbatim green from
Step 14 including the menu drive and the real plan/settings writes; the seven things
this does NOT fix; and every decision taken under ambiguity.

## Ordering and file conflicts

**Depends on 00140** — the dangling-link repair. Without it, `plans/out → <outside>/notyet`
is reported as inside the tree and the whitelist still grants the write, so building
this slice first would ship a fix with a hole in one of its main shapes.

**Independent of 00141** and buildable before or after it. They touch different files
and different channels: 00141 closes the Bash route to the ledger, this one closes the
editing route out of the tree.

This slice declares `src/hooks/PreToolUse.Edit.js`, which is **also declared by the
unapproved plans 00069 and 00072 and by 00129**. `00129` now declares this slice in its
`depends_on` and therefore builds after it; the two changes are in different functions
(`isWhitelisted` here, `buildBlockMessage` there) and do not overlap. Plans build
**sequentially**, so there is no concurrent-edit hazard; the executor reads the file
live at Step 9, confirms it matches what this plan describes, and **stops and asks** if
it has changed. Never take content from a plan.

**The shared denial slot**: this slice is not a writer of it. The canonical ranking rule
lives in `00126`; see "THE DENIAL SLOT" above for why this slice must not add a reason.

If an existing enforcement test breaks, it is **not declared here**: stop, name the file
and the exact change, and ask.

## Decisions Taken Under Ambiguity

1. **A whitelist miss is a FALL-THROUGH, not a new denial.** Introducing a fifth outcome
   into `enforce()` to say "whitelisted but outside the tree" would be a new message
   shape and a new failure mode for no gain; the target still faces coverage, the escape
   phrase and the block, and lands on the ordinary uncovered-file denial the human
   already knows.
2. **The resolution runs AFTER the pattern match, never before.** The hot path is every
   edit to a source file, and it must cost exactly what it costs today. Resolving first
   would put a syscall on every edit in the product to protect six patterns.
3. **A human-typed escape phrase still allows the write.** The escape belongs to the
   human, not to the agent, and silently overriding it would be this product deciding
   something the human already decided.
4. **Every resolution fault returns `false` — not granted.** `isWhitelisted` grants, so
   refusing to grant is the safe direction; and unlike a hard denial it costs little,
   because the target still faces every downstream check.
5. **The existing fail-soft require is reused rather than made strict.** Making it throw
   would reach `enforce()`'s fail-open catch and allow EVERY edit — strictly worse than
   the degradation it would be trying to prevent. The degradation is documented at the
   require, at the call site, and in this plan's residuals.
6. **The whitelist's width is left alone.** Narrowing `/^\.ctoc\//` is a real question
   and a different one; folding it in would make this slice two changes wearing one plan.
7. **The count ratchets are declared in `files:`** rather than moved out of scope later,
   with ratchet-only stated at the declaration so the plan text bounds what the glob
   does not.
8. **This slice adds NO denial reason and does not write the shared denial slot.** Three
   plans in this program write that one slot; its precedence is settled once in `00126`.
   Recording a "whitelisted but outside" denial here would add a fourth writer under no
   rule, which is the exact defect the shared rule was written to prevent. Consequence
   of Decision 1, stated separately because it is the thing a builder might add without
   noticing.
9. **Nothing is asserted that planning could not verify.** The timing, the presence of
   links under whitelisted prefixes, the loop behaviour and the non-CTOC pass-through
   cost are all marked MEASURE. The defect itself is the sibling executor's recorded
   probe and is **required to be reproduced at Step 8**, with refutation reported
   plainly rather than defended.
