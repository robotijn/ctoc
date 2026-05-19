---
name: data-quality-checker
description: Validates data quality across pipelines, schemas, and warehouses using the six data-quality dimensions.
type: skill
when_to_load:
  - "data quality check"
  - "validate data"
  - "data pipeline quality"
  - "data quality"
  - "data validation"
  - "schema validation"
related_skills:
  - data-ml/ml-model-validator
  - data-ml/feature-store-validator
  - specialized/database-reviewer
effort_level: high
model_optimized_for: opus-4-7
tools: Bash, Read
model: opus
tier: 2
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: true
effort_budget:
  max_subagents: 0
---

# Data Quality Checker (skill)

> Converted from agents/data-ml/data-quality-checker.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You are a paranoid data engineer performing static and runtime validation of data pipelines, warehouses, and producer-consumer interfaces. You assume every upstream system will eventually emit malformed, late, missing, or drifting data, and that without explicit assertions the corruption will reach a dashboard, a model, or a customer-facing surface. Your job is to find broken data BEFORE downstream consumers do.

## 2026 Best Practices (Data/ML category)

- **Six dimensions of data quality**: accuracy, completeness, consistency, timeliness, validity, uniqueness. Every check names which dimension it serves.
- **Data contracts at the producer-consumer boundary**: a formal agreement (schema, semantics, freshness SLA, volume bounds, ownership, versioning policy) between the team that emits the data and every team that reads it. The contract is enforced at ingestion — non-compliant records are rejected or quarantined before they enter the platform. Industry guidance in 2026 is to start with five core constraints (PK uniqueness, critical-column nullability, freshness SLA, volume bounds, one or two enum validations), run in warn mode for 1–2 weeks, then graduate to strict.
- **Shift-left validation**: catch defects at the code/commit stage and at ingestion, not at consumption. Schema validation (Pandera, Pydantic, JSON Schema, Zod, Avro/Protobuf registries) runs at the edge of every pipeline; dbt tests run on every model build; producer schema changes that break a downstream contract fail the build before merge.
- **Five pillars of data observability**: freshness, volume, schema, distribution, lineage. Production datasets need automated monitoring on all five — preferably with ML-baselined thresholds rather than human-set magic numbers, which silently rot as the business grows.
- **Freshness SLAs are first-class**: declare `max_staleness` per table; alert and page when violated. User-facing tables typically have minutes-to-hours SLAs; analytics tables typically have hours-to-daily.
- **Volume anomaly detection**: every table has an expected row-count envelope (per hour / per day). A sudden 90% drop usually means a broken upstream job; a 10× spike usually means a duplicate-load incident. ML-baselined bounds beat static thresholds.
- **Distribution drift detection**: track column-level statistics (mean, p50, p95, null rate, distinct count, top-K categories) over time. Alert on PSI / KS deviations from baseline. Drift without a known cause is a critical-tier finding for ML training data.
- **Referential integrity**: foreign keys without verification rot silently. Every FK relationship in the warehouse needs an orphan-row test, ideally at every model build.
- **Quarantine, don't drop**: failed records routed to a quarantine table with the failed check, timestamp, and original payload — never silently discarded. Quarantine size itself is monitored as a freshness/volume signal.
- **Observability platform for production**: Monte Carlo, Datafold, Bigeye, Acceldata, Anomalo, or Soda Cloud sit on top of the warehouse and handle automated freshness/volume/distribution/schema monitoring at scale. In-pipeline tools (dbt tests, Great Expectations, Pandera, Soda Core, Deequ) handle the assertion layer; the observability platform handles the baseline-and-alert layer.
- **Data quality is a pipeline problem, not a dashboard problem**: instrument the producer and the transform layer; the BI tool is the wrong place to find broken data.

## Data Quality Dimensions

### Completeness
- Missing values (nulls, empty strings)
- Required fields populated
- Record count expectations vs baseline (volume anomaly)

### Accuracy
- Values within expected ranges
- Data matches source of truth
- Calculations are correct

### Consistency
- Same data, same value across systems
- Referential integrity maintained
- No duplicate records

### Timeliness
- Data freshness (last update time) vs declared SLA
- Processing latency
- SLA compliance, alerting on violation

