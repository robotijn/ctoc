---
title: "Two plans can be given the same number — the allocator looks in one directory out of seven, and returns the first number on a directory it cannot read"
type: implementation
parent_plan: ctoc-background-engine-rebuild
depends_on: none
priority: HIGH
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/lib/plan-numbering.js"
  - "src/hooks/PreToolUse.Write.js"
  - "tests/plan-number-allocation.test.js"
  - ".ctoc/reachability-baseline.json"
---

# Two plans can be given the same number

> **PROVENANCE.** The human observed this on 2026-07-19: two planning agents each
> computed "the next plan number", both received the same answer, both wrote a plan
> numbered `00098`, and one was renumbered by hand. He read it as a concurrency race.
> **It is worse than a race, and the race is the smaller half.** Reading
> `src/lib/plan-numbering.js` on disk found a deterministic single-process collision
> that needs no second agent at all. Both are fixed here because they are one
> allocator.

## What the code actually does

`src/lib/plan-numbering.js:64-88`, read on disk:

```js
function highestImplementationNumber(root) {
  const dir = stageDir(root, 'implementation');
  if (!safeFs.existsSync(dir)) return 0;
  let max = 0;
  for (const f of safeFs.readdirSync(dir)) { /* … max of the 5-digit prefix … */ }
  return max;
}

function nextImplementationPlanNumber(root) {
  return pad5(highestImplementationNumber(root) + 1);
}
```

Three separate defects sit in those fourteen lines.

### Defect A — the allocator scans ONE stage directory; numbers live in SEVEN

The module's own header states the convention: *"a single global, zero-padded
five-digit prefix … ONE global order across every implementation plan"*, and its
`STAGES` constant lists all seven stages — but `highestImplementationNumber` reads
`plans/implementation/` alone. **Plans move between stage directories while their
numbers stay fixed**, so every number that has advanced past the implementation
stage is invisible to the allocator that must not reuse it.

Measured on this repository today:

| Where | Numbers present | Seen by the allocator |
|---|---|---|
| `plans/implementation/` | 00069, 00072, 00073, 00074, 00086, 00089, 00099, 00100, 00101, 00110 | yes |
| `plans/review/` | 00001-00029, 00066, 00068, 00071, 00075-00077, 00079-00081, 00083, 00084, 00087, 00095, 00096, 00098 | **no** |
| `plans/todo/` | 00067, 00078, 00082, 00085, 00088, 00090, 00097 | **no** |
| `plans/functional/` | 00067 | **no** |

The allocator returns `00111` today only because `00110` happens to still sit in
`plans/implementation/`. **The instant the implementation stage empties — which is
precisely what the menu's own "move all to todo" does in one keystroke —
`highestImplementationNumber` returns `0` and the next plan created is `00001`,
colliding head-on with `plans/review/00001-f1-s1-scheduler-file-serial.md`.** The
collision the human hit by racing two agents is reachable by one agent pressing one
key.

### Defect B — an unreadable directory returns the SUCCESS value

`if (!safeFs.existsSync(dir)) return 0;` → `pad5(0 + 1)` → `"00001"`. **A missing,
unreadable, or permission-denied plans directory does not refuse; it hands back the
lowest number in the repository.** This is the repository's named defect class
verbatim — a function reporting a verdict on input it never received, with the
no-input default set to the success value. `CLAUDE.md` names the fixed exemplar for
exactly this: `src/scripts/test-gate.js`'s parsers return `null`, never `0`.

"There are no plans yet" and "I could not read the plans directory" are different
facts and must stop being the same number. Note the asymmetry with the coverage
floor: an absent baseline there is a legitimate state that keeps a default. Here,
absent-and-unreadable **both** produce a number that is guaranteed to collide the
moment the premise is wrong, so the only safe unreadable behaviour is refusal.

### Defect C — no allocation step, so two agents can both win

Even with A and B fixed, `nextImplementationPlanNumber` is a pure read. Two agents
that read before either writes both compute the same answer. This is the lost update
the human saw.

