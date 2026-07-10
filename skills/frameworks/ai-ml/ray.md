# Ray CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
pip install "ray[default,train,tune,serve]"
# Start cluster: ray start --head
# Verify: python -c "import ray; ray.init(); print(ray.cluster_resources())"
```

## Claude's Common Mistakes
1. Not specifying resource requirements for actors/tasks
2. Using grid search instead of smarter HPO (ASHA, PBT)
3. Missing `train.torch.prepare_model()` for distributed training
4. Not using `train.report()` for checkpointing
5. Ignoring Ray Data for large-scale preprocessing

## Correct Patterns (2026)
```python
import ray
from ray import tune, train
from ray.train.torch import TorchTrainer
from ray.tune.schedulers import ASHAScheduler

ray.init()

# Distributed training function
def train_func(config):
    import torch
    model = MyModel(config["hidden_size"])
    model = train.torch.prepare_model(model)  # Required for DDP

    optimizer = torch.optim.AdamW(model.parameters(), lr=config["lr"])
    train_loader = train.torch.prepare_data_loader(get_dataloader())

    for epoch in range(config["epochs"]):
        for batch in train_loader:
            loss = model(batch)
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()

        # Report metrics and checkpoint
        train.report({"loss": loss.item()},
                     checkpoint=train.Checkpoint.from_model(model))

# Distributed trainer
trainer = TorchTrainer(
    train_func,
    train_loop_config={"hidden_size": 256, "lr": 1e-4, "epochs": 10},
    scaling_config=train.ScalingConfig(num_workers=4, use_gpu=True),
)

# HPO with ASHA scheduler (early stopping)
tuner = tune.Tuner(
    trainer,
    param_space={"train_loop_config": {"lr": tune.loguniform(1e-5, 1e-3)}},
    tune_config=tune.TuneConfig(metric="loss", mode="min", num_samples=20,
                                 scheduler=ASHAScheduler()),
)
results = tuner.fit()
```

## Version Gotchas
- **Ray 2.x**: Use `train.torch.prepare_model()` not `ray.train.torch.prepare`
- **Tune**: ASHA scheduler for early stopping, PBT for adaptive HPO
- **Serve**: Use `@serve.deployment` decorator for model serving
- **Data**: Use `ray.data` for preprocessing at scale

## What NOT to Do
- Do NOT skip resource specifications (CPU/GPU)
- Do NOT use grid search - use ASHA or Bayesian optimization
- Do NOT forget `train.torch.prepare_model()` for distributed
- Do NOT skip checkpointing with `train.report()`
- Do NOT ignore Ray Data for large datasets

## Actor / Task Scheduling Footguns
Ray's remote primitives silently misbehave when resources, blocking, and lifetime
are handled naively — these are the most common Ray bugs Claude generates.

```python
import ray

ray.init()

# FOOTGUN: no resource spec. Ray schedules on *logical* resources it knows about.
# A GPU task with no num_gpus is placed on ANY node and quietly runs on CPU (or
# oversubscribes a GPU with 20 co-located tasks that then OOM the device).
@ray.remote                          # WRONG for a GPU workload
def infer(x): ...

@ray.remote(num_gpus=1, num_cpus=2)  # RIGHT — reserve the accelerator + cores
def infer(x): ...

