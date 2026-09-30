---
title: "A plan whose bytes did not change is never critiqued again, while the human's answers keep today's rule"
type: implementation
status: implementation
parent_plan: small-changes-take-a-small-path
depends_on: 00409-small-changes-take-a-small-path-s9-critique-only-before-build
priority: high
effort: medium
files:
  - src/lib/streaming-precompute.js
  - tests/critique-freshness-fingerprint.test.js
  # A real captured questions file carrying the new field; its name is the real plan's
  # sanitized reference, known only at capture.
  - tests/fixtures/golden-corpus/streaming-questions/*.json
  - tests/fixtures/golden-corpus/manifest.yaml
  # Ratchet file: a new test file moves a documented count.
  - CLAUDE.md
---

# A plan whose bytes did not change is never critiqued again, while the human's answers keep today's rule

Read the parent plan first: section 1.4 ("Staleness works as coded"), Part B item 3, decision 22, and criteria 22 and 23.

## The problem in plain words

A critique goes stale the moment the plan file's modification time moves — including when nothing in it changed (an editor save, a rewrite of identical bytes). Each such save costs a whole new critique: four lens critics and a synthesizer. Decision 22 keeps a critique while the plan's bytes are unchanged, by storing a content fingerprint with the questions, and deliberately leaves the answer rule untouched: the human's answers stay bound to the modification stamp, and the sufficiency predicate is not changed.

## What the code does today (read on 2026-09-30)

```js
// src/lib/streaming-precompute.js
function writePlanQuestions(root, ref, questions, planMtimeMs, attestation) {
  // validates, then writes { ref, planMtimeMs, questions [, attestation] } atomically
}
function planQuestionsStatus(root, ref) {
  // … 'stale' when the stored planMtimeMs < the plan file's current mtimeMs …
}
function readAnsweredQuestionIds(root, ref, revision) { /* STAMPED or DERIVED binding */ }
function hasEnoughInformation(root, ref) { /* the sufficiency predicate */ }
```

```js
// src/lib/streaming-questions-sweeper.js — promotion stamps the plan's CURRENT mtime
const written = precompute.writePlanQuestions(root, ref, payload.questions, currentMtimeMs, payload.attestation);
```

`tests/questions-attestation.test.js` pins only that a four-argument write records no `attestation` key; no test found pins the full key set of a written file (a presence search, not proof — the executor checks the streaming tests before building).

## Files and signatures

### Modify `src/lib/streaming-precompute.js`

```js
/**
 * sha256 of the plan's bytes, but ONLY when the plan has not changed since the stamp:
 * stat → read → stat; returned when both stats agree and mtimeMs <= planMtimeMs,
 * otherwise null. Never throws. Module-private.
 */
function planFingerprintAt(root, ref, planMtimeMs) { /* … */ }
```

- `writePlanQuestions` adds `planSha256` to the written object when `planFingerprintAt` returns one: `{ ref, planMtimeMs, planSha256, questions [, attestation] }`. When it returns null, the key is absent and the file is judged by today's rule forever. Callers and the signature are unchanged; the sweeper and every agent that writes through this function get the field without an edit.
- `plansNeedingQuestions`: for a pre-build decision whose status is `stale`, read the stored file; when it carries a 64-hex `planSha256` equal to the sha256 of the plan's current bytes, rewrite it through `writePlanQuestions(root, ref, stored.questions, currentMtimeMs, stored.attestation)` — the same questions, a fresh stamp — and do not return the plan as a candidate. Any failure along the way leaves the plan a candidate (a critique is never skipped because a read failed).
- `planQuestionsStatus`, `loadPlanQuestions`, `readAnsweredQuestionIds` and `hasEnoughInformation` are NOT edited.

Why the re-stamp and not a second status: after the re-stamp every reader — the gate screen, the sufficiency predicate, the answer stamping in `streamAnswer` — sees one consistent `ready` file with the unchanged questions, and an answer the human gave before the re-save carries the OLD stamp, which `readAnsweredQuestionIds` does not bind, so that question is asked again — exactly the parent's wording ("so he may be asked it again, at no agent cost").

## Tests to write first (each run and seen failing before any code)

In `tests/critique-freshness-fingerprint.test.js`, against scratch pipelines:

1. A write through `writePlanQuestions` for an unchanged plan stores `planSha256` equal to the sha256 of the plan's bytes; a write whose `planMtimeMs` is older than the plan's current mtime stores no `planSha256`. Red: no field today.
2. Criterion 22: a plan with fresh questions is not a candidate on a later call (green before — a pin); one changed byte → a candidate again.
3. Criterion 23(b): rewrite the plan with identical bytes and a newer mtime → not a candidate; the questions file now carries the new stamp and the same questions; `loadPlanQuestions` returns those questions (still presented); an answer recorded before the re-save with the old stamp is not in `readAnsweredQuestionIds`, so that question is asked again. Red: today the plan is a candidate and the questions are not presented.
4. Criterion 23(b), the pin: for a fixed answers log and a fixed questions file, `readAnsweredQuestionIds` and `hasEnoughInformation` return exactly the values recorded in the test before this slice's code was written (the functions are not edited; this proves it).
5. A questions file with no `planSha256` (every file on disk today) whose plan was re-saved → stale → a candidate, exactly as today.
6. Criterion 23(a): run the real `src/scripts/release.js` with `CTOC_RELEASE_ROOT` pointing at a scratch pipeline that contains plans and a fresh questions file → no plan file's modification time changes and no plan becomes a candidate. Green before (the release script names no plan file) — a pin, recorded as such.
7. A tampered `planSha256` (wrong length, not hex) → the plan stays a candidate; nothing throws.

## Golden corpus

The streaming-questions contract gains a field, so the corpus needs a real captured file carrying it, and the existing samples must still read unchanged through `loadPlanQuestions`. Capture one byte for byte from a questions file written by the real writer after this change (a real critique promoted by the sweeper, or a real re-stamp) in this repository. If no such real file exists when the slice is built, record the variant under `uncaptured_variants` in the manifest with the reason, and commit no made-up file (the manifest's own rule).

## Where the new code is reached from

`writePlanQuestions` is called by the sweeper on every promotion (reached from `nextUnansweredQuestion` on every decision screen) and by the agents the session-start directive names. `plansNeedingQuestions` is called by the session-start directive, the stop-hook directive, the dashboard recipe and the loop-b banner.

## Acceptance scenarios

An editor re-save of an unchanged plan costs no agent run: the next open does not dispatch a critique for it, and the human still sees its questions.

## Security review

The fingerprint only decides whether to re-run a critique; it never makes a question count as answered and never feeds a gate crossing directly. The re-stamp is a write by CTOC code through the validating writer; no tool call can reach the live store (the edit hook denies it).

## Out of scope

A fingerprint on the human's answers, and any change to the sufficiency predicate (decision 22).

## CLAUDE.md

In the streaming-questions section, one sentence: a critique is kept while the plan's bytes are unchanged; the human's answers keep the modification-time rule. Update the documented test-file count.

## Decisions Taken Under Ambiguity

1. **A stale file whose fingerprint matches is re-stamped by `plansNeedingQuestions`**, where the parent says the fingerprint is "compared before a plan is made a candidate", instead of teaching `planQuestionsStatus` a second freshness rule. The answer rule then stays byte-for-byte today's, and every reader sees one consistent state.
2. **The fingerprint is recorded only when the plan provably did not change between the stamp and the read** (stat, read, stat), so it never describes bytes the questions were not generated against.
3. **The fixture is declared as a glob anchored in the streaming-questions corpus directory**, because the sample's file name is the real plan's sanitized reference, known only at capture.