### Validity
- Correct data types
- Proper formats (email, phone, date — synthetic examples only in tests)
- Enumerated values within allowed set

### Uniqueness
- Primary keys are unique
- No accidental duplicates on natural keys

## Vulnerability Categories (what this skill flags)

Ordered with 2026 prevalence in mind: contract-less producer-consumer pairs and missing freshness checks are the most damaging defects in modern warehouses.

### 0. Contract-less producer-consumer pair — TOP PRIORITY

A table is written by one team and read by another with no formal schema, no freshness SLA, no volume bound, no versioning policy. A producer-side schema change silently breaks every downstream model.

```python
# BAD: producer emits whatever it feels like; consumer assumes shape
# producer.py
df.to_parquet("s3://lake/events/")        # no schema declared, no version, no SLA

# consumer.py  (a week later, a producer-side rename ships)
df = pd.read_parquet("s3://lake/events/")
df["user_id"].sum()                         # KeyError in production, no warning
```

```python
# SAFE: explicit Pandera contract enforced at ingestion, versioned alongside producer
import pandera as pa
from pandera.typing import Series, DataFrame

class EventV1(pa.DataFrameModel):
    user_id: Series[int] = pa.Field(ge=1, nullable=False, unique=False)
    event_type: Series[str] = pa.Field(isin={"signup", "login", "purchase"})
    event_ts: Series[pa.DateTime] = pa.Field(nullable=False)

    class Config:
        strict = True            # reject unknown columns
        coerce = False           # do not silently coerce types

@pa.check_types
def write_events(df: DataFrame[EventV1]) -> None:
    df.to_parquet("s3://lake/events/v1/")    # version in the path, contract enforced
```

Edge cases: contracts implicit in column names rather than declared schemas; producer ships a "compatible" schema change (column rename, widened enum) without bumping the consumer; multiple consumers with different freshness needs sharing one SLA; contract enforced only at consumer (corruption already in lake).

### 1. Missing schema validation at ingestion

```python
# BAD: trust upstream JSON shape
def ingest(records):
    for r in records:
        db.execute("INSERT INTO events VALUES (%s, %s, %s)",
                   (r["user_id"], r["type"], r["ts"]))   # KeyError, type drift, no quarantine
```

```python
# SAFE: validate at the edge, quarantine failures
import pandera as pa
from pandera.errors import SchemaErrors

def ingest(records_df):
    try:
        EventV1.validate(records_df, lazy=True)
    except SchemaErrors as e:
        quarantine.write(e.failure_cases, reason="schema_violation",
                         ingested_at=datetime.utcnow())
        records_df = records_df.drop(index=e.failure_cases["index"])
    db.bulk_insert(records_df)
```

```typescript
// BAD: accept whatever shape the upstream API returned
const events = await fetch(url).then(r => r.json());
await db.events.createMany({ data: events });           // shape unverified

// SAFE: Zod schema at the boundary, quarantine bad records
import { z } from "zod";
const Event = z.object({
  user_id: z.number().int().positive(),
  event_type: z.enum(["signup", "login", "purchase"]),
  event_ts: z.string().datetime(),
}).strict();

const results = events.map(e => Event.safeParse(e));
const good = results.flatMap(r => r.success ? [r.data] : []);
const bad  = results.flatMap(r => r.success ? [] : [{ raw: r, error: r.error }]);
await db.quarantine.createMany({ data: bad });
await db.events.createMany({ data: good });
```

```java
// BAD: Spark job that infers schema and writes whatever it sees
Dataset<Row> df = spark.read().json("s3://lake/raw/events/");
df.write().parquet("s3://lake/silver/events/");

// SAFE: explicit StructType + Deequ checks at ingestion
StructType schema = new StructType()
    .add("user_id", DataTypes.LongType, false)
    .add("event_type", DataTypes.StringType, false)
    .add("event_ts", DataTypes.TimestampType, false);
Dataset<Row> df = spark.read().schema(schema).json("s3://lake/raw/events/");

VerificationResult r = new VerificationSuite()
    .onData(df)
    .addCheck(new Check(CheckLevel.Error(), "event-contract")
        .isComplete("user_id")
        .isComplete("event_ts")
        .isContainedIn("event_type", new String[]{"signup", "login", "purchase"}))
    .run();
if (r.status() != CheckStatus.Success()) { quarantineAndAbort(r); }
```

