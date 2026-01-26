# Fivetran CTO
> Automated data integration with pre-built connectors and schema management.

## Commands
```bash
# Setup | Dev | Test (via API)
curl -X GET "https://api.fivetran.com/v1/connectors" -H "Authorization: Basic $FIVETRAN_API_KEY"
curl -X POST "https://api.fivetran.com/v1/connectors/{id}/sync" -H "Authorization: Basic $FIVETRAN_API_KEY"
```

## Non-Negotiables
1. Connector selection matched to source capabilities
2. Sync frequency aligned with data freshness needs
3. Schema handling strategy (allow columns vs. block)
4. Transformation layers (dbt models) downstream
5. Cost monitoring via Monthly Active Rows (MAR)
6. Alerting on sync failures

## Red Lines
- Syncing unnecessary tables/columns
- No transformation strategy post-landing
- Ignoring sync failures without alerting
- Missing monitoring dashboards
- Unmonitored MAR causing cost spikes

## Pattern: Production Integration Setup
```yaml
# Connector configuration (conceptual)
connector:
  service: postgres
  schema_prefix: source_

  config:
    host: production-db.example.com
    port: 5432
    database: production
    user: fivetran_user

  sync_mode: incremental
  cursor_column: updated_at

  schemas:
    - name: public
      tables:
        - name: orders
          sync_mode: INCREMENTAL
          enabled: true
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
# Fivetran API for automation
import requests
from base64 import b64encode

def trigger_connector_sync(connector_id: str):
    auth = b64encode(f"{API_KEY}:{API_SECRET}".encode()).decode()
    response = requests.post(
        f"https://api.fivetran.com/v1/connectors/{connector_id}/sync",
        headers={"Authorization": f"Basic {auth}"}
    )
    return response.json()

def get_sync_status(connector_id: str) -> dict:
    auth = b64encode(f"{API_KEY}:{API_SECRET}".encode()).decode()
    response = requests.get(
        f"https://api.fivetran.com/v1/connectors/{connector_id}",
        headers={"Authorization": f"Basic {auth}"}
    )
    return response.json()["data"]["status"]
```

## Integrates With
- **Destinations**: Snowflake, BigQuery, Redshift, Databricks
- **Transformation**: dbt for post-landing transforms
- **Orchestration**: Airflow sensors, Prefect triggers

## Common Errors
| Error | Fix |
|-------|-----|
| `Connection failed` | Check firewall rules, credentials |
| `Schema drift detected` | Review and allow/block columns |
| `Sync timeout` | Reduce initial sync scope |
| `MAR limit exceeded` | Review table selection, archive old data |

## Prod Ready
- [ ] Tables/columns selectively synced
- [ ] Schema handling strategy defined
- [ ] Alerting on sync failures
- [ ] MAR budget monitored
- [ ] dbt models for transformation
