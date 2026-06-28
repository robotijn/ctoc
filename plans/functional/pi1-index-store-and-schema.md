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
acceptance_criteria_count: 11
risk_level: HIGH
files:
  - "src/lib/plan-index/db.js"
  - "src/lib/plan-index/schema.js"
  - "src/lib/plan-index/vec0-loader.js"
  - "src/lib/plan-index/index.js"
  - "src/lib/plan-index/binaries/**"
  - "src/scripts/vendor-vec0.js"
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
- **Deliverable:** A working SQLite database at `.ctoc/index/plans.db` with FTS5 + vec0 schema, committed-vendored platform binaries, and `upsertUnit` / `getUnit` / `deleteUnit` CRUD primitives

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

- [ ] **Scenario: Parameterized vector table creation**
  Given the store is open and no vec0 virtual table exists
  When `initVectorTable(384)` is called
  Then a vec0 virtual table is created accepting 384-float vectors (confirmed via
  `PRAGMA table_info`)

- [ ] **Scenario: Dimension mismatch is handled deterministically**
  Given a vec0 table already exists at dimension 384
  When `initVectorTable(512)` is called
  Then the old table is dropped and a new one at dimension 512 is created; no
  silent mismatch, no thrown error, and a warning is logged to `.ctoc/logs/`

- [ ] **Scenario: upsertUnit + getUnit round-trip**
  Given the store is initialized at dimension 384
  When `upsertUnit({ path, sectionId, text, vector: Float32Array(384), files,
  parentVision, stepLabel, contentHash })` is called
  Then `getUnit(path, sectionId)` returns an object with all fields matching the
  input including `contentHash`, `files` (as array), and `parentVision`

- [ ] **Scenario: Forced mid-write leaves no partial row**
  Given a unit already exists in the store
  When a write transaction is interrupted mid-execution (simulated via throwing
  inside the transaction callback)
  Then `getUnit` returns the original pre-write unit unchanged; no partial row is
  present in any table

- [ ] **Scenario: deleteUnit removes from all tables**
  Given a unit exists in the FTS5, vec0, and metadata tables
  When `deleteUnit(path, sectionId)` is called
  Then `getUnit(path, sectionId)` returns null and both FTS5 and vec0 tables have
  no row for that unit

- [ ] **Scenario: Binary selection — supported platform**
  Given the runtime is one of: darwin-arm64, darwin-x64, linux-x64, linux-arm64,
  win32-x64
  When `loadVec0Extension(db)` is called
  Then the path resolved ends with `<platform>-<arch>/vec0.<ext>` where ext is
  `dylib` (macOS), `so` (Linux), or `dll` (Windows), and vec0 loads successfully

- [ ] **Scenario: Binary selection — unsupported platform throws clearly**
  Given the runtime is an unsupported platform/arch (e.g., win32-arm64)
  When `loadVec0Extension(db)` is called
  Then it throws an `Error` whose `.message` contains the current
  `process.platform`, `process.arch`, and the list of supported combinations

- [ ] **Scenario: Rebuildable cache**
  Given a populated database
  When `.ctoc/index/plans.db` is deleted and `openStore(dbPath)` is called again
  Then a fresh, empty schema is created with identical table names, column names,
  FTS5 configuration, and vec0 configuration as the original

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

## Scope

### In Scope
- Open/create SQLite at `.ctoc/index/plans.db` via `node:sqlite`
  `new DatabaseSync(path, { allowExtension: true })` then `enableLoadExtension(true)`
- Resolve and load the vendored `vec0` binary from
  `src/lib/plan-index/binaries/<platform>-<arch>/vec0.{dylib,so,dll}` — committed
  to the repo, no runtime download, no network call
- FTS5 virtual table for BM25 lexical search over plan/section text
- `vec0` virtual table with **caller-supplied dimension** via `initVectorTable(dim)`;
  deferred until PI2 calls it — PI1 never depends on PI2
- Metadata/units table: `plan_path`, `section_id`, `files` (JSON text column),
  `parent_vision`, `step_label`, `content_hash` — all queryable columns, never
  embedded in a vector
- CRUD primitives: `upsertUnit`, `getUnit`, `deleteUnit` — all wrapped in
  explicit transactions
- `src/lib/plan-index/index.js` barrel that exports the public API
- `.gitignore` entry for `.ctoc/index/` (DB is git-ignored; binaries under
  `src/lib/plan-index/binaries/` are committed)