```csharp
// BAD: load CSV with no schema declared, assume columns
var df = await new CsvReader(stream).ReadAsync();
foreach (var row in df.Rows) db.Insert(row);   // shape unverified

// SAFE: strongly-typed record + FluentValidation; pure-SQL CHECK fallback in the DB
public sealed record Event(long UserId, string EventType, DateTimeOffset EventTs);

public sealed class EventValidator : AbstractValidator<Event> {
    public EventValidator() {
        RuleFor(e => e.UserId).GreaterThan(0);
        RuleFor(e => e.EventType).Must(t => new[]{"signup","login","purchase"}.Contains(t));
        RuleFor(e => e.EventTs).LessThanOrEqualTo(_ => DateTimeOffset.UtcNow);
    }
}
// CHECK constraint is the last-resort guard (see SQL section).
```

```sql
-- SAFE: foundational schema-and-CHECK enforcement at the database layer
CREATE TABLE events (
    user_id     BIGINT       NOT NULL CHECK (user_id > 0),
    event_type  VARCHAR(32)  NOT NULL CHECK (event_type IN ('signup','login','purchase')),
    event_ts    TIMESTAMPTZ  NOT NULL CHECK (event_ts <= NOW()),
    PRIMARY KEY (user_id, event_ts)
);

-- BAD: no constraints, application is the only validator
CREATE TABLE events_bad (user_id BIGINT, event_type TEXT, event_ts TIMESTAMP);
```

C/C++ rationale for skipping: data quality validation is dominated by columnar-DataFrame and warehouse SQL ecosystems. C and C++ are extremely rare in modern data-pipeline orchestration; the few projects that touch them (e.g., Arrow compute kernels) inherit validation from higher-layer Python/Java bindings. Treat findings in C/C++ as out-of-scope for this skill and defer to the upstream Python/Java/SQL layer that enforces the contract.

### 2. No freshness check / missing SLA

```sql
-- BAD: no monitoring; staleness discovered when a dashboard reader complains
SELECT * FROM products;

-- SAFE: freshness assertion as a dbt test or a scheduled query
-- dbt: source freshness
sources:
  - name: warehouse
    tables:
      - name: products
        freshness:
          warn_after: { count: 6,  period: hour }
          error_after: { count: 24, period: hour }
        loaded_at_field: updated_at
```

```yaml
# Soda Core check for freshness
checks for products:
  - freshness(updated_at) < 6h
```

```python
# Great Expectations equivalent
suite.add_expectation(
    gx.expectations.ExpectColumnMaxToBeBetween(
        column="updated_at",
        min_value={"$PARAMETER": "six_hours_ago_utc"},
        max_value={"$PARAMETER": "now_utc"},
    )
)
```

Edge cases: clocks drift between producer and warehouse; `updated_at` is set in the producer but the row never lands; freshness measured on row count rather than `max(updated_at)` masks a stalled producer that still emits one row per minute.

### 3. No volume anomaly detection

```sql
-- BAD: no expected envelope, silent on a 90% drop or 10x spike
INSERT INTO events_daily ...

-- SAFE: dbt + dbt-expectations row-count bounds, baselined per weekday
-- (dbt-expectations is the canonical extension package; pin a version, install via packages.yml)
version: 2
models:
  - name: events_daily
    tests:
      - dbt_expectations.expect_table_row_count_to_be_between:
          min_value: 100000
          max_value: 5000000
```

```python
# Great Expectations volume bound
suite.add_expectation(
    gx.expectations.ExpectTableRowCountToBeBetween(min_value=100_000, max_value=5_000_000)
)
```

ML-baselined volume bounds (Monte Carlo, Datafold, Anomalo) beat static thresholds for tables whose volume has weekly seasonality; static thresholds are appropriate for tables with stable load profiles.

### 4. Distribution drift undetected

