---
approved_by: human
approved_at: 2026-07-08T20:52:40.418Z
gate_crossed: functional → implementation
---

---
title: "CU4a — Frameworks long-tail reference upgrade"
created: "2026-06-15T00:00:00Z"
priority: MEDIUM
type: feature
parent_vision: upgrade-agents-and-skills-corpus
program: ctoc-corpus-quality
order: 5
depends_on: [CU3-tier1-frameworks]
status: refined
acceptance_criteria_count: 9
risk_level: MEDIUM
is_slice_index: true
---

# CU4a — Frameworks long-tail reference upgrade

> **This plan is a SLICE INDEX** (`is_slice_index: true`). Per SIP1, the
> implementation-planner decomposed CU4a's **114 thin framework-guide upgrades** (38 ai-ml +
> 49 data + 12 mobile + 15 devops — enumerated fresh 2026-07-10, each at exactly the 5-section
> template floor) into **31 cohesive slices** (30 upgrade slices + 1 completeness slice), each a
> COMPLETE small implementation plan with its own `## Implementation Details`, canonical Step 8–16
> `## Execution Plan`, and a real-file content-contract test (zero doubles). Slices are grouped by
> **category + sub-family for research-pass coherence** (one research+write pass produces guides
> whose footgun/CVE/version families overlap), and the 30 upgrade slices are **disjoint by file**,
> so `depends_on: none` between them. The final slice (s31) `depends_on` all 30 upgrade slices — it
> is the no-silent-skip completeness gate that records an audit-ledger verdict for every one of the
> 114 files and asserts the completeness diff is empty (chain depth 2, no cycles). Gate 2 & Gate 3
> still batch per parent via `approveSubplans` — ONE human decision crosses every sibling; each is
> stamped `approved_by: human`. This index inherits CU4a's Gate-1 `approved_by: human` marker, as do
> all 31 slices; NO human gate is weakened.
>
> **Scope boundary (confirmed 2026-07-10):** in-scope = thin (≤ 5 `## ` sections)
> `skills/frameworks/{ai-ml,data,mobile,devops}/*.md` MINUS the 14 CU3-named files (ai-ml: pytorch,
> tensorflow, langchain, transformers, anthropic-sdk, openai-sdk; web: react, nextjs; data: pandas,
> numpy, prisma; mobile: react-native, flutter, expo — all at ≥ 12 sections, OUT OF SCOPE).
> `skills/frameworks/web/*.md` is entirely OUT OF SCOPE: every web file already has ≥ 6 `## `
> sections (none thin). Web frameworks are therefore not decomposed here.
>
> **Every slice bakes in the four HARD RULES** (non-negotiable, user-emphasized): (1) **NO STUBS** —
> each guide becomes a substantive correction surface (real footguns, version gotchas, CVE/security
> awareness for that framework). (2) **NO FABRICATED NUMBERS/CVEs/VERSIONS** — every framework
> version, CVE/CWE, advisory, date, and best-practice claim is WEB-VERIFIED against official sources
> (docs / release notes / PyPI / npm / GitHub releases / cwe.mitre.org) at edit time and carries an
> inline dated http source ≥ 2025-01-01; if unverifiable, the claim is OMITTED and its absence noted
> in the audit findings (ai-ml/data APIs move fast — verification discipline matters MORE, not less).
> (3) **ZERO TEST DOUBLES** — each slice's content-contract test reads the REAL guide files off disk
> and asserts substance (> 5 `## ` sections, required footgun/security/testing/references sections,
> real CWE ids where used, ≥ 1 dated http source per guide), no mocks/stubs/fakes. (4)
> **SINGLE-FRAMEWORK EXAMPLES** — the 7-language BAD/SAFE cross-coverage rule is EXEMPT here; examples
> are idiomatic + current within each single framework.

## Slices (dependency-ordered)

