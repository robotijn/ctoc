---
approved_by: human
approved_at: 2026-07-19T18:29:04.141Z
gate_crossed: implementation → todo
---

---
title: "Two plans can be given the same number — the allocator looks in one directory out of seven, returns the first number on a directory it cannot read, and nothing refuses the colliding write"
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
  - "src/commands/menu.md"
  - ".ctoc/reachability-baseline.json"
---

# Two plans can be given the same number

> **PROVENANCE.** The human observed this on 2026-07-19: two planning agents each
> computed "the next plan number", both received the same answer, both wrote a plan
> numbered `00098`, and one was renumbered by hand. He read it as a concurrency race.
> **It is worse than a race, and the race is the smaller half.** Reading
> `src/lib/plan-numbering.js` on disk found a deterministic single-process collision
> that needs no second agent at all.
>
> **HUMAN RULING, 2026-07-19 — this slice REFUSES the colliding write; it does not
> warn.** An earlier draft warned, following the duplicate-guard precedent in the same
> hook. The human overruled it, and his reasoning is load-bearing enough to belong in
> the plan rather than a commit message: *a rule which cannot be checked is a wish, and
> a warning an agent can write straight past is that same shape.* The failure is
> SILENT — nobody reads the warning until a human refers to a number that means two
> different things, which is exactly how today's collision survived until he found it
> by accident. He accepted the cost of a false refusal on the condition that this plan
> **confront** it; see "What counts as a collision" below.

## This is a LIVE defect, measured on disk today

Not a missing capability. A wrong answer being produced now, by a module the plan
pipeline already depends on.

**Independently verified by the coordinator, 2026-07-19:**
`src/lib/plan-numbering.js:64-66` scans ONLY the implementation stage, and
`if (!safeFs.existsSync(dir)) return 0` is the success-value default this repository
has now fixed six times.

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
numbers stay fixed**, so every number that has advanced past the implementation stage
is invisible to the allocator that must not reuse it.

Measured on this repository today:

| Where | Numbers present | Seen by the allocator |
|---|---|---|
| `plans/implementation/` | 00069, 00072, 00073, 00074, 00086, 00089, 00099, 00100, 00101, 00110 | yes |
| `plans/review/` | 00001-00029, 00066, 00068, 00071, 00075-00077, 00079-00081, 00083, 00084, 00087, 00095, 00096, 00098 | **no** |
| `plans/todo/` | 00067, 00078, 00082, 00085, 00088, 00090, 00097 | **no** |
| `plans/functional/` | 00067 | **no** |

The allocator returns `00111` today **only because `00110` happens to still sit in
`plans/implementation/`.** The instant the implementation stage empties — which is
precisely what the menu's own "move all to todo" does in one keystroke —
`highestImplementationNumber` returns `0` and the next plan created is `00001`,
colliding head-on with `plans/review/00001-f1-s1-scheduler-file-serial.md`. **The
collision the human hit by racing two agents is reachable by one agent pressing one
key.**

### Defect B — an unreadable directory returns the SUCCESS value

`if (!safeFs.existsSync(dir)) return 0;` → `pad5(0 + 1)` → `"00001"`. **A missing,
unreadable, or permission-denied plans directory does not refuse; it hands back the
lowest number in the repository.** The repository's named defect class verbatim — a
function reporting a verdict on input it never received, with the no-input default set
to the success value. `CLAUDE.md` names the fixed exemplar: `src/scripts/test-gate.js`'s
parsers return `null`, never `0`.

"There are no plans yet" and "I could not read the plans directory" are different facts
and must stop being the same number. Note the asymmetry with the coverage floor: an
absent baseline there is a legitimate state that keeps a default. Here,
absent-and-unreadable **both** produce a number guaranteed to collide the moment the
premise is wrong, so the only safe unreadable behaviour is refusal.

### Defect C — no allocation step, so two agents can both win

Even with A and B fixed, `nextImplementationPlanNumber` is a pure read. Two agents that
read before either writes both compute the same answer. This is the lost update the
human saw.

**The task registry already solved this shape** — `src/lib/task-registry.js:49-64`
carries a `generation` counter, `save` refuses with `StaleRegistryError` when the
on-disk generation moved, and `withRegistry` reloads and re-applies under a bounded
retry. **That mechanism is deliberately not reused here, and the reason is recorded as
a decision below rather than assumed:** a generation counter protects one JSON file
that is its own source of truth. The plan numbers' source of truth is *the set of
filenames across seven directories* — a counter beside them is a second encoding of one
rule that can drift out of agreement with the filenames, the hazard this repository has
spent the day removing. What IS reused is the *shape*: detect, refuse, reload, retry,
bounded.

