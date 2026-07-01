---
title: "Local Semantic Plan Index — Hybrid Retrieval & CRUD-Mirrored Vector Store"
created: "2026-06-28T00:00:00Z"
priority: HIGH
type: vision
status: decomposed
program: ctoc-planning-intelligence
order: 1
approved_by: human
approved_at: "2026-06-28T00:00:00Z"
gate_crossed: "vision → done (decomposed 2026-06-28)"
---

# Local Semantic Plan Index — Hybrid Retrieval & CRUD-Mirrored Vector Store

## The Load-Bearing Principle

**The `.md` plans are the single source of truth; the index is a rebuildable,
self-healing cache that never drifts from them.** A local, on-device semantic
index makes planning *intelligent* — cross-correlation, duplicate prevention,
conflict awareness — without ever becoming a second source of truth that can lie.
Every capability degrades to "rebuild from the plans" and every machine builds
its own index against its own hardware.

## Problem Statement

1. **No cross-correlation between plans.** Plans are isolated `.md` files. There
   is no way to ask "what else relates to this?", "is this a duplicate?", or
   "do these two plans touch the same code?" — the founding motivation for this
   work.
2. **Phantom and duplicate backlog rots silently.** Proven first-hand this
   session: B1 and B2 sat complete-but-stranded in `in-progress/` for six weeks;
   the prior HANDOFF records a phantom backlog of duplicate/shipped plans that
   had to be hand-cleaned, and the decompose→refine pipeline has produced
   overlapping plans nobody caught.
3. **Agents decompose blind.** `vision-decomposer` and `implementation-planner`
   cannot see neighboring plans, so they re-propose work that already exists.
4. **Exact-token recall is fragile.** Identifiers (`SP1`, `parseYAMLShallow`),
   file paths, and acronyms are exactly what pure dense embeddings miss.

## Vision

A local hybrid-retrieval index over every plan — **classical lexical (BM25) and
dense vector search, fused** — that powers four capabilities, shippable in order:
**semantic search → related-plans surfacing → duplicate-on-create guard →
conflict/dependency detection**. Embeddings are produced on local hardware,
within a five-second-per-plan budget, and every create/move/edit/rename/delete on
the `.md` files is mirrored into the store.

> ### Architecture pivot (2026-07-01, human-directed) — storage HOW only
> The store is **no longer `node:sqlite` + FTS5 + `sqlite-vec`**. It is a
> **pure-JavaScript in-memory store backed by a single JSON file**
> (`.ctoc/index/plan-index.json`) with **brute-force cosine** search. The WHY, the
> vision, and the four capabilities below are **unchanged** — only the storage
> mechanism changes. Rationale (established with the CTO): CTOC's corpus is ~1,720
> units (60 plans, ~1.6 MB) — two orders of magnitude below the ~10k–100k crossover
> where an approximate-nearest-neighbour index beats brute force. Brute-force cosine
> over 1,720 × 384-dim vectors is sub-millisecond and the whole index is ~2.6 MB, so
> a native vector database is premature optimisation. Pure-JS is right-sized,
> **cross-platform for free** (CLAUDE.md non-negotiable), and eliminates the native
> binary blocker (per-platform vendoring, musl/glibc ABI, `node:sqlite` experimental
> status). RRF fusion (below) is index-agnostic, so retrieval quality is unchanged.
> The stack bullets below are updated to reflect this; the capability and
> success-criteria sections are untouched.

### Decisions locked during ideation (2026-06-28, via /ask-me-questions)

- **Scope — FULL CROSS-CORRELATION SUITE.** Semantic search + related-plans
  surfacing + duplicate-on-create guard + conflict/dependency detection
  (the last reuses the `files:` frontmatter CTOC already maintains: vector
  similarity **and** declared-file overlap). Delivered incrementally,
  retrieval first.
- **Granularity — HYBRID, MULTI-VECTOR, HYBRID-RAG.** One plan-level summary
  vector (coarse retrieval/clustering) plus one vector per section (precise
  overlap/conflict) — the parent-document pattern. Fused with classical lexical
  retrieval (FTS5/BM25) via Reciprocal Rank Fusion so exact tokens are never
  missed. Structured frontmatter (`files:`, `parent_vision`, step labels) stays
  queryable metadata, never buried in an embedding.
