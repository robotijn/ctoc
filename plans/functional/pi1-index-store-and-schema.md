---
title: "PI1 — Index Store, Schema & sqlite-vec Bootstrap"
created: "2026-06-28T00:00:00Z"
type: feature
status: functional
priority: HIGH
parent_vision: "done/local-semantic-plan-index.md"
program: ctoc-planning-intelligence
order: 1
depends_on: []
acceptance_criteria_count: 15
risk_level: HIGH
files:
  - "src/lib/plan-index/db.js"
  - "src/lib/plan-index/schema.js"
  - "src/lib/plan-index/vec0-loader.js"
  - "src/lib/plan-index/index.js"
  - "src/lib/plan-index/binaries/**"
  - "src/scripts/vendor-vec0.js"
  - "src/lib/settings.js"
  - ".gitignore"
  - "tests/plan-index-store.test.js"
gate: "Pending Approval (Gate 1: functional → implementation)"
---

# PI1 — Index Store, Schema & sqlite-vec Bootstrap

## Problem Statement

CTOC has no persistent store capable of holding both a lexical (BM25/FTS5) and a
dense-vector representation of plans. Without a transactional, rebuildable local
SQLite database with the `sqlite-vec` extension loaded and a well-defined schema,
none of the four cross-correlation capabilities — semantic search, related-plans
surfacing, duplicate guard, conflict detection — can exist. This is the
zero-dependency foundation every other PI slice builds on. Every other PI calls
this slice's primitives; nothing in this slice depends on any other PI.

## Business Alignment

**Job to Be Done:** When CTOC needs to store or retrieve a plan's lexical and
vector representations, I want a transactional local database with a stable CRUD
API, so I can rely on all four cross-correlation capabilities working correctly
against a consistent, rebuildable store.

**Impact Map:**
- **Goal:** Establish the storage foundation for hybrid BM25 + vector retrieval over all plans (vision success criteria 1–5, 7)
- **Actor:** CTOC pipeline components (agents, scripts, hooks) and by extension the CTO/developer using CTOC
- **Impact:** Every plan write operation can be mirrored into a consistent, queryable store; the index is rebuildable from plans at any time on any machine
- **Deliverable:** A working SQLite database at `.ctoc/index/plans.db` with FTS5 + vec0 schema (cosine distance, kind-separable), committed-vendored platform binaries, and `upsertUnit` / `getUnit` / `deleteUnit` / `moveUnit` / `getFilesForPlan` CRUD primitives

## User Stories

**As a** CTOC pipeline component (PI2, PI3), **I want** a parameterized
`initVectorTable(dimension)` and `upsertUnit` / `getUnit` / `deleteUnit` API,
**so that** PI2 can set the per-machine vector dimension and PI3 can mirror plan
changes atomically without knowing how the store is implemented.

**As a** CTOC developer or CI runner, **I want** the store to open and initialize
with no network access, using only committed-vendored binaries, **so that** the
index works in offline and air-gapped environments from first run.

## Acceptance Criteria

- [ ] **Scenario: DB opens and vec0 loads**
  Given `.ctoc/index/` does not exist on disk
  When `openStore(dbPath)` is called
  Then `.ctoc/index/plans.db` is created, `SELECT vec_version()` returns a
  non-empty string, and `PRAGMA compile_options` confirms FTS5 is compiled in

- [ ] **Scenario: Parameterized vector table creation with cosine metric**
  Given the store is open and no vec0 virtual table exists
  When `initVectorTable(384)` is called
  Then a vec0 virtual table is created accepting 384-float vectors with cosine
  distance metric; `SELECT sql FROM sqlite_master WHERE name = 'vec_plans'`
  contains `distance_metric=cosine`; and `PRAGMA table_info` confirms the
  embedding column at dimension 384

- [ ] **Scenario: Dimension mismatch is handled deterministically**
  Given a vec0 table already exists at dimension 384
  When `initVectorTable(512)` is called
  Then the old table is dropped and a new one at dimension 512 is created; no
  silent mismatch, no thrown error, and a warning is logged to `.ctoc/logs/`

