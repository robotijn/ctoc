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

## Tracing & Purity Footguns
JAX's single biggest surprise: `jit` **traces** your function once with abstract
`Tracer` values, then caches the compiled XLA program keyed on input shape/dtype.
The Python body runs at TRACE time, not per call — so side effects and native
Python control flow are wrong or silently stale.

```python
import jax, jax.numpy as jnp
from jax import jit, lax

# FOOTGUN 1 — side effect inside jit runs ONCE at trace, never again:
@jit
def f(x):
    print("tracing", x)          # prints once (trace time), not per call
    return x * 2

# FOOTGUN 2 — Python `if` on a traced value raises
#   "TracerBoolConversionError: Attempted boolean conversion of traced array".
@jit
def g_bad(x):
    if x > 0:                    # x is a Tracer at trace time — ERROR
        return x
    return -x

@jit
def g(x):
    return lax.cond(x > 0, lambda v: v, lambda v: -v, x)   # RIGHT: data-dependent
                                                           # branch → lax.cond

# FOOTGUN 3 — Python `for` over data unrolls the loop into the graph (huge
# compile time / OOM). Use lax.scan / lax.fori_loop for a compact graph:
def cumsum(xs):
    return lax.scan(lambda c, x: (c + x, c + x), 0.0, xs)[1]

# FOOTGUN 4 — TRACER LEAK: never let a Tracer escape its trace (e.g. stashed in a
# global / captured list). "UnexpectedTracerError: Encountered an unexpected
# tracer" means a value from one jit trace was used in another context.
_leak = []
@jit
def leaky(x):
    _leak.append(x)              # leaks a Tracer — later use raises UnexpectedTracerError
    return x
```
- JAX arrays are **immutable** — use the functional `.at[]` update, never item
  assignment: `x = x.at[idx].set(v)` (NOT `x[idx] = v`).
- Source: docs.jax.dev control-flow + Common Gotchas. See References.

## PRNG & Reproducibility Footguns
JAX has **no global RNG state** — randomness is an explicit `key` you thread and
**split**. Reusing a key gives identical "random" draws; a subtle correctness bug.

```python
import jax
from jax import random

key = random.PRNGKey(0)
# WRONG — both draws are IDENTICAL (same key reused):
a = random.normal(key, (3,)); b = random.normal(key, (3,))   # a == b !!

# RIGHT — split to get independent streams; never reuse a consumed key.
# `random.split` is `jax.random.split` — it derives fresh, independent keys:
key, ka, kb = jax.random.split(key, 3)
a = random.normal(ka, (3,)); b = random.normal(kb, (3,))
```
- Fold new randomness in per step with `random.fold_in(key, step)` rather than
  re-splitting a stale key.
- Source: docs.jax.dev PRNG design. See References.

## Device, Precision & Recompilation
```python
from jax import jit
from functools import partial

# float32 is the DEFAULT even if you pass float64 — JAX silently downcasts unless
# x64 is enabled BEFORE any array is created:
import jax; jax.config.update("jax_enable_x64", True)   # must precede array use

# donate_argnums lets XLA reuse an input buffer for the output (in-place at the
# XLA level) — big memory win for optimizer state; the donated arg is INVALID
# after the call, do not read it again:
@partial(jit, donate_argnums=(0,))
def step(params, grads):
    return params - 0.1 * grads
```
- **Recompilation trap**: `jit` recompiles on every NEW shape/dtype. Feeding
  ragged/variable-length batches recompiles each step and erases the speedup —
  pad to fixed shapes, or mark axes with `jax.numpy` static shapes. Mark true
  constants `static_argnums` (they become compile-time literals).
- Source: docs.jax.dev jit + x64 docs. See References.

## Error Handling Idioms
```python
# TracerBoolConversionError → you branched on data with a Python if; use lax.cond.
# UnexpectedTracerError    → a Tracer escaped its trace; stop stashing arrays in
#                            globals/closures across jit boundaries.
# ConcretizationTypeError  → you called a concrete-only op (e.g. int(x), .item(),
#                            array shape from data) inside jit; move it outside or
#                            use static_argnums.
# NonConcreteBooleanIndexError → boolean mask indexing needs a static shape under
#                            jit; use jnp.where(mask, a, b) instead.
import jax.numpy as jnp
out = jnp.where(mask, a, b)     # jit-safe alternative to a[mask]
```
- NaNs propagate silently; set `jax.config.update("jax_debug_nans", True)` (DEV
  ONLY, slow) to raise at the op that first produced a NaN.

