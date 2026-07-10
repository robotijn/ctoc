# Airbyte CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
# Docker (self-hosted)
git clone https://github.com/airbytehq/airbyte.git
cd airbyte && docker compose up -d
# Web UI at http://localhost:8000
```

## Claude's Common Mistakes
1. **Full refresh when incremental works** - Wastes resources and time
2. **Missing normalization** - Raw JSON is unusable for analytics
3. **Outdated connectors** - Pin versions but update regularly
4. **No sync failure alerting** - Silent failures cause data staleness
5. **Syncing unnecessary tables** - Select only needed tables/columns

## Correct Patterns (2026)
```yaml
# Connection configuration
source:
  connector: source-postgres
  config:
    host: ${POSTGRES_HOST}
    database: production
    replication_method:
      method: CDC
      replication_slot: airbyte_slot

destination:
  connector: destination-snowflake
  config:
    host: ${SNOWFLAKE_HOST}
    database: RAW
    schema: PRODUCTION

sync:
  streams:
    - name: orders
      sync_mode: incremental
      destination_sync_mode: append_dedup
      cursor_field: updated_at
      primary_key: [id]

  schedule:
    type: cron
    expression: "0 */6 * * *"

  normalization:
    enabled: true
```

```python
import requests

# Trigger sync via API
def trigger_sync(connection_id: str):
    response = requests.post(
        f"{AIRBYTE_URL}/api/v1/connections/sync",
        json={"connectionId": connection_id},
        headers={"Authorization": f"Bearer {API_KEY}"}
    )
    return response.json()
```

## Version Gotchas
- **Airbyte Cloud vs OSS**: Cloud has managed connectors, faster updates
- **CDC setup**: Requires source database configuration (slots, publications)
- **Connector versions**: Check changelog before upgrading
- **Normalization**: Optional but recommended for structured destinations

## What NOT to Do
- Do NOT use full refresh when incremental is available
- Do NOT skip normalization (raw JSON is hard to query)
- Do NOT ignore sync failures (set up alerts)
- Do NOT sync all tables (select only needed data)

## Sync-Mode Footguns (Performance & Correctness)
The **sync mode + destination sync mode** pair decides correctness. Getting it
wrong is the most common Airbyte data bug: silent duplicates, silent misses, or
a full-table re-read every run.

```yaml
streams:
  - name: orders
    # sync_mode: full_refresh   → re-reads the ENTIRE source every sync (slow, costly)
    sync_mode: incremental       # only rows past the cursor
    destination_sync_mode: append_dedup   # de-dupe on primary_key (SCD/upsert)
    cursor_field: [updated_at]   # REQUIRED for incremental; must be monotonic + reliable
    primary_key: [[id]]          # REQUIRED for append_dedup, or you get duplicate rows
```

- **`incremental` needs a good `cursor field`** — a column that only ever moves
  forward (`updated_at`, an autoincrement id, an LSN). If the cursor is not
  monotonic (e.g. an `updated_at` that a backfill rewrites to an older value),
  rows are **silently skipped**. A cursor with equal values across many rows can
  drop rows at the boundary — Airbyte re-reads the boundary value inclusively but
  cannot page within it safely without a tiebreaker.
- **`incremental` + `append`** keeps every version (history); **`append_dedup`**
  needs `primary_key` and keeps the latest per key. Omitting `primary_key` on
  `append_dedup` → **duplicate rows**.
- **CDC (log-based)** — `replication_method: CDC` reads the DB write-ahead log
  (Postgres logical replication slot, MySQL binlog). It captures **deletes** and
  intra-sync updates that a cursor cannot. Costs: the replication slot **retains
  WAL** until Airbyte consumes it — a stalled sync can fill the source disk. Size
  the slot, monitor lag, and set a retention/heartbeat.

```yaml
source:
  replication_method:
    method: CDC
    replication_slot: airbyte_slot   # WARNING: unread slot pins WAL → source disk fills
    publication: airbyte_pub
```
[airbyte.com incremental-append-deduped + CDC docs, retrieved 2026-07-10; see References]

## Reliability Footguns
- **Resumable state**: incremental sync persists the cursor in connection *state*.
  Clearing/resetting state forces a full re-read; a corrupted or manually edited
  state silently skips ranges. Reset the stream, do not hand-edit state.
- **Schema-change propagation**: when the source adds/drops a column, the
  connection's `non_breaking_schema_updates_behavior` decides whether it auto-
  propagates, ignores, or **pauses** the connection. A *breaking* change (primary
  key or cursor removed) disables the connection until you review it — do not
  auto-approve breaking changes blindly. Pin the **connector version**; a
  connector upgrade can change the emitted schema.
- **Rate limits**: API-source connectors hit provider rate limits; Airbyte retries
  with backoff but a too-frequent schedule causes throttling and partial syncs.
  Watch for silent partial success. [airbyte.com schema-change + connection docs, retrieved 2026-07-10]

## Security (credentials & PII)
```python
import os, requests

# RIGHT: credentials come from a secrets store / env, never committed (CWE-798)
def trigger_sync(connection_id: str):
    token = os.environ["AIRBYTE_API_TOKEN"]          # not a literal in code
    return requests.post(
        f"{os.environ['AIRBYTE_URL']}/api/public/v1/jobs",
        json={"connectionId": connection_id, "jobType": "sync"},
        headers={"Authorization": f"Bearer {token}"},
        timeout=30,
    ).json()
```

- **Connector credentials** (DB passwords, API keys) live in Airbyte's secrets
  backend (env/HashiCorp Vault/GCP Secret Manager/AWS Secrets Manager), never in
  a committed config or version-controlled `docker-compose`. Hardcoding them is
  **CWE-798 (Use of Hard-coded Credentials)**. https://cwe.mitre.org/data/definitions/798.html
- **PII lands in raw tables** — the `_airbyte_raw_*` / typed tables mirror the
  source verbatim, PII included. Restrict access to the raw schema, and drop/hash
  PII columns downstream (dbt), or de-select them in the stream config so they are
  never replicated. [airbyte.com security + typing-and-deduping docs, retrieved 2026-07-10]

## Version-Specific Gotchas (dated, sourced)
- **Airbyte 2.0.0** is the current major platform release, published
  **2025-10-15** (GitHub releases). Airbyte Cloud tracks newer managed connectors
  than a self-hosted OSS deployment; pin and test connector versions per stream.
  [github.com/airbytehq/airbyte releases, retrieved 2026-07-10]
- **"Basic normalization" removed** — modern Airbyte writes typed/deduped tables
  via **Typing & Deduping** in the destination (no separate dbt-normalization
  step); the old raw-JSON + dbt-normalization model is legacy. Query the typed
  tables, not `_airbyte_data` JSON blobs.
- **CDC setup** requires source-side config (Postgres logical replication slot +
  publication; MySQL binlog `ROW` format) before the connection will sync.
  [airbyte.com typing-and-deduping + CDC docs, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- Airbyte releases (GitHub): https://github.com/airbytehq/airbyte/releases
- Incremental append + dedup: https://docs.airbyte.com/using-airbyte/core-concepts/sync-modes/incremental-append-deduped
- Change Data Capture (CDC): https://docs.airbyte.com/understanding-airbyte/cdc
- Typing & Deduping: https://docs.airbyte.com/using-airbyte/core-concepts/typing-deduping
- Schema change management: https://docs.airbyte.com/cloud/managing-airbyte-cloud/manage-schema-changes
- CWE-798 Hard-coded Credentials: https://cwe.mitre.org/data/definitions/798.html
