# MLflow CTO
> End-to-end ML lifecycle management and model registry.

## Commands
```bash
# Setup | Dev | Test
pip install mlflow[extras]
mlflow server --host 0.0.0.0 --port 5000
mlflow ui && mlflow models serve -m "models:/model/Production" -p 8000
```

## Non-Negotiables
1. Track all experiments with autolog
2. MLflow Projects for reproducibility
3. Model Registry for versioning and staging
4. Log all artifacts (models, plots, data samples)
5. Use signatures and input examples
6. Tag runs with metadata for searchability

## Red Lines
- Manual logging when autolog works
- No model signatures for deployment
- Skipping experiment tracking
- Not using Model Registry for production
- Missing run tags and descriptions
- Hardcoded tracking URIs

## Pattern: Production Experiment Tracking
```python
import mlflow
from mlflow.models import infer_signature
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, f1_score

# Set tracking URI and experiment
mlflow.set_tracking_uri("http://mlflow-server:5000")
mlflow.set_experiment("production-classifier")

# Enable autolog for scikit-learn
mlflow.sklearn.autolog(log_input_examples=True, log_model_signatures=True)

with mlflow.start_run(run_name="rf-baseline", tags={"team": "ml", "env": "staging"}):
    # Train model
    model = RandomForestClassifier(n_estimators=100, random_state=42)
    model.fit(X_train, y_train)

    # Evaluate
    predictions = model.predict(X_test)
    mlflow.log_metrics({
        "accuracy": accuracy_score(y_test, predictions),
        "f1": f1_score(y_test, predictions, average="weighted")
    })

    # Log model with signature
    signature = infer_signature(X_train, predictions)
    mlflow.sklearn.log_model(
        model, "model",
        signature=signature,
        registered_model_name="production-classifier"
    )

    # Log artifacts
    mlflow.log_artifact("data/feature_importance.png")

# Promote to production
client = mlflow.MlflowClient()
client.transition_model_version_stage("production-classifier", version=1, stage="Production")
```

## Integrates With
- **Training**: PyTorch, TensorFlow, scikit-learn, XGBoost
- **Deployment**: Docker, Kubernetes, SageMaker, Azure ML
- **Storage**: S3, Azure Blob, GCS, local filesystem
- **CI/CD**: GitHub Actions, GitLab CI, Jenkins

## Common Errors
| Error | Fix |
|-------|-----|
| `INVALID_PARAMETER_VALUE` | Check parameter types, use correct log functions |
| `RESOURCE_DOES_NOT_EXIST` | Verify experiment/run exists, check tracking URI |
| `Model signature mismatch` | Regenerate signature with correct input schema |
| `Artifact too large` | Use artifact repository, increase storage limits |

## Prod Ready
- [ ] Tracking server deployed and accessible
- [ ] All experiments use autolog
- [ ] Model signatures logged with all models
- [ ] Model Registry configured for staging/production
- [ ] Runs tagged with searchable metadata
- [ ] Artifact storage configured for production scale
