---
iron_loop: true
approved_by: human
approved_at: 2026-07-10T17:01:39.222Z
gate_crossed: implementation → todo
---

---
approved_by: human
approved_at: 2026-07-08T20:52:40.418Z
gate_crossed: functional → implementation
---

---
iron_loop: true
title: "CU4a s31 — completeness check over all 114 CU4a-targeted thin framework guides"
type: implementation
parent_plan: CU4a-frameworks-longtail
depends_on: CU4a-frameworks-longtail-s1-aiml-train-lowlevel, CU4a-frameworks-longtail-s2-aiml-inference-runtime, CU4a-frameworks-longtail-s3-aiml-numeric-frameworks, CU4a-frameworks-longtail-s4-aiml-finetune-peft, CU4a-frameworks-longtail-s5-aiml-orchestration-agents, CU4a-frameworks-longtail-s6-aiml-vectordb-cloud, CU4a-frameworks-longtail-s7-aiml-experiment-tracking, CU4a-frameworks-longtail-s8-aiml-serving-compute, CU4a-frameworks-longtail-s9-aiml-app-ui, CU4a-frameworks-longtail-s10-aiml-hf-data, CU4a-frameworks-longtail-s11-data-streaming-core, CU4a-frameworks-longtail-s12-data-batch-spark, CU4a-frameworks-longtail-s13-data-warehouse, CU4a-frameworks-longtail-s14-data-query-engines, CU4a-frameworks-longtail-s15-data-lake-formats, CU4a-frameworks-longtail-s16-data-dataframe-compute, CU4a-frameworks-longtail-s17-data-sql-newsql, CU4a-frameworks-longtail-s18-data-sql-embedded-orm, CU4a-frameworks-longtail-s19-data-kv-cache, CU4a-frameworks-longtail-s20-data-wide-column, CU4a-frameworks-longtail-s21-data-document-graph, CU4a-frameworks-longtail-s22-data-search, CU4a-frameworks-longtail-s23-data-orchestration-quality, CU4a-frameworks-longtail-s24-mobile-native-declarative, CU4a-frameworks-longtail-s25-mobile-dotnet-hybrid, CU4a-frameworks-longtail-s26-mobile-gameengine-python, CU4a-frameworks-longtail-s27-devops-k8s-family, CU4a-frameworks-longtail-s28-devops-containers, CU4a-frameworks-longtail-s29-devops-iac-secrets, CU4a-frameworks-longtail-s30-devops-config-observ
priority: MEDIUM
risk_level: LOW
stage: in-progress
files:
  - .ctoc/audit/corpus-audit-2026-06-15.json
  - tests/cu4a-completeness.test.js
---

# CU4a s31 — completeness check over all 114 CU4a-targeted thin framework guides

> Slice 31 (FINAL) of the CU4a decomposition. This is the **no-silent-skip completeness gate**
> for CU4a (mirrors CU4c s12 / `tests/corpus-audit-ledger.test.js`). It does NOT upgrade any guide —
> the 30 upgrade slices (s1–s30) do that. It (a) records/confirms an audit-ledger verdict for
> **every one of the 114 CU4a-scope files** (`UPGRADED` or `SOLID-SKIPPED`), and (b) adds the
> content-contract completeness test that reads the REAL ledger + the REAL 114 guide files off disk
> and asserts the diff between the in-scope-114 and (UPGRADED ∪ SOLID-SKIPPED) is EMPTY.
> `depends_on` all 30 upgrade slices because it verifies their recorded verdicts — a fan-in
> (dependency chain depth 2: upgrade slice → completeness). No cycles.
>
> **NO STUBS. NO FABRICATED NUMBERS. ZERO TEST DOUBLES.**
> The completeness test READS the real ledger JSON + the real 114 guides off disk with
> `fs.readFileSync` / `JSON.parse` — no mocks, no fixtures, no fakes. The 114 in-scope filenames are
> the audit-ledger diff: all `skills/frameworks/{ai-ml,data,mobile,devops}/*.md` at ≤ 5 `## ` sections
> MINUS the 14 CU3-named files (ai-ml: pytorch, tensorflow, langchain, transformers, anthropic-sdk,
> openai-sdk; web: react, nextjs; data: pandas, numpy, prisma; mobile: react-native, flutter, expo) —
> confirmed fresh 2026-07-10 as exactly 114 (38 ai-ml + 49 data + 12 mobile + 15 devops). `skills/frameworks/web/*.md`
> is OUT OF SCOPE (every web file already has ≥ 6 `## ` sections). No fabricated verdict: a file is
> `UPGRADED` only if it now has > 5 `## ` sections on disk; `SOLID-SKIPPED` only with a recorded rationale.

