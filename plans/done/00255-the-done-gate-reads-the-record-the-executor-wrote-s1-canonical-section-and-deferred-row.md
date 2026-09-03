---
iron_loop_verdict: true
title: "The done check reads the canonical execution section the executor ticked"
type: implementation
iron_loop: true
parent_plan: the-done-gate-reads-the-record-the-executor-wrote
depends_on: none
priority: high
effort: small
files:
  - src/lib/plan-validator.js
  - src/lib/approval-ledger.js
  - src/scripts/ledger-backfill.js
  - tests/ledger-backfill-coverage.test.js
  - tests/plan-validator.test.js
  - tests/approval-boundary-is-legible.test.js
  - tests/approval-hash-survives-execution.test.js
approved_by: human
approved_at: 2026-09-03T10:22:51.914Z
gate_crossed: review → done
---

# The done check reads the canonical execution section the executor ticked

**Scope (one line):** `extractStepBlocks` prefers the canonical checkbox section over the
planner's prose twin, and the approval hash question raised by the parent plan is settled
with a byte-for-byte proof instead of a guessed table row.

## Implementation Details

### What was read, and the one place this slice departs from the parent plan

Read in full before planning: `src/lib/plan-validator.js` (`extractStepBlocks`,
`validateStepsComplete`, `validateEscalations`, `validateStepLabels`,
`validateReviewToDone`, `validateForQueue`, `validateForExecution`),
`src/lib/approval-ledger.js` (the exemption table, `computeSpecHashWith`,
`contentMatches`, `diagnoseSpecMismatch`), `src/lib/iron-loop.js`
(`refineLoop`, `appendDeferredQuestions`), `src/lib/actions.js`
(`approvePlan`, `applyIronLoop`, `stampAndLedger`), `agents/iron-loop/iron-loop-critic.md`,
the four cited test files, and the live plans `00252-close-the-coverage-holes-s18-remainder-hooks-commands.md`,
`00234-readme-as-a-course-s1-readme-and-guard-pins.md`,
`00237-close-the-coverage-holes-s3-fail-open-contracts.md` with its ledger entry.

The parent plan's part **A** (the validator reads the wrong execution section) is confirmed
exactly as written and is built here in full.

The parent plan's part **B** (add a `deferred questions` row to the exemption table) does
**not** survive contact with the ordering in `actions.js`. The reasoning, with citations,
is under "The exemption row — what the code says" below. This slice therefore builds part A
plus the two proofs that make part B a decidable question, and does **not** write the row.
Nothing is stubbed: every line this slice adds is working, asserted code.

### Edit 1 — `src/lib/plan-validator.js`, `extractStepBlocks` (currently lines 342-361)