| # | Slice file | Guides upgraded (`files:`) | Scope (one line) | depends_on |
|---|------------|----------------------------|------------------|------------|
| 1 | `CU4a-frameworks-longtail-s1-aiml-train-lowlevel.md` | `vllm.md`, `tensorrt.md`, `triton.md`, `deepspeed.md` + `tests/cu4a-aiml-train-lowlevel-guides.test.js` | ai-ml GPU serving/training runtimes — vLLM KV-cache OOM, TensorRT engine-plan deserialization (CWE-502), Triton BLS exec (CWE-94), DeepSpeed ZeRO offload; web-verified, dated. | none |
| 2 | `CU4a-frameworks-longtail-s2-aiml-inference-runtime.md` | `ggml.md`, `llama-cpp.md`, `onnx.md`, `ollama.md` + `tests/cu4a-aiml-inference-runtime-guides.test.js` | ai-ml local inference — GGUF/ONNX file-parse trust boundaries (CWE-787/502), quantization accuracy, n_ctx/thread footguns, Ollama unauthenticated 11434; dated. | none |
| 3 | `CU4a-frameworks-longtail-s3-aiml-numeric-frameworks.md` | `jax.md`, `keras.md`, `fastai.md`, `scikit-learn.md` + `tests/cu4a-aiml-numeric-frameworks-guides.test.js` | ai-ml numeric/classic-ML — JAX jit purity + PRNG-split, Keras/fastai/sklearn pickle-model load (CWE-502), data-leakage Pipeline; dated. | none |
| 4 | `CU4a-frameworks-longtail-s4-aiml-finetune-peft.md` | `accelerate.md`, `peft.md`, `trl.md`, `bitsandbytes.md`, `unsloth.md` + `tests/cu4a-aiml-finetune-peft-guides.test.js` | ai-ml fine-tuning stack — accelerate launch + grad-accum, PEFT adapter-merge, TRL DPO/SFT, bitsandbytes NF4, Unsloth patch order; dated. | none |
| 5 | `CU4a-frameworks-longtail-s5-aiml-orchestration-agents.md` | `llamaindex.md`, `autogen.md`, `crewai.md`, `semantic-kernel.md`, `dspy.md` + `tests/cu4a-aiml-orchestration-agents-guides.test.js` | ai-ml agent/RAG orchestration — prompt-injection + tool/code-exec trust boundaries (CWE-77/94), unbounded agent-loop cost, chunking/retrieval correctness; dated. | none |
| 6 | `CU4a-frameworks-longtail-s6-aiml-vectordb-cloud.md` | `pinecone.md`, `weaviate.md`, `qdrant.md`, `chromadb.md`, `milvus.md`, `pgvector.md` + `tests/cu4a-aiml-vectordb-guides.test.js` | ai-ml vector DBs — dimension/metric mismatch, HNSW recall tuning, metadata-filter + multi-tenant/RLS isolation (CWE-284); dated. | none |
| 7 | `CU4a-frameworks-longtail-s7-aiml-experiment-tracking.md` | `mlflow.md`, `wandb.md` + `tests/cu4a-aiml-experiment-tracking-guides.test.js` | ai-ml experiment tracking — MLflow model-load RCE/pickle (CWE-502) + server exposure, W&B API-key leak (CWE-798), reproducibility; dated. | none |
| 8 | `CU4a-frameworks-longtail-s8-aiml-serving-compute.md` | `ray.md`, `modal.md`, `replicate.md` + `tests/cu4a-aiml-serving-compute-guides.test.js` | ai-ml distributed/serverless compute — Ray dashboard RCE (CWE-306), cloudpickle args, Modal/Replicate secrets (CWE-798) + cost/autoscale; dated. | none |
| 9 | `CU4a-frameworks-longtail-s9-aiml-app-ui.md` | `gradio.md`, `streamlit.md` + `tests/cu4a-aiml-app-ui-guides.test.js` | ai-ml data-app UIs — Gradio share/path-traversal (CWE-22), Streamlit rerun/cache + unsafe_allow_html XSS (CWE-79); dated. | none |
| 10 | `CU4a-frameworks-longtail-s10-aiml-hf-data.md` | `huggingface-hub.md`, `datasets.md`, `diffusers.md` + `tests/cu4a-aiml-hf-data-guides.test.js` | ai-ml HF hub/datasets/diffusion — trust_remote_code (CWE-94) + pickle download (CWE-502), streaming memory, diffusers VRAM-vs-quality; dated. | none |
| 11 | `CU4a-frameworks-longtail-s11-data-streaming-core.md` | `kafka.md`, `flink.md`, `beam.md`, `debezium.md` + `tests/cu4a-data-streaming-core-guides.test.js` | data streaming core — Kafka delivery/idempotence + rebalance, Flink checkpoint/watermark exactly-once, Beam windowing, Debezium WAL/slot; dated. | none |
| 12 | `CU4a-frameworks-longtail-s12-data-batch-spark.md` | `spark.md`, `dbt.md`, `airbyte.md`, `fivetran.md` + `tests/cu4a-data-batch-spark-guides.test.js` | data batch/ELT — Spark shuffle/skew + SQL param (CWE-89), dbt incremental + Jinja-SQL injection (CWE-89), Airbyte/Fivetran schema-drift; dated. | none |
| 13 | `CU4a-frameworks-longtail-s13-data-warehouse.md` | `snowflake.md`, `clickhouse.md`, `duckdb.md` + `tests/cu4a-data-warehouse-guides.test.js` | data warehouses — Snowflake cost/pruning + bind vars (CWE-89), ClickHouse MergeTree ORDER BY, DuckDB single-writer/spill; dated. | none |
| 14 | `CU4a-frameworks-longtail-s14-data-query-engines.md` | `trino.md`, `presto.md`, `questdb.md` + `tests/cu4a-data-query-engines-guides.test.js` | data query engines — Trino/Presto memory + pushdown + param SQL (CWE-89), QuestDB out-of-order ingestion; dated. | none |
| 15 | `CU4a-frameworks-longtail-s15-data-lake-formats.md` | `iceberg.md`, `hudi.md`, `delta-lake.md`, `arrow.md` + `tests/cu4a-data-lake-formats-guides.test.js` | data lake formats — Iceberg/Hudi/Delta snapshot ACID + compaction + VACUUM retention, Arrow zero-copy; dated. | none |
| 16 | `CU4a-frameworks-longtail-s16-data-dataframe-compute.md` | `polars.md`, `dask.md`, `vaex.md` + `tests/cu4a-data-dataframe-compute-guides.test.js` | data dataframe/out-of-core — Polars lazy/collect, Dask partition sizing, Vaex memory-mapped larger-than-RAM; dated. | none |
| 17 | `CU4a-frameworks-longtail-s17-data-sql-newsql.md` | `cockroachdb.md`, `planetscale.md`, `neon.md`, `supabase.md` + `tests/cu4a-data-sql-newsql-guides.test.js` | data distributed/serverless SQL — CockroachDB 40001 retry, PlanetScale deploy-requests/no-FK, Neon pooler/scale-to-zero, Supabase RLS (CWE-284); dated. | none |
| 18 | `CU4a-frameworks-longtail-s18-data-sql-embedded-orm.md` | `sqlite.md`, `timescaledb.md`, `sqlalchemy.md`, `alembic.md`, `drizzle.md` + `tests/cu4a-data-sql-embedded-orm-guides.test.js` | data embedded SQL/ORM/migrations — SQLite WAL/BUSY, TimescaleDB hypertable chunks, SQLAlchemy N+1, Alembic autogen, Drizzle sql.raw (CWE-89); dated. | none |
| 19 | `CU4a-frameworks-longtail-s19-data-kv-cache.md` | `redis.md`, `valkey.md`, `memcached.md` + `tests/cu4a-data-kv-cache-guides.test.js` | data KV/cache — Redis/Valkey SCAN vs KEYS + eviction + protected-mode (RCE class), memcached slab/UDP; dated. | none |
| 20 | `CU4a-frameworks-longtail-s20-data-wide-column.md` | `cassandra.md`, `scylladb.md`, `dynamodb.md`, `couchbase.md` + `tests/cu4a-data-wide-column-guides.test.js` | data wide-column/NoSQL — Cassandra/Scylla partition/tombstone/ALLOW FILTERING, DynamoDB single-table/GSI, Couchbase N1QL (CWE-943); dated. | none |
| 21 | `CU4a-frameworks-longtail-s21-data-document-graph.md` | `mongodb.md`, `arangodb.md`, `neo4j.md`, `dgraph.md` + `tests/cu4a-data-document-graph-guides.test.js` | data document/graph — MongoDB COLLSCAN + $where injection (CWE-943), ArangoDB/Neo4j/Dgraph query params (CWE-943), traversal/supernode; dated. | none |
| 22 | `CU4a-frameworks-longtail-s22-data-search.md` | `elasticsearch.md`, `opensearch.md`, `typesense.md`, `meilisearch.md` + `tests/cu4a-data-search-guides.test.js` | data search — ES/OpenSearch text-vs-keyword + deep pagination + exposure, Typesense/Meilisearch scoped keys (CWE-798); dated. | none |
| 23 | `CU4a-frameworks-longtail-s23-data-orchestration-quality.md` | `airflow.md`, `dagster.md`, `prefect.md`, `great-expectations.md` + `tests/cu4a-data-orchestration-quality-guides.test.js` | data orchestration/quality — Airflow top-level-code/catchup + secrets (CWE-798), Dagster assets, Prefect flows, Great-Expectations suites; dated. | none |
| 24 | `CU4a-frameworks-longtail-s24-mobile-native-declarative.md` | `swiftui.md`, `jetpack-compose.md`, `compose-multiplatform.md` + `tests/cu4a-mobile-native-declarative-guides.test.js` | mobile native declarative — SwiftUI @StateObject/@Observable, Compose recomposition/stability, Compose-MP expect/actual; Keychain/Keystore (CWE-312); dated. | none |
| 25 | `CU4a-frameworks-longtail-s25-mobile-dotnet-hybrid.md` | `maui.md`, `xamarin.md`, `ionic.md`, `capacitor.md`, `nativescript.md` + `tests/cu4a-mobile-dotnet-hybrid-guides.test.js` | mobile .NET/hybrid — MAUI handlers/SecureStorage, Xamarin EOL→MAUI migration, Ionic/Capacitor/NativeScript WebView XSS (CWE-79)/secure-storage (CWE-312); dated. | none |
| 26 | `CU4a-frameworks-longtail-s26-mobile-gameengine-python.md` | `unity.md`, `unreal.md`, `kivy.md`, `beeware.md` + `tests/cu4a-mobile-gameengine-python-guides.test.js` | mobile game engines/Python — Unity GC/pooling, Unreal UPROPERTY GC-reachability, Kivy main-thread, BeeWare Briefcase packaging; dated. | none |
| 27 | `CU4a-frameworks-longtail-s27-devops-k8s-family.md` | `kubernetes.md`, `helm.md`, `kustomize.md` + `tests/cu4a-devops-k8s-family-guides.test.js` | devops K8s + manifests — deprecated-API removal, probes/resources, runAsNonRoot/RBAC (CWE-284), Helm/Kustomize secret plaintext (CWE-312); dated. | none |
| 28 | `CU4a-frameworks-longtail-s28-devops-containers.md` | `docker.md`, `podman.md` + `tests/cu4a-devops-containers-guides.test.js` | devops container runtimes — Docker layer-cache/multi-stage + non-root (CWE-250) + secret-in-layer (CWE-538), Podman rootless/Quadlet; dated. | none |
| 29 | `CU4a-frameworks-longtail-s29-devops-iac-secrets.md` | `pulumi.md`, `crossplane.md`, `vault.md`, `ansible.md` + `tests/cu4a-devops-iac-secrets-guides.test.js` | devops IaC + secrets — Pulumi/Vault state-secret + lease (CWE-312/284), Crossplane composition/drift, Ansible idempotency + Vault/no_log; dated. | none |
| 30 | `CU4a-frameworks-longtail-s30-devops-config-observ.md` | `chef.md`, `puppet.md`, `saltstack.md`, `prometheus.md`, `grafana.md`, `datadog.md` + `tests/cu4a-devops-config-observ-guides.test.js` | devops config-mgmt + observability — Chef/Puppet/Salt idempotency + Salt master RCE (CVE-2020-11651), Prometheus/Grafana/Datadog cardinality + auth (CWE-306/798); dated. | none |
| 31 | `CU4a-frameworks-longtail-s31-completeness-check.md` | `corpus-audit-2026-06-15.json` + `tests/cu4a-completeness.test.js` | COMPLETENESS GATE — records a ledger verdict (UPGRADED/SOLID-SKIPPED) for every one of the 114 files; test reads the REAL ledger + 114 guides and asserts the completeness diff is empty + no CU3/web file touched. | s1..s30 |

