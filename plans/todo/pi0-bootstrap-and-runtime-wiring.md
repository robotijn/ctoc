---
iron_loop: true
approved_by: human
approved_at: 2026-07-08T08:27:27.824Z
gate_crossed: implementation → todo
---

---
approved_by: human
approved_at: 2026-07-07T13:27:22.207Z
gate_crossed: functional → implementation
iron_loop: true
---

---
title: "PI0 — Bootstrap, Runtime Capability-Gate & Composition Root"
created: "2026-06-28T00:00:00Z"
type: feature
status: functional
priority: HIGH
state: in-progress
parent_vision: "done/local-semantic-plan-index.md"
program: ctoc-planning-intelligence
order: 4
depends_on:
  - pi1-index-store-and-schema
  - pi2-embedding-engine
  - pi3-reconciliation-sync
files:
  - "src/lib/plan-index/wiring.js"
  - "src/lib/plan-index/bootstrap.js"
  - "src/lib/plan-index/index.js"
  - "src/hooks/SessionStart.js"
  - "src/tabs/overview.js"
  - ".claude-plugin/hooks.json"
  - "tests/plan-index-smoke.test.js"
  - "tests/plan-index-bootstrap.test.js"
---

# PI0 — Bootstrap, Runtime Capability-Gate & Composition Root

> **Pending Approval — Gate 1: functional → implementation**

> **Architecture pivot alignment (2026-07-07).** The store is the **pure-JS
> in-memory + single-JSON-file** PI1 store (`.ctoc/index/plan-index.json`,
> brute-force cosine); the superseded native-vector-database storage design is
> fully abandoned. The PI1 store is **always available** on every Node — it has
> zero native dependencies — so PI0's old **native-capability probe** (is the
> native module present? does the vector extension load? is the lexical
> full-text engine compiled? is native extension-loading supported?) and its
> "degrade to no-index" branch are **deleted**. Fail-open now lives *inside*
> `openStore` itself. The only runtime that can be absent is the **embedding
> source** (PI2), so the capability gate is retargeted from "is the native
> vector binary loadable" to **"is an embedding source available"** (Ollama
> reachable, or the in-process fallback usable). Everything else in this slice —
> composition root, first-run backfill, query-embedding wiring — is unchanged.

This plan was added by the adversarial review (2026-06-28). The 5-critic panel
found three load-bearing capabilities that **no PI1–PI6 plan owned**: first-run
backfill, query-embedding wiring, and the production composition root. Without
them the index is permanently empty and search has no probe vector — the feature
would "run" while the human sees nothing. PI0 owns the runtime that makes the
rest live.

## Problem Statement

- **First-run backfill is unowned.** PI3's triggers fire only on *new* mutations;
  nothing reconciles the index over *existing* plans at startup. Fresh install →
  empty index → search/related/duplicate/conflict all return nothing.
- **Query embedding is unowned.** PI4 is read-only and does not call PI2, so the
  vector half of `search()` has no probe vector.
- **The composition root is unowned.** PI3 injects an embedder but refuses to
  import PI2; nobody constructs and wires the real embedder + store + sync in
  production.
- **Embedding-source availability is unowned.** The PI1 store is pure JS and
  always available, but the *embedding source* is not: Ollama may be absent and
  the in-process ONNX/WebAssembly fallback may need a first-run download (PI2).
  When no embedding source is reachable, the index cannot be *populated*. CTOC
  must never crash or break an existing install because the embedder is absent —
  the menu keeps working and search degrades to lexical-only (BM25 over the plan
  corpus) or to an empty result set with a legible notice.

## Scope this slice owns

1. **Capability gate** (`runtime.js`): at load, feature-detect the **embedding
   source** — probe Ollama reachability (via PI2's `hardware-probe`/probe path)
   and the in-process fallback's usability. The PI1 store is always constructed
   (pure JS, no probe). If **no embedding source** is available, the index is
   **degraded gracefully** — the menu works normally and shows a one-line,
   legible "semantic index unavailable — no embedding source (start Ollama or
   allow the in-process model download)" notice; `isIndexAvailable()` returns
   false. There is **no** native-module / vector-extension / full-text-engine /
   extension-load probe and no `ExperimentalWarning` to own (the native runtime
   is gone). Document the embedding-source prerequisites.
2. **Composition root** (`runtime.js`): construct the store (PI1's `openStore`
   over `.ctoc/index/plan-index.json`), the embedder (PI2), and the sync (PI3)
   once, and expose the wired singletons (incl. the embedder PI4 uses to embed
   queries).
3. **Bootstrap / backfill** (`bootstrap.js`): on first run and on SessionStart,
   run the full `reconcileIndex` over **all existing plans**, driving PI1's
   `upsertUnit`/`withBatch` through PI3. Calibration (30–90 s) and the initial
   embed run in a **background process** (the existing background mechanism),
   never on the menu render path; a visible "building index N/M" status is
   surfaced in `src/tabs/overview.js`. (Per the locked execution decision:
   synchronous store reads, background embed/build.)
4. **Gitignore** `.ctoc/index/`. Commit the runtime smoke test.

## Business Alignment

**JTBD:** When I install or open a CTOC project, the semantic index either works
end-to-end (search returns real results over my existing plans) or, where my Node
cannot support it, CTOC keeps working and tells me plainly why the index is off —
never a crash, never a silent empty box.

## Acceptance Criteria

- [ ] **Scenario: Capability gate degrades cleanly when no embedding source**
  Given a runtime where Ollama is unreachable AND the in-process fallback is
  unusable (no model, download blocked)
  When the index runtime loads
  Then `isIndexAvailable()` returns false, the PI1 store still opens (pure JS,
  always available), the menu renders normally, and a single legible "semantic
  index unavailable — no embedding source" notice is shown — no exception
  propagates. (No native-module / vector-extension / full-text-engine probe
  exists; the store never gates availability.)
- [ ] **Scenario: Store opens on every Node with no native prerequisite**
  Given any Node version the plugin supports (the `engines` floor is unchanged)
  When the runtime initializes
  Then `openStore('.ctoc/index/plan-index.json')` returns a usable store with no
  native binary, no extension load, and no experimental-runtime warning — the
  pure-JS store imposes zero runtime capability requirement.
- [ ] **Scenario: First-run backfill populates the index over existing plans**
  Given a project with N plan files and an empty/missing
  `.ctoc/index/plan-index.json`
  When bootstrap runs
  Then after the background build completes the index contains units for all N
  plans (via `upsertUnit`/`withBatch`) and a search for a known plan's topic
  returns it.
- [ ] **Scenario: Background build never blocks the menu**
  Given calibration has not yet run
  When the user opens the menu
  Then the menu renders within its normal time budget and shows a
  "building index" status; no render call waits on calibration or embedding.
- [ ] **Scenario: Composition root provides the query embedder to search**
  Given the runtime is available and calibrated
  When `search(query)` runs
  Then the query is embedded via the wired PI2 embedder and the vector half of
  retrieval (PI1's brute-force cosine `store.search`) is non-empty (the read
  features never construct their own embedder).
- [ ] **Scenario: Rebuild equivalence (vision criterion 5)**
  Given a populated index
  When `.ctoc/index/plan-index.json` is deleted and bootstrap re-runs on the same
  machine with the same calibrated model
  Then the rebuilt index returns the same top-k for a fixed query set as before
  the delete (set-equal within float tolerance).
- [ ] **Scenario: Committed runtime smoke test**
  Given CI on any supported Node
  When `tests/plan-index-smoke.test.js` runs
  Then it opens a real `openStore` over a temp JSON path, upserts two known
  vectors, and asserts a 2-vector brute-force cosine `store.search` returns the
  correct ordering — proving the pure-JS retrieval stack end-to-end with **zero
  native binaries and zero network**.

