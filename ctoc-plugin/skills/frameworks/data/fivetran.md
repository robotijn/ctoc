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
