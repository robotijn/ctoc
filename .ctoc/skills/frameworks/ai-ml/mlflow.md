# MLflow CTO
> ML lifecycle management.

## Non-Negotiables
1. Track all experiments
2. MLflow Projects for reproducibility
3. Model Registry
4. Log artifacts
5. autolog

## Pattern
```python
mlflow.autolog()
model.fit(X_train, y_train)
```
