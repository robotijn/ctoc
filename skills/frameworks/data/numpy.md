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

## Broadcasting Surprises (silent shape bugs)
Broadcasting is numpy's most powerful — and most dangerous — feature: shapes that
you did **not** intend to combine will often broadcast *successfully*, producing a
larger array full of wrong numbers instead of an error.

```python
import numpy as np

# FOOTGUN: a (3,) row and a (3,1) column broadcast to (3,3) — an outer product,
# not the elementwise sum you wanted. No error is raised.
a = np.array([1, 2, 3])          # shape (3,)
b = np.array([[10], [20], [30]]) # shape (3,1)
a + b                            # shape (3,3) — SILENT unintended outer combination

# RIGHT: assert the shape you expect so a mismatch fails loudly
assert a.shape == b.reshape(-1).shape, (a.shape, b.shape)
result = a + b.reshape(-1)       # (3,) as intended

# FOOTGUN: trailing-dim alignment — (100, 3) + (100,) FAILS, but (100, 3) + (3,)
# works. Add np.newaxis deliberately rather than relying on accidental alignment.
m = np.zeros((100, 3))
col = np.arange(100)
m + col[:, np.newaxis]           # RIGHT: explicit (100,1) broadcasts down columns
```
- The rule: **make the broadcast explicit** with `reshape`/`np.newaxis`, and
  `assert arr.shape == (...)` at function boundaries. A "wrong result, no error" is
  far worse than a crash. [numpy.org broadcasting basics, retrieved 2026-07-09]

## View-vs-Copy Aliasing
```python
# FOOTGUN: a basic slice is a VIEW — mutating it mutates the parent's memory
base = np.arange(12).reshape(3, 4)
sub = base[:, 1:3]      # view, shares buffer with `base`
sub *= 0                # base's columns 1..2 are now zero too — action at a distance

# RIGHT: take an explicit copy when you need an independent array
sub = base[:, 1:3].copy()

# Basic (slice) indexing -> VIEW; fancy (integer/boolean) indexing -> COPY.
v = base[base > 5]      # boolean mask -> COPY; writing to `v` does NOT touch base
np.may_share_memory(base, sub)   # inspect whether two arrays alias
```
- `arr.base is not None` and `np.may_share_memory(a, b)` reveal aliasing. The trap
  is asymmetric: **basic slicing returns a view, fancy indexing returns a copy** —
  so `arr[1:3] = 0` writes through but `arr[[1,2]] = 0` may not, depending on
  how the result is used. When in doubt, `.copy()`.
  [numpy.org copies-and-views basics, retrieved 2026-07-09]

## Integer Overflow & In-Place ufunc Traps
```python
# FOOTGUN: fixed-width C dtypes WRAP AROUND — no Python big-int promotion
x = np.array([2_000_000_000], dtype=np.int32)
x + x                    # -294967296  (silent 32-bit overflow, not 4e9)

# RIGHT: choose a wide enough dtype up front, or promote deliberately
x.astype(np.int64) + x.astype(np.int64)

# FOOTGUN: in-place op with out= into the WRONG dtype truncates/rounds silently
a = np.array([1.0, 2.5, 3.9])
out = np.empty(3, dtype=np.int64)
np.multiply(a, 2, out=out)       # writes floats INTO an int buffer -> truncated to ints

# FOOTGUN: casting kwarg — an unsafe cast in-place corrupts data without warning
np.add(a, 1, out=a, casting="unsafe")   # be explicit; default 'same_kind' guards you
```
- C-backed integer arrays have **no overflow check** — a sum/product that exceeds
  the dtype range wraps modulo 2^n and yields a plausible-looking wrong number.
  Size the dtype for the *result*, not the inputs. `out=` reuses a buffer to avoid
  allocation, but silently obeys that buffer's dtype — mismatch = silent truncation.

