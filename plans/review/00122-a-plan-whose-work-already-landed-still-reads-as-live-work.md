---
approved_by: human
approved_at: 2026-07-19T18:29:04.221Z
gate_crossed: implementation → todo
title: "A plan whose work already landed still reads as live work — nothing asks whether the code arrived, so twelve finished plans were reported as contending and three killed by a successor were reported as nothing at all"
type: implementation
parent_plan: ctoc-background-engine-rebuild
depends_on: 00121-the-stale-scan-cannot-say-it-could-not-look
priority: HIGH
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/lib/stale-detector.js"
  - "src/lib/plan-index/conflict-detect.js"
  - "tests/plan-work-already-landed.test.js"
---

# A plan whose work already landed still reads as live work

> **PROVENANCE.** Of a 44-plan backlog, 37 were dead: 34 whose work had already been
> built, and 3 killed by a later plan rather than by code. Finding this took a full agent
> pass and a mechanical scan, and two of the three signals tried were wrong. This slice
> builds the one question none of the existing machinery asks.

## First, a correction to the brief

The human wrote that the plan-index conflict subsystem "may be exactly what this was
built for, in which case the work is WIRING", and asked whether those functions have live
callers, noting that if they are dead code, that is a finding that changes the slice.

**They are live. Verified by reading, not assumed:**

| Function | Live call site | Root |
|---|---|---|
| `detectConflicts` | `src/areas/pipeline.js` → `prefetchConflicts` → `renderConflictPanel`, called from `activate()` | the dashboard's pipeline area |
| `related` | `src/lib/inbox.js:263`, `src/tabs/overview.js:77`, `src/areas/pipeline.js` | dashboard + inbox |
| `checkDuplicate` | `src/hooks/PreToolUse.Write.js:195` | the registered Write hook |
| `search` | `src/commands/menu.js:136` | the menu's search |

None of `src/lib/plan-index/**` appears in `.ctoc/reachability-baseline.json`. The
subsystem is wired, and "Potential conflicts" renders on the live dashboard today.

**Independently verified by the coordinator, 2026-07-19**, and stated as measured rather
than as a claim:

> the conflict panel is live at `src/areas/pipeline.js` — prefetch and render both
> present.

**READ THIS AS A LIVE DEFECT, NOT A GAP.** This is not new capability filling a hole. It
is a bad signal running on the dashboard right now, unattributed, on every menu open. A
reader who takes it for a missing feature will not understand why it is urgent.

**So the work is not wiring. It is worse than that.** The conflict panel is live,
running, and producing precisely the false signal the human identified as worthless — in
front of him, on every menu open, unattributed. It reports contention between plans whose
work is already finished, because nothing in it asks whether the code arrived.

## The rule that is missing, stated once

> **A plan describing a change is not evidence the change is pending.**

The repository already applies exactly this suspicion to code (the reachability fence: a
citation is not an invocation) and to its instruments (the false-green fence: a default
is not a measurement). **It does not apply it to its own plans.** Every existing
plan-level signal reasons about what a plan *says*; none asks whether the code *is
already there*.

That single missing question explains both of the human's failed signals:

### The contention signal, and why it was wrong

> *"plans declare the same file, so they contend" — WRONG without a landed-check. Twelve plans contended for two files and all twelve had already been built.*

`detectConflicts` (`src/lib/plan-index/conflict-detect.js:188`) flags a candidate when
its section similarity clears a threshold **AND** its `files:` globs overlap the
target's. Both halves are computed from plan text alone. There is no third term. Two plans
that both finished last month, both touching `src/lib/actions.js`, both about the
scheduler, satisfy the AND perfectly and are reported as a live conflict.

The strict AND was designed to cut false positives, and it does cut the *wrong-topic*
false positive. It has no defence at all against the *already-done* false positive, which
is the one that actually filled the human's screen.

### The missing-files signal, and why it was wrong

> *"the plan's declared files do not exist" — MEANINGLESS. An unbuilt plan ALWAYS shows that.*

Correct, and `00121` fixes its scope. But note what it reveals: **`missing-files` is the
inverse question asked backwards.** "Do the declared files exist?" is nearly
uninformative. "Did the declared *behaviour* arrive?" is the informative one, and nothing
asks it.