Today:

    const execMatch = content.match(/^##\s+Execution Plan[\s\S]*$/m);
    const region = execMatch ? execMatch[0].split(/\n##\s+(?!#)/)[0] : '';

`content.match` with the `m` flag returns the FIRST match, so on a plan carrying both
sections the region is the planner's prose twin and no `- [x]` is ever seen. Replace the
first line with a canonical-first lookup, leaving the split, the `''` fallback and every
line below it untouched:

    // Prefer the CANONICAL section. `src/lib/iron-loop.js` (refineLoop, line 312;
    // integrate, line 66) appends `## Execution Plan (Steps 8-16)` when the plan enters
    // the build queue, and the executor ticks THAT template. A plan written by the
    // implementation planner may also carry an earlier prose `## Execution Plan` with no
    // checkboxes; `String.match` with /m returns the FIRST match, so the prose twin was
    // read and every required step reported an unchecked box. When the canonical heading
    // is absent, behaviour is byte-for-byte what it was.
    const canonicalMatch = content.match(/^##\s+Execution Plan \(Steps 8-16\)[\s\S]*$/m);
    const execMatch = canonicalMatch || content.match(/^##\s+Execution Plan[\s\S]*$/m);

The literal `(Steps 8-16)` is the exact heading `iron-loop.js` emits and matches against in
three places (lines 66, 209/211, 312) and `actions.js` checks at line 652 — plain hyphen, one
space, no variant spellings exist on disk. A literal regular expression is the house style at
this site (lines 343, 374, 1262 are all literals); `safeRegExp` is for constructed patterns.

**Both callers of `extractStepBlocks` benefit, and both in the strict direction.**
`validateStepsComplete` (line 278) is reached from `validateForReview` (line 205, the
in-progress → review check) and from `validateReviewToDone` (line 828, the done check).
Reading the executor's ticked record instead of the planner's prose can turn a false
"unchecked required checkbox" into a pass; it can never turn an unticked canonical record
into a pass, because a block with `- [ ]` and no `- [x]` still fails `isCompleted`
(line 296).

### Why `validateEscalations` and `validateStepLabels` do NOT follow

`validateEscalations` (line 366) repeats the same region derivation at line 374-375, and
`validateStepLabels` (line 1243) repeats it at line 1262-1263. Neither changes. Read, then
decided:

- **`validateEscalations` scans for a DECLARED skip** (`Step N … SKIPPED|BLOCKED|DEFERRED`
  with no nearby approval) and turns each one into an error. Moving its region to the
  canonical section would DROP any such declaration written in the prose twin — an error
  that fires today would stop firing. The parent plan's Definition of Done forbids weakening
  an existing check, and its approach section names this function explicitly as unchanged.
- The consequence, stated rather than buried: on a plan carrying both sections, the
  per-step skip probe (`validateStepsComplete`, line 311) now reads the canonical block
  while the escalation scan still reads the prose twin, so an un-approved skip DECLARED in
  the executor's canonical record raises the warning but not the escalation error. That gap
  exists today for exactly these plans (both probes read the prose twin, where the executor
  never writes), and this slice neither creates nor closes it. The comment at lines 306-309
  that binds the two probes together is about MASKING (`maskQuotedSpans`) — both must read
  the same masked text — and masking is untouched.
- **`validateStepLabels`** runs at the todo → in-progress check (`validateForExecution`,
  line 1012). Its job is to reject a wrong or duplicated step LABEL. Pointing it at the
  canonical template — whose labels are generated by CTOC itself and are canonical by
  construction — would make it assert against its own output and stop checking the human-
  written section. It stays on the first region deliberately.

### The exemption row — what the code says

The parent plan asks for a seventh row in `EXECUTION_SECTION_PRODUCERS`
(`src/lib/approval-ledger.js`, lines 298-305), on the reading that an executor appends
`## Deferred Questions` AFTER the approval is recorded. The code path says the opposite for
the ordinary crossing:

1. `actions.js` line 502-504 calls `applyIronLoop(planPath)` when the destination is the
   build queue, with the comment at 496-501 stating the ordering is deliberate: refinement
   runs first "so the ledger hash matches the FINAL committed bytes".
2. `applyIronLoop` (line 624) guard 2 (line 666-672) calls `refineLoop`, which appends
   `## Execution Plan (Steps 8-16)` (`iron-loop.js` line 312-314), then
   `appendDeferredQuestions` (line 669) appends `## Deferred Questions` (`iron-loop.js`
   line 362-373).
3. Only then, at `actions.js` line 512, does `stampAndLedger` run; it reads the file
   (line 326), builds the destination bytes (line 327) and passes `content: destContent`
   to `writeEntry` (line 356), which hashes the SPECIFICATION of those bytes.
4. `computeSpecHashWith` (lines 450-468) ends an excluded region at the next heading of the
   same level, and `deferred questions` is not in the deny-list, so those lines are KEPT —
   they are inside the recorded digest.

So for every plan crossed into the build queue by this code, the `## Deferred Questions`
section is part of the approved specification digest. Adding the row would REMOVE those
lines from the recomputation while the recorded digests stay as written (the module never
re-hashes, lines 30-37) — turning currently-valid entries into `hash-mismatch`. Measured on
disk by heading scan: 12 plans in `plans/todo/`, 1 in `plans/in-progress/` and roughly 40 in
`plans/review/` carry a top-level `## Deferred Questions` heading. A mismatch on those is
not cosmetic: `human-gate-check.js` treats it as an attack signature and
`plan-coverage`/`approval-residency` stop granting the write permission every build depends
on.

And the two plans the parent plan names are explained without the row:

- `00252`: its `## Deferred Questions` (line 242) sits BEFORE `## Execution Record`
  (line 250), i.e. it was written by the refinement pass, before the hash. What IS new since
  approval is its frontmatter `kickback_counts` block (lines 16-19), written during the build
  by `src/lib/circuit-breaker.js` (lines 201-245). The frontmatter is hashed IN FULL
  (`computeSpecHashWith` line 445), so that write alone moves the digest, and the row would
  not restore it.
- `00234`: its `## Deferred Questions` (line 520) sits after `## Verification Evidence`
  (line 500), the shape a second refinement pass produces on a re-approved plan — which the
  same ordering puts before the hash again.

This is a hash-semantics migration question, and the module's own header (lines 30-37) is
explicit that entries are never re-hashed. It is the human's to answer, from the two proofs
this slice commits, not the planner's to guess.

## Wiring — the live call sites

No new module, no new export; both edits land inside functions that already have live
callers, so there is nothing that could ship dead.

- `extractStepBlocks` → `validateStepsComplete` (`plan-validator.js` line 278) →
  `validateForReview` (line 205) and `validateReviewToDone` (line 828) →
  `validateTransition` (lines 972-973) → `approvePlan` (`actions.js`, the menu's approve
  action) and `iron-loop-enforcer`. Root: the shipped `/ctoc:start` menu.
- The two new proof cases run under `npm test` (`src/scripts/test-gate.js`), the shipped
  verification entry point.

## Test Plan (TDD-Red first)

All four cases go in files already declared above. Run each and see it fail (or pass, where
marked a guard) BEFORE the source edit.

**Case 1 — RED before edit 1** (`tests/plan-validator.test.js`, beside
`review->done: a compliant plan passes`, line 362). Build a plan whose body is a prose
execution section — heading `## Execution Plan`, then `### Step 8: TEST` … `### Step 16:
FINAL-REVIEW` with plain prose bullets and NO checkbox — followed by the canonical section
`## Execution Plan (Steps 8-16)` holding the existing `REVIEW_DONE_EXEC_PLAN` step blocks
with every box `- [x]`. Write the evidence artifact exactly as the existing test does:
`verifyEvidencePath(testDir, <slug>)`, `mkdirSync` its directory, and a JSON body with
`passed: true` and `timestamp` set to the plan's `mtimeMs + 60000`. Then
`validator.validateTransition(planPath, 'review', 'done', testDir)`.
Assert `result.valid === true` and that no error matches `/unchecked required checkbox/`.
Failing assertion today: `assert.strictEqual(result.valid, true)` — the current code reads
the prose twin and pushes "review→done blocked: Step 8 (TEST) has an unchecked required
checkbox" for steps 8, 9, 10, 11, 13, 14 and 16.

**Case 2 — GREEN before and after (the guard that keeps the fix honest)**. The same fixture
with the canonical section REMOVED — prose only, no checkbox anywhere. Assert
`result.valid === false` and that at least one error matches `/unchecked required checkbox/`.
A step with no checkbox is never complete, unchanged.

**Case 3 — GREEN before, RED if the exemption row is ever added**
(`tests/approval-hash-survives-execution.test.js`, beside the existing execution-record
cases). Take `SPEC_PLAN` (line 62) with a `## Deferred Questions` section appended —
the heading plus the provenance paragraph and one `- **evaluation**: …` bullet, i.e. the
literal shape `iron-loop.js` line 362-373 emits. Approve it with the file's own
`approve(slug, content)` helper, which records the specification digest of those exact
bytes, then assert `ledger.verify(slug, content, 'todo', projectDir) === true` — the
unmodified plan must still verify. Name it for what it protects: an approval recorded WITH
the refinement section present must not be invalidated by a later change to the exemption
list.

**Case 4 — GREEN, real bytes, no fixture** (same file, mirroring
`on REAL executed plan bytes…`, line 191). Read the real plans in `plans/todo/`, pick the
first carrying a line matching `/^##\s*Deferred Questions/m`, and assert that
`computeSpecHash` of those bytes DIFFERS from `computeSpecHash` of the same bytes with that
section removed. That is the byte-for-byte demonstration that the section is inside the
recorded specification today — the measurement the human's answer needs. Assert the corpus
is non-empty first (`assert.ok(files.length > 0)`), so an empty read fails loudly instead of
passing vacuously.

**Assertions touched: none.** No existing assertion is edited, weakened or deleted; no
baseline or exemption file is touched. Cases 11 and 12 of
`tests/approval-boundary-is-legible.test.js` (lines 294-322) are unaffected because
`EXECUTION_SECTION_PRODUCERS` is not modified — and would still pass by construction if the
row were later added, since case 11 only requires every row to name a non-empty producer and
case 12 derives its expectation from the table itself. The pinned digest in
`tests/source-stays-searchable.test.js` is safe on both counts: its `FIXTURE` (lines 54-82)
contains no `Deferred Questions` heading, so the golden constant cannot move.

`tests/approval-boundary-is-legible.test.js` is declared in `files:` because it is the file
that would pin the producer row if the human answers "add it"; this slice does not edit it.

## The human's ruling (2026-09-03) — the question below is ANSWERED

The human chose, with the proofs in hand: **add the row AND re-record every affected
plan's approval in the same change**, so no plan is left holding a digest recorded
under the old semantics. Binding consequences for the build:

1. Append the seventh row to `EXECUTION_SECTION_PRODUCERS`:
   `{ heading: 'deferred questions', producer: 'iron-loop integrator (src/lib/iron-loop.js appendDeferredQuestions) — written during refinement at the build-queue crossing' }`.
2. In the same build, enumerate every ledgered plan across `todo/`, `in-progress/`,
   `review/` and `done/`, compute `contentMatches` under the NEW semantics, and for
   each entry that flips from match to mismatch (measured expectation: the ~53
   carriers of the heading), re-record its digest through the ONE sanctioned writer:
   `node src/scripts/ledger-backfill.js --plan <path> --stage <its recorded stage_to> --reason "exempt table gained the deferred-questions row by human ruling 2026-09-03; digest re-recorded under the new semantics"`.
   `backfillEntry` writes via `writeEntry` (verify at build that it overwrites an
   existing entry; if the script refuses an existing entry or the plan's recorded
   `stage_to`, extend the script minimally — it is in `files:` for exactly this).
   Every re-recorded entry reads `entryKind: backfilled`, never `human` — the audit
   can always tell the migration from a live approval.
3. Acceptance after the re-record: `contentMatches` is true for every ledgered plan
   EXCEPT `00252-close-the-coverage-holes-s18-remainder-hooks-commands`, whose
   mismatch is caused by the `kickback_counts` frontmatter block (a separate plan,
   "A kickback must not revoke the build's own permission", handles that class; the
   human re-approves 00252 through the menu, or its digest is re-recorded here too —
   re-record it here, with its own reason naming the kickback block, so zero
   mismatches remain).
4. The proof cases the planner specified stay, retargeted to the new truth: a
   fixture approved WITH the section present verifies both before and after the row
   (because its entry is re-recorded), and the case that showed real `plans/todo/`
   bytes hashing differently with the section removed becomes the guard that the
   re-record actually happened (zero mismatches on the live scan).

## The question this slice handed back (answered above — kept for the record)

The parent plan's part B is held, with its evidence, for one decision. State it to the human
in plain words, with the number case 4 measures:

> The refinement pass writes the "Deferred Questions" note into a plan BEFORE the approval
> record is taken, so that note is part of what the approval is bound to. Exempting it now
> would invalidate the approval on every plan that already carries it (measured: 12 waiting
> to be built, 1 being built, about 40 waiting for your sign-off). The two plans that
> currently fail their approval check fail for a different reason — one had a kickback
> counter written into its header during the build. What should happen to the exemption
> request?

Candidate answers, flat, with no recommendation manufactured (this is a scheduling and risk
decision, not a quality one):

1. Drop the exemption request. The two failing plans are re-approved through the menu, which
   records a fresh digest over their current bytes.
2. Add the row AND re-record every affected plan's approval in the same change, through the
   sanctioned `src/scripts/ledger-backfill.js`, so no plan is left holding a digest under the
   old semantics.
3. Leave both the row and the failures alone and treat the two failures as an ordinary
   re-approval, deciding the exemption later.

## Decisions Taken Under Ambiguity

1. **`validateEscalations` and `validateStepLabels` keep the first-region derivation.**
   Justified above from the code, not from the parent plan's sentence alone: moving the
   escalation scan would silently drop errors it raises today, which the Definition of Done
   forbids, and moving the label check would point it at CTOC's own generated template.
2. **The canonical lookup is a second `match`, not a shared helper.** Three sites repeat the
   region derivation and only one is changing; a helper named as if it were shared, used by
   one caller, would hide that divergence instead of naming it. The comment at the changed
   site names the other two and why they differ.
3. **The exemption row is not written, and the question is handed back with proof.** The
   ordering in `actions.js` lines 496-512 and `stampAndLedger` line 356 is direct evidence
   that the row would move digests that are already recorded, and `circuit-breaker.js`
   explains the failure the row was meant to fix. Writing it on the parent plan's reading
   would be a guess with a repository-wide blast radius; cases 3 and 4 make the answer
   measurable instead. `src/lib/approval-ledger.js` stays in `files:` so the answer, once
   given, is implementable here without a scope change.
4. **The declared `files:` list is unchanged from the parent plan** even though this slice
   edits only two of the five. The list is the write permission the human approved;
   narrowing it would force a scope-growth request the moment the question above is answered.

5. **The re-record uses a new `--hash-scope specification` flag, not `backfillEntry`'s
   whole-file default.** Verified at build: `backfillEntry` hashed the WHOLE file
   (`computeContentHash`), which `resolveHash` records honestly as `hash_scope: 'file'`.
   That is the right binding for the 2026-07-14 legacy migration — those plans were
   finished — but it is the wrong one here. All 35 flipped entries are live,
   specification-scoped plans; 33 sit in review and two are in the build queue, one of
   them THIS plan. A whole-file digest over a plan still being built is invalidated by
   the next line its own executor writes, which surfaces as `hash-mismatch` — an attack
   signature — and revokes the build's own write permission. So the flag was added
   (closed enum, validated, whole-file still the default, legacy path byte-for-byte
   unchanged) and every re-record was taken under specification scope. Confirmed after
   the migration: `approval-residency.isApprovedForCoverage` returns
   `{approved: true, kind: 'backfilled'}` for this plan and for the one in the queue.

6. **The ruling's acceptance criterion "zero mismatches across all ledgered plans" is
   NOT met, is not pursued, and is reported instead of absorbed.** It was written on the
   premise that two plans were failing. The measured premise is 94, and this change
   repairs none of them (see the baseline above: zero entries unflip). Reaching a global
   zero would mean re-recording 93 further approvals whose digests moved for reasons
   nobody has examined — which is precisely the post-approval laundering the ledger
   exists to expose, at repository scale, on a slice authorised to fix a validator
   region lookup. What WAS done is the operative half of the ruling, exactly as written:
   every entry that flips under the new semantics is re-recorded, plus `00252` by name.
   Measured after: 94 → 93 total mismatches (only `00252` cleared), 36 entries carry the
   2026-09-03 reason, all 36 classify `backfilled` and none `human`. The remaining 93
   are a decision for the human, stated below.

7. **The live guard asserts an attributable property, not a global zero.** A global
   zero-mismatch assertion would be red on arrival for 93 unrelated reasons and would
   stay flaky forever. The committed guard walks every SPECIFICATION-scoped ledger entry
   whose plan carries the note and requires it to match, subtracting a pinned set of the
   21 that already failed before this change. It is a subset assertion, so re-approving
   any of those 21 never turns the suite red, while any NEW name does. Verified RED in
   the live window between the exempt row landing and the migration running: the same
   walk returned 57 mismatching note-carriers, 36 of them outside the pinned set — the
   35 flips plus `00252`. After the migration it returns zero.

8. **This plan had no canonical `## Execution Plan (Steps 8-16)` section, so one was
   written before the digest was re-recorded.** The integrator's own note in this file
   reports "no Step 8, 9, 10, 11, 12, 13, 14, 15, 16 found", and the heading was
   genuinely absent — the very defect this slice fixes could not have been ticked
   against. The section was appended in the template shape `src/lib/iron-loop.js`
   emits, BEFORE the re-record, so the recorded specification covers it. Every later
   write to this file lands either on a checkbox line (stripped from the digest) or
   inside an exempt section, so the entry stays valid through completion.


## Deferred Questions

_Written by the Iron Loop integrator (src/lib/iron-loop.js), which performs NO
quality evaluation. These entries are the integrator's own report on itself, not
findings from a critic that read this plan._

- **evaluation**: NOT EVALUATED — no automated critique was performed on this plan. The refinement loop appended the Steps 8-16 template and assessed nothing. (The scores this step used to report were computed from that same template, not from the plan.) A human or a real critic must review this plan before it is built. Structural fact: no Step 8, 9, 10, 11, 12, 13, 14, 15, 16 found.

## Execution Record

### Baseline measurement, taken BEFORE any edit (2026-09-03)

A read-only scan of every ledgered plan across `plans/todo/`, `plans/in-progress/`,
`plans/review/` and `plans/done/` (395 plans hold a ledger entry), computing
`contentMatches` on the live bytes, and re-computing the specification digest with the
`## Deferred Questions` section removed to predict the flip set. Exactly one heading
spelling exists on disk: `## Deferred Questions`, 57 occurrences, no other level and no
suffixed variant.

| Measurement | Count |
|---|---|
| Ledgered plans scanned | 395 |
| Already mismatching BEFORE this change | **94** |
| Entries that FLIP match → mismatch when the row is added | **35** |
| Entries that UNFLIP mismatch → match when the row is added | **0** |
| Plans carrying a `## Deferred Questions` heading | 57 |

Three facts here contradict the premise the ruling was given, and are reported rather
than absorbed:

1. **The row fixes nothing.** Zero entries unflip. Neither `00234` nor `00252` — the two
   plans the parent plan said the row would repair — is restored by it. This is exactly
   what the slice's own ordering proof predicted (`actions.js` runs the refinement pass
   BEFORE `stampAndLedger`, so the section was already inside every recorded digest);
   the measurement now confirms it on the live ledger rather than by argument.
2. **The flip set is 35, not the ~53 the ruling estimated.** All 35 are
   `hash_scope: 'specification'` with `stage_to: 'todo'` — 33 in `plans/review/`, one in
   `plans/todo/`, and one in `plans/in-progress/`, which is THIS plan.
3. **94 plans already mismatch, not 2.** Every one of them is unrelated to this change
   (the row unflips none of them): 269 of the 395 entries carry legacy whole-file
   (`hash_scope` absent or `'file'`) semantics, so any ordinary post-approval execution
   record invalidates them by construction. The flip set is disjoint from this set, so
   after re-recording the 35 flips plus `00252` (which the ruling names), **93 of the 94
   pre-existing mismatches remain**. Re-recording those 93 is NOT done here — see the
   decision recorded below.

---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Test: a plan carrying BOTH execution sections is judged by the canonical one — tests/plan-validator.test.js; RED first with 7 "unchecked required checkbox" errors (steps 8, 9, 10, 11, 13, 14, 16), green after the fix
- [x] Test: a prose-only execution section still fails every required step — tests/plan-validator.test.js; GREEN before and after, the guard that the fix never turns an unticked plan into a pass
- [x] Test: the integrator's Deferred Questions note does not invalidate an approval — tests/approval-hash-survives-execution.test.js; RED before the exempt row, green after
- [x] Test: an approval recorded WITH the note present still verifies after a rewrite — tests/approval-hash-survives-execution.test.js; RED before the exempt row, green after
- [x] Test: LIVE LEDGER — no plan mismatches BECAUSE of the deferred-questions exemption — tests/approval-hash-survives-execution.test.js; measured RED in the live window between the row and the migration (57 mismatching note-carriers, 36 outside the pinned set), zero after
- [x] Test: the exempt table names the deferred-questions section and its producer — tests/approval-boundary-is-legible.test.js case 11b; RED before the row, green after
- [x] Test: --hash-scope specification records a specification-scoped entry — tests/ledger-backfill-coverage.test.js; RED before the flag, green after
- [x] Test: --hash-scope defaults to whole-file and an unknown value is refused — tests/ledger-backfill-coverage.test.js; RED before the flag, green after
- [x] Test: an existing entry is OVERWRITTEN by a re-record — tests/ledger-backfill-coverage.test.js; proves writeEntry replaces rather than refuses, which the 36-plan migration depends on
- [x] Run tests - expect RED (failing) — 8 of the 9 cases failed before their source edit; the prose-only guard is green by design and is recorded as such, never banked as a pass

### Step 9: PREPARE
- [x] Check prerequisites — no new dependency added; node --test and npm test already present
- [x] Verify every declared path exists on disk before editing it — all seven declared files read in full first
- [x] Measure the BEFORE baseline across every ledgered plan — 395 ledgered, 94 already mismatching, 35 flips, 0 unflips (table above)

### Step 10: IMPLEMENT
- [x] src/lib/plan-validator.js — extractStepBlocks prefers the canonical section; validateEscalations and validateStepLabels deliberately unchanged, with the reason at the changed site
- [x] src/lib/approval-ledger.js — backfillEntry accepts opts.hash_scope; specification routes through resolveHash so digest and scope stamp derive together
- [x] src/scripts/ledger-backfill.js — the --hash-scope flag, narrowed by comparison to a closed enum, refused on an unknown value, whole-file still the default
- [x] src/lib/approval-ledger.js — the seventh EXECUTION_SECTION_PRODUCERS row, per the human ruling of 2026-09-03, with the migration in the same change
- [x] Re-record every flipped approval through the sanctioned backfill script — 36 invocations of node src/scripts/ledger-backfill.js, 0 failures, no other channel touched .ctoc/approvals
- [x] Wire up integration points — no new module and no new export; every edit lands inside a function that already has live callers

### Step 11: REVIEW
- [x] Self-review all new code — read back in full after editing
- [x] Verify integration points work together — approval-residency.isApprovedForCoverage returns approved for this plan and for the queued plan after the migration
- [x] Check error handling completeness — an unknown --hash-scope is a loud refusal, never a silent fallback; an unlocatable specification boundary throws in resolveHash rather than recording a weaker binding

### Step 12: OPTIMIZE
- [x] Remove redundant operations — the canonical lookup is one extra regular expression only when the canonical heading is present; no hot path changed
- [x] Simplify complex code — no helper was introduced for a single caller, so the divergence between the three region derivations stays visible rather than hidden behind a shared name

### Step 13: SECURE
- [x] Validate inputs — the new flag is a closed enum narrowed by comparison; plan paths keep the existing isAbsolute/join and SLUG_RE guards
- [x] No secrets in code — no value is printed, logged or committed
- [x] Safe file operations — every ledger write went through node src/scripts/ledger-backfill.js with argv arguments; no inline evaluation and no direct write to .ctoc/approvals

### Step 14: VERIFY
- [x] Run lint + type check — eslint . --max-warnings 0 clean; tsc --noEmit clean (one regression was introduced and fixed by narrowing, not by a cast)
- [x] Run ALL tests (TDD Green) — npm test: 11960 tests, 11960 pass, 0 fail
- [x] Check coverage at or above the enforced floor — 99.9% against the enforced 99%
- [x] 0 skipped, 0 flaky tests — skipped 0, todo 0
- [x] Reachability: FILE fence and EXPORT fence both clean — 47 tests, 0 fail; no new file and no new export was created
- [x] The live gate-destination residency check is clean — iron-loop-enforcer.checkGateDestinationsApproved returned { clean: true } after the migration

### Step 15: DOCUMENT
- [x] Update the module comments at every changed site — the canonical-lookup rationale, the two-scope rationale on backfillEntry, the flag in the script header and usage, and the dated ruling on the new table row
- [x] Record the before/after measurement and the decisions taken — the baseline table above, the four added decisions, and the verification evidence below

### Step 16: FINAL-REVIEW
- [x] Verify steps 8-15 completed correctly
- [x] All quality checks passed — [CTOC test-gate] PASS
- [x] Ready for human review — built and waiting for the human's word on the remaining 93 pre-existing mismatches

## Verification Evidence

### Step 14 VERIFY — the full gated run

`npm test` from the repository root, captured in full, exit status 0:

```
ℹ tests 11960
ℹ pass 11960
ℹ fail 0
ℹ skipped 0
ℹ todo 0
[CTOC test-gate] coverage 99.9% (threshold 99%), skipped 0, failed 0
[CTOC test-gate] corpus claims: verified 3  refuted 0  unverifiable 0  (offline ledger gate: PASS)
[CTOC test-gate] PASS
```

`eslint . --max-warnings 0` — clean. `tsc --noEmit` — clean; the first gated run failed
on one new type error (`--hash-scope` arriving from argv as `string` where the option is
a two-value union) and it was fixed by narrowing the value through comparison at the
point of use, never by a cast or a suppression.

`tests/iron-loop-enforcer.test.js`, which runs the enforcer's checks against this live
repository, passes inside that run.

### The migration, before and after

| | Before the exempt row | After the migration |
|---|---|---|
| Ledgered plans scanned | 395 | 395 |
| Entries whose content no longer matches | 94 | 93 |
| Specification-scoped plans carrying the note that mismatch | 22 | 21 |
| Entries carrying the 2026-09-03 re-record reason | 0 | 36 |
| Of those, classified `backfilled` / `human` | – | 36 / 0 |

All 36 re-records ran as `node src/scripts/ledger-backfill.js --plan <path> --stage todo
--hash-scope specification --reason "<why>"`, one process per plan, zero failures. No
other channel wrote to `.ctoc/approvals` at any point in this build.

The live gate-destination residency check, run after the migration:

```
node -e "require('./src/lib/iron-loop-enforcer.js').checkGateDestinationsApproved(process.cwd())"
→ { "clean": true }
```

### What is NOT fixed, and is the human's to decide

93 approvals in this repository still do not match their recorded content. Not one of
them was caused by this change and not one is repaired by it. 269 of the 395 entries
were recorded under the older whole-file binding, where any ordinary execution record
invalidates the approval by construction — which is exactly the defect the
specification scope was introduced to end, still sitting unmigrated on the plans that
predate it.

They are not re-recorded here. Doing so would stamp a fresh approval digest over 93
plans whose bodies changed after approval for reasons nobody has examined, which is the
post-approval laundering the ledger exists to expose. The options are a plain choice
between re-approving them through the menu one at a time, migrating them in a single
reviewed pass with the sanctioned script, or leaving them as they are and letting each
plan's own next crossing settle it.
