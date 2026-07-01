---
iron_loop: true
approved_by: human
approved_at: 2026-07-01T12:41:14.047Z
gate_crossed: implementation → todo
---

---
approved_by: human
approved_at: 2026-06-28T21:34:58.493Z
gate_crossed: functional → implementation
---

---
title: "PI1 — Pure-JS Plan-Index Store (In-Memory + JSON Persistence)"
created: "2026-06-28T00:00:00Z"
updated: "2026-07-01T00:00:00Z"
type: feature
status: implementation
iron_loop: true
priority: HIGH
parent_vision: "done/local-semantic-plan-index.md"
program: ctoc-planning-intelligence
order: 1
depends_on: []
acceptance_criteria_count: 20
risk_level: MEDIUM
files:
  - "src/lib/plan-index/store.js"
  - "src/lib/plan-index/index.js"
  - "src/lib/settings.js"
  - ".gitignore"
  - "tests/plan-index-store.test.js"
gate: "Pending Approval (Gate 2: implementation → todo)"
---

# PI1 — Pure-JS Plan-Index Store (In-Memory + JSON Persistence)

> **Architecture pivot (human-directed, 2026-07-01).** This slice was previously
> "Index Store, Schema & sqlite-vec Bootstrap" — `node:sqlite` + FTS5 + the
> `sqlite-vec` (`vec0`) native extension. That design is abandoned in favour of a
> **pure-JavaScript in-memory store backed by a single JSON file**, with brute-force
> cosine search. Rationale (established with the CTO): CTOC's corpus is ~1,720 units
> (60 plans, ~1.6 MB of `.md`) — two orders of magnitude below the ~10k–100k
> crossover where an approximate-nearest-neighbour (ANN) index beats brute force.
> Brute-force cosine over 1,720 × 384-dim vectors is sub-millisecond; the whole
> index is ~2.6 MB. A native vector database is premature optimisation. Pure-JS is
> right-sized, cross-platform **for free** (CLAUDE.md non-negotiable), and deletes
> the native-binary blocker (vendoring, per-platform resolution, musl/glibc ABI,
> `node:sqlite` experimental status). **Everything below is the pure-JS design.**

## Problem Statement

CTOC has no persistent store capable of holding a dense-vector representation of
plans alongside their queryable metadata. Without a rebuildable local store that
maps `(planPath, sectionId)` → embedding + metadata and answers a nearest-neighbour
query, none of the four cross-correlation capabilities — semantic search,
related-plans surfacing, duplicate guard, conflict detection — can exist. This is
the zero-dependency foundation every other PI slice builds on. Every other PI calls
this slice's primitives; nothing in this slice depends on any other PI.

The store must be **cross-platform with zero native dependencies** (no compiled
binaries, no per-platform resolution), **fail-open** (a corrupt or absent index
never crashes the live menu — it rebuilds), and **safe under concurrent access**
(the menu, the `PostToolUse` hook, and the reconciliation sweep can all touch the
index at once without lost updates or hangs).

## Business Alignment

**Job to Be Done:** When CTOC needs to store or retrieve a plan's vector and
metadata, I want an in-memory store with a stable CRUD + search API persisted to a
single JSON file, so I can rely on all four cross-correlation capabilities working
correctly against a consistent, rebuildable store — on macOS, Linux, and Windows,
with nothing to install.

**Impact Map:**
- **Goal:** Establish the storage + retrieval foundation for the semantic layer
  (vision success criteria 1–5, 7), right-sized to CTOC's actual corpus.
- **Actor:** CTOC pipeline components (agents, scripts, hooks) and, by extension,
  the CTO/developer using CTOC.
- **Impact:** Every plan write is mirrored into a consistent, queryable in-memory
  store persisted to `.ctoc/index/plan-index.json`; the index is rebuildable from
  the `.md` plans at any time on any machine with **zero** setup.
- **Deliverable:** `src/lib/plan-index/store.js` — a pure-JS store with
  `openStore` / `upsertUnit` / `getUnit` / `deleteUnit` / `moveUnit` /
  `getFilesForPlan` / `search` / `save`, atomic JSON persistence via
  `src/lib/safe-fs.js`, and a designed-out concurrency model.

## User Stories

**As a** CTOC pipeline component (PI2, PI3, PI4), **I want** `upsertUnit` /
`getUnit` / `deleteUnit` / `moveUnit` / `search(queryEmbedding, k, opts)`, **so
that** PI3 can mirror plan changes atomically and PI4 can run nearest-neighbour
retrieval, without either knowing how the store is implemented.

**As a** CTOC developer or CI runner, **I want** the store to open and operate with
**no native binary, no network, and no install step**, **so that** the index works
identically in offline, air-gapped, containerised (incl. Alpine/musl), and CI
environments from first run — the cross-platform guarantee is structural, not
vendored.

**As a** CTO watching the live menu, **I want** a corrupt or half-written index to
silently rebuild rather than crash, and concurrent writes from the hook + sweep to
never clobber each other or hang the menu, **so that** the intelligence layer is
invisible when healthy and self-heals when not.

## Acceptance Criteria

- [ ] **AC1 — Scenario: openStore on an absent file yields an empty, usable store**
  Given `.ctoc/index/plan-index.json` does not exist on disk
  When `openStore(jsonPath)` is called
  Then a usable store is returned, `search(anyQuery, 5)` returns `[]`, no file is
  written to disk until `save()` is called, and nothing throws

- [ ] **AC2 — Scenario: openStore loads a persisted index losslessly**
  Given a valid `plan-index.json` with N units previously written by `save()`
  When `openStore(jsonPath)` is called
  Then `getUnit(planPath, sectionId)` returns each unit with every metadata field
  intact and its `embedding` as a `Float32Array` whose bytes equal the persisted
  bytes (`Buffer.compare === 0`)

- [ ] **AC3 — Scenario: corrupt/invalid index file → fail-open rebuild (never throws)**
  Given `plan-index.json` contains malformed JSON, or valid JSON of the wrong shape
  (missing `units`, wrong `version`, non-array `units`)
  When `openStore(jsonPath)` is called
  Then an empty, usable store is returned, a `warn` is appended to
  `.ctoc/logs/plan-index.json`, and nothing is thrown into the caller (the menu
  never crashes on a poisoned cache; the index is a rebuildable cache)

- [ ] **AC4 — Scenario: upsertUnit + getUnit round-trip (embedding byte-for-byte)**
  Given the store is open
  When `upsertUnit({ planPath, sectionId, kind: 'section', text, embedding:
  Float32Array(384), files, parentVision, stepLabel, contentHash })` is called
  Then `getUnit(planPath, sectionId)` returns an object with all fields matching the
  input — including `contentHash`, `files` (as an array), `parentVision`, `kind` —
  and the `embedding` as a `Float32Array` equal float-for-float to the input
  (Float32 precision preserved; no lossy conversion)