## Non-Functional Requirements

| NFR | Target |
|---|---|
| Never break install | On any Node, loading CTOC + opening the menu must succeed even when the embedding source (index) is unavailable. |
| Cross-platform | macOS/Linux/Windows; paths via `process.platform`/`path.join`. No native binary to select — the store is pure JS. |
| Non-blocking | Render path never awaits embedding/calibration; background build only. |
| Fail-open | Any index/runtime error is logged to `.ctoc/logs/` and degrades the index; it never blocks the menu or a plan mutation. Store-level fail-open is intrinsic to `openStore`. |

## Out of Scope

Store schema (PI1), embedder internals (PI2), sync triggers (PI3), the retrieval
algorithms and UI panels (PI4–PI6). PI0 only wires, gates, and bootstraps them.

## Dependencies

- **PI1 (store):** `openStore('.ctoc/index/plan-index.json')` — the pure-JS
  in-memory + JSON store; `upsertUnit`/`getUnit`/`deleteUnit`/`moveUnit`/`search`/
  `withBatch`. Always available (no native prerequisite).
- **PI2 (embedder + calibration):** produces `Float32Array` embeddings; the store
  infers/locks its dimension from the first `upsertUnit` (no `initVectorTable`
  call — that native-schema step is deleted by the pivot).
- **PI3 (reconcile + syncUnit):** the sweep + hot-path triggers PI0's bootstrap
  drives to populate the store.
- PI4/PI5/PI6 depend on PI0 for the wired runtime + query embedder.

## Rollback

The capability gate (embedding-source availability) already makes the feature
removable at runtime (disable flag); deleting `.ctoc/index/plan-index.json` (and
the `plan-index` modules) restores prior behavior. The JSON index is a
git-ignored, rebuildable cache — no committed data loss.

## Decisions Taken Under Ambiguity

- **Execution model (locked by human):** synchronous store reads on the main
  thread (the pure-JS `openStore`/`search` are synchronous); embedding +
  calibration in a background process; the infeasible async-injection /
  500 ms-partial NFRs are dropped.
- **Runtime policy (locked by human):** capability-gate on the **embedding
  source** and degrade; never bump `engines`. Post-pivot the store imposes **no**
  Node-version requirement at all (pure JS), so the only availability gate is
  whether an embedding source is reachable.
- **Store construction is unconditional.** `openStore` is always called (fail-open
  is intrinsic to it); PI0 never probes for a native binary, a native vector
  extension, or a native full-text engine — those are deleted. The composition
  root simply calls `openStore` and holds the handle.
- **Settings:** read via `src/lib/settings.js` `getSetting` (`.ctoc/settings.json`);
  `plan_index` registered in `SETTINGS_SCHEMA` by PI1. (Note pre-existing drift:
  init writes `settings.yaml` while the runtime API reads `settings.json`.)
- **Backfill trigger:** SessionStart kicks a background build if the index is
  stale/empty; the menu reads whatever is ready.


---

# Implementation Details

> Generated by the Implementation Planner (Steps 5 PLAN / 6 DESIGN / 7 SPEC) after
> reading the shipped PI1/PI2/PI3 slices FRESH from disk (store.js, index.js,
> embedder.js, calibration.js, hardware-probe.js, reconcile.js, sync-unit.js), the
> two dormant PI0 seams (`actions.movePlan → loadPlanIndexWiring`, the
> `PostToolUse.plan-index-sync.js` hook), `hooks.json`, `settings.js`, the menu
> entry (`src/commands/menu.js`), `SessionStart.js`, and the validator
> (`plan-validator.js`). PI0 is the composition root that turns the currently
> **inert** vector system **LIVE**.

## Architecture Decision (ADR)