### The third signal was sound and found zero

> *"the plan cites a source file that no longer exists" — this one was sound, and it found zero, which is a real and useful negative.*

Agreed, and it is preserved untouched. A signal that correctly reports nothing is a
working signal, and this slice must not disturb it. It is also the model for the honesty
required here: it could distinguish "I found nothing" from "I could not look".

## What IS mechanisable, and what is not

This is the part the human asked the plan to confront rather than assume past, so it is
stated flatly, in both directions.

### Mechanisable — and the machinery already exists

`verifyStaleCandidate` (`src/lib/stale-detector.js:~380-500`) already gathers git evidence
per plan: `stageEntryEpoch` (the oldest commit touching the plan at its current path),
`filesLastModifiedEpoch` (the newest commit touching its declared files),
`filesModifiedAfterEntry`, and `slugMatchCommits` (commits whose message names the plan
slug). **The landed-check is one derived question away from evidence already collected**,
and adds no new git invocation.

Two new derivations:

1. **`landedBySelf`** — a commit naming this plan's slug touched its declared files after
   the plan entered its stage. The plan's own work arrived.
2. **`landedByOther`** — this plan's declared files were modified after its stage entry, by
   commits that name **a different plan slug** and no commit naming this one. Someone
   else's work covered this plan's ground.

`landedByOther` is the supersession signal, and it is the honest mechanical shadow of what
the human found by hand. It catches all three of his cases:

- The two plans that built a producer around a dispatcher a successor deleted: the
  dispatcher's file was modified after their stage entry, by commits naming the successor.
- The plan that set every agent to maximum effort and was reversed by a later plan on the
  owner's ruling: the agent files were modified after its stage entry, by commits naming
  the reversing plan. The code is correct and reflects the newer decision — which is
  exactly why no code-correctness check can see this, and why the *commit attribution*,
  not the code, is where the evidence lives.
- The fourth case caught today only because an agent said so — one fence plan's detection
  moved into a newer fence plan: same shape, same signal.

### NOT mechanisable — stated plainly

> *What DID work, done by a model rather than a regex: reading each plan's acceptance criteria and checking whether the named identifier, line, or behaviour is present in the code today.*

**That remains a model's job and this slice does not attempt it.** Extracting "the named
identifier, line, or behaviour" from arbitrary acceptance-criteria prose is
natural-language work. A regex over backticked tokens would produce a confident verdict on
a reading it never performed — the defect class this entire batch exists to remove,
committed inside its own fix.

**Therefore the output of this slice is explicitly a CANDIDATE LIST, not a verdict**, and
it must say so in its own field names, its own documentation, and on any surface that
renders it. `landedByOther` means *"the evidence says look at this one"*, never *"this
plan is dead."* A checker that can only flag candidates for a human or an agent to judge
is worth building — the human said so — **but only if it says that is what it is.** The
category name carries that: `landed-candidate`, never `landed`.

The division of labour this produces is the point: the mechanism narrows 44 plans to a
handful; the model or the human judges the handful. Neither half claims the other's
authority.

## Implementation Details

### File: `src/lib/stale-detector.js`
**Action:** MODIFY
**Purpose:** Ask whether the work arrived, using git evidence already gathered.

1. **`StaleEvidence` gains four fields**, all derived from data the existing git reads
   already produce — **no new `execFile` call**:
   - `landedBySelf` (boolean)
   - `landedByOther` (boolean)
   - `landingCommits` (array of short hashes, bounded — the evidence a human follows)
   - `landingAttributedTo` (array of the other plan slugs named in those commits, bounded)
2. **`classifyStaleCandidate` gains the `landed-candidate` category** with a null proposed
   action. **Null is required, not incidental**: a candidate is not a verdict, so no
   cleanup path may act on it. This mirrors the existing `inconclusive` treatment exactly
   — read it and follow it rather than inventing a parallel convention.
3. **The degraded path is preserved absolutely.** When `gitAvailable` is false, all four
   new fields are false/empty and the category remains `inconclusive`. **`landedByOther:
   false` must be unreachable from a state where git could not be read** — otherwise "I
   could not look" returns as "nothing landed", which is the ninth instance inside the fix
   for it. Guard this with its own test case, not with a comment.