- [ ] **AC5 — Scenario: upsertUnit is an idempotent replace keyed on (planPath, sectionId)**
  Given a unit already exists at `(p, s)`
  When `upsertUnit` is called again with the same `(p, s)` and new text/embedding
  Then the stored unit is replaced (not duplicated), the total unit count is
  unchanged, and `getUnit(p, s)` returns the new values

- [ ] **AC6 — Scenario: getUnit on a miss returns null and never throws**
  Given `(p, s)` is not present
  When `getUnit(p, s)` is called
  Then it returns `null` (never throws, never returns a partial object)

- [ ] **AC7 — Scenario: deleteUnit removes a unit; absent delete is a no-op**
  Given a unit exists at `(p, s)`
  When `deleteUnit(p, s)` is called
  Then it returns `true`, `getUnit(p, s)` returns `null`; and a subsequent
  `deleteUnit(p, s)` returns `false` without throwing

- [ ] **AC8 — Scenario: moveUnit re-paths a plan's units without re-embedding**
  Given units exist for `plans/todo/x.md` (a plan-level unit and ≥1 section unit),
  each with a stored `embedding` and `contentHash`
  When `moveUnit('plans/todo/x.md', 'plans/in-progress/x.md')` is called
  Then every matching unit's `planPath` becomes `plans/in-progress/x.md`, the
  `embedding` and `contentHash` of each are unchanged byte-for-byte (no re-embed),
  the return value is the count of re-pathed units, `getUnit('plans/todo/x.md', …)`
  returns `null`, and moving a non-existent `fromPath` returns `0`

- [ ] **AC9 — Scenario: getFilesForPlan returns a plan's declared files**
  Given a plan-level unit upserted for `pi6-conflict.md` with
  `files: ['src/lib/a.js', 'src/lib/b/**']`
  When `getFilesForPlan('pi6-conflict.md')` is called
  Then it returns `['src/lib/a.js', 'src/lib/b/**']`; for a plan with no plan-level
  unit (or empty `files`) it returns `[]` and never throws; the lookup is keyed on
  plan path/slug, not section

- [ ] **AC10 — Scenario: kind separates plan-level and section-level units; bad kind rejected**
  Given units upserted for the same plan path — one `kind: 'plan'` (sentinel
  `sectionId: '__plan__'`) and one `kind: 'section'`
  When they are stored and queried
  Then both coexist and are individually retrievable, and `upsertUnit` with an
  invalid `kind` (e.g. `'unknown'`) throws a clear `Error` before any state changes

- [ ] **AC11 — Scenario: search ranks by cosine angle, not magnitude**
  Given the store holds unit A with embedding `[10, 1, 0]` and unit B with embedding
  `[0.1, 0.995, 0]` (dimension 3)
  When `search([1, 0, 0], 2)` is called
  Then unit A ranks above unit B (cosine sim A ≈ 0.995 > B ≈ 0.100); if Euclidean
  (L2) distance were used the order would reverse (L2 A ≈ 9.06 > B ≈ 1.34) —
  confirming the metric is cosine, not L2

- [ ] **AC12 — Scenario: search honours k and opts (kind filter, self-exclusion)**
  Given a store with mixed `kind: 'plan'` and `kind: 'section'` units across several
  plans
  When `search(q, k, { kind: 'section' })` is called
  Then at most `k` results return, sorted descending by cosine similarity, and every
  result has `kind === 'section'`; and `search(q, k, { excludePlanPath: 'p.md' })`
  returns no unit whose `planPath === 'p.md'`

- [ ] **AC13 — Scenario: search validates query dimension**
  Given the store's dimension is 384
  When `search(Float32Array(512), 5)` is called
  Then it throws a clear `Error` naming the expected dimension (384) and the received
  dimension (512) — a wrong-dimension query is a caller bug, surfaced loudly

- [ ] **AC14 — Scenario: dimension is inferred from the first embedding**
  Given a freshly opened, empty store (`store.dimension === null`)
  When the first `upsertUnit` with a `Float32Array(384)` embedding is applied
  Then `store.dimension === 384` thereafter and persists across `save()`/`openStore`

- [ ] **AC15 — Scenario: dimension mismatch on upsert → full reset + warn (no throw)**
  Given a store at dimension 384 holding ≥1 unit
  When `upsertUnit` is called with a `Float32Array(512)` embedding (the calibrated
  model changed)
  Then all pre-existing units are cleared, `store.dimension` becomes 512, the new
  unit is present, a `warn` is appended to `.ctoc/logs/plan-index.json`, and nothing
  is thrown — the index is a rebuildable cache; PI3 reconciliation re-populates it.
  Post-reset consistency is asserted: exactly one unit remains and it is the new one

- [ ] **AC16 — Scenario: save() persists the canonical shape and round-trips through disk**
  Given a store with several units
  When `save()` is called
  Then `plan-index.json` exists containing `{ version, dimension, units: [...] }`
  where each unit's `embedding` is a **base64 string** (not a JSON number array), no
  `*.tmp-*` sidecar file lingers in the directory, and a fresh `openStore` of that
  file yields units equal (metadata + embedding bytes) to the pre-save store

- [ ] **AC17 — Scenario: atomic write leaves the prior file intact on failure**
  Given a valid `plan-index.json` exists on disk
  When a `save()` fails after serialization but before the rename completes
  (simulated by making the temp write throw)
  Then the original `plan-index.json` is unchanged byte-for-byte (temp-file + rename
  guarantees no torn/partial index is ever observed)

- [ ] **AC18 — Scenario: concurrency — reload-under-lock prevents lost updates (clobber)**
  Given store handle A is open in memory holding unit X, and a *separate* writer
  appends unit Y directly to `plan-index.json`
  When handle A performs `upsertUnit(Z)` (a locked read-modify-write that reloads
  the file under the lock before mutating)
  Then the persisted file contains X, Y, **and** Z — Y is not clobbered by A's stale
  in-memory snapshot. This is the "green tests but the human's menu clobbers the
  index" failure, designed out and asserted

- [ ] **AC19 — Scenario: concurrency — a stale lock is stolen (writes never hang)**
  Given a lock file `plan-index.json.lock` exists with an mtime older than the stale
  threshold (e.g. 10 s)
  When a write acquires the lock
  Then the stale lock is stolen and the write completes within the acquire timeout —
  a crashed lock-holder never hangs the live menu. This is the "green tests but the
  human's menu hangs" failure, designed out and asserted

- [ ] **AC20 — Scenario: concurrency — writes are serialized; reads are lock-free**
  Given a write holds the exclusive lock for its read-modify-write section
  When a second write attempts to acquire the lock while it is held (fresh, not
  stale)
  Then the second write waits (bounded retry/backoff) and succeeds only after the
  first releases — no interleaving; and a concurrent `getUnit`/`search` (read) does
  **not** take the lock and returns from the in-memory snapshot without blocking

## Scope

### In Scope
- `src/lib/plan-index/store.js` — the pure-JS store: an in-memory model keyed by
  `(planPath, sectionId)` plus the CRUD + `search` + `save` API.
