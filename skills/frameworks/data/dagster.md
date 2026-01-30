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
