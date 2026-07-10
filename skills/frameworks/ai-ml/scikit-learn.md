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

## Data-Leakage Footguns
Data leakage is the #1 way a scikit-learn model looks great in cross-validation
and fails in production. Any transform that **learns statistics** (scaling,
imputation, encoding, feature selection, resampling) must be fit on the TRAIN fold
ONLY — the `Pipeline` guarantees this; a manual `fit_transform` on the whole
dataset does not.

```python
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import cross_val_score, StratifiedKFold
import numpy as np

# LEAKAGE — scaler sees the WHOLE dataset (incl. the folds it will be tested on):
scaler = StandardScaler().fit(X)            # <-- leaks test-fold statistics
X_scaled = scaler.transform(X)
scores_bad = cross_val_score(LogisticRegression(), X_scaled, y, cv=5)  # optimistic

# CORRECT — put the transform INSIDE the Pipeline; cross_val_score re-fits it on
# each train fold, so no test-fold information leaks:
pipe = Pipeline([("scale", StandardScaler()),
                 ("clf", LogisticRegression(max_iter=1000))])
cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
scores = cross_val_score(pipe, X, y, cv=cv, scoring="f1_weighted")     # honest
```
- Use `ColumnTransformer` to route numeric vs categorical columns through
  different fitted transforms — still inside the `Pipeline`.
- Feature selection (`SelectKBest`) and resampling (imbalanced-learn's SMOTE)
  MUST also live inside the CV loop, or they leak the target.
- Source: scikit-learn.org common-pitfalls (data leakage). See References.

## Correctness: Stratification, Seeds & Imbalance
```python
from sklearn.model_selection import train_test_split
from sklearn.metrics import f1_score, roc_auc_score, classification_report

# Stratify preserves class proportions in each split — essential for imbalance:
X_tr, X_te, y_tr, y_te = train_test_split(
    X, y, test_size=0.2, stratify=y, random_state=42)   # random_state → repeatable

# Accuracy LIES on imbalanced data (99% negatives → 99% accuracy predicting all
# negative). Report F1 / ROC-AUC / PR-AUC and a full classification_report:
print(classification_report(y_te, model.predict(X_te)))
```
- Set `random_state` on every estimator/splitter that samples, or "improvements"
  are just RNG noise between runs.

## Error Handling Idioms
```python
# "X has N features, but Estimator is expecting M" → your inference-time columns
#   differ from fit time; a Pipeline + ColumnTransformer keeps the schema locked.
# "Found unknown categories" from OneHotEncoder → pass handle_unknown="ignore".
# ConvergenceWarning (a WARNING, therefore a BUG to fix) → raise max_iter or scale
#   features; do not silence it.
from sklearn.preprocessing import OneHotEncoder
enc = OneHotEncoder(handle_unknown="ignore")   # robust to unseen test categories
```

## Security & Dependency Gotchas
- **Model files execute code on load (CWE-502)**: `joblib.load` and
  `pickle.load` both run the Python **unpickler**, so a crafted `.joblib`/`.pkl`
  executes **arbitrary code the moment you load it**. scikit-learn's own docs
  state persisted models are only safe to load from a **source you trust** — this
  is CWE-502 "Deserialization of Untrusted Data" (cwe.mitre.org). `joblib` is
  preferred over `pickle` for **size/speed on large arrays, NOT for security** —
  both are equally unsafe on untrusted input.

```python
import joblib
# TRUSTED artifact only — this runs arbitrary code if tampered with:
model = joblib.load("model.joblib")

# For untrusted/interchange scenarios, use `skops`, which loads a restricted set
# of types and can audit an artifact before trusting it:
# from skops.io import dump, load, get_untrusted_types
# dump(model, "model.skops")
# untrusted = get_untrusted_types(file="model.skops")   # inspect BEFORE loading
# model = load("model.skops", trusted=untrusted)        # opt in explicitly
```
- **Model provenance**: pin the scikit-learn version used to fit — unpickling a
  model saved by a different version is unsupported and can silently misbehave.
- Source: cwe.mitre.org/502, scikit-learn.org model-persistence security. See References.

## Testing Conventions
```python
import numpy as np
from sklearn.utils.estimator_checks import check_estimator
from sklearn.linear_model import LogisticRegression

def test_custom_estimator_api():
    check_estimator(MyEstimator())          # enforces the sklearn estimator contract

def test_pipeline_is_deterministic():
    p1 = make_pipe(random_state=0).fit(X, y)
    p2 = make_pipe(random_state=0).fit(X, y)
    np.testing.assert_allclose(p1.predict(X), p2.predict(X))   # seeded → identical
```

## Performance Traps
- `n_jobs=-1` parallelizes across cores on many estimators / `cross_val_score` —
  but nested parallelism (grid search × a threaded estimator) can oversubscribe;
  set one level.
- `scikit-learn-intelex` (`sklearnex`) accelerates common estimators
  significantly on Intel CPUs via `patch_sklearn()`; `HistGradientBoosting*` is
  the fast, native boosted-tree path over the older `GradientBoosting*`.
- Prefer sparse matrices for high-cardinality one-hot features to avoid a dense
  memory blow-up.

## Version-Specific Gotchas (dated, sourced)
- **scikit-learn 1.9.0** is the current stable release, `requires_python >= 3.11`,
  uploaded **2026-06-02**. [pypi.org/pypi/scikit-learn JSON API, retrieved 2026-07-10]
- Unpickling a model across scikit-learn versions is **unsupported** — persist the
  training version and prefer `skops` for portable/untrusted artifacts.
  [scikit-learn.org model-persistence, retrieved 2026-07-10]
- `joblib`/`pickle` model loads are CWE-502-unsafe on untrusted input regardless
  of format. [cwe.mitre.org/502, scikit-learn.org, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- scikit-learn releases (PyPI): https://pypi.org/pypi/scikit-learn/json
- Model persistence & security: https://scikit-learn.org/stable/model_persistence.html
- Common pitfalls (data leakage): https://scikit-learn.org/stable/common_pitfalls.html
- skops (safe model serialization): https://skops.readthedocs.io/en/stable/persistence.html
- CWE-502 (Deserialization of Untrusted Data): https://cwe.mitre.org/data/definitions/502.html