4. **The slug-match scan is already hoisted** to one shared history read across all
   candidates via `opts.slugHistoryCache`. Reuse it. Do not add a second history scan.

### File: `src/lib/plan-index/conflict-detect.js`
**Action:** MODIFY — add the third term to the AND
**Purpose:** Stop reporting contention between finished work.

The current predicate is `similarity >= threshold AND filesOverlap`. Add:
`AND NOT bothAlreadyLanded`.

- The store key is `plans/<stage>/<file>.md`, so the stage is derivable from the key
  without a new read. **Start with the cheap, certain half: a candidate whose key is in
  `plans/done/` or `plans/review/` is finished work and is not a live conflict.** That
  alone would have removed most of the twelve.
- The landed-check proper resolves through the stale-detector derivation above, via a
  **lazy string-literal require** exactly as this file already resolves `related` and
  `getWiring` — do not add an eager import and do not create a cycle.
- **Preserve the fail-open contract absolutely.** This file's header states that every
  data condition returns `[]` and only a caller bug throws, because the dashboard must
  never crash. **A landed-check that cannot run must not filter** — an unavailable git
  means the rows pass through unfiltered and are labelled as unverified. It must never
  mean "no conflicts", which would be this slice's own defect turned inward.
- Rows that survive gain a field distinguishing a landed-check that ran from one that
  could not. The existing `severity` enum is extended, not replaced; `renderConflictPanel`
  in `src/areas/pipeline.js` reads `severity` directly and treats unknown values as a
  fixed enum, so **read that renderer before choosing the value** and confirm an added
  value degrades gracefully. This slice does not edit the renderer.

### File: `tests/plan-work-already-landed.test.js`
**Action:** CREATE
**Purpose:** Drive the landed-check against real git fixtures.

| # | Case | Assertion |
|---|---|---|
| 1 | **work landed under another plan's name is flagged** | fixture repository: plan A declares `x.js`; a commit naming plan B modifies `x.js` after A's stage entry → `landedByOther: true`, `landingAttributedTo` contains B. The supersession case, reproduced |
| 2 | **a genuinely pending plan is NOT flagged** | declared files untouched since stage entry → both flags false. The false-positive guard, and the more important half |
| 3 | work landed under the plan's own name | commit naming plan A touches A's files → `landedBySelf: true`, `landedByOther: false` |
| 4 | **git unavailable yields inconclusive, never "nothing landed"** | non-git fixture → `gitAvailable: false`, category `inconclusive`. The load-bearing honesty case |
| 5 | the category carries no action | `landed-candidate` → `proposedAction === null` |
| 6 | commits before stage entry do not count | a modification predating entry → not flagged |
| 7 | evidence is bounded | 200 commits → `landingCommits` capped, no unbounded array |
| 8 | **finished plans no longer contend** | `detectConflicts` with a candidate keyed under `plans/done/` → not reported. The human's twelve, silenced |
| 9 | live plans still contend | two implementation-stage plans, similar and overlapping, neither landed → still reported. The signal keeps its teeth |
| 10 | **an unavailable landed-check does not empty the panel** | landed-check throwing → rows still returned, marked unverified. Never `[]` |
| 11 | `detectConflicts` stays fail-open | every existing empty-condition still returns `[]`; only a non-string slug throws |
| 12 | no second git history scan | the shared `slugHistoryCache` is used; assert the invocation count |

Cross-platform: `path.join`, `os.tmpdir()`, `fs.promises.rm`. Git fixtures set
`user.email`/`user.name` locally so the test cannot depend on the runner's global git
configuration, and **skip loudly with a stated reason if the git binary is absent** —
never silently.

---

### Wiring — the live call sites

| change | live call site | root |
|---|---|---|
| `landedBySelf` / `landedByOther` evidence | `src/lib/menu-screens.js:1126` and `:1234` via `classifyStaleCandidate` | `/ctoc:menu` verify screen |
| `landed-candidate` category | same | same |
| the conflict landed-gate | `src/areas/pipeline.js` → `prefetchConflicts` → `renderConflictPanel` | the dashboard's pipeline area |

Both modules are already reachable from a live root; neither is in
`.ctoc/reachability-baseline.json`. No new module is created, so this slice cannot add
dead code.

## What this does NOT fix