- [ ] **Scenario: upsertUnit + getUnit round-trip including vector**
  Given the store is initialized at dimension 384
  When `upsertUnit({ path, sectionId, kind: 'plan', text, vector: Float32Array(384),
  files, parentVision, stepLabel, contentHash })` is called
  Then `getUnit(path, sectionId)` returns an object with all fields matching the
  input including `contentHash`, `files` (as array), `parentVision`, `kind`, and
  the `vector` deserialized as a `Float32Array` whose byte values match the input
  float-by-float (Float32 precision — no lossy conversion)

- [ ] **Scenario: Forced mid-write leaves no partial row**
  Given a unit already exists in the store
  When a write transaction is interrupted mid-execution (simulated via throwing
  inside the transaction callback)
  Then `getUnit` returns the original pre-write unit unchanged; no partial row is
  present in any table

- [ ] **Scenario: deleteUnit removes from FTS5 and vec0 (raw count assertion)**
  Given a unit exists in the FTS5, vec0, and metadata tables with a known rowid
  When `deleteUnit(path, sectionId)` is called
  Then `getUnit(path, sectionId)` returns null,
  `SELECT COUNT(*) FROM fts_plans WHERE plan_path = ? AND section_id = ?` returns 0,
  and `SELECT COUNT(*) FROM vec_plans WHERE rowid = <unit rowid>` returns 0

- [ ] **Scenario: Binary selection — supported platform**
  Given the runtime is one of: darwin-arm64, darwin-x64, linux-x64, linux-arm64,
  win32-x64
  When `loadVec0Extension(db)` is called
  Then `fs.existsSync(resolved)` is true (committed binary present), the extension
  loads without throwing, and `SELECT vec_version()` returns a string matching
  the pattern `^\d+\.\d+\.\d+$`

- [ ] **Scenario: Binary selection — unsupported platform throws clearly**
  Given the runtime is an unsupported platform/arch (e.g., win32-arm64)
  When `loadVec0Extension(db)` is called
  Then it throws an `Error` whose `.message` contains the current
  `process.platform`, `process.arch`, and the list of supported combinations

- [ ] **Scenario: Rebuildable cache**
  Given a populated database
  When `.ctoc/index/plans.db` is deleted and `openStore(dbPath)` is called again
  Then a fresh, empty schema is created with identical table names, column names,
  FTS5 configuration, and vec0 configuration (including cosine metric) as the original

- [ ] **Scenario: Metadata columns are queryable, not embedded**
  Given a unit upserted with `files: ['src/lib/auth.js']` and
  `parentVision: 'vision/ci.md'`
  When a raw `SELECT` is run on the metadata table filtering `WHERE parent_vision
  = 'vision/ci.md'`
  Then the row is returned with `files` as a JSON column, not buried inside a
  vector

- [ ] **Scenario: vendor-vec0.js is not a runtime dependency**
  Given the runtime binary is present in
  `src/lib/plan-index/binaries/<platform>-<arch>/`
  When `openStore` initializes
  Then `src/scripts/vendor-vec0.js` is never imported or required, and no network
  call is made

- [ ] **Scenario: Cosine distance metric ranks by angle, not magnitude**
  Given the store is initialized at dimension 3
  And three units upserted:
    - unit A with vector `[10, 1, 0]` (large magnitude, high cosine similarity to `[1, 0, 0]`)
    - unit B with vector `[0.1, 0.995, 0]` (small magnitude, low cosine similarity to `[1, 0, 0]`)
  When a KNN query for k=2 is executed against `vec_plans` with query vector `[1, 0, 0]`
  Then unit A ranks above unit B (cosine sim A ≈ 0.995 > cosine sim B ≈ 0.100);
  if L2 distance were used the ranking would be reversed (L2 distance A ≈ 9.06 > L2 distance B ≈ 1.34),
  confirming the metric is cosine, not L2

