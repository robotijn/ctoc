# TensorFlow CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
# TensorFlow 2.20+ requires Python 3.11+. Do NOT use conda.
pip install tensorflow[and-cuda]  # GPU support included
# Verify: python -c "import tensorflow as tf; print(tf.config.list_physical_devices('GPU'))"
```

## Claude's Common Mistakes
1. Suggesting `from tensorflow.keras import` - Keras 3 is standalone now
2. Using deprecated `tf.lite` - migrated to LiteRT (separate package)
3. Recommending `tf_keras` when project uses Keras 3
4. Missing memory growth config causing OOM on first run
5. Using `model.fit()` without `tf.data` pipeline optimization

## Correct Patterns (2026)
```python
import tensorflow as tf
import keras  # Keras 3 is standalone

# Enable memory growth BEFORE any TF operations
gpus = tf.config.list_physical_devices('GPU')
for gpu in gpus:
    tf.config.experimental.set_memory_growth(gpu, True)

# Mixed precision for efficiency
keras.mixed_precision.set_global_policy("mixed_float16")

# Optimized data pipeline
dataset = tf.data.Dataset.from_tensor_slices((x, y))
dataset = dataset.shuffle(10000).batch(32).prefetch(tf.data.AUTOTUNE)

# Export for serving (new API)
model.export("saved_model/")
```

## Version Gotchas
- **v2.20**: `tf.lite` deprecated - use LiteRT package instead
- **v2.16+**: `pip install tensorflow` installs Keras 3 by default
- **Keras 3.13+**: Requires Python 3.11+
- **Legacy**: Use `pip install tf_keras` for Keras 2 compatibility

## What NOT to Do
- Do NOT use `from tensorflow.keras` - import `keras` directly
- Do NOT install TensorFlow with conda (outdated versions)
- Do NOT skip memory growth config on GPU systems
- Do NOT use eager execution in production inference
- Do NOT ignore XLA compilation for TPU/GPU performance

## Eager vs Graph Mode & `@tf.function` Retracing
TF2 runs **eagerly** by default (ops execute immediately, Python `print` works,
debuggers step line-by-line). `@tf.function` **traces** the Python function once
into a static graph, then reuses it. The two modes diverge in ways that produce
silent, hard-to-find bugs.

```python
import tensorflow as tf

@tf.function
def step(x):
    print("tracing")                  # runs ONLY during tracing, not each call
    tf.print("executing", x)          # use tf.print for in-graph output
    return x * 2

step(tf.constant(1.0))   # prints "tracing" then "executing 1"
step(tf.constant(2.0))   # prints only "executing 2" — graph reused
```

**Retracing** is the classic performance cliff — each retrace re-compiles the
graph (slow) and can blow up memory:
- Passing **Python scalars/lists** (not `tf.Tensor`) makes every distinct value a
  new signature → a fresh trace per call. Pass tensors, or pin
  `input_signature=[tf.TensorSpec(...)]` to force one graph.
- **Variable input shapes** retrace per shape — bucket/pad to fixed shapes, or use
  `tf.TensorSpec(shape=[None, ...])` for a dynamic dim.
- Python-side **control flow / side effects** (appending to a list, mutating a
  global) run only at trace time — the graph freezes the first path taken. Use
  `tf.cond` / `tf.while_loop` for data-dependent branching inside the graph.
- TF warns after repeated retraces ("... has been traced N times ..."). Treat that
  warning as a bug, not noise.
- Source: tensorflow.org tf.function guide. See References.

## Error Handling Idioms
```python
# Device placement: an op on GPU with a CPU-only tensor raises at graph build.
# Pin explicitly rather than relying on soft placement:
with tf.device("/CPU:0"):
    x = tf.constant([[1., 2.]])       # keep small host-side ops off the GPU

# OOM on first run is usually the allocator grabbing all VRAM. Enable growth
# BEFORE any op runs (once set, it cannot be changed):
try:
    for gpu in tf.config.list_physical_devices("GPU"):
        tf.config.experimental.set_memory_growth(gpu, True)
except RuntimeError as e:              # raised if devices already initialized
    print("set memory growth before using any GPU op:", e)

