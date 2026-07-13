---
title: "W11-s2 — enforcement-log.js: lossless append via durable-log"
type: feature
parent_plan: "ctoc-audit-w11-state-durability-and-deadcode"
depends_on: ctoc-audit-w11-s1-durable-log
files:
  - src/lib/enforcement-log.js
  - tests/enforcement-log.test.js
  - tests/enforcement-hook.test.js
priority: MEDIUM
created: "2026-07-13T00:00:00Z"
---

# W11-s2 — enforcement-log.js durability

> SIP1 slice of `ctoc-audit-w11-state-durability-and-deadcode`. Cluster A. Finding: M1
> (`enforcement.json`). Depends on s1 (`durable-log.js`).

## Implementation Details

### Architecture Decision (ADR)

`src/lib/enforcement-log.js` `logEnforcement()` (line 21) reads the whole
`enforcement.json`, `JSON.parse` with `catch { log = []; }` (line 28), pushes, writes the
whole array back (line 38) — racy + history-losing (parent §M1). Rewire it onto the s1
`durable-log` primitive: append becomes a single lossless `O_APPEND` line; corrupt files
are quarantined, not reset. Preserve the existing `MAX_ENTRIES = 1000` cap by passing
`{ maxEntries: 1000 }`. The only current export is `logEnforcement`; add a `readLog(root)`
export so tests and any future consumer read via the module (not a raw parse).

**Consumer check (verified):** the only code that touches `enforcement.json` besides this
module is `src/areas/system.js`, which calls `fileSize()` (byte size for display) and does
NOT parse it — so it is unaffected by the JSON-array → JSONL format change. The only raw
parser is `tests/enforcement-hook.test.js` (below), updated in this slice.

### Dependency Graph
```
src/lib/enforcement-log.js
  └─ requires: ./durable-log (appendEntry, readEntries) [from s1], ./safe-fs (dir ensure), path
tests/enforcement-log.test.js  → requires ../src/lib/enforcement-log
tests/enforcement-hook.test.js → its raw JSON.parse read updated to enforcement-log.readLog
```

### File Specifications

#### `src/lib/enforcement-log.js` — MODIFY
- Keep signature `logEnforcement(entry, root)`. Replace the body's read-modify-write with:
  `durableLog.appendEntry(logPath, { timestamp: new Date().toISOString(), ...entry }, { maxEntries: MAX_ENTRIES })`.
  Keep the `logDir` ensure and `logPath = <root>/.ctoc/logs/enforcement.json`.
- ADD export `readLog(root) -> Array` = `durableLog.readEntries(logPath)`.
- `module.exports = { logEnforcement, readLog }`.

#### `tests/enforcement-hook.test.js` — MODIFY (format-read only)
- Lines ~134 and ~149 currently do `JSON.parse(fs.readFileSync(enforcement.json))` and
  assert on the array. Replace those raw reads with
  `require('../src/lib/enforcement-log').readLog(root)` (returns the array). The assertions
  on entry contents/order stay identical. Do NOT change what the hook tests otherwise.

### Test Plan — `tests/enforcement-log.test.js` (CREATE, TDD-first)
1. **Concurrency (M1 / success-metric #3):** seed N entries, race two `logEnforcement`
   writes (two `child_process` forks of a snippet calling `logEnforcement`), assert
   `readLog(root).length === N + 2`. RED on current main (read-modify-write loses one).
2. **Corrupt file quarantined, not reset:** pre-write `'garbage{'` to `enforcement.json`;
   `logEnforcement({tool:'Edit',outcome:'allow'}, root)`; assert a `*.corrupt-*` sibling
   holds the garbage AND `readLog` === one fresh entry.
3. **Rotation:** append 1005 entries; `readLog().length === 1000` (last 1000).
4. **Round-trip:** `logEnforcement` then `readLog` returns the entry with its `timestamp`.

### Security Review
- [ ] No new path inputs; `root` is the project root as today. Delegates path safety to
      safe-fs via durable-log.
- [ ] `enforcement.json` may be attacker-influenced only by a local process already inside
      the repo; quarantine (not reset) preserves evidence — a security improvement.

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [ ] Write `tests/enforcement-log.test.js` (4 tests above); update the two raw-parse reads
      in `tests/enforcement-hook.test.js` to `readLog`. Run — concurrency + quarantine tests
      fail on current `main`.

### Step 9: PREPARE
- [ ] Pre-flight: touched files == `files:` (enforcement-log.js, enforcement-log.test.js,
      enforcement-hook.test.js). Confirm s1 (`durable-log.js`) is present/merged first.

### Step 10: IMPLEMENT
- [ ] `src/lib/enforcement-log.js`: rewire `logEnforcement` onto `durableLog.appendEntry`
      with `{maxEntries: 1000}`; add `readLog`. Update exports.

### Step 11: REVIEW
- [ ] Confirm `system.js` (fileSize only) is unaffected; no other raw reader of
      `enforcement.json` exists in `src/`.

### Step 12: OPTIMIZE
- [ ] N/A beyond the primitive (append is O(1) amortized).

### Step 13: SECURE
- [ ] Security checklist above.

### Step 14: VERIFY
- [ ] `node --test tests/enforcement-log.test.js tests/enforcement-hook.test.js` — `# fail 0`.
- [ ] `node --test tests/*.test.js` — `# fail 0`. Coverage ≥ 80% on changed lines.

### Step 15: DOCUMENT
- [ ] Update the module header comment ("append-only JSONL via durable-log; corrupt files
      quarantined").

### Step 16: FINAL-REVIEW
- [ ] Gate 3 (batched per parent).

## Decisions Taken Under Ambiguity
- **Add `readLog` export** rather than let tests raw-parse the file — decouples callers from
  the on-disk format so a future format change is invisible to them.
- **Keep `MAX_ENTRIES = 1000`** semantics via `durable-log`'s `maxEntries`.
