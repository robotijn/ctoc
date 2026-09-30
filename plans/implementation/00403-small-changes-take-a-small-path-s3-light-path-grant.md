---
title: "A light-path record grants its exact files on both write channels, and nothing can forge one"
type: implementation
status: implementation
parent_plan: small-changes-take-a-small-path
depends_on: 00401-small-changes-take-a-small-path-s1-trust-boundary, 00402-small-changes-take-a-small-path-s2-intake-classifier
priority: high
effort: large
files:
  - src/lib/light-path.js
  - src/lib/escape-phrases.js
  - src/hooks/PreToolUse.Edit.js
  - src/hooks/PreToolUse.Bash.js
  - tests/light-path-grant.test.js
  # Ratchet file: a new library module and a new test file move documented counts,
  # and the edit flow CLAUDE.md describes gains a step and a deny-outright directory.
  - CLAUDE.md
---

# A light-path record grants its exact files on both write channels, and nothing can forge one

Read the parent plan first: "The grant", the hook table under "What must change in the hooks, and what must not", decisions 4 and 9, and criteria 7, 8, 10, 12 and 13.

## The problem in plain words

A direct or quick change needs permission to edit exactly the files it named, without a plan. The parent plan gives that permission through a small record file written only by CTOC code, bound to a message the human really typed, listing exact files, and never covering the trust boundary. This slice builds the reader half: what a valid record is, and the grant both write channels ask for. It also closes every way an agent could write a record itself. The writer (the script's `open`) is the next slice; until it lands, the grant step runs on every uncovered edit and finds no record, and the edit is decided exactly as today.

## What the code does today (read on 2026-09-30)

```js
// src/hooks/PreToolUse.Edit.js — enforce(): the order this slice extends
// 0/0b/0c  deny ledger, verify evidence, streaming store (ahead of the whitelist)
// 1        whitelist (.ctoc/**, plans/*.md, VERSION, ignore files) → allow
// 2        not a CTOC project → silent pass
// 3        coverage.findCoveringPlan(targetFile, root) → allow
// 4        typed escape phrase (off the trust boundary, after the first slice) → allow
// 5        mode: off → allow, soft → warn + allow, strict → block

// the role-scoped extraction both channels share; it JOINS every kept item with '\n'
function extractUserTypedText(transcript) { /* … */ return kept.join('\n'); }
```

```js
// src/hooks/PreToolUse.Bash.js — the ledger-forgery gate is the first deny layer
function isLedgerWrite(command) { /* per segment, cd-aware, three tests: literal
  adjacency (LEDGER_SEGMENT_RE), cd-resolved operand (LEDGER_RESOLVED_RE), and a
  real-path test through realPathConfinement.resolvesUnder */ }
function isLedgerForgery(command) { /* 1. isLedgerWrite  2. inline eval naming a
  ledger token  3. inline eval that cannot be cleared */ }
```

```js
// src/lib/escape-phrases.js — the word-bounded matcher, bound to the seven phrases
function matchEscapePhrase(text) { /* for (const phrase of ESCAPE_PHRASES) … */ }
```

## Files and signatures

### Create `src/lib/light-path.js` (this slice: the record contract and its reader)

```js
'use strict';
/**
 * The light-path record — one small JSON file per direct or quick change, written only
 * by src/scripts/light-path.js (the writer arrives in the next slice), read by both write
 * hooks. Open records live at .ctoc/light-path/<id>.json; closed records are moved to
 * .ctoc/light-path/closed/<id>.json and are never read by the grant.
 *
 * Record contract (schema 1):
 *   { schema: 1, id: 'lp-<12 hex>', path: 'direct'|'quick',
 *     files: [exact repository-relative POSIX paths, no globs, no '..'],
 *     request_sha256: '<64 hex>', override: null|'just-do-it',
 *     overridden: [signal names], signals: [classifier signals],
 *     exports_before: [keys]|null, state: 'open', opened_at: '<ISO>',
 *     ack: null|{ at }, gate: null|{…}, stopped: null|{ reason, at } }
 *
 * EVERY reader here RETURNS, NEVER THROWS, and every fault means "no grant": the edit
 * hook's outer catch fails open, so a throw would be an allow.
 */
const RECORD_ID_RE = /^lp-[0-9a-f]{12}$/;
const MAX_RECORD_BYTES = 64 * 1024;
const MAX_OPEN_RECORDS_READ = 50;
const OVERRIDE_UP = 'plan it';
const OVERRIDE_DOWN = 'just do it';

/** sha256 hex of text normalised to NFC, whitespace runs collapsed to one space, trimmed; null for empty. */
function requestFingerprint(text) { /* … */ }

/** The valid OPEN records under <root>/.ctoc/light-path/ (top level, regular files only,
 *  never a symbolic link, at most MAX_OPEN_RECORDS_READ, each at most MAX_RECORD_BYTES). */
function readOpenRecords(root) { /* … */ }

/**
 * Does a valid open record grant this exact file to this transcript?
 * @param {string} targetFile - tool-call target, absolute or repository-relative
 * @param {string} root - project root (=== process.cwd() in both hooks)
 * @param {string[]} userMessages - the human-typed items, in transcript order
 * @param {string|null} [transcript] - the raw transcript, used ONLY to report which role
 *   an unmatched override word appeared in; never for a permission decision
 * @returns {{ granted: boolean, recordId: (string|null),
 *   reason: ('granted'|'no-record'|'not-listed'|'trust-boundary'|'request-not-typed'|
 *            'superseded'|'override-not-typed'|'fault'),
 *   overrideSeenIn: (null|'assistant'|'tool_result') }}
 */
function findLightPathGrant(targetFile, root, userMessages, transcript) { /* … */ }

module.exports = { requestFingerprint, readOpenRecords, findLightPathGrant };
```

Grant rule, for each valid open record listing the exact target: find the LAST human-typed item whose fingerprint equals `request_sha256` (none → `request-not-typed`); a human-typed "plan it" in that item or any later one → `superseded`; a record claiming `just-do-it` needs a human-typed "just do it" in that item or a later one (else `override-not-typed`, with the role it did appear in, when it appeared at all); the target re-checked with `trustBoundary` from the first slice (boundary → `trust-boundary`, never granted); otherwise `granted`. Override words are matched with the same word-bounded matcher the escape phrases use.

### Modify `src/lib/escape-phrases.js`

```js
/** Return the first phrase of `phrases` found in `text`, word-bounded exactly as today, or null. */
function matchPhraseFrom(phrases, text) { /* the existing loop, parameterised */ }
function matchEscapePhrase(text) { return matchPhraseFrom(ESCAPE_PHRASES, text); }
module.exports = { ESCAPE_PHRASES, matchEscapePhrase, matchPhraseFrom };
```

`matchEscapePhrase` returns exactly what it returns today for every input; `tests/escape-phrases.test.js` stays green unchanged.

### Modify `src/hooks/PreToolUse.Edit.js`

- A fourth deny-outright guard, `isProtectedLightPathPath(filePath)`, with the same two-check shape as `isProtectedLedgerPath` (name arithmetic through `isUnderProtectedDir`, or `resolvesUnder` from the real-path confinement module, which returns true on every fault) over `.ctoc/light-path`. It runs as step 0d, ahead of the whitelist, at every mode, with the reason "light-path records are written only by CTOC's light-path script; agent writes under .ctoc/light-path/ are denied". Exported, like its three siblings.
- `extractUserTypedMessages(transcript)` returns the kept items as an array; `extractUserTypedText(transcript)` becomes `extractUserTypedMessages(transcript).join('\n')`, byte-identical to today for every input. Exported (the shell hook calls it).
- The transcript read moves ahead of step 3b and is reused by step 4.
- Step 3b, after plan coverage and before the typed phrase: `findLightPathGrant(targetFile, root, extractUserTypedMessages(transcript), transcript)`; granted → `allow('light-path', …)` with `plan_matched: null`, `escape_phrase: null` and a new `light_path_record: <id>` field in the log entry. A refused grant that carried an override role adds `light_path_refused: <reason>` and `override_seen_in: <role>` to whatever entry the edit finally produces. The light-path module is required fail-soft; a load failure means no grant.

### Modify `src/hooks/PreToolUse.Bash.js`

- Generalise the ledger's per-segment write test to take a protected store (`{ segmentRe, resolvedRe, dirRel }`) and call it for the ledger (behaviour identical, pinned by `tests/ledger-forgery-closed.test.js`) and for `.ctoc/light-path`. A non-read touch of the record directory, in any of the forms the ledger test catches, is denied as the first deny layer with its own reason naming the light-path store and the one sanctioned writer, `node <plugin root>/src/scripts/light-path.js`.
- An inline evaluation (`node -e`, `--eval`, `-p`, stdin, `deno eval`, `bun eval`) whose text names `light-path` or `light_path` is denied with its own reason, whether it names the module or the directory.
- In `checkWriteCoverage`, a determinate target not covered by an approved plan is next asked `findLightPathGrant(target, root, editHook.extractUserTypedMessages(transcript))`. Every non-whitelisted target covered by a plan or a record → allowed; if any target needed a record, the result is `light-path` with the record id, logged with outcome `light-path` and fixed reason `light-path`. A missing module or export → uncovered (fail closed). This stage stays mode-blind: no mention of the mode in any form (case 27 of `tests/enforcement-mode.test.js`).

## Tests to write first (each run and seen failing before any code)

In `tests/light-path-grant.test.js`: records are placed on disk by the test as fixtures (the writer is the next slice); both hooks are driven as child processes in a scratch CTOC project with a synthetic transcript in the harness's JSONL shape.

1. Criterion 10: a record listing `src/lib/a.js`, bound to a human-typed message, grants an Edit to `src/lib/a.js` (log outcome `light-path`, `light_path_record` set) and a shell `echo x > src/lib/a.js` (with a signed state at step 10 carrying a feature, so the step gate is not what decides; the step gate's own change is the gate slice). `src/lib/b.js` is refused on both channels with today's message. Red: no module, no step.
2. Criterion 12(a): Write, Edit, MultiEdit and NotebookEdit targets under `.ctoc/light-path/` are denied at strict, soft and off. Red: whitelisted today.
3. Criterion 12(b): `node -e "require('./src/lib/light-path')"`, `echo {} > .ctoc/light-path/lp-0123456789ab.json`, a quote-split and a `cd`-split variant are denied; `cat .ctoc/light-path/lp-0123456789ab.json` and `ls .ctoc/light-path` are allowed. Red: the shell hook knows nothing of the store.
4. Criterion 12(c): the request text appears only in an assistant message → no grant, edit decided as today.
5. Criterion 12(d): a transcript from another session (no matching human message) → no grant.
6. Criterion 13: with a record present, a write to the ledger, the verify evidence store, the streaming store, a command table, an irreversible command and a raw plan move are each refused exactly as today; a record that lists `src/hooks/PreToolUse.Bash.js` never grants it; the shell decision is identical at strict, soft and off.
7. Criterion 8 (grant half): a record claiming `just-do-it` where "just do it" appears only in an assistant message and a tool result → no grant, and the log entry carries `light_path_refused: override-not-typed` with `override_seen_in`.
8. Criterion 7 (enforcement half): "plan it" typed after the bound request → no further grant.
9. Faults: corrupt JSON, an oversized file, a symbolic link in the store, an unreadable store directory (permission case: skips loudly on Windows and as root), an absent store, a record whose `id` does not match its file name, a record with a glob in `files` → no grant, never a throw.
10. `extractUserTypedText` produces byte-identical output to the pre-change function on five fixed transcripts. Green before (a refactor pin, recorded as such).
11. `matchPhraseFrom(['plan it'], …)` is word-bounded exactly like the escape phrases (`"plan it."` matches, `"plan items"` does not).

## Where the new code is reached from

`findLightPathGrant` is called from step 3b of the edit hook (registered for Edit; Write, MultiEdit and NotebookEdit delegate to `enforce`) and from `checkWriteCoverage` in the shell hook (registered for Bash). `extractUserTypedMessages` is called by the edit hook itself and by the shell hook. `matchPhraseFrom` is called by `matchEscapePhrase` and by the grant. A human reaches a grant once the next slice's `open` writes a record.

## Acceptance scenarios

- A record written for `src/lib/a.js` lets that one file be edited and nothing else; another session's transcript makes it inert.
- No tool call, shell redirect or inline script can write a record.

## Security review

- The record directory is deny-outright on the edit channel at every mode and on the shell channel for every non-read touch, including through a symbolic link and across a `cd`.
- Every read fault is "no grant"; the grant never covers a trust-boundary file even if a record lists one.
- The binding is to the fingerprint of a human-typed item, read with the same role-scoped extraction the escape phrases use; assistant text and tool results never count.
- Log entries carry fixed-vocabulary reasons, a record id and a role name; never message text.

## Out of scope

Writing records (next slice); the step gates and the commit gate (the gate slice); unifying the three escape-phrase lists (parent, out of scope).

## CLAUDE.md

Describe step 3b (the light-path grant) and the fourth deny-outright directory in "Mandatory Pipeline Use (v7)", state that the grant is consulted before the mode and never reads it, and update the documented counts.

## Decisions Taken Under Ambiguity

1. **Open records at the top of `.ctoc/light-path/`, closed ones under `closed/`.** The grant reads only the top level, so the per-edit read stays small however many changes have been closed. Not chosen: one index file (a second writer path to protect).
2. **The fingerprint is sha256 of the NFC-normalised, whitespace-collapsed, trimmed text.** Whitespace differences between what the harness recorded and what the session relays must not make a genuine request inert; any other difference does.
3. **Binding uses the LAST human-typed item that matches, and override words count from that item on.** A repeated request re-binds to the newest copy; a "plan it" before the request cannot supersede it.
4. **An item is exactly one of the pieces `extractUserTypedText` joins today**, so the grant and the escape phrases read one extraction.
5. **At most 50 records are read per decision**, the same bound the quarantine sweeper uses per sweep; records beyond it grant nothing (fail closed).
6. **A shell command whose targets are covered partly by plans and partly by a record is allowed**, logged with the record id.
7. **The ledger's shell write test is generalised to a protected-store parameter, not copied**, so the ledger and the record store cannot drift.
8. **The role an ignored override appeared in is reported in the log only** — the parent's criterion 8 asks for it; it never feeds a permission decision.
