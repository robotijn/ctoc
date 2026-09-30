---
title: "The session can open, acknowledge and close a light change through the one sanctioned script"
type: implementation
status: implementation
parent_plan: small-changes-take-a-small-path
depends_on: 00403-small-changes-take-a-small-path-s3-light-path-grant
priority: high
effort: medium
files:
  - src/lib/light-path.js
  - src/scripts/light-path.js
  - src/hooks/PreToolUse.Bash.js
  - tests/light-path-open-close.test.js
  # Ratchet file: a new test file moves a documented count.
  - CLAUDE.md
---

# The session can open, acknowledge and close a light change through the one sanctioned script

Read the parent plan first: "The grant", "When a light change grows", decisions 4, 7 and 8, and criteria 1, 3, 5, 6 and 7.

## The problem in plain words

After the previous slice a record grants its files, but nothing writes records. This slice adds the one sanctioned writer: `open` classifies the change and, for a direct or quick path, writes the record bound to the human's request; `ack` records the human's "finished?" answer on a quick change; `close` ends a record as committed, superseded or abandoned. From this slice on, a human can have a small change edited without a plan.

## What the code does today (read on 2026-09-30)

- `src/scripts/light-path.js` (from the intake-classifier slice) has only `classify`.
- `findLightPathGrant` and `readOpenRecords` in `src/lib/light-path.js` (previous slice) read the schema-1 record; nothing writes it.
- `analyzeExports(projectRoot)` in `src/lib/reachability.js` returns sorted `live` and `dead` key lists (`src/rel/path.js#name`); it throws, naming the file, on an unreadable input.
- `getTestsForFiles(sourceFiles)` in `src/lib/coverage-map.js` returns the tests the coverage map knows for the files.
- The shell hook's `LIGHT_PATH_OPEN_SUBCOMMANDS` allows only `classify` past the write step gate.

## Files and signatures

### Modify `src/lib/light-path.js` (add the writer)

```js
/**
 * Write a new OPEN record atomically (temp file + rename) and return it. Throws on a
 * write failure (the script reports it); called ONLY by src/scripts/light-path.js.
 * @param {string} root
 * @param {{ path: ('direct'|'quick'), files: string[], requestSha256: string,
 *           override: (null|'just-do-it'), overridden: string[], signals: object[],
 *           exportsBefore: (string[]|null) }} spec
 * @returns {object} the written record (schema 1, state 'open', a fresh 'lp-<12 hex>' id)
 */
function openRecord(root, spec) { /* … */ }

/** Set `ack: { at }` on an open record (atomic rewrite). Returns the record, or null when no open record has that id. */
function ackRecord(root, id) { /* … */ }

/** Move an open record to closed/<id>.json with state 'closed-<reason>' and closed_at. Returns true on success. */
function closeRecord(root, id, reason /* 'committed'|'superseded'|'abandoned' */) { /* … */ }
```

The writer produces exactly the schema the reader validates; a record the writer produces and the reader rejects is a failing test, not a tolerated drift.

### Modify `src/scripts/light-path.js` (add three subcommands)

```
open  --files a,b --request-file .ctoc/state/light-path-request.txt (--fork|--no-fork)
      [--structure-only] [--dep-name <n> --dep-from <v|new> --dep-to <v>] [--override just-do-it]
ack   <id>
close <id> --reason committed|superseded|abandoned
```

`open`:
1. The request file must resolve, after `..` resolution, to a regular file (not a symbolic link) under `<root>/.ctoc/state/`, at most 64 KiB; anything else exits 2. Its text is fingerprinted with `requestFingerprint`, then the file is deleted so it cannot bind a second record.
2. `classifyChange` decides. `full` → exit 3 with the announcement and no record. `ask` without an override → exit 3 with the question and no record. A trust-boundary hit → exit 3, never a record, whatever the override.
3. When `exports-measurable` is measured, `exportsBefore` is the union of `live` and `dead` keys from `analyzeExports(root)` restricted to the listed files; if `analyzeExports` throws, `exportsBefore` is null (the gate slice then refuses a direct finish).
4. `openRecord`; stdout carries JSON `{ id, path, announcement, files, affected_tests }`, where `affected_tests` comes from `getTestsForFiles` and is `[]` with a plain note when the coverage map does not know the files. Exit 0.