- [ ] **Scenario: kind column separates plan-level and section-level vectors**
  Given units upserted for the same plan path:
    - one with `kind: 'plan'` (plan-level summary vector)
    - one with `kind: 'section'` (section-level vector)
  When raw SELECT queries filter the metadata table
  Then `SELECT COUNT(*) FROM units WHERE plan_path = ? AND kind = 'plan'` returns 1
  And `SELECT COUNT(*) FROM units WHERE plan_path = ? AND kind = 'section'` returns 1
  And `upsertUnit` with an invalid kind value (e.g., `'unknown'`) throws or is
  rejected by a CHECK constraint

- [ ] **Scenario: getFilesForPlan returns a plan's declared files by slug**
  Given a plan-level unit upserted for `pi6-conflict.md` with
  `files: ['src/lib/a.js', 'src/lib/b/**']`
  When `getFilesForPlan('pi6-conflict.md')` is called
  Then it returns `['src/lib/a.js', 'src/lib/b/**']`; for a plan with no `files:`
  it returns `[]` and never throws; the lookup is keyed on plan path/slug, not section

- [ ] **Scenario: moveUnit re-paths a unit without re-embedding**
  Given a unit exists at `plans/todo/x.md` with a stored vector and contentHash
  When `moveUnit('plans/todo/x.md', 'plans/in-progress/x.md')` is called
  Then `plan_path` updates in the metadata, FTS5, and vec0 tables; the stored
  `vector` and `contentHash` are unchanged (no re-embed); and
  `getUnit('plans/in-progress/x.md', ...)` returns the same vector byte-for-byte

## Scope

### In Scope
- Open/create SQLite at `.ctoc/index/plans.db` via `node:sqlite`
  `new DatabaseSync(path, { allowExtension: true })` then `enableLoadExtension(true)`
- Resolve and load the vendored `vec0` binary from
  `src/lib/plan-index/binaries/<platform>-<arch>/vec0.{dylib,so,dll}` — committed
  to the repo, no runtime download, no network call
- FTS5 virtual table for BM25 lexical search over plan/section text
- `vec0` virtual table with **caller-supplied dimension** via `initVectorTable(dim)`;
  declared with `distance_metric=cosine` at creation time; deferred until PI2 calls
  it — PI1 never depends on PI2
- `kind` column (`TEXT NOT NULL`, values `'plan'` | `'section'`, enforced via
  `CHECK (kind IN ('plan', 'section'))`) in the `units` metadata table, enabling
  PI4/PI6 to filter coarse vs. precise vectors via JOIN
- Metadata/units table: `plan_path`, `section_id`, `kind`, `files` (JSON text
  column), `parent_vision`, `step_label`, `content_hash` — all queryable columns,
  never embedded in a vector
- CRUD primitives: `upsertUnit`, `getUnit`, `deleteUnit`, `moveUnit` (re-path a
  unit across the metadata, FTS5, and vec0 tables WITHOUT re-embedding — for pure
  stage moves; used by PI3), and `getFilesForPlan(slug)` (return a plan's declared
  `files:` globs as an array, `[]` if none; used by PI6) — all wrapped in
  explicit transactions
- `src/lib/plan-index/index.js` barrel that exports the public API
- `.gitignore` entry for `.ctoc/index/` (DB is git-ignored; binaries under
  `src/lib/plan-index/binaries/` are committed)
- `src/scripts/vendor-vec0.js` — maintainer-only binary refresh tool; fetches
  and checksum-verifies updated binaries; **never imported at runtime**
- Register `plan_index` block in `SETTINGS_SCHEMA` in `src/lib/settings.js`
  (keys: `engine_preference`, `ollama_base_url`, `duplicate_threshold` — stubs
  for PI2/PI5/PI6; PI1 reads no settings itself at runtime)
- `tests/plan-index-store.test.js` — covers all 13 scenarios above

### Out of Scope
- Producing vectors (PI2)
- Deciding what or when to re-embed (PI3)
- Any query, ranking, or Reciprocal Rank Fusion (PI4)
- Duplicate guard thresholds or conflict detection (PI5–PI6)
- UI or menu surfacing of any kind
- Runtime download of vec0 binaries — zero network at runtime; vendor-vec0.js is
  a maintainer tool only
