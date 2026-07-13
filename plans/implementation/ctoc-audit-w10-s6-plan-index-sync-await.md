---
title: "W10-s6 — PostToolUse awaits the plan-index sync before exit (index-sync no-op)"
type: feature
parent_plan: "ctoc-audit-w10-menu-taskplane"
depends_on: none
files:
  - src/hooks/PostToolUse.plan-index-sync.js
  - tests/w10-plan-index-sync-await.test.js
priority: MEDIUM
---

# W10-s6 — PostToolUse awaits the plan-index sync before exit (index-sync no-op)

**Parent:** `ctoc-audit-w10-menu-taskplane`. This is slice **(f)** — make the plan-index
sync actually run instead of being killed by an immediate `process.exit`. Independent (no
`depends_on`).

Fixes the parent's **7th verified defect**:
`src/hooks/PostToolUse.plan-index-sync.js:162-174` schedules the sync as a
deliberately-not-awaited microtask —
`Promise.resolve().then(() => syncUnit(...)).catch(logError)` — and the very next
statement is `process.exit(0)` (`:174`). Node drains the microtask queue only when the
current synchronous unit of work returns control to the event loop; `process.exit()`
terminates the process immediately, before that hand-off. The scheduled
`.then(() => syncUnit(...))` callback is therefore **never invoked** — not "eventually
lost", literally never executed. Effect: every downstream feature that reads the semantic
plan index (search, related-plans, dup-guard) operates on a stale index forever, with no
error anywhere. The stated intent (fail-open, never block the tool call) is sound; the
implementation defeats its own purpose.

## Implementation Details

### Architecture Decision (ADR)

**Context.** The hook must (per its own header, `:9-13`) (1) sync the just-written plan
into the index, (2) never throw to the user, (3) ALWAYS exit 0, (4) log any sync error.
Today it sacrifices (1) to guarantee (3) via a fire-and-forget microtask that
`process.exit` kills. The two goals are not actually in conflict: `main()` is already an
`async function` invoked as `main()` at `:179`, so it can `await` the sync and STILL exit
0 within a bounded time.

**Decision.** `await` the `syncUnit` promise (keeping its existing `.catch(logError)`
fail-open) BEFORE `process.exit(0)`. To honor "never block the tool call" for a
pathologically slow embedder, bound the await with a timeout race: `await
Promise.race([syncPromise, timeout(N ms)])` where the timeout resolves (never rejects) so
a slow sync degrades to "logged as timed out, exit 0" rather than hanging the tool flow.
Default N is generous enough for a single-unit embed (the hook syncs JUST the one written
plan, not the whole corpus) but finite.

**Why not keep fire-and-forget "but detached better".** There is no way to let a detached
microtask survive `process.exit`; the only correct fix is to await it (bounded) before
exiting. Awaiting is what makes acceptance scenario "the index already reflects the change
when the hook returns" true — which is the whole point of a PostToolUse sync.

### Dependency Graph (this slice)
```
src/hooks/PostToolUse.plan-index-sync.js  (MODIFY main(): await syncUnit before exit)
  └─ uses → ../lib/plan-index/sync-unit syncUnit  (UNCHANGED)
  └─ uses → ../lib/plan-index/wiring getWiring     (UNCHANGED)
  └─ behavior-tested-by → tests/w10-plan-index-sync-await.test.js (NEW)
```
No cycles. No dependency on other W10 slices. `syncUnit`/`wiring` are unchanged — the fix
is purely the await/exit ordering in the hook's `main()`.

### File Specifications

#### `src/hooks/PostToolUse.plan-index-sync.js` — MODIFY (`main()` only)
- Replace the fire-and-forget block (`:161-170`):
  ```
  // Fire-and-forget: do NOT await the embed; log any rejection.
  Promise.resolve()
    .then(() => syncUnit(fp, { … }))
    .catch((err) => logError(err));
  ```
  with an **awaited, bounded, fail-open** sync:
  ```
  // Await the sync so the index reflects the write before we exit — a bare
  // process.exit(0) kills an un-awaited microtask before it runs (the index-sync
  // no-op defect). Bounded by a timeout so a pathologically slow embed still never
  // blocks the tool flow; fail-open on both rejection and timeout (ALWAYS exit 0).
  const SYNC_BUDGET_MS = 2000;
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve('timeout'), SYNC_BUDGET_MS);
    timer.unref?.();
  });
  try {
    const outcome = await Promise.race([
      syncUnit(fp, {
        store: wiring.store,
        embedder: wiring.embedder,
        calibrationReady: wiring.calibrationReady,
        plansRoot,
        logDir
      }).then(() => 'synced', (err) => { logError(err); return 'error'; }),
      timeout
    ]);
    if (outcome === 'timeout') logError(new Error('plan-index sync exceeded ' + SYNC_BUDGET_MS + 'ms budget; exiting fail-open'));
  } finally {
    clearTimeout(timer);
  }
  ```
