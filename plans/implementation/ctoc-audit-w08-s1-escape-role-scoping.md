---
title: "W08-s1 — Escape-phrase matcher scans only genuinely user-typed transcript entries"
type: feature
parent_plan: "ctoc-audit-w08-enforcement-honest"
depends_on: none
files:
  - src/hooks/PreToolUse.Edit.js
  - tests/pretooluse-edit-escape-role-scoping.test.js
priority: MEDIUM
created: "2026-07-13T00:00:00Z"
---

# W08-s1 — Escape-phrase matcher scans only genuinely user-typed transcript entries

Fixes **Defect 1 (audit finding H4)** of the parent
[`ctoc-audit-w08-enforcement-honest`](./ctoc-audit-w08-enforcement-honest.md).
Ancestry read before authoring: vision
`plans/done/ctoc-self-audit-remediation.md` → parent implementation plan (ASSESS
/ ALIGN / CAPTURE) → this slice.

**One-line scope:** make `findEscapeInTranscript()` extract only genuinely
user-*typed* transcript text before matching (JSONL parse; exclude `tool_result`
blocks and assistant entries) **and** drop the verbatim escape-phrase list from
`block()`'s stderr message, so CTOC's own denial — or a `Read` of `CLAUDE.md` —
can no longer unlock the next edit.

> **Observability caveat (from the parent, not a build/test dependency).** The
> parent `depends_on: ctoc-audit-w01-enforcement-blocks` is an *observability*
> dependency: until W01 makes `block()` a real deny, there is no live block for
> this bug to be seen unlocking end-to-end. This slice is nonetheless fully
> authorable and unit-testable **today** with synthetic JSONL fixtures — W01 is
> not required to write or pass any test here. This slice's own `depends_on` is
> `none` (no sibling ordering).

## Implementation Details

### Architecture Decision — what counts as "user-typed" (schema confirmed at PLAN)

The parent CAPTURE deferred the exact transcript schema to Step 5 (PLAN). It is
now **confirmed against a live Claude Code transcript**
(`~/.claude/projects/-Users-doctony-Code-ctoc/*.jsonl`, 14,300 lines):