- `src/scripts/vendor-vec0.js` — maintainer-only binary refresh tool; fetches
  and checksum-verifies updated binaries; **never imported at runtime**
- `plan_index:` namespace stub added to `.ctoc/settings.yaml` (commented
  placeholder keys scaffolding for PI2/PI5/PI6; PI1 reads no settings itself)
- `tests/plan-index-store.test.js` — covers all 11 scenarios above

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

## Test Plan

Framework: Node `--test` (matches the rest of the CTOC test suite).
All tests run without network access. No Ollama or external service required.

| Test ID | Description                                    | Key Assertion                                          |
|---------|------------------------------------------------|--------------------------------------------------------|
| ST-01   | openStore creates DB and loads vec0            | `SELECT vec_version()` returns non-empty string        |
| ST-02   | initVectorTable(384) creates vec0 table        | `PRAGMA table_info(vec_plans)` shows float[384] column |
| ST-03   | Dimension mismatch drops and recreates         | New table reflects dim 512; no error thrown            |
| ST-04   | upsertUnit + getUnit full round-trip           | Deep equal on all fields including contentHash         |
| ST-05   | Forced mid-write: no partial row               | getUnit pre-state unchanged after interrupted tx       |
| ST-06   | deleteUnit removes from all three tables       | getUnit returns null                                   |
| ST-07   | Binary path: darwin-arm64                      | Resolved path ends with `darwin-arm64/vec0.dylib`      |
| ST-08   | Binary path: linux-x64                        | Resolved path ends with `linux-x64/vec0.so`            |
| ST-09   | Binary path: win32-x64                        | Resolved path ends with `win32-x64/vec0.dll`           |
| ST-10   | Unsupported platform throws descriptive error  | error.message contains platform + arch + supported list|
| ST-11   | Delete DB + re-init → same empty schema        | Table names and column names match reference set       |
| ST-12   | Metadata queryable by parent_vision            | SELECT WHERE parent_vision = '...' returns row         |
| ST-13   | vendor-vec0.js not in import graph at runtime  | Module cache has no entry for vendor-vec0.js path      |

## Risks

### Technical Risks
- **sqlite-vec binary ABI compatibility**: The vendored binary is proven on
  Node 24 / SQLite 3.51.2 / sqlite-vec v0.1.9. Future Node upgrades that bundle a
  different SQLite version may break the extension ABI.
  - Likelihood: MEDIUM
  - Impact: HIGH (store completely non-functional)
  - Mitigation: Pin the Node version in `.nvmrc`; add a CI smoke test that calls
    `SELECT vec_version()`; record the exact triple
    (Node+SQLite+sqlite-vec version) in a comment in `vec0-loader.js`

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
3. The rest of CTOC is unaffected — all plan-index paths are behind the
   `src/lib/plan-index/index.js` barrel; no existing CTOC code imports them yet.

## Dependencies

- **Node 24** — `node:sqlite` built-in with `allowExtension` + `enableLoadExtension` support.
- **sqlite-vec v0.1.9 vendored binaries** — committed under `src/lib/plan-index/binaries/`.
- No npm packages required for PI1.
- PI2 calls `initVectorTable(dimension)` on this store after calibration.
- PI3 calls `upsertUnit` / `deleteUnit` / `getUnit` via the PI1 barrel.

## Decisions Taken Under Ambiguity

- **Dimension ownership**: The vec0 table dimension is parameterized and set by
  the caller (PI2 after calibration), keeping PI1 free of any PI2 dependency
  while honoring the locked per-machine-dimension decision.
- **Binary distribution**: Committed-vendored under
  `src/lib/plan-index/binaries/<platform>-<arch>/`; resolved at runtime via
  `process.platform` + `process.arch`; zero network calls at runtime.
  `vendor-vec0.js` is a maintainer refresh tool — never imported at runtime.
- **Dimension mismatch policy**: On `initVectorTable` called with a different
  dimension than the existing table, the vec0 table is dropped and recreated.
  This is acceptable because the DB is a rebuildable cache; a logged warning is
  emitted so the event is visible.
- **plan_index: namespace in settings.yaml**: PI1 appends the `plan_index:` block
  only if not already present (read-check-append pattern, not overwrite). PI1
  itself reads no settings; this scaffolds the namespace for PI2 (engine
  preferences) and PI5/PI6 (thresholds).
- **Schema migration**: Formal migration tooling is out of scope; current policy
  is drop-and-recreate, which is safe because the DB is a self-healing cache and
  can always be rebuilt from the `.md` plans.
