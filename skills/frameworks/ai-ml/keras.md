# Keras CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
# Keras 3 is multi-backend. Requires Python 3.11+
pip install keras tensorflow  # TensorFlow backend (default)
# Or: pip install keras torch   # PyTorch backend
# Or: pip install keras jax     # JAX backend
# Set backend: export KERAS_BACKEND="torch"
```

## Claude's Common Mistakes
1. Using `from tensorflow.keras` instead of standalone `import keras`
2. Saving models as `.h5` instead of `.keras` format
3. Not setting backend before importing keras
4. Using Sequential API for complex architectures
5. Missing dtype="float32" on output layer with mixed precision

## Correct Patterns (2026)
```python
import os
os.environ["KERAS_BACKEND"] = "torch"  # Set BEFORE import
import keras
from keras import layers, ops

# Check backend
print(f"Backend: {keras.backend.backend()}")

# Functional API with skip connections
inputs = keras.Input(shape=(224, 224, 3))
x = layers.Conv2D(64, 3, padding="same", activation="relu")(inputs)
x = layers.BatchNormalization()(x)
residual = x
x = layers.Conv2D(64, 3, padding="same", activation="relu")(x)
x = layers.add([x, residual])  # Skip connection
x = layers.GlobalAveragePooling2D()(x)
outputs = layers.Dense(10, activation="softmax", dtype="float32")(x)  # fp32 output

model = keras.Model(inputs, outputs)

# Training with callbacks
model.compile(optimizer="adamw", loss="sparse_categorical_crossentropy")
model.fit(train_ds, callbacks=[
    keras.callbacks.ModelCheckpoint("best.keras", save_best_only=True),
    keras.callbacks.EarlyStopping(patience=5),
])
```

## Version Gotchas
- **Keras 3.13+**: Requires Python 3.11+
- **TF 2.16+**: `pip install tensorflow` installs Keras 3 automatically
- **Backend**: Must set `KERAS_BACKEND` env var before import
- **Legacy**: Use `pip install tf_keras` for Keras 2 compatibility

## What NOT to Do
- Do NOT use `from tensorflow.keras` - import `keras` directly
- Do NOT save as `.h5` - use `.keras` format
- Do NOT set backend after importing keras
- Do NOT use Sequential for non-linear architectures
- Do NOT forget dtype="float32" on output with mixed precision

## Backend & Serialization Footguns
Keras 3 is **multi-backend** (TensorFlow / PyTorch / JAX). The backend is fixed at
import from `KERAS_BACKEND` (or `~/.keras/keras.json`) and **cannot be switched
after import** — set it first, at the top of the entry module, before any code
imports `keras` transitively.

```python
import os
os.environ["KERAS_BACKEND"] = "jax"    # MUST precede the first `import keras`
import keras
assert keras.backend.backend() == "jax"

# FOOTGUN — a SUBCLASSED model needs get_config()/from_config() to round-trip;
# without them, `.keras` save works but LOAD fails to reconstruct the graph:
@keras.saving.register_keras_serializable()      # register so load can find it
class MyModel(keras.Model):
    def __init__(self, units=32, **kw):
        super().__init__(**kw); self.d = keras.layers.Dense(units); self.units = units
    def call(self, x): return self.d(x)
    def get_config(self):                          # REQUIRED for subclassed load
        return {**super().get_config(), "units": self.units}

# Custom objects must be provided (or registered) at load time:
model = keras.models.load_model(
    "m.keras",
    custom_objects={"MyModel": MyModel},           # or use the decorator above
)
```
- Functional/Sequential models serialize their full config automatically;
  subclassed models do NOT unless you implement `get_config`.
- Source: keras.io serialization + config docs. See References.

## Training & Mixed Precision
```python
import keras
# jit_compile=True routes fit/predict through XLA on TF/JAX backends (speedup),
# but silently ignores unsupported ops — verify a step runs before a long train.
model.compile(optimizer="adamw", loss="sparse_categorical_crossentropy",
              jit_compile=True)