**Coverage of the 114 files (audit-ledger diff, confirmed 2026-07-10 — all at exactly 5 `## `
sections, none a CU3-named file, none a web file):**
- **ai-ml (38):** s1 vllm·tensorrt·triton·deepspeed · s2 ggml·llama-cpp·onnx·ollama · s3
  jax·keras·fastai·scikit-learn · s4 accelerate·peft·trl·bitsandbytes·unsloth · s5
  llamaindex·autogen·crewai·semantic-kernel·dspy · s6 pinecone·weaviate·qdrant·chromadb·milvus·pgvector
  · s7 mlflow·wandb · s8 ray·modal·replicate · s9 gradio·streamlit · s10 huggingface-hub·datasets·diffusers.
- **data (49):** s11 kafka·flink·beam·debezium · s12 spark·dbt·airbyte·fivetran · s13
  snowflake·clickhouse·duckdb · s14 trino·presto·questdb · s15 iceberg·hudi·delta-lake·arrow · s16
  polars·dask·vaex · s17 cockroachdb·planetscale·neon·supabase · s18
  sqlite·timescaledb·sqlalchemy·alembic·drizzle · s19 redis·valkey·memcached · s20
  cassandra·scylladb·dynamodb·couchbase · s21 mongodb·arangodb·neo4j·dgraph · s22
  elasticsearch·opensearch·typesense·meilisearch · s23 airflow·dagster·prefect·great-expectations.
