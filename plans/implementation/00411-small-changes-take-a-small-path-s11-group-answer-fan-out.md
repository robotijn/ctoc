---
title: "One critique of a parent's slices lands on every slice, and one answer counts for all of them"
type: implementation
status: implementation
parent_plan: small-changes-take-a-small-path
depends_on: 00410-small-changes-take-a-small-path-s10-unchanged-plan-not-recritiqued
priority: high
effort: medium
files:
  - src/lib/streaming-questions-sweeper.js
  - src/lib/streaming-precompute.js
  - src/lib/streaming-gate.js
  - tests/critique-group-fan-out.test.js
  - tests/fixtures/golden-corpus/manifest.yaml
  # Ratchet file: a new test file moves a documented count.
  - CLAUDE.md
---

# One critique of a parent's slices lands on every slice, and one answer counts for all of them

Read the parent plan first: Part B item 2, decisions 11 and 12, and criterion 20.

## The problem in plain words

The human approves a parent's slices together with one word, but the fleet critiques each slice on its own and asks him the same questions once per slice. The parent's design is one critique per group: the critic still writes exactly one quarantine file, the validating promoter fans it out to every member, and one human answer is recorded for every member. This slice builds that receiving side. Nothing produces a group critique until the grouping slice, so for every single-plan critique this slice changes nothing.

## What the code does today (read on 2026-09-30)

```js
// src/lib/streaming-questions-sweeper.js — promotePendingFile(root, absFile)
// 1 regular file  2 size  3 readable  4 JSON  5 object  6 ref  7 filename↔ref binding
// 8 ref → plan path  9 plan exists (current mtime)  10 supersession  11 writePlanQuestions
// every failure returns { ok:false, reason } from a CLOSED set; never throws, never unlinks
```

```js
// src/lib/streaming-gate.js — streamAnswer(ref, questionId, optionKey, projectRoot)
// stamps the answer with the question set's revision from planQuestionsStatus, then
// appends ONE line { ts, ref, questionId, optionKey, planMtimeMs? } to
// .ctoc/streaming/answers.jsonl
```

```js
// src/lib/actions.js — listSubplans reads parent_plan from the MERGED frontmatter region,
// because parseMetadata sees only the first block once an approval marker is prepended
const { extractFrontmatterRegion } = require('./stale-detector');
const readParent = (region) => { const m = region.match(/^\s*parent_plan\s*:\s*(.+?)\s*$/m); /* … */ };
```

## Files and signatures

### Modify `src/lib/streaming-precompute.js`

```js
function writePlanQuestions(root, ref, questions, planMtimeMs, attestation, group) { /* … */ }
// `group` (optional sixth parameter): { parent: string, members: string[] } — carried into the
// file as `group` only when it is an object; an omitted one leaves the byte shape unchanged.
```

- `planQuestionsStatus` exposes `group` on its `ready` result: the stored block when it is valid (`parent` a non-empty string of at most 200 characters; `members` an array of 2 to 50 distinct plan references, each resolving through `refToPlanPath`, and containing this ref), otherwise `null`. Validation fails toward `null` — a malformed block fans nothing out. Like `attestation`, the reader is the single validation authority.
- The re-stamp from the previous slice passes the stored `group` through.

### Modify `src/lib/streaming-questions-sweeper.js`

A pending payload MAY carry `group: { parent, members: [{ ref, planMtimeMs }] }`. When it does, after step 9 for the representative and before any write:

- `members[0].ref` equals the payload's `ref`; there are 2 to `MAX_FILES_PER_SWEEP` members; refs are distinct;
- every member resolves to an existing plan in the SAME stage as the representative, is not superseded (its `planMtimeMs`, when a finite number, is not older than its current mtime), and its merged-frontmatter `parent_plan` equals `group.parent` (read with `extractFrontmatterRegion`, required lazily, as `listSubplans` does).

Any failure discards the whole payload with the new closed-set reason `group-invalid` (or `superseded`), and nothing is written. On success, `writePlanQuestions` runs once per member with that member's current mtime, the same questions, the same attestation, and `group: { parent, members: <the refs> }`. A payload without `group` follows today's ladder byte for byte.

### Modify `src/lib/streaming-gate.js`

In `streamAnswer`, after the answer line for `ref` is appended and when the status for `ref` is `ready` with a `group`: for each other member whose own status is `ready`, whose `group.parent` is the same, and whose questions contain `questionId`, append one more line `{ ts, ref: <member>, questionId, optionKey, planMtimeMs: <member's revision> }`. The status line says, in plain words, how many other slices of the same plan the answer was recorded for. A fault while fanning out never loses the answer already recorded for `ref` and is carried into the status line.

## Tests to write first (each run and seen failing before any code)

In `tests/critique-group-fan-out.test.js`, against a scratch pipeline with a parent's 15 slices in `plans/implementation/`, each with `parent_plan` naming the parent:

1. Criterion 20 (the receiving half): one pending payload for the first slice with a 15-member `group` → one sweep writes 15 live questions files, each with the same questions, its own fresh stamp, and the `group` block; the quarantine file is consumed. Red: today only the representative is written.
2. Answering one question once through `streamAnswer` → the answers log gains 15 lines, and `hasEnoughInformation` counts that question as answered for every member. Red: one line today.
3. A member whose `parent_plan` differs, a member in another stage, a superseded member, a repeated ref, and a first member that is not the payload's `ref` → each discards the whole payload with its reason; no live file is written.
4. A payload without `group` promotes exactly as today (the existing `tests/streaming-questions-sweeper.test.js` stays green unchanged).
5. A live file with a malformed `group` block → `planQuestionsStatus` returns `group: null` and an answer is recorded for that ref only.

## Golden corpus

The streaming-questions contract gains an optional `group` field. No real questions file with a group can exist until the grouping slice has run a real group critique, so record the variant under `uncaptured_variants` in the manifest with that reason; commit no made-up file.

## Where the new code is reached from

`promotePendingFile` runs from `sweepPendingQuestions`, which `nextUnansweredQuestion` in `src/lib/streaming-gate.js` calls before every question read. `streamAnswer` runs on every answer the human gives on `/ctoc:start`. `planQuestionsStatus` is read by both.

## Acceptance scenarios

When the grouping slice dispatches one critique for a parent's 15 slices, the human answers each question once, and every slice records the answer — so the whole group can cross together when every fork is answered.

## Security review

The critic's capability is unchanged: it writes one quarantine file. The promoter decides which live files exist, and only for plans that are provably siblings at the same stage; a hostile group block can at most be discarded. Log lines carry basenames and closed-set reasons only.

## Out of scope

Forming groups and dispatching them (the grouping slice); the critic's instructions for a group payload (also the grouping slice).

## CLAUDE.md

In the streaming-questions section, one sentence: a group critique is promoted to every member, and one answer is recorded for every member. Update the documented test-file count.

## Decisions Taken Under Ambiguity

1. **The group block is validated by the promoter on arrival and by the reader on use**, mirroring the attestation's split, so a malformed block can neither be written by the promoter nor fan an answer out.
2. **All members must sit in the same stage as the representative**, because a group is one decision at one moment (the parent: "the members are the group's plans currently at the decision stage").
3. **A group is bounded by the sweeper's existing per-sweep limit**, not a new number.
4. **The answer fan-out writes one line per member, each with the member's own revision stamp**, so `readAnsweredQuestionIds` — the one encoding of "answered" — is untouched (decision 12).
