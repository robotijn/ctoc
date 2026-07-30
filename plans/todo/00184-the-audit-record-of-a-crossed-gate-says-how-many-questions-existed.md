---
iron_loop_verdict: true
title: "The audit record of a crossed gate says how many questions existed, not only how many were answered — and the comment above it stops describing the opposite of what the code does"
type: implementation
parent_plan: none
depends_on: 00181-an-unflagged-question-blocks-a-gate-instead-of-waving-it-through
priority: HIGH
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/lib/streaming-gate.js"
  - "src/lib/streaming-precompute.js"
  - "tests/sufficiency-evidence.test.js"
  - "CLAUDE.md"
approved_by: human
approved_at: 2026-07-30T19:04:14.561Z
gate_crossed: implementation → todo
---

# The audit record of a crossed gate says how many questions existed

> REBASE NOTE (2026-07-30). Verified against the current tree. Line numbers were
> corrected (the module grew): the evidence string now lives at
> `streaming-gate.js:514-519`, the stale comment at `438-444`, `sufficiencyFor` at
> `458`, `crossBySufficiency` at `498`, `pendingGateDecisions` at `576` (its
> `sufficiencyFor` call at `599`, its cross at `605`); `approval-ledger.entryKind`
> is at `942-966`. The intent and acceptance criteria are UNCHANGED. Two technical
> corrections were folded in: (1) the counts the evidence needs are NOT on
> `hasEnoughInformation`'s current return, so this slice extends that return by two
> fields and threads the single verdict into the writer (see Implementation Details);
> (2) two sub-features (attestation-present, the auditor round-trip) are blocked on
> unbuilt siblings `00183`/`00180` and are declared follow-ups rather than
> skipped tests, because a skipped test violates the zero-skipped gate.

## The defect, read on disk

`src/lib/streaming-gate.js:514-519`, inside `crossBySufficiency`:

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
  attested by: not recorded;
  enough (no unanswered fork)