- **Store — PURE-JS IN-MEMORY + SINGLE JSON FILE (pivoted 2026-07-01).** A
  pure-JavaScript store keyed by `(planPath, sectionId)`, persisted to one JSON file
  at `.ctoc/index/plan-index.json` (embeddings base64-encoded, byte-exact), with
  **brute-force cosine** nearest-neighbour search. Zero native dependencies, zero
  install, cross-platform for free. Atomic writes (temp-file + rename via
  `src/lib/safe-fs.js`) make persistence crash-safe; a concurrency lock with
  reload-under-lock + stale-steal keeps the menu + `PostToolUse` hook +
  reconciliation sweep from clobbering or hanging. The dense half is this
  brute-force cosine index; the lexical (BM25) half is a pure-JS inverted index built
  on top in a later slice — both fused by RRF (below).
  *(Superseded design: `node:sqlite` + FTS5 + `sqlite-vec` `vec0` — abandoned as
  premature optimisation and a cross-platform binary-vendoring cost at this corpus
  scale.)*
- **Engine — OLLAMA-FIRST, IN-PROCESS FALLBACK, FIRST-RUN CALIBRATION.** Probe
  the hardware; use Ollama with acceleration when present (best quality), fall
  back to an in-process engine (ONNX / WebAssembly) when absent. A first-run
  micro-benchmark measures real encode latency and pins the largest model whose
  per-plan batch stays under five seconds — measured, never assumed. FTS5 owns
  the lexical half, so the model only needs strong dense vectors.
- **Sync — RECONCILIATION BACKBONE + HOT-PATH TRIGGERS.** A content-hash diff
  sweep guarantees the database matches the filesystem regardless of who changed
  a file (menu, command-line mover, raw edits, manual editor saves, `git pull`);
  wrappers in `actions.js` and the `PostToolUse` hook re-embed the single touched
  file instantly for a live menu. One idempotent upsert, many triggers,
  self-healing.

## Decisions Taken Under Ambiguity (no-stub rule — to confirm at Gate 0)

- **Cache location & lifecycle:** `.ctoc/index/plan-index.json`, git-ignored and
  rebuildable; the embedding dimension is per-machine (inferred from the calibrated
  model's first vector) and never committed. Whitelisted by the enforcement hook
  (`.ctoc/*`).
- **Fusion:** Reciprocal Rank Fusion, k = 60; cosine distance for dense KNN.
- **Plan-summary text:** deterministic extraction (title + frontmatter intent +
  section headings) — no LLM summarization call, for determinism and speed.
- **Calibration target:** model selected so measured p95 ≤ ~3 s per plan, holding
  margin under the 5 s ceiling; embedding runs asynchronously so the menu never
  blocks.
- **Distribution:** the store has **no native binary and no runtime dependency** —
  it is pure JavaScript on Node built-ins, so it ships and runs cross-platform with
  nothing to vendor or install (the pivot's central win). The only runtime dependency
  in the whole vision is the *embedding engine* (PI2), which arrives via Ollama pull
  or a lazy download to the `~/.ctoc` cache and is isolated entirely behind the index
  module so the rest of CTOC stays dependency-free.
- **Duplicate-guard threshold:** tunable in `.ctoc/settings.yaml`; warns, never
  blocks.

## Success Criteria

1. **Search:** a natural-language query returns relevant plans ranked by fused
   BM25 + vector score; exact-token queries (an identifier, a file path) succeed
   via the lexical half.
2. **Related plans:** opening or creating a plan surfaces its nearest neighbors.
3. **Duplicate guard:** creating a plan semantically close to an existing one
   raises a warning with the overlapping plan named.
4. **Conflict detection:** plans that are vector-similar **and** share `files:`
   entries are flagged as potential conflicts.
5. **CRUD mirroring (regression-grade):** create, move, edit, rename, and delete
   each reflect in the database; a manual editor save and a simulated `git`
   change are both caught by the reconciliation sweep; deleting the cache and
   rebuilding from the plans reproduces the same index.
6. **Budget:** embedding one plan completes within five seconds on the
   calibrated model; the menu hot path shows no measurable regression.
7. **Cross-platform:** the store and engine resolve correctly on macOS, Linux,
   and Windows (binary selected by `process.platform`/`arch`).
