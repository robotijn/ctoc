# MLflow CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
pip install mlflow[extras]
# Start server: mlflow server --host 0.0.0.0 --port 5000
# UI: mlflow ui
```

## Claude's Common Mistakes
1. Manual logging when autolog works for the framework
2. Missing model signatures for deployment validation
3. Not using Model Registry for production versioning
4. Hardcoded tracking URIs instead of environment config
5. Skipping input examples causing deployment issues

## Correct Patterns (2026)
```python
import mlflow
from mlflow.models import infer_signature

# Set tracking URI from environment
mlflow.set_tracking_uri(os.environ.get("MLFLOW_TRACKING_URI", "http://localhost:5000"))
mlflow.set_experiment("production-classifier")

# Enable autolog for framework (scikit-learn, pytorch, tensorflow, etc.)
mlflow.sklearn.autolog(log_input_examples=True, log_model_signatures=True)

with mlflow.start_run(run_name="rf-v1", tags={"env": "staging"}):
    # Train model
    model.fit(X_train, y_train)
    predictions = model.predict(X_test)

    # Log custom metrics
    mlflow.log_metrics({"accuracy": accuracy, "f1": f1_score})

    # Log model with signature (required for deployment)
    signature = infer_signature(X_train, predictions)
    mlflow.sklearn.log_model(
        model, "model",
        signature=signature,
        input_example=X_train[:5],
        registered_model_name="production-classifier"
    )

# Promote to production
client = mlflow.MlflowClient()
client.transition_model_version_stage("production-classifier", version=1, stage="Production")
```

## Version Gotchas
- **Model Registry**: Required for production deployments
- **Signatures**: Mandatory for serving validation
- **Autolog**: Framework-specific - enable for each framework used
- **Artifacts**: Use artifact repository (S3/GCS) for large files

## What NOT to Do
- Do NOT skip autolog when available for your framework
- Do NOT deploy without model signatures
- Do NOT hardcode tracking URIs
- Do NOT skip input examples
- Do NOT use local filesystem for production artifacts

## Model-Flavor & Logging Footguns
The gap between what `log_model` *records* and what `load_model` *reconstructs* is
where reproducible pipelines quietly break.

```python
import mlflow
from mlflow.models import infer_signature

# FOOTGUN: log_model without a signature/input_example — MLflow cannot validate
# inputs at serve time and infers schema from the first request, so a wrong dtype
# fails in production instead of at log time.
with mlflow.start_run():
    sig = infer_signature(X_train, model.predict(X_train))
    # MLflow 3 replaced flavor.log_model(model, "path") positional-artifact-path
    # with the keyword `name=`; the old positional form is deprecated and warns.
    info = mlflow.sklearn.log_model(model, name="model", signature=sig,
                                    input_example=X_train[:2])

# The flavor you LOG with must match the flavor you LOAD with. A model logged via
# mlflow.sklearn is a sklearn flavor; load it as generic pyfunc for serving:
pyfunc_model = mlflow.pyfunc.load_model(info.model_uri)   # unified predict() API
```
- **`autolog` double-logging**: calling `mlflow.autolog()` (or a framework
  `mlflow.<flavor>.autolog()`) AND then manually `log_metric`/`log_model` for the
  same values logs each twice and can create two model artifacts per run. Pick one.
  Autolog also silently no-ops for framework versions outside MLflow's supported
  range — check the run actually captured params before trusting it.
- **Registry stage transitions**: `transition_model_version_stage` (Staging /
  Production / Archived) is **deprecated in MLflow 3** in favor of model **aliases**
  (`set_registered_model_alias`) + tags. New code should use aliases; stages still
  work but warn. [mlflow.org/docs/latest/model-registry.html, retrieved 2026-07-10]
- **`pyfunc` signature drift**: an `input_example` is used to *infer* the signature
  when you do not pass one explicitly — if the example is a single row with a column
  that happens to be all-integer, the inferred schema is `long` and a later float
  request is rejected. Pass an explicit `signature` for anything you serve.

## Reproducibility
```python
# Capture the environment MLflow will pin into the model's conda.yaml / requirements.
# FOOTGUN: MLflow infers requirements from the CURRENT interpreter at log time. If
# your training env has an unpinned transitive dep, the logged model reconstructs
# with a different version on load and predictions drift.
mlflow.sklearn.log_model(
    model, name="model",
    pip_requirements=["scikit-learn==1.5.2", "numpy==2.1.3"],   # pin explicitly
)
```
- Set `MLFLOW_TRACKING_URI` and `MLFLOW_ARTIFACT_ROOT` from environment, never
  hardcode — a run logged against a local `./mlruns` store is invisible to teammates
  and lost on container teardown. Use a shared backend (Postgres + S3/GCS/Azure Blob).
- Log the **git commit + data hash** as run tags (`mlflow.set_tag`) so a metric is
  traceable to exact code and data; a run without lineage tags cannot be reproduced.

## Error Handling Idioms
```python
import mlflow
from mlflow.exceptions import MlflowException, RestException

# FOOTGUN: an uncaught exception inside `with mlflow.start_run()` leaves the run in
# state RUNNING forever (a "zombie" run) — it never transitions to FAILED. Set the
# terminal status explicitly on error so the UI and downstream queries are honest.
run = mlflow.start_run()
try:
    train_and_log(model)
    mlflow.end_run(status="FINISHED")
except Exception:
    mlflow.end_run(status="FAILED")     # mark it, do not leave it RUNNING
    raise

# Registered-model / permission failures surface as RestException, not a generic
# error — catch it to distinguish "server rejected" from "training crashed".
try:
    mlflow.register_model(info.model_uri, "prod-classifier")