### And the allocator that computes all this is DEAD

**`nextImplementationPlanNumber` has no JavaScript caller. There is no `createPlan`
function anywhere in `src/`.** Plans are created by an agent writing a markdown file,
directed by one line of prose in `src/commands/menu.md:52`:

> derive the global zero-padded number FIRST: `node -e "…nextImplementationPlanNumber(process.cwd())"` … never hand-count

`src/lib/plan-numbering.js` is consequently listed in
`.ctoc/reachability-baseline.json:28` as **unreachable — dead code**. And
`plans/implementation/00069-…:610` records an executor doing exactly what an
uncheckable instruction invites: *"Plan number 00069, derived manually."*

**This is the human's own ruling made concrete: a rule that cannot be checked is a
wish.** Fixing the arithmetic without giving it a mechanism leaves a correct function
nobody is obliged to call.

---

## What counts as a collision — the refusal's whole load

A refusal is only as good as its definition of the thing it refuses. **A false refusal
blocks legitimate work, and a fence that fires on ordinary work gets disabled** — both
critics warned about exactly this today. So the predicate is stated exhaustively here,
and the one case that cannot be distinguished is named as undistinguishable rather than
papered over.

The hook sees one thing: a Write to a path, with content. From that it must decide.

### The predicate

> **REFUSE** iff the target path is `plans/<stage>/<NNNNN>-<slug>.md` **and** some other
> file under `plans/` is named `<NNNNN>-<different-slug>.md`.
>
> Same number **plus** a different slug **plus** a different path. All three.

### Every case, and how it is distinguished

| # | Situation | Target | On disk | Decision | How it is distinguished |
|---|---|---|---|---|---|
| 1 | **genuine collision** — two planners, same number | `implementation/00098-baz.md` | `review/00098-foo.md` | **REFUSE** | same number, **different slug** |
| 2 | **plan MOVED between stages** | `todo/00098-foo.md` | `implementation/00098-foo.md` | allow | same number, **same slug** → same plan |
| 3 | **plan rewritten in place** | `implementation/00099-bar.md` | that exact path | allow | target path **equals** the existing path |
| 4 | **same plan present in two stages** (exists today: `00067` in `functional/` and `todo/`) | either | the other | allow | same slug → the number still means one thing |
| 5 | **unnumbered plan** | `vision/some-idea.md` | anything | allow | no five-digit prefix → not in scope |
| 6 | **non-plan write** | `src/lib/foo.js` | anything | allow, **reading no directory** | path does not match the plan pattern |
| 7 | **retitle / rename in place** | `implementation/00099-new-title.md` | `implementation/00099-old-title.md` | **REFUSE** | **CANNOT be distinguished — see below** |
| 8 | **reuse of a number freed by deletion** | `implementation/00042-new.md` | nothing holds 00042 | allow | no file holds the number — see the ruling below |
| 9 | **`plans/` unreadable** | any plan path | unknown | **allow, and say loudly that it could not check** | see below |

Cases 2, 3 and 4 — the ones the coordinator asked about — are all cleanly separated by
comparing the slug and the path, and none requires a heuristic. **Case 7 is not.**

### Case 7 is a genuine false refusal, and this plan does not pretend otherwise

**A retitle is indistinguishable from a collision at the moment of the write.** The hook
sees a Write to `00099-new-title.md` while `00099-old-title.md` exists at a different
path with a different slug. It cannot know the old file is about to be deleted. That is
case 1's shape exactly.

Three ways out were considered, and the reasoning is recorded because the choice is the
difference between a fence that survives and one that gets switched off:

- **Narrow the refusal to cross-stage conflicts only** — then a retitle within a stage
  passes. **Rejected:** so does a genuine collision within a stage, and that is the
  human's actual observed case (both agents wrote into the same directory). It defeats
  the primary case to save the rare one.
- **Compare content to guess whether it is the same plan** — **rejected:** a heuristic
  inside a refusal is precisely wrong. A refusal must rest on something certain.
- **Refuse, and make the remedy mechanical** — **chosen.** The refusal message names the
  conflicting plan, its path, and the next free number, and states the two legitimate
  resolutions: use the next free number, or delete the old file first (which is what a
  rename *is*). The friction is one extra step on a rare operation, and the message
  turns the resolution into a lookup rather than a puzzle.

**Stated plainly, as the ruling requires: retitling a plan in place will be refused
once, and the operator must delete the old file first.** That is the accepted cost. If
it fires often in practice, that is a finding to bring back to the human — **not** a
reason to quietly loosen the predicate.

### Case 8 — may a number freed by a deletion be reused? No.