```

Four facts that the current string cannot express:

| Fact | Why it belongs on a permanent gate record |
|---|---|
| **computed** — how many questions the file held | Separates "asked seven, cleared them" from "asked nothing" |
| **unanswered, and how many of those were blocking** | The verdict's actual arithmetic, rather than its conclusion |
| **attestation slot** | Whether a critique is on record at all. Today the only truthful value is `not recorded` — the reader is `00182`/`00183`, both unbuilt — so the slot ships as a fixed, greppable `attested by: not recorded`. The *attested* variant lands with `00183` (see the deferral below). |
| **empty-list marker** | An explicit phrase when the file held zero questions, so it is greppable in history |

### Where the counts come from — corrected route

The plan originally asserted "every value comes from `planQuestionsStatus` and
`hasEnoughInformation`, both of which the caller has already computed; nothing new is
read from disk." **Verified against the current tree, that is false as written.**
`hasEnoughInformation` (`streaming-precompute.js:759`) returns
`{ enough, reason, unanswered, blocking, unboundAnswers }` — it exposes neither the
TOTAL question count ("computed") nor the answered ids, and the verdict is not
threaded into `crossBySufficiency` at all (which does its own second
`readAnsweredQuestionIds` read). So the buildable route that still honours the
"single verdict, no revision skew" discipline (Decision 2) is:

1. **Extend `hasEnoughInformation`'s return** by exactly two fields, computed from the
   SAME single read it already performs: `computed` (= `questions.length`) and
   `answered` (= the ids of the current questions that bound, i.e.
   `questions.filter(q => answers.ids.has(q.id)).map(q => q.id)`). It already returns
   `unanswered`, `blocking` and `unboundAnswers`. No new disk read; no second
   predicate. Adding fields is backward-compatible — no existing test deep-equals this
   return (every caller reads individual fields).
2. **`sufficiencyFor`** (`streaming-gate.js:458`) threads those onto its returned
   object as `computed`, `answeredQuestionIds`, `unboundAnswers` (alongside the
   existing `enough`, `reason`, `unansweredQuestionIds`, `blockingQuestionIds`). When
   the predicate fails closed (`unavailable`), these carry `computed: null` and empty
   lists — the `unknown` marker (Decision 3), never `0`.
3. **`pendingGateDecisions`** already computes `sufficiency` ONCE per plan
   (`streaming-gate.js:599`, Decision 5). It threads that same verdict object into
   `crossBySufficiency` as a new final parameter, so the writer composes evidence from
   the verdict that AUTHORISED the crossing and performs **no second read of its own**.
   The current `readAnsweredQuestionIds` call inside `crossBySufficiency` is deleted.

The `unbound` clause (`did not bind to this revision`) survives — its value now comes
from the verdict's `unboundAnswers` instead of a fresh read.

### Why an evidence string and not a structured field

`writeSufficiencyEntry` takes an `evidence` string today (`approval-ledger.js:778`),
and it fails closed on entry shape — it refuses any `approved_by` key and requires a
non-empty `evidence` string, but does **not** validate or cap the evidence content.
Adding structured fields would change the ledger's schema, and the ledger's write path
is protected from agent edits by the `PreToolUse` deny rule — a schema change there is
a larger, differently-shaped decision than fixing a record's content.

**The string is made complete and greppable; the schema is left alone.** The
counts appear in a fixed order with fixed labels so `00180`'s auditor can parse them
without ambiguity, and so a human reading a ledger entry sees the arithmetic rather
than the conclusion.

## The second half: a comment that states the opposite of what the file does

`src/lib/streaming-gate.js:438-444`, above `sufficiencyFor`:

> ── IT SHOWS. IT DOES NOT CROSS. ──
> `enough: true` is rendered to the human and nothing more. It must NOT auto-approve,
> because `approval-ledger.entryKind` classifies any entry whose `advanced_by` it does
> not recognise as `'human'` — so an automatic crossing would be recorded as the
> human's own approval. That is a forged approval created by a classifier default.
> Auto-crossing is safe only once `entryKind` fails closed; until then this is
> display, deliberately.

**The precondition it names was met and the crossing was added below.** `entryKind`
now fails closed — `approval-ledger.js:942-966` tests `advanced_by` before
`approved_by`, uses a presence guard rather than a value check, and returns
`'unknown'` for an unrecognised value rather than the value itself. And
`pendingGateDecisions` crosses at `streaming-gate.js:605`.

So a reader auditing the most safety-critical path in the module lands first on a
comment asserting that the path does not exist. That reader either believes the
comment and stops looking, or distrusts the file entirely. **The comment was correct
when written; it is now the most misleading text in the module**, and it sits directly
above the function whose verdict authorises the crossing.

Rewrite it to describe what the code does: the verdict both DISPLAYS and, at a
pre-build gate with passing validation, CROSSES — and record that the crossing became
safe when `entryKind` began failing closed, because that history is the reason the
design is defensible and deleting it would lose the argument.

## Implementation Details

### File: `src/lib/streaming-precompute.js`
**Action:** MODIFY — `hasEnoughInformation` only.

Add two fields to its return object, both derived from the single read it already
performs (no new disk access, no second predicate):

- `computed` — `status.questions.length` on the `ready` path; `null` (not `0`) on
  every fail-closed path, so an unavailable count is honestly distinct from an empty
  list.
- `answered` — `status.questions.filter(q => answers.ids.has(q.id)).map(q => q.id)`
  on the `ready` path; `[]` on the fail-closed path. Only ids of CURRENT questions
  count, so `answered.length + unanswered.length === computed` always holds.

`unanswered`, `blocking`, `unboundAnswers`, `enough`, `reason` are unchanged. The
JSDoc return-shape comment gains the two fields.

### File: `src/lib/streaming-gate.js`
**Action:** MODIFY — the evidence composition in `crossBySufficiency`, the counts on
`sufficiencyFor`, the thread-through at `pendingGateDecisions:605`, and the comment
block above `sufficiencyFor`.

- **Extract a pure helper `composeSufficiencyEvidence(ref, verdict)`** that returns the
  evidence string from a threaded verdict object — nothing read from disk. This is the
  testable seam for cases 1–8. It renders `unknown` (never `0`) wherever a count is
  not a finite number, an explicit greppable empty-list phrase when `computed === 0`,
  the answered ids comma-separated, the `did not bind to this revision` clause from
  `verdict.unboundAnswers`, and the fixed `attested by: not recorded` slot. Every id
  passes through `stripCtl` and the joined list is length-capped (Step 13).
- **`sufficiencyFor`** gains `computed`, `answeredQuestionIds`, `unboundAnswers` on its
  returned object, threaded from the extended `hasEnoughInformation` verdict; the
  fail-closed `closed()` helper sets `computed: null`, `answeredQuestionIds: []`,
  `unboundAnswers: 0`.
- **`crossBySufficiency`** takes the verdict as a new final parameter and calls
  `composeSufficiencyEvidence(ref, verdict)`; its own `readAnsweredQuestionIds` read is
  deleted. `pendingGateDecisions:605` passes the same `sufficiency` object it already
  computed at `:599` — one verdict, used by the display AND the cross AND the evidence.
  A second independent read inside `crossBySufficiency` could observe a different
  revision than the verdict that authorised the crossing, making the evidence describe
  a state that was never the basis of the decision. **Do not reintroduce that seam.**
- **The comment block above `sufficiencyFor`** is rewritten to describe the crossing
  that now exists, retaining the `entryKind` history that makes it defensible.

### File: `tests/sufficiency-evidence.test.js`
**Action:** CREATE

Cases 1–8 drive the pure `composeSufficiencyEvidence(ref, verdict)` helper with crafted
verdict objects — no filesystem needed for the string content. Cases 9–11 drive
`crossBySufficiency`/`pendingGateDecisions` end-to-end against a temp ledger. Case 12
reads the source file. Cases marked *(deferred)* are NOT written now — the code they
would exercise does not exist yet, and a skipped test violates the zero-skipped gate.

| # | Case | Assertion |
|---|---|---|
| 1 | seven questions, three answered, none blocking | evidence contains `7 question(s) computed`, `3 answered`, `4 unanswered`, `0 blocking` |
| 2 | **empty questions list** | evidence contains an explicit empty-list phrase and `0 question(s) computed` — **distinguishable from case 3** |
| 3 | seven questions, all seven answered | `7 question(s) computed`, `7 answered` — and the string differs from case 2's. **The two cases the old format collapsed** |
| 4 | the answered ids are listed | present and comma-separated, as today |
| 5 | unbound answers are still reported | the `did not bind to this revision` clause survives, sourced from `verdict.unboundAnswers` |
| 6 | attestation slot reads `not recorded` | the fixed slot is present and reads `attested by: not recorded`; never blank, never omitted. (The *attested* variant — naming the producer and prosecution-lens states — is **deferred to `00183`**, which has no data source until then.) |
| 7 | **an unavailable count renders `unknown`, never `0`** | pass a fail-closed verdict (`computed: null`) and assert the string says `unknown` |
| 8 | the fixed field order is stable | labels appear in the documented order, so `00180`'s auditor can parse them |
| 9 | the entry is written with `advanced_by: 'sufficiency'` and no `approved_by` | `entryKind` returns `'sufficiency'` — the existing invariant, guarded here because this slice edits the writer's caller |
| 10 | the entry-and-moved-or-neither invariant survives | force the move to fail; assert the ledger entry is rolled back |
| 11 | idempotency survives | a plan already carrying an entry for this destination is not re-crossed |
| 12 | **the stale comment no longer asserts the code does not cross** | read `src/lib/streaming-gate.js` and assert the phrase `IT DOES NOT CROSS` is absent while `crossBySufficiency` is present. A drift guard on a comment that already went stale once |
| 13 | *(deferred to `00180`)* evidence parseable by the auditor | `00180`'s `auditSufficiencyCrossings` does not exist on disk today. The round trip is a declared follow-up tied to that plan — **reported as deferred at Step 16, not silently dropped** |

Fixtures under `os.tmpdir()`, `path.join`, teardown with
`fs.promises.rm(root, { recursive: true, force: true })`. The real `.ctoc/approvals`
is never written.

---

### Wiring — the live call sites

| change | live call site | root |
|---|---|---|
| the evidence string (`composeSufficiencyEvidence`) | `crossBySufficiency`, called from `pendingGateDecisions:605` | `/ctoc:start` gate screen |
| the extended `hasEnoughInformation` fields | `sufficiencyFor` → `pendingGateDecisions:599` (already the live verdict path) | `/ctoc:start` gate screen |
| the corrected comment | read by every human and agent auditing this module | the file itself |

`pendingGateDecisions` runs on every gate screen render. Nothing here is reachable
only from a test.

## Test Plan

Covered by `tests/sufficiency-evidence.test.js`. Cases 2, 3 and 7 are load-bearing —
they are the three ways the record could still fail to distinguish a cleared plan from
an unexamined one. Cases 9, 10 and 11 guard invariants this slice must not break while
editing their caller. Cases 6 (attested variant) and 13 (auditor round trip) are
deferred to `00183` and `00180` respectively and are not written as skipped tests.

## Execution Plan (Steps 8-16)

### Step 8: TEST
Write the buildable cases (1–12) in full FIRST and run only them. Cases 1, 2, 3, 6, 7,
8 and 12 must be RED. **Record case 2's and case 3's red output side by side** — two
identical evidence strings from two maximally different inputs is the defect, and
seeing them as identical bytes is the evidence. Cases 9, 10 and 11 must be GREEN at
Step 8 and must remain green afterward; they are the invariants. Do NOT write case 13:
its dependency (`00180`'s `auditSufficiencyCrossings`) is absent, so it would be a
failing or skipped test either way.

### Step 9: PREPARE
Read from disk: `src/lib/streaming-gate.js:428-642` in full (`sufficiencyFor`, its
stale comment, `crossBySufficiency`, `pendingGateDecisions`);
`src/lib/streaming-precompute.js` `planQuestionsStatus:392`, `readAnsweredQuestionIds:636`
and `hasEnoughInformation:759` **as changed by `00181`** (confirm the return shape
before extending it); `src/lib/approval-ledger.js` `writeSufficiencyEntry:778` and
`entryKind:942` (confirm the evidence field is non-empty-checked but not capped, and
that `entryKind` fails closed). Confirm no test deep-equals `hasEnoughInformation`'s
return before adding the two fields. Confirm `00180`'s `auditSufficiencyCrossings` is
absent (it is, today) so case 13 stays deferred. **Where the code disagrees with this
plan, THE CODE WINS.**

### Step 10: IMPLEMENT
- `src/lib/streaming-precompute.js` — add `computed` and `answered` to
  `hasEnoughInformation`'s return.
- `src/lib/streaming-gate.js` — the `composeSufficiencyEvidence` helper; the extra
  counts on `sufficiencyFor`; the verdict threaded into `crossBySufficiency` (its own
  read deleted); the corrected comment block above `sufficiencyFor`.
- `tests/sufficiency-evidence.test.js` — cases 1–12.

### Step 11: REVIEW
Confirm no count in the evidence string was inferred rather than read from the verdict,
and that `unknown` appears wherever a count was unavailable (`computed: null`). Confirm
the single-verdict discipline is preserved — one verdict computed at
`pendingGateDecisions:599`, used by the display, the cross, AND the evidence, with no
second read inside `crossBySufficiency`. Confirm the rewritten comment describes the
code as it is AND retains the `entryKind` history that makes the design defensible.

### Step 12: OPTIMIZE
No additional filesystem reads: the two new `hasEnoughInformation` fields come from the
read it already performs, and `crossBySufficiency` now reads nothing of its own. Net
disk reads DROP by one per crossing (the deleted `readAnsweredQuestionIds` call).

### Step 13: SECURE
The evidence string is written into a ledger entry that an agent may not edit but any
human may read. Question ids are producer-authored: `stripCtl` them and cap the joined
list's length so a hostile id cannot inject control characters or unbounded text into a
permanent record. Confirm the entry write remains inside `.ctoc/approvals/` and that
the slug derivation is untouched.

### Step 14: VERIFY
`node --test` on the new file plus every existing streaming-gate, streaming-precompute,
approval-ledger and approval-residency test, then the full gated run `npm test`. Lint
at `--max-warnings 0`. No git operations. **Report the full evidence string this code
now writes for a real crossing, verbatim** — the record is the deliverable, so it must
be read rather than assumed.

### Step 15: DOCUMENT
Record the evidence format in `CLAUDE.md` alongside the sufficiency-crossing
description, so an auditor knows what the fields mean without reading the source.
Update the documented test-file count in `CLAUDE.md` from the live disk count (this
slice adds one test file — that is why `CLAUDE.md` is a declared file).

### Step 16: FINAL-REVIEW
Report the Step 8 side-by-side reds, the verbatim evidence string from Step 14, that
cases 6 (attested variant) and 13 (auditor round trip) are deferred to `00183` and
`00180`, and every decision taken under ambiguity.

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
- It does **not** produce the *attested* attestation summary — that needs `00183`'s
  critique record. The slot ships as a fixed `not recorded` marker; the attested
  variant lands with `00183`.
- It does **not** audit whether the crossing has ever fired — `00180`.

## Decisions Taken Under Ambiguity

1. **The evidence stays a STRING; the ledger schema is untouched.** The write path is
   protected from agent edits and its shape is load-bearing for `entryKind` and the
   residency check. Fixing a record's content is a smaller and safer change than
   altering the schema of the structure that fences forged approvals.
2. **The counts are THREADED from the single existing verdict, not read again.** A
   second read could observe a different revision than the one that authorised the
   crossing, producing evidence describing a state that was never the basis of the
   decision — a subtler version of the defect being fixed. The single verdict computed
   at `pendingGateDecisions:599` is passed into `crossBySufficiency`, whose own
   `readAnsweredQuestionIds` read is deleted.
3. **The two new counts come from extending `hasEnoughInformation`, not from a second
   predicate.** `hasEnoughInformation` already computes `questions.length` and the
   bound answer set in ONE read; it just discarded them. Adding `computed` and
   `answered` to its return reuses that read and keeps the "enough" verdict in ONE
   place. Re-deriving the verdict inside `streaming-gate.js` would be a second encoding
   of the fork rule — the exact divergence this repository fences. This is why
   `src/lib/streaming-precompute.js` is a declared file.
4. **An unavailable count renders `unknown`, never `0`.** The fail-closed verdict
   carries `computed: null`; the composer renders `unknown` for any non-finite count.
   Writing `0` for "I could not read it" would inscribe this repair set's defect into
   the permanent record while claiming to remove it.
5. **The empty list gets an explicit, greppable phrase** rather than only `0
   question(s) computed`. History is searched with plain text, and a distinct phrase
   makes every historical instance findable in one pass.
6. **The attestation slot ships as a fixed `attested by: not recorded`.** There is no
   attestation data source until `00183` lands (it is unbuilt, in `implementation/`).
   Recording the slot now — always `not recorded` — makes the format forward-compatible
   and greppable; the *attested* variant (case 6) is a declared follow-up on `00183`.
   A missing clause would read as an older format; an explicit `not recorded` is a fact.
7. **The stale comment is REWRITTEN, not deleted.** The `entryKind` history is the
   argument for why auto-crossing is defensible at all. Deleting it would leave the
   crossing looking unjustified to the next reader, which is a different failure of
   the same kind.
8. **A test asserts the stale phrase is gone (case 12).** This comment already went
   stale once and misled a reader for the entire interval. A comment on the most
   safety-critical path in the module earns a drift guard.
9. **Case 13 depends on `00180` and is NOT written now.** `auditSufficiencyCrossings`
   does not exist on disk. A test written against it would be a failing or skipped
   test, and a skipped test violates the zero-skipped gate — the false-green shape this
   repository fences. It is a declared follow-up tied to `00180`, reported at Step 16.
10. **This slice depends on `00181` (built, in `review/`) but not on `00182`/`00183`.**
    It needs the corrected blocking semantics for its counts to mean anything; it does
    not need the attestation contract, and it degrades gracefully by writing
    `not recorded` until `00183` supplies a record.


## Deferred Questions

_Written by the Iron Loop integrator (src/lib/iron-loop.js), which performs NO
quality evaluation. These entries are the integrator's own report on itself, not
findings from a critic that read this plan._

- **evaluation**: NOT EVALUATED — no automated critique was performed on this plan. The refinement loop appended the Steps 8-16 template and assessed nothing. (The scores this step used to report were computed from that same template, not from the plan.) A human or a real critic must review this plan before it is built.
