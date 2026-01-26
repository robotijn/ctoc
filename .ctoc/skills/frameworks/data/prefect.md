# Prefect CTO
> Modern workflow orchestration with Python-native simplicity.

## Commands
```bash
# Setup | Dev | Test
pip install prefect
prefect server start
python my_flow.py && prefect deployment run my-flow/prod
```

## Non-Negotiables
1. `@flow` and `@task` decorators for all orchestrated code
2. Retries with exponential backoff for unreliable operations
3. Caching for expensive computations (file, result)
4. Structured logging with `get_run_logger()`
5. Deployments for production scheduling
6. Work pools for compute isolation

## Red Lines
- Bare Python scripts without flow/task wrappers
- Missing retries on network/API calls
- Hardcoded secrets in flow code
- No observability in production flows
- Long-running tasks without heartbeats

## Pattern: Production Data Pipeline
```python
from prefect import flow, task, get_run_logger
from prefect.tasks import task_input_hash
from datetime import timedelta

@task(
    retries=3,
    retry_delay_seconds=[10, 60, 300],
    cache_key_fn=task_input_hash,
    cache_expiration=timedelta(hours=1),
)
def extract(source: str) -> dict:
    logger = get_run_logger()
    logger.info(f"Extracting from {source}")
    # Extract logic here
    return {"records": 1000, "source": source}

@task(retries=2)
def transform(data: dict) -> dict:
    logger = get_run_logger()
    logger.info(f"Transforming {data['records']} records")
    return {"processed": data["records"], "status": "success"}

@task
def load(data: dict, target: str):
    logger = get_run_logger()
    logger.info(f"Loading to {target}")

@flow(name="etl-daily", log_prints=True)
def etl_pipeline(source: str = "api", target: str = "warehouse"):
    raw = extract(source)
    transformed = transform(raw)
    load(transformed, target)
    return transformed

if __name__ == "__main__":
    etl_pipeline()
```

## Integrates With
- **Compute**: Kubernetes, Docker, AWS ECS work pools
- **Storage**: S3, GCS result backends
- **Alerting**: Slack, PagerDuty, email automations

## Common Errors
| Error | Fix |
|-------|-----|
| `FlowRunCrashed` | Check task exceptions and add retries |
| `CacheMiss` unexpected | Verify cache_key_fn returns consistent keys |
| `Agent not polling` | Check work pool configuration and agent status |
| `Timeout` on long tasks | Increase task timeout or add heartbeats |

## Prod Ready
- [ ] Deployments with schedules configured
- [ ] Work pools for compute isolation
- [ ] Secrets in Prefect blocks, not code
- [ ] Alerting automations enabled
- [ ] Flow run retention policies set