## Security & Dependency Gotchas
- **Checkpoint deserialization (CWE-502)**: model checkpoints saved with Python
  `pickle` (and some Orbax/Flax paths that fall back to pickle) execute
  **arbitrary code the moment they are loaded**. This is CWE-502 "Deserialization
  of Untrusted Data" (cwe.mitre.org). Never `pickle.load` / restore a checkpoint
  from an untrusted source; prefer Orbax's structured (msgpack/tensorstore)
  checkpoint format and treat any `.pkl`/`.msgpack` from outside your trust
  boundary as executable.

```python
# SAFEST for weight interchange: use a format that cannot execute code.
import jax.numpy as jnp
from safetensors.flax import save_file, load_file
save_file({"w": params["Dense_0"]["kernel"]}, "w.safetensors")
w = load_file("w.safetensors")          # no pickle, no exec
```
- **jaxlib / CUDA coupling**: `jax` and `jaxlib` are version-locked, and a
  `jax[cuda12]` wheel needs a driver new enough for that CUDA toolkit. A mismatch
  surfaces as a silent CPU fallback or an XLA init crash — check `jax.devices()`.
- Source: cwe.mitre.org/502, docs.jax.dev checkpointing. See References.

## Testing Conventions
```python
import jax, jax.numpy as jnp
from jax import random

def test_jit_matches_eager():
    x = jnp.arange(5.0)
    assert jnp.allclose(jax.jit(f)(x), f(x))      # compiled == eager

def test_reproducible_with_key():
    k = random.PRNGKey(0)
    a = random.normal(k, (4,)); b = random.normal(k, (4,))
    assert jnp.allclose(a, b)                     # SAME key → SAME draw (by design)

def test_grad_matches_numeric():
    from jax.test_util import check_grads
    check_grads(lambda z: jnp.sum(z ** 2), (jnp.arange(3.0),), order=1)
```
- Use `chex` for shape/dtype assertions and `jax.checkpoint` (rematerialization)
  tests; never hard-require a GPU in unit tests — assert on CPU-computable values.

## Performance Traps
- A per-step `.block_until_ready()` / `float(loss)` / `print(loss)` forces a
  host sync every iteration, serializing JAX's async dispatch — sync once per log
  interval.
- `vmap` beats Python batching loops; `pmap`/`shard_map` distribute across
  devices — but mixing them with data-dependent shapes triggers recompilation.
- Persist the XLA compile cache with `JAX_COMPILATION_CACHE_DIR` so process
  restarts do not re-pay compile time.

## Version-Specific Gotchas (dated, sourced)
- **JAX 0.10.2** and **jaxlib 0.10.2** are the current stable releases,
  `requires_python >= 3.11`, uploaded **2026-06-17**.
  [pypi.org/pypi/jax + pypi.org/pypi/jaxlib JSON API, retrieved 2026-07-10]
- `jax` and `jaxlib` MUST be installed at the **same version** — a skew raises an
  incompatible-plugin error at import. [docs.jax.dev installation, retrieved 2026-07-10]
- `float32` is the default dtype; `jax_enable_x64` must be set **before** any
  array is created or it is silently ignored.
  [docs.jax.dev Common Gotchas (x64), retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- JAX releases (PyPI): https://pypi.org/pypi/jax/json
- jaxlib releases (PyPI): https://pypi.org/pypi/jaxlib/json
- Control flow (lax.cond / scan): https://docs.jax.dev/en/latest/control-flow.html
- Common Gotchas (purity, x64, PRNG): https://docs.jax.dev/en/latest/notebooks/Common_Gotchas_in_JAX.html
- Orbax checkpointing: https://orbax.readthedocs.io/en/latest/
- safetensors (safe serialization): https://huggingface.co/docs/safetensors
- CWE-502 (Deserialization of Untrusted Data): https://cwe.mitre.org/data/definitions/502.html
