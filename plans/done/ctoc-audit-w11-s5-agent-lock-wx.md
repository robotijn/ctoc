---
approved_by: human
approved_at: 2026-07-13T20:53:25.191Z
gate_crossed: review → done
---

---
iron_loop: true
approved_by: human
approved_at: 2026-07-13T19:14:43.834Z
gate_crossed: implementation → todo
---

---
title: "W11-s5 — agent-lock.js: wx exclusive-create + owner token, stale recovery preserved"
type: feature
parent_plan: "ctoc-audit-w11-state-durability-and-deadcode"
depends_on: none
files:
  - src/lib/agent-lock.js
  - tests/agent-lock.test.js
priority: MEDIUM
created: "2026-07-13T00:00:00Z"
---

# W11-s5 — exclusive agent lock

> SIP1 slice of `ctoc-audit-w11-state-durability-and-deadcode`. Cluster A. Finding: M2.
> Independent (no dependency).

## Implementation Details

### Architecture Decision (ADR)

`src/lib/agent-lock.js` `acquireLock()` (line 78) is check-then-act (TOCTOU): it
`readLock()`s to check for a live lock (lines 80-92) and only *after* the check does a
plain `safeFs.writeFileSync(lockPath, ...)` (line 102) — no `wx` (exclusive-create) flag,
no owner-token compare-and-swap. Two `startAgent` calls (separate processes) can both pass
the "no live lock" check before either writes → both "acquire" (parent §M2), violating the
single-agent-execution guarantee.

**Fix:** make the WRITE the point of exclusivity, not the check. Attempt an exclusive-create
`safeFs.writeFileSync(lockPath, data, { flag: 'wx' })` — atomic create-or-fail (`EEXIST`).
The `agentId` (already a `crypto.randomUUID()`) is the **owner token**, written into the
lock. On `EEXIST`, read the existing lock: if its PID is alive → return
`{ acquired:false, error:'Agent already active…', existingLock }`; if the PID is dead
(stale) → unlink and retry the `wx` create ONCE (preserving the existing stale-lock
recovery). `releaseLock`/`updateLockPlan` gain an OPTIONAL owner-token argument for a
compare-and-swap (only unlink/mutate if the on-disk `agentId` matches, or the token is
omitted — backward compatible with current call sites).

**Why `wx` fixes the same-process test too:** within one process, two synchronous
`acquireLock` calls — the first creates the file (pid = self, alive); the second's `wx`
throws `EEXIST`, reads the lock, sees its own live PID → returns `acquired:false`. Exactly
one acquires, deterministically. The load-bearing RED test neutralizes the *check* (stubs
`readLock` to return `null` for both, simulating the TOCTOU window) and proves the WRITE is
what enforces exclusivity: on current `main` (plain write) both writes succeed → both
acquire → test asserts exactly-one → FAILS; with `wx` the second write throws → one acquires
→ PASSES.

### Dependency Graph
```
src/lib/agent-lock.js → requires: ./safe-fs (writeFileSync w/ {flag:'wx'}, unlinkSync,
                                   existsSync), path, crypto. No new deps.
tests/agent-lock.test.js → requires ../src/lib/agent-lock, node:child_process (race)
```

### File Specifications

#### `src/lib/agent-lock.js` — MODIFY
- `acquireLock(projectPath, planName)`:
  - Build `lockData = { pid: process.pid, agentId: crypto.randomUUID(), plan: planName, startedAt: ISO }`.
  - `try { safeFs.writeFileSync(lockPath, JSON.stringify(lockData, null, 2), { flag: 'wx' }); return { acquired:true, agentId: lockData.agentId }; }`
  - `catch (e)`: if `e.code === 'EEXIST'`: `const existing = readLock(projectPath);`
    - `existing && isPidAlive(existing.pid)` → `return { acquired:false, error:\`Agent already active (PID ${existing.pid}, working on "${existing.plan}")\`, existingLock: existing };`
    - else (stale or unreadable) → `try { safeFs.unlinkSync(lockPath); } catch {}` then retry
      the `wx` create ONCE; on second EEXIST return `acquired:false` with the existing lock.
    - non-EEXIST errors → rethrow (fail loud).
