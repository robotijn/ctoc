# JAX CTO
> High-performance ML research.

## Key Insight
JAX = NumPy + Autograd + XLA

## Non-Negotiables
1. Pure functions (no side effects)
2. jit for speed
3. vmap for vectorization
4. Flax/Haiku for NNs

## Red Lines
- Side effects in jitted functions
- Not using vmap for batching
- Mutating arrays
