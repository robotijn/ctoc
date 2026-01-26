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