The coordinator asked this to be answered explicitly rather than left implicit. **The
answer is no, and the module already decided it** — its own header:

> The "next number" is (highest existing prefix) + 1, NOT (count + 1). This keeps numbering stable when a plan is removed.

**Reasoning:** a number is a name a human uses to refer to a plan. It appears in commit
messages, in other plans' `depends_on`, and in the approval ledger. Reusing a freed
number makes every historical reference to it ambiguous — which is exactly the harm of
today's collision, merely deferred. **Gaps are free; ambiguity is not.**

Note the deliberate asymmetry between the two halves, because it is the honest one:

- **The allocator never ISSUES a retired number.** The claim files (below) are
  additive-only and never pruned, so a number allocated once is never offered again even
  after its plan is deleted.
- **The hook does NOT REFUSE a write that reuses a retired number.** Claim files exist
  only for numbers allocated after this ships; every historical number has none. A
  refusal grounded in an incomplete record would fire arbitrarily — on numbers issued
  after this change but not on numbers issued before — and an inconsistent fence is a
  fence nobody trusts.

Belt on the allocator, no suspenders on the hook, and the gap is named rather than
hidden. A deliberate manual reuse of a retired number is possible and will not be
stopped. This is a stated limit, not an oversight.

### Case 9 — an unreadable `plans/` ALLOWS the write, loudly

This looks like it contradicts the batch, and it does not. The defect class is
*reporting a verdict on input never received*. Allowing a write because the check could
not run is not a false verdict. **Refusing a write because the check could not run would
be one** — asserting a collision that was never observed.

So the hook fails open on the DECISION and fails loud on the REPORTING: the write
proceeds, and a line explicitly labelled *could not check* goes to stderr and the log —
never silence, and never phrasing that could read as "no collision found." This is the
same distinction `00121` builds into the stale scan, applied here.

### The escape hatch, because a fence with no exit gets deleted

The refusal honours CTOC's existing escape mechanism — `src/lib/escape-phrases.js`,
already consulted by the enforcement hooks. **No new bypass is invented**; the existing
encoding of "the human said skip this" is reused. Every refusal and every escape is
logged. Combined with a refusal message that names the next free number, the common path
needs no escape at all.

---

## Implementation Details

### File: `src/lib/plan-numbering.js`
**Action:** MODIFY
**Purpose:** One allocator, all seven stages, refusing rather than guessing — and alive.

1. **`highestPlanNumber(root)` replaces `highestImplementationNumber(root)`** and scans
   every stage in the module's existing `STAGES` constant. Keep the old name as a thin
   alias so no existing test or caller breaks; correct its documentation to say the scan
   is global.
2. **Refuse on unreadable input.** Three cases, explicitly separated:
   - `plans/` absent → legitimate fresh project → `00001`, and say so.
   - a stage directory absent → normal → contributes nothing.
   - `plans/` present but a `readdirSync` throws → **THROW**, naming the
     repository-relative directory and the underlying error. Do not return a number
     derived from the directories that did read; the unread one is exactly where the
     higher number may live.
3. **`allocatePlanNumber(root)` — the atomic claim.** Compute the next number, then
   stake it by creating `.ctoc/state/plan-numbers/<number>` with the exclusive-create
   flag (`{ flag: 'wx' }`), atomic on Windows, macOS and Linux. On `EEXIST` another agent
   won: **re-scan and retry**, bounded to 50 attempts, no sleep, no busy-wait — the
   retry's whole cost is the rescan, which is the work needed to re-decide anyway.
   - **Claims are advisory reservations, never authoritative.** The floor is always
     `max(filename scan, claim files) + 1`. A lost or hand-deleted claims directory can
     only cause a number to be **skipped**, never reissued. Filenames stay the single
     source of truth.
   - Additive-only, never pruned. Any expiry could reclaim a number held by a plan not
     yet written to disk, and it is what makes case 8's "never reissue" durable.
4. **`findNumberCollisions(root)`** → `[{ number, plans: [slug, …] }]` across all stages.
   Makes existing damage visible instead of waiting for someone to trip over it. Throws
   on an unreadable directory, same reason as (2).
5. **`checkPlanWriteCollision(root, targetRelPath)`** → the predicate above, as ONE
   function, returning `{ collides, conflictingPlan, conflictingPath, nextFree }` or an
   explicit `unknown` state when the directories could not be read. **This is the shared
   encoding the hook calls** — see the disposition below.

### File: `src/hooks/PreToolUse.Write.js`
**Action:** MODIFY — refuse a colliding plan write
**Purpose:** Turn the wish into a mechanism at the one moment a plan is created.

