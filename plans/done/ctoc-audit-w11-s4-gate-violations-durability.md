---
approved_by: human
approved_at: 2026-07-13T20:53:25.168Z
gate_crossed: review → done
---

---
iron_loop: true
approved_by: human
approved_at: 2026-07-13T19:14:43.932Z
gate_crossed: implementation → todo
---

---
title: "W11-s4 — gate-violations.json durability: unify human-gate-check.js + violation-tracker.js on durable-log"
type: feature
parent_plan: "ctoc-audit-w11-state-durability-and-deadcode"
depends_on: ctoc-audit-w11-s1-durable-log
files:
  - src/hooks/human-gate-check.js
  - src/lib/violation-tracker.js
  - tests/gate-violations-durability.test.js
  - tests/governance-modules-b.test.js
priority: MEDIUM
created: "2026-07-13T00:00:00Z"
---

# W11-s4 — gate-violations.json durability

> SIP1 slice of `ctoc-audit-w11-state-durability-and-deadcode`. Cluster A. Findings:
> M14/M15 (`gate-violations.json`). Depends on s1 (`durable-log.js`).

## Implementation Details

### Architecture Decision (ADR)

`gate-violations.json` has **TWO independent writers**, each with the identical racy
read-modify-write and silent-reset `catch` (verified):
- `src/hooks/human-gate-check.js`: `loadViolations()` (line 33, `catch { /* ignore */ }`
  → `[]`), `saveViolations()` (line 42, whole-file write), `logViolation()` (line 47,
  load→push→save, no lock).
- `src/lib/violation-tracker.js`: `loadViolations()` (line 18, `JSON.parse(readFileSync)`),
  `saveViolations()` (line 27), `logViolation()` (line 32) — same shape, plus
  `getUnacknowledgedViolations`, `markResolved`, `acknowledge`, `getLastAck`.

Because both write the SAME file, they MUST convert together — if only one switched to
JSONL, the other's whole-file `JSON.parse` would break reading the other's output. So this
slice rewires BOTH onto s1's `durable-log` (append for writes, `readEntries` for reads),
which also removes the duplicated store logic (DRY). Both keep returning Arrays, so
`getUnacknowledgedViolations`/`markResolved`/the dashboard are unaffected.

**Consumer check (verified):** `src/areas/system.js` only calls `fileSize()` on
`gate-violations.json` (no parse) — unaffected. No other raw parser exists in `src/`.

**`markResolved`/`acknowledge` subtlety:** `violation-tracker.markResolved(planName)`
currently mutates entries in place and re-writes the whole array. Under append-only JSONL,
a "resolve" is modeled as an appended state record OR a full atomic rewrite. Keep it simple
and correct: `markResolved`/`acknowledge` read all entries (`readEntries`), apply the
mutation in memory, and rewrite atomically via a `durable-log` rewrite helper (or
`safeFs.writeFileSync` of JSONL through a temp+rename). These are low-frequency,
human-driven ops — an atomic full rewrite is acceptable; only the high-frequency
`logViolation` append must be the lossless O_APPEND path. Document this split.

### Dependency Graph
```
src/hooks/human-gate-check.js   ┐
src/lib/violation-tracker.js    ┴─ both require: ./durable-log [s1] (../lib/durable-log
                                   from the hook), ./safe-fs, path
tests/gate-violations-durability.test.js → concurrency across the shared file
tests/governance-modules-b.test.js       → existing violation-tracker round-trip tests (lines 652-732)
```

### File Specifications

#### `src/hooks/human-gate-check.js` — MODIFY
- `loadViolations()` → `return durableLog.readEntries(VIOLATIONS_FILE)`.
- `logViolation(entry)` → `durableLog.appendEntry(VIOLATIONS_FILE, entry, { maxEntries: 100 })`
  (preserve the current "keep last 100" cap; today it splices to 100 at line 51-53).
- Remove the now-dead `saveViolations` if nothing else calls it (grep within the file).
- `require('../lib/durable-log')`. Everything else (revert loop, `hasApprovalMarker`,
  `main`) unchanged — this slice touches ONLY the violation store.

