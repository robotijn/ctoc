# scikit-learn CTO
> Traditional ML foundation.

## Non-Negotiables
1. Pipelines (preprocessing + model)
2. Cross-validation
3. GridSearchCV/RandomizedSearchCV
4. Feature scaling
5. joblib for persistence

## Pattern
```python
pipeline = Pipeline([
    ("scaler", StandardScaler()),
    ("clf", RandomForestClassifier())
])
scores = cross_val_score(pipeline, X, y, cv=5)
```