- **mobile (12):** s24 swiftui·jetpack-compose·compose-multiplatform · s25
  maui·xamarin·ionic·capacitor·nativescript · s26 unity·unreal·kivy·beeware.
- **devops (15):** s27 kubernetes·helm·kustomize · s28 docker·podman · s29
  pulumi·crossplane·vault·ansible · s30 chef·puppet·saltstack·prometheus·grafana·datadog.

**Union = all 114, no overlap, no omission.** The completeness check (audit-ledger diff of the
in-scope 114 against UPGRADED ∪ SOLID-SKIPPED) runs at the end in s31.

## 1. ASSESS

### Problem Statement

After CU3 upgrades the 14 named high-traffic framework guides, a large long tail
remains: approximately 38+ thin ai-ml files (the entire `skills/frameworks/ai-ml/`
tree minus the 6 CU3-named ai-ml files: pytorch, tensorflow, langchain,
transformers, anthropic-sdk, openai-sdk) plus all other thin framework files
across all `skills/frameworks/` sub-directories not upgraded by CU3. The
2026-06-15 audit found 126 of 211 framework files at the <=5 `##` section template
floor; CU3 accounts for 14 of those, leaving approximately 112 remaining thin
files distributed across ai-ml, web, data, mobile, testing, and other framework
categories. Each is a trigger-loaded correction surface at lower traffic than the
Tier-1 files but collectively representing the completion pass for all thin
framework files. diffusers.md is a confirmed example of an ai-ml long-tail file
at template floor (5 `##` sections, ~70 lines).