- In-memory model: a `Map<compositeKey, unitRecord>` (source of truth for CRUD) whose
  values carry the metadata, the raw `embedding` (`Float32Array`, lossless), and a
  derived, in-memory-only `_norm` (precomputed L2 norm) for fast cosine. `search`
  iterates `map.values()` — O(N·dim) brute force, right-sized (see Decision D2).
- Single-file JSON persistence at `.ctoc/index/plan-index.json`, shape
  `{ version, dimension, units: [...] }`; embeddings stored as **base64 of the
  `Float32Array` buffer** (compact + byte-exact — Decision D3).
- Atomic writes via `src/lib/safe-fs.js` only: serialize → `safeFs.writeFileSync` to
  a temp sibling → `safeFs.renameSync` over the target (Decision D4). **No raw `fs`.**
- Fail-open `openStore`: absent file → empty store; corrupt/wrong-shape file → warn
  + empty store; never throws into the caller (Decision D5).
- Concurrency model: exclusive lock file (`plan-index.json.lock`) guarding every
  read-modify-write, with reload-under-lock, bounded acquire retry, and stale-lock
  steal; reads are lock-free against the in-memory snapshot (Decision D6). A
  `withBatch(fn)` write path takes the lock once for reconciliation's many upserts.
- Cosine similarity implemented once (`dot` / `norm`), zero-vector-guarded; query
  dimension validated at `search`.
- `kind` field (`'plan' | 'section'`) validated at `upsertUnit`; plan-level units use
  the reserved `sectionId: '__plan__'` sentinel so `(planPath, sectionId)` is always
  a non-null composite key and `getFilesForPlan` can address the plan-level row.
- `src/lib/plan-index/index.js` — barrel exporting the public API (the only entry
  point other CTOC code imports).
- `.gitignore` entry for `.ctoc/index/` (the JSON index is a git-ignored, rebuildable
  cache).
- Forward-declared `plan_index` block in `SETTINGS_SCHEMA` in `src/lib/settings.js`
  (keys `engine_preference`, `ollama_base_url` for PI2; `duplicate_threshold` for
  PI5/PI6) — PI1 reads **no** settings at runtime; these are additive stubs so
  downstream slices are not stranded (Decision D8).
- `tests/plan-index-store.test.js` — covers all 20 acceptance criteria with tmp-dir
  JSON fixtures, `node:test`, **zero native binaries and zero network in CI**.

### Out of Scope
- Producing embeddings / choosing or calibrating the model (PI2).
- Deciding what or when to re-embed; the reconciliation sweep + hot-path triggers
  (PI3) — this slice only exposes the primitives (incl. `withBatch`) PI3 drives.
- Lexical BM25 retrieval and Reciprocal Rank Fusion (PI4) — PI4 builds ranking
  *on top of* this store's brute-force cosine; RRF is index-agnostic, so ranking
  quality is identical to the abandoned FTS5 + sqlite-vec + RRF plan.
- Duplicate-guard thresholds / conflict detection (PI5–PI6).
- UI or menu surfacing of any kind.
- Any native binary, compiled extension, per-platform resolution, or `node:sqlite`
  (deleted by the pivot).
- An approximate-nearest-neighbour (ANN) index — premature at CTOC's scale; the
  brute-force scan is the deliberate, documented choice (Decision D2).

## Test Plan

Framework: Node `--test` (matches the rest of the CTOC suite). **All tests run with
zero network and zero native binaries.** Temp indexes use
`fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-idx-'))` and are cleaned up. Every ST
below is a distinct `test()` with a meaningful assertion (no empty catches, no
assertionless passes, no mocked-away core logic — the store and its file I/O are
exercised for real).

| Test ID | Maps AC | Description | Key assertion |
|---------|---------|-------------|---------------|
| ST-01 | AC1  | openStore on absent file | usable store; `search` → `[]`; no file created pre-`save`; no throw |
| ST-02 | AC2  | openStore loads persisted units | every field intact; `Buffer.compare(inBytes, outBytes) === 0` |
| ST-03 | AC3  | corrupt/invalid file → fail-open | garbage & wrong-shape both → empty store + `warn` logged; no throw |
| ST-04 | AC4  | upsert + getUnit round-trip | all fields incl. `kind`/`contentHash`/`files`(array); embedding float-for-float equal |
| ST-05 | AC5  | idempotent replace on (p,s) | count unchanged after re-upsert; new values returned |
| ST-06 | AC6  | getUnit miss → null | returns `null`; never throws |
| ST-07 | AC7  | deleteUnit + no-op delete | first → `true`, `getUnit`→`null`; second → `false`, no throw |
| ST-08 | AC8  | moveUnit re-paths w/o re-embed | all units re-pathed; embedding+contentHash byte-for-byte unchanged; count returned; missing from→0 |
| ST-09 | AC9  | getFilesForPlan | returns declared globs; no plan-level row → `[]`; never throws |
| ST-10 | AC10 | kind separability + bad kind | plan+section coexist & retrievable; `kind:'unknown'` throws before mutation |
| ST-11 | AC11 | cosine ranks by angle not magnitude | A`[10,1,0]` ranks above B`[0.1,0.995,0]` for query `[1,0,0]`; L2 would reverse |
| ST-12 | AC12 | search k + kind filter + exclude | ≤k, sorted desc; all `kind:'section'`; excluded planPath absent |
| ST-13 | AC13 | search query-dimension validation | wrong-dim query throws; message names expected(384) + got(512) |
| ST-14 | AC14 | dimension inferred from first upsert | `dimension` null→384; persists across save/open |
| ST-15 | AC15 | dimension mismatch → full reset + warn | prior units gone; `dimension`=512; exactly the new unit remains; `warn` logged; no throw |
| ST-16 | AC16 | save shape + disk round-trip | file has `{version,dimension,units}`; embedding is base64 string; no `*.tmp-*` left; reopen equal |
| ST-17 | AC17 | atomic write, prior file intact | injected temp-write failure → original file byte-for-byte unchanged |
| ST-18 | AC18 | reload-under-lock prevents clobber | external append (Y) survives handle-A `upsert(Z)`; file has X+Y+Z |
| ST-19 | AC19 | stale lock stolen (no hang) | backdated `.lock` mtime → acquire steals it; write completes within timeout |
| ST-20 | AC20 | writes serialized, reads lock-free | held lock blocks a fresh 2nd acquire until release; `getUnit`/`search` never block |

## Risks

### Technical Risks
- **Concurrency correctness (the primary residual risk).** Menu + `PostToolUse` hook
  + reconciliation sweep can all write the single JSON file. A naive last-writer-wins
  loses updates ("clobber"); a naive lock that a crashed process holds hangs the menu.
  - Likelihood: HIGH that concurrent writes occur; MEDIUM that a naive design would
    corrupt/lose data.
  - Impact: MEDIUM (a rebuildable cache — reconciliation self-heals — but a live
    clobber/hang is a bad human experience).
  - Mitigation: exclusive-lock + reload-under-lock + stale-steal + lock-free reads +
    atomic temp/rename (Decision D6); made a tested acceptance criterion
    (AC18/AC19/AC20) precisely so "green tests but the menu hangs/clobbers" is
    designed out, not discovered in production.

