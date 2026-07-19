---
approved_by: human
approved_at: 2026-07-19T07:40:42.717Z
gate_crossed: implementation → todo
---

---
title: "Answers bind to the plan revision they were given for"
type: implementation
parent_plan: ctoc-background-engine-rebuild
depends_on: none
priority: CRITICAL
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/lib/streaming-precompute.js"
  - "src/lib/streaming-gate.js"
  - "tests/answers-bind-to-plan-revision.test.js"
---

# Answers bind to the plan revision they were given for

## The defect

`src/lib/streaming-precompute.js` protects the **questions** against a plan that
changed under them, and does not protect the **answers** at all.

The questions file carries `planMtimeMs` — the plan's modification time at
generation (`writePlanQuestions:284-285`) — and `planQuestionsStatus:392-408`
refuses the whole set as `stale` when the plan has moved on. That is a real
freshness contract, and it covers exactly one side of the pair.

`readAnsweredQuestionIds` (`:516-538`) matches an answer with:

```js
if (entry && entry.ref === ref && typeof entry.questionId === 'string') {
  ids.add(entry.questionId);
}
```

Reference and question id. Nothing else. There is no notion of **which revision of
the plan the human was looking at when they answered**. So when a plan is edited
and its questions are regenerated, any regenerated question whose id happens to
match an older answer is treated as already answered — by an answer given about
different text — and `hasEnoughInformation:597` filters it straight out of
`unanswered`. The human is never shown it, and the gate reports sufficiency it
never established.

That is the false-green shape this repository already fences in
`src/lib/false-green-scan.js`: a verdict reported on input that was never
received.

### This is not hypothetical — the collision is already in the log

`.ctoc/streaming/answers.jsonl` on this project, today, 16 entries, all for
`review/00003-r2a-scheduler-lifecycle-honesty.md`, written across two generations
of the question set:

| line | question id | what it was about |
|---|---|---|
| 1 | `q10-sync-barrier-settles-on-unconfirmed-orphan` | the sync barrier |
| 8 | `q10-step-14-excludes-the-quality-gate` | the verify step |
| 3 | `q12-step-14-narrower-than-quality-gate` | the verify step |
| 10 | `q12-sync-barrier-settles-on-unconfirmed-orphan` | the sync barrier |

