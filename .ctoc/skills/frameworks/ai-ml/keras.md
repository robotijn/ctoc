# Keras CTO
> High-level neural networks.

## Non-Negotiables
1. Functional API for complex models
2. Callbacks for training control
3. model.summary() debugging
4. Keras 3 multi-backend

## Pattern
```python
inputs = keras.Input(shape=(784,))
x = layers.Dense(64, activation="relu")(inputs)
outputs = layers.Dense(10)(x)
model = keras.Model(inputs, outputs)
```