Maps to CU4a acceptance criteria: **"scope is established by diffing the audit ledger against the CU3
named set"**, **"every audit-confirmed thin framework file is upgraded or recorded (zero silent
omissions)"**, **"no audited-SOLID file is rewritten"**, and **"audit artifact updated with per-file
verdicts; completeness check passes; `node --test tests/*.test.js` passes with `# fail 0`"**.

## Implementation Details

### Architecture Decision

Mirror `tests/cu4c-completeness.test.js` + `tests/corpus-audit-ledger.test.js` (the no-silent-skip
contract): read the REAL ledger + REAL source files, assert coverage of an explicit in-scope list.
CU4a's in-scope list is the **114-file constant** derived by the audit-ledger diff (thin
`skills/frameworks/{ai-ml,data,mobile,devops}/*.md` minus the 14 CU3-named files) and confirmed fresh
2026-07-10. CU4a per-file processing status is recorded as a **`cu4a_verdict`** of `UPGRADED` /
`SOLID-SKIPPED` (matching CU4c's `cu4c_verdict` convention) so the completeness diff is computable.

**No new gate logic, no churn of existing ledger records.** The ledger is appended to (new CU4a
records/verdicts under the `.ctoc/*`-whitelisted path); existing CU1/CU2/CU3/CU4b/CU4c records are
untouched.

### The 114 in-scope files (audit-ledger diff, confirmed 2026-07-10)

- **ai-ml** (38): accelerate autogen bitsandbytes chromadb crewai datasets deepspeed diffusers dspy fastai ggml gradio huggingface-hub jax keras llama-cpp llamaindex milvus mlflow modal ollama onnx peft pgvector pinecone qdrant ray replicate scikit-learn semantic-kernel streamlit tensorrt triton trl unsloth vllm wandb weaviate
- **data** (49): airbyte airflow alembic arangodb arrow beam cassandra clickhouse cockroachdb couchbase dagster dask dbt debezium delta-lake dgraph drizzle duckdb dynamodb elasticsearch fivetran flink great-expectations hudi iceberg kafka meilisearch memcached mongodb neo4j neon opensearch planetscale polars prefect presto questdb redis scylladb snowflake spark sqlalchemy sqlite supabase timescaledb trino typesense vaex valkey
- **mobile** (12): beeware capacitor compose-multiplatform ionic jetpack-compose kivy maui nativescript swiftui unity unreal xamarin
- **devops** (15): ansible chef crossplane datadog docker grafana helm kubernetes kustomize podman prometheus pulumi puppet saltstack vault

All 114 at exactly 5 `## ` sections on 2026-07-10; none is a CU3-named file (those 14 sit at ≥ 12
sections and are OUT OF SCOPE), none is a web file (all ≥ 6 sections, OUT OF SCOPE). Slice→file
coverage (union = 114, no overlap, no omission):
- s1 (ai-ml): vllm, tensorrt, triton, deepspeed
- s2 (ai-ml): ggml, llama-cpp, onnx, ollama
- s3 (ai-ml): jax, keras, fastai, scikit-learn
- s4 (ai-ml): accelerate, peft, trl, bitsandbytes, unsloth
- s5 (ai-ml): llamaindex, autogen, crewai, semantic-kernel, dspy
- s6 (ai-ml): pinecone, weaviate, qdrant, chromadb, milvus, pgvector
- s7 (ai-ml): mlflow, wandb
- s8 (ai-ml): ray, modal, replicate
- s9 (ai-ml): gradio, streamlit
- s10 (ai-ml): huggingface-hub, datasets, diffusers
- s11 (data): kafka, flink, beam, debezium
- s12 (data): spark, dbt, airbyte, fivetran
- s13 (data): snowflake, clickhouse, duckdb
- s14 (data): trino, presto, questdb
- s15 (data): iceberg, hudi, delta-lake, arrow
- s16 (data): polars, dask, vaex
- s17 (data): cockroachdb, planetscale, neon, supabase
- s18 (data): sqlite, timescaledb, sqlalchemy, alembic, drizzle
- s19 (data): redis, valkey, memcached
- s20 (data): cassandra, scylladb, dynamodb, couchbase
- s21 (data): mongodb, arangodb, neo4j, dgraph
- s22 (data): elasticsearch, opensearch, typesense, meilisearch
- s23 (data): airflow, dagster, prefect, great-expectations
- s24 (mobile): swiftui, jetpack-compose, compose-multiplatform
- s25 (mobile): maui, xamarin, ionic, capacitor, nativescript
- s26 (mobile): unity, unreal, kivy, beeware
- s27 (devops): kubernetes, helm, kustomize
- s28 (devops): docker, podman
- s29 (devops): pulumi, crossplane, vault, ansible
- s30 (devops): chef, puppet, saltstack, prometheus, grafana, datadog

### Dependency Graph

```
.ctoc/audit/corpus-audit-2026-06-15.json  (MODIFY: add CU4a per-file verdicts)  <--tested-by-- tests/cu4a-completeness.test.js
tests/cu4a-completeness.test.js                 (CREATE)  --reads--> the REAL ledger + the REAL 114 guides
(depends_on s1..s30: verifies each slice's recorded UPGRADED verdict + on-disk >5 sections)
```

Two files (ledger + test). Fan-in dependency on s1–s30; no cycle; chain depth 2.

### File Specifications

#### File: `.ctoc/audit/corpus-audit-2026-06-15.json`
**Action:** MODIFY (append CU4a verdicts; no-churn on existing records)
**Purpose:** The no-silent-skip contract — every CU4a-scope file has a recorded verdict.
- For each of the 114 files, ensure a CU4a verdict entry exists: `UPGRADED` (default — the file now
  has > 5 `## ` sections after s1–s30) or `SOLID-SKIPPED` (only if a slice explicitly recorded the
  file as already-solid with a rationale; not expected — all 114 are thin).
- Record each entry with `path`, `cu4a_verdict`, `slice` (e.g. `CU4a-s1`), and `date`.
- Do NOT modify existing CU1/CU2/CU3/CU4b/CU4c records. Whitelisted path (`.ctoc/*`).

#### File: `tests/cu4a-completeness.test.js`
**Action:** CREATE
**Purpose:** Asserts CU4a completeness against the REAL ledger + REAL guides — zero doubles.
- Reads the ledger via `fs.readFileSync` + `JSON.parse` (throw-on-invalid is the check).
- Holds the 114-file `IN_SCOPE` constant (the confirmed diff list above), and independently
  RE-DERIVES it from disk: enumerate `skills/frameworks/{ai-ml,data,mobile,devops}/*.md`, keep those
  at ≤ 5 sections at audit time / minus the 14 CU3-named — assert the derived set equals the constant
  (a drift guard so a mis-typed constant fails).
- Reads each of the 114 guides off disk and asserts `sectionCount(md) > 5` (proves the UPGRADED
  verdict is real, not fabricated).
- Asserts the completeness diff: every file in `IN_SCOPE` appears in the union of the ledger's CU4a
  `UPGRADED` ∪ `SOLID-SKIPPED` sets — diff MUST be empty (no silent omission), and no phantom CU4a
  verdict names a file outside IN_SCOPE.
- Asserts NO CU3-named file (pytorch/…/expo) and NO web file is recorded under a CU4a verdict
  (scope-boundary guard).

### Test Plan

#### Tests: `tests/cu4a-completeness.test.js`
**Action:** CREATE
**Framework:** `node:test` (`describe`/`it`/`node:assert/strict`)
**Zero doubles:** reads the REAL ledger + REAL 114 guides off disk (mirroring
`tests/cu4c-completeness.test.js`). No mocks, no fixtures, no fakes.

Test cases:
1. **Ledger valid** — `JSON.parse` succeeds on the real ledger (throw = fail).
2. **In-scope constant is exactly 114** — the `IN_SCOPE` list has 114 entries, all distinct, none a
   CU3-named file, none a web file; and it equals the disk-derived diff set (drift guard).
3. **Every in-scope guide is UPGRADED on disk** — for each of the 114, `> 5` `## ` sections read fresh
   off disk (verdict is real).
4. **Completeness diff empty** — `IN_SCOPE \ (UPGRADED ∪ SOLID-SKIPPED)` is empty AND no CU4a verdict
   names a file outside IN_SCOPE (no phantom, no omission).
5. **Scope-boundary guard** — no CU3-named file and no web file appears under a CU4a verdict.
6. **Suite stays green** — this test is part of `node --test tests/*.test.js` → `# fail 0`.

**Coverage note:** content/ledger-grounding substitutes for line/branch coverage (CU4c s12
convention).

### Security Review

- Reads a JSON ledger + Markdown guides + appends verdict entries to a `.ctoc/*`-whitelisted file; no
  runtime path, no user input surface.
- Test uses `path.join(__dirname, '..')` + fixed relative paths — no traversal.
- `JSON.parse` on a repo-controlled file (not untrusted input); no `eval`.
- Only the two enumerated files touched.

## Execution Plan

Canonical Iron Loop Steps 8–16 (exact labels) — each step appears exactly once.

### Step 8: TEST (TDD Red)
Confirm baseline green, then WRITE the completeness test reading the REAL ledger + the REAL 114 guides.
- [x] Create `tests/cu4a-completeness.test.js` (zero doubles — `fs.readFileSync` + `JSON.parse` on the real ledger + 114 real guides)
- [x] Test error conditions (silent-omission diff, phantom verdict, scope-boundary breach, on-disk drift, fabricated-UPGRADED guard)
- [x] Run tests — RED: 241 tests, 239 pass, 2 fail (the two ledger-verdict assertions: "CU4a verdict block exists/non-empty" + "completeness diff empty"). All 114 content tests + boundary guards GREEN on disk.

### Step 9: PREPARE
- [x] Confirmed s1–s30 complete — all 114 guides > 5 `## ` sections on disk (10–14 sections each); all carry a >= 2025 dated http source
- [x] Re-derived the 114-file in-scope list from disk = exactly 114 (38 ai-ml + 49 data + 12 mobile + 15 devops); matches the plan's list byte-for-byte
- [x] No new dependencies (node:test only)

### Step 10: IMPLEMENT
Append any missing CU4a verdict entries so all 114 files are recorded; finalize the test. ONE step, two files.
- [x] Appended 114 CU4a `UPGRADED` verdicts to `.ctoc/audit/corpus-audit-2026-06-15.json` (0 SOLID-SKIPPED — all 114 were thin); existing records untouched (812 insertions, 0 deletions)
- [x] Guard held: the append script refuses `UPGRADED` for any file ≤ 5 sections and refuses to overwrite an existing `cu4a_verdicts` block
- [x] Finalized `tests/cu4a-completeness.test.js` (reads the real appended block off disk)

### Step 11: REVIEW
- [x] Self-review: the 114 in-scope list matches the audit-ledger diff and disk; every file has a CU4a `UPGRADED` verdict (114/114, zero omissions)
- [x] No CU3-named file and no web file recorded under CU4a (leak checks return NONE); existing CU1/CU2/CU3/CU4c/CU5 records untouched (records=38, cu4c=41, cu5=13 all intact — additive diff only)

### Step 12: OPTIMIZE
- [x] Ledger additions minimal + structured (single `cu4a_verdicts` object); the test's IN_SCOPE_BY_DIR constant is the single source of the 114 — derived once, no duplication
- [x] Read-once ledger per helper; flat `readdirSync` per dir

### Step 13: SECURE
- [x] Security Review checklist run; `JSON.parse` on the repo ledger only; no `eval`
- [x] No path traversal (`path.join(__dirname, '..')` + fixed relative paths); no secrets; only the two enumerated files touched

### Step 14: VERIFY
- [x] Lint: `npx eslint . --max-warnings 0` → exit 0. Type check: `tsc --noEmit` baseline-neutral (89 pre-existing errors in `src/`, 0 referencing this slice's files — this slice adds no TS)
- [x] ALL tests (TDD Green): `node --test tests/*.test.js` → 5485 tests, `# fail 0`, 0 skipped, 0 todo. `tests/cu4a-completeness.test.js` GREEN (diff empty, all 114 UPGRADED on disk, scope-boundary guards pass)
- [x] `tests/corpus-audit-ledger.test.js` + `tests/cu3-completeness.test.js` still pass (trio: 306 tests, 0 fail; existing records intact; cu3 relaxed ai-ml boundary kept GREEN, untouched)
- [x] Coverage ≥ 80% via content/ledger-grounding (CU4c s12 convention); 0 skipped, 0 flaky

### Step 15: DOCUMENT
- [x] Recorded in `## Decisions Taken Under Ambiguity` below: the final 114-file verdict summary (114 UPGRADED / 0 SOLID-SKIPPED), the cu5 pre-existing count-mismatch finding (out of scope, left untouched), and the cu3 relaxed-boundary note

### Step 16: FINAL-REVIEW
- [x] Steps 8–15 completed correctly; all quality checks passed
- [x] All 114 CU4a-scope files recorded UPGRADED with zero silent omissions; completeness diff empty
- [x] No CU3/web file touched; only the two enumerated files edited; full suite green (5485 pass, 0 fail)
- [x] Ready for human review (CU4a complete — ready for Gate 2 batch approval with its siblings)

## Decisions Taken Under Ambiguity

- **Ledger verdict block shape.** Mirrored the CU4c `cu4c_verdicts` convention exactly: a single additive top-level `cu4a_verdicts` object carrying `produced_by` / `recorded_date` / `legend` / `scope_note` / `count` / `upgraded_count` / `solid_skipped_count` / `verdicts[]`. Each verdict entry = `{ path, cu4a_verdict, slice, date, section_count }`. `section_count` was added (read fresh off disk at append time) so the "UPGRADED is real" guard is auditable directly from the ledger.
- **Final 114-file verdict summary.** 114 UPGRADED, 0 SOLID-SKIPPED — every CU4a-scope file was thin (5 `## ` sections) at audit time and is now substantive (10–14 sections) on disk after s1–s30. No file was already-solid, so no SOLID-SKIPPED rationale was needed. Per-slice coverage matches the plan's authoritative table (union = 114, no overlap, no omission).
- **No fabricated verdict.** The append refuses to write UPGRADED for any file ≤ 5 sections and refuses to overwrite an existing block; all 114 passed the > 5 guard (min 10 sections). The test independently re-reads each of the 114 off disk and asserts > 5 sections + a >= 2025 dated http source.
- **cu3 relaxed ai-ml boundary — left GREEN, untouched.** `tests/cu3-completeness.test.js` was already reconciled by the caller in wave 1 (its ai-ml exclusivity assertion relaxed because CU4a upgrades the long-tail). This slice did NOT undo that; it re-asserts the complementary guarantee (no CU3-named/web file regressed below floor) inside `cu4a-completeness.test.js` instead. cu3 stays GREEN.
- **cu5 count mismatch is pre-existing and out of scope.** `cu5_wrapper_verdicts.count` reads 12 while its `verdicts[]` has 13 entries; this discrepancy exists at HEAD (verified via `git show HEAD:`), is not asserted by any test, and lives outside this slice's two `files:`. Left untouched — a no-churn append must not silently "fix" an unrelated block. Flagged here for morning review.
- **tsc baseline-neutral.** The project has 89 pre-existing `tsc --noEmit` errors in `src/lib` / `src/tabs` / `src/scripts`; none reference this slice's files (a `.test.js` + a `.json`), which add no type surface. Baseline unchanged.

## Risk Mitigations

| Risk | Mitigation | Where |
|------|-----------|-------|
| A slice's file silently omitted from the ledger | Completeness test asserts IN_SCOPE \ (UPGRADED ∪ SOLID-SKIPPED) is empty — a missing verdict fails the suite | Step 10, Step 14 |
| A verdict recorded UPGRADED but the file is still thin | Test reads the file off disk and asserts > 5 `## ` sections — a fabricated verdict fails | Step 10, Step 14 |
| Scope creep into a CU3-named or web file | Scope-boundary guard test asserts no CU3-named/web file under a CU4a verdict | Step 11, Step 14 |
| Corrupting existing CU1/CU2/CU3 ledger records | Additive-only append; `tests/corpus-audit-ledger.test.js` + `tests/cu3-completeness.test.js` re-run to confirm intact | Step 11, Step 14 |
| In-scope count drifts from 114 | Re-derive from disk at Step 9; IN_SCOPE constant asserted `=== 114` and disjoint from the 14 CU3-named + all web files | Step 9, Step 14 |


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write tests for the implementation
- [x] Test error conditions
- [x] Run tests - expect RED (failing)

### Step 9: PREPARE
- [x] Install dependencies if needed
- [x] Check prerequisites
- [x] Verify dev environment ready
- [x] Create directories/config if needed

### Step 10: IMPLEMENT
- [x] Implement the feature according to requirements
- [x] Add error handling
- [x] Wire up integration points

### Step 11: REVIEW
- [x] Self-review all new code
- [x] Verify integration points work together
- [x] Check error handling completeness

### Step 12: OPTIMIZE
- [x] Remove redundant operations
- [x] Optimize critical paths
- [x] Simplify complex code

### Step 13: SECURE
- [x] Validate inputs (no path traversal)
- [x] Sanitize outputs
- [x] No secrets in code
- [x] Safe file operations

### Step 14: VERIFY
- [x] Run lint + type check
- [x] Run ALL tests (TDD Green)
- [x] Check coverage >= 80%
- [x] 0 skipped, 0 flaky tests

### Step 15: DOCUMENT
- [x] Update relevant documentation
- [x] Add JSDoc comments to new functions
- [x] Update CHANGELOG if needed

### Step 16: FINAL-REVIEW
- [x] Verify steps 8-15 completed correctly
- [x] All quality checks passed
- [x] Manual verification if needed
- [x] Ready for human review
