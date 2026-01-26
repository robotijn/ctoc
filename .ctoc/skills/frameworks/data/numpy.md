# NumPy CTO
> The foundation of scientific computing in Python.

## Commands
```bash
# Setup | Dev | Test
pip install numpy
python -c "import numpy as np; np.show_config()"
pytest tests/ -v --tb=short
```

## Non-Negotiables
1. Vectorized operations over Python loops (100-1000x faster)
2. Broadcasting for memory-efficient element-wise operations
3. Explicit dtype specification for numerical precision
4. Preallocate arrays instead of growing dynamically
5. Use views over copies when possible
6. Contiguous memory layouts (C or Fortran order) for performance

## Red Lines
- Python `for` loops iterating over array elements
- Wrong dtype causing precision loss or overflow
- Unnecessary copies wasting memory
- Ignoring memory layout for numerical libraries
- Using Python lists for numerical computation

## Pattern: Efficient Array Operations
```python
import numpy as np

# Preallocate with explicit dtype
data = np.empty((1000, 1000), dtype=np.float64)

# Vectorized operations with broadcasting
x = np.linspace(0, 1, 1000)[:, np.newaxis]  # Column vector
y = np.linspace(0, 1, 1000)[np.newaxis, :]  # Row vector
grid = np.sin(x * np.pi) * np.cos(y * np.pi)  # Broadcasts to (1000, 1000)

# Views for zero-copy slicing
view = data[::2, ::2]  # Every other element, no copy
view *= 2  # Modifies original

# Structured arrays for heterogeneous data
dt = np.dtype([('id', np.int32), ('value', np.float64)])
records = np.array([(1, 3.14), (2, 2.71)], dtype=dt)
```

## Integrates With
- **SciPy**: Statistical and scientific functions
- **scikit-learn**: ML with `.values` arrays
- **PyTorch/TensorFlow**: Tensor conversion via `np.array()`

## Common Errors
| Error | Fix |
|-------|-----|
| `ValueError: broadcast shapes` | Align dimensions with `reshape` or `newaxis` |
| `MemoryError` on large arrays | Use `np.memmap` or chunked processing |
| `RuntimeWarning: overflow` | Use larger dtype (float32 -> float64) |
| `IndexError: too many indices` | Check array dimensions with `.shape` |

## Prod Ready
- [ ] Explicit dtypes on all array creation
- [ ] Memory profiling for large operations
- [ ] Vectorized code verified with no Python loops
- [ ] Contiguous arrays for external library calls
- [ ] Overflow/underflow handling validated