- **Brute-force scan cost at growth.** `search` is O(N·dim). At N ≈ 1,720 today the
  scan is sub-millisecond; the design is right-sized, not future-proofed to millions.
  - Likelihood: LOW (corpus grows slowly).
  - Impact: LOW until ~50k units, then noticeable.
  - Mitigation: documented O(N·dim) with headroom to ~50k (Decision D2); the drop-in
    optimisation (a packed contiguous `Float32Array` + pre-normalised vectors, or an
    ANN index) is noted as a future option gated on a real measurement, never adopted
    speculatively.

- **Embedding precision on persistence.** Storing float32 as JSON numbers risks
  verbosity and reliance on float round-trip subtleties.
  - Likelihood: LOW with the chosen encoding.
  - Impact: MEDIUM (a silently lossy embedding degrades ranking).
  - Mitigation: base64 of the raw `Float32Array` buffer is byte-exact and ~half the
    size of a number array (Decision D3); AC4/AC16 assert byte-for-byte equality
    through memory and through disk.

- **Cross-platform file semantics.** Atomic replace and locking must behave on
  macOS, Linux, and Windows.
  - Likelihood: LOW.
  - Impact: MEDIUM (Windows rename-over-existing and lock steal).
  - Mitigation: temp file is created in the **same directory** (same volume) as the
    target so `renameSync` is atomic on all three OSes; all paths via `path.join`;
    all I/O via `safe-fs`; exclusive create via `writeFileSync(lockPath, …, { flag:
    'wx' })` is atomic cross-platform.

### Dependency Risks
- **PI2/PI3/PI4 are gated on PI1.** PI1 is the critical-path foundation; no other PI
  can integration-test against a real store until it ships.
  - Likelihood: HIGH (structural).
  - Impact: MEDIUM (down from HIGH — the pivot removes the native-binary blocker, so
    PI1 can be built and shipped immediately with no maintainer/vendoring step).
  - Mitigation: PI1 has no upstream dependency and, post-pivot, no out-of-band
    prerequisite; it can begin at once.

## Rollback

1. Delete `.ctoc/index/plan-index.json` (git-ignored; no committed data loss).
2. Revert `src/lib/plan-index/` and `tests/plan-index-store.test.js` to the prior
   commit.
3. Revert the additive `plan_index` block in `src/lib/settings.js` and the
   `.gitignore` line.
4. The rest of CTOC is unaffected — all plan-index paths are behind the
   `src/lib/plan-index/index.js` barrel; no existing CTOC code imports them yet.

## Dependencies

- **`src/lib/safe-fs.js`** (LH1, landed) — the mandated filesystem choke point; all
  store I/O routes through it (`readFileSync`, `writeFileSync`, `renameSync`,
  `existsSync`, `statSync`, `unlinkSync`, `mkdirSync`).
- **Node built-ins only** — no npm packages, no native modules, no `node:sqlite`.
- PI0 constructs the store at the composition root (post-pivot this is trivial — the
  pure-JS store is *always available*, so PI0's native-capability probe is deleted;
  PI0 simply calls `openStore`).
- PI2 produces embeddings and drives the per-machine dimension by upserting vectors
  of that dimension (the store infers/locks it — Decision D7).
- PI3 mirrors plan changes via `upsertUnit`/`deleteUnit`/`moveUnit`/`withBatch`.
- PI4 runs `search` and fuses it with BM25 via RRF.

## Cross-Plan Impact (flagged for later alignment — NOT rewritten here)

The pivot changes downstream functional stubs. These are noted so the alignment is
not lost; each is re-planned in its own slice, not here:

- **PI0 (bootstrap) — simplifies.** The pure-JS store is always available, so PI0's
  native-capability probe (`node:sqlite` present? `vec0` loads? FTS5 compiled?) and
  its "degrade to no-index" branch are **deleted**. PI0 becomes: create `.ctoc/index/`,
  call `openStore`, hold the handle. (Fail-open now lives inside `openStore` itself.)
- **PI2 (embeddings) — unaffected.** Still Ollama-first / in-process fallback /
  first-run calibration; it hands `Float32Array` embeddings to `upsertUnit`.
- **PI3 (reconciliation) — retargeted, same shape.** Content-hash diff sweep +
  hot-path triggers now drive the JSON store's `upsertUnit`/`deleteUnit`/`moveUnit`
  and use `withBatch` for the sweep (one lock acquire for many writes).
- **PI4 (semantic search) — retargeted, same ranking.** BM25 + Reciprocal Rank
  Fusion build on this store's brute-force cosine top-k. RRF is index-agnostic, so
  retrieval quality is identical to the abandoned FTS5 + sqlite-vec + RRF design.

## Decisions Taken Under Ambiguity

- **D1 — Pure-JS in-memory store + single JSON file (the pivot).** Chosen over
  `node:sqlite` + FTS5 + `sqlite-vec`. At ~1,720 units, brute-force cosine is
  sub-millisecond and the index is ~2.6 MB; a native ANN store is premature
  optimisation and imposes a cross-platform binary-vendoring cost that CLAUDE.md's
  zero-native-dependency stance forbids taking on speculatively. Pure-JS is
  right-sized and cross-platform for free.
- **D2 — Map + per-unit `Float32Array`, brute-force scan.** The in-memory model is a
  `Map<"planPath sectionId", unitRecord>`; `search` iterates `map.values()`
  computing cosine — O(N·dim) ≈ 1,720 × 384 ≈ 6.6 × 10⁵ multiply-adds per query,
  microseconds. Generous headroom to ~50k units before it matters. A packed
  contiguous vector array (better cache locality) and/or an ANN index are documented
  **future** options, adopted only on a measured need — not now (no premature
  optimisation).
- **D3 — Embeddings persisted as base64 of the `Float32Array` buffer.** A JSON number
  array bloats (~3–5 KB per 384-dim vector vs ~2 KB base64) and relies on the
  float64→string→float64→float32 round-trip being exact. Base64 of the raw
  little-endian buffer is unconditionally byte-exact **and** compact. In memory the
  raw `Float32Array` is kept (lossless round-trip, AC4); a derived `_norm` (L2 norm)
  is cached in memory for fast cosine and is **not** persisted (recomputed cheaply on
  load — no drift).
- **D4 — Atomic writes via safe-fs temp + rename.** `save()` writes the serialized
  JSON to `plan-index.json.tmp-<pid>-<ts>` (same directory → same volume) via
  `safeFs.writeFileSync`, then `safeFs.renameSync` over the target. `rename` is
  atomic on macOS/Linux/Windows, so a reader never observes a torn/partial index and
  a crash mid-write leaves the prior file intact (AC17). On any failure before the
  rename, the temp file is unlinked in a `catch`.