- Keep everything else in `main()` unchanged: the stdin read (`:145`), the `isPlanMd`
  no-op early exit (`:147`), the `resolveRootForPlan`/`loadWiring` fail-open early exits
  (`:153-156`), the outer `try/catch (err) { logError(err); }` (`:144/171-173`), and the
  terminal `process.exit(0)` (`:174`). The process still ALWAYS exits 0.
- `main` is already `async` (`:143`) and invoked at `:179` — no signature change needed.
  Do NOT modify `../lib/plan-index/sync-unit` or `../lib/plan-index/wiring`.

### Test Plan

#### `tests/w10-plan-index-sync-await.test.js` — CREATE (`node:test`)
The hook exports `isPlanMd` only; `main()` calls `process.exit`. Test at two levels: (A)
the pure ordering property in-process by exercising `main`'s awaited race with an injected
fake — OR, more robustly given `process.exit`, (B) spawn the hook as a subprocess with a
fake wiring module on the require path and assert the index write landed before exit. Use
the subprocess approach for the load-bearing cases (it exercises the real
`main()`+`process.exit` path). Every case is RED before this slice (the un-awaited
microtask never runs → the fake `syncUnit` is never called before exit) and GREEN after.

1. **Sync runs before exit (happy path — the core fix).** Spawn
   `node PostToolUse.plan-index-sync.js` with stdin
   `{ tool_input: { file_path: '<temp>/plans/functional/x.md' } }`, in a temp project
   whose `../lib/plan-index/wiring` resolves to a FAKE that records a call and writes a
   sentinel file (e.g. `.ctoc/state/_synced_marker`) from inside `syncUnit`. After the
   process exits, assert (a) exit code 0 AND (b) the sentinel file EXISTS — proving
   `syncUnit` ran before `process.exit`. Against current `main` this FAILS (sentinel
   absent — the microtask never ran).
2. **Non-plan path is a no-op (regression guard).** stdin
   `{ tool_input: { file_path: 'src/lib/foo.js' } }` → exit 0, no sentinel, `syncUnit`
   never invoked (`isPlanMd` early-return preserved).
3. **Sync rejection is logged, hook still exits 0 (edge case).** Fake wiring whose
   `syncUnit` rejects (embedder throws) → process exits 0 AND
   `.ctoc/logs/plan-index-sync.json` contains an entry with the error message (fail-open
   preserved — a sync failure never blocks the tool call).
4. **Slow sync times out but still exits 0 (bounded-await guard).** Fake `syncUnit` that
   never resolves (or resolves after > budget); run with a short injected budget → process
   exits 0 within a bounded time AND a "budget"/"timeout" entry is logged. *(If injecting
   the budget is impractical without a new seam, assert the process exits 0 within a
   generous wall-clock bound and that a never-resolving sync does not hang the process
   indefinitely.)*
5. **PI0 wiring absent → fail-open no-op (unchanged posture).** In a project where
   `../lib/plan-index/wiring` does not resolve, a plan-path write → exit 0, no throw
   (`loadWiring` returns null → early `process.exit(0)` at `:156`, unchanged).

*(The subprocess fixture sets up a temp dir with a stub `src/lib/plan-index/wiring.js`
and `sync-unit.js` on the hook's relative require path, or uses a `NODE_OPTIONS`/module
shim — chosen at Step 9 to avoid touching the real plan-index modules.)*

### Security Review
- [ ] **Fail-open preserved:** every path — sync success, sync rejection, timeout, absent
      wiring, non-plan path, top-level throw — ends in `process.exit(0)`. A sync problem
      can never block or fail a user's tool call (cases 2–5).
- [ ] **No unbounded wait:** the `Promise.race` with a finite, `unref`'d timeout means a
      hung embedder cannot hang the tool flow (case 4) — the DoS/hang surface the naive
      `await` would introduce is closed.
- [ ] **No new input trust:** the hook still reads only `tool_input.file_path` and gates
      it through the existing `isPlanMd` traversal check (`:33-40`, rejects `..`); the
      await change adds no new parsing of untrusted data.