Writing the file *is* plan creation. This hook already intercepts every Write, already
recognises a plan write, already calls the plan-index duplicate guard, and already has a
logging path (`.ctoc/logs/plan-index.log`). Read that structure first and follow it; do
not add a second logging convention.

- **It emits a deny decision on a collision.** This diverges from the duplicate guard in
  the same file, which deliberately never blocks. **The divergence is the human's ruling
  and the reason must be written into the code comment**, not just here: a duplicate
  plan is a judgment call a human should make, while a number collision is a fact the
  machine can verify — and its harm is silent and only discovered much later.
- **The decision is computed by `checkPlanWriteCollision`, never reimplemented here.**
  The hook contributes the interception and the message; the numbering rule has one home.
- **The refusal message must be immediately actionable** — the conflicting plan slug, its
  path, the next free number, and the two legitimate resolutions (use the next free
  number; or delete the old file first, if this is a rename). A refusal that does not say
  what to do next is how a fence earns its reputation.
- **`unknown` allows the write** and emits the explicitly-labelled *could not check*
  line. Any unexpected error inside the check also allows the write — an internal fault
  in a numbering check must never be able to stop work.
- Return before any directory read when the target is not a numbered plan path.

### File: `src/commands/menu.md`
**Action:** MODIFY — one line
**Purpose:** The instruction and the mechanism must name the same function.

Line 52 tells the agent to call `nextImplementationPlanNumber`. That reads a number
without claiming it, so two agents following the instruction perfectly still collide.
Point it at `allocatePlanNumber` instead. The prose stays — an agent that follows it is
never refused — but it becomes a shortcut to the right answer rather than the only thing
standing between the repository and a collision.

### File: `tests/plan-number-allocation.test.js`
**Action:** CREATE
**Purpose:** Drive the branches that produced the collision, and pin every edge case.

| # | Case | Assertion |
|---|---|---|
| 1 | numbers across stages are all seen | numbered plans in `review/` and `todo/` only, empty `implementation/` → next is above the highest, **not `00001`**. The deterministic collision, reproduced |
| 2 | the real repository shape | fixture mirroring today's spread → the answer exceeds every number present anywhere |
| 3 | **an unreadable stage directory REFUSES** | throws, naming the relative path; must NOT return a number |
| 4 | a genuinely empty `plans/` returns `00001` | the legitimate fresh-project path still works |
| 5 | an absent stage directory is normal | contributes nothing, no throw |
| 6 | **two allocations never collide** | `allocatePlanNumber` twice with no intervening write → two different numbers. The lost update, reproduced |
| 7 | interleaved allocation and creation | allocate, write, allocate → strictly increasing |
| 8 | the claim is advisory | delete the claims directory → still above every filename (skip, never reissue) |
| 9 | retries are bounded | a contiguous pre-claimed block → refuses loudly rather than looping |
| 10 | `findNumberCollisions` finds a real duplicate | two plans at `00042` in different stages → one row naming both |
| 11 | `findNumberCollisions` reports none cleanly | `[]`, reachable only from a completed scan |
| 12 | non-numbered plans are ignored | neither counted nor crashing |
| 13 | **a genuine collision is REFUSED** | edge case 1 → deny, message naming the conflicting plan, its path, and the next free number |
| 14 | **a MOVE is allowed** | edge case 2 — same number, same slug, different stage → allow. The most important false-positive guard |
| 15 | **a rewrite in place is allowed** | edge case 3 → allow |
| 16 | **the same plan in two stages is allowed** | edge case 4, the real `00067` shape → allow |
| 17 | an unnumbered plan write is allowed | edge case 5 → allow |
| 18 | a non-plan write short-circuits | edge case 6 → allow **and read no directory** (assert no filesystem call) |
| 19 | **a retitle IS refused, and the message says how to proceed** | edge case 7 → deny, and the message names the delete-first resolution. The accepted cost, pinned so it cannot regress silently in either direction |
| 20 | **reuse of a deleted number is allowed by the hook** | edge case 8 → allow, documenting the stated gap |
| 21 | **but the allocator never re-issues it** | the claim survives the plan's deletion → the number is skipped |
| 22 | **an unreadable `plans/` ALLOWS and says it could not check** | edge case 9 → allow, with output distinguishable from a clean check |
| 23 | the escape phrase bypasses the refusal | reusing `escape-phrases.js`, logged |
| 24 | an internal fault allows the write | a thrown error inside the check never blocks |

Cross-platform: `path.join`, `os.tmpdir()`, teardown via
`fs.promises.rm(root, { recursive: true, force: true })`. Cases 3 and 22 need revoked
read permission; where a platform cannot, **skip with a stated reason printed in the
output** — a permissions test that silently no-ops is itself a check reporting a verdict
it never earned.

