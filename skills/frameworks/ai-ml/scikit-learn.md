# scikit-learn CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
# v1.8+ requires Python 3.11-3.14
pip install scikit-learn pandas joblib
# Verify: python -c "import sklearn; sklearn.show_versions()"
# Intel acceleration: pip install scikit-learn-intelex
```

## Claude's Common Mistakes
1. Fitting scaler on test data (data leakage)
2. Not using Pipeline for preprocessing + model
3. Using pickle instead of joblib for model persistence
4. Manual train/test splits without stratification
5. Evaluating model on training data

## Correct Patterns (2026)
```python
from sklearn.pipeline import Pipeline
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import cross_val_score, RandomizedSearchCV, StratifiedKFold
import joblib

# Define preprocessing in pipeline (prevents leakage)
numeric_features = ["age", "income"]
categorical_features = ["category"]

preprocessor = ColumnTransformer([
    ("num", StandardScaler(), numeric_features),
    ("cat", OneHotEncoder(handle_unknown="ignore"), categorical_features),
])

# Pipeline ensures preprocessing fits only on training data
pipeline = Pipeline([
    ("preprocessor", preprocessor),
    ("classifier", RandomForestClassifier(random_state=42))
])

# Stratified cross-validation
cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
scores = cross_val_score(pipeline, X, y, cv=cv, scoring="f1_weighted")

# Hyperparameter tuning
search = RandomizedSearchCV(pipeline, param_distributions, cv=cv, n_iter=20)
search.fit(X_train, y_train)

# Save with joblib (not pickle)
joblib.dump(search.best_estimator_, "model.joblib")
```

## Version Gotchas
- **v1.7+**: Requires Python 3.10+
- **v1.8+**: Requires Python 3.11+, supports free-threaded CPython
- **v1.6**: Added HDBSCAN, TargetEncoder, many improvements
- **Intel**: Use `scikit-learn-intelex` for 10-100x speedup

## What NOT to Do
- Do NOT fit scaler on test data - use Pipeline
- Do NOT use pickle for models - use joblib
- Do NOT skip stratification for classification
- Do NOT evaluate on training data
- Do NOT manually preprocess outside pipeline