- **It does not read acceptance criteria.** The one signal that actually worked for the
  human — a model reading each plan's criteria and checking the named identifier against
  today's code — is not mechanised here and this slice does not pretend otherwise. What
  ships is a candidate narrower that makes that model pass cheap.
- **It produces candidates, never verdicts.** Nothing is closed, moved, or deleted
  automatically. `proposedAction` is null by design.
- **It will miss work landed without a plan slug in the commit message.** Attribution runs
  on commit messages; an unattributed commit is invisible to it. This is a known and
  stated blind spot, not a bug to be papered over with a fuzzier match — a fuzzier match
  would trade a miss for a false accusation.
- **It cannot see a plan superseded by a decision that changed no files.** If a later plan
  reverses an earlier one purely in prose, no file moves and no evidence exists. Only a
  human or a model reading both plans can find that.
- **It does not surface the candidates on the dashboard beyond the existing screens.** It
  changes what those screens report; it adds no new surface.
- **It does not clean the current backlog.** It is the detector that was missing. Acting on
  what it finds is a separate, human-scheduled decision.

## Execution Plan (Steps 8-16)

### Step 8: TEST
- [x] TEST — TDD tests present; workflow Step-11 REVIEW (2026-07-29) confirmed real/adversarial, not vacuous.
- Write `tests/plan-work-already-landed.test.js` in full and run ONLY that file, before touching any source.
- **Cases 1, 3, 5, 8 and 10 MUST be RED.**
- **Case 2 is the one to fear and must be proven, not assumed.** A landed-check that flags pending plans is worse than no landed-check: it teaches the human to ignore the output, which is how the original 37 accumulated. Build the fixture so case 2 would fail if the derivation were sloppy, and record its output either way.
- Case 4 must be red-then-green in the honest direction: confirm that today a non-git fixture already yields `inconclusive`, and that the new fields cannot turn that into a confident negative.

### Step 9: PREPARE
- [x] PREPARE — plan ancestry + code confirmed against the real implementation.
- Read from disk: `src/lib/stale-detector.js` — `verifyStaleCandidate` in full, `StaleEvidence`, the `degraded()` shape, `slugMatchCommits` and the `slugHistoryCache` hoist, and `classifyStaleCandidate` with every existing category.
- Read `src/lib/plan-index/conflict-detect.js` in full — the AND, `filesOverlap`, the broad-glob downgrade, the fail-open contract, and the lazy-require pattern for `related` / `getWiring`.
- Read `src/areas/pipeline.js` — `prefetchConflicts` and `renderConflictPanel` — and confirm how an unrecognised `severity` value renders before choosing one.
- Confirm `00121` has landed and its `unread` channel is present; this slice edits the same module and must build on the merged state, never a stale copy.
- Where the code disagrees with this plan, **THE CODE WINS** — record it.

### Step 10: IMPLEMENT
- [x] IMPLEMENT — declared files implemented; full gated npm test green.
- `src/lib/stale-detector.js` — the four evidence fields; the `landed-candidate` category with a null action; the degraded path preserved.
- `src/lib/plan-index/conflict-detect.js` — the third term; the stage-based cheap half; the lazy-require landed-check; the unverified labelling; fail-open preserved.
- `tests/plan-work-already-landed.test.js` — the twelve cases.

### Step 11: REVIEW
- [x] REVIEW — adversarial iron-loop-critic REVIEW via backfill workflow (2026-07-29): CLEARS Gate 3.
- Confirm **`landedByOther: false` is unreachable whenever git could not be read.** The single most important review item in this slice.
- Confirm no new git invocation was added — count them.
- Confirm `detectConflicts` still returns `[]` for every existing empty condition and still throws only on a non-string slug.
- Confirm no cycle was introduced between `plan-index` and `stale-detector`; the require must be lazy and string-literal.
- Confirm every existing stale-detector, conflict-detect and pipeline test passes **unmodified**. Where one asserts the old unconditional AND, the **code is right** — correct it toward real behaviour, never loosen it.

### Step 12: OPTIMIZE
- Zero additional git calls; reuse the hoisted history scan.
- The conflict landed-gate is capped at the existing 20-candidate limit; the stage-key check is a string test and must run **before** any landed derivation so the common case pays nothing.

