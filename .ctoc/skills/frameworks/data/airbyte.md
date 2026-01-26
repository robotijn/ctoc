# Airbyte CTO
> Open-source ELT platform for data integration at scale.

## Commands
```bash
# Setup | Dev | Test
docker compose up -d
curl http://localhost:8000/api/v1/health
airbyte-cli connections list
```

## Non-Negotiables
1. Source/destination connector pairing validated
2. Sync mode selection (full refresh vs incremental)
3. Normalization configured for destination
4. Connector versions pinned and updated
5. Self-hosted security hardened
6. Monitoring and alerting on sync failures

## Red Lines
- Full refresh when incremental is possible
- Missing normalization causing raw JSON chaos
- Outdated connectors with known issues
- No connection testing before deployment
- Ignoring sync logs and error patterns

## Pattern: Production ELT Pipeline
```yaml
# connection.yaml
source:
  name: postgres_production
  connector: source-postgres
  config:
    host: ${POSTGRES_HOST}
    database: production
    username: ${POSTGRES_USER}
    password: ${POSTGRES_PASSWORD}
    replication_method:
      method: CDC
      replication_slot: airbyte_slot
      publication: airbyte_publication

destination:
  name: snowflake_warehouse
  connector: destination-snowflake
  config:
    host: ${SNOWFLAKE_HOST}
    database: RAW
    schema: PRODUCTION
    warehouse: AIRBYTE_WH

sync:
  streams:
    - name: orders
      sync_mode: incremental
      destination_sync_mode: append_dedup
      cursor_field: updated_at
      primary_key: [id]
    - name: users
      sync_mode: incremental
      destination_sync_mode: append_dedup
      cursor_field: updated_at
      primary_key: [id]

  schedule:
    type: cron
    expression: "0 */6 * * *"  # Every 6 hours

  normalization:
    enabled: true
```

```python
# Airbyte API for programmatic control
import requests

def trigger_sync(connection_id: str):
    response = requests.post(
        f"{AIRBYTE_URL}/api/v1/connections/sync",
        json={"connectionId": connection_id},
        headers={"Authorization": f"Bearer {API_KEY}"}
    )
    return response.json()
```

## Integrates With
- **Sources**: 300+ connectors (databases, APIs, files)
- **Destinations**: Snowflake, BigQuery, Redshift, S3
- **Orchestration**: Airflow, Dagster, Prefect operators

## Common Errors
| Error | Fix |
|-------|-----|
| `Sync failed: connection timeout` | Check source connectivity |
| `Replication slot does not exist` | Create CDC slot manually |
| `Normalization failed` | Check destination schema permissions |
| `Rate limit exceeded` | Reduce sync frequency |

## Prod Ready
- [ ] Incremental sync where possible
- [ ] Normalization configured
- [ ] Alerting on sync failures
- [ ] Connector versions tracked
- [ ] Resource limits configured