- **D5 — Fail-open `openStore`.** Absent file → empty store. Present but unparseable,
  or valid JSON of the wrong shape (`version` mismatch, missing/non-array `units`, a
  unit missing required fields) → log a `warn` to `.ctoc/logs/plan-index.json` and
  start empty. `openStore` **never throws** into the menu; the `.md` plans are the
  source of truth and PI3 rebuilds the cache (AC3). This replaces the abandoned
  native "capability gate / degrade" path — fail-open is now intrinsic to the store.
- **D6 — Concurrency: exclusive lock + reload-under-lock + stale-steal; lock-free
  reads.** The single-JSON-file requirement forces serialising the read-modify-write
  to prevent lost updates. Every mutating op (`upsertUnit`/`deleteUnit`/`moveUnit`/
  `save`/`withBatch`) acquires `plan-index.json.lock` via
  `safeFs.writeFileSync(lockPath, payload, { flag: 'wx' })` (atomic exclusive create),
  **reloads the file from disk under the lock** (so concurrent external writes are
  merged, not clobbered — AC18), applies the mutation, atomically saves, then unlinks
  the lock. Acquire uses a bounded retry with short backoff; a lock whose mtime
  exceeds a stale threshold (default 10 s) is **stolen** (unlinked + re-acquired) so a
  crashed holder never hangs the menu (AC19). Reads (`getUnit`/`search`) take **no**
  lock — they serve the in-memory snapshot and tolerate being at most one write stale
  (the vision explicitly permits reader staleness), so the live menu never blocks on a
  writer (AC20). Alternatives weighed and rejected: *sole-writer daemon* (CTOC has no
  daemon; writes originate from independent hook/menu processes); *per-plan shard
  files* (contradicts the single-file requirement and complicates `search`);
  *lock-free optimistic mtime CAS* (has a TOCTOU window between check and rename that
  the exclusive-create lock closes). The exclusive-create lock is the correct atomic
  primitive at this scale and is directly testable.
- **D7 — Dimension is inferred and store-owned.** `store.dimension` is `null` until
  the first embedding is upserted, then locked to that length (PI2's calibrated model
  determines it — PI1 never picks a dimension). A later upsert whose embedding
  dimension differs signals the model changed: the store performs a **full reset**
  (clear all units, adopt the new dimension, log a `warn`, do **not** throw) because
  every stored vector is now incomparable and the index is a rebuildable cache (AC15).
  A `search` query of the wrong dimension is a *caller bug*, not a model change, so it
  **throws** a clear error (AC13) — reset vs throw is deliberately asymmetric.
- **D8 — Forward-declared `plan_index` settings block retained.** PI2/PI5/PI6 still
  need `engine_preference`, `ollama_base_url`, `duplicate_threshold`; these are
  additive `SETTINGS_SCHEMA` entries only (each with `key`/`label`/`type`/`default`;
  the `select` default is within `options`) so the existing settings suite is not
  regressed. PI1 reads none of them at runtime. No new settings tab (UI is out of
  scope; the tab-count invariant holds).