- [ ] **Path anchoring unchanged:** `resolveRootForPlan`/`loadWiring` F1/F2 root-keying
      (`:77-115`) is untouched — the sync still keys against the plan's own project root.
- [ ] **Log growth bounded:** `logError` already caps the log at 500 entries
      (`:133`); timeout/error entries reuse it.

## Execution Plan

### Step 8: TEST
Write `tests/w10-plan-index-sync-await.test.js` FIRST (TDD red), asserting BEHAVIOR — "a
`Write` to a `plans/**/*.md` file means the index sync has RUN (sentinel present) by the
time the hook process exits", NOT "the promise was created". Cases 1–5 above, driving the
real hook as a subprocess with a fake wiring module. Run
`node --test tests/w10-plan-index-sync-await.test.js` and confirm case 1 is RED against
current `main` (the sentinel is absent — the un-awaited microtask never ran before
`process.exit`).

### Step 9: PREPARE
Re-read `src/hooks/PostToolUse.plan-index-sync.js:140-180` (`main` + the fire-and-forget
block + the terminal exit) and confirm `main` is `async` and `syncUnit` returns a promise.
Decide the subprocess fixture mechanism for injecting a fake `wiring`/`sync-unit` on the
hook's require path (temp project with stub modules, or a require shim) so the test never
touches the real plan-index modules. No new npm deps.

### Step 10: IMPLEMENT
ONE step, ordered sub-items:
(a) Replace the fire-and-forget `Promise.resolve().then(syncUnit).catch(logError)` block
with the awaited, timeout-bounded, fail-open race (per the File Specification), keeping the
`store/embedder/calibrationReady/plansRoot/logDir` payload identical.
(b) Leave every early-return, the outer try/catch, and the terminal `process.exit(0)`
unchanged.
(c) Run `node --test tests/w10-plan-index-sync-await.test.js` → green.

### Step 11: REVIEW
Self-review: `syncUnit` is now awaited before `process.exit`; the process ALWAYS exits 0
(success, rejection, timeout, absent wiring, non-plan, throw); the timeout is finite and
`unref`'d; the sync payload is byte-identical; `sync-unit.js`/`wiring.js` untouched.

### Step 12: OPTIMIZE
Confirm the hook syncs JUST the one written plan (single unit) so the awaited path is
cheap; the timeout budget is a safety net, not the expected path. `clearTimeout` in
`finally` prevents a dangling timer.

### Step 13: SECURE
Run the Security Review checklist. Confirm every branch exits 0 and the timeout closes the
hang surface (case 4). Grep the file for any remaining un-awaited `syncUnit` /
fire-and-forget pattern → none.

### Step 14: VERIFY
`node --test tests/w10-plan-index-sync-await.test.js` → `# fail 0`; then the FULL suite
`node --test tests/*.test.js` → `# fail 0`, 0 skipped. Check any existing
plan-index-sync hook test — the observable contract change is "the sync now runs before
exit"; reconcile any test that asserted the fire-and-forget non-await behavior (it encoded
the bug).

### Step 15: DOCUMENT
Update the hook's header comment (`:4-21`): it is no longer "fire-and-forget" — it now
AWAITS the single-unit sync (bounded by a timeout) before exit, still fail-open and still
ALWAYS exit 0. Fix the "FIRE-AND-FORGET" wording so the doc matches the code.

### Step 16: FINAL-REVIEW
Confirm: this slice edits only its two declared files; after a `plans/**/*.md` write the
index reflects the change by the time the hook exits (sentinel present); a sync rejection
and a sync timeout are each logged and still exit 0; a non-plan path and absent wiring are
still fail-open no-ops; `sync-unit.js`/`wiring.js` untouched; suite green, 0 skipped.

## Risk Mitigations

| Risk | Mitigation | Where |
|------|-----------|-------|
| A slow/hung embedder now blocks the tool flow (the reason it was fire-and-forget) | `Promise.race` with a finite `unref`'d timeout → degrades to "logged, exit 0"; case 4 guards it | Step 10(a) |
| Awaiting reintroduces a throw that blocks the tool | `syncUnit(...).then(ok, err→logError)` swallows rejection; outer try/catch + terminal exit 0 remain | Step 10 |
| An existing test asserted the non-awaited behavior | Full-suite VERIFY surfaces it; that test encoded the defect and is reconciled | Step 14 |
| Test fakery touches the real plan-index modules | Subprocess fixture injects stub `wiring`/`sync-unit` on the require path; real modules untouched | Step 9 |