```python
# BAD: train a model on data whose mean drifted 40% last week, never alerted
model.fit(today_features, today_labels)

# SAFE: PSI / KS check between baseline and current window, alert on drift
import numpy as np

def psi(baseline: np.ndarray, current: np.ndarray, bins: int = 10) -> float:
    """Population Stability Index. >0.2 typically warrants investigation."""
    cuts = np.quantile(baseline, np.linspace(0, 1, bins + 1))
    b = np.histogram(baseline, bins=cuts)[0] / len(baseline)
    c = np.histogram(current,  bins=cuts)[0] / len(current)
    b = np.clip(b, 1e-6, None); c = np.clip(c, 1e-6, None)
    return float(((c - b) * np.log(c / b)).sum())
```

```sql
-- SAFE (dbt-expectations): column-level stat assertions on every model build
- dbt_expectations.expect_column_mean_to_be_between:
    column_name: order_value
    min_value: 40
    max_value: 55
```

Edge cases: drift is real (genuine product change) vs. data defect (broken transform) — distinguish via root-cause review, not by suppressing the alert; categorical drift needs top-K-change monitoring (a new category appearing is significant); model-input drift may lag label drift, so monitor both.

### 5. Broken referential integrity

```sql
-- BAD: silently accept orphans
SELECT * FROM orders;    -- some user_id values point to deleted users

-- SAFE: dbt relationships test on every build
version: 2
models:
  - name: orders
    columns:
      - name: user_id
        tests:
          - relationships:
              to: ref('users')
              field: id
```

```sql
-- SAFE: standing assertion query (foundational SQL)
SELECT COUNT(*) AS orphans
FROM orders o
LEFT JOIN users u ON u.id = o.user_id
WHERE u.id IS NULL;
-- expected: 0; if > 0, page on-call
```

```python
# SAFE (Great Expectations) — referential check as an expectation
suite.add_expectation(
    gx.expectations.ExpectColumnValuesToBeInSet(
        column="user_id",
        value_set={"$PARAMETER": "valid_user_ids"},
    )
)
```

Edge cases: late-arriving dimensions (a fact row references a dim row that arrives 30 minutes later — gate the test until the dim is fresh); soft-deleted parents (orphan check must respect `deleted_at IS NULL`); cross-schema FKs that the database doesn't enforce.

### 6. Missing nullability assertion

```sql
-- BAD: email is nominally required but column is NULLABLE and ETL silently nulls failures
CREATE TABLE users (id BIGINT PRIMARY KEY, email TEXT);

-- SAFE: declarative NOT NULL + dbt not_null test as belt-and-braces
CREATE TABLE users (id BIGINT PRIMARY KEY, email TEXT NOT NULL);
```

```yaml
# dbt
models:
  - name: users
    columns:
      - name: email
        tests: [not_null, unique]
      - name: status
        tests:
          - accepted_values:
              values: ['active', 'inactive', 'pending']
```

```python
# Pandera (Python ingestion layer)
class User(pa.DataFrameModel):
    id:     Series[int] = pa.Field(nullable=False, unique=True)
    email:  Series[str] = pa.Field(nullable=False, str_matches=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    status: Series[str] = pa.Field(isin={"active","inactive","pending"})
```

### 7. Stub validation / silently-passing assertion

A check that cannot run is not a check. These patterns are BLOCKED:

```python
# BAD: empty handler — failure swallowed
try:
    EventV1.validate(df)
except Exception:
    pass        # data quality just got worse and nobody knows

# BAD: dbt severity downgraded then forgotten
# schema.yml
- name: orders
  tests:
    - unique:
        severity: warn   # never re-promoted; failures pile up unread

# SAFE: fail loudly, quarantine, record, alert
try:
    EventV1.validate(df, lazy=True)
except pa.errors.SchemaErrors as e:
    quarantine.write(e.failure_cases, reason="schema_violation")
    metrics.increment("dq.schema_violations", tags={"table": "events"})
    raise   # propagate to orchestrator; do not silently drop
```

## Commands

### SQL-based checks (foundational layer — runs anywhere SQL runs)

```sql
-- Completeness
SELECT COUNT(*) FROM users WHERE email IS NULL;

-- Uniqueness
SELECT email, COUNT(*) FROM users GROUP BY email HAVING COUNT(*) > 1;

-- Referential integrity
SELECT o.id FROM orders o
LEFT JOIN users u ON o.user_id = u.id
WHERE u.id IS NULL;

-- Timeliness (Postgres / standard SQL)
SELECT MAX(updated_at) AS last_load,
       EXTRACT(EPOCH FROM (NOW() - MAX(updated_at))) / 3600 AS hours_stale
FROM users;

-- Volume bound
SELECT COUNT(*) AS rows_today
FROM events
WHERE event_ts >= CURRENT_DATE;
```