- Automatic schema migration across schema versions (current policy: drop and
  recreate; DB is a rebuildable cache)
- Node version pinning or capability gate (PI0's responsibility)

## Test Plan

Framework: Node `--test` (matches the rest of the CTOC test suite).
All tests run without network access. No Ollama or external service required.

| Test ID | Description                                    | Key Assertion                                                              |
|---------|------------------------------------------------|----------------------------------------------------------------------------|
| ST-01   | openStore creates DB and loads vec0            | `SELECT vec_version()` returns string matching `^\d+\.\d+\.\d+$`          |
| ST-02   | initVectorTable(384) creates vec0 with cosine  | `sqlite_master` sql contains `distance_metric=cosine`; column dim = 384    |
| ST-03   | Dimension mismatch drops and recreates         | New table reflects dim 512; no error thrown; warning logged                |
| ST-04   | upsertUnit + getUnit full round-trip           | All fields equal including kind; vector byte-for-byte Float32 match        |
| ST-05   | Forced mid-write: no partial row               | getUnit pre-state unchanged after interrupted tx                           |
| ST-06   | deleteUnit removes from FTS5 and vec0          | getUnit null; `SELECT COUNT(*)` = 0 on fts_plans AND vec_plans             |
| ST-07   | Binary: darwin-arm64 load + version            | existsSync true; loads without throw; vec_version() matches `^\d+\.\d+\.\d+$` |
| ST-08   | Binary: linux-x64 load + version              | existsSync true; loads without throw; vec_version() matches `^\d+\.\d+\.\d+$` |
| ST-09   | Binary: win32-x64 load + version              | existsSync true; loads without throw; vec_version() matches `^\d+\.\d+\.\d+$` |
| ST-10   | Unsupported platform throws descriptive error  | error.message contains platform + arch + supported list                    |
| ST-11   | Delete DB + re-init → same empty schema        | Table names, column names, cosine metric match reference set               |
| ST-12   | Metadata queryable by parent_vision            | SELECT WHERE parent_vision = '...' returns row                             |
| ST-13   | vendor-vec0.js not in import graph at runtime  | Module cache has no entry for vendor-vec0.js path                          |
| ST-14   | Cosine metric: angle-based ranking             | Unit A ([10,1,0]) ranks above B ([0.1,0.995,0]) for query [1,0,0]         |
| ST-15   | kind column: plan vs section separability      | COUNT(*) WHERE kind='plan' = 1; WHERE kind='section' = 1; bad kind throws  |
| ST-16   | getFilesForPlan returns globs, [] if none      | Returns declared `files:` globs; missing → []; never throws                |
| ST-17   | moveUnit re-paths without re-embed              | plan_path updated in all tables; vector + contentHash unchanged            |

## Risks

### Technical Risks
- **sqlite-vec binary ABI compatibility**: The vendored binary is proven on
  Node 24 / SQLite 3.51.2 / sqlite-vec v0.1.9. Future Node upgrades that bundle a
  different SQLite version may break the extension ABI.
  - Likelihood: MEDIUM
  - Impact: HIGH (store completely non-functional)
  - Mitigation: Record the exact version triple (Node+SQLite+sqlite-vec) in a
    comment in `vec0-loader.js`; CI smoke test calls `SELECT vec_version()` on
    every run to detect ABI breakage immediately; Node version pinning is
    PI0's capability gate — do not add `.nvmrc` or `package.json engines` here

- **Windows DLL load path**: `enableLoadExtension` on Windows may require the
  DLL's directory to be on PATH, or an absolute path must be passed.
  - Likelihood: MEDIUM
  - Impact: MEDIUM (Windows-only; fixable post-discovery)
  - Mitigation: Always pass the `path.resolve`-resolved absolute path to
    `loadExtension`; add a win32-platform test in CI

- **FTS5 + vec0 concurrent virtual table writes**: Both use SQLite's virtual
  table mechanism; edge cases with concurrent writes against two virtual tables
  in the same transaction may surface.
  - Likelihood: LOW
  - Impact: MEDIUM
  - Mitigation: All writes wrap both FTS5 and vec0 upserts in a single explicit
    `BEGIN`/`COMMIT`; tested by ST-05

### Business Risks
- **Vendored binaries increase repo size**: 5 platform binaries at approximately
  200–400 KB each adds roughly 1.5–2 MB to the repository.
  - Likelihood: HIGH (certainty — this is a known trade-off)
  - Impact: LOW (accepted cost for the offline-first, zero-runtime-network guarantee)
  - Mitigation: Document the size trade-off in the vision; confirm binary sizes
    during the vendor-vec0.js maintenance run; consider Git LFS if size grows
    beyond 5 MB across future binary updates

### Dependency Risks
- **PI2 and PI3 are blocked until PI1 ships**: PI1 is the critical-path
  deliverable; no other PI slice can run integration tests against a real store.
  - Likelihood: HIGH (structural)
  - Impact: HIGH (all other PI slices are gated on this)
  - Mitigation: Ship PI1 in its own Iron Loop cycle first; PI1 has no upstream
    dependencies and can begin immediately

## Rollback

1. Delete `.ctoc/index/plans.db` (git-ignored; no committed data loss).
2. Revert `src/lib/plan-index/` and `tests/plan-index-store.test.js` to the
   prior commit.
3. Revert the `plan_index` block addition to `src/lib/settings.js`.
4. The rest of CTOC is unaffected — all plan-index paths are behind the
   `src/lib/plan-index/index.js` barrel; no existing CTOC code imports them yet.

## Dependencies

- **Node 24** — `node:sqlite` built-in with `allowExtension` + `enableLoadExtension` support.
- **sqlite-vec v0.1.9 vendored binaries** — committed under `src/lib/plan-index/binaries/`.
- No npm packages required for PI1.
- PI2 calls `initVectorTable(dimension)` on this store after calibration.
- PI3 calls `upsertUnit` / `deleteUnit` / `getUnit` via the PI1 barrel.
- PI0 owns capability gate (feature-detect node:sqlite/vec0/FTS5) and composition
  root; PI1 is constructed and initialized by PI0, not self-bootstrapped.

## Decisions Taken Under Ambiguity

- **Dimension ownership**: The vec0 table dimension is parameterized and set by
  the caller (PI2 after calibration), keeping PI1 free of any PI2 dependency
  while honoring the locked per-machine-dimension decision.
- **Binary distribution**: Committed-vendored under
  `src/lib/plan-index/binaries/<platform>-<arch>/`; resolved at runtime via
  `process.platform` + `process.arch`; zero network calls at runtime.
  `vendor-vec0.js` is a maintainer refresh tool — never imported at runtime.
- **Distance metric**: `distance_metric=cosine` is declared at `initVectorTable`
  creation time. PI2 does NOT need to L2-normalize vectors before insert. This
  is the correct metric for sentence embedding similarity (insensitive to
  embedding magnitude, measures directional similarity).
- **kind column vs. two vec0 tables**: A single `kind` column in the `units`
  metadata table (with a CHECK constraint) was chosen over two separate vec0
  virtual tables. Simpler schema; filtering is done by JOIN on the KNN result
  rowids (PI4/PI6 pattern). The vec0 table holds all vectors uniformly indexed
  by rowid.
- **Dimension mismatch policy**: On `initVectorTable` called with a different
  dimension than the existing table, the vec0 table is dropped and recreated.
  This is acceptable because the DB is a rebuildable cache; a logged warning is
  emitted so the event is visible.
- **plan_index namespace in settings.js SETTINGS_SCHEMA**: PI1 adds the
  `plan_index` block to `SETTINGS_SCHEMA` in `src/lib/settings.js` so that PI2
  and PI5/PI6 can read their settings via `getSetting`/`setSetting` from
  `settings.json`. PI1 does NOT write to `.ctoc/settings.yaml` — the settings
  API is the correct runtime interface (see CONFIG SOURCES note in settings.js).
- **Schema migration**: Formal migration tooling is out of scope; current policy
  is drop-and-recreate, which is safe because the DB is a self-healing cache and
  can always be rebuilt from the `.md` plans.
