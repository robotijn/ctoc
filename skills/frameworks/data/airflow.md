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

## DAG Footguns (top-level code, catchup, XCom, idempotency)
The single most damaging Airflow mistake Claude writes: **real work at the top
level of a DAG file**. The scheduler *re-parses every DAG file on a loop* (default
`min_file_process_interval = 30s`), so anything at module scope — an API call, a
DB query, `pd.read_parquet(...)`, `Variable.get(...)` — runs on *every parse*, not
per run. That hammers external systems, slows parsing, and can crash the scheduler.

```python
# FOOTGUN: runs on EVERY scheduler parse loop, not when the task runs
import requests
rows = requests.get("https://api.example.com/config").json()   # top-level I/O — WRONG
default_pool_size = SomeClient().count()                        # top-level DB call — WRONG

# RIGHT: defer all I/O into task bodies (executed on the worker, per run)
@task
def fetch_config():
    return requests.get("https://api.example.com/config").json()   # runs at execution time only
```

- **`catchup=True` is a backfill storm.** With a `start_date` in the past and
  `catchup=True` (the historical default), Airflow schedules one run per missed
  interval the instant the DAG unpauses — hundreds of concurrent runs. Set
  `catchup=False` unless you *want* backfill, and bound it with `max_active_runs`.
- **XCom is metadata, not a data bus.** XCom values are serialized into the
  metadata DB; the default backend is not sized for payloads (guidance: keep XCom
  well under ~48KB; Postgres/MySQL columns and serialization make large XCom a
  perf and stability hazard). Pass an S3/GCS URI, not the dataframe.
- **Idempotency + the logical/`data_interval` date.** A retried or backfilled task
  MUST produce the same result — key writes on the run's `logical_date` /
  `data_interval_start`, never `datetime.now()`, and use `MERGE`/`UPSERT` (or
  delete-then-insert on the partition), never bare `INSERT`.
- **Dynamic task mapping** (`.expand()`) fans out at runtime — cap it with
  `max_active_tis_per_dag` / pools so a large mapping doesn't starve the cluster.
  [airflow.apache.org best-practices + dynamic-task-mapping docs, retrieved
  2026-07-10; see References]

```python
from airflow.decorators import dag, task

@dag(schedule="0 6 * * *", start_date=datetime(2025, 1, 1),
     catchup=False, max_active_runs=1, tags=["etl"])
def etl_daily():
    @task(max_active_tis_per_dag=8)
    def load_partition(uri: str, data_interval_start=None):
        # idempotent write keyed on the run's logical interval, not wall-clock now()
        target = f"warehouse.events/{data_interval_start:%Y-%m-%d}"
        upsert(target, read_s3(uri))          # MERGE/UPSERT, safe to retry
    load_partition.expand(uri=list_new_objects())   # bounded fan-out
```

## Execution (executor, concurrency, pools)
- **Executor choice is a scaling decision, not a default.** `SequentialExecutor`
  (SQLite) runs one task at a time — dev only. `LocalExecutor` uses subprocesses on
  one host; `CeleryExecutor` / `KubernetesExecutor` distribute across workers. Match
  the executor to the workload; a misconfigured executor is a silent throughput cap.
- **Bound concurrency at three levels:** `parallelism` (whole cluster),
  `max_active_tasks_per_dag`, and **Pools** for shared external resources (e.g. a
  DB with a connection limit). Assign heavy tasks to a bounded pool so one DAG
  cannot exhaust a downstream system. [airflow.apache.org executor +
  pools docs, retrieved 2026-07-10]

## Error Handling & Testing
```python
# Retries with backoff + a timeout so a hung task cannot pin a worker forever
@task(retries=3, retry_delay=timedelta(minutes=5),
      retry_exponential_backoff=True, execution_timeout=timedelta(hours=1))
def call_flaky_api(): ...

# TEST the DAG statically — no scheduler needed. This is the fast CI guard.
from airflow.models import DagBag
def test_dag_imports_and_has_no_cycles():
    dagbag = DagBag(include_examples=False)
    assert dagbag.import_errors == {}          # top-level code / import errors fail loudly
    dag = dagbag.get_dag("etl_daily")
    assert dag is not None and dag.catchup is False
```
- `DagBag.import_errors` is the canonical unit-test hook: it catches top-level-code
  failures, cycles, and bad imports *without* running the scheduler. Also test task
  logic in isolation by calling the underlying Python function directly.
