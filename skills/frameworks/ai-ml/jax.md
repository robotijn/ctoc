# JAX CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
# v0.9+ requires Python 3.11+ (minimum until July 2026)
pip install jax jaxlib flax optax
# GPU (CUDA): pip install jax[cuda12]
# TPU: pip install jax[tpu] -f https://storage.googleapis.com/jax-releases/libtpu_releases.html
# Verify: python -c "import jax; print(jax.devices())"
```

## Claude's Common Mistakes
1. Side effects inside jitted functions
2. Not using vmap for batching (manual loops slow)
3. Mutating arrays in place (JAX arrays immutable)
4. Reusing PRNG keys (causes repeated randomness)
5. Ignoring XLA compilation overhead for small functions

## Correct Patterns (2026)
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
        return nn.Dense(self.output_dim)(x)

# Initialize with PRNG key management
key = random.PRNGKey(42)
key, init_key, dropout_key = random.split(key, 3)  # ALWAYS split before use

model = MLP(hidden_dim=256, output_dim=10)
params = model.init({"params": init_key, "dropout": dropout_key}, jnp.ones((1, 784)))

# Create training state
state = train_state.TrainState.create(
    apply_fn=model.apply,
    params=params["params"],
    tx=optax.adamw(learning_rate=1e-3),
)

# JIT-compiled training step (PURE function, no side effects)
@jit
def train_step(state, batch, dropout_key):
    def loss_fn(params):
        logits = state.apply_fn({"params": params}, batch["x"], training=True, rngs={"dropout": dropout_key})
        return optax.softmax_cross_entropy_with_integer_labels(logits, batch["y"]).mean()

    loss, grads = jax.value_and_grad(loss_fn)(state.params)
    return state.apply_gradients(grads=grads), loss

# Vectorized inference with vmap
@jit
def batch_predict(params, images):
    return vmap(lambda x: model.apply({"params": params}, x, training=False))(images)
```

## Version Gotchas
- **v0.9+**: Python 3.11 minimum required
- **PRNG keys**: MUST split before each use, never reuse
- **Pure functions**: No side effects in jitted functions
- **XLA cache**: Use `JAX_COMPILATION_CACHE_DIR` for persistence

## What NOT to Do
- Do NOT use side effects in jitted functions
- Do NOT reuse PRNG keys - always split
- Do NOT mutate arrays - JAX arrays are immutable
- Do NOT skip vmap for batching (manual loops slow)
- Do NOT ignore XLA compilation cache for production
