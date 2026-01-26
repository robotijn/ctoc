# NumPy CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
pip install "numpy>=2.0"
# NumPy 2.0 has breaking changes; check compatibility
```

## Claude's Common Mistakes
1. **Python for loops over arrays** - Use vectorized operations (100-1000x faster)
2. **Implicit dtype** - Always specify dtype explicitly for precision
3. **Growing arrays dynamically** - Preallocate with np.empty or np.zeros
4. **Unnecessary copies** - Use views and in-place operations when possible
5. **Wrong broadcasting** - Misaligned dimensions cause silent bugs

## Correct Patterns (2026)
```python
import numpy as np

# Preallocate with explicit dtype
data = np.empty((1000, 1000), dtype=np.float64)

# Vectorized operations with broadcasting
x = np.linspace(0, 1, 1000)[:, np.newaxis]  # (1000, 1) column
y = np.linspace(0, 1, 1000)[np.newaxis, :]  # (1, 1000) row
grid = np.sin(x * np.pi) * np.cos(y * np.pi)  # Broadcasts to (1000, 1000)

# Views for zero-copy slicing (modifies original!)
view = data[::2, ::2]  # Every other element
view *= 2  # In-place modification

# Explicit copy when needed
safe_copy = data[::2, ::2].copy()

# Structured arrays for heterogeneous data
dt = np.dtype([('id', np.int32), ('value', np.float64)])
records = np.array([(1, 3.14), (2, 2.71)], dtype=dt)
```

## Version Gotchas
- **v2.0**: String dtype default changed; NEP 50 promotion rules
- **v2.0**: numpy.string_ renamed; many aliases removed
- **v2.0**: Copy behavior changed; copy=False stricter
- **With PyTorch/TensorFlow**: Check array contiguity for zero-copy

## What NOT to Do
- Do NOT iterate with for loops (use vectorized ops)
- Do NOT grow arrays with append/concatenate in loops
- Do NOT ignore dtype (causes precision loss or overflow)
- Do NOT assume slices are copies (they're views)