## Error Handling
```python
import numpy as np

# FOOTGUN: floating-point warnings are SILENT by default (divide-by-zero -> inf/nan)
np.seterr(all="raise")           # turn invalid/divide/overflow/underflow into exceptions
try:
    result = a / b               # raises FloatingPointError on a zero divisor now
except FloatingPointError:
    result = np.where(b != 0, a / b, 0.0)   # explicit, defined fallback

# Scoped variant when you only want strict checking around one block
with np.errstate(divide="raise", invalid="raise"):
    z = np.log(x)                # raises instead of producing -inf / nan quietly
```
- numpy does **not** raise on `1/0`, `sqrt(-1)`, or overflow by default — it emits a
  `RuntimeWarning` (often unseen) and yields `inf`/`nan` that then poison every
  downstream computation. Use `np.seterr` / `np.errstate` to make numeric faults
  loud at the boundary you care about. [numpy.org error-handling reference,
  retrieved 2026-07-09]

## Testing (float compares)
```python
import numpy as np

# FOOTGUN: `==` on floats fails on rounding — 0.1 + 0.2 != 0.3
assert np.array_equal(a, b)                       # exact; only for integer/bool arrays

# RIGHT: tolerance-based comparison for floating point
np.testing.assert_allclose(a, b, rtol=1e-7, atol=0)   # float-safe, prints a clear diff
np.testing.assert_array_equal(idx_a, idx_b)           # exact, for integer index arrays

# NaN-aware: `==` never matches NaN; assert_allclose(equal_nan=True) treats NaN==NaN
np.testing.assert_allclose(a, b, equal_nan=True)
```
- Never assert float equality with `==` or `array_equal` — use
  `np.testing.assert_allclose` with explicit `rtol`/`atol`. `assert_array_equal` is
  for exact (integer/index/boolean) arrays only.

## Performance Traps
- **Vectorize** — a numpy expression over a whole array is 100–1000× a Python
  `for` loop; every explicit element loop is a red flag.
- **Preallocate** — `np.empty((n, m), dtype=...)` once, then fill; growing with
  `np.append`/`np.concatenate` in a loop reallocates and copies every iteration
  (quadratic).
- **`out=`** reuses an existing buffer to avoid a fresh allocation in hot loops;
  **contiguity** (`np.ascontiguousarray`) matters for zero-copy hand-off to
  PyTorch/TensorFlow. Pick the narrowest correct dtype — `float32` halves memory and
  bandwidth versus `float64` when the precision is acceptable.

## Version-Specific Gotchas (dated, sourced)
- **numpy 2.5.1** is the current stable release, uploaded **2026-07-04**,
  `requires_python >= 3.12`. [pypi.org/project/numpy JSON API, retrieved 2026-07-09]
- **numpy 2.0 — NEP 50 scalar promotion**: mixing a Python scalar or a differently
  typed scalar with an array now follows **value-independent** rules that can change
  results and **dtypes silently** versus the pre-2.0 behavior. E.g. adding a large
  Python int to a low-precision array no longer up-promotes the whole array the way
  it used to; low-precision results can now overflow where they previously widened.
  Audit dtype-sensitive numeric code when moving to 2.x. [numpy.org/neps
  NEP 50 (scalar promotion) + 2.0 migration guide, retrieved 2026-07-09]
- **numpy 2.0**: many legacy aliases were removed (`np.float_`, `np.string_`,
  `np.NaN`, etc.) and `copy=False` in `np.array` is now **strict** (raises if a copy
  is unavoidable) — use `np.asarray` when a copy-if-needed is acceptable.
  [numpy.org 2.0 migration guide, retrieved 2026-07-09]

## References (retrieved 2026-07-09)
- numpy releases (PyPI JSON): https://pypi.org/pypi/numpy/json
- Broadcasting basics: https://numpy.org/doc/stable/user/basics.broadcasting.html
- Copies and views: https://numpy.org/doc/stable/user/basics.copies.html
- NEP 50 (scalar promotion): https://numpy.org/neps/nep-0050-scalar-promotion.html
- numpy 2.0 migration guide: https://numpy.org/doc/stable/numpy_2_0_migration_guide.html
- Testing (assert_allclose): https://numpy.org/doc/stable/reference/routines.testing.html
