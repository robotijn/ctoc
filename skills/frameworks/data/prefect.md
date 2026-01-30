# Prefect CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
pip install prefect
prefect server start  # Local server for dev
# Or use Prefect Cloud: prefect cloud login
```

## Claude's Common Mistakes
1. **Bare Python without decorators** - All orchestrated code needs @flow/@task
2. **Missing retries on I/O** - Network calls fail; always add retries
3. **Hardcoded secrets** - Use Prefect Blocks for credentials
4. **No task caching** - Expensive computations should be cached
5. **Agents vs work pools** - Prefect 2.x uses work pools, not agents

## Correct Patterns (2026)
```python
from prefect import flow, task, get_run_logger
from prefect.tasks import task_input_hash
from datetime import timedelta

@task(
    retries=3,
    retry_delay_seconds=[10, 60, 300],  # Exponential backoff
    cache_key_fn=task_input_hash,
    cache_expiration=timedelta(hours=1),
)
def extract(source: str) -> dict:
    logger = get_run_logger()
    logger.info(f"Extracting from {source}")
    return {"records": 1000, "source": source}

@task(retries=2)
def transform(data: dict) -> dict:
    return {"processed": data["records"]}

@task
def load(data: dict, target: str):
    logger = get_run_logger()
    logger.info(f"Loading {data['processed']} records to {target}")

@flow(name="etl-daily", log_prints=True)
def etl_pipeline(source: str = "api", target: str = "warehouse"):
    raw = extract(source)
    transformed = transform(raw)
    load(transformed, target)

if __name__ == "__main__":
    etl_pipeline()
```

## Version Gotchas
- **Prefect 2.x vs 1.x**: Completely different API; 1.x is EOL
- **Work pools**: Replace agents; configure compute environment
- **Blocks**: Store credentials and configurations securely
- **Deployments**: Required for scheduled/triggered runs

## What NOT to Do
- Do NOT write bare Python scripts (use @flow/@task)
- Do NOT skip retries on network/API calls
- Do NOT hardcode credentials (use Blocks)
- Do NOT use Prefect 1.x patterns (agents, flow run API)