# FOOTGUN: ray.get inside the submit loop serializes everything — you lose all
# parallelism and can deadlock when a task blocks on ray.get of a task that has
# not been scheduled (no free resources), a classic Ray hang.
refs = [infer.remote(x) for x in batch]   # submit ALL first...
results = ray.get(refs)                    # ...THEN gather. Never get-in-loop.
```

- **Object store spill + OOM**: task return values live in the shared plasma object
  store (default ~30% of node RAM). Returning large arrays from many tasks fills it;
  Ray then spills to disk (silent 10-100x slowdown) or the raylet kills workers with
  a cryptic `ObjectStoreFullError` / OOM-killer SIGKILL. Return references/handles or
  stream via `ray.data`, not giant in-memory blobs. Size the store with
  `object_store_memory` at `ray.init`.
- **Actor lifetime**: an `@ray.remote` class is a stateful process pinned to a worker
  until it goes out of scope or you call `ray.kill(actor)`. Leaked actor handles keep
  GPUs reserved forever (idle-cost + scheduling starvation). Use `max_restarts` /
  `lifetime="detached"` deliberately, never by accident.
- **Nested remote**: calling `.remote()` from inside a task without reserving CPUs for
  the child work deadlocks under saturation — the parent holds a slot waiting on a
  child that can never be scheduled.
- Source: docs.ray.io scheduling / object-management / actors. See References.

## Serialization Footguns (cloudpickle)
Ray serializes every task argument, closure, and return value with **cloudpickle**.
This is both a correctness trap and a security boundary (see Security).

```python
# FOOTGUN: capturing a huge object in a closure ships it to EVERY task invocation.
big = load_10gb_index()
@ray.remote
def q(x): return big.search(x)     # `big` is cloudpickled into each call — slow/OOM

# RIGHT: put it in the object store ONCE; tasks receive a lightweight ref.
big_ref = ray.put(load_10gb_index())
@ray.remote
def q(x, idx): return idx.search(x)
ray.get([q.remote(x, big_ref) for x in xs])   # `big` shipped once, deduplicated
```

- Non-serializable closures (open sockets, DB connections, thread locks, CUDA
  contexts, lambdas over unpicklable state) raise `TypeError: cannot pickle ...` at
  submit time. Build such resources *inside* the actor's `__init__` / task body, not
  in the enclosing scope.

## Security — Dashboard, Jobs API & Deserialization (CWE-306, CWE-918, CWE-502)
**Ray's control plane is unauthenticated by design and must NEVER face an untrusted
network.** The dashboard (default `:8265`), the Jobs API, and the Ray Client
(`:10001`) expose remote code execution to anyone who can reach the port — this is
**CWE-306 Missing Authentication for Critical Function** (cwe.mitre.org/data/definitions/306.html).

```python
# FOOTGUN: binds the dashboard to 0.0.0.0 → anyone on the network submits jobs = RCE.
ray.init(dashboard_host="0.0.0.0")           # DANGEROUS on a public/shared network

# RIGHT: bind to loopback; reach it via an SSH tunnel or an authenticated proxy.
ray.init(dashboard_host="127.0.0.1")         # default; keep the control plane private
```

- **CVE-2023-48022 ("ShadowRay")** — the Jobs submission API allows a remote,
  unauthenticated attacker to execute arbitrary code (**CWE-918 SSRF class** per NVD).
  The Ray maintainers **dispute** this as a vulnerability: their documented position
  is that Ray is only supported inside a strictly controlled network, so missing auth
  is by design, not a bug — which is exactly why it is your job to lock down the
  network boundary. Frame it accurately: it is a real, exploited-in-the-wild exposure
  *when clusters are left open*, disputed as a "vuln" only because Ray never promised
  auth. [nvd.nist.gov CVE-2023-48022, retrieved 2026-07-10;
  anyscale.com/blog/update-on-ray-cves-cve-2023-6019-cve-2023-6020-cve-2023-6021-cve-2023-48022-cve-2023-48023]
- **CVE-2023-6019** (cpu_profile command injection, **CWE-78**, unauthenticated
  dashboard RCE) and **CVE-2023-6020/6021** (path-traversal LFI reading any file, no
  auth) were **fixed in Ray 2.8.1+** — patch dashboards that must be reachable.
  [nvd.nist.gov CVE-2023-6019 / CVE-2023-6021, retrieved 2026-07-10]
- **Deserialization (CWE-502)**: because arguments are cloudpickled, a task arg from
  an untrusted submitter is arbitrary-code-on-deserialize. Combined with the open
  Jobs API this is the ShadowRay kill chain. Never accept task payloads from outside
  your trust boundary. [cwe.mitre.org/data/definitions/502.html, retrieved 2026-07-10]

## Error Handling Idioms
```python
import ray
from ray.exceptions import RayTaskError, GetTimeoutError, OutOfMemoryError