### Current State

- **ai-ml long tail**: all `skills/frameworks/ai-ml/*.md` files NOT in CU3's named
  set (i.e. not pytorch, tensorflow, langchain, transformers, anthropic-sdk,
  openai-sdk). Confirmed examples at template floor: diffusers.md (~70 lines, 5
  `##` sections). The full list is derived at implementation time by reading all
  ai-ml files and cross-referencing against CU3's `files:` set.
- **Other thin frameworks**: all `skills/frameworks/**/*.md` files in any
  sub-directory confirmed thin by the 2026-06-15 audit and not already in CU3's
  `files:` set.
- The exact file count is established at implementation time by diffing the audit
  ledger at `.ctoc/audit/corpus-audit-2026-06-15.json` against CU3's upgraded
  file list.
- Audited-SOLID files in all categories are NOT touched; the audit artifact is
  the authority.

### Impact

Lower per-file impact than CU3 because each individual file is lower-traffic.
Aggregate impact is high: 100+ thin files collectively create a large audit-
confirmed gap in the corpus's correction surface. Completing the frameworks
category satisfies the vision's "no thin file silently skipped" requirement
(Success Criterion 5) for the framework tier and provides CU4a's per-file
verdicts to the audit artifact, making corpus completeness trackable.

## 2. ALIGN

### Business Goals

Traced to parent vision Success Criteria 4 and 5: "Upgrades proceed in leverage
order (Tier 1 mainstream before Tier 2 long tail); each batch is independently
verifiable." and "The audit artifact (per-file verdicts) is preserved so progress
is trackable and no thin file is silently skipped."

### Impact Map

**Job to Be Done:** When a developer loads a trigger-loaded guide for a lower-
traffic framework (e.g. diffusers, a testing framework, a data-processing library),
the guide must provide real correction value — so the corpus's correction surface
is complete for all frameworks, not just the Tier-1 named set.

- **Goal:** Complete the audit-identified upgrade list for all remaining thin
  framework files, with no silent skips.
- **Actor:** Claude Code (trigger-loaded at edit time); human reviewer (audits
  progress against the audit artifact).
- **Impact:** Every audit-confirmed thin framework file not in CU3's named set
  is either upgraded (with sourced, dated, framework-specific depth) or explicitly
  recorded as audited-SOLID and skipped — making the audit artifact the trackable
  ground truth for framework corpus completeness.
- **Deliverable:** Upgraded remaining framework reference guides and an updated
  audit artifact recording per-file verdicts for all CU4a-scope files.

### Success Metrics