**The task registry already solved this shape** —
`src/lib/task-registry.js:49-64` carries a `generation` counter, `save` refuses with
`StaleRegistryError` when the on-disk generation moved, and `withRegistry` reloads
and re-applies under a bounded retry. **That mechanism is not reused here, and the
reason is recorded as a decision below rather than assumed:** a generation counter
protects one JSON file that is its own source of truth. The plan numbers' source of
truth is *the set of filenames across seven directories* — copying a compare-and-swap
counter beside them would create a second encoding of the same rule that can drift
out of agreement with the filenames, which is the hazard this repository has spent
the day removing. What IS reused is the *shape*: detect the conflict, refuse, reload,
retry, bounded.

### Where the allocator is called from — and why that is the hard part

**`nextImplementationPlanNumber` has no JavaScript caller. There is no `createPlan`
function anywhere in `src/`.** Plans are created by an agent writing a markdown file,
directed by one line of prose in `src/commands/menu.md:52`:

> derive the global zero-padded number FIRST: `node -e "…nextImplementationPlanNumber(process.cwd())"` … never hand-count

`src/lib/plan-numbering.js` is consequently listed in
`.ctoc/reachability-baseline.json:28` as **unreachable — dead code**. And
`plans/implementation/00069-…:610` records an executor doing exactly what an
uncheckable instruction invites: *"Plan number 00069, derived manually."*

**This is the human's own ruling made concrete: a rule that cannot be checked is a
wish.** The instruction is a wish. Fixing the allocator's arithmetic without giving
it a mechanism leaves a correct function nobody is obliged to call.

## Implementation Details

### File: `src/lib/plan-numbering.js`
**Action:** MODIFY
**Purpose:** One allocator, all seven stages, refusing rather than guessing.

1. **`highestPlanNumber(root)` replaces `highestImplementationNumber(root)`** and
   scans every stage in the module's existing `STAGES` constant. Keep the old name as
   a thin alias so no existing test or caller breaks; its documentation must say it
   is global, not implementation-scoped.
2. **Refuse on unreadable input.** Distinguish three cases explicitly:
   - `plans/` itself absent → a legitimate fresh project → `00001`, and say so.
   - a stage directory absent → normal (not every stage exists) → contributes nothing.
   - `plans/` present but a `readdirSync` throws (permissions, I/O) → **THROW**,
     naming the repository-relative directory and the underlying error. Do not return
     a number derived from directories that were read successfully, because the
     unread one is exactly where the higher number may live.
3. **`allocatePlanNumber(root)` — the atomic claim.** Compute the next number, then
   stake it by creating `.ctoc/state/plan-numbers/<number>` with the exclusive-create
   flag (`{ flag: 'wx' }`), which is atomic on Windows, macOS and Linux. On `EEXIST`
   another agent won the number: **re-scan and retry**, bounded to 50 attempts, no
   sleep and no busy-wait — the retry's whole cost is the rescan, which is the work
   needed to re-decide anyway. This mirrors `withRegistry`'s bounded reload-and-retry
   without duplicating its counter.
   - **Claims are advisory reservations, never authoritative.** The floor is always
     `max(filename scan, claim files) + 1`. A lost, hand-deleted, or stale claims
     directory can therefore only cause a number to be skipped, never reissued.
     Filenames stay the single source of truth; nothing here can drift into
     disagreeing with them.
   - The claims directory is additive-only. No pruning, no expiry — a 5-byte file per
     plan is cheaper than any reclamation scheme that could reissue a live number.
4. **`findNumberCollisions(root)`** returns every number carried by more than one
   plan file across all stages, as `[{ number, plans: [slug, …] }]`. This is what
   makes the existing damage visible instead of waiting for someone to trip over it.
   It must throw on an unreadable directory for the same reason as (2).

### File: `src/hooks/PreToolUse.Write.js`
**Action:** MODIFY — add a plan-number collision warning
**Purpose:** Turn the wish into a mechanism at the one moment a plan is created.

Writing the file *is* plan creation, and this hook already intercepts every Write,
already recognises a plan write, already calls the plan-index duplicate guard, and
already has a logging path (`.ctoc/logs/plan-index.log`). Read that existing
structure first and **follow it exactly**; do not add a second logging or
notification convention.