@ray.remote(max_retries=3)     # retries on WORKER failure (node death), not on app errors
def work(x): ...

try:
    # ALWAYS bound ray.get — an un-timed get on a wedged task hangs forever.
    results = ray.get([work.remote(x) for x in xs], timeout=60)
except GetTimeoutError:
    ...                        # task still running; decide to wait or ray.cancel()
except RayTaskError as e:
    # the remote exception is re-raised locally WITH the worker traceback attached.
    raise                      # inspect e.cause for the original error
except OutOfMemoryError:
    ...                        # object store / worker OOM — shrink batch or spill

# ray.wait lets you process results as they finish instead of blocking on the slowest.
ready, pending = ray.wait(refs, num_returns=1, timeout=5)
```

## Testing Conventions
```python
import ray
import pytest

@pytest.fixture(scope="module")
def ray_cluster():
    # Local, single-node init for tests — deterministic, no external cluster.
    ray.init(num_cpus=2, num_gpus=0, include_dashboard=False)  # never open a port in CI
    yield
    ray.shutdown()                                             # REQUIRED — else state leaks between tests

def test_remote_roundtrip(ray_cluster):
    @ray.remote
    def double(x): return x * 2
    assert ray.get(double.remote(21)) == 42
```
- Always `ray.shutdown()` in teardown; a leaked cluster between tests causes
  resource-exhaustion flakiness. `include_dashboard=False` keeps CI from binding
  `:8265`.

## Performance Traps
- **`ray.get` in the submit loop** serializes execution — submit all refs, then gather
  (see Actor/Task Footguns).
- **Too-fine task granularity**: each task has ~ms scheduling + serialization overhead;
  millions of trivial tasks are dominated by overhead. Batch work per task.
- **Object-store thrash**: repeatedly `ray.put`ing the same large object instead of
  reusing one ref duplicates memory and triggers spill.
- **Fetching to the driver**: `ray.get` of every result pulls all data through the
  single driver — aggregate with `ray.data` / tree-reduce instead.

## Version-Specific Gotchas (dated, sourced)
- **Ray 2.56.0** is the current stable release, uploaded **2026-06-29**.
  [pypi.org/project/ray/, retrieved 2026-07-10]
- **Ray 2.x**: use `train.torch.prepare_model()` (not the pre-2.x `ray.train.torch.prepare`).
  [docs.ray.io/en/latest/train, retrieved 2026-07-10]
- **Dashboard/LFI CVEs fixed in 2.8.1+** — clusters on < 2.8.1 with a reachable
  dashboard are exploitable (CVE-2023-6019/6020/6021). [nvd.nist.gov, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- Ray releases (PyPI): https://pypi.org/project/ray/
- Ray scheduling / resources: https://docs.ray.io/en/latest/ray-core/scheduling/resources.html
- Ray object management (plasma store / spilling): https://docs.ray.io/en/latest/ray-core/objects/object-spilling.html
- Ray actors & lifetime: https://docs.ray.io/en/latest/ray-core/actors.html
- Ray security / network model: https://docs.ray.io/en/latest/ray-security/index.html
- CVE-2023-48022 (ShadowRay, disputed): https://nvd.nist.gov/vuln/detail/CVE-2023-48022
- CVE-2023-6019 (cpu_profile command injection): https://nvd.nist.gov/vuln/detail/CVE-2023-6019
- CVE-2023-6021 (log-API LFI): https://nvd.nist.gov/vuln/detail/CVE-2023-6021
- Anyscale response to the Ray CVEs: https://www.anyscale.com/blog/update-on-ray-cves-cve-2023-6019-cve-2023-6020-cve-2023-6021-cve-2023-48022-cve-2023-48023
- CWE-306 (Missing Authentication for Critical Function): https://cwe.mitre.org/data/definitions/306.html
- CWE-918 (Server-Side Request Forgery): https://cwe.mitre.org/data/definitions/918.html
- CWE-502 (Deserialization of Untrusted Data): https://cwe.mitre.org/data/definitions/502.html