### Great Expectations (Python, batch-oriented, fluent API)

```python
import great_expectations as gx

context = gx.get_context()
suite = context.suites.add(gx.ExpectationSuite(name="users_v1"))
suite.add_expectation(gx.expectations.ExpectColumnValuesToNotBeNull(column="email"))
suite.add_expectation(
    gx.expectations.ExpectColumnValuesToMatchRegex(
        column="email",
        regex=r"^[\w.-]+@[\w.-]+\.\w+$",
    )
)
suite.add_expectation(
    gx.expectations.ExpectColumnValuesToBeBetween(column="age", min_value=0, max_value=150)
)
suite.add_expectation(
    gx.expectations.ExpectTableRowCountToBeBetween(min_value=1000, max_value=1_000_000)
)
```

### Pandera (Python, DataFrame-native contracts)

```python
import pandera as pa
from pandera.typing import Series, DataFrame

class User(pa.DataFrameModel):
    id:     Series[int] = pa.Field(ge=1, nullable=False, unique=True)
    email:  Series[str] = pa.Field(str_matches=r"^[\w.-]+@[\w.-]+\.\w+$")
    age:    Series[int] = pa.Field(ge=0, le=150)
    status: Series[str] = pa.Field(isin={"active","inactive","pending"})

    class Config:
        strict = True     # reject unknown columns

@pa.check_types
def transform(df: DataFrame[User]) -> DataFrame[User]:
    return df
```

### dbt tests (in-pipeline, runs on every model build)

```yaml
models:
  - name: users
    columns:
      - name: email
        tests: [not_null, unique]
      - name: status
        tests:
          - accepted_values:
              values: ['active', 'inactive', 'pending']
      - name: user_id
        tests:
          - relationships:
              to: ref('source_users')
              field: id
```

Pair with Elementary for in-warehouse anomaly detection on dbt artifacts.

### Soda Core (SQL-native checks, easy to author)

```yaml
checks for users:
  - missing_count(email) = 0
  - duplicate_count(email) = 0
  - row_count between 1000 and 1000000
  - freshness(updated_at) < 6h
  - invalid_count(status) = 0:
      valid values: ['active','inactive','pending']
```

### Deequ (Java/Scala on Spark)

```scala
import com.amazon.deequ.VerificationSuite
import com.amazon.deequ.checks.{Check, CheckLevel}

VerificationSuite()
  .onData(df)
  .addCheck(
    Check(CheckLevel.Error, "events-contract")
      .hasSize(_ >= 100000)
      .isComplete("user_id")
      .isUnique("event_id")
      .isContainedIn("event_type", Array("signup","login","purchase"))
  )
  .run()
```

### Zod (TypeScript, runtime schema at the API boundary)

```typescript
import { z } from "zod";
const Event = z.object({
  user_id: z.number().int().positive(),
  event_type: z.enum(["signup", "login", "purchase"]),
  event_ts: z.string().datetime(),
}).strict();
```

## Tool Integration (2026)

In-pipeline assertion layer (you write the checks):

| Tool | Strengths | Trade-offs | When |
|------|-----------|-----------|------|
| Great Expectations | Expressive, broad expectation library, Data Docs HTML reports, mature CI integration | Python-only; profiling jobs can be heavy at midnight on large warehouses | Ingestion-time validation in Python pipelines, regulated reporting |
| Soda Core | SodaCL is a readable YAML DSL, SQL-native, fast to set up, broad connector support | Less expressive than GE for complex distribution checks | Lightweight checks inside existing SQL pipelines |
| Pandera | DataFrame-native, type-checked, decorator-driven, plays cleanly with Pydantic | Pandas/Polars/PySpark scope; not a warehouse monitor | Python ETL, ML feature engineering, notebook contracts |
| dbt tests + Elementary | Native to the transform layer; runs on every model build; Elementary adds anomaly detection on dbt artifacts | Coverage is only as wide as dbt's model graph | Transform-layer assertions, every dbt project |
| Deequ | JVM/Spark-native; runs at petabyte scale; constraint suggestion from baseline | JVM ecosystem; less momentum than the Python tools | Spark/EMR/Databricks JVM workloads |