When the write target is `plans/<stage>/<NNNNN>-<slug>.md` and `NNNNN` is already
carried by a different plan slug anywhere under `plans/`, emit a loud warning to
stderr and the log naming both plans and the next free number.

- **It warns; it does not block.** The duplicate guard in this same file
  deliberately "never emits a deny/block decision", and a plan write blocked by a
  false positive would cost more than the collision. Following the precedent already
  in the file also keeps the change small.
- **The hook fails open.** Any error inside this check leaves the write untouched, as
  every other branch in this hook already does. A numbering check must never be able
  to stop work.
- This is honestly a **detector**, not enforcement, and the plan says so rather than
  implying otherwise.

### File: `tests/plan-number-allocation.test.js`
**Action:** CREATE
**Purpose:** Drive the branches that produced the collision.

| # | Case | Assertion |
|---|---|---|
| 1 | numbers across stages are all seen | plans numbered in `review/` and `todo/` only, empty `implementation/` → next is above the highest, **not `00001`** — the deterministic collision, reproduced |
| 2 | the real repository shape | fixture mirroring today's spread → the answer exceeds every number present anywhere |
| 3 | **an unreadable stage directory REFUSES** | `plans/` present, a stage dir made unreadable → throws, naming the relative path. It must NOT return a number. Skipped with a stated reason only where the platform cannot revoke read (document the skip; never let it pass silently) |
| 4 | a genuinely empty `plans/` returns `00001` | the legitimate fresh-project path still works |
| 5 | an absent stage directory is normal | contributes nothing, no throw |
| 6 | **two allocations never collide** | `allocatePlanNumber` called twice without an intervening file write returns two different numbers — the lost update, reproduced |
| 7 | interleaved allocation and creation | allocate, write the plan, allocate again → strictly increasing |
| 8 | the claim is advisory | delete the claims directory → the next number is still above every filename (skip, never reissue) |
| 9 | retries are bounded | claims pre-created for a contiguous block beyond the retry bound → refuses loudly rather than looping |
| 10 | `findNumberCollisions` finds a real duplicate | two plans at `00042` in different stages → one row naming both |
| 11 | `findNumberCollisions` reports none cleanly | distinct numbers → `[]`, and `[]` is reachable only from a completed scan |
| 12 | non-numbered plans are ignored | a plan with no prefix neither counts nor crashes |

Cross-platform: `path.join`, `os.tmpdir()`, teardown via
`fs.promises.rm(root, { recursive: true, force: true })`. Case 3 must state its
platform condition explicitly — a permissions test that quietly no-ops on one
platform is itself a check reporting a verdict it never earned.

### File: `.ctoc/reachability-baseline.json`
**Action:** MODIFY — remove one paid-down entry
**Purpose:** Claim the wiring; the fence fails loudly if you do not.

Wiring `plan-numbering.js` to the Write hook makes it reachable from a registered
root, so `"src/lib/plan-numbering.js"` leaves `unreachable` and `maxUnreachable`
drops. **Read the live count from the analyzer — never trust a number written in a
plan**, this one included. `unreachable` is DEBT that may only shrink; `whitelist` is
a permanent exemption that starts empty and stays empty here. Conflating them is what
kills a fence.

> **CONCURRENT-EDIT CONFLICT — READ BEFORE TOUCHING THIS FILE.** An executor is
> working on `src/lib/reachability.js` and its tests at the time of writing, and that
> work may re-seed this same baseline. **Do not merge, guess at, or reconstruct a
> count.** Re-run the analyzer, take the number it prints, and if the baseline has
> moved underneath this slice, re-derive from the fresh output. This slice declares
> no file under `src/lib/reachability.js`.

---

### Wiring — the live call sites

| change | live call site | root |
|---|---|---|
| `allocatePlanNumber`, `highestPlanNumber` | `src/hooks/PreToolUse.Write.js` collision check | the registered PreToolUse Write hook — fires on every plan write |
| `findNumberCollisions` | same hook (computes the "already taken by" half of the warning) | same |
| the corrected arithmetic | also read by the `menu.md` instruction, which keeps working unchanged | `/ctoc:menu` |