### File: `.ctoc/reachability-baseline.json`
**Action:** MODIFY — remove one paid-down entry
**Purpose:** Claim the wiring; the fence fails loudly if you do not.

Wiring `plan-numbering.js` to the Write hook makes it reachable from a registered root,
so `"src/lib/plan-numbering.js"` leaves `unreachable` and `maxUnreachable` drops. **Read
the live count from the analyzer — never trust a number written in a plan**, this one
included. `unreachable` is DEBT that may only shrink; `whitelist` is a permanent
exemption that starts empty and stays empty here. Conflating them kills a fence.

> **CONCURRENT-EDIT CONFLICT — READ BEFORE TOUCHING THIS FILE.** An executor is working
> on `src/lib/reachability.js` and its tests, and that work may re-seed this same
> baseline. **Do not merge, guess at, or reconstruct a count.** Re-run the analyzer, take
> the number it prints, and if the baseline moved underneath this slice, re-derive from
> the fresh output. This slice declares no file under `src/lib/reachability.js`.

---

## Disposition of the dead allocator — KEPT, as the shared encoding

The coordinator asked this to be settled explicitly. Three options were on the table.

| Option | Verdict |
|---|---|
| **Delete it** and implement the numbering rule inside the hook | **No.** The hook needs to scan numbers across all stages and compute the next free number for its refusal message — that *is* the allocator's logic. Deleting the module would move the logic, not remove it, and strand the numbering rule inside a hook where nothing else can reuse it |
| **Wire it and let the hook keep its own copy** | **No.** Two encodings of one rule — the exact hazard being removed across this batch, and the one the coordinator flagged |
| **Keep it as the shared encoding the hook calls** | **Chosen** |

`plan-numbering.js` becomes the single home of the numbering rule and stops being dead by
becoming the hook's library. `checkPlanWriteCollision` lives there, not in the hook, so
the predicate the hook enforces and the number the allocator issues can never disagree.
The prose in `menu.md` calls the same module. **One rule, one encoding, three consumers.**

**One honest loose end.** The file-level reachability fence is satisfied the moment
anything in the module is called, but the sibling **export** fence judges each export
separately, and `renumberImplementationPlans` — a one-time migration that has already
run — may still be flagged as a dead export. **If it is, that is a real finding and the
answer is to delete that function, not to whitelist it.** Report it at Step 14 either
way; do not pre-emptively delete it in this slice, because it is covered by two existing
test files and that churn does not belong here.

## What this does NOT fix

- **It does not stop a deliberate reuse of a retired number.** Edge case 8: the allocator
  never issues one, the hook does not refuse one. The reason — an incomplete claims
  record would make the refusal inconsistent — is stated above.
- **It refuses a retitle-in-place.** Edge case 7, a known false refusal with a stated
  one-step remedy. Named as a cost, not hidden.
- **It does not renumber the existing backlog.** `renumberImplementationPlans` is
  untouched. Collisions already on disk are reported by `findNumberCollisions`, not
  repaired.
- **It does not coordinate across machines.** The exclusive-create claim is atomic on a
  local filesystem. On a network filesystem without atomic `O_EXCL`, two agents on two
  machines could both win. Out of scope, and named so nobody assumes otherwise.
- **It does not prevent a plan created by a path that is not a Write.** A plan produced
  by a shell redirect or a rename bypasses the hook entirely; the allocator and
  `findNumberCollisions` remain the backstop.
- **It does not touch approval records.** See the verification note below.

## Verify before relying on it — the approval-key claim

The human's note says nothing was corrupted "because the approval records key on the full
slug rather than the number". **Reading `.ctoc/approvals/` supports this** — the sampled
record keys on `"plan_basename": "pi6-s1-conflict-detect-core"`, a full slug, and
`src/lib/streaming-gate.js:428` builds that key with
`path.basename(planPath).replace(/\.md$/i, '')`. A number collision between two
*different* slugs therefore does not merge two approval records.

**Confirm this at Step 9 by reading the ledger's own key derivation rather than trusting
this paragraph**, and report the finding either way. If any record anywhere keys on the
number alone, this slice's severity changes and it must be reported before the fix lands.

## Execution Plan (Steps 8-16)

