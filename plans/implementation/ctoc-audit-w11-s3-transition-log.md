---
title: "W11-s3 — transition-log.js: lossless append via durable-log (readLog unchanged)"
type: feature
parent_plan: "ctoc-audit-w11-state-durability-and-deadcode"
depends_on: ctoc-audit-w11-s1-durable-log
files:
  - src/lib/transition-log.js
  - tests/transition-log.test.js
priority: MEDIUM
created: "2026-07-13T00:00:00Z"
---

# W11-s3 — transition-log.js durability

> SIP1 slice of `ctoc-audit-w11-state-durability-and-deadcode`. Cluster A. Findings:
> M14/M15 (`transitions.json`). Depends on s1 (`durable-log.js`).

## Implementation Details

### Architecture Decision (ADR)

`src/lib/transition-log.js`: `readLog()` (line 40) `catch`es any parse error and returns
`[]` (line 48); `logTransition()` (line 66) does read-whole (`readLog`) → push → write-whole
(`writeFileSync`, line 84) with no lock — the same lossless-under-crash gap (parent
§M14/M15). This is the **cleanest** log to convert: `readLog`/`getTransitionsForPlan`/
`getRecentTransitions` already return arrays and are the ONLY read path consumers use
(verified: `tests/transition-log.test.js` reads via `transitionLog.readLog`, never a raw
`JSON.parse`). So converting the internals to `durable-log` while keeping `readLog`
returning an Array leaves every consumer and existing test untouched.

### Dependency Graph
```
src/lib/transition-log.js
  └─ requires: ./durable-log [s1], ./safe-fs, ./project-root (findProjectRoot), path
tests/transition-log.test.js → requires ../src/lib/transition-log (via readLog API)
```

### File Specifications

#### `src/lib/transition-log.js` — MODIFY
- `readLog(projectPath)` → `return durableLog.readEntries(getLogPath(projectPath))`.
  (Keeps the "empty array when no log" behavior — durable-log returns `[]` for missing.)
- `logTransition(entry, projectPath)` → build `logEntry` exactly as today (timestamp, plan,
  from, to, actor||'human', validation||null, humanGate||false, marker||false), then
  `durableLog.appendEntry(getLogPath(projectPath), logEntry)` (no `maxEntries` — transitions
  are uncapped today; preserve that). Keep `ensureLogFile` OR drop it (durable-log creates
  the dir); if kept, it must not pre-seed `'[]'` in a way that fights JSONL — prefer
  removing the `'[]'` seed and letting durable-log own creation. Return `logEntry` (unchanged
  contract).
- `getTransitionsForPlan`, `getRecentTransitions`, `getLogPath` unchanged.

### Test Plan — `tests/transition-log.test.js` (MODIFY: add durability tests; keep existing)
Existing tests read via `readLog` and stay green. ADD:
1. **Concurrency (success-metric #3):** seed N transitions, race two `logTransition` writes
   (two child_process forks), assert `readLog(dir).length === N + 2`. RED on main.
2. **Corrupt file quarantined:** pre-write `'nope'` to `transitions.json`; `logTransition`;
   assert `*.corrupt-*` sibling holds `'nope'` and `readLog` returns one fresh entry.
3. **Legacy array read:** pre-write a legacy `JSON.stringify([{...}])`; `readLog` returns it;
   next `logTransition` migrates + appends (length grows by 1).

### Security Review
- [ ] No new inputs; `projectPath` semantics unchanged. Quarantine preserves audit evidence.
- [ ] `readLog` never throws on corrupt input (delegates to durable-log's guarded read).

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [ ] Add the 3 durability tests to `tests/transition-log.test.js`. Run — concurrency +
      quarantine fail on current `main`; existing readLog-based tests still pass.

### Step 9: PREPARE
- [ ] Pre-flight: touched files == `files:`. Confirm s1 present.

### Step 10: IMPLEMENT
- [ ] `src/lib/transition-log.js`: point `readLog` at `durableLog.readEntries`; point
      `logTransition` at `durableLog.appendEntry`; drop the `'[]'` seed in `ensureLogFile`
      (or remove `ensureLogFile`). Preserve every return-value contract.

### Step 11: REVIEW
- [ ] Confirm `getTransitionsForPlan`/`getRecentTransitions` still return arrays; no consumer
      raw-parses `transitions.json`.

### Step 12: OPTIMIZE
- [ ] N/A.

### Step 13: SECURE
- [ ] Security checklist above.

### Step 14: VERIFY
- [ ] `node --test tests/transition-log.test.js` — `# fail 0`.
- [ ] `node --test tests/*.test.js` — `# fail 0`. Coverage ≥ 80% on changed lines.

### Step 15: DOCUMENT
- [ ] Update the module header ("append-only JSONL via durable-log").

### Step 16: FINAL-REVIEW
- [ ] Gate 3 (batched per parent).

## Decisions Taken Under Ambiguity
- **Keep `readLog` returning an Array** — the whole reason this log converts cleanly; the
  format change stays invisible to consumers.
- **Uncapped (no `maxEntries`)** — preserves current transitions-log behavior.
- **Remove the `'[]'` seed** so the file is JSONL from creation (durable-log owns creation).
