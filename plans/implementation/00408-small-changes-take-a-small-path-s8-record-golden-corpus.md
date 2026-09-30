---
title: "The light-path record is a registered persisted contract with a real captured sample"
type: implementation
status: implementation
parent_plan: small-changes-take-a-small-path
depends_on: 00406-small-changes-take-a-small-path-s6-light-path-recipe
priority: high
effort: small
files:
  - src/lib/golden-corpus-scan.js
  - tests/golden-corpus-fence.test.js
  # The captured sample's file name is the real record's id, known only at capture.
  - tests/fixtures/golden-corpus/light-path-record/*.json
  - tests/fixtures/golden-corpus/manifest.yaml
  # Ratchet file: CLAUDE.md states the number of registered persisted contracts.
  - CLAUDE.md
---

# The light-path record is a registered persisted contract with a real captured sample

Read the parent plan first: definition of done, item 4 ("the new record is a persisted contract, so it gets a registry entry and a real captured sample in `tests/fixtures/golden-corpus/`, never a redacted one").

## The problem in plain words

The light-path record is a file one process writes and two hooks read. That is exactly the shape the golden-corpus fence exists for: a reader tested only against hand-made records can pass while failing on what the real writer produces. This slice registers the record in the fence's contract registry and commits one real record, byte for byte, which the fence then drives through the real reader.

## What the code does today (read on 2026-09-30)

```js
// src/lib/golden-corpus-scan.js — the curated registry (five contracts)
const CONTRACTS = Object.freeze([
  { id: 'streaming-questions', corpusDir: 'streaming-questions',
    location: ['.ctoc', 'streaming', 'questions'], segments: ['.ctoc', 'streaming', 'questions'],
    readerBasename: 'streaming-precompute',
    readerExports: ['loadPlanQuestions', 'planQuestionsStatus', 'readAnsweredQuestionIds'],
    parse: 'json' },
  // verify-evidence, approval-ledger, task-registry, plan-frontmatter
]);
```

```js
// tests/golden-corpus-fence.test.js — each contract's canonical reader, driven over every sample
const READERS = { 'streaming-questions': (sampleAbs, sampleName) => { /* … */ }, /* … */ };
```

`tests/fixtures/golden-corpus/manifest.yaml` lists every contract, its location, its canonical reader, its samples with where each was captured from, and the measured extremes, which may only grow; it also carries `uncaptured_variants` for a shape no real instance exists for yet.

## Files and changes

### Modify `src/lib/golden-corpus-scan.js`

```js
{ id: 'light-path-record', corpusDir: 'light-path-record',
  location: ['.ctoc', 'light-path'], segments: ['.ctoc', 'light-path'],
  readerBasename: 'light-path', readerExports: ['readOpenRecords', 'findLightPathGrant'],
  parse: 'json' },
```

### Modify `tests/golden-corpus-fence.test.js`

Add `light-path-record` to the contract list and a `READERS` entry that stages each sample at `.ctoc/light-path/<id>.json` in a scratch root and asserts `readOpenRecords` returns exactly one record with the sample's `id`, `path` and `files`. Every module the scan reports as a consumer of the new contract (by reading, both write hooks and the light-path script import the reader) must be linked by a test that names the corpus directory, so the findings baseline in `.ctoc/golden-corpus-baseline.json` does not grow.

### Create one sample under `tests/fixtures/golden-corpus/light-path-record/`

Captured byte for byte from a record the real `open` wrote — in this repository or a scratch project — for a real request. Never hand-written, redacted or shortened. If no real record exists when the slice is built, run the real `open` once for a real small change to produce one; if that cannot be done, record the contract under `uncaptured_variants` with the reason instead of committing a made-up file, as the manifest's own rule requires.

### Modify `tests/fixtures/golden-corpus/manifest.yaml`

The contract, its location `.ctoc/light-path/*.json`, `canonical_reader: light-path.readOpenRecords`, the sample and where it was captured from, and the extremes as measured by the scanner (never typed by hand).

## Tests to write first (each run and seen failing before any code)

1. The fence's registry-completeness check (or a new case) names `light-path-record` as registered with a sample; red before the registry entry.
2. The corpus exercise drives the captured sample through `readOpenRecords` and gets the declared shape; red before the `READERS` entry.
3. The extremes ratchet records the new contract's measured extremes; shortening the sample afterwards fails by name.

## Where the new code is reached from

The registry is read by `scanGoldenCorpus`, which the fence test and the `golden-corpus-fence` check in `src/lib/iron-loop-enforcer.js` (thorough mode) call; the reader is the one both write hooks call on every uncovered edit.

## Acceptance scenarios

A later change to the record's shape that the reader cannot read fails the suite against the committed real sample, before a human's edit is ever refused by a record the reader silently drops.

## Security review

The sample is a real record: it holds a request fingerprint, file paths, signals and timestamps — no request text, no secret. Check this before committing; if a captured record ever carried anything else, the writer is wrong and the capture stops there.

## Out of scope

The streaming-questions sample carrying the new fingerprint field (the critique-freshness slice) and the group field (the group fan-out slice).

## CLAUDE.md

The golden-corpus paragraph names "five persisted contracts"; make it six and name the light-path record.

## Decisions Taken Under Ambiguity

1. **The fixture path is declared as a directory glob anchored under `tests/fixtures/golden-corpus/light-path-record/`**, because the sample's file name is the real record's id, which exists only after capture.
2. **Both reader exports are listed as the contract's reader exports**, since the hooks call `findLightPathGrant`, which reads through `readOpenRecords`.
