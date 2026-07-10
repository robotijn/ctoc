# Dagster CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
pip install dagster dagster-webserver
dagster dev  # Starts local webserver at localhost:3000
```

## Claude's Common Mistakes
1. **Task-centric thinking** - Dagster is asset-centric; think data products, not tasks
2. **Hardcoded connections** - Use Resources for all external services
3. **Missing partitions** - Large data should use partitioned assets
4. **No freshness policies** - Critical assets need SLAs
5. **Op-based pipelines** - Assets are the modern Dagster pattern

## Correct Patterns (2026)
```python
from dagster import (
    asset, AssetExecutionContext, DailyPartitionsDefinition,
    FreshnessPolicy, ConfigurableResource, Definitions
)
import pandas as pd

daily_partitions = DailyPartitionsDefinition(start_date="2025-01-01")

class WarehouseResource(ConfigurableResource):
    connection_string: str

    def query(self, sql: str) -> pd.DataFrame:
        # Implementation
        pass

@asset(
    partitions_def=daily_partitions,
    freshness_policy=FreshnessPolicy(maximum_lag_minutes=60),
)
def raw_events(context: AssetExecutionContext, warehouse: WarehouseResource) -> pd.DataFrame:
    partition = context.partition_key
    return warehouse.query(f"SELECT * FROM events WHERE date = '{partition}'")

@asset(partitions_def=daily_partitions)
def cleaned_events(raw_events: pd.DataFrame) -> pd.DataFrame:
    return raw_events.dropna(subset=["user_id"]).drop_duplicates(["event_id"])

@asset
def daily_summary(cleaned_events: pd.DataFrame) -> pd.DataFrame:
    return cleaned_events.groupby("date").agg({"revenue": "sum"})

defs = Definitions(
    assets=[raw_events, cleaned_events, daily_summary],
    resources={"warehouse": WarehouseResource(connection_string="...")},
)
```

## Version Gotchas
- **Assets vs Ops**: Assets are preferred; Ops for non-data operations
- **ConfigurableResource**: New pattern replacing @resource decorator
- **Definitions**: Single entry point replacing repositories
- **dbt integration**: dagster-dbt for native dbt asset loading

## What NOT to Do
- Do NOT think in tasks/ops (think in assets/data products)
- Do NOT hardcode connections (use ConfigurableResource)
- Do NOT skip partitioning for large datasets
- Do NOT ignore freshness policies for critical assets

## Asset Footguns (@asset deps, partitions, IO managers, resources)
The core Dagster mental-model bug Claude writes: **treating `@asset` functions like
scripts that do their own I/O**, instead of pure transforms whose *inputs and
outputs are managed by IO managers*. In Dagster, an upstream asset name in the
function signature IS the dependency edge, and **where the data physically lives is
the IO manager's job**, not the asset body's.

```python
from dagster import asset, AssetExecutionContext

# FOOTGUN: asset writes its own file AND rebuilds the dep by re-reading it — two sources of truth
@asset
def cleaned(context):
    raw = pd.read_parquet("/data/raw.parquet")   # bypasses the IO manager; brittle path
    out = raw.dropna()
    out.to_parquet("/data/clean.parquet")        # hand-rolled persistence — WRONG
    return None

# RIGHT: declare the dep by parameter name; RETURN the value — the IO manager persists/loads it
@asset
def cleaned(raw_events: pd.DataFrame) -> pd.DataFrame:   # `raw_events` = upstream asset = the edge
    return raw_events.dropna(subset=["user_id"]).drop_duplicates(["event_id"])
