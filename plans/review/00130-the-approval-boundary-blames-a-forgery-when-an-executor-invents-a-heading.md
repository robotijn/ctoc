---
approved_by: human
approved_at: 2026-07-19T21:23:46.332Z
gate_crossed: implementation → todo
---

---
title: "The approval boundary blames a forgery when an executor invents a heading"
type: implementation
parent_plan: ctoc-background-engine-rebuild
depends_on: none
priority: CRITICAL
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/lib/approval-ledger.js"
  - "src/lib/approval-residency.js"
  - "src/lib/iron-loop-enforcer.js"
  - "tests/approval-boundary-is-legible.test.js"
  - "CLAUDE.md"
---

# The approval boundary blames a forgery when an executor invents a heading

## What is actually on disk, measured

The mechanism that binds an approval to a plan's SPECIFICATION rather than to the
whole file landed today and works. I re-read it rather than trusting the report,
and the account below is what the code does.

- `src/lib/approval-ledger.js:276-283` — `EXECUTION_SECTIONS` is a frozen array of
  six bare strings: `execution record`, `execution log`,
  `step 16 final-review report`, `decisions taken during execution`,
  `verification evidence`, `decisions taken under ambiguity`.
- `isExecutionHeading` (`:292-297`) matches by **prefix**, deliberately — the real
  headings on disk carry suffixes (`## Execution Record (Steps 8–16)`), and an
  exact match would have recognised none of them.
- `computeSpecHash` (`:364-440`) walks the body once, drops lines inside an
  excluded section and drops `- [x]`/`- [ ]` lines, and hashes the rest with the
  frontmatter length-prefixed ahead of it.
- Every heading the list does not know is therefore **specification**. That is the
  deny-list working as designed: unknown content is protected, not exempted.

**The failure.** An executor wrote two new top-level sections into its own plan —
one recording a scope stop, one recording final state. Neither name is on the list,
so both counted as specification, the hash moved, the approval stopped binding, and
`checkGateDestinationsApproved` blocked the whole repository's self-check with that
plan as the sole offender.

**The part that makes it recur.** The scope-stop section exists BECAUSE OF the rule
set today: an executor that needs an undeclared file must stop and record what it
needed. So the new mechanism generates sections its own boundary does not
recognise. I checked whether the contract already names a heading, and it does —
`plans/implementation/00123-…md:346-347` instructs the executor to record what
landed **under `## Execution Record`**, which IS on the list. So the immediate cause
is not a missing rule; it is that an executor invented headings the contract never
asked for, and nothing anywhere told it which headings exist. The contract is
readable only if the executor happens to read that one plan.

## The ruling: keep the boundary NARROW. Do not widen it.

The human asked for this settled, and both directions have a real cost. Here is the
decision and the reasoning, stated so it can be attacked.

**I rule against widening.** Every widening proposal — a marker, a delimiter
convention, an explicit executor-owned region — moves the boundary from a **frozen
constant in reviewed source** to a boundary **chosen at runtime by the executor**.
That is not a smaller version of today's disclosed loss; it is a different kind of
loss:

| | today (frozen list) | a delimiter / marker / region |
|---|---|---|
| who decides what is excluded | a reviewer, editing source | the executor, mid-build |
| how much can be excluded | exactly the named sections | everything the executor puts below the line |
| how a widening is noticed | it is a source diff in a review | it is not noticed at all |

The module's own safety argument (`approval-ledger.js:224-241`) rests entirely on
one property: *the only silent-exemption route is a deliberate edit to a frozen
constant in a reviewed source file; nothing an executor can do at runtime is
silent.* A delimiter convention deletes that property. The disclosed loss already
recorded for `## Decisions Taken Under Ambiguity` is bounded because that section is
**one named section that confers no grant**; a runtime-chosen region is bounded by
nothing, and an executor could place specification content inside it. The human's
instruction was that this cost must not get quietly larger. Widening makes it larger
AND quieter. So: narrow.

**But narrow-as-is keeps recurring, so narrow is not the whole answer.** Three arms,
and only the third touches the boundary at all:

1. **The list must name its PRODUCER.** Today an entry is a bare string, so it can
   grow by convenience and nobody can tell who writes each section. The constant
   becomes a table — heading plus the producer that writes it — and
   `EXECUTION_SECTIONS` is DERIVED from it, unchanged in shape and value, so every
   existing consumer and the pinned digest are untouched. Adding an exemption now
   forces naming who writes it, in the same reviewed diff. This is the cheapest
   available brake on the cost growing quietly.

2. **The failure becomes LEGIBLE, which is the actual harm reported.** Today the
   human read *"missing approved_by: human in the approval ledger (a frontmatter
   marker is not an approval)"* — the message for a **forged or absent approval** —
   when the truth was a **heading name the list does not know**. That message sends
   a reader to the wrong diagnosis entirely, and it cost a full gate run. Two
   separate defects produce it:
   - `checkGateDestinationsApproved` (`iron-loop-enforcer.js:405-417`) calls the
     BOOLEAN facade `hasLedgerApproval` and throws away the `reason` that
     `classifyResidency` already computed. Every distinct cause —
     `no-ledger-entry`, `wrong-edge`, `hash-mismatch`, `ledger-corrupt`,
     `unknown-provenance` — collapses into one sentence about `approved_by: human`.
     The information exists and is discarded one call away from the message.
   - Even the un-collapsed `hash-mismatch` does not say WHICH edit moved the hash.
   So the slice adds a bounded, **proof-carrying** diagnosis (below) and surfaces
   the reason per offender.

3. **The known headings get added to the list, deliberately and by measurement.**
   The scope-stop rule is a KNOWN, ENUMERABLE producer. Its headings are added to
   the producer table with the rule named as their producer. This is the frozen
   list doing exactly its job — the sanctioned, reviewed exemption route — not a
   widening of the boundary's SHAPE.

### The diagnosis is a PROOF, not a guess

A reason that says "probably a new section" would be a guess dressed as a finding.
This one is mechanical. When a specification-scoped comparison fails,
`diagnoseSpecMismatch` recomputes the specification hash **once more** with the
top-level sections that are (a) not in the producer table and (b) not present in the
recorded set, additionally excluded. If that second hash EQUALS the entry's
recorded digest, then removing those sections restores the approved specification
byte-for-byte — which is not an inference, it is a demonstration that the appended
sections are the entire difference. The verdict then names them.

Bounds and honesty, because a diagnostic that lies is worse than none:

- **It NEVER changes acceptance.** It runs only after `match === false` and only
  ever writes a reason string. `accepted` is untouched on every path. A permission
  or approval decision here still fails closed, exactly as it does today.
- **At most ONE extra hash pass**, over content already in memory. No new I/O, no
  second read, no regular expression compiled per line.
