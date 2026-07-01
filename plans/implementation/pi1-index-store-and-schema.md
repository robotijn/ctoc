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
acceptance_criteria_count: 18
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

- [ ] **Scenario: Store opens in WAL mode with a non-zero busy timeout**
  Given `openStore(dbPath)` has just returned a store
  When `PRAGMA journal_mode` and `PRAGMA busy_timeout` are queried on `store.db`
  Then `journal_mode` returns `wal` and `busy_timeout` returns `5000`, so the
  multi-process sync path (menu + PostToolUse hook + reconciliation sweep all
  touching `plans.db`) does not deadlock on `SQLITE_BUSY`; the WAL side-files
  (`plans.db-wal`, `plans.db-shm`) are covered by the existing `.ctoc/index/`
  gitignore entry

- [ ] **Scenario: Parameterized vector table creation with cosine metric**
  Given the store is open and no vec0 virtual table exists
  When `initVectorTable(384)` is called
  Then a vec0 virtual table is created accepting 384-float vectors with cosine
  distance metric; `SELECT sql FROM sqlite_master WHERE name = 'vec_plans'`
  contains `distance_metric=cosine` and `float[384]` (the vec0 dimension is
  exposed via `sqlite_master.sql`, not `PRAGMA table_info`; see Decision D10)

- [ ] **Scenario: Dimension mismatch triggers a full tri-table reset**
  Given a vec0 table already exists at dimension 384 with at least one stored unit
  When `initVectorTable(512)` is called
  Then the `vec_plans`, `fts_plans`, and `units` tables are all cleared and
  `vec_plans` is recreated at dimension 512; no silent mismatch, no thrown error,
  a warning is logged to `.ctoc/logs/`, and the pre-existing unit is absent from
  all three tables (no orphaned metadata; `getUnit` returns null)

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

- [ ] **Scenario: Binary selection — supported platform but binary not vendored**
  Given the runtime is a supported platform/arch but the resolved binary file is
  absent (e.g., a fresh checkout before the maintainer ran `vendor-vec0.js`)
  When `loadVec0Extension(db)` is called
  Then it throws an `Error` whose `.message` contains the resolved absolute path
  of the missing binary and points at the maintainer `vendor-vec0.js` step — a
  distinct, actionable error separate from the unsupported-platform case

- [ ] **Scenario: Binary selection — incompatible binary (e.g. musl libc)**
  Given the runtime key is supported and the binary file exists, but the native
  library fails to load (e.g. the glibc-linked `.so` on an Alpine/musl host, or
  any raw `dlopen` failure)
  When `loadVec0Extension(db)` is called
  Then the raw loader error is caught and re-thrown as an `Error` whose `.message`
  names `process.platform`, `process.arch`, the libc flavor when detectable, and
  directs the caller to PI0's degrade path (rebuild-from-plans / no-index); the
  process never surfaces a bare, unhelpful `dlopen` error

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
- Resolve and load the vendored `sqlite-vec` binary from
  `src/lib/plan-index/binaries/<platform>-<arch>/vec.{dylib,so,dll}` — committed
  to the repo, no runtime download, no network call. **The file is named
  `vec.{ext}` (not `vec0.{ext}`)** so SQLite's filename-derived extension entry
  point resolves to `sqlite3_vec_init` (the symbol sqlite-vec actually exports);
  see §6.4 and Decision D9
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
- `src/scripts/vendor-vec0.js` — maintainer-only binary refresh tool; fetches,
  checksum-verifies, and writes the per-platform binaries as `vec.<ext>` (see
  D9); a networked, out-of-band, human-run action (F8); **never imported at runtime**
- Register `plan_index` block in `SETTINGS_SCHEMA` in `src/lib/settings.js`
  (keys: `engine_preference`, `ollama_base_url`, `duplicate_threshold` — stubs
  for PI2/PI5/PI6; PI1 reads no settings itself at runtime)
