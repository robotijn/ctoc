# Apache Airflow CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
pip install "apache-airflow[celery,postgres,redis]==2.9.0"
airflow db migrate
airflow standalone  # Dev mode with webserver + scheduler
```

## Claude's Common Mistakes
1. **Large data in XComs** - XComs are for metadata (<48KB), not data payloads
2. **schedule_interval parameter** - Deprecated; use schedule="0 6 * * *"
3. **Non-idempotent tasks** - Tasks must be safe to retry without side effects
4. **Heavy logic in DAG file** - DAG parsing happens frequently; keep it light
5. **Hardcoded credentials** - Use Connections and Variables, never code

## Correct Patterns (2026)
```python
from datetime import datetime, timedelta
from airflow.decorators import dag, task

@dag(
    dag_id="etl_daily",
    schedule="0 6 * * *",  # NOT schedule_interval (deprecated)
    start_date=datetime(2025, 1, 1),
    catchup=False,
    default_args={
        "retries": 3,
        "retry_delay": timedelta(minutes=5),
        "execution_timeout": timedelta(hours=1),
    },
    tags=["etl"],
)
def etl_daily():
    @task
    def extract(ds: str) -> dict:
        # Return metadata only, not data
        return {"records": 1000, "source": "api", "date": ds}

    @task
    def transform(metadata: dict) -> dict:
        # Idempotent: same input = same output
        return {"processed": metadata["records"]}

    @task
    def load(metadata: dict):
        # Use UPSERT, not INSERT (idempotent)
        print(f"Loaded {metadata['processed']} records")

    # TaskFlow handles XCom automatically
    load(transform(extract()))

etl_daily()
```

## Version Gotchas
- **v2.9+**: MsSQL backend removed; use PostgreSQL
- **v2.9+**: SQLAlchemy 1.4.36 minimum required
- **v2.9+**: Rendered template fields limited to 4096 chars
- **TaskFlow**: @task.docker and @task.kubernetes for isolation

## What NOT to Do
- Do NOT pass large data through XComs (use S3/GCS)
- Do NOT use schedule_interval (use schedule)
- Do NOT hardcode credentials in DAG files
- Do NOT make non-idempotent tasks (INSERT -> UPSERT)
