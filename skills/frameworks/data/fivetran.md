# Fivetran CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
# No local install - managed service
# Configure via UI or API
curl -X GET "https://api.fivetran.com/v1/connectors" \
  -H "Authorization: Basic $FIVETRAN_API_KEY"
```

## Claude's Common Mistakes
1. **Syncing all tables/columns** - Only sync what you need (cost control)
2. **No dbt transformation layer** - Raw data needs transformation
3. **Ignoring MAR costs** - Monthly Active Rows drive billing
4. **No sync failure alerts** - Silent failures cause stale data
5. **Full refresh when incremental works** - Wastes time and resources

## Correct Patterns (2026)
```yaml
# Connector configuration (via API/UI)
connector:
  service: postgres
  schema_prefix: raw_

  sync_mode: incremental
  cursor_column: updated_at

  schemas:
    - name: public
      tables:
        - name: orders
          sync_mode: INCREMENTAL
          columns:
            - name: id
              hashed: false
            - name: email  # PII
              hashed: true
        - name: audit_logs
          enabled: false  # Don't sync

  schedule:
    frequency: FIFTEEN_MINUTES

  destination:
    type: snowflake
    schema: RAW_PRODUCTION
```

```python
from base64 import b64encode
import requests

def trigger_sync(connector_id: str):
    auth = b64encode(f"{API_KEY}:{API_SECRET}".encode()).decode()
    return requests.post(
        f"https://api.fivetran.com/v1/connectors/{connector_id}/sync",
        headers={"Authorization": f"Basic {auth}"}
    ).json()
```

## Version Gotchas
- **MAR billing**: Monthly Active Rows determine cost; optimize selection
- **Schema handling**: Allow columns or block - configure strategy
- **Transformations**: Use dbt downstream; Fivetran Transformations available
- **HVR acquisition**: Enterprise features for high-volume replication

## What NOT to Do
- Do NOT sync unnecessary tables/columns (MAR costs)
- Do NOT skip transformation layer (raw data is hard to use)
- Do NOT ignore sync failures (stale data)
- Do NOT use full refresh when incremental is available

## Sync & Cost Footguns (Performance)
Fivetran is a managed, log-based ELT service. Its correctness and cost footguns
are different from a self-hosted tool — the two that bite hardest are the
**delete strategy** and **MAR-driven billing**.

```
History mode      → keeps every version of a row (append-only, SCD2-style):
                    _fivetran_active + _fivetran_start / _fivetran_end columns.
Soft delete       → row is NOT physically deleted; _fivetran_deleted = TRUE.
                    Downstream queries MUST filter WHERE NOT _fivetran_deleted.
Hard delete       → row is removed from the destination (loses audit trail).
```

- **Soft-delete is the default** for most connectors: deleted source rows stay in
  the destination with `_fivetran_deleted = TRUE`. **Forgetting to filter it** is a
  silent over-count bug — every downstream model must exclude soft-deleted rows
  (`WHERE NOT COALESCE(_fivetran_deleted, FALSE)`). History mode adds
  `_fivetran_start`/`_fivetran_end`; querying it without an "active" filter fans
  out every historical version.
- **MAR (Monthly Active Rows)** is the billing unit: a distinct primary-key row
  that is inserted/updated/deleted in a billing month counts **once**. Footguns
  that inflate MAR: syncing high-churn tables you do not need, a too-frequent sync
  schedule that re-touches the same rows, and re-syncs. Sync only needed tables,
  set `sync_frequency` to what the use case needs, and block unused columns.
[fivetran.com pricing (MAR) + sync-overview docs, retrieved 2026-07-10; see References]

## Schema-Drift & Correctness Footguns
```
schema_change_handling:
  ALLOW_ALL      → auto-add new source columns/tables (schema drift propagates)
  ALLOW_COLUMNS  → add new columns, but NOT new tables
  BLOCK_ALL      → freeze schema; new columns/tables are ignored until approved
```

- **Schema drift**: with `ALLOW_ALL`, a new source column auto-appears in the
  destination and **increases MAR / can surprise downstream models**; with
  `BLOCK_ALL`, a newly added source column is **silently missing** until someone
  approves it. Pick the policy deliberately per connector and alert on schema
  changes.
- **Primary-key requirement**: Fivetran needs a primary key to do incremental
  upserts. A source table **without a primary key** is synced as append-only (or
  fails), producing duplicates and unreliable updates. Ensure every synced table
  has a PK (or a Fivetran-derived one) before relying on incremental correctness.
- **`_fivetran_synced`** is a load timestamp in **UTC**, not an event time. Do not
  use it as a business event timestamp; comparing it against a naive local
  timestamp shifts results by the timezone offset. Use the source's own event
  column for time-based logic. [fivetran.com system-columns + schema-changes docs, retrieved 2026-07-10]

## Security (auth scope & PII)
```python
import os
from base64 import b64encode
import requests

def trigger_sync(connector_id: str):
    # RIGHT: API key/secret from env / secrets manager, never committed (CWE-798)
    key, secret = os.environ["FIVETRAN_API_KEY"], os.environ["FIVETRAN_API_SECRET"]
    auth = b64encode(f"{key}:{secret}".encode()).decode()
    return requests.post(
        f"https://api.fivetran.com/v1/connectors/{connector_id}/sync",
        headers={"Authorization": f"Basic {auth}"},
        timeout=30,
    ).json()
```

- **Connector auth scope** — grant the source database/API a **read-only,
  least-privilege** role scoped to exactly the schemas synced. A broad admin
  credential in a connector widens blast radius. API key/secret live in a secrets
  manager, never a committed literal — hardcoding is **CWE-798 (Use of Hard-coded
  Credentials)**. https://cwe.mitre.org/data/definitions/798.html
- **Column blocking / hashing for PII** — block columns you must not replicate,
  and enable Fivetran **column hashing** on PII (email, SSN) so the destination
  stores a one-way hash, not the raw value. Decide this **before** the first sync;
  un-blocking later re-syncs history. [fivetran.com column-blocking-hashing docs, retrieved 2026-07-10]

## Version-Specific Gotchas (dated, sourced)
- **fivetran-connector-sdk 2.10.1** is the current Connector SDK release, uploaded
  **2026-07-08** — the versioned, code-based way to build custom Fivetran
  connectors (the managed connectors themselves are continuously updated, not
  user-versioned). [pypi.org/project/fivetran-connector-sdk JSON API, retrieved 2026-07-10]
- **MAR billing** is per **distinct active primary-key row per month**, counted
  once regardless of how many times it changes — optimize table/column selection,
  not sync count-per-row. [fivetran.com pricing docs, retrieved 2026-07-10]
- **Managed transformations**: run dbt downstream (Fivetran **Quickstart /
  Transformations for dbt Core**) rather than transforming in-connector; the raw
  landed tables are the source of truth. [fivetran.com transformations docs, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- Fivetran Connector SDK (PyPI JSON): https://pypi.org/pypi/fivetran-connector-sdk/json
- Pricing / Monthly Active Rows (MAR): https://www.fivetran.com/docs/usage-based-pricing
- Sync overview & capture-deletes: https://www.fivetran.com/docs/core-concepts/sync-modes
- System columns (_fivetran_synced, _fivetran_deleted): https://www.fivetran.com/docs/core-concepts/system-columns-and-tables
- Schema change handling: https://www.fivetran.com/docs/core-concepts/schema-changes
- Column blocking & hashing: https://www.fivetran.com/docs/core-concepts/columns/column-hashing
- CWE-798 Hard-coded Credentials: https://cwe.mitre.org/data/definitions/798.html