### Step 13: SECURE
- [x] SECURE — security-scanner SECURE via backfill workflow (2026-07-29): CLEARS; no block/critical.
- Commit messages and plan slugs are agent-writable and reach a dashboard: sanitize before rendering, following the `stripCtl` treatment `renderConflictPanel` already applies. Assert it.
- `landingCommits` and `landingAttributedTo` are bounded, so a repository with a long history cannot balloon the returned object.
- Git pathspecs are built from validated, repository-relative POSIX paths, never from raw declared strings; the existing `..`-stripping in `declaredFileExists` is the precedent.
- No raw git error text enters a returned value; diagnostics go to a log.
- Fixtures create throwaway git repositories under `os.tmpdir()` only, and never invoke git against the real repository.

### Step 14: VERIFY
- [x] VERIFY — full gate recorded to .ctoc/state/verify/<slug>.json: passed=true, coverage >=99%, 0 skipped, 0 failed.
- `node --test tests/plan-work-already-landed.test.js` plus every existing `tests/stale-*`, `tests/plan-index-*` and `tests/pipeline*` test, green.
- Full gated run `npm test`: lint at `--max-warnings 0`, typecheck clean, coverage at or above the enforced floor, fail 0, 0 skipped except a documented git-absence skip that prints its reason.
- **Run the landed-check against the real repository and report the candidate list verbatim.** Then, for each candidate, state whether the evidence looks right — this is the calibration, and it is the only way to know whether case 2's guarantee holds outside a fixture. Report false positives as findings; **do not tune the derivation to make the list shorter.**
- Run `detectConflicts` against the real repository before and after, and report both row counts. The drop is the measured noise removed.

### Step 15: DOCUMENT
- Record in `CLAUDE.md` that a plan whose declared files were modified after its stage entry by commits naming a different plan is surfaced as a **candidate for judgment**, that the category carries a null action deliberately, and that the acceptance-criteria reading remains a model's job.
- State the two blind spots — unattributed commits, and supersession that changed no files — in the documentation, not only in this plan. Someone reading the check later must find its limits next to it.
- Update the documented test-file count in **both** places, reading the live count from disk first.

### Step 16: FINAL-REVIEW
- [x] FINAL-REVIEW — workflow REVIEW+SECURE verdict (2026-07-29): CLEARS Gate 3.
- Report: files changed; the Step 8 reds verbatim; the real-repository candidate list with a judgment on each; the before/after conflict row counts; the git-invocation count proving no second scan; the before/after documented test-file count; and every decision taken under ambiguity.

## Decisions Taken Under Ambiguity

1. **The output is a candidate list, never a verdict, and the naming enforces it.** The
   category is `landed-candidate` and its action is null. A name like `landed` would be
   read as a verdict by the next person and would license an automatic action on evidence
   that does not support one.
2. **Acceptance-criteria reading is explicitly NOT mechanised.** It is the signal that
   worked, and it is natural-language work. A regex over backticked tokens would be a
   confident verdict on a reading never performed. The mechanism narrows the field; the
   model judges it.
3. **Attribution runs on commit messages, accepting a known miss rather than a fuzzy
   match.** A looser heuristic would trade a missed dead plan for a falsely accused live
   one, and the false accusation is the more expensive error — it is what teaches a human
   to ignore the output.
4. **`landedByOther` requires the absence of a self-naming commit.** A plan whose own work
   landed alongside another's is `landedBySelf`, which is an ordinary completed plan, not a
   supersession candidate.
5. **The conflict landed-gate starts with the cheap stage-key check.** A candidate in
   `plans/done/` or `plans/review/` is finished work by definition. This is certain, free,
   and would alone have removed most of the twelve; the git-backed check is the refinement,
   not the foundation.
6. **An unavailable landed-check passes rows through UNFILTERED and labelled, never
   filtered to empty.** Filtering on an unavailable check would make "I could not look"
   render as "no conflicts" — this batch's defect, committed inside its own fix.
7. **The existing `severity` enum is extended rather than replaced.** `renderConflictPanel`
   reads it directly and a replaced enum would silently change the live dashboard's output
   without any test noticing.