#### `src/lib/violation-tracker.js` — MODIFY
- `loadViolations()` → `durableLog.readEntries(VIOLATIONS_FILE)`.
- `logViolation(v)` → `durableLog.appendEntry(VIOLATIONS_FILE, v, { maxEntries: 100 })`
  (preserve the documented "last 100" cap — see `governance-modules-b.test.js` line 709
  "caps history at the documented last 100 entries").
- `markResolved`/`acknowledge`: read via `readEntries`, mutate in memory, rewrite atomically
  (temp+rename JSONL). `getUnacknowledgedViolations`/`getLastAck` unchanged (array-based).

### Test Plan
`tests/gate-violations-durability.test.js` (CREATE, TDD-first):
1. **Concurrency across BOTH writers (success-metric #3):** seed N violations; race two
   appends — one via `violation-tracker.logViolation`, one via `human-gate-check`'s
   `logViolation` path (or two forks each calling `violation-tracker.logViolation`) — assert
   `readEntries(gate-violations.json).length === N + 2`. RED on main.
2. **Corrupt file quarantined:** pre-write garbage; `logViolation`; assert `*.corrupt-*`
   sibling + one fresh entry.
3. **Cross-writer format agreement:** write one entry via `violation-tracker.logViolation`,
   read it back via `human-gate-check.loadViolations` (and vice versa) — both see the same
   entry (proves both use the same JSONL format).

`tests/governance-modules-b.test.js` (MODIFY): the existing violation-tracker round-trip and
"last 100 cap" tests (lines 688-732) must stay green against the new implementation; update
only if they raw-parsed the file (they use the tracker API, so likely no change — verify).

### Security Review
- [x] `gate-violations.json` is safety-critical audit evidence. Quarantine-not-reset is a
      direct security improvement (a truncated file no longer erases the violation history).
- [x] `maxEntries: 100` cap preserved (no unbounded growth).
- [x] No approval/gate logic changed — this slice is storage-only; the revert loop and
      `hasApprovalMarker` are untouched (per parent Out-of-Scope: W2 owns gate machinery).

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write `tests/gate-violations-durability.test.js` (3 tests). Run — concurrency + cross-
      writer + quarantine fail on current `main`. Confirm `governance-modules-b.test.js`
      still green (pre-change baseline).

### Step 9: PREPARE
- [x] Pre-flight: touched files == `files:`. Confirm s1 present. Grep both modules for every
      `saveViolations`/`loadViolations`/`logViolation` call site so none is missed.

### Step 10: IMPLEMENT
- [x] `src/hooks/human-gate-check.js`: rewire load/log onto durable-log (`maxEntries:100`).
- [x] `src/lib/violation-tracker.js`: rewire load/log onto durable-log; `markResolved`/
      `acknowledge` do a read-mutate-atomic-rewrite. No stubs.

### Step 11: REVIEW
- [x] Confirm BOTH writers use the identical JSONL format; `getUnacknowledgedViolations`/
      `markResolved` still return/operate on arrays; `system.js` fileSize path unaffected.

### Step 12: OPTIMIZE
- [x] Ensure the high-frequency `logViolation` is a pure append; only human-driven
      resolve/ack does a full rewrite.

### Step 13: SECURE
- [x] Security checklist above; verify the revert loop and approval-marker logic are byte-for-
      byte unchanged.

### Step 14: VERIFY
- [x] `node --test tests/gate-violations-durability.test.js tests/governance-modules-b.test.js` — `# fail 0`.
- [x] `node --test tests/*.test.js` — `# fail 0`. Coverage ≥ 80% on changed lines.

### Step 15: DOCUMENT
- [x] Note in both module headers that the gate-violations store is append-only JSONL via
      durable-log, shared by both writers.

### Step 16: FINAL-REVIEW
- [x] Gate 3 (batched per parent).

## Decisions Taken Under Ambiguity
- **Both writers convert in ONE slice** — they share the on-disk file; converting one alone
  would break the other's reads. This is why the slice touches two source files (forced
  cohesion, not scope creep).
- **Append for `logViolation`, atomic full-rewrite for `markResolved`/`acknowledge`** — the
  hot path stays lossless; the rare human-driven state mutation uses temp+rename.
- **Storage-only** — no change to the revert loop or `hasApprovalMarker` (W2 owns gate
  machinery, per parent Out-of-Scope).