# Shapes are the #1 source of tf.errors.InvalidArgumentError — assert early:
tf.debugging.assert_shapes([(x, ("B", "F"))])
```

## Serialization: SavedModel vs HDF5, and Loading Security
- **SavedModel** (a *directory*: `saved_model.pb` + `variables/` + `assets/`) is
  the portable, serving-ready format — it stores the full graph and is required
  for TF Serving / `model.export()`. Prefer it.
- **HDF5** (`.h5`, single file) stores weights + config but **cannot fully
  serialize custom layers/`Lambda` logic**; reloading a model with custom code
  requires re-supplying that code (`custom_objects=...`), and mismatches fail
  silently or on first inference.

```python
model.export("saved_model/")            # SavedModel dir — serving/deploy
model.save("model.keras")               # Keras 3 native zip format (preferred)
model.save_weights("w.weights.h5")      # weights only — code not persisted
```

- **Deserialization risk (CWE-502)**: a Keras model file can carry a `Lambda`
  layer or a custom object whose code executes on load — the same
  "Deserialization of Untrusted Data" class as pickle. **Never load a model file
  from an untrusted source.** Keras 3 added `safe_mode` (default `True` on
  `load_model`) which refuses to deserialize a `Lambda`/arbitrary callable unless
  you explicitly opt in — do not set `safe_mode=False` on untrusted files.
  (CWE-502 — cwe.mitre.org.)
- Source: tensorflow.org SavedModel guide, keras.io serialization/safe_mode,
  cwe.mitre.org/502. See References.

## Testing Conventions
```python
import tensorflow as tf

def test_deterministic():
    tf.keras.utils.set_random_seed(0)   # seeds python, numpy, and tf RNGs
    tf.config.experimental.enable_op_determinism()   # error on nondeterministic ops
    # ... assert against a fixed expected value

def test_cpu_only_ci():
    # CI without a GPU must still pass — hide GPUs, do not hard-require them:
    tf.config.set_visible_devices([], "GPU")
    assert model(tf.zeros((1, 8))).shape == (1, 3)

def test_traces_once():
    # guard against accidental retracing regressions
    fn = tf.function(step).get_concrete_function(tf.TensorSpec([None], tf.float32))
    assert fn is not None
```

## Performance Traps
- **Eager in a hot loop**: running per-step Python eagerly leaves the GPU idle
  between ops. Wrap the training step in `@tf.function` so it fuses into one graph.
- **`tf.data` starvation**: without `.prefetch(tf.data.AUTOTUNE)` the accelerator
  waits on the CPU input pipeline. Also `.cache()` after expensive maps, and
  `num_parallel_calls=tf.data.AUTOTUNE` on `.map`.
- **XLA (`jit_compile=True`)** fuses ops for big GPU/TPU speedups — but it
  retraces per input shape, so it fights variable-length data; pad to buckets.
- Mixed precision (`mixed_float16`) needs a `LossScaleOptimizer` (Keras wires this
  automatically via the global policy) or fp16 gradients underflow.

## Version-Specific Gotchas (dated, sourced)
- **TensorFlow 2.21.0** is the current stable release, uploaded **2026-03-06**,
  `requires_python >= 3.10`. [pypi.org/project/tensorflow, retrieved 2026-07-09]
- **2.16+**: `pip install tensorflow` installs **Keras 3** as the default backend;
  `from tensorflow.keras import ...` now resolves to Keras 3, which changed some
  serialization and multi-backend behavior. Pin `pip install tf_keras` and set
  `TF_USE_LEGACY_KERAS=1` only if you truly need Keras 2.
  [tensorflow.org Keras 3 migration, retrieved 2026-07-09]
- **Keras 3.15.0** current, `requires_python >= 3.11`; the native `.keras` zip
  format supersedes `.h5`. [pypi.org/project/keras, retrieved 2026-07-09]

## References (retrieved 2026-07-09)
- TensorFlow releases (PyPI): https://pypi.org/project/tensorflow/
- Keras releases (PyPI): https://pypi.org/project/keras/
- tf.function (graph mode / retracing): https://www.tensorflow.org/guide/function
- SavedModel format: https://www.tensorflow.org/guide/saved_model
- Keras 3 migration: https://keras.io/guides/migrating_to_keras_3/
- Keras serialization / safe_mode: https://keras.io/api/models/model_saving_apis/
- CWE-502 (Deserialization of Untrusted Data): https://cwe.mitre.org/data/definitions/502.html