- **D9 — `plan_path` is an opaque, verbatim key; normalization is PI3/PI6's job.**
  AC9 passes a bare slug (`pi6-conflict.md`) while other scenarios use full paths
  (`plans/todo/x.md`). PI1 keys on the exact string supplied at upsert and does **no**
  normalization; the barrel JSDoc states this verbatim ("planPath is an opaque key;
  callers must normalize consistently"). Consistent normalization is carried forward
  as a **required PI3 (sync/upsert) and PI6 (conflict / getFilesForPlan) acceptance
  criterion** so the contract is not lost — a deliberate, scoped deferral.
- **D10 — `kind` validated in code (no schema layer).** With no SQL there is no CHECK
  constraint; `upsertUnit` validates `kind ∈ {'plan','section'}` and throws before
  mutating state (AC10). Plan-level units carry the reserved `sectionId: '__plan__'`
  sentinel so the composite key is always non-null and `getFilesForPlan` addresses the
  plan-level row unambiguously.

- **D11 — Implementation-time choices (Steps 8–16, build 2026-07-01).**
  - *Composite key separator:* `\x00` (NUL) between `planPath` and `sectionId` — the
    one byte that can never appear inside a path or id, so the composite key is
    unambiguous. It is a `Map` key only, never passed to the filesystem (so `safe-fs`'s
    NUL guard is not implicated).
  - *`moveUnit` argument validation:* throws on an empty/non-string `fromPath`/`toPath`
    (a caller bug), but a well-formed `fromPath` that matches nothing returns `0` per
    AC8 — the "missing" case is data, not a bug.
  - *`search` defensive `k`:* a non-integer or `k ≤ 0` returns `[]` rather than throwing;
    a wrong-*dimension* query still throws (AC13). Query-shape errors are loud; a
    degenerate `k` is treated as "ask for nothing".
  - *`withBatch` API:* exposed as a lock-free mutation façade (`upsertUnit`/`deleteUnit`/
    `moveUnit` + the reads) passed into `fn`, so PI3's sweep mutates under a single lock
    acquire without the public methods re-entering `withLock` (which would self-deadlock
    against its own lock until timeout).
  - *ST-17 fault injection:* the "temp write fails" scenario is exercised by temporarily
    replacing `safeFs.writeFileSync` to throw only for the `*.tmp-*` sibling path — a
    genuine fault at the fs boundary (exactly what the AC specifies), not a mock of the
    store's own atomic-write logic, which runs for real.
  - *Documentation placement:* the rebuildable-cache contract, JSON shape + base64
    encoding, and concurrency model are documented as comprehensive JSDoc on the barrel
    (`index.js`) and every `store.js` primitive, rather than a separate `README` file —
    the inline docs are the single source of truth and travel with the code.
  - *Verify results:* `tests/plan-index-store.test.js` 20/20 pass, 0 skipped; full suite
    2620 pass / 0 fail / 0 skipped; `eslint . --max-warnings 0` exit 0 (store/index clean
    — proves the safe-fs routing); `tsc --checkJs` at baseline 89 (no new type errors);
    coverage `store.js` 94.15% line / 97.06% funcs, `index.js` 100% (≥80% gate met).
    `settings.test.js`, `environment-mode.test.js`, and `readme-numbers.test.js` remain
    green (the additive `plan_index` block and the new `src/lib/plan-index/` subdirectory
    do not regress the schema-shape or top-level module-count invariants).

---

# Implementation Details

> Generated by implementation-planner (Iron Loop Steps 5 PLAN → 6 DESIGN → 7 SPEC)
> for Gate 2 review. Grounded against the live repo: Node built-ins only,
> `src/lib/safe-fs.js` (LH1, the mandated fs choke point), the `src/lib/settings.js`
> `SETTINGS_SCHEMA`/`getSetting` contract, the `src/lib/enforcement-log.js`
> append-only JSON log pattern, and the prevailing `node:test`
> (`describe`/`test`/`assert`) suite idiom. **Zero native dependencies.**

## Step 5 — PLAN (Technical Approach)

### Module layout (`src/lib/plan-index/`)

Two source modules behind one barrel; dependencies flow inward (`index` → `store`).
No native loader, no schema module, no binaries directory — all deleted by the pivot.

| File | Responsibility | Imports (intra-pkg) | Exports |
|------|----------------|---------------------|---------|
| `store.js` | The pure-JS store: in-memory `Map` model; CRUD (`upsertUnit`/`getUnit`/`deleteUnit`/`moveUnit`/`getFilesForPlan`); `search` (brute-force cosine); `save`/`withBatch`; JSON (de)serialization incl. base64 embeddings; fail-open load; concurrency (lock/reload/steal); cosine + norm; dimension policy; warn-logger. | none (uses `safe-fs`, `path`, `os`) | `openStore(jsonPath, opts?)` |
| `index.js` | Public barrel — the only entry point other CTOC code imports. | `./store` | `openStore` |

### Public API surface (object-store shape)

`openStore(jsonPath, opts?)` returns a **`PlanIndexStore` handle** whose methods are
the primitives. The object shape (not a module singleton) lets tests and PI4 hold
multiple independent stores, and lets each method close over its own `jsonPath`,
in-memory `Map`, `logDir`, and lock path.

```
openStore(jsonPath, opts?)                     → store.js (factory; fail-open load)
store.upsertUnit(unit)                         → locked RMW; returns the stored unit
store.getUnit(planPath, sectionId)             → lock-free; Unit | null
store.deleteUnit(planPath, sectionId)          → locked RMW; boolean
store.moveUnit(fromPath, toPath)               → locked RMW; count re-pathed
store.getFilesForPlan(planPath)                → lock-free; string[]
store.search(queryEmbedding, k, opts?)         → lock-free; ranked [{...unit, score}]
store.save()                                    → locked atomic persist
store.withBatch(fn)                             → one lock acquire; fn mutates; one save
store.dimension                                 → number | null (read-only view)
store.size                                       → unit count (read-only view)
```

`opts` (all optional, with documented defaults): `staleLockMs` (default 10000),
`acquireTimeoutMs` (default 5000), `acquireBackoffMs` (default 25), `version`
(default 1). `search` `opts`: `kind`, `excludePlanPath`, `minScore`.

**All mutations go through the locked RMW helper** so the reload-under-lock invariant
(no lost updates) is never bypassed; reads never lock.

### Change classification & dependency posture

New feature, full-depth, **no upstream PI dependency** (foundation). Touch-set is two
new files under `src/lib/plan-index/`, one new test file, and two additive edits
(`settings.js` schema block, `.gitignore` line). No existing CTOC module imports
plan-index yet, so blast radius is contained behind the barrel (matches Rollback).
Post-pivot there is **no maintainer/vendoring/out-of-band step** — a clean, fully
in-loop build.

## Step 6 — DESIGN (Data Model, Persistence, Concurrency, Ranking)

### 6.1 In-memory model

```
key(planPath, sectionId)  = `${planPath} ${sectionId}`   // NUL: not valid in paths/ids
units: Map<string, UnitRecord>

UnitRecord = {
  planPath:     string,
  sectionId:    string,        // '__plan__' sentinel for kind === 'plan'
  kind:         'plan' | 'section',
  text:         string,
  files:        string[],      // declared file globs (plan-level meaningful; [] otherwise)
  parentVision: string | null,
  stepLabel:    string | null,
  contentHash:  string,
  embedding:    Float32Array,  // raw, lossless
  _norm:        number         // derived L2 norm, in-memory only, NOT persisted
}

dimension: number | null       // inferred from first embedding (D7)
```

### 6.2 Persistence format (`.ctoc/index/plan-index.json`)

```jsonc
{
  "version": 1,
  "dimension": 384,
  "units": [
    {
      "planPath": "plans/todo/x.md",
      "sectionId": "__plan__",
      "kind": "plan",
      "text": "…",
      "files": ["src/lib/a.js", "src/lib/b/**"],
      "parentVision": "vision/ci.md",
      "stepLabel": null,
      "contentHash": "sha256:…",
      "embedding": "<base64 of the Float32Array little-endian buffer>"
    }
  ]
}
```

Serialize: `Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength).toString('base64')`.
Deserialize: `const b = Buffer.from(str, 'base64'); new Float32Array(b.buffer.slice(
b.byteOffset, b.byteOffset + b.byteLength))` — a **copy** so the result never aliases
Node's shared Buffer pool (memory-safety + the byte-for-byte equality of AC2/AC4/AC16).
`_norm` is recomputed on load, not read from JSON.

### 6.3 Fail-open load (`openStore`)

```
1. logDir = path.resolve(path.dirname(jsonPath), '..', 'logs')   // …/.ctoc/logs
2. if !safeFs.existsSync(jsonPath) → empty store (units=Map, dimension=null); return
3. try:
     raw   = safeFs.readFileSync(jsonPath, 'utf8')
     data  = JSON.parse(raw)
     validate: data && data.version === version && Array.isArray(data.units)
     for each u in data.units: validate required fields + decode embedding;
       dimension = dimension ?? u.embedding.length;
       if u.embedding.length !== dimension → treat file as inconsistent (fail-open)
     populate the Map (compute _norm)
   catch (err):
     warnLog('index_load_failed', { message: err.message })
     reset to an empty store (units cleared, dimension=null)   // rebuildable cache
4. never throw
```

### 6.4 Concurrency: locked read-modify-write (the AC18/19/20 core)

```
acquireLock():
  deadline = now + acquireTimeoutMs
  loop:
    try safeFs.writeFileSync(lockPath, `${process.pid}:${Date.now()}`, { flag: 'wx' })
        → acquired; return                       // 'wx' = atomic exclusive create
    catch EEXIST:
        if safeFs.existsSync(lockPath) &&
           (Date.now() - safeFs.statSync(lockPath).mtimeMs) > staleLockMs:
             try safeFs.unlinkSync(lockPath)      // steal the stale lock (AC19)
             continue
        if now > deadline: throw Error('plan-index: lock acquire timeout')  // bounded, never infinite
        sleep(acquireBackoffMs); continue

releaseLock(): try safeFs.unlinkSync(lockPath) catch { /* already gone (stolen) */ }

withLock(fn):
  acquireLock()
  try { reloadFromDisk(); const r = fn(); atomicSave(); return r }   // reload-under-lock (AC18)
  finally { releaseLock() }
```

- `reloadFromDisk()` = the §6.3 load applied to the *current* file, replacing the
  in-memory `Map` — so a concurrent external write is merged before this process
  mutates, and its own mutation lands on top. This is what makes X + Y + Z all
  survive (AC18).
- `atomicSave()` = §6.2 serialize → temp write → rename (D4); temp unlinked on failure
  (AC17).
- `upsertUnit`/`deleteUnit`/`moveUnit` are `withLock(() => …)`. `save()` is
  `withLock(() => {})` (reload+save is a no-op merge + persist). `withBatch(fn)` is
  `withLock(fn)` where `fn` performs many in-memory mutations, then the single
  `atomicSave` at the end (PI3's sweep — one acquire for the whole pass).
- Reads (`getUnit`/`getFilesForPlan`/`search`) **do not** call `withLock`; they read
  the in-memory `Map` directly (AC20, lock-free reads).

`sleep` is a small synchronous busy-wait bounded by `acquireBackoffMs`
(`Atomics.wait` on a throwaway `Int32Array`, cross-platform, no dependency), keeping
the store's API synchronous like the rest of CTOC's fs-bound code.

### 6.5 Ranking: brute-force cosine top-k (`search`)

```
search(q, k, opts = {}):
  if !(q instanceof Float32Array) → throw TypeError
  if dimension !== null && q.length !== dimension →
     throw Error(`plan-index: query dimension ${q.length} != store dimension ${dimension}`)   // AC13
  qNorm = norm(q); if qNorm === 0 → return []                        // zero query → no ranking
  results = []
  for u of units.values():
    if opts.kind && u.kind !== opts.kind → continue                 // AC12
    if opts.excludePlanPath && u.planPath === opts.excludePlanPath → continue
    score = u._norm === 0 ? 0 : dot(q, u.embedding) / (qNorm * u._norm)   // cosine, guarded
    if opts.minScore != null && score < opts.minScore → continue
    results.push({ ...unitView(u), score })
  results.sort((a, b) => b.score - a.score)
  return results.slice(0, k)                                          // top-k, ≤ k
```

`dot`/`norm` are simple loops (no dependency). Complexity O(N·dim + N log N);
at N ≈ 1,720 this is microseconds (Decision D2). `unitView` returns a shallow copy
with a fresh `Float32Array` embedding (never leaks the internal record).

### 6.6 Dimension policy (`upsertUnit`, D7/AC14/AC15)

```
on upsertUnit(unit):
  validate kind, embedding (Float32Array), files (array default []), contentHash
  if dimension === null → dimension = unit.embedding.length            // infer (AC14)
  else if unit.embedding.length !== dimension →                        // model changed
     units.clear(); dimension = unit.embedding.length                  // FULL reset (AC15)
     warnLog('dimension_reset', { from, to: dimension, cleared: <n> })
  store/replace the unit keyed on (planPath, sectionId); compute _norm  // idempotent (AC5)
```

### 6.7 Warn logger (mirrors `src/lib/enforcement-log.js`)

Append `{ timestamp, level: 'warn', event, ...detail }` to
`.ctoc/logs/plan-index.json` via `safeFs` (create `logDir` if missing; cap entries
with rotation). Used by fail-open load (`index_load_failed`) and dimension reset
(`dimension_reset`). `.ctoc/logs/` is already git-ignored — no new ignore rule.

## Step 7 — SPEC (Function Signatures & Behavior)

> Step 7 also runs the implementation-plan-reviewer then the integrator+critic
> (10 rounds) at Gate 2 prep; the contract below is the input to that pass.

### 7.1 `openStore(jsonPath: string, opts?: OpenOpts) → PlanIndexStore`
- `safeFs.mkdirSync(path.dirname(jsonPath), { recursive: true })`; derive `logDir`
  and `lockPath = jsonPath + '.lock'`; run the §6.3 fail-open load. Returns a handle
  exposing the §"Public API surface" methods and the read-only `dimension`/`size`
  views. **Never throws on a bad/absent file** (AC1/AC2/AC3).

### 7.2 `store.upsertUnit(unit) → StoredUnit`
`unit = { planPath, sectionId, kind, text, embedding, files?, parentVision?, stepLabel?, contentHash }`
- Pre-validate (throw clear `Error` before any mutation): `kind ∈ {'plan','section'}`
  (AC10); `embedding instanceof Float32Array` and non-empty; `files` an array
  (default `[]`); `contentHash` a non-empty string; `planPath`/`sectionId` non-empty
  strings. Applies §6.6 dimension policy. Locked RMW (reload-under-lock → mutate →
  atomic save). Idempotent replace keyed on `(planPath, sectionId)` (AC5). Returns the
  stored unit view. Covers AC4, AC5, AC10, AC14, AC15.

### 7.3 `store.getUnit(planPath, sectionId) → StoredUnit | null`
- Lock-free `Map` lookup; returns a fresh-copy view (embedding as a new
  `Float32Array`, `files` a copied array) or `null` on a miss (never throws). Covers
  AC2, AC4, AC6.

### 7.4 `store.deleteUnit(planPath, sectionId) → boolean`
- Locked RMW; deletes the `(planPath, sectionId)` entry. Returns `true` if present,
  `false` if not (never throws on a miss). Covers AC7.

### 7.5 `store.moveUnit(fromPath, toPath) → number`
- Locked RMW; re-paths **every** unit whose `planPath === fromPath` (plan-level +
  all sections) to `toPath`, re-keying the `Map`. `embedding`, `_norm`, `contentHash`,
  and all other fields are preserved unchanged (no re-embed — the load-bearing
  guarantee). Returns the count re-pathed; `0` if `fromPath` matched nothing. Covers
  AC8.

### 7.6 `store.getFilesForPlan(planPath) → string[]`
- Lock-free: look up `(planPath, '__plan__')`; return a copy of its `files`, or `[]`
  if there is no plan-level unit or `files` is empty. **Never throws.** Keyed on plan
  path/slug (D9 opaque-key contract stated verbatim in the barrel JSDoc). Covers AC9.

### 7.7 `store.search(queryEmbedding, k, opts?) → Array<StoredUnit & { score: number }>`
- Per §6.5: validate `queryEmbedding` type and dimension (throw on mismatch — AC13),
  brute-force cosine, filter by `opts.kind`/`opts.excludePlanPath`/`opts.minScore`,
  sort descending, return ≤ `k`. Lock-free. Covers AC11, AC12, AC13.

### 7.8 `store.save() → void`, `store.withBatch(fn) → any`
- `save()` = locked reload-merge + atomic persist (§6.2/§6.4). `withBatch(fn)` takes
  the lock once, reloads, runs `fn` (which performs many mutations against the store),
  then atomically saves once — PI3's sweep path. Covers AC16, AC17 (and the
  concurrency ACs via the shared `withLock`).

### 7.9 `settings.js` block + `.gitignore`
Add to `SETTINGS_SCHEMA` (additive, forward-declared — D8):
```js
plan_index: {
  label: 'Plan Index Settings',
  settings: [
    { key: 'engine_preference',   label: 'Embedding engine preference', type: 'select',
      options: ['auto', 'ollama', 'in-process'], default: 'auto' },      // PI2
    { key: 'ollama_base_url',     label: 'Ollama base URL',             type: 'string',
      default: 'http://localhost:11434' },                               // PI2
    { key: 'duplicate_threshold', label: 'Duplicate-guard threshold',   type: 'number',
      default: 0.85 }                                                    // PI5/PI6
  ]
}
```
`.gitignore`: append `.ctoc/index/` (the JSON index is a git-ignored, rebuildable
cache). Covers the settings-suite invariants (each setting has
`key`/`label`/`type`/`default`; the `select` default is within `options`).

## Execution Plan (Steps 8–16, Iron Loop)

### Step 8: TEST (test-maker)
- [ ] Write `tests/plan-index-store.test.js` (TDD red) — all 20 ST cases from the
  Test Plan, `node:test` idiom, temp indexes via `mkdtempSync`, **zero network, zero
  native binaries**. Tests fail until `store.js` is implemented in Step 10.
- [ ] Concurrency tests (ST-18/19/20) are single-process but exercise the real
  lock/reload/steal mechanism: ST-18 seeds the file, opens handle A, appends Y to the
  file directly (simulating another process), then asserts A's `upsert(Z)` preserves
  X+Y+Z; ST-19 backdates the `.lock` mtime and asserts a steal; ST-20 asserts a held
  lock blocks a second acquire until release while a read returns immediately.

### Step 9: PREPARE (quality-checker)
- [ ] Create `src/lib/plan-index/`. **No binary vendoring, no maintainer step, no
  spike** — the pivot deletes all of it. This is a fully in-loop build.

### Step 10: IMPLEMENT (implementer)
- [ ] Build `src/lib/plan-index/store.js` (in-memory Map model; CRUD; `search`;
  `save`/`withBatch`; base64 (de)serialization; fail-open load; lock/reload/steal;
  cosine + norm; dimension policy; warn-logger).
- [ ] Build `src/lib/plan-index/index.js` (barrel exporting `openStore`).
- [ ] Add the `plan_index` block to `src/lib/settings.js`; append `.ctoc/index/` to
  `.gitignore`.
- [ ] One IMPLEMENT step, sub-items per file. No stubs — any residual ambiguity
  resolved as a documented choice recorded in `## Decisions Taken Under Ambiguity`.

### Step 11: REVIEW (self-reviewer)
- [ ] Dependency direction (`index` → `store`, no cycles); single responsibility; the
  reload-under-lock invariant on every mutation; lock-free reads; null/empty/throw
  contracts match §7; all fs via `safe-fs` (no raw `fs` path calls).

### Step 12: OPTIMIZE (optimizer)
- [ ] Cache `_norm` at upsert/load (no per-search recompute of stored norms);
  single-copy embedding read/write (no aliasing of the Buffer pool); confirm the
  brute-force scan allocates no per-iteration garbage on the hot path. Do **not** add
  an ANN index (premature — Decision D2).

### Step 13: SECURE (security-scanner)
- [ ] All file I/O via `safe-fs`; temp file in the same directory as the target; lock
  via atomic `wx` create; embedding decode copies out of the Buffer pool; base64
  decode length-checked against `dimension`; no secrets; fail-open never leaks a stack
  trace to the menu; no path traversal (paths derived from the caller-supplied
  `jsonPath` only).

### Step 14: VERIFY (verifier)
- [ ] Run automated checks: `node --test tests/*.test.js` → `# fail 0`, all 20 ST
  green, **0 skipped, 0 flaky**; run lint + `tsc --checkJs` clean (no new warnings —
  warnings are bugs); coverage ≥ 80% on `src/lib/plan-index/**`; confirm
  `settings.test.js` and `environment-mode.test.js` still pass (the additive
  `plan_index` block must not regress them).

### Step 15: DOCUMENT (documenter)
- [ ] JSDoc on `openStore` + every primitive (incl. the D9 opaque-key contract and
  the fail-open/concurrency guarantees); a `src/lib/plan-index/README` note on the
  rebuildable-cache contract, the JSON shape + base64 encoding, and the concurrency
  model.

### Step 16: FINAL-REVIEW (implementation-reviewer → CTO Chief)
- [ ] 14 quality dimensions; verify the Gate 2 marker is present; confirm the
  PI2/PI3/PI4 contracts (`upsertUnit` dimension inference, CRUD, `search`,
  `withBatch`, `getFilesForPlan`) are met and that the slice is buildable with **zero
  native/binary prerequisites**. Gate 3 is the human's.


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write tests for the implementation (tests/plan-index-store.test.js, ST-01…ST-20)
- [x] Test error conditions (fail-open, bad kind, wrong dimension, atomic-write failure, lock contention)
- [x] Run tests - expect RED (failing) — confirmed RED with store.js absent

### Step 9: PREPARE
- [x] Install dependencies if needed — none (Node built-ins + safe-fs only)
- [x] Check prerequisites — safe-fs choke point present (LH1)
- [x] Verify dev environment ready — Node v24, eslint/tsc present
- [x] Create directories/config if needed — src/lib/plan-index/ created

### Step 10: IMPLEMENT
- [x] Implement the feature according to requirements (store.js, index.js, settings block)
- [x] Add error handling (fail-open load, dimension reset, lock timeout, atomic-write rollback)
- [x] Wire up integration points (barrel export; forward-declared plan_index settings)

### Step 11: REVIEW
- [x] Self-review all new code — dependency direction index→store, no cycles
- [x] Verify integration points work together — reload-under-lock on every mutation; lock-free reads
- [x] Check error handling completeness — null/empty/throw contracts match §7

### Step 12: OPTIMIZE
- [x] Remove redundant operations — _norm cached at upsert/load (no per-search recompute)
- [x] Optimize critical paths — single-pass brute-force scan; no per-iteration garbage beyond result views
- [x] Simplify complex code — shared applyUpsert/applyMove cores between locked API and withBatch

### Step 13: SECURE
- [x] Validate inputs (no path traversal) — all fs via safe-fs; paths derived from caller jsonPath only
- [x] Sanitize outputs — fail-open never leaks a stack trace to the caller (warn-logged instead)
- [x] No secrets in code
- [x] Safe file operations — atomic temp+rename; exclusive 'wx' lock; base64 decode length-checked

### Step 14: VERIFY
- [x] Run lint + type check — eslint --max-warnings 0 exit 0; tsc at baseline 89 (no new errors)
- [x] Run ALL tests (TDD Green) — full suite 2620 pass / 0 fail
- [x] Check coverage >= 80% — store.js 94.15% line / 97.06% funcs; index.js 100%
- [x] 0 skipped, 0 flaky tests

### Step 15: DOCUMENT
- [x] Update relevant documentation — comprehensive JSDoc on barrel + every primitive
- [x] Add JSDoc comments to new functions (incl. D9 opaque-key + fail-open/concurrency contracts)
- [x] Update CHANGELOG if needed — n/a (version bump handled at release)

### Step 16: FINAL-REVIEW
- [x] Verify steps 8-15 completed correctly
- [x] All quality checks passed
- [x] Manual verification if needed
- [ ] Ready for human review — Gate 3 is the human's (plan left in plans/todo/ per instruction)