- `releaseLock(projectPath, ownerToken?)`: if `ownerToken` provided, read the lock and only
  unlink when `lock.agentId === ownerToken` (CAS); if omitted, current unconditional unlink
  (back-compat). Keep the stop-file unlink.
- `updateLockPlan(projectPath, planName, ownerToken?)`: same optional CAS guard.
- `readLock`, `isLocked`, `isPidAlive`, stop-file helpers unchanged.

### Test Plan — `tests/agent-lock.test.js` (MODIFY: add; keep existing green)
1. **Exclusive under simulated race (M2 core, deterministic RED):** stub/spy `readLock` to
   return `null`, then call `acquireLock` twice for the same dir without releasing; assert
   exactly one `{acquired:true}` and the other `{acquired:false}`. On current `main` both are
   true → RED.
2. **True cross-process race (honest concurrency):** `fork` two child processes that both
   `acquireLock` the same dir at a barrier; assert exactly one prints `acquired:true`.
3. **Distinct owner token:** the acquiring call returns a non-empty `agentId`; a second
   acquire attempt while held returns `acquired:false` and does NOT overwrite the token.
4. **Stale lock reclaimable (regression guard, parent edge case):** seed a lock file with a
   dead PID (e.g. an unused high PID that `isPidAlive` reports false); `acquireLock` succeeds
   and replaces it. MUST stay green (the `wx` fix must not regress stale recovery).
5. **CAS release:** `releaseLock(dir, wrongToken)` does NOT remove a lock owned by a different
   token; `releaseLock(dir, correctToken)` (or no token) does.

### Security Review
- [x] The lock is the mechanism that enforces sequential-plan execution — a security/
      correctness control. `wx` closes the double-acquire hole.
- [x] Owner-token CAS on release prevents a foreign/stale caller from releasing another
      agent's lock.
- [x] `isPidAlive` on Windows shells out to `tasklist` with an integer PID (no string
      interpolation of untrusted data) — unchanged, already safe.
- [x] Fail loud on non-EEXIST fs errors (no silent acquire on a broken filesystem).

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Add tests 1-5 to `tests/agent-lock.test.js`. Run — test 1 (simulated race) and test 3
      (token not overwritten) fail on current `main`; test 4 (stale recovery) passes now and
      must stay passing.

### Step 9: PREPARE
- [x] Pre-flight: touched files == `files:`. Confirm `safe-fs.writeFileSync` forwards the
      `{flag:'wx'}` options object (it does — `options` param passthrough).

### Step 10: IMPLEMENT
- [x] `src/lib/agent-lock.js`: rewrite `acquireLock` to wx-create-then-handle-EEXIST with
      stale retry; add optional owner-token CAS to `releaseLock`/`updateLockPlan`. No stubs.

### Step 11: REVIEW
- [x] Confirm existing callers of `releaseLock`/`updateLockPlan` still work (optional arg is
      back-compat); stale recovery preserved.

### Step 12: OPTIMIZE
- [x] N/A (single exclusive-create write).

### Step 13: SECURE
- [x] Security checklist above.

### Step 14: VERIFY
- [x] `node --test tests/agent-lock.test.js` — `# fail 0`.
- [x] `node --test tests/*.test.js` — `# fail 0`. Coverage ≥ 80% on changed lines.

### Step 15: DOCUMENT
- [x] Update the module header (exclusive-create `wx`, owner token, CAS release).

### Step 16: FINAL-REVIEW
- [x] Gate 3 (batched per parent).

## Decisions Taken Under Ambiguity
- **Exclusivity at the write (`wx`), not the check** — removes the TOCTOU at its root.
- **`agentId` (existing UUID) IS the owner token** — no new field; add CAS on release as an
  OPTIONAL arg to stay backward-compatible with current call sites.
- **Retry-once on stale EEXIST** — preserves the existing dead-PID reclamation the parent
  flagged as a regression risk.
