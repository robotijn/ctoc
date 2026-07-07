---
title: "PI0 — Bootstrap, Runtime Capability-Gate & Composition Root"
created: "2026-06-28T00:00:00Z"
type: feature
status: functional
priority: HIGH
parent_vision: "done/local-semantic-plan-index.md"
program: ctoc-planning-intelligence
order: 4
depends_on:
  - pi1-index-store-and-schema
  - pi2-embedding-engine
  - pi3-reconciliation-sync
files:
  - "src/lib/plan-index/runtime.js"
  - "src/lib/plan-index/bootstrap.js"
  - "src/lib/plan-index/index.js"
  - "src/hooks/SessionStart.js"
  - "src/tabs/overview.js"
  - ".gitignore"
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
