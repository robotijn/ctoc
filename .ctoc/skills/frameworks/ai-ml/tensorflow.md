# TensorFlow CTO
> Enterprise-grade ML at scale with seamless production deployment.

## Commands
```bash
# Setup | Dev | Test
pip install tensorflow[and-cuda]
python -m tensorflow.keras.backend.clear_session && python train.py
pytest tests/ -v && python -m tf_keras.testing
```

## Non-Negotiables
1. Keras API exclusively for model building
2. `tf.data` pipelines with prefetch and caching
3. Mixed precision via `tf.keras.mixed_precision`
4. TensorBoard for training visualization
5. SavedModel format for deployment
6. `@tf.function` for graph execution

## Red Lines
- TensorFlow 1.x style session-based code
- Manual training loops when `model.fit()` suffices
- Not using `tf.function` for performance-critical paths
- Eager execution in production inference
- Ignoring XLA compilation for TPU/GPU
- Raw NumPy arrays instead of `tf.data.Dataset`

## Pattern: Production Training Pipeline
```python
import tensorflow as tf

# Enable mixed precision
tf.keras.mixed_precision.set_global_policy("mixed_float16")

# Build model with Functional API
inputs = tf.keras.Input(shape=(224, 224, 3))
x = tf.keras.applications.EfficientNetV2B0(include_top=False)(inputs)
x = tf.keras.layers.GlobalAveragePooling2D()(x)
outputs = tf.keras.layers.Dense(10, dtype="float32")(x)
model = tf.keras.Model(inputs, outputs)

# Optimized data pipeline
dataset = tf.data.Dataset.from_tensor_slices((x_train, y_train))
dataset = dataset.shuffle(10000).batch(32).prefetch(tf.data.AUTOTUNE)

# Train with callbacks
model.compile(optimizer="adamw", loss="sparse_categorical_crossentropy")
model.fit(dataset, epochs=10, callbacks=[
    tf.keras.callbacks.TensorBoard(log_dir="./logs"),
    tf.keras.callbacks.ModelCheckpoint("model.keras", save_best_only=True),
    tf.keras.callbacks.EarlyStopping(patience=3),
])

# Export for serving
model.export("saved_model/")
```

## Integrates With
- **Serving**: TF Serving, TFLite, TensorFlow.js
- **Data**: tf.data, TFRecord, BigQuery
- **Tracking**: TensorBoard, Vertex AI
- **Hardware**: TPU, GPU via XLA

## Common Errors
| Error | Fix |
|-------|-----|
| `OOM when allocating tensor` | Enable memory growth: `tf.config.experimental.set_memory_growth(gpu, True)` |
| `Graph execution error` | Debug with `tf.config.run_functions_eagerly(True)` |
| `InvalidArgumentError: incompatible shapes` | Check input shapes with `model.summary()` |
| `Could not load dynamic library` | Verify CUDA/cuDNN versions match TF requirements |

## Prod Ready
- [ ] Model saved as SavedModel with signatures
- [ ] tf.data pipeline uses prefetch and cache
- [ ] Mixed precision enabled for GPU training
- [ ] XLA compilation enabled for TPU deployment
- [ ] Model versioned with SavedModel metadata
- [ ] TFLite conversion tested for mobile deployment
