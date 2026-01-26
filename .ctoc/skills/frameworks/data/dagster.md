# Dagster CTO
> Software-defined assets for modern data orchestration.

## Commands
```bash
# Setup | Dev | Test
pip install dagster dagster-webserver dagster-dbt
dagster dev
pytest tests/ -v
```

## Non-Negotiables
1. Asset-centric design over task-centric workflows
2. Type annotations with `dagster_type` for data quality
3. Resources for all external service connections
4. Partitioned assets for incremental processing
5. `materialize_to_memory` for testing assets
6. Freshness policies for observability

## Red Lines
- Task/op-first thinking when assets fit better
- Hardcoded connections instead of resources
- Missing asset dependencies causing stale data
- No testing of asset logic
- Ignoring freshness SLAs

## Pattern: Production Asset Pipeline
```python
from dagster import (
    asset, AssetIn, DailyPartitionsDefinition,
    FreshnessPolicy, resource, Definitions
)
import pandas as pd

daily_partitions = DailyPartitionsDefinition(start_date="2024-01-01")

@resource
def warehouse_connection():
    return create_connection(os.environ["WAREHOUSE_URL"])

@asset(
    partitions_def=daily_partitions,
    freshness_policy=FreshnessPolicy(maximum_lag_minutes=60),
)
def raw_events(context, warehouse: Resource) -> pd.DataFrame:
    partition = context.partition_key
    return warehouse.query(f"SELECT * FROM events WHERE date = '{partition}'")

@asset(
    ins={"raw_events": AssetIn()},
    partitions_def=daily_partitions,
)
def cleaned_events(raw_events: pd.DataFrame) -> pd.DataFrame:
    return (
        raw_events
        .dropna(subset=["user_id"])
        .drop_duplicates(subset=["event_id"])
    )

@asset
def daily_summary(cleaned_events: pd.DataFrame) -> pd.DataFrame:
    return cleaned_events.groupby("date").agg({"revenue": "sum"})

defs = Definitions(
    assets=[raw_events, cleaned_events, daily_summary],
    resources={"warehouse": warehouse_connection},
)
```

## Integrates With
- **dbt**: Native dbt assets integration
- **Spark**: Spark resource for distributed compute
- **Cloud**: AWS, GCP, Azure resources

## Common Errors
| Error | Fix |
|-------|-----|
| `ResourceNotFoundError` | Define resource in Definitions |
| `DagsterInvalidSubsetError` | Check asset dependencies |
| `PartitionExecutionError` | Verify partition key format |
| `Stale asset` | Check upstream dependencies |

## Prod Ready
- [ ] Assets with partitions for incremental
- [ ] Freshness policies for critical assets
- [ ] Resources for all external connections
- [ ] Asset checks for data quality
- [ ] Dagster Cloud or self-hosted deployment