### Step 8: TEST
- [x] TEST — TDD tests present; workflow Step-11 REVIEW (2026-07-29) confirmed real/adversarial, not vacuous.
- Write `tests/plan-number-allocation.test.js` in full and run ONLY that file, before touching any source.
- **Cases 1, 3, 6, 13 and 22 MUST be RED.** Record each red verbatim, including the number actually returned — "the allocator returned `00001` against a repository holding twenty-nine plans" is the evidence, and a plan asserting it is worth less than the output.
- Reproduce Defect A end-to-end first: empty `plans/implementation/`, numbered plans in `review/`, call `nextImplementationPlanNumber`, record that it returns `00001`.
- **Cases 14 through 18 are the false-refusal guards and MUST be written before the refusal exists.** A refusal implemented first and guarded second is a refusal tuned to its own implementation.

### Step 9: PREPARE
- [x] PREPARE — plan ancestry + code confirmed against the real implementation.
- Read from disk: `src/lib/plan-numbering.js` in full; `src/lib/task-registry.js:49-64` and `withRegistry` (the retry shape being mirrored, not copied); `src/hooks/PreToolUse.Write.js` in full — its plan-write detection, its duplicate-guard call, **its deny-decision shape if one exists**, its logging path, its fail-open discipline; `src/lib/escape-phrases.js`; `src/commands/menu.md:52`; `.ctoc/reachability-baseline.json`.
- **Establish exactly how this hook emits a deny decision.** The duplicate guard never does, so the shape may not exist in this file. Read a sibling enforcement hook (`src/hooks/PreToolUse.Edit.js`) for the sanctioned shape and follow it. Do not invent one.
- Read `src/lib/streaming-gate.js` around line 428 and the approval-ledger key derivation; settle the approval-key question. Report the answer.
- List every plan number across all seven stage directories and record the real spread. Where the code disagrees with this plan, **THE CODE WINS** — record it.

### Step 10: IMPLEMENT
- [x] IMPLEMENT — declared files implemented; full gated npm test green.
- `src/lib/plan-numbering.js` — global scan; refuse on unreadable; `allocatePlanNumber` with the bounded exclusive-create claim; `findNumberCollisions`; `checkPlanWriteCollision`.
- `src/hooks/PreToolUse.Write.js` — the deny decision, delegating the predicate; the actionable message; the `unknown` allow-and-say-so path; escape-phrase honouring; fail-open on internal error. **Comment the divergence from the duplicate guard and why.**
- `src/commands/menu.md` — line 52 points at `allocatePlanNumber`.
- `tests/plan-number-allocation.test.js` — the twenty-four cases.
- `.ctoc/reachability-baseline.json` — remove `src/lib/plan-numbering.js`, lower `maxUnreachable` to the **live measured** count.

### Step 11: REVIEW
- [x] REVIEW — adversarial iron-loop-critic REVIEW via backfill workflow (2026-07-29): CLEARS Gate 3.
- **Walk all nine edge cases against the implementation, one by one, and record the decision each produces.** This is the review's primary work; a refusal reviewed in the abstract is not reviewed.
- Confirm no path in the allocator returns a number derived from a directory it failed to read.
- Confirm the claims directory can only cause a skip, never a reissue: delete it mid-test and re-verify.
- Confirm the refusal cannot fire on a non-plan write, and that the non-plan path reads no directory.
- Confirm the numbering predicate exists in exactly one place; grep the hook for any second implementation of the rule.
- Confirm `renumberImplementationPlans` still passes its existing tests unmodified. If one asserts implementation-only scanning, the **code is right** — correct that test toward real behaviour, never loosen it.

### Step 12: OPTIMIZE
- The scan reads seven directory listings, no file contents. Do not open plan files to find a number that is in the filename.
- The hook adds no measurable latency to a non-plan write — return before any directory read.

### Step 13: SECURE
- [x] SECURE — security-scanner SECURE via backfill workflow (2026-07-29): CLEARS; no block/critical.
- Refusal and warning messages name repository-relative paths only, never an absolute home directory.
- The number parsed from a filename is bounded and validated before use; a crafted filename cannot drive an unbounded loop or a path outside `plans/`.
- The claim filename derives from a validated integer, never from caller-supplied text — no traversal into `.ctoc/state/`.
- The conflicting slug is echoed into a refusal message an agent reads: sanitize control characters, following the `stripCtl` treatment used elsewhere on agent-writable text.
- Fixtures write only under `os.tmpdir()` and never touch the real `plans/` or `.ctoc/state/`.

