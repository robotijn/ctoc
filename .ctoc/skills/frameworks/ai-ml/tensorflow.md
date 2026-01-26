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