Nothing here is reachable only from a test. The hook is registered in the plugin
manifest and runs whether or not the agent obeys the prose.

## What this does NOT fix

- **It does not block a colliding write.** It warns loudly. An agent that ignores the
  warning still creates the collision, and `findNumberCollisions` is then how it is
  found. Stated plainly because the difference between a warning and a gate is the
  subject of this whole batch.
- **It does not renumber the existing backlog.** `renumberImplementationPlans` is
  untouched. Any collision already on disk is reported, not repaired.
- **It does not make the `menu.md` instruction checkable.** That prose remains a wish;
  the hook is the mechanism that makes the wish unnecessary.
- **It does not coordinate across machines.** The exclusive-create claim is atomic on
  a local filesystem. On a network filesystem without atomic `O_EXCL` two agents on
  two machines could still both win. Out of scope, and named so nobody assumes
  otherwise.
- **It does not touch approval records.** See the verification note below.

## Verify before relying on it — the approval-key claim

The human's note says nothing was corrupted "because the approval records key on the
full slug rather than the number". **Reading `.ctoc/approvals/` supports this** — the
sampled record keys on `"plan_basename": "pi6-s1-conflict-detect-core"`, a full slug,
and `src/lib/streaming-gate.js:428` builds that key with
`path.basename(planPath).replace(/\.md$/i, '')`. So a number collision between two
*different* slugs does not merge two approval records.

**Confirm this at Step 9 by reading the ledger's own key derivation rather than
trusting this paragraph**, and report the finding either way. If any record anywhere
keys on the number alone, this slice's severity changes and it must be reported
before the fix lands, not after.

## Execution Plan (Steps 8-16)

### Step 8: TEST
- Write `tests/plan-number-allocation.test.js` in full and run ONLY that file, before touching any source.
- **Cases 1, 3 and 6 MUST be RED.** Record each red verbatim, including the number actually returned — "the allocator returned `00001` against a repository holding twenty-nine plans" is the evidence, and a plan that merely asserts it is worth less than the output.
- Reproduce Defect A end-to-end first: build a fixture with an empty `plans/implementation/` and numbered plans in `review/`, call `nextImplementationPlanNumber`, and record that it returns `00001`.

### Step 9: PREPARE
- Read from disk: `src/lib/plan-numbering.js` in full; `src/lib/task-registry.js:49-64` and `withRegistry` (the retry shape being mirrored, not copied); `src/hooks/PreToolUse.Write.js` in full (its plan-write detection, its duplicate-guard call, its logging path, its fail-open discipline); `src/commands/menu.md:52`; `.ctoc/reachability-baseline.json`.
- Read `src/lib/streaming-gate.js` around line 428 and the approval-ledger key derivation, and settle the approval-key question above. Report the answer.
- List every plan number across all seven stage directories and record the real spread. Where the code disagrees with this plan, **THE CODE WINS** — record it.

### Step 10: IMPLEMENT
- `src/lib/plan-numbering.js` — global scan; refuse on unreadable; `allocatePlanNumber` with the bounded exclusive-create claim; `findNumberCollisions`.
- `src/hooks/PreToolUse.Write.js` — the collision warning, following the existing plan-write/logging structure exactly, fail-open.
- `tests/plan-number-allocation.test.js` — the twelve cases.
- `.ctoc/reachability-baseline.json` — remove `src/lib/plan-numbering.js`, lower `maxUnreachable` to the **live measured** count.

### Step 11: REVIEW
- Confirm no path in the allocator returns a number derived from a directory it failed to read.
- Confirm the claims directory can only cause a skip, never a reissue: delete it mid-test and re-verify.
- Confirm the hook still fails open on every new branch, and that a collision warning cannot become a block.
- Confirm `renumberImplementationPlans` still passes its existing tests unmodified. If one asserts implementation-only scanning, the **code is right**; correct that test toward the real behaviour, never loosen it.