- **"I found nothing" and "I could not look" are different answers.** No candidate
  sections → the reason stays plain `hash-mismatch` ("the specification really did
  change"). The second hash does not match → also plain `hash-mismatch`. The
  specification boundary cannot be established at all → `spec-boundary-unlocatable`,
  its own reason, never folded into either of the above and never into a pass.

## What this plan does NOT fix

Stated plainly, so nobody reads more into it than it does.

- **It does not stop the recurrence for headings nobody has thought of yet.** A
  genuinely novel heading still breaks the hash. That is the deny-list failing
  noisy, which is the correct direction and is not being changed. What changes is
  that the noise now says which heading, instead of alleging a forged approval.
- **It does not recover the disclosed loss** on `## Decisions Taken Under
  Ambiguity`. An executor can still rewrite the planner's recorded decisions
  without breaking the approval. The split that recovers it is a template and
  agent-contract change and is the human's to schedule.
- **It does not change the executor's contract.** `agents/iron-loop/iron-loop-executor.md`
  is where an executor would learn which headings exist, and it is claimed by the
  in-flight plan `00123-an-executor-that-needs-one-more-file-stops-and-asks.md`.
  Editing it here would collide. The producer table makes the authoritative list
  readable from source; wiring it into the agent contract is a separate unit of
  work, and I name it rather than silently doing half of it.
- **It does not re-hash or re-bless any existing ledger entry.** Nothing
  retroactively becomes approved. The offending plan's approval is NOT repaired by
  this slice — repairing it means re-approving it through the gate, which is the
  human's action, not a code change.
- **It does not touch `src/lib/iron-loop.js` or `src/lib/actions.js`**, both of
  which are being edited concurrently by another executor.

## Concurrency note — read before Step 10

Another executor is concurrently editing `src/lib/iron-loop.js`,
`src/lib/actions.js` and several test files. **None of those are declared here.**
`src/lib/iron-loop-enforcer.js` is a DIFFERENT file from `src/lib/iron-loop.js`;
confirm that at Step 9 before editing, and if the enforcer has moved under the other
executor's hand, stop and report rather than merging blind. `CLAUDE.md`'s documented
test-file count is contended (the in-flight `00123` also moves it) — read the live
count from disk at Step 10 and move it to what disk says, never to a number written
in a plan.

## Implementation Details

### Dependency graph

```
EXECUTION_SECTION_PRODUCERS (new constant, approval-ledger.js)
        │
        ├──derives──> EXECUTION_SECTIONS  (existing export, value UNCHANGED
        │                                  except for the deliberately added rows)
        │                    │
        │                    └──used by──> isExecutionHeading ──> computeSpecHash
        │
        └──used by──> diagnoseSpecMismatch (new, approval-ledger.js)
                             │
                             └──called by──> contentMatches (existing)
                                                   │
                                                   └──reason flows to──>
                                     approval-residency.classifyResidency
                                                   │
                                                   └──surfaced by──>
                                     iron-loop-enforcer.checkGateDestinationsApproved
```

No cycles. Nothing new is required by `approval-ledger.js` — its documented
invariant (only `gate-order` and `safe-fs`, because it sits on the every-tool-call
Bash-hook path) is preserved and must be asserted.

### File: `src/lib/approval-ledger.js`
**Action:** MODIFY
**Purpose:** Make the exemption list name its producers, and make a specification
mismatch able to prove what caused it.

1. **`EXECUTION_SECTION_PRODUCERS`** — a new frozen array of frozen objects
   `{ heading, producer }`. `heading` is the normalised prefix (trimmed, lowercase,
   marker stripped) exactly as today; `producer` is a non-empty string naming who
   writes that section (the executor step, the rule, or the agent contract). Seeded
   with the six existing headings, each given its real producer, PLUS the headings
   measured at Step 9 from the offending plan and from the scope-stop rule.
2. **`EXECUTION_SECTIONS`** — becomes
   `Object.freeze(EXECUTION_SECTION_PRODUCERS.map((e) => e.heading))`. Same type,
   same order for the existing six, same export name. Existing consumers and the
   pinned source digest are unaffected by the derivation itself; the added rows are
   a deliberate, reviewed change.
3. **`diagnoseSpecMismatch(content, expectedHash)`** → `{ reason, sections }`.
   - Returns `{ reason: 'spec-boundary-unlocatable', sections: [] }` when
     `computeSpecHash(content).ok` is false. Never a pass, never folded into
     `hash-mismatch`.
   - Collects the trimmed titles of top-level (`##`) headings in the body whose
     normalised title is NOT matched by `isExecutionHeading`. When the set is
     empty, returns `{ reason: 'hash-mismatch', sections: [] }` — "I looked and
     found no candidate", distinct from not looking.
   - Recomputes the specification hash ONCE with those sections additionally
     excluded (same single linear walk, same exclusion semantics — a section runs
     to the next heading of the same or higher level).
   - Equal to `expectedHash` → `{ reason: 'hash-mismatch-new-section', sections }`,
     where `sections` are the original-cased titles, each truncated to 80
     characters, at most 5 reported.
   - Not equal → `{ reason: 'hash-mismatch', sections: [] }`. The specification
     genuinely changed; do not speculate further.
   - Pure. No filesystem access, no throw on any input (a non-string returns
     `spec-boundary-unlocatable`).
4. **`contentMatches`** — on a specification-scope mismatch ONLY, populate the
   existing `reason` field from `diagnoseSpecMismatch(content, entry.content_sha256)`
   and add a `sections` field. `match` is computed exactly as today and is not
   touched on any path. The legacy (`file`) branch is unchanged — a legacy mismatch
   carries no diagnosis, because whole-file semantics cannot support one.
5. Extend the block comment above `computeSpecHash` with the narrow-versus-widen
   ruling, in the terms above, and with the producer-table rule.
6. **Export** `EXECUTION_SECTION_PRODUCERS` and `diagnoseSpecMismatch`.

**Nothing else in this file changes.** Not the frontmatter walk, not the checkbox
rule, not the NUL-escape separators, not `resolveHash`, not `entryKind`, not any
write path, not `verify`'s fail-closed branch.

### File: `src/lib/approval-residency.js`
**Action:** MODIFY
**Purpose:** Carry the diagnosis to the consumer instead of discarding it.

In `classifyResidency`'s hash-sensitive branch (`:177-190`), the non-match return
keeps `accepted: false` and keeps choosing `hash-mismatch-legacy` for
`scope === 'file'`. For `scope === 'specification'` it now returns `cmp.reason`
(which is `hash-mismatch`, `hash-mismatch-new-section`, or
`spec-boundary-unlocatable`) and passes `sections` through on the verdict.

**No acceptance changes anywhere.** Every one of those reasons rejects, exactly as
`hash-mismatch` does today, and `spec-boundary-unlocatable` in particular must be
pinned by a test as rejecting — it is the "I could not look" case, and a permission
decision that cannot look must deny. Update the `@returns` documentation to list
the new reasons and say plainly that all of them reject.

### File: `src/lib/iron-loop-enforcer.js`
**Action:** MODIFY
**Purpose:** Stop reporting a heading mismatch as a missing human approval.

`checkGateDestinationsApproved` (`:370-420`) switches from the boolean
`hasLedgerApproval` to `classifyResidency`, and records `{ plan, stage, reason,
sections }` per offender. The finding message is rebuilt from the reasons actually
present, so it never again asserts a cause it did not measure:

- offenders whose reason is `no-ledger-entry` or `unknown-provenance` keep the
  existing sentence about a missing or unrecognised approval — that sentence is
  TRUE for those reasons and only those;
- offenders whose reason is `hash-mismatch-new-section` are reported as *the plan's
  text changed after approval by adding section(s) the specification boundary does
  not recognise*, naming the sections and pointing at `EXECUTION_SECTION_PRODUCERS`
  as the place the recognised set is defined;
- offenders whose reason is `hash-mismatch` or `hash-mismatch-legacy` are reported
  as a post-approval change to the specification;
- offenders whose reason is `spec-boundary-unlocatable`, `ledger-corrupt`,
  `ledger-unkeyable` or `unreadable` are reported as **the check could not
  establish the answer**, worded so it cannot be read as a clean result.

Severity stays `block` for every reason. The exemptions above the check (the
`parent_plan` slice exemption, the stage loop) are untouched. `CLEAN()` still
returns a readable clean verdict — never null.

### File: `CLAUDE.md`
**Action:** MODIFY — the documented test-file count only, both occurrences, read
live from disk. Nothing else in the file is touched.

### Wiring — the live call sites

| new code | live call site | root |
|---|---|---|
| `EXECUTION_SECTION_PRODUCERS` | derives `EXECUTION_SECTIONS`, consumed by `isExecutionHeading` → `computeSpecHash` (this slice) | every gate crossing, every residency sweep, every tool call through the Bash hook |
| `diagnoseSpecMismatch` | `approval-ledger.contentMatches` (this slice) | as above |
| the new reasons | `approval-residency.classifyResidency` → `iron-loop-enforcer.checkGateDestinationsApproved` (this slice) | `/ctoc:menu` self-check, and the `PreToolUse` residency sweep |

Nothing here is created without its caller in the same slice.

### Test plan

`tests/approval-boundary-is-legible.test.js` (CREATE), `node:test`, zero doubles —
real temp roots, real ledger entries written through the real write paths, real
plan text.

| # | Case | Assertion |
|---|---|---|
| 1 | **the reported failure, reproduced** | approve a plan; append two top-level sections with names not on the list; `classifyResidency` → `accepted: false` AND `reason === 'hash-mismatch-new-section'` AND both titles in `sections` — RED today (today's reason is bare `hash-mismatch`) |
| 2 | **the enforcer no longer alleges a forgery** | the same repository state → the finding message does NOT contain `approved_by` and DOES name the sections; severity still `block` |
| 3 | a genuinely missing entry still reads as missing | no ledger entry → reason `no-ledger-entry`, message keeps the approval-marker sentence |
| 4 | a real specification edit is NOT excused | edit `## Implementation Details` prose → reason `hash-mismatch`, `sections` empty |
| 5 | a real specification edit PLUS a new section is not excused | both → the second hash does not match → `hash-mismatch`, not `…-new-section` |
| 6 | **the diagnosis never grants acceptance** | for every reason above, `accepted === false` |
| 7 | **"could not look" is its own answer** | content with no frontmatter delimiters → `spec-boundary-unlocatable`, `accepted: false`, and the enforcer message says the check could not establish the answer |
| 8 | "found nothing" is not "could not look" | a mismatch with zero unrecognised top-level sections → plain `hash-mismatch`, never `spec-boundary-unlocatable` |
| 9 | legacy entries are untouched | an entry with no `hash_scope` → `hash-mismatch-legacy`, no `sections`, still rejects |
| 10 | the added headings actually exempt | a plan carrying the measured scope-stop heading verifies TRUE after approval |
| 11 | **every producer row is named** | every entry in `EXECUTION_SECTION_PRODUCERS` has a non-empty `heading` and a non-empty `producer`; headings are unique and already normalised |
| 12 | the derived export is unchanged in shape | `EXECUTION_SECTIONS` is a frozen array of strings and equals the table's headings in order |
| 13 | no gate is weakened | `wrong-edge`, `no-ledger-entry`, `unknown-provenance`, `ledger-corrupt`, `pipeline-not-allowed`, `sufficiency-not-allowed` all reject exactly as before |
| 14 | the module stays hook-path clean | `approval-ledger.js` requires nothing beyond `crypto`, `path`, `./safe-fs`, `./gate-order` |
| 15 | the diagnosis is bounded | at most 5 sections reported, each at most 80 characters, and a 500-section document produces exactly one extra hash pass |
| 16 | it never throws | `diagnoseSpecMismatch` on `null`, `''`, a number, and a 1-byte file returns a verdict rather than throwing |

## Execution Plan (Steps 8-16)

### Step 8: TEST — write `tests/approval-boundary-is-legible.test.js` in full, run ONLY it, record the red output verbatim. Cases 1, 2, 7, 11 and 15 MUST be red. Cases 3, 4, 9 and 13 MUST be GREEN before any source change: they are the "nothing else moves" guards, and a change that turns any of them red has weakened a gate rather than clarified a message.
- [x] TEST — TDD tests present; workflow Step-11 REVIEW (2026-07-29) confirmed real/adversarial, not vacuous.
### Step 9: PREPARE — **measure the two headings before writing anything.** Find the plan that blocked the self-check and read its ACTUAL top-level headings from disk; read `plans/implementation/00123-an-executor-that-needs-one-more-file-stops-and-asks.md` and the current text of `agents/iron-loop/iron-loop-executor.md` to see which headings the executor contract actually names. Record the measured heading strings verbatim in the Step 16 report — this plan deliberately does not guess them. Then confirm `src/lib/iron-loop-enforcer.js` is not under the concurrent executor's hand; if it is, STOP and report. Read in full: `src/lib/approval-ledger.js`, `src/lib/approval-residency.js`, `iron-loop-enforcer.js:337-420`, and `tests/source-stays-searchable.test.js` (it pins a digest of this module — confirm what it pins before editing).
- [x] PREPARE — plan ancestry + code confirmed against the real implementation.
### Step 10: IMPLEMENT — one step, files as sub-items.
- [x] IMPLEMENT — declared files implemented; full gated npm test green.
  - `src/lib/approval-ledger.js` — `EXECUTION_SECTION_PRODUCERS`, the derived `EXECUTION_SECTIONS`, `diagnoseSpecMismatch`, `contentMatches` carrying the reason, the extended block comment, the two new exports.
  - `src/lib/approval-residency.js` — pass the specification-scope reason and `sections` through `classifyResidency`; update the returns documentation.
  - `src/lib/iron-loop-enforcer.js` — classify instead of boolean-test, per-offender reasons, a message rebuilt from the reasons actually present.
  - `CLAUDE.md` — the documented test-file count, read live from disk.
### Step 11: REVIEW — prove the three properties this slice rests on. First: no path reaches `accepted: true` that did not before — diff the acceptance logic and state that `match` is computed identically. Second: run the fence against this repository's live ledger and report the real counts — how many plans in gate destinations are accepted, and the reason breakdown before and after, which must differ only in reason STRINGS. Third: grep every consumer of `EXECUTION_SECTIONS` and confirm the derivation changed none of them.
- [x] REVIEW — adversarial iron-loop-critic REVIEW via backfill workflow (2026-07-29): CLEARS Gate 3.
### Step 12: OPTIMIZE — confirm the diagnosis costs at most one extra hash pass and runs ONLY on an already-failed comparison; no regular expression compiled per line; no second read of any plan; no new require in `approval-ledger.js`.
### Step 13: SECURE — this is approval-provenance code, so state the threat model explicitly in the report. Confirm the excluded region grew by exactly the measured, named headings and by nothing else, and that each new row names its producer. Confirm the frontmatter (and therefore `files:`, the write-surface grant) stays hashed in full. Confirm `diagnoseSpecMismatch` cannot be reached before a failed match, cannot write anything, and cannot flip a verdict. Confirm `.ctoc/approvals/` remains agent-write-denied on both channels.
- [x] SECURE — security-scanner SECURE via backfill workflow (2026-07-29): CLEARS; no block/critical.
### Step 14: VERIFY — `node --test tests/approval-boundary-is-legible.test.js tests/approval-*.test.js tests/human-gate*.test.js tests/gate*.test.js tests/source-stays-searchable.test.js` green, then the full gated run `npm test` with coverage at or above the enforced floor and 0 skipped. Lint the changed files. No git operations.
- [x] VERIFY — full gate recorded to .ctoc/state/verify/<slug>.json: passed=true, coverage >=99%, 0 skipped, 0 failed.
### Step 15: DOCUMENT — the module header states the narrow-versus-widen ruling in plain words: the boundary stays a frozen list because a runtime-chosen boundary lets the executor decide what is excluded, and the whole safety argument is that the only silent exemption is a reviewed source diff. Document the producer table, the proof-carrying diagnosis and its three distinct answers, and restate the disclosed loss unchanged.
### Step 16: FINAL-REVIEW — report files, tests, red and green evidence verbatim, the Step 9 measured heading strings, the Step 11 ledger counts, and every decision taken under ambiguity.
- [x] FINAL-REVIEW — workflow REVIEW+SECURE verdict (2026-07-29): CLEARS Gate 3.

## Decisions Taken Under Ambiguity

1. **Narrow, not widened — and the reasoning is the fault DIRECTION, not
   convenience.** A marker, delimiter or executor-owned region moves the boundary
   from a reviewed source constant to a runtime choice made by the party whose
   writes the boundary exists to contain. The module's entire safety argument is
   that the only silent exemption is a reviewed source diff; a delimiter deletes
   that argument. The narrow list keeps failing noisy, which is recoverable; a
   runtime boundary fails silent, which is not.
2. **The list gains a PRODUCER column rather than just new rows.** New rows alone
   fix today and let the cost grow quietly tomorrow. Forcing each exemption to name
   who writes it makes an unjustifiable addition visible in the same diff, which is
   the only brake available inside a frozen-constant design.
3. **`EXECUTION_SECTIONS` is DERIVED, not replaced.** It is exported and consumed
   elsewhere, and this module's source digest is pinned by a test. Changing its
   shape would ripple for no benefit; deriving it keeps every consumer and the pin
   intact while the table becomes the source of truth.
4. **The diagnosis carries a proof and never an inference.** A reason that
   speculated would be a guess dressed as a finding. Re-hashing with the candidate
   sections excluded and requiring an EXACT match against the recorded digest turns
   the claim into a demonstration; when the demonstration fails, the reason falls
   back to the plain mismatch rather than hedging.
5. **The diagnosis is reason-only and cannot touch acceptance.** It runs strictly
   after `match === false` and writes only strings. Anything else would put a
   diagnostic on the approval path, which is how a fence becomes a hole.
6. **Three distinct answers, never two.** `hash-mismatch` (I looked, the
   specification changed), `hash-mismatch-new-section` (I looked, and here is the
   proof), `spec-boundary-unlocatable` (I could not look). Collapsing the third
   into either of the others is exactly the false-green shape this repository
   fences, and all three reject.
7. **The enforcer's message is rebuilt from measured reasons, not reworded.**
   Rewording one sentence would still assert a cause on offenders it did not
   measure. The reason already exists one call away and was being discarded by the
   boolean facade; using it is the actual fix.
8. **The exact new heading strings are MEASURED at Step 9, not written here.** I
   was told two sections were added but not their text, and inventing plausible
   headings would have produced a list that matches nothing on disk — the precise
   failure recorded as executor decision 12 in
   `plans/review/00084-approval-hash-survives-its-own-pipeline.md`. The offending
   plan is on disk, so this is measurable rather than a fork for the human.
9. **The executor agent contract is NOT edited here, and the gap is named rather
   than half-closed.** `agents/iron-loop/iron-loop-executor.md` is claimed by the
   in-flight scope-stop plan. Editing it would collide; editing "just a little" of
   it would collide silently. The producer table makes the authoritative list
   readable from source, and wiring it into the contract is named as its own unit
   of work for the human to schedule.
10. **The offending plan's own approval is not repaired by this slice.**
    Re-hashing it to make the fence green would be exactly the laundering the
    mechanism exists to expose. Its approval is repaired by the human re-crossing
    the gate, and the slice must not do that to itself.

## Decisions Taken During Execution (Step 16)

11. **No new exempting heading row was added — arm 3 is a no-op by MEASUREMENT, not
    omission.** Step 9 measured the scope-stop rule's actual heading: plan 00123
    records what landed under `## Execution Record`, which is ALREADY the first row of
    the list. The repository self-check was CLEAN on this branch (no current offender to
    measure a novel heading from), and Decision 8 forbids guessing heading strings. The
    only headings an executor invented that broke the hash (measured in
    `plans/review/00084-…`, e.g. `## A second verified defect, for the human to
    schedule`) are exactly the "novel headings nobody thought of" the plan's own "What
    this does NOT fix" says must keep breaking NOISILY. Adding an exempting row for them
    would change WHAT the boundary decides and make a failing check pass — forbidden by
    the human's explicit brief ("do NOT change WHAT the boundary decides… never make a
    failing approval check pass… FAIL-CLOSED"). So the producer table names the
    `execution record` row's producer as including the scope-stop rule, and adds ZERO
    new exempting rows. The exclusion set is byte-for-byte unchanged (GOLDEN digest
    pinned in `tests/source-stays-searchable.test.js` is unmoved), so no existing
    approval was affected. Arms 1 (producer table) and 2 (legible diagnosis) are
    implemented in full; arm 3 required nothing to add.
12. **`diagnoseSpecMismatch` implements the plan's line-126 intent `(b)` — "sections
    not present in the recorded set" — via a SOUND positional proxy, because line 228's
    literal "all non-execution top-level headings" is inadequate.** With only the
    recorded digest (no approved text, and NO write-path/schema change permitted),
    excluding ALL non-execution top-level sections would drop legitimate specification
    sections (e.g. `## Implementation Details`) that the recorded digest INCLUDED, so the
    proof could never restore it on a real plan — and the acceptance tests (case 1)
    require detection on a realistic plan carrying `## Implementation Details`. The
    candidate set is therefore the non-execution top-level (`##`) sections positioned
    AFTER the last execution section — where an executor demonstrably APPENDS its
    invented sections. SOUNDNESS IS INDEPENDENT OF THE HEURISTIC: an exact match of the
    candidate-excluded hash against the recorded digest is a byte-for-byte demonstration
    that those sections are the entire difference, whatever the selection; a poor choice
    only lowers diagnostic RECALL (falls back to plain `hash-mismatch`), never fails
    closed the wrong way and never grants acceptance.
13. **One justified existing-test change.** `tests/approval-hash-survives-execution.test.js`
    asserted that a no-frontmatter specification entry reports `hash-mismatch`. This plan
    (approved at Gate 2) replaces that contract: an unlocatable boundary now reports
    `spec-boundary-unlocatable` ("the check could not look") — a MORE precise reason.
    Acceptance is unchanged (still `false`); the assertion was tightened toward truth,
    never loosened. The enforcer message keeps the exact phrase `approved_by: human in
    the approval ledger` for genuinely missing approvals, so its existing test needed no
    change.
