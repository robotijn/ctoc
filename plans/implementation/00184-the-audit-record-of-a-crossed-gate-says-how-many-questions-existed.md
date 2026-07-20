---
title: "The audit record of a crossed gate says how many questions existed, not only how many were answered — and the comment above it stops describing the opposite of what the code does"
type: implementation
parent_plan: none
depends_on: 00181-an-unflagged-question-blocks-a-gate-instead-of-waving-it-through
priority: HIGH
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/lib/streaming-gate.js"
  - "tests/sufficiency-evidence.test.js"
---

# The audit record of a crossed gate says how many questions existed

## The defect, read on disk

`src/lib/streaming-gate.js:410-415`, inside `crossBySufficiency`:

```js
const result = require('./streaming-precompute').readAnsweredQuestionIds(root, ref);
const answered = [...result.ids];
const evidence =
  `sufficiency: ${ref} — ${answered.length} question(s) answered` +
  `${answered.length ? ` (${answered.join(', ')})` : ''}; enough (no unanswered fork)` +
  `${result.unbound > 0 ? `; ${result.unbound} recorded answer(s) did not bind to this revision` : ''}`;

ledger.writeSufficiencyEntry(slug, { …, evidence, … }, root);
```

**The evidence records the ANSWERED count and never the count that EXISTED.** For a
plan whose questions file holds an empty array, this writes, permanently:

```
sufficiency: implementation/example.md — 0 question(s) answered; enough (no unanswered fork)
```

Every word of that is literally true. It is also **indistinguishable from the record
of a genuinely fork-free plan that a full adversarial critique examined and cleared.**
That string is the audit trail of a crossed human gate, and it cannot answer the one
question an auditor brings to it: *how much was this plan actually asked?*

The same string is written when twelve unflagged questions were open (the `00181`
defect) — twelve existed, zero were answered, zero were blocking, and the record says
"no unanswered fork".

An audit record whose two most different inputs produce identical bytes is not an
audit record.

## The fix: the denominator goes on the record

The evidence gains the facts that make the numerator meaningful:

```
sufficiency: implementation/example.md — 7 question(s) computed, 3 answered
  (q1-storage-location, q4-retry-policy, q7-migration-order); 4 unanswered, 0 blocking;
  attested by gate-critic (premortem/devils-advocate/red-team all clean-pass at full coverage);
  enough (no unanswered fork)
```

Four facts that the current string cannot express:

| Fact | Why it belongs on a permanent gate record |
|---|---|
| **computed** — how many questions the file held | Separates "asked seven, cleared them" from "asked nothing" |
| **unanswered, and how many of those were blocking** | The verdict's actual arithmetic, rather than its conclusion |
| **attestation summary** | Whether a critique is on record at all (`00182`'s block; `not recorded` before `00183` lands) |
| **empty-list marker** | An explicit phrase when the file held zero questions, so it is greppable in history |

Every value comes from `planQuestionsStatus` and `hasEnoughInformation`, both of
which the caller has already computed. **Nothing new is read from disk.**

### Why an evidence string and not a structured field

`writeSufficiencyEntry` takes an `evidence` string today, and `approval-ledger.js`
already fails closed on entry shape in ways this slice must not disturb. Adding
structured fields would change the ledger's schema, and the ledger's write path is
protected from agent edits by the `PreToolUse` deny rule — a schema change there is a
larger, differently-shaped decision than fixing a record's content.

**The string is made complete and greppable; the schema is left alone.** The
counts appear in a fixed order with fixed labels so `00180`'s auditor can parse them
without ambiguity, and so a human reading a ledger entry sees the arithmetic rather
than the conclusion.

## The second half: a comment that states the opposite of what the file does

`src/lib/streaming-gate.js:334-341`, above `sufficiencyFor`:

> ── IT SHOWS. IT DOES NOT CROSS. ──
> `enough: true` is rendered to the human and nothing more. It must NOT auto-approve,
> because `approval-ledger.entryKind` classifies any entry whose `advanced_by` it does
> not recognise as `'human'` — so an automatic crossing would be recorded as the
> human's own approval. That is a forged approval created by a classifier default.
> Auto-crossing is safe only once `entryKind` fails closed; until then this is
> display, deliberately.

**The precondition it names was met and the crossing was added 160 lines below.**
`entryKind` now fails closed — `approval-ledger.js:804-822` tests `advanced_by` before
`approved_by`, uses a presence guard rather than a value check, and returns `'unknown'`
for an unrecognised value rather than the value itself. And `pendingGateDecisions:498`
crosses.

So a reader auditing the most safety-critical path in the module lands first on a
comment asserting that the path does not exist. That reader either believes the
comment and stops looking, or distrusts the file entirely. **The comment was correct
when written; it is now the most misleading text in the module**, and it sits directly
above the function whose verdict authorises the crossing.

Rewrite it to describe what the code does: the verdict both DISPLAYS and, at a
pre-build gate with a valid attestation, CROSSES — and record that the crossing became
safe when `entryKind` began failing closed, because that history is the reason the
design is defensible and deleting it would lose the argument.

## Implementation Details

### File: `src/lib/streaming-gate.js`
**Action:** MODIFY — the evidence string in `crossBySufficiency`, and the comment block above `sufficiencyFor`

`crossBySufficiency` calls `planQuestionsStatus` (or receives the already-computed
verdict — Step 9 determines which, per the note below) and composes the fuller
evidence string. **Every count is read, never inferred**; when a count is genuinely
unavailable the string says `unknown`, never `0`. That distinction is the entire
subject of this repair set, and an evidence string that writes `0` for "I could not
read it" would put the defect into the permanent record while purporting to fix it.

`sufficiencyFor` also gains the counts in its returned object if Step 9 finds that
threading them from the single existing call is cleaner than a second read. **Prefer
threading.** `pendingGateDecisions:494` already calls `sufficiencyFor` exactly once
per decision and passes the same verdict to both the cross and the display —
Decision 5 in the existing code, deliberate and load-bearing. A second independent
read inside `crossBySufficiency` could observe a different revision than the verdict
that authorised the crossing, which would make the evidence describe a state that was
never the basis of the decision. **Do not introduce that seam.**

### File: `tests/sufficiency-evidence.test.js`
**Action:** CREATE

| # | Case | Assertion |
|---|---|---|
| 1 | seven questions, three answered, none blocking | evidence contains `7 question(s) computed`, `3 answered`, `4 unanswered`, `0 blocking` |
| 2 | **empty questions list** | evidence contains an explicit empty-list phrase and `0 question(s) computed` — **distinguishable from case 3** |
| 3 | seven questions, all seven answered | `7 question(s) computed`, `7 answered` — and the string differs from case 2's. **The two cases the old format collapsed** |
| 4 | the answered ids are listed | present and comma-separated, as today |
| 5 | unbound answers are still reported | the existing `did not bind to this revision` clause survives |
| 6 | attestation summary present when attested | names the producer and the prosecution lens states |
| 7 | attestation summary reads `not recorded` when absent | never blank, never omitted — an absent attestation is a fact worth recording |
| 8 | **an unreadable count renders `unknown`, never `0`** | force `planQuestionsStatus` to a non-`ready` state and assert the string says `unknown` |
| 9 | the entry is written with `advanced_by: 'sufficiency'` and no `approved_by` | `entryKind` returns `'sufficiency'` — the existing invariant, guarded here because this slice edits the writer's caller |
| 10 | the entry-and-moved-or-neither invariant survives | force the move to fail; assert the ledger entry is rolled back |
| 11 | idempotency survives | a plan already carrying an entry for this destination is not re-crossed |
| 12 | **the stale comment no longer asserts the code does not cross** | read `src/lib/streaming-gate.js` and assert the phrase `IT DOES NOT CROSS` is absent while `crossBySufficiency` is present. A drift guard on a comment that already went stale once |
| 13 | evidence is parseable by the auditor | `00180`'s `auditSufficiencyCrossings` reads an entry written by this code and reports the counts — **the round trip that proves the format is machine-readable and not merely prettier** |

Fixtures under `os.tmpdir()`, `path.join`, teardown with
`fs.promises.rm(root, { recursive: true, force: true })`. The real `.ctoc/approvals`
is never written.

---

### Wiring — the live call sites

| change | live call site | root |
|---|---|---|
| the evidence string | `crossBySufficiency`, called from `pendingGateDecisions:500` | `/ctoc:menu` gate screen |
| the corrected comment | read by every human and agent auditing this module | the file itself |

`pendingGateDecisions` runs on every gate screen render. Nothing here is reachable
only from a test.

## Test Plan

Covered by `tests/sufficiency-evidence.test.js`. Cases 2, 3 and 8 are load-bearing —
they are the three ways the record could still fail to distinguish a cleared plan from
an unexamined one. Cases 9, 10 and 11 guard invariants this slice must not break while
editing their caller. Case 13 is the cross-plan round trip.

## Execution Plan (Steps 8-16)

### Step 8: TEST
Write the test file in full FIRST and run only it. Cases 1, 2, 3, 6, 7, 8, 12 and 13
must be RED. **Record case 2's and case 3's red output side by side** — two identical
evidence strings from two maximally different inputs is the defect, and seeing them as
identical bytes is the evidence. Cases 9, 10 and 11 must be GREEN at Step 8 and must
remain green afterward; they are the invariants.

### Step 9: PREPARE
Read from disk: `src/lib/streaming-gate.js:323-528` in full (`sufficiencyFor`, its
stale comment, `crossBySufficiency`, `pendingGateDecisions`);
`src/lib/approval-ledger.js` `writeSufficiencyEntry` and `entryKind` (confirm the
evidence field's constraints — length limits, whether it is validated at all);
`src/lib/streaming-precompute.js` `planQuestionsStatus`, `hasEnoughInformation` and
`readAnsweredQuestionIds` **as changed by `00181`**. **Decide whether the counts are
threaded from the existing `sufficiencyFor` call or read afresh, and record the
decision with its reason — the plan prefers threading and says why.** Confirm
`00180`'s auditor exists for case 13; if it does not, case 13 is deferred to a
declared follow-up **and that must be reported at Step 16, not silently dropped.**
**Where the code disagrees with this plan, THE CODE WINS.**

### Step 10: IMPLEMENT
- `src/lib/streaming-gate.js` — the fuller evidence string; the corrected comment
  block above `sufficiencyFor`.
- `tests/sufficiency-evidence.test.js` — the thirteen cases.

### Step 11: REVIEW
Confirm no count in the evidence string was inferred rather than read, and that
`unknown` appears wherever a count was unavailable. Confirm the single-call
discipline at `pendingGateDecisions:494` is preserved — one verdict, used by both the
cross and the display. Confirm the rewritten comment describes the code as it is AND
retains the `entryKind` history that makes the design defensible.

### Step 12: OPTIMIZE
No additional filesystem reads if the counts are threaded. If Step 9 concludes a
second read is unavoidable, that is one extra read per crossing — but it must be
justified against the revision-skew risk named above, in writing.

### Step 13: SECURE
The evidence string is written into a ledger entry that an agent may not edit but any
human may read. Question ids are producer-authored: `stripCtl` them and cap the joined
list's length so a hostile id cannot inject control characters or unbounded text into
a permanent record. Confirm the entry write remains inside `.ctoc/approvals/` and that
the slug derivation is untouched.

### Step 14: VERIFY
`node --test` on the new file plus every existing streaming-gate, approval-ledger and
approval-residency test, then the full gated run `npm test`. Lint at
`--max-warnings 0`. No git operations. **Report the full evidence string this code now
writes for a real crossing, verbatim** — the record is the deliverable, so it must be
read rather than assumed.

### Step 15: DOCUMENT
Record the evidence format in `CLAUDE.md` alongside the sufficiency-crossing
description, so an auditor knows what the fields mean without reading the source.
Update the documented test-file count in both places from the live disk count.

### Step 16: FINAL-REVIEW
Report the Step 8 side-by-side reds, the verbatim evidence string from Step 14, the
Step 9 threading decision with its reason, whether case 13 ran, and every decision
taken under ambiguity.

## What this plan does NOT fix

- It does **not** stop an unattested plan from crossing. That is `00182`. This slice
  makes the RECORD of a crossing honest; it does not change which crossings happen.
- It does **not** retroactively repair historical ledger entries. Existing entries keep
  their old evidence format; `00180`'s auditor must tolerate both, and reports the
  older shape's counts as `unknown` rather than inventing them. **Backfilling a record
  of a decision nobody observed would be manufacturing evidence.**
- It does **not** change the ledger schema, `writeSufficiencyEntry`, `entryKind`, or
  the approval-residency path. Those were confirmed to fail closed and are out of
  scope.
- It does **not** audit whether the crossing has ever fired — `00180`.

## Decisions Taken Under Ambiguity

1. **The evidence stays a STRING; the ledger schema is untouched.** The write path is
   protected from agent edits and its shape is load-bearing for `entryKind` and the
   residency check. Fixing a record's content is a smaller and safer change than
   altering the schema of the structure that fences forged approvals.
2. **The counts are THREADED from the single existing verdict, not read again.** A
   second read could observe a different revision than the one that authorised the
   crossing, producing evidence describing a state that was never the basis of the
   decision — a subtler version of the defect being fixed. The existing single-call
   discipline is deliberate and is preserved.
3. **An unavailable count renders `unknown`, never `0`.** Writing `0` for "I could not
   read it" would inscribe this repair set's defect into the permanent record while
   claiming to remove it.
4. **The empty list gets an explicit, greppable phrase** rather than only `0
   question(s) computed`. History is searched with plain text, and a distinct phrase
   makes every historical instance findable in one pass.
5. **An absent attestation is recorded as `not recorded`, never omitted.** A missing
   clause reads as an older format; an explicit `not recorded` is a fact. Before
   `00183` lands, every crossing legitimately carries this value.
6. **The stale comment is REWRITTEN, not deleted.** The `entryKind` history is the
   argument for why auto-crossing is defensible at all. Deleting it would leave the
   crossing looking unjustified to the next reader, which is a different failure of
   the same kind.
7. **A test asserts the stale phrase is gone (case 12).** This comment already went
   stale once and misled a reader for the entire interval. A comment on the most
   safety-critical path in the module earns a drift guard.
8. **Case 13 depends on `00180` and is conditional.** If the auditor is not present the
   case is skipped **and reported as skipped at Step 16** — a silently dropped test is
   the false-green shape this repository fences, and a skipped test also violates the
   zero-skipped gate, so the condition must be resolved at Step 9 rather than
   discovered at Step 14.
9. **This slice depends on `00181` but not on `00182`.** It needs the corrected
   blocking semantics for its counts to mean anything; it does not need the
   attestation contract, and it degrades gracefully by writing `not recorded` until
   `00183` supplies one.
