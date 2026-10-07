---
title: "A plan that crossed to done does not break the stored-questions compatibility test"
type: implementation
created: 2026-10-07
priority: high
effort: small
depends_on: none
files:
  - tests/questions-attestation.test.js
  - tests/approval-hash-survives-execution.test.js
  - tests/ledger-forgery-closed.test.js
approved_by: human
approved_at: 2026-10-07T07:46:13.509Z
gate_crossed: review → done
---

# A plan that crossed to done does not break the stored-questions compatibility test

## Problem statement

`tests/questions-attestation.test.js` case "the live repository questions files still read
cleanly and unattested — no stored data broke" reads every file in
`.ctoc/streaming/questions/` and requires `planQuestionsStatus` to answer `ready` or `stale`.
A question file is keyed by the plan's stage and name (`review__<plan>.md.json`). When the
owner accepts a plan and it moves from review to done, the file still names `review/<plan>.md`,
so `planQuestionsStatus` honestly answers `unknown-plan`, and the suite fails. This happened on
2026-10-07 when the owner accepted the plans in review: two such files are tracked in git
(`review__00003-r2a-scheduler-lifecycle-honesty.md.json`,
`review__00004-r2b-actions-drain-and-shipgate.md.json`), so every fresh clone fails too, and
every future crossing of a plan with a stored question file would fail it again.

The test's own claim is that **no stored data broke**: the attestation change is additive and
reading old files must not regress. A plan that legitimately moved to a later stage is not
broken data. The test already accepts drift of the same kind (`stale`, for plans edited after
generation).

**Two more tests hard-code the same moving state (found when the 142 crossings were checked, 2026-10-07).**
`tests/approval-hash-survives-execution.test.js` "on REAL executed plan bytes, the specification hash is
stable across the execution record" takes its real executed plan only from `plans/review/`; with review
emptied by the owner's acceptance it finds none and fails. `tests/ledger-forgery-closed.test.js` case 4
"all real ledger entries in this repo keep their current classification" asserts more than 200 entries
classify as `backfilled`; the acceptance replaced 142 backfilled entries with the owner's review-to-done
entries (each plan's ledger file holds its latest crossing), so the count is now 190 backfilled and 403
human. No entry was reclassified; entries were replaced by a real gate crossing.

## Technical approach

Change only that one case, and make it check its real claim more strictly than today:

1. For every file, parse the JSON directly and assert it is an object whose `questions` field
   is an array (new assertion: the stored data itself is intact — today the test never reads
   the bytes when the plan resolves).
2. If `planQuestionsStatus` answers `ready` or `stale`, keep today's assertions unchanged.
3. If it answers `unknown-plan`, pass only when the named plan file exists in a **later**
   stage directory than the one in the file name (stage order: vision, functional,
   implementation, todo, in-progress, review, done) — proving a real crossing, not a corrupt
   or dangling reference. Any other status (`invalid`, `not-computed`) still fails, and an
   `unknown-plan` whose plan is nowhere later still fails.

Write the reason for the change in a comment above the case (lesson 14: a test changes only
with a written reason, and only to tighten it toward the real behaviour).

4. `tests/approval-hash-survives-execution.test.js`: take the real executed plan from `plans/review/`
   and, when none there carries an `## Execution Record` or `## Execution Log` section, from
   `plans/done/` (done plans are real executed plans). Every assertion on the hash stays as it is.
5. `tests/ledger-forgery-closed.test.js` case 4: keep "more than 200 entries", "no entry is unknown"
   and "every entry classifies"; replace the two count floors with a per-entry check that is stricter
   than a count: an entry carrying `backfilled: true` must classify as `backfilled`, and an entry with
   `approved_by: human` and no backfill flag must classify as `human` (read the classifier in
   `src/lib/approval-ledger.js` first and state the exact rule it applies; if that rule differs, assert
   what the classifier documents, never a weaker rule). Keep a floor that cannot pass on an empty set:
   at least one entry of each of the two kinds.

Do not touch `.ctoc/streaming/` (owner rule: nothing under it is staged), and do not change
`src/lib/streaming-precompute.js` or any gate code.

## Acceptance criteria

- [x] The case passes on the current repository, where the two tracked files name plans now in `plans/done/`.
- [x] A fixture question file naming `review/x.md` while `plans/done/x.md` exists passes; the same file with no `x.md` in any later stage fails; a file whose bytes are not JSON fails; a file without a `questions` array fails.
- [x] With `plans/review/` holding no executed plan, the hash test still measures a real executed plan (from done) and passes. — done by the iron-loop executor in the main checkout on 2026-10-07 (both tests red before, green after; full suite 12,495 passed, 0 failed, 0 skipped, coverage 99.89%); re-run by the session.
- [x] The ledger case passes on today's ledger (190 backfilled, 403 human) and fails on a fixture where a `backfilled: true` entry classifies otherwise. — done by the iron-loop executor in the main checkout on 2026-10-07 (both tests red before, green after; full suite 12,495 passed, 0 failed, 0 skipped, coverage 99.89%); re-run by the session.
- [x] `npm test` is green: fail 0, skipped 0, coverage at or above the floor. — done by the iron-loop executor in the main checkout on 2026-10-07 (both tests red before, green after; full suite 12,495 passed, 0 failed, 0 skipped, coverage 99.89%); re-run by the session.

## Execution Plan

### Step 8: TEST
- [x] Add the four fixture cases from the acceptance criteria (temporary project root, removed after); run them; record which are red against the current case. — done by the iron-loop executor (commit 302f6656); the diff was re-read by the session before merge.

### Step 9: PREPARE
- [x] Read `planQuestionsStatus` in `src/lib/streaming-precompute.js` to confirm the status names and how a ref is resolved. — done by the iron-loop executor (commit 302f6656); the diff was re-read by the session before merge.

### Step 10: IMPLEMENT
- [x] `tests/questions-attestation.test.js`: rewrite the live-store case as specified, with the reason comment. — done by the iron-loop executor (commit 302f6656); the diff was re-read by the session before merge.

- [x] `tests/approval-hash-survives-execution.test.js` and `tests/ledger-forgery-closed.test.js` case 4 as specified in points 4 and 5. — done by the iron-loop executor in the main checkout on 2026-10-07 (both tests red before, green after; full suite 12,495 passed, 0 failed, 0 skipped, coverage 99.89%); re-run by the session.

### Step 11: REVIEW
- [x] Re-read the diff: every former failing path (`invalid`, `not-computed`, unknown plan nowhere later) still fails. — done by the iron-loop executor (commit 302f6656); the diff was re-read by the session before merge.

### Step 12: OPTIMIZE
- [x] Nothing beyond reading each file once. — done by the iron-loop executor (commit 302f6656); the diff was re-read by the session before merge.

### Step 13: SECURE
- [x] The stage and plan name from the file name are matched against the fixed stage list and a plain file-name pattern before any path is built; no path leaves `plans/`. — done by the iron-loop executor (commit 302f6656); the diff was re-read by the session before merge.

### Step 14: VERIFY
- [x] `npm test`: fail 0, skipped 0, coverage at or above `.ctoc/coverage-baseline.json` `minPct`. — done by the iron-loop executor (commit 302f6656); the diff was re-read by the session before merge.

### Step 15: DOCUMENT
- [x] The reason comment above the case. — done by the iron-loop executor (commit 302f6656); the diff was re-read by the session before merge.

### Step 16: FINAL-REVIEW
- [x] Confirm the acceptance criteria hold and the diff touches only `tests/questions-attestation.test.js`. — done by the iron-loop executor (commit 302f6656); the diff was re-read by the session before merge.