- `tests/plan-index-store.test.js` — covers all 20 test scenarios (ST-01…ST-20)

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
| ST-02   | initVectorTable(384) creates vec0 with cosine  | `sqlite_master.sql` contains `distance_metric=cosine` and `float[384]` (dim via sqlite_master, not table_info) |
| ST-03   | Dimension mismatch → FULL tri-table reset      | New table reflects dim 512; no error thrown; warning logged; pre-existing unit gone from units + fts_plans + vec_plans |
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
| ST-18   | Supported platform, binary not vendored, throws| existsSync false at resolved path → error names resolved absolute path + `vendor-vec0.js` step |
| ST-19   | Incompatible binary (dlopen/musl) throws       | loadExtension throws → re-thrown error names platform + arch + libc + degrade path; no bare dlopen |
| ST-20   | openStore sets WAL + busy_timeout              | `PRAGMA journal_mode` = wal; `PRAGMA busy_timeout` = 5000                  |

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

- **Extension entry-point derivation (F1)**: `node:sqlite`
  `DatabaseSync.loadExtension(path)` is single-arg — no explicit entry-point
  parameter — so SQLite derives the C symbol from the filename. sqlite-vec exports
  `sqlite3_vec_init`, which only resolves if the file is named `vec.<ext>` (a
  `vec0.<ext>` name derives the non-existent `sqlite3_vec0_init` and fails).
  - Likelihood: HIGH if mis-named (certainty of failure), otherwise N/A
  - Impact: HIGH (extension never loads → store non-functional — a slice-killer)
  - Mitigation: vendor the binary as `vec.<ext>` (D9); the **mandatory Step 8
    pre-IMPLEMENT spike** proves `loadExtension(vec0Path)` + `SELECT vec_version()`
    on the dev machine before any store code is written; see `## Blocking Prerequisites`

- **musl / Alpine libc incompatibility (F2)**: sqlite-vec ships glibc-linked `.so`
  binaries; on a musl host `existsSync` passes but `dlopen` throws a raw, unhelpful
  error.
  - Likelihood: MEDIUM (Alpine is common in CI/containers)
  - Impact: MEDIUM (Linux-musl only; degradable)
  - Mitigation: `loadVec0Extension` wraps the load in try/catch and re-throws an
    actionable error naming platform/arch/libc + PI0's degrade path (rebuild-from-plans
    / no-index); musl is documented known-unsupported (D11); a musl-linked build is a
    future maintainer TODO, not a PI1 blocker; tested by ST-19

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

## Blocking Prerequisites (gate IMPLEMENT — Step 10)

Step 10 (IMPLEMENT) MUST NOT begin until BOTH of these are satisfied. They are hard
gates, not soft warnings:

1. **Native `vec0` binaries are vendored (maintainer action, F8).** A human
   maintainer has run `node src/scripts/vendor-vec0.js` once — a networked,
   out-of-band action — to fetch, SHA256-verify, and commit the five per-platform
   sqlite-vec v0.1.9 loadable extensions under
   `src/lib/plan-index/binaries/<platform>-<arch>/vec.<ext>`. No automated Iron-Loop
   agent fetches or commits these; if they are absent the loop stalls and surfaces the
   blocker to the human — it does not route around it or write a stub.
2. **The Step 8 load spike passes (F1).** On the dev machine, single-arg
   `db.loadExtension(vec0Path)` loads and `SELECT vec_version()` returns a version
   string. **STATUS: PASSED on darwin-arm64 (see Spike Results below).** Remaining
   before IMPLEMENT: the maintainer vendors the other four platform binaries and the
   spike is re-confirmed per platform in CI.

Ordering: maintainer vendors binaries → Step 8 spike proves the load → Step 8 tests
are authored → Steps 9–10 implement.

### Step-8 Spike Results (empirical — darwin-arm64, Node 24.14.1, sqlite-vec 0.1.9, 2026-07-01)

Ran the F1 spike against the real sqlite-vec loadable extension. Findings supersede
the pre-spike theory in §6.4 / D9:

- **loadExtension works single-arg with the DEFAULT `vec0.<ext>` filename.** The
  critic's theory — that `vec0.dylib` derives entry point `sqlite3_vec0_init` and
  fails — is **empirically false**: `db.loadExtension(resolve('vec0.dylib'))`
  (single-arg) loaded cleanly, `SELECT vec_version()` returned `v0.1.9`, and a
  `CREATE VIRTUAL TABLE … USING vec0(embedding float[3])` + knn round-trip succeeded
  (query `[1,0,0]` → rowid 1, distance 0). **⇒ D9's rename to `vec.<ext>` is NOT
  required.** Recommendation: vendor the binaries under their shipped name
  (`vec0.<ext>`); keep the rename only as a documented per-platform *fallback* if
  some platform's entry-point derivation ever fails the spike. Simpler vendoring.
