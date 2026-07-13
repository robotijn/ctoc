---
approved_by: human
approved_at: 2026-07-13T20:53:25.098Z
gate_crossed: review → done
---

---
iron_loop: true
approved_by: human
approved_at: 2026-07-13T19:14:43.810Z
gate_crossed: implementation → todo
---

---
title: "W11-s1 — durable-log.js: atomic append-only JSONL primitive + corrupt-file quarantine"
type: feature
parent_plan: "ctoc-audit-w11-state-durability-and-deadcode"
depends_on: none
files:
  - src/lib/durable-log.js
  - tests/durable-log.test.js
priority: MEDIUM
created: "2026-07-13T00:00:00Z"
---

# W11-s1 — durable-log.js (shared durability primitive)

> SIP1 slice of `ctoc-audit-w11-state-durability-and-deadcode`. Cluster A (durability).
> This is the FOUNDATION slice: s2, s3, s4 depend on it. Findings: M1/M14/M15 (the
> mechanism the three audit logs will consume).

## Implementation Details

### Architecture Decision (ADR)

**Context.** Three audit logs (`enforcement.json`, `transitions.json`,
`gate-violations.json`) each independently implement the same racy read-modify-write:
`JSON.parse(readFileSync(whole))` → `push` → `writeFileSync(whole)`, with a `catch`
that resets to `[]`. Two concurrent writers (each a separate hook process) both read
`[N]`, both push, both write `[N+1]` → one entry lost. A corrupt/truncated file resets
to `[]` → whole history lost. (Parent plan §Current State, M1/M14/M15.)

**Decision.** Implement the durability mechanism ONCE as a shared module
`src/lib/durable-log.js` (append-only JSONL), consumed by all three logs (s2/s3/s4).
Implementing it three times would be a duplicate-code smell. The parent's "Decisions
Taken Under Ambiguity" recommends append-only JSONL over temp+rename precisely because
each append is a single `O_APPEND` `write(2)` with **no read-modify-write step at all**
— removing the race at its root rather than narrowing the window.

**Chosen storage:** one JSON object per line (`JSON.stringify(entry) + '\n'`), appended
via `safeFs.appendFileSync` (which opens with `O_APPEND`; concurrent appends of
whole-line records on local filesystems do not interleave). `safe-fs.js` already exports
`appendFileSync`, `renameSync`, `openSync`, and `writeFileSync` with an options arg — no
new fs primitive is needed.

**Read API returns an array** (`readEntries` → `Array`), so every existing consumer that
expects an array keeps working after s2/s3/s4 rewire — the on-disk format changes, the
in-memory contract does not.

**Legacy compatibility (migration).** Existing files on disk are JSON arrays (`[ ... ]`).
`readEntries` returns a legacy array as-is; `appendEntry` migrates a legacy-array file to
JSONL once (atomic temp+rename) before its first append, so the file never ends up a
mixed array+JSONL hybrid that neither parser can read.

**Quarantine, not reset (M1).** When `appendEntry` finds the existing file is wholly
unparseable (neither a JSON array nor any parseable JSONL line, yet non-empty), it renames
the corrupt file aside to `<path>.corrupt-<ISO8601-with-safe-chars>` (bytes preserved) and
starts a fresh log containing only the new record — instead of silently overwriting.

**Rotation** preserved via optional `maxEntries`: after an append, if the line count
exceeds `maxEntries`, rewrite the file to the last `maxEntries` lines via atomic
temp+rename (rare boundary op; the common append path stays a pure `O_APPEND`).

### Dependency Graph

```
src/lib/durable-log.js
  └─ requires: ./safe-fs (appendFileSync, readFileSync, writeFileSync, renameSync,
                          existsSync, mkdirSync), path
  └─ required by (LATER slices, not this one): enforcement-log.js (s2),
                          transition-log.js (s3), human-gate-check.js + violation-tracker.js (s4)
tests/durable-log.test.js
  └─ requires: node:test, node:assert, node:child_process (concurrency), os, fs, path,
               ../src/lib/durable-log
```
No cycles. This slice introduces a leaf module + its test only.

### File Specifications

#### `src/lib/durable-log.js` — CREATE

Exports:

- `appendEntry(logPath: string, entry: object, options?: { maxEntries?: number }) -> object`
  - Ensures `path.dirname(logPath)` exists (`mkdirSync {recursive}`).
  - If file exists: call internal `classify(raw)`:
    - `'legacy-array'` → migrate to JSONL (write each element as a line via atomic
      temp+rename) then fall through to append.
    - `'jsonl'` (or empty/whitespace/absent) → append directly.
    - `'corrupt'` (non-empty, not a JSON array, zero JSONL lines parse) → quarantine:
      `renameSync(logPath, quarantinePath(logPath))`; then create fresh.
  - Append `JSON.stringify(entry) + '\n'` via `safeFs.appendFileSync`.
  - If `options.maxEntries` and resulting line count > maxEntries → rewrite last
    maxEntries lines atomically (temp path = `logPath + '.tmp-' + process.pid`, write,
    `renameSync` over original).
  - Returns the appended `entry` object.
  - Throws only on unrecoverable fs errors (never silently swallows — fail loud).
- `readEntries(logPath: string) -> Array`
  - Missing file → `[]`.
  - Whole-file `JSON.parse` yields an Array → return it (legacy fast path).
  - Else split on `/\r?\n/`, `JSON.parse` each non-empty line inside try/catch, collect
    the ones that parse, skip a torn/invalid line (do NOT discard the whole file).
  - Wholly-unparseable non-empty file → `[]` (the next `appendEntry` quarantines it).