- Prefer failing loud: set `execution_timeout` and finite `retries` so a stuck task
  raises instead of hanging indefinitely. [airflow.apache.org testing docs,
  retrieved 2026-07-10]

## Security & Dependency (CWE-798, CWE-1336, CWE-502)
- **Secrets belong in a secrets backend, never in code (CWE-798).** Use Connections
  and Variables backed by a secrets backend (AWS/GCP Secrets Manager, Vault,
  environment). Note **CVE-2026-32690 (CWE-668)** and **CVE-2026-45192 (CWE-200)**:
  secrets stored as JSON dictionaries or in Connection `extra` could be
  under-redacted — prefer a real secrets backend and keep Airflow patched.
- **Templated SQL/command injection (CWE-1336 template-engine injection).** Airflow
  renders Jinja on templated fields. **CVE-2026-42252 (critical, CWE-1336)** is a
  real template-injection advisory — never interpolate untrusted input into a
  templated `sql=`/`bash_command=`; use parameterized operators/hooks. This is the
  SQL-injection family (CWE-89) at the orchestration layer.
- **Never `pickle`/deserialize untrusted XCom or DAG-run payloads (CWE-502).**
  **CVE-2026-42359 (high, CWE-502)** and **CVE-2026-45360 (high, CWE-502)** are real
  deserialization advisories — keep the default JSON XCom serializer and patch
  promptly.
- **Patch cadence matters** — Airflow has an active advisory stream; pin a current
  patched release and watch the GitHub advisory feed.
  [github.com/advisories GHSA-c85c-g9wv-pph2 (CVE-2026-42252),
  GHSA-wr76-29cr-67w8 (CVE-2026-42359); cwe.mitre.org CWE-798/CWE-1336/CWE-502;
  retrieved 2026-07-10]

## Version-Specific Gotchas (dated, sourced)
- **apache-airflow 3.3.0** is the current stable release, uploaded **2026-07-06**,
  `requires_python >=3.10` (excludes 3.15). [pypi.org/project/apache-airflow JSON
  API, retrieved 2026-07-10]
- **Airflow 3.x** shipped a rebuilt React UI, a stable **Task Execution API**
  (task-runner isolation / remote workers), DAG versioning, and made the scheduler
  the single source of truth for scheduling — plan migrations off 2.x, which is now
  on security-only footing.
- **2.9+ (pre-existing):** MSSQL metadata backend removed (use PostgreSQL),
  SQLAlchemy ≥ 1.4.36, rendered template fields capped at 4096 chars. Prefer
  `schedule=` (`schedule_interval` is deprecated). [airflow.apache.org release
  notes, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- Airflow releases (PyPI JSON): https://pypi.org/pypi/apache-airflow/json
- Best practices (top-level code, idempotency): https://airflow.apache.org/docs/apache-airflow/stable/best-practices.html
- Dynamic task mapping: https://airflow.apache.org/docs/apache-airflow/stable/authoring-and-scheduling/dynamic-task-mapping.html
- Pools & concurrency: https://airflow.apache.org/docs/apache-airflow/stable/administration-and-deployment/pools.html
- Testing DAGs: https://airflow.apache.org/docs/apache-airflow/stable/best-practices.html#testing-a-dag
- Secrets backends: https://airflow.apache.org/docs/apache-airflow/stable/security/secrets/secrets-backend/index.html
- CVE-2026-42252 (CWE-1336, template injection): https://github.com/advisories/GHSA-c85c-g9wv-pph2
- CVE-2026-42359 (CWE-502, deserialization): https://github.com/advisories/GHSA-wr76-29cr-67w8
- CWE-798 Use of Hard-coded Credentials: https://cwe.mitre.org/data/definitions/798.html
- CWE-1336 Template-Engine Injection: https://cwe.mitre.org/data/definitions/1336.html
- CWE-502 Deserialization of Untrusted Data: https://cwe.mitre.org/data/definitions/502.html