| Entry kind | JSONL shape | user-typed? |
|---|---|---|
| Genuine user turn | `{"type":"user","message":{"role":"user","content":"<string>"}}` | **YES** |
| Tool result (e.g. a `Read` of `CLAUDE.md`, or a hook's stderr surfaced back to the model) | `{"type":"user","message":{"role":"user","content":[{"type":"tool_result",…}]}}` | **NO** |
| Assistant turn | `{"type":"assistant","message":{"role":"assistant","content":[{"type":"thinking"\|"text"\|"tool_use",…}]}}` | **NO** |
| Metadata line | `{"type":"last-prompt"}`, `{"type":"mode"}`, … (no `message`) | **NO** |

**Decision:** a naive `role === 'user'` filter is *insufficient* — a
`tool_result` also carries `role: "user"`, so a `Read` of `CLAUDE.md` (which lists
all seven phrases) or CTOC's own block-message stderr would still slip through.
The matcher therefore takes text from `type === 'user'` entries **only**, and
within those, only **string content** or `text`-type content blocks — **every
`tool_result` block is excluded.** Assistant/system/metadata entries are excluded
wholesale. This is the precise refinement of the parent's "scope to `role ===
'user'`" shorthand; recorded in Decisions Taken Under Ambiguity.

### Dependency Graph

```
tests/pretooluse-edit-escape-role-scoping.test.js
   --require--> src/hooks/PreToolUse.Edit.js   (exports: findEscapeInTranscript,
                                                 extractUserTypedText, buildBlockMessage)
src/hooks/PreToolUse.Edit.js
   --require--> src/lib/escape-phrases.js       (UNCHANGED: matchEscapePhrase, ESCAPE_PHRASES)
```

No new module. No cycle. `escape-phrases.js` is read-only from here (its
word-bounded matcher is already correct and already covered by
`tests/escape-phrases.test.js`); this slice only changes *what text is fed into*
it and *what text the block message emits*.

### File Specifications

#### File: `src/hooks/PreToolUse.Edit.js` — MODIFY

**Change 1 — role-scoped transcript extraction (replaces `findEscapeInTranscript`, `:115-120`).**
Add a helper and rewrite the matcher:

- `extractUserTypedText(transcript: string)` → `string`
  - Split on `/\r?\n/` (CRLF-safe). For each non-empty line, `JSON.parse` inside
    a `try/catch` (non-JSON/metadata lines are skipped, never thrown on).
  - Keep an entry only when `entry.type === 'user'` and `entry.message` exists and
    `entry.message.role` is absent or `=== 'user'`.
  - From a kept entry: if `message.content` is a string, take it; if it is an
    array, take only blocks where `block.type === 'text'` (as `block.text`).
    **`tool_result` (and any non-`text`) blocks are skipped.**
  - Return the kept text joined by `\n`.
- `findEscapeInTranscript(transcript: string)` → `string|null`
  - `if (!transcript || !escapePhrases) return null;`
  - `const userText = extractUserTypedText(transcript);`
  - `return userText ? escapePhrases.matchEscapePhrase(userText.slice(-5000)) : null;`
  - The `slice(-5000)` now bounds work over **user-typed text only** (not the raw
    file tail), preserving the original memory bound while closing the bypass.

**Change 2 — phrase-free block message (`block()`, `:122-142`, specifically `:128`).**
Extract the message body into a pure, testable builder and drop the verbatim
phrase list:

- `buildBlockMessage(reason: string, info: object)` → `string`
  - Returns the full multi-line stderr text `block()` currently writes, **with the
    escape-phrase list removed.** The resolution line that today reads
    `"  - Use an escape phrase (hotfix, trivial fix, urgent) if this is genuinely small.\n\n"`
    is replaced by exactly:
    `"  - If this change is genuinely small, an escape phrase you type yourself will allow it — see /ctoc:menu for the current list.\n\n"`
  - This string contains **none** of the seven canonical phrases (`hotfix`,
    `trivial fix`, `trivial change`, `quick fix`, `urgent`, `skip planning`,
    `skip iron loop`) as word-bounded tokens.
- `block()` writes `buildBlockMessage(reason, info)` to `process.stderr`, then
  logs and `process.exit(1)` exactly as before (no change to the block/allow
  signal — that is W01's concern, explicitly out of scope here).

**Change 3 — exports.** Extend `module.exports` from
`{ enforce, isWhitelisted, getTargetFile, readStdinJson }` to also export
`findEscapeInTranscript`, `extractUserTypedText`, and `buildBlockMessage` so the
test drives them in-process (no subprocess, no `process.exit` in the unit test).

No change to `enforce()`'s flow, `readTranscript()`, the whitelist, coverage, or
exit codes.

#### File: `tests/pretooluse-edit-escape-role-scoping.test.js` — CREATE

`node:test` (`describe`/`it`/`assert`). Imports the three new exports plus
`ESCAPE_PHRASES` from `../src/lib/escape-phrases`. Uses **synthetic JSONL string
fixtures** built in-test (helper `jsonl(...entries)` that `JSON.stringify`s each
entry and joins with `\n`) — no real transcript, no filesystem, no W01.

### Test Plan

`tests/pretooluse-edit-escape-role-scoping.test.js`

1. **Block-message stderr cannot self-unlock (Defect 1 core).** Fixture: last
   entry is a `tool_result` whose text is CTOC's own denial
   (`"Use an escape phrase (hotfix, trivial fix, urgent) …"`). Assert
   `findEscapeInTranscript(fixture) === null`.
2. **A `Read` of `CLAUDE.md` cannot unlock.** Fixture: a `tool_result` block whose
   text lists all seven canonical phrases verbatim. Assert result `=== null`.
3. **Genuine user-typed phrase still unlocks (regression guard).** Fixture: a
   `type:"user"` string-content entry `"please hotfix this"`. Assert result
   `=== 'hotfix'`.
4. **Most-recent non-user occurrence does not override an earlier user phrase.**
   Fixture: user string entry `"hotfix"` FOLLOWED BY a later `tool_result`
   containing `"urgent"`. Assert result `=== 'hotfix'` (proves recency of a
   non-user hit is moot once non-user text is excluded).
5. **Assistant text never unlocks.** Fixture: an `assistant` entry whose `text`
   block says `"you could use hotfix here"`, no user phrase. Assert `=== null`.
6. **Mixed user entry — text block counts, tool_result block does not.** Fixture:
   one `type:"user"` entry whose content array holds a `text` block `"skip iron
   loop"` and a `tool_result` block `"urgent"`. Assert `=== 'skip iron loop'`
   (text block honored) — and a sibling fixture with the phrase ONLY in the
   `tool_result` block asserts `=== null`.
7. **Malformed / metadata lines are skipped, not thrown on.** Fixture interleaves
   `{"type":"last-prompt"}`, a non-JSON line `not json at all`, and a valid user
   entry `"quick fix"`. Assert `=== 'quick fix'` (robust parse) and that no throw
   occurs.
8. **`extractUserTypedText` unit.** Given a 3-entry fixture (user string,
   assistant, tool_result), assert the returned text contains the user string and
   contains neither the assistant nor the tool_result text.
9. **Block message contains no canonical phrase (content assertion).** For every
   `p` in `ESCAPE_PHRASES`, assert `buildBlockMessage('r', {target_file:'x'})`
   does not match the word-bounded phrase (reuse the same lookaround shape as
   `escape-phrases.js`, or `matchEscapePhrase(buildBlockMessage(...)) === null`).
10. **Block message still helps.** Assert it contains `"/ctoc:menu"` and the
    `Target:` line — the message stays actionable after the phrase list is dropped.

Coverage target ≥ 80% on the three new/changed functions; every branch
(string content, text block, tool_result skip, non-JSON skip, empty/null
transcript) exercised.

### Security Review

- [x] **Untrusted input parse:** `JSON.parse` per line is wrapped in `try/catch`;
  a hostile/oversized/non-JSON line degrades to "skipped," never throws. No `eval`.
- [x] **No ReDoS introduced:** matching still delegates to
  `escape-phrases.matchEscapePhrase` (unchanged, `safeRegExp`-based). New code adds
  no regex.
- [x] **Bounded memory:** `slice(-5000)` retained, now over user-typed text.
- [x] **No prototype pollution:** parsed objects are only *read*
  (`entry.type`, `entry.message.role/content`, `block.type/text`); nothing is
  assigned from parsed keys into a target object.
- [x] **No path/traversal surface:** transcript path handling
  (`readTranscript`/`safeFs`) is unchanged.
- [x] **No secret leakage:** block message no longer emits the phrase list; it
  emits only target path + menu pointer (no new sensitive data).

## Execution Plan

### Step 8: TEST
Write `tests/pretooluse-edit-escape-role-scoping.test.js` FIRST (TDD-red). Encode
all ten cases above as behavior assertions on the exported functions. Confirm the
suite is **RED** against current `PreToolUse.Edit.js` — specifically, cases 1, 2,
4, 6b and 9 fail today because the raw-tail matcher returns a phrase from
tool_result/block-message text and the block message still lists phrases.

### Step 9: PREPARE
Confirm `escape-phrases.js` exports `ESCAPE_PHRASES` + `matchEscapePhrase`
(verified: it does). No new dependencies, directories, or config. No fixture files
on disk (fixtures are in-test strings).

### Step 10: IMPLEMENT
One step, file sub-items:
- **`src/hooks/PreToolUse.Edit.js`**
  - Add `extractUserTypedText(transcript)` (JSONL parse; user-typed text only;
    exclude `tool_result` and non-`text` blocks; CRLF-safe split; fail-soft parse).
  - Rewrite `findEscapeInTranscript(transcript)` to match over
    `extractUserTypedText(...).slice(-5000)`.
  - Add `buildBlockMessage(reason, info)` returning the phrase-free stderr body
    (exact replacement line as specified); route `block()` through it.
  - Extend `module.exports` with `findEscapeInTranscript`, `extractUserTypedText`,
    `buildBlockMessage`.
- No stubs; make each documented choice above concrete. Any residual ambiguity →
  `## Decisions Taken Under Ambiguity`, not a TODO.

### Step 11: REVIEW
Self-review: dependency direction intact (hook → lib, never the reverse);
`enforce()` flow, exit codes, whitelist, and coverage path byte-unchanged; only
the *input scope* of the matcher and the *content* of the block message changed.

### Step 12: OPTIMIZE
Confirm single pass over transcript lines; no redundant re-parse; `slice(-5000)`
bound preserved. No premature abstraction beyond the two small helpers the tests
require.

### Step 13: SECURE
Walk the Security Review checklist above; confirm the untrusted-JSONL parse is
fully guarded and no new regex/pollution/traversal surface was added.

### Step 14: VERIFY
`node --test tests/pretooluse-edit-escape-role-scoping.test.js` → green. Then full
suite `node --test tests/*.test.js` → `# fail 0`, `0 skipped` (no regression to
`enforcement-hook.test.js`, `security-enforcement-evasion.test.js`,
`escape-phrases.test.js`). Coverage ≥ 80% on changed functions.

### Step 15: DOCUMENT
Update the JSDoc on `findEscapeInTranscript` to describe role-scoping and the
`tool_result` exclusion; the "Crude: read last ~5KB and grep" comment is removed.
Note the block-message change inline. No external docs affected.

### Step 16: FINAL-REVIEW
Verify every parent acceptance scenario for Defect 1 maps to a green test (see
mapping below); confirm no canonical phrase remains in the block message; hand to
Gate 3 (CTO Chief). Do NOT self-cross any gate.

## Acceptance Criteria Mapping (parent → this slice)

| Parent scenario | Test case |
|---|---|
| CTOC's own block message cannot self-unlock the next edit | 1, 4 |
| A `Read` of `CLAUDE.md` cannot unlock enforcement | 2 |
| A genuinely user-typed escape phrase still unlocks | 3, 6a |
| The block message no longer seeds its own unlock | 9, 10 |

## Decisions Taken Under Ambiguity

- **Transcript schema confirmed at PLAN (parent-mandated).** Verified against a
  live 14,300-line Claude Code transcript: user-typed content is a `type:"user"`
  entry with **string** content (or `text` blocks); `tool_result` blocks carry
  `role:"user"` too and MUST be excluded. The fix keys off `type:"user"` **and**
  excludes `tool_result`/non-`text` blocks — a strict refinement of the parent's
  "`role === 'user'`" shorthand, adopted because a pure role filter would leave the
  `Read`-of-`CLAUDE.md` and block-message bypasses open.
- **Block-message body extracted into `buildBlockMessage()`** so the content
  assertion runs in-process without triggering `process.exit(1)`. This is a
  test-enabling refactor, not a behavior change to the block signal (W01 owns the
  signal).
- **CRLF-safe line split (`/\r?\n/`)** adopted proactively so a Windows-checkout
  transcript parses identically — consistent with the vision's cross-platform
  workstream, at zero extra cost here.