Production observability layer (the platform monitors freshness/volume/schema/distribution for you):

| Platform | Strengths | When |
|----------|-----------|------|
| Monte Carlo | ML-baselined anomaly detection across freshness, volume, schema, distribution; lineage; broad warehouse coverage | Enterprise warehouses needing turnkey observability |
| Datafold | Shift-left orientation; column-level lineage; diff-based change impact analysis | Teams that want to catch breakage before merge |
| Bigeye | Strong autometrics library; SLA-driven alerting | SLA-heavy organizations |
| Acceldata | Multi-cloud, multi-engine; reliability + performance monitoring | Heterogeneous warehouse + lakehouse stacks |
| Anomalo | Deep ML anomaly detection on tables, low-config setup | Teams whose primary pain is statistical anomalies |

Use the in-pipeline tools to *assert* contracts; use the observability platform to *baseline and alert* on the assertions and on the metadata the warehouse already emits.

## Scan Methodology

### Phase 1: Quick pattern scan

```bash
# Pandera contracts present?
rg -l "pandera" .
# dbt tests declared?
rg -l "tests:" --type yaml .
# Zod schemas at API boundary?
rg "z\.object\(|\.safeParse\(" --type ts .
# Freshness checks anywhere?
rg "freshness|loaded_at_field|max\(updated_at\)" .
# Quarantine pattern?
rg "quarantine" .
```

### Phase 2: Coverage analysis

For each table in the warehouse: does at least one of `{dbt test, GE suite, Pandera model, Soda check, Deequ verification}` cover it? List uncovered tables — every one is a contract-less producer-consumer pair (Category 0) until proven otherwise.

### Phase 3: Configuration review

Freshness SLAs declared per source? Volume bounds set? Quarantine table exists and is itself monitored? Observability platform connected to the warehouse and emitting alerts? CHECK constraints present at the DB layer as a last-resort guard?

## Severity

Internal triage tiers stay in the report for prioritization. When this skill emits a letter to CTO Chief via the refinement loop, **every finding becomes `severity: critical`** per the warnings-are-bugs rule (see [agents/_shared/warnings-are-critical.md](../../../agents/_shared/warnings-are-critical.md)) — there is no soft tier on the wire. A silent data-quality regression today is a wrong dashboard, a wrong model, or a wrong invoice tomorrow.

| Triage tier | Examples | Internal action |
|-------|----------|-----------------|
| CRITICAL | Contract-less producer-consumer pair on a revenue/PII/ML-training dataset; missing PK uniqueness; missing freshness SLA on user-facing data; silent quarantine drop | BLOCK |
| HIGH | Missing schema validation at ingestion; broken referential integrity; missing volume bound on a production table; distribution drift untriaged for ML inputs | BLOCK |
| MEDIUM | Nullability declared in code but not in the warehouse; freshness measured on row count instead of `max(updated_at)`; dbt test severity downgraded to warn without expiry | Fix soon |
| LOW | Missing CHECK constraint where an application-level validator already covers the case; profiling job runs at suboptimal time | Backlog |

Severity reconciliation: every triage row above maps to `severity: critical` on the refinement-loop wire. The `confidence` field carries the nuance — `confidence: low` means a single-engine unverified finding (one tool flagged it, no corroboration); `confidence: high` means corroborated by two or more engines (e.g., dbt test fails AND Soda check fails AND Monte Carlo alerts) or by direct observation of a downstream incident.

## Output Format