# Mixed precision: set the global policy, but KEEP the final layer float32 or
# softmax/logits can overflow/underflow (silent NaN loss):
keras.mixed_precision.set_global_policy("mixed_float16")
outputs = keras.layers.Dense(10, activation="softmax", dtype="float32")(x)  # fp32 head
```

## Error Handling Idioms
```python
# "Unknown layer/object: MyModel" on load_model → you did not pass custom_objects
#   or register the class; supply custom_objects={...} or the @register decorator.
# "Could not locate function ..." after a Lambda model → safe_mode blocked the
#   arbitrary-code Lambda; DO NOT pass safe_mode=False to force it on untrusted
#   files — that is the exact CVE below.
# Shape mismatch on load → the saved model's input signature differs; rebuild the
#   architecture identically before load_weights, or use the full .keras archive.
import keras
model = keras.models.load_model("m.keras")   # safe_mode defaults True on .keras
```

## Security & Dependency Gotchas
- **Untrusted-model deserialization (CWE-502)**: loading a model can execute
  attacker code. This is CWE-502 "Deserialization of Untrusted Data"
  (cwe.mitre.org). Two real, dated Keras advisories:
  - **CVE-2025-49655** — a malicious `.keras` file containing a
    `TorchModuleWrapper` runs arbitrary code on load **despite safe mode**;
    fixed in **Keras 3.11.3** (affects 3.11.0–3.11.2). [NVD, published 2025-10-17]
  - **CVE-2026-12481** — the `Lambda`-layer deserialization guard
    (`_raise_for_lambda_deserialization`) fails to enforce safe mode when
    `safe_mode=None`, enabling arbitrary code execution in **Keras 3.14.0**.
    [NVD, published 2026-07-03]
- **Legacy `.h5` and `Lambda` layers** can embed arbitrary Python. Prefer the
  `.keras` v3 archive with **`safe_mode=True` (the default)**; never load an
  untrusted model with `safe_mode=False`.

```python
# SAFE default — .keras with safe_mode on; refuses to run embedded Lambda code:
model = keras.models.load_model("trusted.keras")            # safe_mode=True
# UNSAFE on untrusted input — do NOT do this:
# model = keras.models.load_model("from_internet.keras", safe_mode=False)
```
- Source: cwe.mitre.org/502, NVD CVE-2025-49655 + CVE-2026-12481, keras.io
  model-saving docs. See References.

## Testing Conventions
```python
import numpy as np, keras

def test_save_load_roundtrip(tmp_path):
    m = keras.Sequential([keras.layers.Dense(4, input_shape=(3,))])
    p = tmp_path / "m.keras"; m.save(p)
    m2 = keras.models.load_model(p)                 # safe_mode default
    x = np.zeros((1, 3), dtype="float32")
    np.testing.assert_allclose(m(x), m2(x))         # identical outputs

def test_backend_is_pinned():
    assert keras.backend.backend() in {"tensorflow", "torch", "jax"}
```

## Performance Traps
- `jit_compile=True` compiles once per input signature — variable batch shapes
  recompile every step. Pad/bucket to fixed shapes for the XLA path.
- Reading `.numpy()` / Python scalars from metrics inside the step forces a host
  sync; let Keras aggregate metrics and read them once per epoch.

## Version-Specific Gotchas (dated, sourced)
- **Keras 3.15.0** is the current stable release, `requires_python >= 3.11`,
  uploaded **2026-06-24**. [pypi.org/pypi/keras JSON API, retrieved 2026-07-10]
- `pip install tensorflow` (TF 2.16+) installs **Keras 3** by default; use
  `pip install tf_keras` and `TF_USE_LEGACY_KERAS=1` only if you truly need the
  Keras 2 API. [keras.io getting-started, retrieved 2026-07-10]
- The `.keras` v3 archive loads with **`safe_mode=True` by default** — but two
  bypass CVEs (above) show safe mode is not a substitute for trusting the source.
  [NVD CVE-2025-49655 / CVE-2026-12481, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- Keras releases (PyPI): https://pypi.org/pypi/keras/json
- Model saving & loading / safe_mode: https://keras.io/api/models/model_saving_apis/model_saving_and_loading/
- Serialization & custom objects: https://keras.io/guides/serialization_and_saving/
- CVE-2025-49655 (TorchModuleWrapper): https://nvd.nist.gov/vuln/detail/CVE-2025-49655
- CVE-2026-12481 (Lambda safe_mode=None): https://nvd.nist.gov/vuln/detail/CVE-2026-12481
- CWE-502 (Deserialization of Untrusted Data): https://cwe.mitre.org/data/definitions/502.html