```

- **`@asset` deps vs ops.** Prefer software-defined assets (a node = a persisted
  data product) over bare ops/graphs; reach for ops only for non-data side effects.
- **Partitions are keys, not loops.** A `PartitionsDefinition` slices an asset by
  date/category; a run materializes a *partition key* (`context.partition_key`).
  Don't loop over dates inside one asset — let the partition set drive backfills.
- **IO managers decide where data lives.** Swap the IO manager (filesystem → S3 →
  Snowflake) without touching asset code; the default in-memory/filesystem manager
  is dev-only. Return values, let the manager persist them.
- **Resources over hardcoded connections.** Inject a `ConfigurableResource`
  (typed config schema) for every external system; never build clients from string
  literals inside an asset.
- **Materialization vs observation.** `@asset` materializes (produces) data;
  `@observable_source_asset` only records freshness/version of data you don't own —
  don't materialize something you only meant to observe.
  [docs.dagster.io assets + IO-managers + partitions guides, retrieved 2026-07-10]

## Execution (run coordinator, backfills, concurrency)
- **Run coordinator gates concurrency.** The `QueuedRunCoordinator` (with
  `dagster.yaml` `run_queue` / tag-based concurrency limits) prevents a backfill
  from launching thousands of simultaneous runs. The default (no queue) will happily
  saturate your executor.
- **Backfills are partition sweeps.** Launching a backfill over a wide
  `PartitionsDefinition` submits one run per key — bound it with run-queue limits
  and per-asset concurrency, exactly like partitioned assets above.
  [docs.dagster.io run-coordinator + backfills docs, retrieved 2026-07-10]

## Error Handling & Testing
```python
from dagster import materialize, asset, RetryPolicy, Backoff

@asset(retry_policy=RetryPolicy(max_retries=3, delay=2, backoff=Backoff.EXPONENTIAL))
def flaky_ingest(): ...

# TEST assets in-process with a fake/typed resource — no live warehouse, deterministic
def test_cleaned_dedupes():
    result = materialize(
        [raw_events, cleaned],
        resources={"warehouse": StubWarehouse()},   # inject a resource; assert the output
    )
    assert result.success
```
- `materialize([...])` runs assets in-process for tests — inject a stub
  `ConfigurableResource` and assert on the returned `MaterializeResult`. This is why
  resources (not hardcoded clients) matter: they are the seam that makes assets
  testable.
- Attach a `RetryPolicy` for transient failures; let non-transient errors surface.
  [docs.dagster.io testing + retries docs, retrieved 2026-07-10]

## Security & Dependency (CWE-798, CWE-89)
- **Secrets via env/resources, never literals (CWE-798).** Read credentials from
  `EnvVar(...)` into a `ConfigurableResource` config schema; the schema also
  validates config at load time, so a missing/wrong-typed secret fails fast instead
  of at query time.
- **Partition keys can be an injection vector (CWE-89).** **CVE-2026-41490 (high,
  CWE-89)** is a *real* Dagster advisory: dynamic partition keys interpolated into
  SQL in database IO-manager integrations enabled SQL injection. Never string-format
  a partition key into SQL — parameterize, and keep dagster patched.
```python
# FOOTGUN: partition key straight into SQL (CVE-2026-41490 / CWE-89)
warehouse.query(f"SELECT * FROM events WHERE date = '{context.partition_key}'")
# RIGHT: parameterize; the key is DATA, not SQL text
warehouse.query("SELECT * FROM events WHERE date = %s", [context.partition_key])
```
  [github.com/advisories GHSA-mjw2-v2hm-wj34 (CVE-2026-41490); cwe.mitre.org
  CWE-89/CWE-798; retrieved 2026-07-10]

## Version-Specific Gotchas (dated, sourced)
- **dagster 1.13.13** is the current stable release, uploaded **2026-07-09**,
  `requires_python >=3.10,<3.15`. [pypi.org/project/dagster JSON API, retrieved
  2026-07-10]
- **Modern API (1.x):** `Definitions` is the single entry point (replacing
  repositories); `ConfigurableResource` (Pydantic-typed) replaces the older
  `@resource` decorator; assets + IO managers are the default pattern. Pin the
  dagster core version and its integration libs (`dagster-dbt`, `dagster-aws`, …) to
  the SAME version — mismatched integration pins are a common breakage.
  [docs.dagster.io + pypi.org, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- Dagster releases (PyPI JSON): https://pypi.org/pypi/dagster/json
- Assets & dependencies: https://docs.dagster.io/guides/build/assets
- IO managers: https://docs.dagster.io/guides/build/io-managers
- Partitions & backfills: https://docs.dagster.io/guides/build/partitions-and-backfills
- Resources & config: https://docs.dagster.io/guides/build/external-resources
- Testing: https://docs.dagster.io/guides/test
- CVE-2026-41490 (CWE-89, partition-key SQL injection): https://github.com/advisories/GHSA-mjw2-v2hm-wj34
- CWE-89 SQL Injection: https://cwe.mitre.org/data/definitions/89.html
- CWE-798 Use of Hard-coded Credentials: https://cwe.mitre.org/data/definitions/798.html