- `quarantinePath(logPath: string, when?: Date) -> string`
  - Returns `logPath + '.corrupt-' + isoSafe(when||now)` where `isoSafe` replaces `:` with
    `-` for cross-platform (Windows) filename safety.

Cross-platform: `path.join`/`path.dirname` only; temp names include `process.pid`; no
POSIX-only calls.

### Test Plan — `tests/durable-log.test.js` (CREATE, TDD-first)

Framework `node:test`. Each test uses a fresh `os.tmpdir()` sandbox dir; cleanup in
`afterEach`. Behavior-level assertions (drive the mechanism, not the shape):

1. **Concurrency — no lost update (M1/M14/M15 core).** Seed a JSONL file with N entries.
   `fork` two tiny child processes (inline script via `child_process.execFileSync` of a
   `-e` snippet, or a fixture script) that each `appendEntry` one record to the SAME path,
   started without awaiting between them. After both exit, `readEntries(path).length` ===
   `N + 2`. (This is the load-bearing race test; O_APPEND makes it pass.)
2. **Sequential bulk — never loses.** Append 500 entries in a loop; `readEntries().length`
   === 500; first and last payloads intact.
3. **Corrupt file quarantined, not reset (M1).** Write `'{ this is not json'` to the path.
   `appendEntry(path, {a:1})`. Assert: (a) a `*.corrupt-*` sibling exists AND contains the
   original corrupt bytes; (b) `readEntries(path)` === `[{a:1}]` (fresh log, only new
   record).
4. **Legacy JSON-array file is read and migrated.** Write `JSON.stringify([{x:1},{x:2}])`.
   `readEntries` === `[{x:1},{x:2}]`. Then `appendEntry(path,{x:3})`; `readEntries` ===
   `[{x:1},{x:2},{x:3}]`; file is now JSONL (3 lines).
5. **Torn trailing line is skipped, prior entries survive.** Write two valid JSONL lines +
   a half-written third line (no newline, truncated JSON). `readEntries().length` === 2.
6. **Rotation honors maxEntries.** Append 10 with `{maxEntries:5}`; `readEntries().length`
   === 5 and holds the last 5.
7. **Missing file → `[]`; missing parent dir is created on append.**

Coverage target ≥ 80% lines/branches on the new module; every throw/catch exercised.

### Security Review

- [x] Path handling: `logPath` is caller-supplied (internal callers only, computed paths);
      routed through `safe-fs` which validates non-empty + no NUL. No user-web input.
- [x] Quarantine rename stays in the same directory (no traversal); name derived from the
      original path + timestamp only.
- [x] No `JSON.parse` of a whole untrusted file without try/catch (corrupt → quarantine).
- [x] No secrets logged; entries are caller-provided audit records.
- [x] Temp file names include `process.pid` to avoid cross-process temp collisions.

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write `tests/durable-log.test.js` with the 7 behavior tests above. Run — all fail
      (module does not exist yet). The concurrency test (test 1) and quarantine test
      (test 3) are the load-bearing red tests.

### Step 9: PREPARE
- [x] **Pre-flight:** confirm every file touched is in this slice's `files:` list
      (`src/lib/durable-log.js`, `tests/durable-log.test.js`) — nothing else.
- [x] Confirm `safe-fs.js` exports `appendFileSync`, `renameSync`, `writeFileSync`
      (verified present) — no new dependency.

### Step 10: IMPLEMENT
- [x] `src/lib/durable-log.js`: implement `appendEntry`, `readEntries`, `quarantinePath`
      and internal `classify` per the File Specification. Append path = single
      `safeFs.appendFileSync`. Migration + rotation via atomic temp+rename. No stubs; log
      any ambiguity decision to `## Decisions Taken Under Ambiguity`.

### Step 11: REVIEW
- [x] Self-review: common append path is a pure `O_APPEND` (no read-modify-write). Read API
      returns an Array for all three format states (legacy array / JSONL / mixed-migrated).
      Quarantine preserves bytes.

### Step 12: OPTIMIZE
- [x] Confirm no whole-file read on the hot append path except the one-time legacy
      migration and the rare rotation boundary.

### Step 13: SECURE
- [x] Security checklist above; verify quarantine cannot escape the log directory and every
      `JSON.parse` is guarded.

### Step 14: VERIFY
- [x] `node --test tests/durable-log.test.js` — `# fail 0`.
- [x] `node --test tests/*.test.js` — `# fail 0` (no regressions).
- [x] Coverage ≥ 80% on `src/lib/durable-log.js`.

### Step 15: DOCUMENT
- [x] JSDoc on every export. No CLAUDE.md change (internal primitive) unless the executor
      judges a one-line mention warranted.

### Step 16: FINAL-REVIEW
- [x] Gate 3 human review (batched per parent via `approveSubplans`).

## Decisions Taken Under Ambiguity
- **Append-only JSONL over temp+rename** — per the parent's recommendation; single write
  syscall per entry, no read-modify-write, graceful torn-write handling. Acceptance
  criteria are behavior-level so this satisfies them.
- **Shared primitive over 3× inline fixes** — DRY; the three logs consume one tested module.
- **Read API returns an Array** — preserves every existing consumer's contract while the
  on-disk format changes.