8. **This slice depends on `00121` and does not run beside it.** Both edit
   `src/lib/stale-detector.js`, so the scheduler serialises them on file conflict
   regardless; the semantic reason is stronger — `00121` establishes that the scan can say
   "I could not look", and this slice's honesty contract is built directly on that
   distinction. The reverse order would build the landed-check on a scan that still reports
   unread input as clean.
9. **No new module is created.** Both changes extend live, reachable modules. A new
   `plan-landed-probe.js` would have been cleaner to read and would have started life in
   the reachability baseline as dead code — the mistake this repository has been paying
   down all week.
10. **The three-file size is accepted deliberately.** The two edits are one rule at two
    consumers — the stale scan and the conflict panel — and splitting them would ship a
    landed-check with one of its two callers still producing the noise it exists to remove.
11. **The real-repository calibration in Step 14 is mandatory and its result may not be
    tuned away.** A landed-check validated only against fixtures has been tested against
    the author's own assumptions. If it produces false positives on the real backlog, that
    is the finding and it goes to the human — shortening the list by adjusting the
    derivation would be fitting the instrument to the answer.

--- Decisions taken DURING the build (execution) ---

12. **The conflict landed-gate filters on the CANDIDATE having landed, not on
    `bothAlreadyLanded` (AND).** The plan's predicate text said `AND NOT
    bothAlreadyLanded`, but its own cheap half and test case 8 drop a candidate keyed
    under `plans/done/` regardless of the seed's state — a strict AND would keep a
    finished candidate contending with a live seed, which is the exact false signal
    being removed. A live conflict requires the candidate to still be pending; a finished
    candidate cannot collide in future. Filtering on candidate-landed is the sound reading
    consistent with every test, and it strictly preserves every existing detectConflicts
    test (whose keys are opaque, so `applicable:false` — never dropped, never relabelled).

13. **`landedBySelf`/`landedByOther` are derived from the per-file last-modifying
    commits, reusing the EXISTING per-file `git log` (one per declared file) with a
    widened `--format` and the `-1` dropped — NOT a new git invocation.** The full-history
    scan carries messages but not per-commit file lists, so only the per-file log ties a
    commit to a declared file. Attribution reads plan-slug SHAPE (`\d{3,5}-kebab`) from
    those commit subjects; self is matched with the existing `\bslug\b`. Blind spots
    (unattributed commits, old non-numeric slugs, prose-only supersession) are documented
    at `PLAN_SLUG_RE` in code, per Step 15's "its limits live next to it".

14. **Git-absent handling is a LOUD FAILURE + unregistered git-suites, NOT a runtime
    `t.skip`.** The plan's Step 8 said "skip loudly", but `tests/skip-visibility.test.js`
    forbids an ungated runtime `t.skip()` (machine-nondeterministic for the zero-skipped
    gate) and sanctions gating the REGISTRATION instead. So an absent binary registers one
    failing environment test and does not register the git-backed suites (0 counter
    contribution, deterministic). A missing required capability is a loud failure, never a
    silent pass — the same discipline, honoured through the repo's own fence. THE CODE WON.

15. **The CLAUDE.md documentation (Step 15) and the documented test-file count are
    DEFERRED**, because the executor brief explicitly forbids editing `CLAUDE.md` while
    concurrent builds hold that file. The operator instruction overrides the plan step.
    The landed-check's own thorough documentation and its two blind spots ship IN THE CODE
    (module headers + the `landed-candidate` classifier comment + `PLAN_SLUG_RE`), so the
    limits are findable next to the check; the CLAUDE.md prose entry is a follow-up for the
    human to place once the file is free.

### Step 14 calibration — measured on this repository (verbatim)

- Landed-check over 111 plans in functional/implementation/review: **0 landed-candidates,
  0 false positives.** Case 2's guarantee (a pending plan is never flagged) holds outside
  the fixtures. The derivation was NOT tuned to produce more.
- `detectConflicts` over the live 379-plan index: **BEFORE the landed gate 136 conflict
  rows** (83 of them with a candidate in `done`/`review` — finished-work false conflicts);
  **AFTER 53 rows; 83 noise rows removed** — exactly the "twelve finished plans contending"
  class the human named, at scale. The git-backed `landedByOther` term removed 0 additional
  on the current backlog, consistent with the 0-landed-candidate calibration (the current
  supersession is not numeric-slug-attributable — a known, documented blind spot).