### Step 12: OPTIMIZE
- The scan reads seven directory listings, no file contents. Bound it there; do not open plan files to find a number that is in the filename.
- The hook's check must add no measurable latency to a non-plan write — return before any directory read when the target is not a numbered plan path.

### Step 13: SECURE
- Refusal and warning messages name repository-relative paths only, never an absolute home directory.
- The number parsed from a filename is bounded and validated before use; a crafted filename cannot drive an unbounded loop or a path outside `plans/`.
- The claim filename is derived from a validated integer, never from caller-supplied text — no path traversal into `.ctoc/state/`.
- Fixtures write only under `os.tmpdir()` and never touch the real `plans/` or `.ctoc/state/`.

### Step 14: VERIFY
- `node --test tests/plan-number-allocation.test.js tests/plan-numbering.test.js tests/plan-numbering-coverage.test.js` green.
- Reachability and export-reachability fences green, with the baseline count **measured**, not predicted.
- Full gated run `npm test`: lint at `--max-warnings 0`, typecheck clean, coverage at or above the enforced floor, 0 skipped except any documented platform skip in case 3, fail 0.
- Run `findNumberCollisions` against the **real repository** and report the result verbatim. Zero is a real and useful answer; a non-zero result is a finding to surface, not to fix here.

### Step 15: DOCUMENT
- Record in `CLAUDE.md` that plan numbers are global across all stages, allocated through `allocatePlanNumber`, and that a collision is detected at write time by the PreToolUse Write hook — including the plain statement that the hook **warns and does not block**.
- Update the documented test-file count in **both** places, reading the live count from disk first (`tests/doc-counts.test.js` compares against disk).

### Step 16: FINAL-REVIEW
- Report: files changed; the Step 8 reds verbatim with the numbers actually returned; the measured `maxUnreachable` movement; the real-repository collision scan; the approval-key finding; the before/after documented test-file count; and every decision taken under ambiguity.

## Decisions Taken Under Ambiguity

1. **The filenames are the source of truth; the claims directory is advisory.** The
   alternative — a counter file that is authoritative — can drift out of agreement
   with the filenames, and then the number in a plan's name and the number the system
   believes it holds disagree with no way to tell which is right. Advisory claims make
   the failure mode a skipped number, which costs nothing.
2. **The task registry's compare-and-swap generation counter is deliberately NOT
   reused.** Its shape is mirrored (detect, refuse, reload, bounded retry) but its
   encoding is not copied, because the registry protects a single JSON file that is
   its own truth, while plan numbers live in filenames across seven directories. A
   second encoding of one rule is the hazard being removed elsewhere this week.
3. **Absent and unreadable are treated differently, and the split is the fix.** An
   absent `plans/` is a legitimate fresh project and returns `00001`. A present but
   unreadable directory REFUSES. Collapsing them is the original defect; refusing on
   absence would break every new project.
4. **The unreadable case throws rather than warning.** A warning above a returned
   number is indistinguishable from success to the agent consuming the number, and
   the whole defect is that a broken read looked like an answer.
5. **The write hook warns rather than blocks.** It follows the precedent of the
   duplicate guard in the same file, and a false positive that blocks a plan write
   costs more than the collision it prevents. This is stated as a detector, not as
   enforcement.
6. **The `menu.md` prose is left in place, not deleted.** It is still the fastest path
   for an agent that reads it, and it is now merely redundant rather than
   load-bearing. Deleting it would remove a helpful hint to fix a problem the hook
   already solves.
7. **Claims are never pruned.** Any expiry policy risks reclaiming a number held by a
   plan that has not yet been written to disk. A few kilobytes over the project's life
   is the cheaper trade.
8. **The retry bound is 50, higher than `withRegistry`'s 5.** Each retry here is a
   cheap rescan with no contention on a shared lock, and the bound exists only to
   convert a pathological loop into a loud failure, not to ration attempts.
9. **`highestImplementationNumber` is kept as an alias rather than deleted.** It is
   exported and covered by two existing test files; removing it would force
   unrelated churn in this slice. Its documentation is corrected to say the scan is
   global.
