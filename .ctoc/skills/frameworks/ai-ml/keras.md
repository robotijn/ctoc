# Keras CTO
> High-level neural network API with multi-backend flexibility.

## Commands
```bash
# Setup | Dev | Test
pip install keras tensorflow  # or keras torch jax
python -c "import keras; print(keras.backend.backend())"
pytest tests/ -v && python -m keras.testing
```

## Non-Negotiables
1. Functional API for complex architectures
2. Keras 3 multi-backend support (TF, PyTorch, JAX)
3. Callbacks for training control and monitoring
4. `model.summary()` for architecture debugging
5. Proper input shape validation
6. `.keras` format for model saving

## Red Lines
- Sequential API for anything beyond linear stacks
- Ignoring Keras 3 backend portability
- Not using callbacks for checkpointing
- Manual training loops when `fit()` works
- Saving with legacy `.h5` format
- Skipping input shape validation

## Pattern: Production Model Architecture
```python
import keras
from keras import layers, ops

# Functional API with skip connections
inputs = keras.Input(shape=(224, 224, 3), name="image")

# Feature extraction
x = layers.Conv2D(64, 3, padding="same", activation="relu")(inputs)
x = layers.BatchNormalization()(x)
residual = x
x = layers.Conv2D(64, 3, padding="same", activation="relu")(x)
x = layers.add([x, residual])  # Skip connection

# Classification head
x = layers.GlobalAveragePooling2D()(x)
x = layers.Dropout(0.5)(x)
outputs = layers.Dense(10, activation="softmax", dtype="float32")(x)

model = keras.Model(inputs, outputs, name="classifier")

# Training with callbacks
model.compile(
    optimizer=keras.optimizers.AdamW(learning_rate=1e-3),
    loss="sparse_categorical_crossentropy",
    metrics=["accuracy"]
)

callbacks = [
    keras.callbacks.ModelCheckpoint("best.keras", save_best_only=True),
    keras.callbacks.EarlyStopping(patience=5, restore_best_weights=True),
    keras.callbacks.ReduceLROnPlateau(factor=0.5, patience=3),
    keras.callbacks.TensorBoard(log_dir="./logs"),
]

model.fit(train_ds, validation_data=val_ds, epochs=100, callbacks=callbacks)
```

## Integrates With
- **Backends**: TensorFlow, PyTorch, JAX
- **Data**: tf.data, torch DataLoader, NumPy
- **Tracking**: TensorBoard, W&B, MLflow
- **Serving**: TF Serving, ONNX, TorchScript

## Common Errors
| Error | Fix |
|-------|-----|
| `Input shape mismatch` | Verify `Input(shape=...)` matches data dimensions |
| `Layer has no attribute` | Use `layers.Layer` not raw tensors |
| `ValueError: not compatible` | Check dtype consistency, especially with mixed precision |
| `Model not built` | Call `model.build(input_shape)` or pass data first |

## Prod Ready
- [ ] Model architecture validated with `model.summary()`
- [ ] Callbacks handle checkpointing and early stopping
- [ ] Input preprocessing standardized in model
- [ ] Model exported to `.keras` format
- [ ] Backend-agnostic code for portability
- [ ] Mixed precision enabled for GPU training
