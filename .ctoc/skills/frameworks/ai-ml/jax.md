# JAX CTO
> High-performance numerical computing with automatic differentiation and XLA compilation.

## Commands
```bash
# Setup | Dev | Test
pip install jax jaxlib flax optax
# For GPU support
pip install jax[cuda12_pip] -f https://storage.googleapis.com/jax-releases/jax_cuda_releases.html
python -c "import jax; print(jax.devices())"
```

## Non-Negotiables
1. Pure functions with no side effects for jit
2. Use jit for performance-critical code
3. Use vmap for automatic vectorization
4. Flax or Haiku for neural network layers
5. Proper PRNG key handling
6. Pytree awareness for nested structures

## Red Lines
- Side effects inside jitted functions
- Not using vmap for batching operations
- Mutating arrays in place
- Reusing PRNG keys
- Ignoring XLA compilation overhead
- Not using donate_argnums for memory

## Pattern: Production Training Pipeline
```python
import jax
import jax.numpy as jnp
from jax import random, jit, vmap, grad
from flax import linen as nn
from flax.training import train_state
import optax

# Define model with Flax
class MLP(nn.Module):
    hidden_dim: int
    output_dim: int

    @nn.compact
    def __call__(self, x, training: bool = True):
        x = nn.Dense(self.hidden_dim)(x)
        x = nn.relu(x)
        x = nn.Dropout(0.1, deterministic=not training)(x)
        x = nn.Dense(self.output_dim)(x)
        return x

# Initialize model
key = random.PRNGKey(42)
key, init_key, dropout_key = random.split(key, 3)

model = MLP(hidden_dim=256, output_dim=10)
dummy_input = jnp.ones((1, 784))
params = model.init({"params": init_key, "dropout": dropout_key}, dummy_input)

# Create training state
tx = optax.adamw(learning_rate=1e-3)
state = train_state.TrainState.create(
    apply_fn=model.apply,
    params=params["params"],
    tx=tx,
)

# JIT-compiled training step
@jit
def train_step(state, batch, dropout_key):
    def loss_fn(params):
        logits = state.apply_fn(
            {"params": params},
            batch["image"],
            training=True,
            rngs={"dropout": dropout_key}
        )
        loss = optax.softmax_cross_entropy_with_integer_labels(
            logits, batch["label"]
        ).mean()
        return loss, logits

    grad_fn = jax.value_and_grad(loss_fn, has_aux=True)
    (loss, logits), grads = grad_fn(state.params)
    state = state.apply_gradients(grads=grads)
    return state, loss

# Vectorized inference
@jit
def batch_predict(params, images):
    return vmap(lambda x: model.apply({"params": params}, x, training=False))(images)

# Training loop
for epoch in range(num_epochs):
    for batch in dataloader:
        key, dropout_key = random.split(key)
        state, loss = train_step(state, batch, dropout_key)

# Save checkpoint
from flax.training import checkpoints
checkpoints.save_checkpoint("./checkpoints", state, step=epoch)
```

## Integrates With
- **NNs**: Flax, Haiku, Equinox
- **Optimizers**: Optax
- **Data**: TensorFlow Datasets, NumPy
- **Hardware**: TPU, GPU, CPU via XLA

## Common Errors
| Error | Fix |
|-------|-----|
| `ConcretizationTypeError` | Avoid data-dependent shapes in jit |
| `TracerArrayConversionError` | Don't convert traced values to numpy |
| `KeyReuseError` | Split PRNG keys before each use |
| `XLA compilation slow` | Cache jitted functions, use persistent compilation cache |

## Prod Ready
- [ ] All training functions jit-compiled
- [ ] vmap used for batching
- [ ] PRNG keys properly split
- [ ] Checkpoints saved with Flax
- [ ] Memory optimized with donate_argnums
- [ ] XLA compilation cache enabled
