# scikit-learn CTO
> The gold standard for classical machine learning in production.

## Commands
```bash
# Setup | Dev | Test
pip install scikit-learn pandas joblib
python -c "import sklearn; sklearn.show_versions()"
pytest tests/ -v --cov=src
```

## Non-Negotiables
1. Pipelines for preprocessing + model composition
2. Cross-validation for all model evaluation
3. GridSearchCV or RandomizedSearchCV for tuning
4. Feature scaling in pipelines (not separately)
5. joblib for model persistence
6. Stratified splits for classification

## Red Lines
- Fitting scaler on test data (data leakage)
- Evaluating on training data
- Not using pipelines for preprocessing
- pickle instead of joblib for large models
- Ignoring class imbalance
- Manual train/test splits without stratification

## Pattern: Production ML Pipeline
```python
from sklearn.pipeline import Pipeline
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import cross_val_score, RandomizedSearchCV, StratifiedKFold
from sklearn.metrics import classification_report
import joblib

# Define preprocessing
numeric_features = ["age", "income", "score"]
categorical_features = ["category", "region"]

preprocessor = ColumnTransformer([
    ("num", StandardScaler(), numeric_features),
    ("cat", OneHotEncoder(handle_unknown="ignore"), categorical_features),
])

# Build pipeline
pipeline = Pipeline([
    ("preprocessor", preprocessor),
    ("classifier", RandomForestClassifier(random_state=42))
])

# Hyperparameter tuning
param_dist = {
    "classifier__n_estimators": [100, 200, 500],
    "classifier__max_depth": [10, 20, None],
    "classifier__min_samples_split": [2, 5, 10],
}

cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
search = RandomizedSearchCV(pipeline, param_dist, n_iter=20, cv=cv, scoring="f1_weighted")
search.fit(X_train, y_train)

# Evaluate
print(classification_report(y_test, search.predict(X_test)))

# Save model
joblib.dump(search.best_estimator_, "model.joblib")
```

## Integrates With
- **Data**: pandas, NumPy, polars
- **Tuning**: Optuna, Hyperopt
- **Tracking**: MLflow, W&B
- **Serving**: FastAPI, Flask, BentoML

## Common Errors
| Error | Fix |
|-------|-----|
| `NotFittedError` | Call `fit()` before `predict()` or `transform()` |
| `ValueError: Input contains NaN` | Handle missing values in preprocessing |
| `Found input variables with inconsistent numbers of samples` | Check X and y have same length |
| `ConvergenceWarning` | Increase `max_iter` or scale features |

## Prod Ready
- [ ] Pipeline includes all preprocessing steps
- [ ] Cross-validation scores reported
- [ ] Hyperparameters tuned with RandomizedSearchCV
- [ ] Model saved with joblib
- [ ] Feature names preserved in pipeline
- [ ] Class imbalance handled (SMOTE, class_weight)