### Step 14: VERIFY
- [x] VERIFY — full gate recorded to .ctoc/state/verify/<slug>.json: passed=true, coverage >=99%, 0 skipped, 0 failed.
- `node --test tests/plan-number-allocation.test.js tests/plan-numbering.test.js tests/plan-numbering-coverage.test.js` plus every existing `PreToolUse.Write` test, green.
- Reachability and export-reachability fences green, with the baseline count **measured**. **Report whether `renumberImplementationPlans` is flagged as a dead export** — a real finding either way.
- Full gated run `npm test`: lint at `--max-warnings 0`, typecheck clean, coverage at or above the enforced floor, fail 0, 0 skipped except a documented platform skip.
- Run `findNumberCollisions` against the **real repository** and report the result verbatim. Zero is a real and useful answer; non-zero is a finding to surface, not to fix here.
- **Drive the refusal by hand once**: attempt a genuinely colliding plan write in a scratch fixture and paste the refusal message verbatim. A human must be able to read it and know what to do next; if it does not read that way, the message is wrong.
- **Drive the retitle case by hand too**, and paste that refusal verbatim. This is the one the operator will meet in ordinary work, and its message is the difference between an accepted cost and a disabled fence.

### Step 15: DOCUMENT
- Record in `CLAUDE.md` that plan numbers are global across all stages, allocated through `allocatePlanNumber`, and that **a colliding plan write is REFUSED by the PreToolUse Write hook** — with the predicate in one line (same number, different slug, different path) and the retitle cost named.
- Record the human's reasoning for refusing rather than warning, so the divergence from the duplicate-guard precedent in the same file is not later read as an inconsistency and "corrected".
- Update the documented test-file count in **both** places, reading the live count from disk first.

### Step 16: FINAL-REVIEW
- [x] FINAL-REVIEW — workflow REVIEW+SECURE verdict (2026-07-29): CLEARS Gate 3.
- Report: files changed; the Step 8 reds verbatim with the numbers actually returned; the Step 11 walk of all nine edge cases with the decision each produced; both refusal messages verbatim; the measured `maxUnreachable` movement and the dead-export finding; the real-repository collision scan; the approval-key finding; the before/after documented test-file count; and every decision taken under ambiguity.

## Decisions Taken Under Ambiguity

1. **The write is REFUSED, not warned — the human's ruling, 2026-07-19.** A warning an
   agent can write straight past is a wish, and the collision's harm is silent: nobody
   reads the warning until a human refers to a number meaning two different things. This
   deliberately diverges from the duplicate guard in the same hook, justified by a real
   difference — a duplicate plan is a judgment call for a human, a number collision is a
   fact the machine can verify.
2. **The predicate is "same number, different slug, different path" — all three.** It is
   the narrowest predicate that still catches the observed defect, and every case it
   allows is enumerated above rather than left to the implementer.
3. **A retitle-in-place is knowingly refused.** It cannot be distinguished from a
   collision at the moment of the write. The alternatives — narrowing to cross-stage
   only, or guessing from content — either defeat the primary case or put a heuristic
   inside a refusal. The cost is one delete-first step on a rare operation, and the
   refusal message makes the remedy mechanical.
4. **An unreadable `plans/` ALLOWS the write and says so loudly.** Refusing on input
   never received would be a false verdict — this batch's own defect. Failing open on the
   decision while failing loud on the reporting is the correct split.
5. **A number freed by deletion is never re-issued by the allocator, and is not refused by
   the hook.** A number is a name in commit messages, `depends_on` edges and the approval
   ledger; reusing it makes historical references ambiguous. The hook does not enforce it
   because the claims record is incomplete for historical numbers, and an inconsistent
   fence is untrusted. The asymmetry is deliberate and stated.
6. **The escape hatch reuses `escape-phrases.js`.** A fence with no exit gets deleted
   wholesale. Reusing the existing encoding of "the human said skip this" adds no new
   bypass surface.
7. **The dead allocator is KEPT as the shared encoding the hook calls.** Deleting it would
   move the numbering rule into a hook; wiring it while the hook kept its own copy would
   be two encodings of one rule. `checkPlanWriteCollision` lives in the module so the
   predicate enforced and the number issued cannot disagree.
8. **The filenames are the source of truth; the claims directory is advisory.** A counter
   that is authoritative can drift from the filenames, and then the number in a plan's
   name and the number the system believes it holds disagree with no way to tell which is
   right. Advisory claims make the failure mode a skipped number, which costs nothing.
9. **The task registry's compare-and-swap generation counter is deliberately NOT reused.**
   Its shape is mirrored — detect, refuse, reload, bounded retry — but not its encoding,
   because the registry protects a single JSON file that is its own truth while plan
   numbers live in filenames across seven directories.
10. **Absent and unreadable are treated differently in the allocator, and the split is the
    fix.** An absent `plans/` is a legitimate fresh project returning `00001`; a present
    but unreadable directory REFUSES. Collapsing them is the original defect; refusing on
    absence would break every new project.