`ack` and `close` exit 0 on success, 4 when no open record has the id. All output is JSON on stdout; errors are plain words on stderr; no free text is ever taken from argv.

### Modify `src/hooks/PreToolUse.Bash.js`

```js
const LIGHT_PATH_OPEN_SUBCOMMANDS = new Set(['classify', 'open']);
```

`open` must be able to run before any record exists, in a project whose signed state names no feature — the same reason the previous slice gave for `classify`. `ack` and `close` are not added: they need an open record, and the gate slice makes a valid open record satisfy the write step gate.

## Tests to write first (each run and seen failing before any code)

In `tests/light-path-open-close.test.js`, the script and both hooks run as child processes in a scratch CTOC project with `package.json`, `src/` and a synthetic transcript:

1. `open` on a direct rename (three library files, `--no-fork --structure-only`) with a request file whose text is a human-typed item in the transcript writes a record that `readOpenRecords` accepts, and the edit hook then allows an Edit to each listed file and refuses an unlisted one (criterion 1, the grant half). Red: no `open`.
2. `open` on one module plus its test without `--structure-only` → a `quick` record (criterion 3, the record half).
3. `open` naming `src/hooks/human-gate-check.js`, with and without `--override just-do-it` → exit 3, no record (criteria 4 and 6).
4. `open --fork` without an override → exit 3 with a two-option question, no record (criterion 5); with `--override just-do-it` → a `quick` record carrying `override: 'just-do-it'` and its overridden signals, and the edit hook grants it only once "just do it" is human-typed in the transcript.
5. A request file outside `.ctoc/state/`, a symbolic link, an oversized file, and a missing file → exit 2, no record; after a successful `open` the request file no longer exists.
6. `close <id> --reason superseded` moves the record to `closed/`, and the edit hook stops granting its files (criterion 7, the closing half).
7. `ack <id>` sets `ack.at` on the open record; `ack` of an unknown id exits 4.
8. The shell hook, in a scratch project whose signed state names no feature, allows `node "<repo>/src/scripts/light-path.js" open --files src/lib/a.js --request-file .ctoc/state/light-path-request.txt --no-fork --structure-only` (red today) and still denies `ack`/`close` there (they wait for the gate slice's record satisfier).
9. `exportsBefore` holds exactly the keys of the listed files in a scratch project with two exporting modules.

## Where the new code is reached from

`openRecord`, `ackRecord` and `closeRecord` are called by `src/scripts/light-path.js`, which `src/commands/start.md` runs with `node` (added by the intake-classifier slice; the light-path recipe slice documents these subcommands). The records are read by both write hooks.

## Acceptance scenarios

- The human asks "rename `formatRow` to `renderRow`"; the session writes the request to `.ctoc/state/light-path-request.txt`, runs `open`, shows the human the announcement, and edits the three files without a plan; an edit to a fourth file is refused.
- The human types "plan it"; the session runs `close <id> --reason superseded`; no further edit is covered.

## Security review

- The script is the only writer; the record directory is deny-outright to every tool call and every shell touch (previous slice).
- The request text never passes through argv or a shell; it is read from a confined file and deleted after use.
- A record for a trust-boundary file cannot be written, whatever override is claimed; even a hand-placed one would not grant (the grant re-checks).
- A record binds to the fingerprint of the relayed text, which the hooks accept only if the human really typed it. A session that relays a different message of the human's binds the record to that message; the parent accepts this strength and says so ("The grant can be requested by an agent … bound to a message the human really typed").

## Out of scope

The finish re-measure, the verify run and the commit gate (the gate slice); the recipe text in `src/commands/start.md` (the recipe slice).

## CLAUDE.md

Name the three new subcommands and the request-file rule in the light-path paragraph; update the documented test-file count.

## Decisions Taken Under Ambiguity

1. **The request reaches the script through a file under `.ctoc/state/`, not argv.** The shell hook splits commands on `;`, `&` and `|` without regard to quotes, so free text in argv would make a human request containing those characters, a backtick or ` -e` trip unrelated gates; a file keeps the command free of metacharacters so the narrow allowance can match it exactly.
2. **The request file is deleted after `open` reads it**, so one relay can bind one record.
3. **`ack` and `close` are not added to the step-gate allowance**; they run only while a record is open, which the gate slice makes a satisfier.
4. **Export keys are captured at `open`** because the finish comparison needs the state before the first edit; a failed capture is recorded as null, never as an empty list.