- Every audit-confirmed thin framework file not in CU3's named set is upgraded
  past the <=5 `##` section floor OR explicitly recorded as SOLID-SKIPPED with
  a rationale.
- Every upgraded guide meets the same objective depth bar as CU3: each required
  section names at least one technology-specific identifier (version number, CWE
  identifier, or concrete API/function name); every version-specific or security
  claim carries a dated source from 2025-01-01 or later.
- The audit artifact is updated with per-file verdicts for all CU4a files.
- `node --test tests/*.test.js` passes with `# fail 0` after each batch.
- No audited-SOLID file is rewritten.

### Audit-Ledger Scoping

In-scope files are determined by diffing the audit ledger at
`.ctoc/audit/corpus-audit-2026-06-15.json` against CU3's upgraded file list (the
14 named files in CU3's `files:` frontmatter). The floor criterion is <=5 `##`
sections (not line count). A completeness check passes when every in-scope file
appears in the audit artifact as UPGRADED or SOLID-SKIPPED — no file may be
silently omitted.

### Stakeholders

- Claude Code (automated consumer).
- Human reviewer (gate approval): verifies per-file verdicts in the audit artifact.
- CU3 (upstream): CU4a inherits CU3's named-set exclusion and depth standard
  via the audit ledger. CU4a must not re-process any file already recorded as
  UPGRADED by CU3.

### Constraints

- **No-churn rule is critical**: audited-SOLID frameworks are NOT touched. The
  audit artifact is the authority for which files are in scope. Do not derive the
  in-scope list from file existence alone — use the audit's per-file verdicts.
- **Scope boundary with CU3**: every thin framework file CU3 already upgraded is
  excluded from CU4a. Implementation diffs the audit's thin-file list against CU3's
  `files:` set to establish the exact CU4a scope.
- **Inherits depth standard from CU3**: the objective depth bar (technology-specific
  identifiers + dated sources from 2025-01-01 or later) applies to every file.
- **Single-framework exemption**: depth-within-framework is the bar; 7-language
  cross-coverage rule does not apply. Implementer must not add cross-language
  BAD/SAFE examples to these single-framework files.
- **Batchable**: implement in self-contained batches (e.g. by framework category)
  so each is independently verifiable.
- **Parallel-safe across distinct files**: different framework files and different
  framework categories can be implemented concurrently within the batch structure.
- **Depends on CU3**: sequenced after CU3 so CU4a can use CU3 outputs and the
  audit ledger to establish its exact scope. CU4b and CU4c are independent of
  CU3 (different files) and may run concurrently with CU4a if the implementation
  queue supports it.

## 3. CAPTURE — Acceptance Criteria

### User Stories

**As a** Claude Code instance editing a Stable Diffusion / Diffusers pipeline,
**I want** the trigger-loaded diffusers.md guide to surface SDXL version coupling,
VRAM optimization patterns, and scheduler trade-offs with dated sources,
**so that** I can flag memory-exhaustion and quality-tradeoff footguns rather than
producing code that silently degrades on the target hardware.

**As a** human reviewer auditing framework corpus completeness,
**I want** the audit artifact updated with per-file verdicts for every CU4a-scope
file,
**so that** I can confirm no thin framework file was silently skipped and the
corpus is fully upgraded for all framework guides.

**As a** future corpus maintainer,
**I want** every skipped file to carry an explicit SOLID-SKIPPED label with
a rationale in the audit artifact,
**so that** I know the skip was deliberate and can reassess if the file's status
changes.

### Acceptance Criteria

**Objective depth gate (applies to every scenario below):** A reviewer rejects
any guide section that does not name at least one technology-specific identifier
(version number, CWE identifier, or concrete API/function name), and rejects any
version-specific or security claim that does not carry an inline dated source from
2025-01-01 or later. This gate is identical to the CU3 depth standard and is
the checkable reviewer criterion.

- [ ] **Scenario: scope is established by diffing audit ledger against CU3 named set**
  Given the audit ledger at `.ctoc/audit/corpus-audit-2026-06-15.json` lists
  thin framework files (<=5 `##` sections) and CU3's `files:` set lists 14 named
  files already upgraded
  When the implementer establishes CU4a scope at implementation start
  Then the CU4a file list equals: (audit thin-file list for skills/frameworks/)
  MINUS (CU3 named files already marked UPGRADED in the audit artifact)
  And this diff is recorded in the plan's findings section before any upgrades begin
  And no file in CU3's named set is re-processed or re-described in CU4a findings