The `q10` and `q12` slots each carry **two different questions** across the two
generations, and the two topics swapped slots between them. The generator's own
identity scheme (`agents/iron-loop/gate-critic.md:147` — "finding questions start
at `q10` and increase by one in emission order") guarantees this: the numeric band
is positional, so any change in emission order re-points every id in it. Matching
on the id alone across revisions is not a small risk here; it is the normal case.

The producer noticed and could not fix it. The gate-critic synthesis for that plan
reported in its own self-assessment: *"planMtimeMs was not supplied, so my question
ids carry no revision suffix and any question you answered on an earlier revision
of this plan was skipped without my knowledge."* An agent flagging that it may
have silently suppressed a question, with no mechanism available to close the gap,
is the clearest possible statement that the contract is missing.

## The second defect, same contract

`readAnsweredQuestionIds` is **not in the `module.exports` block** (`:612-623`).
Nothing outside `streaming-precompute.js` can read what the human has answered.
`src/lib/streaming-gate.js:757-773` therefore carries `answeredQuestionIds`, a
**second, independent implementation** of the same read — same file path, same
line loop, same id matching, different error handling (it returns a bare `Set` and
cannot distinguish "nothing answered" from "could not read", which is precisely
the distinction `readAnsweredQuestionIds` was written to preserve).

The human has ruled: **delete the duplicate.** One shared function, both callers
routed through it, so the revision-binding rule exists in exactly one place and
cannot be half-applied. Two encodings of "what counts as answered" is how a rule
gets added to one of them and not the other.

## Implementation Details

### Dependency graph

```
streaming-gate.streamAnswer          --writes-->  .ctoc/streaming/answers.jsonl  (adds the revision stamp)
streaming-precompute.planQuestionsStatus --returns--> the two revision values
streaming-precompute.readAnsweredQuestionIds --reads--> the log, revision-aware (exported; THE one encoding)
streaming-gate.nextUnansweredQuestion --calls--> readAnsweredQuestionIds   (was: the local duplicate)
streaming-gate (ledger evidence)      --calls--> readAnsweredQuestionIds   (was: the local duplicate)
streaming-precompute.hasEnoughInformation --calls--> readAnsweredQuestionIds
```

`streaming-gate` already requires `streaming-precompute` lazily at `:264` and
`:347` to avoid a load-time cycle; the new call sites use the same lazy pattern
and the same fail-soft wrapper.

---

### File: `src/lib/streaming-precompute.js`
**Action:** MODIFY

#### Change 1 — `planQuestionsStatus` returns both revision values

The `ready` return at `:410` gains two fields, both already computed in that
function:

```js
return {
  status: 'ready',
  questions: parsed.questions,
  questionsRevisionMs: storedMtimeMs,   // the stamp the question set was generated against
  planMtimeMs: currentMtimeMs,          // the plan file's CURRENT mtime
  reason: `${shownRef} has fresh precomputed questions`
};
```

They are equal in the normal case. They diverge only when a plan is reverted to an
older text (`storedMtimeMs > currentMtimeMs`, which the staleness check permits).
Both are needed and they answer different questions: `questionsRevisionMs`
identifies **the exact question set the human was shown**, and `planMtimeMs`
answers **has the plan changed since a given moment**.

#### Change 2 — `readAnsweredQuestionIds` becomes the one encoding, revision-aware, fail-closed

```js
/**
 * The set of question ids already answered for `ref` that BIND to the current
 * revision of the plan. THE single encoding of "what counts as an answered
 * question" — streaming-gate calls this, never its own copy.
 *
 * ── AN ANSWER BINDS TO THE TEXT THE HUMAN WAS READING ─────────────────────────
 * Question ids are POSITIONAL (agents/iron-loop/gate-critic.md) and are reused
 * across regenerations, so an id match across revisions is evidence of nothing.
 * An entry counts when EITHER:
 *
 *   (a) STAMPED — its recorded `planMtimeMs` equals `questionsRevisionMs`. It was
 *       written against this exact question set.
 *
 *   (b) DERIVED — it carries no stamp, but its recorded TIME is at or after the
 *       plan's current modification time. If the plan has not changed since the
 *       answer was given, the answer was given against the current text. The
 *       binding is DERIVED from two facts already on disk, never asserted.
 *
 * Anything else — an older unstamped answer, a mismatched stamp, an unparseable
 * time — does NOT count. Not knowing which text an answer was about is not a pass.
 * The failure mode is asking a question the human may already have answered, never
 * hiding a question they never saw.
 *
 * `ok:false` means the log could not be read, or the revision could not be
 * established — IGNORANCE, which a caller must not read as "nothing was answered".
 *
 * @param {string} root project root
 * @param {string} ref plan reference ("stage/file.md")
 * @param {{questionsRevisionMs:number, planMtimeMs:number}} [revision] omitted ⇒
 *   derived internally from planQuestionsStatus. hasEnoughInformation passes the
 *   one it already computed, purely to avoid a redundant stat.
 * @returns {{ok:boolean, ids:Set<string>, bound:{stamped:number, derived:number}, unbound:number}}
 */
function readAnsweredQuestionIds(root, ref, revision) { /* … */ }
```

Body rules, exactly:

1. `const ids = new Set(); let stamped = 0, derived = 0, unbound = 0;`
2. Resolve the revision. When `revision` is omitted, call `planQuestionsStatus`;
   anything other than `ready` → return
   `{ ok:false, ids, bound:{stamped:0,derived:0}, unbound:0 }`. When supplied, both
   fields must be finite numbers or the same closed result is returned. **Before
   reading the file** — an unestablished revision cannot bind anything, and saying
   so as `ok:false` rather than `ok:true` with an empty set is the fail-closed
   discipline.
3. Read the log as today: absent → `{ ok:true, … }` (knowledge: nothing answered
   yet); unreadable → `{ ok:false, … }` (ignorance); a malformed line is skipped,
   never fatal (skipping can only remove an answer, never add one).
4. For each parsed entry with `entry.ref === ref` and a string `entry.questionId`:
   - **stamped path** — `const stamp = Number(entry.planMtimeMs);`
     if `Number.isFinite(stamp)`: count it when
     `stamp === revision.questionsRevisionMs` (`ids.add`, `stamped++`), otherwise
     `unbound++`. A present-but-mismatched stamp is never re-evaluated by the
     derived rule — an explicit stamp is the stronger evidence and it says no.
   - **derived path** — no usable stamp: read the entry's recorded time from
     `entry.ts` ?? `entry.at` (the two shapes present in the log today), parse with
     `Date.parse`. When finite AND `>= revision.planMtimeMs`, count it
     (`ids.add`, `derived++`); otherwise `unbound++`.
5. Return `{ ok:true, ids, bound:{stamped, derived}, unbound }`.

#### Change 3 — `hasEnoughInformation` passes the revision and reports what did not bind

At `:593`, pass the revision the status already carries. The verdict object gains
`unboundAnswers: answers.unbound`, so a screen can say *"3 recorded answers could
not be tied to this revision of the plan and are being asked again"* rather than
silently re-asking. The existing `open-forks` / `answers-unreadable` reasons and
every fail-closed branch are untouched; the new field is additive.

#### Change 4 — export it

Add `readAnsweredQuestionIds` to `module.exports`.

---

### File: `src/lib/streaming-gate.js`
**Action:** MODIFY

#### Change 5 — `streamAnswer` stamps the revision it was answering

Inside `streamAnswer` (`:1246-1266`), before building the line:

```js
let planMtimeMs = null;
try {
  const { planQuestionsStatus } = require('./streaming-precompute');
  const st = planQuestionsStatus(root, ref);
  if (st.status === 'ready' && Number.isFinite(st.questionsRevisionMs)) {
    planMtimeMs = st.questionsRevisionMs;
  }
} catch { /* fail-soft: an unstampable answer is recorded UNSTAMPED, never unrecorded */ }
```

and include `planMtimeMs` in the appended object when it is non-null. Two required
properties:

- **A failure to establish the revision never loses the answer.** The line is still
  appended without the stamp; the derived rule may still bind it, and if it cannot,
  the question is asked again — the safe direction.
- **When the stamp is absent, the status message says so**, e.g.
  `Recorded your answer for <file> — it could not be tied to a plan revision, so this question may be asked again.`

#### Change 6 — the duplicate is DELETED and both callers use the shared function

`answeredQuestionIds` (`:757-773`) is **removed entirely**, not turned into a
wrapper. Its two callers call the shared function directly:

- **`nextUnansweredQuestion:264-273`** already calls `loadPlanQuestions`. Replace
  that with a single `planQuestionsStatus` call, which yields the questions **and**
  the revision in one read, then:
  ```js
  const answered = precompute.readAnsweredQuestionIds(root, ref, {
    questionsRevisionMs: st.questionsRevisionMs, planMtimeMs: st.planMtimeMs
  });
  const index = st.questions.findIndex((q) => !answered.ids.has(q.id));
  ```
  Behaviour change, and it is the point: a question whose only answer belongs to an
  older revision is **offered again**.
- **the sufficiency-ledger evidence at `:389-398`** calls
  `readAnsweredQuestionIds(root, ref)` with the revision omitted (it has no status
  in hand) and uses `[...result.ids]`. The evidence string then counts only answers
  that actually bind to the current text — which is what an auditor reading that
  ledger entry would already assume it meant. When `result.unbound > 0`, the
  evidence string appends `; N recorded answer(s) did not bind to this revision` so
  the ledger records the whole truth.

Both call sites keep their lazy `require` and their fail-soft `catch`.

---

### Wiring — the live call sites

| change | live call site | root |
|---|---|---|
| `planQuestionsStatus`'s two revision fields | `hasEnoughInformation`, `streamAnswer`, `nextUnansweredQuestion` (all this slice) | `/ctoc:menu` |
| exported `readAnsweredQuestionIds` | `hasEnoughInformation` (same module) + `nextUnansweredQuestion` + the sufficiency-ledger evidence path (both `streaming-gate`, this slice) | `/ctoc:menu` |
| the `planMtimeMs` stamp on new answers | `streamAnswer`, reached by `menu-screens.js:2137` → `stream answer <ref> <questionId> <optionKey>` | `/ctoc:menu` |
| `unboundAnswers` on the verdict | `hasEnoughInformation`'s return; see decision 7 | `/ctoc:menu` |

## Test Plan

### Tests: `tests/answers-bind-to-plan-revision.test.js`
**Action:** CREATE
**Framework:** `node:test` (`describe` / `it` / `node:assert`)

Every case builds a real temp project: a real plan file under `plans/<stage>/`, a
real questions file written through `writePlanQuestions`, and a real
`answers.jsonl`. `fs.promises` + `path.join` + `os.tmpdir()`; teardown with
`fs.promises.rm(root, { recursive:true, force:true })`. Plan modification times are
controlled with `fs.promises.utimes(planPath, when, when)` — deterministic and
cross-platform, no sleeping.

**Both callers are covered.** A shared function whose second caller's cases are
untested is how the drift comes back, so the gate-side cases (13-21) are not
optional and exercise the same binding matrix as the predicate-side cases.

#### The shared function and the predicate

| # | Case | Assertion |
|---|---|---|
| 1 | **the defect, reproduced** — answer stamped with revision A; plan edited to revision B; questions regenerated against B reusing id `q10` for a DIFFERENT question | `hasEnoughInformation(...).unanswered` CONTAINS `q10`; `blocking` contains it when critical; `enough === false`. Red before this slice. |
| 2 | a stamp matching the current question set counts | `q10` absent from `unanswered`; `bound.stamped === 1` |
| 3 | **an unstamped answer recorded AFTER the plan's mtime binds** (the derived rule) | the question is NOT re-asked; `bound.derived === 1`; `unbound === 0` |
| 4 | **an unstamped answer recorded BEFORE the plan's mtime does not bind** | the question IS re-asked; `unbound === 1` |
| 5 | the boundary case counts | entry time exactly equal to the plan mtime → binds |
| 6 | both observed log shapes are handled | `{ts,…}` and `{at,…}` both parse for the derived rule |
| 7 | a present-but-mismatched stamp is never rescued by the derived rule | entry stamped with revision A, recorded after the plan's current mtime → does NOT bind (`unbound === 1`) |
| 8 | a non-finite stamp falls to the derived rule | `planMtimeMs: "yesterday"` with a qualifying time → binds via derived |
| 9 | an unestablished revision is ignorance | `readAnsweredQuestionIds(root, ref, {questionsRevisionMs: NaN, planMtimeMs: 1})` → `ok:false`, empty ids, file not read |
| 10 | absent log is knowledge, unreadable log is ignorance | `ok:true` / `ok:false` respectively |
| 11 | a malformed line is skipped, not fatal | the good id is present, no throw |
| 12 | **the export exists** | `Object.keys(require('../src/lib/streaming-precompute'))` includes `readAnsweredQuestionIds` |

#### The gate-side caller — the second consumer of the shared function

| # | Case | Assertion |
|---|---|---|
| 13 | **the duplicate is gone** | `require('../src/lib/streaming-gate').answeredQuestionIds` is `undefined`, and the module source contains exactly zero constructions of the answers-log path |
| 14 | **the next-question path re-offers an unbound answer** | seed an answer stamped with an OLD revision → the streaming screen offers that question again |
| 15 | the next-question path still skips a bound answer | stamped with the current revision → the screen advances to the following question |
| 16 | the derived rule applies on the gate path too | an unstamped answer recorded after the plan's mtime → the question is NOT re-offered (same verdict as case 3, through the other caller) |
| 17 | the derived rule's negative case applies on the gate path too | an unstamped answer recorded BEFORE the plan's mtime → the question IS re-offered (same verdict as case 4, other caller) |
| 18 | **the ledger evidence counts only bound answers** | two bound and one unbound answer → the evidence string reports 2 and appends `1 recorded answer(s) did not bind` |
| 19 | `streamAnswer` stamps | drive `menuScreens.route(['stream','answer',ref,qid,key])` and read the appended line: it carries `planMtimeMs` equal to the questions file's stamp |
| 20 | `streamAnswer` never loses an unstampable answer | with no questions file, the line is still appended, carries no stamp, and the status text says the answer may be asked again |
| 21 | the fail-closed branches and non-fork behaviour are unchanged | `not-computed` / `stale` / `invalid` / `unknown-plan` still return `enough:false` with the status as the reason; an unbound answer to a `normal` question leaves `enough:true` while still listing it in `unanswered` |

## Execution Plan (Steps 8-16)

### Step 8: TEST
- [x] `tests/answers-bind-to-plan-revision.test.js` written in full FIRST, 23 cases
- [x] Run BEFORE any implementation existed — TDD RED confirmed verbatim:
      `ℹ tests 23 · ℹ suites 2 · ℹ pass 2 · ℹ fail 21 · ℹ skipped 0`
- [x] Every case the plan named as mandatory-red was red: 1, 3, 4, 6, 7, 12, 13, 14, 17, 18, 19
- [x] The only two passing cases were 15 and 16 — both assert that a question whose
      answer DOES bind is skipped, which the old id-only rule also did. They agree
      with the new rule by construction, so passing at red is correct, not a gap.

### Step 9: PREPARE
- [x] Read from disk in full: `src/lib/streaming-precompute.js`, `src/lib/streaming-gate.js`
      (the ranges named plus module.exports), `.ctoc/streaming/answers.jsonl`
- [x] Both log shapes confirmed on disk: 7 entries `{ts, ref, questionId, optionKey}`
      and 9 entries `{ref, questionId, answer, at}` — 16 total, all for
      `review/00003-r2a-scheduler-lifecycle-honesty.md`, as the plan states
- [x] Enumerated every reader/writer of the log (see Step 11)
- [x] No dependencies to install; `node:test` only

### Step 10: IMPLEMENT
- [x] `src/lib/streaming-precompute.js`
  - [x] Change 1 — `planQuestionsStatus` 'ready' carries `questionsRevisionMs` + `planMtimeMs`
  - [x] Change 2 — `readAnsweredQuestionIds` is revision-aware, fail-closed, returns
        `{ok, ids, bound:{stamped,derived}, unbound}`; new `entryRecordedAtMs` helper
        reads BOTH observed log shapes
  - [x] Change 3 — `hasEnoughInformation` passes the revision it already computed and
        reports `unboundAnswers`
  - [x] Change 4 — exported
- [x] `src/lib/streaming-gate.js`
  - [x] Change 5 — `streamAnswer` stamps `planMtimeMs`; an unstampable answer is still
        recorded, unstamped, and the status text names the reason
  - [x] Change 6 — `answeredQuestionIds` DELETED outright; `nextUnansweredQuestion` and
        the sufficiency-ledger evidence both call the shared function

### Step 11: REVIEW
- [x] `grep -n "'answers.jsonl'" src/lib/*.js` → exactly TWO sites, and they are the
      two halves of the contract, not a duplication:
      `streaming-precompute.js:633` (the ONE reader) and `streaming-gate.js:1281`
      (the ONE writer). No module both reads and interprets it any more.
- [x] `grep -rn "function answeredQuestionIds" src/` → no match. No surviving local definition.
- [x] Every revision passed by a caller came from `planQuestionsStatus`: the predicate
      passes its own status; `nextUnansweredQuestion` passes the status it just read;
      the ledger-evidence path omits it and lets the shared function derive it.
- [x] WRITERS OF THE LOG THIS SLICE DID NOT CHANGE — the handover, named:
  - The **prose/agent writer** behind the 9 `{ref, questionId, answer, at}` entries.
    No JavaScript in `src/` produces that shape; it was appended out of band. It is
    read correctly and left alone. **It will never produce a stamped answer, so its
    answers bind ONLY through the DERIVED rule** — they count while the plan has not
    moved since they were written, and stop counting the moment it does.
  - `agents/iron-loop/gate-critic.md:152` instructs the critic to suffix every
    question id with `-r<planMtimeMs>`. That is a prose-level mitigation of the same
    defect and is now redundant-but-harmless; it is not this slice's file and was not
    edited. Its stale reference to `streaming-gate.answeredQuestionIds` is now wrong
    and is a documentation handover.

### Step 12: OPTIMIZE
- [x] `nextUnansweredQuestion` makes ONE `planQuestionsStatus` call (it previously
      called `loadPlanQuestions`, which calls the status internally and discards the
      revision) — strictly fewer stats than before, not more
- [x] The log is read once per verdict, as before
- [x] No cache keyed on the log path — it is appended to within the same session

### Step 13: SECURE
- [x] The stamp comparison is strict numeric equality (`stamp === questionsRevisionMs`) —
      never loose, never a range
- [x] The derived rule compares parsed numbers; an unparseable time is UNBOUND
- [x] `entry.ref` keeps its strict `===`; entries are type-checked before use
- [x] No new regular expression in `src/`
- [x] The `streamAnswer` status text passes the failure reason through `stripCtl`
- [x] A stamp is only ever written from an established revision — never fabricated

### Step 14: VERIFY
- [x] `node --test tests/answers-bind-to-plan-revision.test.js` → `pass 23 · fail 0`
- [x] `node --test tests/streaming*.test.js` → `tests 326 · pass 326 · fail 0`
- [x] Reachability (FILE fence) + export-reachability fences green
- [x] FULL GATED RUN `npm test`:
      `ℹ tests 9965 · ℹ suites 1730 · ℹ pass 9965 · ℹ fail 0 · ℹ skipped 0 · ℹ todo 0`
      `[CTOC test-gate] coverage 99.06% (threshold 99%), skipped 0, failed 0`
      `[CTOC test-gate] PASS`
- [x] RATCHETS moved in the correct direction, both SHRINKING debt:
  - `.ctoc/false-green-baseline.json` `maxFindings` 219 → **218**, and the key
    `src/lib/streaming-gate.js:silent-catch:answeredQuestionIds` removed from
    `findings`. Debt paid, never raised; nothing added to the whitelist.
  - `CLAUDE.md` documented test-file count 425 → **426** (this slice adds one file).

### Step 15: DOCUMENT
- [x] The module header gains "An ANSWER binds to the revision it was GIVEN FOR" as the
      companion to the STALENESS rule, stating the derived rule, the fail-closed
      direction, and the cosmetic-edit cost plainly
- [x] Both revision fields documented on `planQuestionsStatus`
- [x] A note stands where the duplicate used to live, recording that the encoding now
      lives in `streaming-precompute` — one place, deliberately, and why a wrapper was
      refused

### Step 16: FINAL-REVIEW
- [x] All steps 8-15 complete
- [x] Full gated run green, coverage above the floor, 0 skipped
- [x] No stubs, no TODOs; every ambiguity recorded below
- [x] Gate 3 NOT crossed — the plan moves to review with evidence and stops

## Decisions Taken Under Ambiguity

1. **Existing answers bind by a DERIVED rule, not by a blanket backfill and not by
   discarding them.** The rule: an unstamped answer counts when it was recorded at
   or after the plan's current modification time, because if the plan has not
   changed since the answer, the answer was given against the current text. This is
   derived from two facts already on disk — the entry's recorded time and the
   file's modification time — so nothing is asserted that was not observed. A
   blanket backfill was rejected on the evidence in the log: lines 1 and 8 carry
   two different `q10` questions and lines 3 and 10 two different `q12` questions,
   so stamping all 16 with the current time would assert a binding that is
   demonstrably false for at least seven of them. Against this project's data the
   derived rule keeps the nine most recently recorded entries and re-asks the older
   ones, including both id-collision pairs.
2. **The known cost, stated plainly: a plan touched for a cosmetic reason loses its
   answers even though the meaning never changed.** A typo fix, a reflow, or a
   documentation correction moves the modification time and unbinds every answer
   recorded before it. There is no way to distinguish a cosmetic edit from a
   substantive one without reading meaning, so the rule errs toward re-asking — the
   correct direction for a fail-closed rule, and the same direction the questions'
   own staleness rule already takes. **This set contains a live instance:** two
   slices in this wave edit `plans/review/00003-r2a-scheduler-lifecycle-honesty.md`,
   which is the plan every entry in the log belongs to, so its answers WILL be
   re-asked once they land. That is the rule working, not failing.
3. **A present-but-mismatched stamp is never rescued by the derived rule.** An
   explicit stamp is direct evidence of which question set an answer was about, and
   it says no. Letting the weaker derived rule override it would make the stamp
   worth less than its absence.
4. **An answer binds to the QUESTIONS file's stamp, and the derived rule compares
   against the PLAN's current mtime.** Two different values for two different
   questions — "was this the same question set?" versus "has the plan changed since
   this moment?" — which is why `planQuestionsStatus` returns both.
5. **`src/lib/streaming-gate.js` is in scope, against the framing that this is a
   single-file change.** Without a writer that stamps, the stamped path can never
   be satisfied and the slice ships a half-contract. The writer and the duplicate
   reader both live there.
6. **The duplicate is deleted outright rather than made a wrapper.** A wrapper is
   still a second name for the rule and a second place to add a special case. Both
   call sites now name the shared function, and Step 11 proves the log path is
   constructed once. The tests cover both callers against the same binding matrix,
   because a shared function whose second caller is untested is how the drift comes
   back.
7. **`unboundAnswers` is added to the predicate's return but is not plumbed through
   `streaming-gate.sufficiencyFor`.** That mapping (`:343-359`) has its own shape
   contract and its own consumers in `pendingGateDecisions`; widening it is a
   separate, visible change. The field is reported as written-but-not-yet-surfaced
   in the Step 16 report — named for the reviewer, not scheduled by the executor.
   The ledger evidence string (case 18) does surface the count, so the fact is not
   invisible.
8. **An answer that cannot be stamped is still recorded, and the human is told.**
   Refusing it would lose their input; recording it silently would let them
   discover later that it did not count.
9. **The prose/agent writer of the second entry shape is a handover, not an edit.**
   Nine of the 16 entries use `{ref, questionId, answer, at}`, a shape no
   JavaScript in `src/` writes. The derived rule binds those correctly today, so
   nothing is broken by leaving it — but it will never produce a stamped answer,
   and Step 11 names it so the gap is visible rather than discovered later.

### Decisions taken during execution (where the code disagreed with the brief)

10. **The empty `catch` the plan specified for `streamAnswer` was REJECTED by this
    repository's own false-green fence, and the fence is right.** The plan's Change 5
    wrote `catch { /* fail-soft */ }`. `src/lib/false-green-scan.js` flagged it as a
    NEW `silent-catch` site: the fall-through proceeds as though it had read
    something, having read nothing, so "no stamp exists" becomes indistinguishable
    from "the stamp lookup broke". The catch now binds the error into `stampFailure`
    and the reason is carried into the status text the human reads. It was NOT
    whitelisted — a whitelist entry here would have been the exact defect this slice
    exists to kill. The code won over the brief.

11. **The false-green baseline was RATCHETED DOWN, not left alone.** Deleting the
    duplicate `answeredQuestionIds` removed a baselined `silent-catch` site, and the
    fence fails loudly on unclaimed progress. `maxFindings` went 219 → 218 and the
    fixed key was removed from `findings`. Debt may only shrink; this is that rule
    being honoured in the same unit of work, per the human's ruling that ratchets are
    in scope.

12. **The derived comparison floors the plan's modification time to whole
    milliseconds.** A recorded time comes from an ISO-8601 string (whole
    milliseconds) while `mtimeMs` carries a sub-millisecond fraction. Comparing the
    truncated value against the untruncated one would systematically reject an answer
    recorded in the SAME millisecond as the plan write — a false negative created
    purely by two clocks of different precision. `Math.floor(planMtimeMs)` aligns the
    precisions. This is precision alignment, not tolerance: the comparison remains a
    plain numeric at-or-after, and it can only ever move by less than one
    millisecond.

13. **Test case 13's "zero constructions of the answers-log path" was tightened to
    "exactly one".** As written the assertion was unsatisfiable: `streamAnswer` is the
    log's WRITER and must construct the path. The test asserts exactly one
    construction of the quoted literal `'answers.jsonl'` in `streaming-gate.js` — the
    writer — which is the assertion the plan actually intended (the READ lives
    elsewhere). A second construction would be the duplication returning.

14. **`streaming-gate.answeredQuestionIds` was never exported, so the plan's
    "`require(...).answeredQuestionIds` is `undefined`" assertion was already true
    before the change.** It is kept as a public-surface guard, but the load-bearing
    proof of deletion is the source-level assertion that no
    `function answeredQuestionIds(` survives.

15. **The test file uses synchronous `node:fs`, not `fs.promises` as the plan's test
    section suggested.** It matches `tests/streaming-precompute.test.js` and
    `tests/streaming-gate.test.js` exactly, and the functions under test are
    synchronous. `path.join` and `os.tmpdir()` are used throughout; nothing is
    platform-specific. A different fixture idiom in one file of a suite is noise, not
    rigour.

16. **`unboundAnswers: 0` is returned on the fail-closed branches too, rather than
    omitted.** On a not-ready status no answer was read and none was evaluated
    against a revision, so zero evaluated-and-unbound is literally true. Keeping the
    shape uniform stops a caller from having to test for the field's existence — and
    the field is documented as a count of answers EVALUATED, never as a claim that
    everything bound.

17. **The stale reference in `agents/iron-loop/gate-critic.md:152` was left
    untouched.** It cites `streaming-gate.answeredQuestionIds` at line numbers that no
    longer exist, and its `-r<planMtimeMs>` id-suffix instruction is now a redundant
    second mitigation of the defect this slice fixes at the data layer. That file is
    not in this plan's declared `files:`, so it is a named handover, not an edit.

18. **`CLAUDE.md` was edited outside the declared `files:` list, deliberately.** Its
    documented test-file count is a ratchet enforced by `tests/doc-counts.test.js`,
    and adding a test file trips it. Per the human's ruling that ratchets are in scope
    by rule, it was moved in the correct direction (425 → 426) in this unit of work
    and is reported explicitly rather than left for someone else to discover as a red
    suite.
