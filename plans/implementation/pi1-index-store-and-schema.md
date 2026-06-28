---
approved_by: human
approved_at: 2026-06-28T21:34:58.493Z
gate_crossed: functional → implementation
---

---
title: "PI1 — Index Store, Schema & sqlite-vec Bootstrap"
created: "2026-06-28T00:00:00Z"
type: feature
status: implementation
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
gate: "Pending Approval (Gate 2: implementation → todo)"
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

---

# Implementation Details

> Generated by implementation-planner (Iron Loop Steps 5 PLAN → 6 DESIGN → 7 SPEC)
> for Gate 2 review. Grounded against the live repo: Node `v24.14.1`,
> `node:sqlite` `DatabaseSync` (SQLite `3.51.2`, FTS5 compiled in, `enableLoadExtension`
> + `loadExtension` present), the `src/lib/settings.js` `SETTINGS_SCHEMA`/`getSetting`
> contract, the `src/lib/enforcement-log.js` append-only JSON log pattern, and the
> prevailing `node:test` (`describe`/`test`/`assert`) suite idiom.

## Step 5 — PLAN (Technical Approach)

### Module layout (`src/lib/plan-index/`)

Four source modules behind one barrel, layered so dependencies flow inward
(`index` → `db` → {`schema`, `vec0-loader`}); `schema` and `vec0-loader` are
leaves with no intra-package imports of each other.

| File | Responsibility | Imports (intra-pkg) | Exports |
|------|----------------|---------------------|---------|
| `vec0-loader.js` | Platform/arch → binary path; load the `vec0` extension; supported-platform policy. **No SQL/schema knowledge.** | none | `SUPPORTED_PLATFORMS`, `resolveVec0BinaryPath(platform, arch)`, `loadVec0Extension(db)` |
| `schema.js` | DDL constants; create base schema (`units`, `fts_plans`); create/recreate the parameterized `vec_plans`; dimension-mismatch policy + warning log. **No extension loading.** | none | `BASE_DDL`, `initSchema(db)`, `initVectorTable(db, dimension, logDir)`, `readVecDimension(db)` |
| `db.js` | `openStore` composition; the six CRUD/query primitives bound to a store handle; transaction helper; Float32 ⇄ BLOB (de)serialization. | `./schema`, `./vec0-loader` | `openStore(dbPath)` |
| `index.js` | Public barrel — the only entry point other CTOC code imports. | `./db`, `./vec0-loader` | `openStore`, `loadVec0Extension`, `resolveVec0BinaryPath`, `SUPPORTED_PLATFORMS` |
| `binaries/<platform>-<arch>/vec0.{dylib,so,dll}` | Committed-vendored sqlite-vec v0.1.9 loadable extensions (5 platforms). Not source; produced by the maintainer tool. | — | — |

`src/scripts/vendor-vec0.js` is a **maintainer-only** tool (fetch + SHA256-verify +
write the five binaries). It is never on the runtime import graph (asserted by ST-13).

### Public API surface (object-store shape)