- **D13 (NEW, critical implementer contract) — rowid MUST be bound as `BigInt`.**
  vec0's implicit `rowid` primary key rejects a JS `number` bound by `node:sqlite`
  (it binds as REAL): `INSERT INTO t(rowid, embedding) VALUES (1, ?)` throws
  `"Only integers are allowed for primary key values"`, whereas `(1n, ?)` (BigInt)
  succeeds. `upsertUnit` (§7.3) and `moveUnit` (§7.6) MUST bind rowid as BigInt
  (coerce with `BigInt(rowid)` at the store boundary). A Step-8 test MUST assert an
  insert with a numeric rowid is handled (coerced) and one binding raw REAL fails —
  otherwise every write silently fails at runtime (a no-stub-rule gotcha).
- **2-arg `loadExtension(path, entry)` did not throw** on this build (the extra arg
  was tolerated), but the single-arg form is the contract; do not rely on the 2-arg
  form.
- Embeddings bind as `Uint8Array` over a `Float32Array` buffer; `enableLoadExtension(false)`
  after load works (keep the security re-disable in §6.4).

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
| `binaries/<platform>-<arch>/vec.{dylib,so,dll}` | Committed-vendored sqlite-vec v0.1.9 loadable extensions (5 platforms), named `vec.{ext}` so SQLite derives the `sqlite3_vec_init` entry point (§6.4/D9). Not source; produced by the maintainer tool. | — | — |

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
resolved = path.resolve(__dirname, 'binaries', key, `vec.${ext}`)    // absolute
```

**Entry-point contract (F1 — load-bearing).** `node:sqlite`
`DatabaseSync.loadExtension(path)` is **single-argument**: it takes the path only
and has **no** parameter for an explicit C entry-point symbol (passing a 2nd arg
throws `TypeError`). SQLite therefore derives the entry point from the *filename*:
for a file `<name>.<ext>` it tries `sqlite3_extension_init` first (which sqlite-vec
does not export) then `sqlite3_<name>_init`. sqlite-vec's exported symbol is
`sqlite3_vec_init`, so the vendored file **must be named `vec.<ext>`** (→ derives
`sqlite3_vec_init`). A file named `vec0.<ext>` would derive the non-existent
`sqlite3_vec0_init` and auto-load fails. The maintainer script writes the binaries
under the `vec.<ext>` name for exactly this reason. The filename→symbol derivation
is confirmed empirically by the Step 8 spike (see `## Blocking Prerequisites`)
before any store code is written; see Decision D9.

`loadVec0Extension(db)`:
1. If `key ∉ SUPPORTED_PLATFORMS` → throw `Error` whose message names
   `process.platform`, `process.arch`, and the supported list (ST-10).
2. If supported but `!fs.existsSync(resolved)` → throw `Error` naming the resolved
   absolute path AND the `vendor-vec0.js` maintainer step (binary not vendored —
   distinct, actionable maintainer error; ST-18).
3. `db.enableLoadExtension(true)`; then **single-arg** `db.loadExtension(resolved)`
   wrapped in `try/catch`. On throw (F2 — e.g. a glibc-linked `.so` on a musl/Alpine
   host where `existsSync` passed but `dlopen` fails, or any raw loader error),
   re-throw an `Error` whose message names `process.platform`, `process.arch`, the
   detected libc flavor (see below), the resolved path, and directs the caller to
   PI0's degrade path (rebuild-from-plans / no-index). Never let a bare `dlopen`
   string escape unwrapped. `finally → db.enableLoadExtension(false)` (re-disable
   after the single load: defense-in-depth). **No 2-arg `loadExtension` retry** —
   the API does not accept one; correctness comes from the filename above (ST-19).
4. Verify with `SELECT vec_version()`; if it throws or returns empty, treat it as a
   load failure per step 3.