except RestException as e:
    logging.error("registry rejected: %s", e)   # e.g. 403 / name collision
```

## Security and Dependency Gotchas
- **Model-load deserialization is remote code execution (CWE-502)**:
  `mlflow.<flavor>.load_model` / `mlflow.pyfunc.load_model` **unpickles** the stored
  artifact, so loading a model from an untrusted registry or artifact store runs
  arbitrary code the instant you load it. This is the real, patched CVE family
  **CVE-2024-37052 … CVE-2024-37060** (all CWE-502, "Deserialization of Untrusted
  Data") — each covers a specific flavor whose crafted artifact executes code on
  load (scikit-learn, PyTorch = CVE-2024-37059, Tensorflow, LangChain, LightGBM,
  pmdarima, PyFunc, Recipe). Only load models you produced or fully trust.
  [nvd.nist.gov CVE-2024-37052..37060 via services.nvd.nist.gov REST API;
  cve.mitre.org/cgi-bin/cvename.cgi?name=CVE-2024-37059; cwe.mitre.org/502,
  retrieved 2026-07-10]

```python
# FOOTGUN: the tracking server binds 0.0.0.0 with NO auth by default. Exposing it
# publicly lets anyone read/overwrite artifacts and register malicious models.
#   mlflow server --host 0.0.0.0 --port 5000        # OPEN TO THE INTERNET
# RIGHT: bind loopback (or a private subnet) and put auth in front.
#   mlflow server --host 127.0.0.1 --port 5000      # not publicly reachable
# MLflow ships basic auth you must ENABLE explicitly — it is off by default:
#   mlflow server --app-name basic-auth ...
```
- **Unauthenticated tracking server (CWE-306, "Missing Authentication for Critical
  Function")**: an exposed server has a long history of path-traversal / arbitrary
  file read-write advisories (e.g. CVE-2023-6018, CVE-2024-1483, CVE-2024-3573 — all
  CWE-22 path traversal) and an auth-bypass account-creation flaw (CVE-2023-6014).
  Never expose it to an untrusted network; front it with a reverse proxy + authN.
  [github.com/mlflow/mlflow/security/advisories; mlflow.org/docs/latest/auth/index.html;
  cwe.mitre.org/306; cwe.mitre.org/502, retrieved 2026-07-10]
- Keep MLflow current — historical path-traversal CVEs were fixed in specific
  releases; running an old server re-opens patched holes.

## Testing / CI Conventions
```python
import mlflow, tempfile

def test_run_logs_expected_metrics(tmp_path):
    # Point the tracking store at a temp dir — never write CI runs to a shared server.
    mlflow.set_tracking_uri(f"file:{tmp_path}")
    with mlflow.start_run() as run:
        mlflow.log_metric("accuracy", 0.9)
    client = mlflow.MlflowClient()
    data = client.get_run(run.info.run_id).data
    assert data.metrics["accuracy"] == 0.9      # assert the run actually captured it

def test_model_roundtrips(tmp_path):
    # A logged model MUST reload and predict — catches flavor/signature drift.
    mlflow.set_tracking_uri(f"file:{tmp_path}")
    with mlflow.start_run() as run:
        info = mlflow.sklearn.log_model(model, name="m")
    reloaded = mlflow.pyfunc.load_model(info.model_uri)
    assert reloaded.predict(X_test[:1]).shape[0] == 1
```

## Performance / Cost Traps
- **Per-step `log_metric` HTTP overhead**: logging every training step to a remote
  server issues one REST call per step and dominates a fast loop. Batch with
  `mlflow.log_metrics({...}, step=i)` at an interval, or log to a local store and
  sync later.
- **Artifact bloat**: `log_artifacts` on a whole checkpoint dir every epoch fills
  the artifact store fast. Log only the best checkpoint, or use the Model Registry
  with a retention policy.
- **Autolog capture cost**: framework autolog can log input examples and full model
  signatures on every run — disable `log_input_examples`/`log_models` in tight sweeps.

## Version-Specific Gotchas (dated, sourced)
- **MLflow 3.14.0** is the current stable release, uploaded **2026-06-17**,
  `requires_python >= 3.10`. [pypi.org/pypi/mlflow/json, retrieved 2026-07-10]
- **MLflow 3**: `log_model`'s positional artifact-path argument is replaced by the
  keyword `name=`; **model-registry stages** (`transition_model_version_stage`,
  Staging/Production) are deprecated in favor of **aliases** + tags.
  [mlflow.org/docs/latest/model-registry.html, retrieved 2026-07-10]
- **Tracking server**: basic auth is OFF by default and must be enabled explicitly;
  bind loopback unless fronted by an authenticating proxy.
  [mlflow.org/docs/latest/auth/index.html, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- MLflow releases (PyPI): https://pypi.org/pypi/mlflow/json
- MLflow Model Registry (aliases/stages): https://mlflow.org/docs/latest/model-registry.html
- MLflow tracking / server: https://mlflow.org/docs/latest/tracking.html
- MLflow auth (basic auth, off by default): https://mlflow.org/docs/latest/auth/index.html
- MLflow security advisories: https://github.com/mlflow/mlflow/security/advisories
- CVE-2024-37052…37060 (model-load deserialization RCE, CWE-502): https://cve.mitre.org/cgi-bin/cvename.cgi?name=CVE-2024-37059
- CWE-502 (Deserialization of Untrusted Data): https://cwe.mitre.org/data/definitions/502.html
- CWE-306 (Missing Authentication for Critical Function): https://cwe.mitre.org/data/definitions/306.html