`openStore(dbPath)` returns a **`PlanIndexStore` handle** whose methods are the six
remaining primitives; `loadVec0Extension(db)` is a standalone module function (the
scenarios call it directly with a `db`, and PI0's capability gate reuses it). This
object shape is chosen over a module-level singleton so tests and PI4 can hold
multiple independent stores and so each method closes over its own `db` + derived
`logDir`. The seven named primitives map as:

```
openStore(dbPath)                         → db.js            (factory)
store.initVectorTable(dimension)          → schema.initVectorTable(db, dim, logDir)
store.upsertUnit(unit)                    → db.js
store.getUnit(planPath, sectionId)        → db.js
store.deleteUnit(planPath, sectionId)     → db.js
store.moveUnit(fromPath, toPath)          → db.js
store.getFilesForPlan(planPath)           → db.js
loadVec0Extension(db)                     → vec0-loader.js   (also called by openStore)
```
`store.db` is exposed read-only as the escape hatch for raw SELECT/KNN (PI4 and the
tests run `SELECT … FROM vec_plans MATCH …` / `SELECT COUNT(*) …` directly).
**All mutations go through the primitives** so the transactional tri-table invariant
(units + fts_plans + vec_plans share one rowid) is never bypassed.

### How PI0 constructs and gates this slice (PI1 does NOT self-bootstrap)

PI1 is a passive library. The composition + gating sequence lives in **PI0**:

1. PI0 feature-detects the capability (`node:sqlite` present; `PRAGMA compile_options`
   shows `ENABLE_FTS5`; `loadVec0Extension` + `SELECT vec_version()` succeed). If any
   probe fails, PI0 degrades CTOC to "rebuild-from-plans / no index" — **PI1 owns no
   gate and throws no capability decision.**
2. PI0 calls `openStore(dbPath)` once and holds the store in the composition root.
3. After calibration (PI2) determines the per-machine dimension, **PI2 calls
   `store.initVectorTable(dim)`** on the store PI0 holds. PI1 never picks a dimension.
4. PI3 calls `upsertUnit`/`deleteUnit`/`moveUnit`/`getUnit` through the barrel.
   PI4/PI6 use `store.db` for KNN and `getFilesForPlan` + the `kind` column.

### settings.js registration (`plan_index` block)

Add one category to `SETTINGS_SCHEMA` in `src/lib/settings.js` so PI2/PI5/PI6 can
read their config via the existing `getSetting`/`setSetting` API backed by
`settings.json` (the nested, menu-driven store — **never** `settings.yaml`, per the
CONFIG SOURCES note). PI1 itself reads **no** settings at runtime; these are
forward-declared keys. No new tab is added (UI surfacing is explicitly out of
scope, and the settings tests only assert that the six existing tabs are present —
a schema-only category is safe). Exact block in Step 7 §7.8.

### Change classification & dependency posture

New feature, full-depth. **No upstream PI dependency** (foundation). Touch-set is
five new files under `src/lib/plan-index/`, one new maintainer script, one
new test file, plus two additive edits (`settings.js` schema block, `.gitignore`
line). No existing CTOC module imports plan-index yet, so blast radius is contained
behind the barrel (matches the plan's Rollback section).

## Step 6 — DESIGN (Schema, Data Flow, Binary Resolution)

### 6.1 Schema DDL

Base schema is created by `openStore` (`initSchema`); `vec_plans` is **deferred** to
`initVectorTable(dim)` (PI2 owns the dimension). All three tables share a single
integer **rowid** — the canonical `units` table mints it, `fts_plans` and `vec_plans`
are inserted with that explicit rowid, so KNN results JOIN straight back by rowid.

```sql
-- units: canonical metadata + the rowid↔unit mapping (ordinary table)
CREATE TABLE IF NOT EXISTS units (
  rowid         INTEGER PRIMARY KEY,            -- shared with fts_plans + vec_plans
  plan_path     TEXT    NOT NULL,
  section_id    TEXT    NOT NULL,               -- '__plan__' sentinel for kind='plan'
  kind          TEXT    NOT NULL CHECK (kind IN ('plan','section')),
  files         TEXT    NOT NULL DEFAULT '[]',  -- JSON array of declared file globs
  parent_vision TEXT,
  step_label    TEXT,
  content_hash  TEXT    NOT NULL,
  UNIQUE (plan_path, section_id)
);
CREATE INDEX IF NOT EXISTS idx_units_plan_path ON units(plan_path);
CREATE INDEX IF NOT EXISTS idx_units_kind      ON units(kind);
CREATE INDEX IF NOT EXISTS idx_units_parent    ON units(parent_vision);

-- fts_plans: BM25 lexical half (FTS5 virtual table). plan_path/section_id are
-- UNINDEXED filter columns (required by ST-06's COUNT(*) WHERE plan_path=? AND
-- section_id=?). Tokenizer left at unicode61 default — identifier/path tokenizer
-- tuning (tokenchars) is a PI4 retrieval-quality concern, not a storage concern.
CREATE VIRTUAL TABLE IF NOT EXISTS fts_plans USING fts5(
  text,
  plan_path  UNINDEXED,
  section_id UNINDEXED,
  tokenize = 'unicode61'
);

-- vec_plans: dense half (vec0). Created ONLY by initVectorTable(dim). Vector keyed
-- by rowid; cosine declared at creation. <DIM> is an integer-validated interpolation
-- (never a user string → no SQL injection vector).
CREATE VIRTUAL TABLE vec_plans USING vec0(
  embedding float[<DIM>] distance_metric=cosine
);
```

**rowid ↔ unit mapping.** `units` is the source of truth for identity. New unit:
`INSERT INTO units(...)` → `lastInsertRowid` → insert `fts_plans`/`vec_plans` with
that explicit rowid. Existing `(plan_path, section_id)`: reuse its rowid and
delete-then-reinsert the FTS5 and vec0 rows (idempotent in-place replace; rowid
stays stable so `moveUnit` and any external rowid references survive). PI4 pattern:
`SELECT rowid, distance FROM vec_plans WHERE embedding MATCH ? AND k = ?` then
`JOIN units ON units.rowid = vec_plans.rowid` to filter `kind` and read metadata.

**Why a single `kind` column, not two vec0 tables** (re-affirming the plan): all
vectors live in one rowid-indexed `vec_plans`; coarse (`kind='plan'`) vs precise
(`kind='section'`) separation is a metadata JOIN, not a second virtual table.
Plan-level units carry the reserved `section_id='__plan__'` sentinel so
`(plan_path, section_id)` is always a non-null composite key and `getFilesForPlan`
can address the plan-level row unambiguously.

### 6.2 Transaction boundaries

Every mutating primitive wraps its **entire** multi-table write (units + fts_plans
+ vec_plans) in one explicit transaction via a non-re-entrant helper:

```js
function withTransaction(db, fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (err) { try { db.exec('ROLLBACK'); } catch { /* already aborted */ } throw err; }
}
```

This is the ST-05 guarantee: a failure mid-write (e.g. a wrong-dimension vector
rejected by vec0 after `units`/`fts_plans` rows were already written) rolls the
whole transaction back, leaving the prior unit byte-for-byte intact. `BEGIN`/
`ROLLBACK` semantics were verified live against `DatabaseSync.exec`. The helper is
**not** re-entrant — each public primitive owns exactly one transaction and never
calls another mutating primitive.

### 6.3 Data flow (upsert is the representative hot write)

```
upsertUnit(unit)
  → validate: kind ∈ {plan,section}; vector is Float32Array(dim); files is array
  → blob = vectorToBlob(vector)                 // zero-copy view of the Float32 bytes
  → withTransaction(db, () => {
       rowid = existing(plan_path, section_id)?.rowid
       if (rowid) UPDATE units…WHERE rowid=?     // reuse rowid (stable)
       else        rowid = INSERT units… .lastInsertRowid
       DELETE fts_plans WHERE rowid=?; INSERT fts_plans(rowid,text,plan_path,section_id)
       DELETE vec_plans WHERE rowid=?; INSERT vec_plans(rowid, embedding=blob)  // vec0 enforces dim
     })

getUnit(p,s)  → SELECT u.*, f.text, v.embedding
                FROM units u JOIN fts_plans f ON f.rowid=u.rowid
                             JOIN vec_plans v ON v.rowid=u.rowid
                WHERE u.plan_path=? AND u.section_id=?
              → { planPath, sectionId, kind, text, files=JSON.parse, parentVision,
                  stepLabel, contentHash, vector=blobToVector(embedding) }  // or null
```

`vectorToBlob` binds `Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength)`
(node:sqlite binds a Buffer as a BLOB; sqlite-vec accepts packed little-endian
float32 as `float[N]`). `blobToVector` **copies** the returned bytes
(`new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset+buf.byteLength))`)
so the result never aliases Node's shared Buffer pool — this is both the memory-safety
guard and what makes the ST-04/ST-17 byte-for-byte equality (`Buffer.compare`) hold.

### 6.4 Per-platform binary resolution (`vec0-loader.js`)

```
platform = process.platform            // 'darwin' | 'linux' | 'win32'
arch     = process.arch                // 'arm64'  | 'x64'
key      = `${platform}-${arch}`
SUPPORTED_PLATFORMS = ['darwin-arm64','darwin-x64','linux-x64','linux-arm64','win32-x64']
ext      = { darwin:'dylib', linux:'so', win32:'dll' }[platform]
resolved = path.resolve(__dirname, 'binaries', key, `vec0.${ext}`)   // absolute
```

`loadVec0Extension(db)`:
1. If `key ∉ SUPPORTED_PLATFORMS` → throw `Error` whose message names
   `process.platform`, `process.arch`, and the supported list (ST-10).
2. If supported but `!fs.existsSync(resolved)` → throw `Error` naming the resolved
   absolute path (binary not vendored — distinct, actionable maintainer error).
3. `db.enableLoadExtension(true)` → `db.loadExtension(resolved)`; if the default
   filename-derived entrypoint fails, retry `db.loadExtension(resolved,
   'sqlite3_vec_init')` (sqlite-vec's init symbol) → `db.enableLoadExtension(false)`
   (re-disable after the single load: defense-in-depth).
4. Verify with `SELECT vec_version()`.

**Windows DLL note** (carried from the Risks section): always pass the
`path.resolve`-d **absolute** path to `loadExtension` — `win32` extension loading is
sensitive to relative paths / PATH. The absolute-path policy above covers all three
OSes uniformly; `path.join`/`path.resolve` keep separators correct cross-platform.

### 6.5 Dimension-mismatch policy + warning log (ST-03)

`initVectorTable(db, dimension, logDir)`:
- `readVecDimension(db)` parses the existing `float[(\d+)]` out of
  `SELECT sql FROM sqlite_master WHERE name='vec_plans'` (the DDL is exactly what we
  wrote, so the regex is reliable); returns `null` if the table is absent.
- absent → `CREATE VIRTUAL TABLE vec_plans … float[dimension] … cosine`.
- same dimension → no-op (idempotent; this is what makes ST-11 rebuild reproducible).
- different dimension → `DROP TABLE vec_plans` + recreate at the new dimension +
  append a `warn` entry to `.ctoc/logs/plan-index.json`; **no throw** (the DB is a
  rebuildable cache). The logger mirrors `src/lib/enforcement-log.js`: create the
  log dir if missing, append `{ timestamp, level:'warn', event:'vec_table_dimension_change',
  from_dimension, to_dimension, message }`, rotate at a max-entries cap.

`logDir` is derived once in `openStore` from `dbPath`:
`path.resolve(path.dirname(dbPath), '..', 'logs')` (from `…/.ctoc/index/` up to
`…/.ctoc/logs/`) and closed over by the store's `initVectorTable`.

## Step 7 — SPEC (Function Signatures & Behavior)

> Step 7 also runs the implementation-plan-reviewer then the integrator+critic
> (10 rounds) at Gate 2 prep; the contract below is the input to that pass.

### 7.1 `openStore(dbPath: string) → PlanIndexStore`
- `fs.mkdirSync(path.dirname(dbPath), { recursive: true })`; `db = new
  DatabaseSync(dbPath, { allowExtension: true })`; `loadVec0Extension(db)`;
  `initSchema(db)` (creates `units` + `fts_plans`; **not** `vec_plans`).
- Returns `{ db, initVectorTable, upsertUnit, getUnit, deleteUnit, moveUnit,
  getFilesForPlan, close }` with `logDir` captured in the closure.
- Throws: propagates `loadVec0Extension` errors (unsupported platform / missing
  binary). Idempotent re-open on an existing DB reuses the schema unchanged.
- Covers ST-01 (vec_version non-empty; FTS5 in `PRAGMA compile_options`), ST-11.

### 7.2 `store.initVectorTable(dimension: number) → void`
- Validates `dimension` is a positive integer (else `TypeError`). Applies the §6.5
  absent / same / different policy. Cosine declared at creation.
- Covers ST-02 (`sqlite_master.sql` contains `distance_metric=cosine` and
  `float[384]`; `PRAGMA table_info` shows the `embedding` column), ST-03.

### 7.3 `store.upsertUnit(unit) → number` (returns rowid)
`unit = { planPath, sectionId, kind, text, vector, files, parentVision, stepLabel, contentHash }`
- Pre-validate: `kind ∈ {'plan','section'}` (throw clear `Error` on violation — the
  `CHECK` constraint is the second line of defense); `vector instanceof Float32Array`
  with `length === table dimension` (throw before binding for a clear message; vec0
  also rejects); `files` is an array (default `[]`); `contentHash` non-empty string.
- Throws `Error('vector table not initialized — call initVectorTable(dimension) first')`
  if `vec_plans` is absent.
- Idempotent replace keyed on `(planPath, sectionId)`; rowid preserved across replace.
- Covers ST-04 (full round-trip incl. byte-for-byte vector), ST-15 (bad kind throws).

### 7.4 `store.getUnit(planPath: string, sectionId: string) → Unit | null`
- Tri-table JOIN by rowid (§6.3). Returns the full object with `vector` as a fresh
  `Float32Array`, `files` parsed from JSON, or `null` when absent (never throws on
  a miss).
- Covers ST-04, and the post-conditions of ST-05/ST-06/ST-17.

### 7.5 `store.deleteUnit(planPath: string, sectionId: string) → boolean`
- In one transaction: resolve rowid; `DELETE FROM units / fts_plans / vec_plans
  WHERE rowid=?`. Returns `true` if a row was deleted, `false` if none matched
  (never throws on a miss).
- Covers ST-06 (`getUnit`→null; `COUNT(*)`=0 on `fts_plans` AND `vec_plans`).

### 7.6 `store.moveUnit(fromPath: string, toPath: string) → number` (units re-pathed)
- Re-paths **every** unit (plan-level + all sections) whose `plan_path = fromPath`,
  in one transaction: `UPDATE units SET plan_path=toPath`; for each affected rowid
  `UPDATE fts_plans SET plan_path=toPath WHERE rowid=?`. **`vec_plans` is untouched**
  — the vector is keyed by the unchanged rowid, so it is preserved byte-for-byte and
  no re-embedding occurs (the load-bearing guarantee). `content_hash` is not modified.
- Returns the count of re-pathed units; `0` if `fromPath` matched nothing.
- Covers ST-17. **See Decision D1** for the deliberate reading of "plan_path updates
  in … vec0" — this is the one item a human reviewer should confirm.

### 7.7 `store.getFilesForPlan(planPath: string) → string[]`
- `SELECT files FROM units WHERE plan_path=? AND kind='plan' LIMIT 1` → `JSON.parse`
  → array. Returns `[]` when there is no plan-level row or `files` is empty; **never
  throws**. Keyed on plan path/slug, not section.
- Covers ST-16.

### 7.8 `loadVec0Extension(db) → string` (returns vec_version) + `settings.js` block
`loadVec0Extension` per §6.4 — covers ST-07/08/09 (supported), ST-10 (unsupported),
and ST-13 (no `vendor-vec0.js` in the require cache). Add to `SETTINGS_SCHEMA`:

```js
plan_index: {
  label: 'Plan Index Settings',
  settings: [
    { key: 'engine_preference',  label: 'Embedding engine preference', type: 'select',
      options: ['auto', 'ollama', 'in-process'], default: 'auto' },     // PI2
    { key: 'ollama_base_url',    label: 'Ollama base URL',             type: 'string',
      default: 'http://localhost:11434' },                              // PI2
    { key: 'duplicate_threshold',label: 'Duplicate-guard threshold',   type: 'number',
      default: 0.85 }                                                   // PI5/PI6
  ]
}
```
Satisfies the settings-suite invariants (every setting has `key`/`label`/`type`/
`default`; the `select` default is in `options`). `.gitignore`: append `.ctoc/index/`
(the DB is a git-ignored cache; `.ctoc/logs/` is already ignored; binaries under
`src/lib/plan-index/binaries/` stay committed).

## Acceptance Criteria → Test Mapping (`tests/plan-index-store.test.js`)

15 acceptance criteria expand to **17 tests** (the single "supported platform"
criterion fans out to ST-07/08/09, one per OS). All run with **zero network**, under
`node:test`. Tests that need a temp DB use `fs.mkdtempSync(os.tmpdir(), …)` and clean
up. Every ST below is a distinct `test()` with a meaningful assertion (no empty
catches, no assertionless passes).

| ST | Primitive(s) | Key assertion |
|----|-------------|---------------|
| ST-01 | openStore | `vec_version()` matches `^\d+\.\d+\.\d+$`; `PRAGMA compile_options` includes `ENABLE_FTS5` |
| ST-02 | initVectorTable | `sqlite_master.sql` for `vec_plans` contains `distance_metric=cosine` and `float[384]` |
| ST-03 | initVectorTable | after `initVectorTable(512)` over an existing dim-384 table: new sql shows `float[512]`; no throw; a `warn` row appended to `.ctoc/logs/plan-index.json` |
| ST-04 | upsertUnit+getUnit | every field equals input incl. `kind`/`contentHash`/`files`(array)/`parentVision`; `Buffer.compare(inBytes, outBytes) === 0` |
| ST-05 | upsertUnit (tx) | upsert with a wrong-dimension vector throws and `getUnit` still returns the original unit byte-for-byte (rollback proven via real failure, not a mock) |
| ST-06 | deleteUnit | `getUnit`→null; `COUNT(*) FROM fts_plans WHERE plan_path=? AND section_id=?`=0; `COUNT(*) FROM vec_plans WHERE rowid=?`=0 |
| ST-07 | loadVec0Extension | `existsSync(resolveVec0BinaryPath('darwin','arm64'))`; if current runtime → load + `vec_version()` regex |
| ST-08 | loadVec0Extension | `existsSync(resolveVec0BinaryPath('linux','x64'))`; if current runtime → load + `vec_version()` regex |
| ST-09 | loadVec0Extension | `existsSync(resolveVec0BinaryPath('win32','x64'))`; if current runtime → load + `vec_version()` regex |
| ST-10 | loadVec0Extension | unsupported key (e.g. `win32-arm64`) → `Error.message` contains platform + arch + supported list |
| ST-11 | openStore+initVectorTable | delete DB + re-init same sequence → identical DDL strings for `units`, `fts_plans`, `vec_plans` (names, columns, cosine, dim) |
| ST-12 | upsertUnit | `SELECT … FROM units WHERE parent_vision='vision/ci.md'` returns the row; `files` is a JSON column, not in a vector |
| ST-13 | barrel import | after `require('…/plan-index')` + `openStore`, no `require.cache` key ends with `vendor-vec0.js`; no network performed |
| ST-14 | upsertUnit + raw KNN | for query `[1,0,0]`, A`[10,1,0]` ranks above B`[0.1,0.995,0]` (cosine dist A≈0.005 < B≈0.900; under L2 the order reverses — proves cosine) |
| ST-15 | upsertUnit | one `kind='plan'` + one `kind='section'` for same plan → each `COUNT(*)`=1; `kind='unknown'` throws |
| ST-16 | getFilesForPlan | returns `['src/lib/a.js','src/lib/b/**']`; a plan with no `files:` → `[]`; never throws |
| ST-17 | moveUnit+getUnit | `plan_path` updated in `units` + `fts_plans`; `vec_plans` row intact at same rowid; `getUnit(toPath)` vector + `contentHash` unchanged (`Buffer.compare === 0`) |

## Steps 8–16 — Execution Checklist (Iron Loop)

- [ ] **Step 8 — TEST** (test-maker): write `tests/plan-index-store.test.js` first
  (TDD red) — all 17 ST cases from the mapping above, `node:test` idiom, temp DBs via
  `mkdtempSync`, zero network. Tests fail until Steps 9–10 land code + binaries.
  Empirically confirm three binary-dependent facts and adjust assertions to the
  real binary (not stubs): the `vec0` load entrypoint (default vs `sqlite3_vec_init`),
  whether `PRAGMA table_info(vec_plans)` exposes the dimension or only `sqlite_master.sql`
  does, and that `SELECT embedding FROM vec_plans WHERE rowid=?` returns the raw
  float32 BLOB.
- [ ] **Step 9 — PREPARE** (quality-checker): create `src/lib/plan-index/`; **maintainer
  runs `node src/scripts/vendor-vec0.js`** once to fetch + SHA256-verify + commit the
  5 platform binaries under `binaries/<platform>-<arch>/` (one-time, networked,
  maintainer-only — never CI/runtime). Record the version triple (Node 24 / SQLite
  3.51.2 / sqlite-vec 0.1.9) in a `vec0-loader.js` header comment.
- [ ] **Step 10 — IMPLEMENT** (implementer): build `vec0-loader.js`, `schema.js`,
  `db.js`, `index.js`, `src/scripts/vendor-vec0.js`; add the `plan_index` block to
  `src/lib/settings.js`; append `.ctoc/index/` to `.gitignore`. One IMPLEMENT step,
  sub-items per file. No stubs — any residual ambiguity resolved as a documented
  choice here and recorded below.
- [ ] **Step 11 — REVIEW** (self-reviewer): dependency direction (`index`→`db`→leaves,
  no cycles); single-responsibility per module; rowid invariant; transaction wrapping
  on every mutation; null/empty/throw contracts match §7.
- [ ] **Step 12 — OPTIMIZE** (optimizer): prepared statements reused (no per-call
  re-prepare on the hot upsert/get paths); confirm the three `units` indexes serve
  the lookups; zero-copy bind / single-copy read on vectors.
- [ ] **Step 13 — SECURE** (security-scanner): no SQL injection (dimension is
  integer-validated before interpolation; everything else parameterized); absolute
  binary path + re-disable `enableLoadExtension(false)` after load; SHA256 pin in
  `vendor-vec0.js`; `blobToVector` copies out of the Buffer pool (no memory aliasing);
  no secrets; error messages leak no sensitive paths beyond the intended binary path.
- [ ] **Step 14 — VERIFY** (verifier): `node --test tests/*.test.js` → `# fail 0`,
  all 17 ST green, **0 skipped, 0 flaky**; lint + `tsc` checkJs clean (no new warnings —
  warnings are treated as bugs); coverage ≥ 80% on `src/lib/plan-index/**`; confirm
  `settings.test.js` and `environment-mode.test.js` still pass (the additive
  `plan_index` block must not regress them).
- [ ] **Step 15 — DOCUMENT** (documenter): JSDoc on the seven primitives + the barrel;
  a `src/lib/plan-index/README` note on the rebuildable-cache contract, the version
  triple, and the maintainer `vendor-vec0.js` workflow.
- [ ] **Step 16 — FINAL-REVIEW** (implementation-reviewer → CTO Chief): 14 quality
  dimensions; verify Gate 2 marker present; confirm PI2/PI3/PI4/PI6 contracts
  (`initVectorTable`, CRUD, `store.db` KNN, `getFilesForPlan` + `kind`) are met.
  Gate 3 is the human's.

## Decisions Taken Under Ambiguity — Implementation Planning (2026-06-28)

- **D1 — `moveUnit` and the "vec0" re-path (the one to confirm at Gate 2).** ST-17
  literally says "`plan_path` updates in the metadata, FTS5, **and vec0** tables."
  The chosen design keeps `plan_path` **out of** `vec_plans` (it lives canonically in
  `units`, denormalized into `fts_plans` only because ST-06 filters on it). vec0 holds
  the vector keyed by rowid alone, so `moveUnit` leaves vec0 untouched and the vector
  is preserved byte-for-byte by construction. Rationale: a single source of truth for
  `plan_path` avoids the tri-write drift the vision explicitly warns against, and it
  does not depend on unverified vec0 metadata-column UPDATE semantics in v0.1.9.
  ST-17's "vec0" clause is satisfied as "the vec row for the unit's rowid is intact
  with identical bytes after the re-path." **Fallback if the reviewer wants `plan_path`
  physically in vec0:** declare `vec_plans` with a `plan_path` metadata column and make
  `moveUnit` delete+reinsert the vec row reusing the stored bytes (still no re-embed) —
  a localized change to `schema.js` + `db.js`.
- **D2 — Object-store API over a module singleton.** `openStore` returns a handle whose
  methods are the primitives (plus read-only `store.db`). Enables multiple independent
  stores (tests, PI4) and per-store `logDir` capture; avoids hidden global state.
- **D3 — Plan-level `section_id` sentinel.** Plan-level units use `section_id='__plan__'`
  so `(plan_path, section_id)` is always a non-null composite key and `getFilesForPlan`
  can address the plan row. (`NULL` would break SQL `UNIQUE`/equality.)
- **D4 — FTS5 tokenizer = `unicode61` default.** Identifier/path tokenizer tuning
  (`tokenchars`) is deferred to PI4 (retrieval quality / RRF), which is out of PI1's
  storage-foundation scope. The fixed DDL keeps ST-11 rebuild reproducible.
- **D5 — `plan_path` is stored/returned verbatim; normalization is PI3's job.** ST-16
  passes a bare slug (`pi6-conflict.md`) while other scenarios use full paths
  (`plans/todo/x.md`). PI1 keys on the exact `plan_path` string supplied at upsert;
  the sync layer (PI3) is responsible for normalizing paths before calling in.
- **D6 — Node experimental-SQLite warning is left in place.** `require('node:sqlite')`
  emits a one-line `ExperimentalWarning` to stderr (observed live on Node 24.14.1).
  This is Node's informational banner for a built-in feature, not a deprecation, our
  bug, or a CVE — globally muting process warnings from a library is worse than the
  banner, so it is not suppressed in code. It does not fail `node --test`
  (`# fail 0`). The Node-version guarantee that keeps the experimental API stable is
  **PI0's** capability gate, not PI1's. (Run the suite with `--no-warnings` if a fully
  silent log is wanted — a harness choice, not a code change.)
- **D7 — ST-05 uses a real failure trigger.** Rollback is exercised by a genuine
  wrong-dimension vector rejected by vec0 mid-transaction (after `units`/`fts_plans`
  writes), not by monkey-patching the transaction — testing behavior, not a mock.
- **D8 — Cross-platform binary tests are runtime-conditional.** ST-07/08/09 always
  assert the committed binary file exists for each platform, and additionally load +
  version-check only the binary matching the current `process.platform`/`arch` (you
  cannot `dlopen` a foreign-arch `.so`/`.dll`). This keeps the suite green on any one
  OS while still guarding that all five binaries are vendored.