**libc detection (best-effort).** On `linux`, derive the flavor for the error
message from `process.report.getReport().header.glibcVersionRuntime` (present ⇒
glibc; absent ⇒ likely musl) — best-effort only, never a hard gate. **musl is
known-unsupported**: sqlite-vec ships glibc-linked `.so` binaries and CTOC vendors
those; a musl build is an out-of-scope future maintainer TODO (Decision D11), so on
musl the store degrades to PI0's no-index path with the clear error above rather
than crashing.

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
- different dimension → **FULL tri-table reset** (F4). A dimension change means every
  stored vector is now invalid, so recreating `vec_plans` alone would leave orphaned
  `units` + `fts_plans` rows whose vectors are gone — and `getUnit`'s tri-table INNER
  JOIN would then return `null` for metadata that still exists (silent inconsistency).
  Instead, in one transaction: `DROP TABLE vec_plans`, `DELETE FROM fts_plans`,
  `DELETE FROM units`, then recreate `vec_plans` at the new dimension. This is safe
  because the DB is a rebuildable cache (the `.md` plans are the source of truth) and
  PI3's reconciliation sweep re-populates all three tables on its next pass. A `warn`
  entry is appended to `.ctoc/logs/plan-index.json`; **no throw**. The logger mirrors
  `src/lib/enforcement-log.js`: create the log dir if missing, append
  `{ timestamp, level:'warn', event:'vec_table_dimension_change', from_dimension,
  to_dimension, rows_cleared, message }`, rotate at a max-entries cap. (Alternative
  considered — keep metadata and force an immediate re-embed sweep — rejected for PI1:
  re-embedding is PI2/PI3's job and PI1 must not depend on them; see Decision D12.)

`logDir` is derived once in `openStore` from `dbPath`:
`path.resolve(path.dirname(dbPath), '..', 'logs')` (from `…/.ctoc/index/` up to
`…/.ctoc/logs/`) and closed over by the store's `initVectorTable`.

## Step 7 — SPEC (Function Signatures & Behavior)

> Step 7 also runs the implementation-plan-reviewer then the integrator+critic
> (10 rounds) at Gate 2 prep; the contract below is the input to that pass.

### 7.1 `openStore(dbPath: string) → PlanIndexStore`
- `fs.mkdirSync(path.dirname(dbPath), { recursive: true })`; `db = new
  DatabaseSync(dbPath, { allowExtension: true })`; **immediately** run
  `db.exec('PRAGMA journal_mode=WAL')` and `db.exec('PRAGMA busy_timeout=5000')`
  (F3 — the vision's sync is multi-trigger, multi-process: menu + PostToolUse hook
  + reconciliation sweep all open `plans.db`; the default rollback journal + zero
  busy-timeout would surface `SQLITE_BUSY` and hang the live menu. WAL lets readers
  and one writer proceed concurrently; the 5 s busy-timeout absorbs brief writer
  contention). Then `loadVec0Extension(db)`; `initSchema(db)` (creates `units` +
  `fts_plans`; **not** `vec_plans`).
- The WAL side-files `plans.db-wal` / `plans.db-shm` live alongside `plans.db` under
  `.ctoc/index/` and are covered by the existing `.ctoc/index/` gitignore entry (no
  extra ignore rule needed).
- Returns `{ db, initVectorTable, upsertUnit, getUnit, deleteUnit, moveUnit,
  getFilesForPlan, close }` with `logDir` captured in the closure.
- Throws: propagates `loadVec0Extension` errors (unsupported platform / missing
  binary / incompatible binary). Idempotent re-open on an existing DB reuses the
  schema unchanged (WAL mode persists on the file; re-applying the PRAGMAs is a
  cheap no-op).
- Covers ST-01 (vec_version non-empty; FTS5 in `PRAGMA compile_options`), ST-20
  (WAL + busy_timeout), ST-11.

### 7.2 `store.initVectorTable(dimension: number) → void`
- Validates `dimension` is a positive integer (else `TypeError`). Applies the §6.5
  absent / same / different policy. Cosine declared at creation.
- Covers ST-02 (`sqlite_master.sql` contains `distance_metric=cosine` and
  `float[384]` — dimension verified via `sqlite_master.sql`, not `PRAGMA table_info`;
  see D10), ST-03.

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
- **Opaque-key contract (F6):** `plan_path` is an **opaque exact-match key** — PI1
  does no normalization; a lookup succeeds only if the caller passes the identical
  string used at `upsertUnit`. The barrel JSDoc must state this verbatim ("plan_path
  is an opaque key; callers must normalize consistently"). Consistent normalization
  is carried forward as a **required PI3 (sync/upsert) and PI6 (conflict /
  getFilesForPlan) acceptance criterion** — flagged here so it is not lost when those
  slices are planned; see Decision D5.
- Covers ST-16.

### 7.8 `loadVec0Extension(db) → string` (returns vec_version) + `settings.js` block
`loadVec0Extension` per §6.4 — covers ST-07/08/09 (supported), ST-10 (unsupported
platform), ST-18 (supported platform but binary not vendored), ST-19 (incompatible
binary / musl `dlopen` failure), and ST-13 (no `vendor-vec0.js` in the require
cache). Add to `SETTINGS_SCHEMA`:

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

18 acceptance criteria expand to **20 tests** (the single "supported platform"
criterion fans out to ST-07/08/09, one per OS; three new error/concurrency branches
add ST-18/19/20). All run with **zero network**, under `node:test`. Tests that need a
temp DB use `fs.mkdtempSync(os.tmpdir(), …)` and clean up. Every ST below is a
distinct `test()` with a meaningful assertion (no empty catches, no assertionless
passes).

| ST | Primitive(s) | Key assertion |
|----|-------------|---------------|
| ST-01 | openStore | `vec_version()` matches `^\d+\.\d+\.\d+$`; `PRAGMA compile_options` includes `ENABLE_FTS5` |
| ST-02 | initVectorTable | `sqlite_master.sql` for `vec_plans` contains `distance_metric=cosine` and `float[384]` |
| ST-03 | initVectorTable | after `initVectorTable(512)` over an existing dim-384 table holding a unit: new sql shows `float[512]`; no throw; a `warn` row appended to `.ctoc/logs/plan-index.json`; **the pre-existing unit is gone from `units`, `fts_plans`, AND `vec_plans` (full reset — no orphaned metadata; `getUnit` returns null, not a JOIN miss)** |
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
| ST-18 | loadVec0Extension | supported key but binary file absent (temp `binaries/` dir with no file, or `resolveVec0BinaryPath` pointed at an empty dir) → `Error.message` contains the resolved absolute path and points at the `vendor-vec0.js` maintainer step |
| ST-19 | loadVec0Extension | supported key, file present, but `loadExtension` throws (drive the branch by placing a non-library file at the resolved path so `existsSync` passes but `dlopen` fails) → caught + re-thrown `Error.message` names platform + arch + libc flavor + degrade path; assert no bare `dlopen` string leaks |
| ST-20 | openStore | after `openStore`, `PRAGMA journal_mode` returns `wal` and `PRAGMA busy_timeout` returns `5000` |

## Steps 8–16 — Execution Checklist (Iron Loop)

- [ ] **Step 8 — TEST** (test-maker). **First sub-item is a mandatory pre-IMPLEMENT
  spike (F1) — no store code is written until it passes:** on the dev machine, load the
  vendored binary with the **single-arg** `db.loadExtension(vec0Path)` and run
  `SELECT vec_version()`; prove both succeed. If the load fails, resolve the
  entry-point/arity problem *before proceeding* — confirm the file is named `vec.<ext>`
  so SQLite derives `sqlite3_vec_init` (§6.4 / D9), and confirm `loadExtension` rejects
  a 2nd argument. Record the confirmed filename→symbol behavior in `vec0-loader.js`.
  This spike is gated on the binaries already being vendored (see `## Blocking
  Prerequisites`). **Then** write `tests/plan-index-store.test.js` (TDD red) — all 20 ST
  cases from the mapping above, `node:test` idiom, temp DBs via `mkdtempSync`, zero
  network. Tests fail until Steps 9–10 land code + binaries. Empirically confirm the
  remaining binary-dependent facts and adjust assertions to the real binary (not stubs):
  the dimension is exposed via `sqlite_master.sql` (not `PRAGMA table_info`; D10), and
  `SELECT embedding FROM vec_plans WHERE rowid=?` returns the raw float32 BLOB.
- [ ] **Step 9 — PREPARE** (quality-checker): create `src/lib/plan-index/`.
  **Binary vendoring is a human-maintainer, out-of-band, networked action performed
  BEFORE the Step 8 spike/tests can pass — NOT something an automated Iron-Loop agent
  fetches or commits (F8).** The maintainer runs `node src/scripts/vendor-vec0.js` once
  to fetch + SHA256-verify + commit the 5 platform binaries under
  `binaries/<platform>-<arch>/` **named `vec.<ext>`** (one-time, networked,
  maintainer-only — never CI/runtime). Record the version triple (Node 24 / SQLite
  3.51.2 / sqlite-vec 0.1.9) in a `vec0-loader.js` header comment. Ordering: maintainer
  vendors binaries → Step 8 spike proves the load → Step 8 tests authored → Steps 9–10
  implement. See `## Blocking Prerequisites`.
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
  all 20 ST green, **0 skipped, 0 flaky**; lint + `tsc` checkJs clean (no new warnings —
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
- **D5 — `plan_path` is an opaque, verbatim key; normalization is PI3/PI6's job (F6).**
  ST-16 passes a bare slug (`pi6-conflict.md`) while other scenarios use full paths
  (`plans/todo/x.md`). PI1 keys on the exact `plan_path` string supplied at upsert and
  does no normalization; the barrel JSDoc states this verbatim ("plan_path is an opaque
  key; callers must normalize consistently"). Consistent normalization is carried
  forward as a **required acceptance criterion for PI3 (sync/upsert) and PI6 (conflict
  detection / getFilesForPlan)** so the contract is not lost — the deferral is
  deliberate and scoped, not an omission.
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
- **D9 — sqlite-vec binary is vendored as `vec.<ext>`, not `vec0.<ext>` (F1).**
  `node:sqlite` `DatabaseSync.loadExtension(path)` is single-argument (no explicit
  entry-point parameter; a 2nd arg throws `TypeError`), so SQLite must derive the C
  entry point from the filename. sqlite-vec exports `sqlite3_vec_init`; SQLite derives
  `sqlite3_<name>_init` from `<name>.<ext>`, so the file is named `vec.<ext>` (derives
  `sqlite3_vec_init`). A `vec0.<ext>` name would derive the non-existent
  `sqlite3_vec0_init` and fail. The Step 8 spike confirms this empirically on the dev
  machine before any store code is written; if a platform derives differently, the
  filename is adjusted there and the finding recorded in `vec0-loader.js`. The prior
  2-arg `loadExtension(resolved, 'sqlite3_vec_init')` retry is removed — the API does
  not support it.
- **D10 — vec0 dimension is verified via `sqlite_master.sql`, not `PRAGMA table_info`
  (F7).** vec0 is a virtual table; `PRAGMA table_info(vec_plans)` does not reliably
  expose the declared `float[N]` dimension, whereas `SELECT sql FROM sqlite_master
  WHERE name='vec_plans'` returns the exact `CREATE VIRTUAL TABLE … float[N] …` DDL.
  All dimension assertions (the AC, ST-02, ST-11) read the dimension from
  `sqlite_master.sql`. Step 8 confirms empirically whether `table_info` also happens to
  expose it; the AC does not depend on that.
- **D11 — musl/Alpine is known-unsupported for now (F2).** sqlite-vec ships
  glibc-linked `.so` binaries; on a musl host `existsSync` passes but `dlopen` throws.
  `loadVec0Extension` catches this and re-throws an actionable error (platform, arch,
  detected libc, degrade path), so CTOC degrades to PI0's no-index / rebuild-from-plans
  path rather than crashing. A dedicated musl-linked vec0 build is an out-of-scope
  future maintainer TODO; PI1 does not attempt it.
- **D12 — dimension change performs a FULL tri-table reset, not a vec-only recreate
  (F4).** A different-dimension `initVectorTable` invalidates every stored vector, so
  PI1 clears `units` + `fts_plans` + `vec_plans` together (one transaction) rather than
  dropping `vec_plans` alone and orphaning metadata (which would make `getUnit`'s INNER
  JOIN silently return null). This is safe because the DB is a rebuildable cache and
  PI3's reconciliation re-populates it. The alternative (keep metadata, force an
  immediate re-embed) was rejected: re-embedding is PI2/PI3's responsibility and PI1
  must carry no dependency on them.