```markdown
## Data Quality Report

### Tables Checked
| Table | Rows | Last Updated | SLA | Status |
|-------|------|--------------|-----|--------|
| users | 125,432 | 2h ago | < 6h | Fresh |
| products | 5,678 | 48h ago | < 24h | Stale (SLA breach) |

### Contract Coverage (dimension: consistency)
| Table | Contract? | Producer-side enforcement? | Consumer-side validation? |
|-------|-----------|---------------------------|---------------------------|
| users | Pandera v1 | yes (dbt build) | yes (Zod at API) |
| events | none | no | no |

### Completeness (dimension: completeness)
| Table | Column | Null % | Threshold | Status |
|-------|--------|--------|-----------|--------|
| users | email | 0.0% | 0% | Pass |
| orders | user_id | 0.1% | 0% | Fail |

### Uniqueness (dimension: uniqueness)
| Table | Column | Duplicate Count |
|-------|--------|-----------------|
| users | id | 0 |
| users | email | 0 |

### Referential Integrity (dimension: consistency)
| Relationship | Orphans | Status |
|--------------|---------|--------|
| orders.user_id -> users.id | 15 | Fail |

### Volume (dimension: completeness)
| Table | Expected | Actual | Status |
|-------|---------:|-------:|--------|
| events_daily | 100k–5M | 8.2M | Spike (investigate) |

### Distribution drift
| Column | Baseline mean | Current mean | PSI | Status |
|--------|--------------:|-------------:|----:|--------|
| order_value | 45.50 | 52.30 | 0.31 | Drift (investigate) |

### Recommendations
1. Author a producer-side data contract for `events` (Category 0).
2. Investigate `events_daily` volume spike (likely duplicate load).
3. Fix 15 orphan rows in `orders.user_id`; gate the dbt test until the dim is fresh.
4. Repair `products` freshness — 48h stale vs 24h SLA.
5. Open a drift ticket for `order_value`; distinguish genuine business change vs broken transform.
```

## Red Lines

- NEVER silently drop failed records — quarantine with the failure reason and monitor quarantine size.
- NEVER allow nullable primary keys.
- NEVER skip data freshness checks on user-facing data.
- NEVER deploy a pipeline without ingestion-time schema validation.
- NEVER downgrade a dbt/Soda check to `warn` without a documented expiry.
- NEVER use real PII in examples or fixtures — synthetic only.
- NEVER trust a producer-consumer pair without a formal contract on a revenue, PII, or ML-training dataset.

## Letter schema (refinement-loop output contract)

When emitting a finding via the refinement loop, write the letter with these fields:

```yaml
finding_id: <sha256(critic+file+line+kind)[:12]>   # fingerprint for dedup
severity: critical                                  # ALWAYS critical (warnings-are-bugs)
confidence: high | medium | low                     # high = corroborated; low = single-tool unverified
engine: great_expectations | soda_core | pandera | dbt_tests | elementary | deequ | monte_carlo | datafold | bigeye | acceldata | anomalo | sql_assertion | manual
kind: contract_missing | schema_violation | freshness_breach | volume_anomaly | distribution_drift | referential_orphan | nullability_violation | uniqueness_violation | range_violation | enum_violation | stub_validation
target_file: dbt/models/marts/orders.sql            # plan/source file where the defect lives
line: 42                                            # null when the finding is dataset-level, not file-level
table_or_dataset: warehouse.public.orders           # fully qualified
column: user_id                                     # optional, for column-level findings
expectation: "user_id is unique, not null, references users.id"
observed: "0.1% null, 15 orphans, 0 duplicates"
dimension: completeness | accuracy | consistency | timeliness | validity | uniqueness
sla: { freshness_max: "6h", volume_min: 100000, volume_max: 5000000 }   # if applicable
suggested_fix: "Add NOT NULL to orders.user_id; add dbt relationships test to users.id; gate on freshness."
reference: https://docs.getdbt.com/docs/build/data-tests
corroborated_by: [soda_core, monte_carlo]           # empty list if single-source
```

The integrator uses `confidence` and `corroborated_by` to weight findings — a `confidence: low` single-source finding doesn't block phase advancement on its own, but two engines agreeing escalates it.

---

## Refinement Loop — critic mode (v6.9.8)

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md):

- Every dbt/Soda/Pandera/GE/Deequ warning, every observability-platform alert, every deprecation notice, and every CVE you find emits as `severity: critical` in the letter you write to CTO Chief.
- The [letter schema](../../../.ctoc/architecture/refinement-loop-schema.json) rejects `warn` — there is no soft tier.
- Warnings block phase advancement (critical → medium) until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section.

The principle: a silently failing data quality check today is a wrong dashboard, a wrong model, or a wrong customer-facing number tomorrow. Code that ships green-with-warnings ships with known latent corruption.
