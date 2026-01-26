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
