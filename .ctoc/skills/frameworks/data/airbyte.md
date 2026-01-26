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