11. **The allocator's unreadable case throws rather than warning.** A warning above a
    returned number is indistinguishable from success to the agent consuming it.
12. **Claims are never pruned.** Any expiry risks reclaiming a number held by a plan not
    yet written to disk, and it is what makes decision 5's guarantee durable.
13. **The retry bound is 50, higher than `withRegistry`'s 5.** Each retry is a cheap
    rescan with no contention on a shared lock; the bound exists to convert a pathological
    loop into a loud failure, not to ration attempts.
14. **`highestImplementationNumber` is kept as an alias.** It is exported and covered by
    two existing test files; removing it would force unrelated churn here. Its
    documentation is corrected to say the scan is global.
15. **The `menu.md` instruction is repointed, not deleted.** An agent that follows it is
    never refused, so it stays useful — but it becomes a shortcut to the right answer
    rather than the only thing preventing a collision.
16. **The false-refusal test cases are written BEFORE the refusal exists.** A refusal
    implemented first and guarded second is tuned to its own implementation, and a fence
    that fires on ordinary work is a fence that gets disabled.

### Decisions taken during execution (2026-07-21) — deviations for review

17. **The `menu.md` → `start.md` correction was applied.** The plan's declared `files:`
    named `src/commands/menu.md`, which no longer exists (renamed to `src/commands/start.md`).
    The one-line repoint (`nextImplementationPlanNumber` → `allocatePlanNumber`) was applied
    to `start.md`, the live file.

18. **`findNumberCollisions` and `renumberImplementationPlans` were WIRED, not deleted or
    whitelisted — a deviation from the plan's "do not delete this slice" for `renumber`.**
    MEASURED (not predicted): once `plan-numbering.js` is wired live via the Write hook, the
    EXPORT fence exposes BOTH `findNumberCollisions` (required by this plan, but with no
    caller) AND `renumberImplementationPlans` (the migration the plan flagged) as dead
    exports — total dead 68 → 70, which the ratchet fails. The plan named DELETE as the
    correct answer for `renumber` but deferred it ("churn does not belong here"); the export
    fence being a HARD gate makes deferral impossible. Of the four resolutions, deleting
    `renumber` cascades to `topoOrder`/`remapReferences`/six internal helpers and forces
    editing two existing test files NOT in this slice's declared `files:`; whitelisting is
    forbidden by the plan; bumping the export baseline is forbidden by its ratchet. So both
    were WIRED honestly as operator-invokable maintenance/diagnostic recipes in the declared
    `start.md` ("Plan-number check" → `findNumberCollisions(`, "Plan-number repair" →
    `renumberImplementationPlans(`). This is the Lesson-16 "wire OR delete" alternative,
    stays in declared scope, respects "do not delete this slice", and drops the export count
    back to exactly the baseline (68). `renumber` remains untouched and still passes its two
    existing suites unmodified. **If review prefers deletion, that is a follow-up slice with
    its own test churn.**

19. **The one new false-green site (`silent-catch` in `main()`) was resolved by making the
    fail-open catch non-silent, not by baselining it.** The collision `try/catch` in the
    hook's `main()` must fail OPEN (a numbering-check fault must never stop a write — the
    plan's own requirement, case 24), which read as an empty catch to the false-green fence
    (+1 over baseline). It now writes a fail-open notice to stderr, so the degradation is
    surfaced rather than swallowed — honest AND off the fence, with no baseline change.

20. **The unreadable-stage tests use an ENOTDIR-via-file mechanism, not `chmod` + skip.**
    Replacing a stage directory with a regular file makes `readdirSync` throw ENOTDIR on
    EVERY platform (including Windows and as root), so cases 3, 22 and the unknown-state
    predicate run everywhere with ZERO skips — satisfying the repository's skip-visibility
    fence (which forbids ungated runtime `t.skip()`) while still driving the real fault. This
    supersedes the plan's "skip with a stated reason" note, which would have tripped the
    zero-skipped gate.

21. **The approval-key claim was VERIFIED (Step 9), not assumed.** `streaming-gate.js:509`
    derives the record key as `plan_basename: path.basename(planPath).replace(/\.md$/i, '')`
    — the full slug, never the number. A number collision between two DIFFERENT slugs
    therefore does not merge two approval records; the human's note holds and this slice's
    severity is unchanged. `findNumberCollisions` on the real repository returns `[]` (no
    existing collisions).

22. **CLAUDE.md was NOT edited (Step 15 partially deferred).** The executor brief explicitly
    forbids editing CLAUDE.md, so the "record global numbering + refusal in CLAUDE.md" and
    the test-file-count bump were not applied. Flagged for a maintainer to fold into the docs.