- [ ] **Scenario: every audit-confirmed thin framework file is upgraded or recorded**
  Given the CU4a scope established by the diff above
  When CU4a implementation is complete
  Then every file on the CU4a scope list is either upgraded past the <=5 `##`
  section floor with the same quality bar as CU3
  Or explicitly recorded in the audit artifact as SOLID-SKIPPED with a rationale
  And zero files are silently omitted (no file appears in neither the upgraded
  list nor the skipped list)

- [ ] **Scenario: upgraded frameworks meet the CU3 depth standard**
  Given CU3 set the depth standard for framework guides
  When any remaining thin framework guide is upgraded in CU4a
  Then the guide contains more than 5 distinct `##` sections including at minimum
  the same section set as CU3 guides (Async/Concurrency Footguns, Error Handling,
  Security Gotchas, Testing, Performance Traps, Version-Specific, References)
  And each section names at least one technology-specific identifier (version
  number, CWE ID, or concrete API/function name)
  And every version-specific or security claim carries a dated source from
  2025-01-01 or later

- [ ] **Scenario: ai-ml long-tail files cover their category-specific footguns**
  Given the ai-ml long-tail files (all ai-ml/*.md not in CU3's named set)
  are upgraded
  When each ai-ml long-tail file is processed
  Then the guide addresses the framework's primary footguns specific to that
  library (e.g. diffusers.md: VRAM exhaustion footguns, scheduler selection,
  SDXL version coupling; other ai-ml files: their equivalent primary footguns)
  And each upgraded file names the library's current version and relevant
  security concerns (e.g. model loading pickle risks where applicable) with
  dated sources of 2025-01-01 or later

- [ ] **Scenario: no audited-SOLID file is rewritten**
  Given the no-churn rule
  When the implementer uses the audit artifact to determine in-scope files
  Then no file marked audited-SOLID in the 2026-06-15 audit is modified
  And if a file's status is ambiguous (not clearly in the audit's thin or solid
  lists), the implementer treats it as SOLID, records the ambiguity in the audit
  artifact, and does not touch the file without explicit reviewer approval

- [ ] **Scenario: implementation proceeds in independently verifiable batches**
  Given the large file count (approximately 112 files)
  When the implementer structures work
  Then each batch is scoped to a single framework category (e.g. all of
  skills/frameworks/testing/ as one batch, all ai-ml long-tail as one batch)
  And `node --test tests/*.test.js` is run and passes after each batch
  And each batch is described in the plan's findings section with file count and
  verdict counts (UPGRADED / SOLID-SKIPPED)

- [ ] **Scenario: skills.json trigger mappings remain valid**
  Given all modified files are indexed in skills.json
  When any file's frontmatter is extended
  Then the key/value pairs required by the skills.json trigger mapping are
  preserved verbatim in each modified file
  And `node --test tests/*.test.js` passes with `# fail 0` after each batch

- [ ] **Scenario: audit artifact updated with per-file verdicts**
  Given the vision requires tracking progress per file (Success Criterion 5)
  When any CU4a-scope file is either upgraded or determined to be audited-SOLID
  Then the audit artifact at `.ctoc/audit/corpus-audit-2026-06-15.json` is
  updated with the file's path, the verdict (UPGRADED / SOLID-SKIPPED), and
  the date
  And the artifact remains a complete record covering all files CU1-CU4 addressed

- [ ] **Scenario: completeness check passes**
  Given the in-scope list established by the audit-ledger diff
  When all CU4a-scope files have been processed
  Then a completeness check confirms every in-scope file appears in either the
  upgraded list or the SOLID-SKIPPED list in the audit artifact
  And the diff between the in-scope list and the union of (upgraded + skipped)
  is empty — no silent omissions

## Scope

### In Scope

- All `skills/frameworks/ai-ml/*.md` files confirmed thin (<=5 `##` sections)
  by the 2026-06-15 audit that are NOT in CU3's named set (not pytorch, tensorflow,
  langchain, transformers, anthropic-sdk, openai-sdk). Confirmed example: diffusers.md.
- All `skills/frameworks/**/*.md` files in any sub-directory confirmed thin by the
  2026-06-15 audit and not already upgraded by CU3.
- Updating the audit artifact with per-file UPGRADED / SOLID-SKIPPED verdicts.
- Running `node --test tests/*.test.js` after each batch.

### Out of Scope

- Files already upgraded by CU1, CU2, or CU3 — not re-processed.
- Audited-SOLID files in any category — no-churn rule; recorded as SOLID-SKIPPED.
- Language guides in `skills/languages/` — those are CU2 (mainstream) and CU4c
  (non-mainstream).
- Quality-config files — those are CU4b.
- SKILL.md files outside the reference library categories.
- The 7-language BAD/SAFE cross-coverage rule — single-framework guides are exempt;
  implementer must not add cross-language examples.
- Changes to `src/`, `tests/`, `agents/`, hooks, or gate logic.
- Verbatim content copying from other framework guides (each guide must be specific
  to its target framework).

## Risks

### Technical Risks

- **Large file count increases risk of a missed frontmatter corruption**: 100+
  file edits creates more opportunity for an accidental frontmatter key removal.
  - Likelihood: MEDIUM (volume-proportional)
  - Impact: HIGH (broken skill trigger for any corrupted file)
  - Mitigation: Run `node --test tests/*.test.js` after each batch (not just at
    the end); use a consistent edit pattern (append sections below the closing
    frontmatter delimiter, never inside it).

- **ai-ml long-tail files may include libraries with fast-moving APIs**: some
  ai-ml libraries (e.g. diffusers) release frequently; version-specific claims
  may become stale quickly.
  - Likelihood: HIGH (ai-ml ecosystem moves rapidly)
  - Impact: MEDIUM (misleading guidance at the next trigger load)
  - Mitigation: Every version-specific claim names the library version (e.g.
    "diffusers 0.32.x") alongside a dated source; reviewer flags claims lacking
    both.

### Business Risks

- **Volume obscures quality**: at 100+ files, it is easy to increase section
  counts without improving actual correction depth.
  - Likelihood: MEDIUM (same risk as any large-scale content operation)
  - Impact: MEDIUM (padded files pass section-count checks but fail the objective
    depth gate)
  - Mitigation: The objective depth gate (technology-specific identifiers + dated
    sources) is the binary reviewer check — not a line-count threshold. The audit
    artifact's per-file verdict must include a brief description of what was added.

### Dependency Risks

- **Blocked by CU3**: CU4a depends on CU3 completing to know the exact named-set
  exclusion and to use CU3's depth standard as confirmed by the audit artifact.
  - Likelihood: LOW (CU3 is HIGH priority and completes before CU4a starts)
  - Impact: MEDIUM (delays CU4a start; does not invalidate scope)
  - Mitigation: CU4a's `order: 5` and `depends_on: [CU3-tier1-frameworks]`
    enforce sequencing in the implementation queue.

- **CU4b and CU4c are independent**: CU4b (quality-configs) and CU4c
  (non-mainstream languages) touch different files and do not require CU3 to
  complete. They may run concurrently with CU4a and with each other if the
  implementation queue supports it. This is an explicit design choice to avoid
  artificial serialization.

## Priority

**Priority: MEDIUM** (Score: 5/9)
- Dependency: LOW (1) — no other stub depends on CU4a; it is a terminal node
  in the frameworks dependency chain.
- Business Impact: MEDIUM (2) — lower per-file traffic than CU3 but aggregate
  impact is high (100+ files); ai-ml long-tail files are the highest value within
  CU4a.
- Technical Risk: MEDIUM (2) — large file count and ai-ml API churn create
  moderate structural risk, both mitigated by per-batch test runs and the
  objective depth gate.

## Decisions Taken Under Ambiguity

- **Scope definition via audit-ledger diff** — in-scope list is derived by
  diffing the audit ledger against CU3's named set at implementation time, not
  by re-running an audit. This prevents scope drift and ensures no-churn rule
  is honored.
- **Floor criterion** — <=5 `##` sections (not line count); consistent with the
  audit ledger definition used across all CU plans.
- **Objective depth bar** — identical to CU3: every required section must name
  at least one technology-specific identifier (version number, CWE identifier,
  or concrete API/function name), AND every version-specific or security claim
  must carry an inline dated source from 2025-01-01 or later. A reviewer rejects
  against this criterion.
- **CU4b and CU4c independence** — quality-configs (CU4b) and non-mainstream
  languages (CU4c) are independent of CU3 (different files) and need only the
  audit ledger. They are not serialized behind CU3 or CU4a; the depends_on chain
  for CU4b and CU4c points to CU1 only (via the audit ledger dependency).
- **Single-framework exemption** — depth-within-framework is the bar; 7-language
  BAD/SAFE cross-coverage rule does not apply. Implementer must not add
  cross-language examples.
- **Batch size** — implement in self-contained batches (by framework category)
  so each is independently verifiable per Success Criterion 4; batch granularity
  is an implementation-step concern, not a scope question.
