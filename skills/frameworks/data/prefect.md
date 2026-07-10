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

## Flow Footguns (@flow vs @task, caching, retries, state)
The Prefect model bug Claude writes most: **`@flow` and `@task` are not
interchangeable.** A `@flow` is the orchestration boundary (it owns run state,
retries at the flow level, and can call other flows/tasks); a `@task` is a unit of
work whose *return value is a `PrefectFuture` when submitted concurrently*. Calling
a task's result without resolving the future — or nesting flows unintentionally —
produces confusing state.

```python
from prefect import flow, task
from prefect.cache_policies import INPUTS   # Prefect 3.x cache policy

# FOOTGUN: cache with NO expiration + inputs that never change = permanently stale cache
@task(cache_key_fn=lambda ctx, args: "static-key")   # every run collides on one key — WRONG
def load_config(): ...

# RIGHT (3.x): cache on the inputs, bound it with an expiration
@task(cache_policy=INPUTS, cache_expiration=timedelta(hours=1),
      retries=3, retry_delay_seconds=[10, 60, 300])   # backoff schedule
def extract(source: str) -> dict:
    return {"records": 1000, "source": source}
```

- **Caching keys must reflect inputs and expire.** A `cache_key_fn` /
  `cache_policy` that ignores arguments returns *the first run's result forever*;
  always key on inputs and set `cache_expiration`. (`task_input_hash` is the 2.x
  idiom; `cache_policy=INPUTS` is the 3.x idiom.)
- **Retries + `retry_delay_seconds`.** Every network/IO task needs `retries=` and a
  backoff (`retry_delay_seconds=[...]` or a single int); without it, one transient
  502 fails the whole flow.
- **State is explicit.** Tasks return futures when submitted to a task runner; call
  `.result()` (or let dependency-passing resolve them) — don't treat a future as its
  value. A raised exception marks the run `Failed`; return/`Completed` for success.
- **Deployments + work pools run flows on schedule.** `flow.deploy(...)` (or
  `prefect deploy`) registers a deployment against a **work pool** (the compute
  environment); *agents are removed* in 3.x. No deployment = no scheduled/triggered
  runs.
- **Blocks store config/credentials** as reusable, typed objects (`Secret`,
  `S3Bucket`, …) — load them by name, never inline the value.
  [docs.prefect.io write-flows + caching + deployments guides, retrieved 2026-07-10]

## Execution & Concurrency (task runners: sequential vs concurrent)
- **The task runner decides concurrency.** The default runs tasks **concurrently**
  via futures; a `ThreadPoolTaskRunner` bounds threads; `DaskTaskRunner` /
  `RayTaskRunner` distribute. If tasks share a non-thread-safe resource, pick a
  sequential/bounded runner or add a **global concurrency limit** — otherwise
  concurrent submission corrupts shared state.
- **`.submit()` vs direct call:** `task.submit(x)` returns a future (concurrent);
  `task(x)` runs inline. Mixing them unintentionally serializes what you wanted
  parallel (or vice-versa). [docs.prefect.io task-runners + global-concurrency-limits
  docs, retrieved 2026-07-10]

## Error Handling & Testing
```python
from prefect import flow
from prefect.testing.utilities import prefect_test_harness

# TEST against a throwaway ephemeral backend — no live Prefect server/DB
def test_pipeline_runs():
    with prefect_test_harness():          # temporary SQLite backend for the test
        state = etl_pipeline(return_state=True)
        assert state.is_completed()
```
- `prefect_test_harness()` spins an ephemeral backend so tests don't touch a real
  server. Call flows with `return_state=True` and assert on the `State`
  (`is_completed()` / `is_failed()`) rather than only the return value.
- Let non-transient errors raise to mark the run `Failed`; reserve `retries` for
  transient faults. [docs.prefect.io testing docs, retrieved 2026-07-10]

## Security & Dependency (CWE-798, CWE-88, CWE-863)
- **Secrets in Blocks/`Secret`, never in code (CWE-798).** Store credentials as a
  `Secret` block or from the environment; load by name at runtime.
- **Real Prefect advisories to patch (server-side):** **CVE-2026-3515 (high,
  CWE-88 argument injection)** and **CVE-2026-7725 (CWE-74)** cover argument/command
  injection in Git pull-steps — never interpolate untrusted input into shell/Git
  arguments. **CVE-2026-3514 (high, CWE-863)** and **CVE-2026-7722 (CWE-287)** are
  authentication-middleware bypasses (paths ending in `health`/`ready`). Keep the
  Prefect server/API patched and don't expose it unauthenticated.
- **Validate any URL you fetch (SSRF):** **CVE-2026-7724 (CWE-362, SSRF via DNS
  rebinding)** shows why `validate_restricted_url`-style checks matter — treat
  outbound URLs from config as untrusted. [github.com/advisories GHSA-cw25-2p92-7f75
  (CVE-2026-3515), GHSA-c635-393c-hcx2 (CVE-2026-3514); cwe.mitre.org
  CWE-798/CWE-88/CWE-863; retrieved 2026-07-10]

## Version-Specific Gotchas (dated, sourced)
- **prefect 3.7.8** is the current stable release, uploaded **2026-07-09**,
  `requires_python >=3.10,<3.15`. [pypi.org/project/prefect JSON API, retrieved
  2026-07-10]
- **Prefect 3.x** replaced 2.x's `task_input_hash` idiom with **cache policies**
  (`cache_policy=INPUTS/TASK_SOURCE/...`), made transactions/results first-class, and
  removed **agents** entirely in favor of **work pools + workers**. Prefect 1.x is
  EOL (completely different API). Deployments are required for scheduled runs.
  [docs.prefect.io 3.x docs + pypi.org, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- Prefect releases (PyPI JSON): https://pypi.org/pypi/prefect/json
- Write flows & tasks: https://docs.prefect.io/v3/develop/write-flows
- Caching: https://docs.prefect.io/v3/develop/task-caching
- Task runners: https://docs.prefect.io/v3/develop/task-runners
- Deployments & work pools: https://docs.prefect.io/v3/deploy/index
- Blocks & secrets: https://docs.prefect.io/v3/develop/blocks
- Testing: https://docs.prefect.io/v3/develop/test-workflows
- CVE-2026-3515 (CWE-88, argument injection): https://github.com/advisories/GHSA-cw25-2p92-7f75
- CVE-2026-3514 (CWE-863, auth bypass): https://github.com/advisories/GHSA-c635-393c-hcx2
- CWE-798 Use of Hard-coded Credentials: https://cwe.mitre.org/data/definitions/798.html
- CWE-88 Argument Injection: https://cwe.mitre.org/data/definitions/88.html
- CWE-863 Incorrect Authorization: https://cwe.mitre.org/data/definitions/863.html
