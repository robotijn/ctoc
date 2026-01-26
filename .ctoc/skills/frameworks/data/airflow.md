# Apache Airflow CTO
> Production-grade workflow orchestration for data pipelines.

## Commands
```bash
# Setup | Dev | Test
pip install apache-airflow[celery,postgres,redis]
airflow db init && airflow webserver -p 8080 &
pytest tests/dags/ -v --ignore=tests/dags/test_dag_integrity.py
```

## Non-Negotiables
1. TaskFlow API (`@task` decorator) for Python operators
2. Idempotent tasks—safe to retry without side effects
3. XComs for metadata only (<48KB), never large data
4. Connections/Variables for all secrets (never in code)
5. DAG testing locally before deployment
6. Explicit task dependencies with `>>` or `set_downstream()`

## Red Lines
- Large data payloads in XComs
- Non-idempotent tasks causing duplicate processing
- Hardcoded credentials in DAG files
- `schedule_interval` instead of `schedule` (deprecated)
- Tasks with unbounded execution time

## Pattern: Production DAG
```python
from datetime import datetime, timedelta
from airflow.decorators import dag, task
from airflow.providers.common.sql.operators.sql import SQLExecuteQueryOperator

@dag(
    dag_id="etl_daily_sales",
    schedule="0 6 * * *",
    start_date=datetime(2024, 1, 1),
    catchup=False,
    default_args={
        "retries": 3,
        "retry_delay": timedelta(minutes=5),
        "execution_timeout": timedelta(hours=1),
    },
    tags=["etl", "sales"],
)
def etl_daily_sales():
    @task
    def extract(ds: str) -> dict:
        # Extract returns metadata, not data
        return {"records": 1000, "source": "api", "date": ds}

    @task
    def transform(metadata: dict) -> dict:
        # Transform logic here
        return {"processed": metadata["records"], "status": "success"}

    @task
    def load(metadata: dict):
        # Load to destination
        print(f"Loaded {metadata['processed']} records")

    load(transform(extract()))

etl_daily_sales()
```

## Integrates With
- **Compute**: Kubernetes, ECS, or Celery executors
- **Storage**: S3, GCS, ADLS via providers
- **Monitoring**: Prometheus metrics, Datadog, or native UI

## Common Errors
| Error | Fix |
|-------|-----|
| `DAG import error` | Check syntax with `python dags/my_dag.py` |
| `Task stuck in queued` | Increase worker count or check executor |
| `XCom size exceeded` | Use external storage (S3/GCS) for data |
| `Zombie task detected` | Increase `scheduler_zombie_task_threshold` |

## Prod Ready
- [ ] Kubernetes or Celery executor for scaling
- [ ] Secrets in Connections, not code
- [ ] DAG versioning with CI/CD
- [ ] SLA monitoring and alerting
- [ ] Task-level timeout configuration