**Context.** PI1 (pure-JS store), PI2 (`embed()` façade + calibration + Ollama
probe), and PI3 (`reconcileIndex` + `syncUnit` + the fire-and-forget PostToolUse
hook) are all shipped and tested, but **inert**: nothing constructs the singletons,
nothing runs the first-run backfill, the PostToolUse hook is not registered in
`hooks.json`, and both hot-path consumers (`actions.movePlan`'s guard and the hook)
lazy-`require('./plan-index/wiring')` — a module that **does not exist yet**. Both
guards already fail open on the missing module, so the system is dormant, not broken.

**Decision.** Create the missing seam exactly as the two consumers already expect
it: a module at `src/lib/plan-index/wiring.js` exporting `getWiring()` which returns
a lazily-constructed, cached singleton `{ store, embedder, calibrationReady,
isIndexAvailable, degradedReason }`. Add a `bootstrap.js` that runs the first-run
backfill + calibration in a **detached background child process** (never on the
render path). Register the already-shipped hook in `hooks.json`. Retarget the
capability gate off the deleted native-binary probe onto **embedding-source
availability** (Ollama reachable via `probeOllama`, else the always-available
in-process fallback), while the **store is unconditionally opened** (pure JS, its own
fail-open is intrinsic).

**Consequences.** (+) One construction site; PI4/PI5/PI6 consume `getWiring()`.
(+) `movePlan`'s guard and the hook go live the moment `wiring.js` exists — zero
edits to those two files. (+) Fail-open is layered: store-level (intrinsic to
`openStore`), wiring-level (any construction error → safe no-op wiring), bootstrap-
level (detached, errors logged, menu unaffected). (−) The exact contract the two
consumers hard-code (`getWiring()`, `w.store`, `w.embedder` as a **function**,
`w.calibrationReady`) is now load-bearing and must match byte-for-byte — captured as
a Step 8 test.

## Discrepancies vs the shipped PI1/PI2/PI3 APIs (read fresh — MUST be honored)

These are the exact places where a naïve implementation would break against the real
code. Every one was confirmed by reading the shipped module.

1. **The seam is `wiring.js` with `getWiring()`, NOT `runtime.js`.** Both dormant
   consumers require the literal string `'./plan-index/wiring'` /
   `'../lib/plan-index/wiring'` and call `wiring.getWiring()`:
   - `src/lib/actions.js:97-100` → `req('./plan-index/wiring')`, then
     `wiring.getWiring()`, uses `w.store` (needs `w.store.moveUnit`).
   - `src/hooks/PostToolUse.plan-index-sync.js:79-82` → `req('../lib/plan-index/wiring')`,
     then `getWiring()`, requires `w.store && typeof w.embedder === 'function'`.
   The plan's original `files:` said `runtime.js`; that filename is **wrong** and was
   corrected to `wiring.js`. (An additional `runtime.js` may hold the capability-gate
   logic and be re-exported by `wiring.js`, but the module the consumers load MUST be
   `wiring.js`.)

2. **`w.embedder` MUST be a bare `async (texts) => Float32Array[] | {vectors}`**, not
   PI2's `embed(texts, deps)`. `reconcile.js:137-139` and `sync-unit.js:247-249` call
   `embedder([u.text])` with ONE argument and accept either a `Float32Array[]` OR a
   `{ vectors }` object. PI2's `embed` returns `{ vectors, source }` and takes a
   `deps` second arg. So `wiring.js` must **adapt**: `embedder = (texts) =>
   pi2.embed(texts, { projectPath, getSetting, ... })`. The `{vectors}` return shape
   already satisfies both consumers (they unwrap `.vectors`). Confirmed:
   `reconcile.js` line 138 `const vectors = Array.isArray(embedded) ? embedded :
   (embedded && embedded.vectors)`.

3. **`calibrationReady` is a zero-arg predicate `() => boolean`.** `sync-unit.js:221`
   and `reconcile.js:113` call `calibrationReady()` with no args and gate the whole
   sweep/sync on it. `wiring.js` must expose it as `() =>
   loadCalibration({projectPath}) != null`. If calibration has not run, sync/reconcile
   correctly **defer** (return `{skipped:true}`) — the plan's non-blocking contract.

4. **`reconcileIndex(plansRoot, deps)` — first arg is the `plans/` ROOT (absolute),
   deps carry `{store, embedder, calibrationReady, logDir}`.** Confirmed
   `reconcile.js:105`. `plansRoot` = `path.join(projectRoot, 'plans')`. `logDir` =
   `path.join(projectRoot, '.ctoc', 'logs')`.

5. **`openStore` never gates availability and never throws on a bad file.** It fails
   open internally (F3 memory-only mode). So the capability gate is EMBEDDING-SOURCE
   only. Store path is `.ctoc/index/plan-index.json` (confirmed the calibration sibling
   `.ctoc/index/calibration.json` in `calibration.js:50`). Use
   `path.join(root, '.ctoc', 'index', 'plan-index.json')`.

6. **`.gitignore` already ignores `.ctoc/index/`** (`.gitignore:17-18`, added by PI1).
   The plan's original `files:` listed `.gitignore`; that edit is a **no-op** and was
   **removed** from `files:`. No `.gitignore` change is needed — do not touch it.

7. **The PostToolUse hook FILE already exists** (`src/hooks/PostToolUse.plan-index-sync.js`,
   shipped by PI3; `readme-numbers.test.js:142` pins `src/hooks/` at **16** files).
   PI0 adds only a **registration** in `hooks.json` — **NO new hook file, NO
   hook-count bump.** (CLAUDE.md's prose still says "13 hooks"; that is pre-existing
   drift the test already overrides at 16 and is OUT OF SCOPE for PI0.)

8. **`getSetting(category, key, projectPath)` signature** (settings.js:225) — three
   positional args. `plan_index.engine_preference` (default `'auto'`) and
   `plan_index.ollama_base_url` (default `'http://localhost:11434'`) are already
   registered (settings.js:98-105). `wiring.js` reads engine preference only to pass
   through to PI2's `embed` (which itself reads it) — do NOT re-implement dispatch.

9. **Settings-file drift (pre-existing, documented in the plan):** init writes
   `settings.yaml`; the runtime `getSetting` reads `settings.json`. PI0 relies on the
   schema **defaults** (`'auto'`, localhost) so it works even when neither file pins
   `plan_index` — no fix required, just do not depend on a written value.

10. **`inprocess-engine.DIMENSION === 384`** and `calibration` pins `all-MiniLM-L6-v2`
    / 384 for the in-process backend (`calibration.js:38,153-156`). The store infers
    dimension from the first `upsertUnit` — PI0 never sets a dimension.

## Dependency Graph

```
                         ┌──────────────────────────────────────────────┐
                         │  src/lib/plan-index/wiring.js  (NEW, seam)     │
                         │  getWiring() → cached singleton                │
                         │  { store, embedder, calibrationReady,          │
                         │    isIndexAvailable, degradedReason }          │
                         └──────────────────────────────────────────────┘
       constructs ↓            ↓ binds              ↓ predicate         ↑ required by
   ┌───────────────┐   ┌───────────────────┐  ┌────────────────┐   ┌──────────────────────────┐
   │ pi1 index.js  │   │ pi2 embedder.js   │  │ pi2 calibration│   │ actions.movePlan guard   │
   │ openStore()   │   │ embed(texts,deps) │  │ loadCalibration│   │ (loadPlanIndexWiring)    │
   └───────────────┘   │ + hardware-probe  │  └────────────────┘   ├──────────────────────────┤
   (pure JS, always)   │   probeOllama()   │  (readiness gate)     │ PostToolUse.plan-index   │
                       └───────────────────┘                       │   -sync.js (loadWiring)  │
                                                                    └──────────────────────────┘
                                                                    (BOTH already lazy-require
                                                                     './plan-index/wiring' —
                                                                     go LIVE when it exists)

   ┌──────────────────────────────────────────────┐
   │ src/lib/plan-index/bootstrap.js  (NEW)         │  child entry (detached): runs
   │  runBackfill(projectRoot)  [runs IN CHILD]     │───► reconcileIndex(plansRoot,{store,
   │  kickBackfillBackground(projectRoot) [PARENT]  │        embedder,calibrationReady,logDir})
   │  isBackfillNeeded(projectRoot)                 │     + runCalibration({projectPath})
   └──────────────────────────────────────────────┘        (both in the background child)
        ↑ triggered by (fire-and-forget, non-blocking)
   ┌──────────────────────┐        ┌──────────────────────────────┐
   │ src/hooks/SessionStart│        │ src/commands/menu.js main()   │
   │ .js (step 8b)         │        │ TTY path, after startAutoSync │
   │ kickBackfillBackground│        │ kickBackfillBackground (guard)│
   └──────────────────────┘        └──────────────────────────────┘

   ┌──────────────────────────────┐
   │ src/tabs/overview.js          │  reads a lightweight status file written by the
   │ (Pipeline section append)     │  bootstrap child (.ctoc/index/build-status.json)
   └──────────────────────────────┘  → shows "building index N/M" / "semantic index off"

   ┌──────────────────────────────┐
   │ .claude-plugin/hooks.json     │  register PostToolUse.plan-index-sync.js
   │ (PostToolUse matcher)         │  matcher: "Write|Edit|MultiEdit"
   └──────────────────────────────┘
```

No cycles: `wiring.js` depends inward on PI1/PI2 only; `bootstrap.js` depends on
`wiring.js` + PI3 `reconcileIndex` + PI2 `runCalibration`; the hook/menu/SessionStart
depend on `bootstrap.js` and (via the existing dormant guard) `wiring.js`. The two
consumer files are NOT edited.

## Implementation Order

1. `src/lib/plan-index/wiring.js` (CREATE) — no dep on other NEW files. This alone
   turns `movePlan`'s guard + the PostToolUse hook LIVE (both already require it).
2. `tests/plan-index-smoke.test.js` (CREATE) — pure-JS retrieval end-to-end +
   `getWiring()` contract (fail-open) . Depends on step 1.
3. `src/lib/plan-index/bootstrap.js` (CREATE) — backfill/calibration in a detached
   child; `isBackfillNeeded`, `kickBackfillBackground`, and the child `runBackfill`
   entry. Depends on step 1 + PI3 `reconcileIndex` + PI2 `runCalibration`.
4. `tests/plan-index-bootstrap.test.js` (CREATE) — hermetic backfill (stub embedder,
   no Ollama, no real child), non-blocking + fail-open. Depends on step 3.
5. `.claude-plugin/hooks.json` (MODIFY) — register the shipped PostToolUse hook.
6. `src/hooks/SessionStart.js` (MODIFY) — fire-and-forget `kickBackfillBackground`.
7. `src/tabs/overview.js` (MODIFY) — render the "building index" / "index off" line.
8. `src/lib/plan-index/index.js` (MODIFY) — re-export `getWiring` from the barrel so
   PI4–PI6 have ONE import surface (`require('./plan-index')`), matching the barrel's
   "only entry point" contract. Additive; the two dormant consumers keep their
   direct `./plan-index/wiring` require (do not change them).

## File Specifications

### File: `src/lib/plan-index/wiring.js`
**Action:** CREATE
**Purpose:** The composition root + capability gate. The single seam both
`actions.movePlan` and the PostToolUse hook already lazy-require. Constructs the
store + embedder + calibration-readiness once, caches them, and gates on
embedding-source availability. Fail-open: any construction failure yields a safe
wiring whose `embedder` is a no-op and `isIndexAvailable()` is false — the store is
still opened.
**Change Type:** new-module

#### Exports
- `getWiring(opts?: { projectPath?: string }) → Wiring`
  - `Wiring = { store, embedder, calibrationReady, isIndexAvailable, degradedReason, projectPath }`
  - `store` — the PI1 handle from `openStore(indexJsonPath)` (ALWAYS constructed).
  - `embedder(texts: string[]) → Promise<{vectors: Float32Array[], source}>` — a
    thin adapter over PI2 `embed(texts, { projectPath, getSetting })`. Bare
    one-arg signature (what reconcile/sync call). NEVER rejects (PI2 is fail-open).
  - `calibrationReady() → boolean` — `loadCalibration({projectPath}) != null`.
  - `isIndexAvailable() → boolean` — true iff an embedding source is available AND
    the store constructed. Drives PI4–PI6 read features + the overview notice.
  - `degradedReason() → string|null` — e.g. `'no-embedding-source'` |
    `'store-unavailable'` | `null`. One legible reason for the menu notice.
  - Cached: the FIRST call constructs; subsequent calls return the cached singleton
    (keyed by resolved `projectPath`). Expose `__reset()` (non-enumerable) so tests
    get a fresh singleton.
- `probeEmbeddingSource(opts?) → Promise<{ available: boolean, source: 'ollama'|'in-process'|null }>`
  - The capability gate proper. `probeOllama(...)` → if reachable `{available:true,
    source:'ollama'}`; else the in-process fallback is ALWAYS usable
    `{available:true, source:'in-process'}`. It only returns `available:false` when
    even the in-process engine cannot be constructed (defensive; effectively never
    on a supported Node). Async because `probeOllama` is async.

> **Capability-gate note (retargeted, per the pivot).** There is NO node:sqlite /
> vec0 / extension-load / native-binary probe. `isIndexAvailable` reflects only:
> (a) did `openStore` yield a store (always yes — pure JS), and (b) is an embedding
> source reachable. Because the in-process fallback is always available, the FULL
> vs DEGRADED distinction is really Ollama-present (full semantic quality) vs
> Ollama-absent (hashing fallback, still functional). `isIndexAvailable()` returns
> false only in the pathological "no embedding source at all" branch the plan's AC1
> describes; in practice the in-process path keeps it true, and the notice reports
> reduced quality rather than "off". Document both states in `degradedReason`.

#### Dependencies (imports)
- `require('path')`
- `require('./index')` → `openStore` (barrel, NOT `./store` directly — barrel is the
  contract).
- `require('./embedder')` → `embed`
- `require('./calibration')` → `loadCalibration`
- `require('./hardware-probe')` → `probeOllama`
- `require('../settings')` → `getSetting` (passed through to `embed`)
- `require('../project-root')` → `findProjectRoot` (resolve default projectPath)

#### Called By
- `src/lib/actions.js:97` `loadPlanIndexWiring()` — `req('./plan-index/wiring').getWiring()`
  (ALREADY WIRED; goes live on file creation).
- `src/hooks/PostToolUse.plan-index-sync.js:79` `loadWiring()` —
  `req('../lib/plan-index/wiring').getWiring()` (ALREADY WIRED).
- `src/lib/plan-index/bootstrap.js` — for `{store, embedder, calibrationReady}` to
  feed `reconcileIndex`.
- PI4–PI6 read features (future) — via the barrel re-export.

#### Data Flow
```
getWiring({projectPath})
  → resolve projectPath (arg ?? findProjectRoot() ?? process.cwd())
  → cache hit? return singleton
  → indexJsonPath = path.join(root,'.ctoc','index','plan-index.json')
  → try { store = openStore(indexJsonPath) }         // ALWAYS; fail-open intrinsic
      catch → store = null  (defensive; openStore itself shouldn't throw)
  → embedder = (texts) => embed(texts, { projectPath: root, getSetting })
  → calibrationReady = () => loadCalibration({projectPath:root}) != null
  → isIndexAvailable = () => !!store   (embedding-source availability is checked
      lazily/async by probeEmbeddingSource + surfaced via degradedReason; the store
      being present is the synchronous availability signal callers gate on)
  → cache + return
```

#### Error Handling
- `openStore` throwing (should not — has its own F3 fail-open) → catch, `store=null`,
  `degradedReason='store-unavailable'`, `embedder` becomes a no-op returning
  `{vectors:[]}`, `isIndexAvailable()` false. NEVER rethrow into a consumer.
- `embed` never rejects (PI2 contract) — no catch needed inside the adapter, but the
  adapter still wraps defensively and resolves `{vectors:[]}` on any thrown error.
- Everything synchronous in `getWiring` is wrapped so a single bad call can never
  break `movePlan` or the hook.

#### Cross-Platform
- `path.join` for the index path; no separators, no `~`.
- No native deps, no `child_process`, no shell — pure require graph.

---

### File: `src/lib/plan-index/bootstrap.js`
**Action:** CREATE
**Purpose:** First-run + SessionStart backfill and calibration, run in a **detached
background child process** so the menu/session-start render path NEVER blocks on the
30–90 s calibration or the initial embed. Writes a lightweight status file the
overview tab reads. Fail-open at every layer.
**Change Type:** new-module

#### Exports
- `isBackfillNeeded(projectRoot: string) → boolean`
  - True iff `.ctoc/index/plan-index.json` is absent OR empty (0 units) OR stale
    (a fast, cheap check — file missing / `store.size === 0`). Does NOT walk all
    plans (that is the child's job); keep it O(1)-ish so the caller stays fast.
    Reads via `getWiring(...).store.size`. Returns false on any error (fail-open →
    do not kick a build we can't reason about).
- `kickBackfillBackground(projectRoot: string, opts?) → { started: boolean, reason? }`
  - The PARENT-side, **non-blocking**, fire-and-forget trigger. Guard: if a build is
    already running (a lock/marker file `.ctoc/index/.build.lock` fresh within a TTL)
    → `{started:false, reason:'already-running'}`. Else spawn THIS module as a
    detached child: `child_process.spawn(process.execPath,
    [__filename, '--backfill', projectRoot], { detached: true, stdio: 'ignore' })`
    then `child.unref()`. Returns immediately. Wrapped in try/catch → any spawn
    failure is logged and returns `{started:false, reason:'spawn-failed'}`; it NEVER
    throws into SessionStart or the menu. (Mirrors the post-commit "quality agent
    started in background" precedent.)
- `runBackfill(projectRoot: string, deps?) → Promise<{swept, reembedded, deleted, calibrated}>`
  - The CHILD body (also directly callable in tests with injected deps). Steps:
    1. write `.ctoc/index/build-status.json` `{state:'building', started, swept:0}`.
    2. `await runCalibration({ projectPath: projectRoot })` (PI2 owns the benchmark;
       idempotent — returns fast if already calibrated; pins in-process when Ollama
       absent). PI0 OWNS the invocation per PI2's design.
    3. `const { store, embedder, calibrationReady } = getWiring({projectPath:projectRoot})`.
    4. `const r = await reconcileIndex(path.join(projectRoot,'plans'), { store,
       embedder, calibrationReady, logDir })`.
    5. write `build-status.json` `{state:'ready', swept:r.swept, reembedded, at}`.
    6. release `.build.lock`. All wrapped: on any error write
       `{state:'error', message}` and log to `.ctoc/logs/plan-index-sync.json`; the
       child exits 0 regardless (a failed background build must never surface as a
       crash).
  - `deps` (tests): `{ reconcileIndex, runCalibration, getWiring, embedder, store,
    now }` all injectable so the test drives it with a stub embedder + real tmp store
    and NO child, NO Ollama.

#### CHILD ENTRY
```
if (require.main === module && process.argv[2] === '--backfill') {
  const root = process.argv[3] || process.cwd();
  runBackfill(root).then(() => process.exit(0)).catch(() => process.exit(0));
}
```
So `spawn(execPath, [__filename, '--backfill', root])` runs the backfill and always
exits 0.

#### Dependencies
- `require('path')`, `require('child_process')` (`spawn`), `require('../safe-fs')`
- `require('./wiring')` → `getWiring`
- `require('./reconcile')` → `reconcileIndex`
- `require('./calibration')` → `runCalibration`

#### Called By
- `src/hooks/SessionStart.js` (new step 8b) — `kickBackfillBackground(projectPath)`.
- `src/commands/menu.js` main() TTY path — `kickBackfillBackground` (guarded so it
  fires at most once per session; the lock TTL de-dupes with SessionStart).
- Itself, as a detached child (`--backfill`).

#### Data Flow
```
[parent] SessionStart/menu → isBackfillNeeded? → kickBackfillBackground
   → spawn(detached, unref) → returns instantly (menu renders)
[child]  runBackfill → status:building → runCalibration → getWiring
   → reconcileIndex(plansRoot,{store,embedder,calibrationReady,logDir})
   → status:ready → exit 0
[reader] overview tab → read build-status.json → "building index N/M" | "ready" | "off"
```

#### Error Handling
- spawn failure → logged, `{started:false}`, menu unaffected.
- calibration/reconcile throw in child → status:error + log, child exits 0.
- `build-status.json` write failure → swallowed (best-effort, like all plan-index logs).
- Stale `.build.lock` (older than TTL, e.g. 10 min) is ignored/overwritten so a
  crashed child never wedges future builds.

#### Cross-Platform
- `spawn(process.execPath, [...])` — no shell, no bash; `detached:true` + `unref()`
  works on Windows/macOS/Linux. `stdio:'ignore'` so no orphaned pipes.
- All paths via `path.join`; all fs via `safe-fs`.

---

### File: `.claude-plugin/hooks.json`
**Action:** MODIFY
**Purpose:** Register the already-shipped `PostToolUse.plan-index-sync.js` so plan
writes trigger incremental sync (it is a no-op until `wiring.js` exists, so ordering
is safe).
**Change Type:** modify-existing (add one PostToolUse entry)

#### Change
Add a SECOND object to the existing `PostToolUse` array (alongside the current `"*"`
status-check entry), with a scoped matcher so it only fires on file writes:
```json
{
  "matcher": "Write|Edit|MultiEdit",
  "hooks": [
    {
      "type": "command",
      "command": "node \"${CLAUDE_PLUGIN_ROOT}/src/hooks/PostToolUse.plan-index-sync.js\""
    }
  ]
}
```
- Matcher `"Write|Edit|MultiEdit"` (regex-alternation form Claude Code accepts, same
  style as the existing `"Read|Edit|Write|Bash"` guard-files entry at line 67). The
  hook itself already filters to `plans/**/*.md` via `isPlanMd`, so a slightly-broad
  matcher is harmless and fail-open.
- Do NOT touch the existing `"*"` status-check entry, the SessionStart entry, the
  PreToolUse block, or Stop.
- **No hook-file count change** (the file already exists; `readme-numbers.test.js`
  stays at 16). No README/CLAUDE.md count edit required.

#### Dependencies / Called By
- Loaded by Claude Code's plugin hook runtime; `${CLAUDE_PLUGIN_ROOT}` is substituted
  at runtime (same convention as every other entry).

#### Error Handling
- The hook is fail-open and always exits 0; a broken registration cannot block a tool.

#### Cross-Platform
- `${CLAUDE_PLUGIN_ROOT}` + `node "…"` — identical to all sibling entries; portable.

---

### File: `src/hooks/SessionStart.js`
**Action:** MODIFY
**Purpose:** Fire-and-forget kick of the background backfill so a fresh install /
first session populates the index without the user doing anything — never blocking
session start.
**Change Type:** modify-existing (add a guarded, fail-open block)

#### Change
- After step 5 (directory creation) and the lessons block (or as a new **step 8b**
  after the self-check, before/after `generateContext` output — placement is not
  load-bearing as long as it does not block), add:
  ```js
  // 8b. Plan-index backfill (fire-and-forget, fail-open). Never blocks session start.
  try {
    const { isBackfillNeeded, kickBackfillBackground } = require('../lib/plan-index/bootstrap');
    if (isBackfillNeeded(projectPath)) kickBackfillBackground(projectPath);
  } catch (err) {
    // Backfill kick must NEVER break session start (the pi1/task-reconcile precedent).
    console.error('[CTOC] Plan-index backfill kick skipped:', err && err.message);
  }
  ```
- Self-repo guard is NOT needed here (backfill over CTOC's own `plans/` is fine and
  desirable — it dogfoods), unlike the lessons-block self-edit guard.

#### Dependencies (added)
- `require('../lib/plan-index/bootstrap')` (lazy, inside the try — so a missing/broken
  bootstrap can never break the hook).

#### Called By
- Claude Code SessionStart hook runtime (already registered).

#### Error Handling
- Whole block in try/catch; `kickBackfillBackground` is itself non-throwing.
  Double-guarded, matching the existing lessons-block pattern (lines 106-115).

#### Cross-Platform
- Delegates to `bootstrap.kickBackfillBackground` (already portable). No new
  OS-specific code here.

---

### File: `src/tabs/overview.js`
**Action:** MODIFY
**Purpose:** Surface a single legible "building index N/M" / "semantic index off"
line so the human SEES the index state (the "measure is the human" line — a silent
grind is broken).
**Change Type:** modify-existing (append one status line to the Pipeline section)

#### Change
- In `render(app)`, after the Pipeline block (after the `Review` count line, before
  `line()`), add a fail-open read of `.ctoc/index/build-status.json`:
  ```js
  const idx = readIndexStatus(projectPath); // new local helper, fail-open → null
  if (idx) {
    if (idx.state === 'building') {
      output += `  ${c.dim}Semantic Index  building… ${idx.swept || 0} plans${c.reset}\n`;
    } else if (idx.state === 'ready') {
      output += `  ${c.dim}Semantic Index  ready (${idx.swept || 0} plans)${c.reset}\n`;
    } else if (idx.state === 'error') {
      output += `  ${c.yellow}Semantic Index  unavailable — ${idx.message || 'see logs'}${c.reset}\n`;
    }
  }
  ```
- `readIndexStatus(projectPath)` — a small local function: `try { JSON.parse(
  safeFs.readFileSync(path.join(projectPath,'.ctoc','index','build-status.json')))
  } catch { return null }`. A missing/corrupt status file → `null` → NO line rendered
  (the overview is unchanged for anyone without the index). **A read error here must
  never break the dashboard render** — this is the explicit constraint.
- Requires adding `const path = require('path')` and `const safeFs =
  require('../lib/safe-fs')` if not already imported at the top of overview.js.

#### Dependencies (added)
- `require('path')`, `require('../lib/safe-fs')` (if not present).

#### Called By
- `src/commands/menu.js` render() → `overviewTab.render(app)`.

#### Error Handling
- `readIndexStatus` returns null on ANY error → the line is simply omitted. The
  dashboard ALWAYS renders (fail-open; the pi1/task-reconcile precedent).

#### Cross-Platform
- `path.join`, `safe-fs`. No OS-specific code.

---

### File: `src/lib/plan-index/index.js`
**Action:** MODIFY
**Purpose:** Re-export `getWiring` (and `isIndexAvailable`) from the barrel so PI4–PI6
have ONE import surface, honoring the barrel's "the ONLY entry point other CTOC code
imports" contract.
**Change Type:** modify-existing (extend `module.exports`)

#### Change
```js
const { openStore, PLAN_SENTINEL } = require('./store');
const { getWiring } = require('./wiring');
module.exports = { openStore, PLAN_SENTINEL, getWiring };
```
- Additive only. The two dormant consumers keep their direct `./plan-index/wiring`
  require (do NOT rewrite them — they are outside PI0's `files:` and out of scope).
- Guard the `require('./wiring')` so a load-order issue can't break the barrel for
  existing PI1/PI3 consumers: wrap in a lazy getter OR a try/catch that omits
  `getWiring` if wiring fails to load. (Recommended: keep it a plain require — wiring
  has no import cycle back into the barrel beyond `openStore`, which is already
  resolved.)

#### Dependencies
- `require('./wiring')` (new).

#### Called By
- Every existing plan-index consumer that imports the barrel (PI3 `sync-unit`,
  `reconcile` for `PLAN_SENTINEL`; future PI4–PI6 for `getWiring`).

#### Error Handling
- If wiring somehow fails to require at barrel-load, the barrel must still export
  `openStore`/`PLAN_SENTINEL` (guard the wiring require). PI1/PI3 must not regress.

#### Cross-Platform
- Pure require; portable.

## Test Plan (Step 7 SPEC — hermetic; NO live Ollama, NO real child, NO network)

Conventions (matching `tests/plan-index-sync.test.js` + `plan-index-store.test.js`):
`node:test` + `node:assert`; tmp dir via `fs.mkdtempSync(path.join(os.tmpdir(),
'ctoc-idx-'))`, torn down in `afterEach` with `fs.rmSync(dir,{recursive,force})`;
**stub embedder** = `async (texts) => list.map(() => new Float32Array(DIM).fill(v))`;
`calibrationReady` injected `() => true|false`; Ollama probe injected to a fixed
boolean (`probeOllama` accepts `deps.fetch`/is injectable; here we inject at the
wiring/bootstrap `deps` seam so no real fetch runs).

### Tests: `tests/plan-index-smoke.test.js`
**Action:** CREATE
**Framework:** `node:test`

#### Test Cases
1. **Pure-JS retrieval end-to-end (AC "Committed runtime smoke test").** `openStore`
   over a temp JSON path; `upsertUnit` two known 2-D vectors (e.g. `[1,0]`, `[0,1]`);
   `store.search(new Float32Array([1,0]), 2)` returns both, `[0]` is the `[1,0]` unit
   (score ≈ 1). Asserts pure-JS retrieval with **zero native binaries, zero network**.
2. **`getWiring()` contract shape.** `const w = getWiring({projectPath: tmp})` →
   assert `typeof w.store.moveUnit === 'function'` (what `movePlan` needs),
   `typeof w.embedder === 'function'` (what the hook needs), `typeof
   w.calibrationReady === 'function'`, `typeof w.isIndexAvailable === 'function'`.
3. **`getWiring()` is a cached singleton.** Two calls with the same projectPath return
   the same `store` reference; `w.__reset()` then a third call returns a fresh store.
4. **Capability gate — Ollama PRESENT → full/source ollama.** `probeEmbeddingSource`
   with an injected probe `() => true` → `{available:true, source:'ollama'}`; store
   present; `isIndexAvailable()` true.
5. **Capability gate — Ollama ABSENT → in-process, store STILL available.** injected
   probe `() => false` → `{available:true, source:'in-process'}`; `store` still opens;
   `isIndexAvailable()` true; `degradedReason()` reflects reduced-quality/in-process
   (NOT `store-unavailable`). Proves the store never gates availability (AC "Store
   opens on every Node").
6. **Fail-open — store construction failure → safe no-op wiring.** Inject an
   `openStore` that throws (via `deps` seam) → `getWiring` returns `store:null` OR a
   safe stub, `embedder([...])` resolves `{vectors:[]}` (never rejects),
   `isIndexAvailable()` false, `degradedReason()==='store-unavailable'`. **No
   exception propagates** — assert `getWiring` does not throw. (AC "Capability gate
   degrades cleanly".)
7. **`embedder` adapter unwraps to the one-arg shape reconcile/sync expect.** Inject a
   PI2 `embed` stub returning `{vectors:[Float32Array], source:'in-process'}`;
   `await w.embedder(['x'])` resolves an object with a `.vectors[0] instanceof
   Float32Array`. Confirms discrepancy #2 is honored.

#### Coverage Targets
- Every `wiring.js` branch (happy, ollama-absent, store-throws) exercised. ≥80% lines
  / branches; every fail-open catch hit.

### Tests: `tests/plan-index-bootstrap.test.js`
**Action:** CREATE
**Framework:** `node:test`

#### Test Cases
1. **Backfill populates the index over a tmp plans fixture (AC "First-run backfill").**
   Create `tmp/plans/todo/foo.md` + `tmp/plans/done/bar.md` (frontmatter + a `## `
   section). Call `runBackfill(tmp, { reconcileIndex, runCalibration: async()=>({
   backend:'in-process', model:'all-MiniLM-L6-v2', dimension:8 }), getWiring: ()=>({
   store: realTmpStore, embedder: stubEmbedder, calibrationReady: ()=>true }) })`.
   Assert the store now has units for BOTH plans (`store.size > 0`,
   `store.listPlanPaths()` includes `plans/todo/foo.md` + `plans/done/bar.md`) and a
   `store.search(probeVector, k)` returns a known plan. **Hermetic: stub embedder,
   no Ollama, no real child.**
2. **`isBackfillNeeded` — empty/missing index → true; populated → false.** Missing
   `plan-index.json` → true. After upserting one unit → false. Fail-open: a broken
   store read → false.
3. **`kickBackfillBackground` is NON-BLOCKING and returns immediately.** Stub
   `child_process.spawn` (inject via `deps.spawn`) to a fake returning `{unref(){}}`;
   assert `kickBackfillBackground` returns `{started:true}` synchronously and calls
   `spawn(execPath, [bootstrapFile, '--backfill', root], {detached:true,
   stdio:'ignore'})` then `.unref()`. **No real process spawned.** (AC "Background
   build never blocks the menu".)
4. **`kickBackfillBackground` fail-open on spawn error.** Inject `spawn` that throws →
   returns `{started:false, reason:'spawn-failed'}`, does NOT throw, writes a log
   entry. Proves a spawn failure can't break SessionStart/menu.
5. **De-dupe via lock.** With a fresh `.build.lock` present →
   `{started:false, reason:'already-running'}`; with a stale lock (mtime > TTL) →
   proceeds (`{started:true}`).
6. **Backfill child never throws on reconcile error.** Inject `reconcileIndex` that
   rejects → `runBackfill` resolves (does not reject), writes `build-status.json`
   `{state:'error'}`, logs. (AC fail-open.)
7. **build-status.json lifecycle.** `runBackfill` writes `building` then `ready`;
   assert the final file parses to `{state:'ready', swept:2}`.
8. **overview reads status without breaking on a corrupt file.** Write a corrupt
   `build-status.json`; call `overview.render(app)` (or the `readIndexStatus` helper
   if exported) → returns/renders WITHOUT throwing and omits the index line. (AC
   overview never breaks the dashboard.)

#### Coverage Targets
- Every bootstrap branch (needed/not, kick started/dedupe/spawn-fail, child
  success/error, status lifecycle). ≥80%. Every fail-open catch exercised.

### Regression guard (existing tests must still pass)
- `tests/plan-index-store.test.js`, `plan-index-sync.test.js`, `plan-index-embedding.test.js`
  — unchanged (PI0 adds only the barrel `getWiring` export; do not alter store/sync).
- `tests/readme-numbers.test.js` — `src/hooks/` still 16 files (no new hook file);
  the added hooks.json registration does not change the file count.
- The full suite: `node --test tests/*.test.js` → `# fail 0`.

## Iron Loop Steps 8–16 (canonical labels — MANDATORY, enforced by validate-plan-steps.js)

> These are the labels the integrator/executor will expand. Written here with the
> exact canonical labels so `validateStepLabels` passes (all nine present, one
> IMPLEMENT, Step 8 WRITES tests, Step 14 automated).

### Step 8: TEST
WRITE `tests/plan-index-smoke.test.js` and `tests/plan-index-bootstrap.test.js`
FIRST (TDD-red). Cover: pure-JS retrieval smoke, `getWiring()` contract + singleton +
fail-open, capability gate (Ollama present→ollama / absent→in-process, store always
available), embedder-adapter shape, backfill populates from a tmp plans fixture (stub
embedder, no Ollama, no real child), `kickBackfillBackground` non-blocking +
spawn-fail fail-open + lock de-dupe, child never throws on reconcile error,
build-status lifecycle, overview corrupt-status resilience. Assert they FAIL before
implementation exists.

### Step 9: PREPARE
Confirm prerequisites exist (all shipped): `openStore` (index.js barrel), `embed`
(embedder.js), `loadCalibration`/`runCalibration` (calibration.js), `probeOllama`
(hardware-probe.js), `reconcileIndex` (reconcile.js), the two dormant consumers'
`getWiring()` contract. Verify `.ctoc/index/` is git-ignored (already is). No new
deps, no `engines` bump.

### Step 10: IMPLEMENT
Create `src/lib/plan-index/wiring.js` (getWiring singleton + capability gate +
embedder adapter, fail-open). Create `src/lib/plan-index/bootstrap.js`
(isBackfillNeeded, kickBackfillBackground detached-spawn, runBackfill child body +
`--backfill` entry, build-status file). MODIFY `.claude-plugin/hooks.json` (register
the shipped PostToolUse hook, matcher `Write|Edit|MultiEdit`). MODIFY
`src/hooks/SessionStart.js` (guarded fire-and-forget kick). MODIFY `src/tabs/overview.js`
(fail-open status line). MODIFY `src/lib/plan-index/index.js` (barrel re-export
`getWiring`). Do NOT edit `actions.js` or `PostToolUse.plan-index-sync.js` — they
already require the seam. No stubs; make documented choices under ambiguity.

### Step 11: REVIEW
Self-review against the 14 quality dimensions. Verify: fail-open EVERYWHERE (store,
wiring, bootstrap kick, child, overview read); the `getWiring()` shape byte-matches
both consumers; the embedder adapter returns the one-arg `{vectors}` shape;
`kickBackfillBackground` is non-blocking (returns before the child does any work); no
`child_process` on the render path; the two consumer files untouched.

### Step 12: OPTIMIZE
Ensure `isBackfillNeeded` stays O(1)-ish (no full plans walk in the parent). Confirm
the singleton cache avoids re-`openStore` per `movePlan`/hook call. Remove any
redundant probe on the synchronous path.

### Step 13: SECURE
All fs via `safe-fs`; all paths via `path.join` (no traversal, no `~`). The detached
child spawns `process.execPath` with an array argv (NO shell string → no command
injection); `stdio:'ignore'`. `build-status.json` is written only under
`.ctoc/index/`. No secrets. The PostToolUse matcher does not widen any gate (the hook
is fail-open, exits 0). No new network surface (Ollama probe is the existing
bounded, abortable GET).

### Step 14: VERIFY
Run `node --test tests/*.test.js` → `# fail 0`, 0 skipped. Lint/typecheck clean
(warnings are bugs). Coverage ≥80% on `wiring.js` + `bootstrap.js`. Confirm existing
plan-index + readme-numbers (16 hook files) + iron-loop-enforcer
(hooks-json-registration) suites still pass.

### Step 15: DOCUMENT
JSDoc every exported function (`getWiring`, `probeEmbeddingSource`, `isBackfillNeeded`,
`kickBackfillBackground`, `runBackfill`) with the fail-open contract stated. Add a
module header to `wiring.js` and `bootstrap.js` mirroring the PI1/PI2/PI3 header
style. Note in each that this is the composition root that turns the dormant PI3
guard/hook LIVE.

### Step 16: FINAL-REVIEW
implementation-reviewer confirms all acceptance criteria map to code + tests, the
capability gate is embedding-source-only (no native probe), backfill is background +
fail-open, the hook is registered, `getWiring()` matches both consumers, and nothing
breaks the menu/pipeline when the embedder is absent. Gate 3 (human approval) before
`done`.

## Acceptance Criteria Mapping

| Plan acceptance criterion | Implemented in | Test |
|---|---|---|
| Capability gate degrades cleanly when no embedding source | `wiring.js` `probeEmbeddingSource` + `degradedReason` | smoke #5, #6 |
| Store opens on every Node, no native prereq | `wiring.js` unconditional `openStore` | smoke #1, #5 |
| First-run backfill populates over existing plans | `bootstrap.js` `runBackfill` → `reconcileIndex` | bootstrap #1 |
| Background build never blocks the menu | `bootstrap.js` `kickBackfillBackground` (detached spawn + unref) | bootstrap #3 |
| Composition root provides query embedder to search | `wiring.js` `embedder` adapter (bare one-arg, `{vectors}`) | smoke #2, #7 |
| Rebuild equivalence | deterministic in-process embed + `reconcileIndex` re-run | bootstrap #1 (re-run variant) |
| Committed runtime smoke test | `tests/plan-index-smoke.test.js` | smoke #1 |
| Never break install / fail-open (NFR) | fail-open in wiring, bootstrap kick, child, overview | smoke #6, bootstrap #4/#6/#8 |

## Security Review (checklist — all PASS by design)

- [x] Path traversal — all paths via `path.join` under project root / `.ctoc/index/`; no user path interpolation.
- [x] Command injection — detached child spawns `process.execPath` with an **array** argv, `stdio:'ignore'`, NO shell.
- [x] Input validation — `getWiring` validates/normalizes `projectPath`; store validates every unit (PI1).
- [x] No secrets — none introduced.
- [x] Safe file ops — `safe-fs` only; writes confined to `.ctoc/index/` + `.ctoc/logs/`.
- [x] Error messages — fail-open logs go to `.ctoc/logs/plan-index-sync.json`; no leak to the user surface.
- [x] Prototype pollution — no untrusted object merge; status file JSON is read defensively (try/catch → null).
- [x] No new network surface — reuses PI2's bounded, abortable `probeOllama` GET.

## Decisions Taken Under Ambiguity (this blueprint)

- **Seam filename = `wiring.js` (not `runtime.js`).** The two dormant consumers
  hard-require `'./plan-index/wiring'` and call `getWiring()`. The plan's original
  `files:` entry `runtime.js` was a mismatch and is corrected to `wiring.js`. (If a
  separate `runtime.js` is desired for the capability-gate logic, it must be
  re-exported through `wiring.js`; the module the consumers load is `wiring.js`.)
- **Backfill trigger = SessionStart + menu-open, both fire-and-forget via a detached
  child** (the plan's "SessionStart kicks a background build" decision, plus a menu
  guard so an already-open session still backfills). A `.build.lock` TTL de-dupes the
  two triggers. No new slash command (constraint honored).
- **`.gitignore` is NOT touched** — `.ctoc/index/` is already ignored (PI1). Removed
  from `files:`.
- **`build-status.json`** (under `.ctoc/index/`) is the parent↔child status channel
  the overview tab reads; chosen over the `background.js` per-plan status files
  because this is a project-level, not plan-level, build.
- **Barrel re-export of `getWiring`** added for PI4–PI6; the two existing consumers
  keep their direct require (out of scope to rewrite).
- **hooks.json matcher = `Write|Edit|MultiEdit`** (the hook self-filters to
  `plans/**/*.md`); no hook-file count change, no README/CLAUDE count edit.


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write tests for the implementation
- [x] Test error conditions
- [x] Run tests - expect RED (failing) — both files fail MODULE_NOT_FOUND (wiring/bootstrap absent)

### Step 9: PREPARE
- [x] Install dependencies if needed — none; no engines bump
- [x] Check prerequisites — openStore, embed({vectors,source}), loadCalibration/runCalibration, probeOllama, reconcileIndex(plansRoot,{store,embedder,calibrationReady,logDir}) all confirmed fresh
- [x] Verify dev environment ready — both dormant consumer contracts (getWiring(); hook needs typeof embedder==='function') confirmed
- [x] Create directories/config if needed — .ctoc/index/ already git-ignored (.gitignore:18)

### Step 10: IMPLEMENT
- [x] Implement the feature — wiring.js (getWiring singleton + probeEmbeddingSource + embedder adapter), bootstrap.js (isBackfillNeeded/kickBackfillBackground/runBackfill + --backfill child), index.js barrel re-export, hooks.json registration, SessionStart 5a kick, overview.js status line
- [x] Add error handling — fail-open at every layer (store/wiring/kick/child/overview)
- [x] Wire up integration points — actions.js + PostToolUse hook go LIVE unchanged; PI0 tests 17/17 GREEN

### Step 11: REVIEW
- [x] Self-review all new code — fixed a require-cycle (index↔wiring): wiring now imports ./store directly (contract-equivalent to the barrel's re-export), eliminating the circular-dependency WARNING (warnings are bugs)
- [x] Verify integration points work together — barrel exports all resolve (getWiring/probeEmbeddingSource/kickBackfillBackground/isBackfillNeeded/openStore/PLAN_SENTINEL) in BOTH load orders; seam-go-live proven (w.store + w.embedder fn)
- [x] Check error handling completeness — fail-open at store/wiring/kick/child/overview; embedder one-arg returns {vectors}; consumers untouched

### Step 12: OPTIMIZE
- [x] Remove redundant operations — no async probe on getWiring's synchronous path; probeEmbeddingSource is the separate async quality-tier gate only
- [x] Optimize critical paths — singleton CACHE (keyed on resolved root) avoids re-openStore per movePlan/hook call; isBackfillNeeded reads only store.size (O(1)-ish, no plans walk)
- [x] Simplify complex code — no change needed; injected-deps path bypasses the cache cleanly for tests

### Step 13: SECURE
- [x] Validate inputs (no path traversal) — all paths via path.join under .ctoc/index and .ctoc/logs; getWiring normalizes projectPath via path.resolve
- [x] Sanitize outputs — status/log JSON written defensively; no secrets emitted
- [x] No secrets in code — none introduced
- [x] Safe file operations — safe-fs only (no raw fs); detached child spawns process.execPath with an ARRAY argv (no shell → no command injection), stdio:'ignore'; PostToolUse matcher does not widen any gate

### Step 14: VERIFY
- [x] Run lint + type check — `npx eslint . --max-warnings 0` exit 0; lint.test.js green (fixed a non-literal-require by inlining string-literal requires in the barrel getters); tsc baseline-neutral (5 pre-existing errors unchanged; 0 new from PI0)
- [x] Run ALL tests (TDD Green) — `node --test tests/*.test.js` → # fail 0, 2968 pass, 0 skipped, 0 todo
- [x] Check coverage >= 80% — wiring.js 96.52% line / 86.49% branch; bootstrap.js 93.83% line / 66.13% branch (remaining uncovered = best-effort fail-open catches + the --backfill child entry). readme-numbers green: src/hooks/ stays 16 files (no hook-count bump)
- [x] 0 skipped, 0 flaky tests

### Step 15: DOCUMENT
- [x] Update relevant documentation — module headers on wiring.js + bootstrap.js mirror the PI1/PI2/PI3 style and state that PI0 turns the dormant PI3 guard/hook LIVE
- [x] Add JSDoc comments to new functions — getWiring, probeEmbeddingSource, isBackfillNeeded, kickBackfillBackground, runBackfill all documented with the fail-open contract
- [x] Update CHANGELOG if needed — no CHANGELOG file in this project (version via VERSION + commit messages); N/A

### Step 16: FINAL-REVIEW
- [x] Verify steps 8-15 completed correctly — all acceptance criteria map to code + tests (smoke #1-8, bootstrap #1-8b)
- [x] All quality checks passed — full suite # fail 0 (2970 pass), eslint exit 0, tsc baseline-neutral, coverage ≥80% new modules, 16 hook files (no bump)
- [x] Manual verification — seams-go-live proven: getWiring resolves w.store + typeof w.embedder === 'function' (both consumers' predicates satisfied)
- [x] Ready for human review — Gate 3 (human approval) required before done; plan NOT moved by the executor

---

## PI0 Execution — Decisions Taken Under Ambiguity (Steps 8–16)

- **Require-cycle resolution (wiring):** `wiring.js` imports `openStore` from `./store`
  DIRECTLY, not the `./index` barrel. The barrel re-exports `getWiring` from wiring, so
  importing the barrel inside wiring formed `index → wiring → index` and produced a
  partially-initialized barrel (an `undefined` re-export + a Node circular-dependency
  WARNING — and warnings are bugs). `openStore` lives in `./store`; the barrel is a pure
  re-export of it, so this is contract-equivalent.
- **Require-cycle resolution (barrel):** the barrel's PI0 re-exports (`getWiring`,
  `probeEmbeddingSource`, `kickBackfillBackground`, `isBackfillNeeded`) are exposed as
  LAZY GETTERS (deferred to first property access), not eager requires. Eagerly requiring
  `bootstrap` at barrel-load pulled in `reconcile → sync-unit → content-hash`, and
  `content-hash`/`reconcile` require the barrel back for `PLAN_SENTINEL` — the cycle left
  `content-hash.hashUnit` transiently undefined and broke all 14 PI3 reconcile/sync tests.
  Lazy getters break the cycle: PI1/PI3 consumers that only touch `openStore`/`PLAN_SENTINEL`
  never trigger the deeper graph. Each getter is fail-open (undefined if the submodule
  cannot load) and uses a STRING-LITERAL require (no `security/detect-non-literal-require`).
- **State tracking:** the plan file stays in `plans/todo/` with `state: in-progress` in
  frontmatter (this repo tracks in-progress as a YAML state, not a directory). The executor
  did NOT cross any human gate; Gate 3 (review → done) remains the human's.
- **SessionStart placement:** the backfill kick is step 5a — immediately after the plans/
  directory-creation loop, before the CLAUDE.md lessons block — using the in-scope
  `projectPath`. Double-guarded (try/catch + kickBackfillBackground is itself non-throwing).
- **overview placement:** the `Semantic Index` status line renders right after the `Review`
  count in the Pipeline section, via a local fail-open `readIndexStatus` (missing/corrupt →
  null → NO line, dashboard unchanged). Added `path` + `safe-fs` imports at the top.
- **Embedder-source availability signal:** `isIndexAvailable()` is the SYNCHRONOUS
  store-constructed signal (what movePlan/the hook gate on). Embedding-source reachability is
  the async quality-tier signal via `probeEmbeddingSource`/`degradedReason`, never flipping
  the store off — matching the pivot note (in-process fallback keeps availability true).
