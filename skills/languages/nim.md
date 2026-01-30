# Nim CTO
> Claude Code correction guide. Updated January 2026.

## Critical Corrections
- Claude mixes memory management — choose ARC/ORC consistently
- Claude uses `cast[]` freely — requires strong justification
- Claude ignores effect system — use for pure function tracking
- Claude creates complex macros — keep templates/macros simple

## Current Tooling (2026)
| Tool | Use | NOT |
|------|-----|-----|
| `nim 2.x` | Latest with ORC | Older versions |
| `nimpretty` | Formatting | Manual style |
| `testament` | Testing | Ad-hoc tests |
| `nimble` | Package management | Manual deps |
| `nimsuggest` | IDE support | No completion |

## Patterns Claude Should Use
```nim
# ARC/ORC automatic memory management
proc processData(data: seq[string]): seq[string] =
  result = newSeq[string](data.len)
  for i, item in data:
    result[i] = item.toUpperAscii()

# Use Result type for errors (not exceptions)
type
  Result[T] = object
    case isOk: bool
    of true: value: T
    of false: error: string

proc divide(a, b: float): Result[float] =
  if b == 0.0:
    Result[float](isOk: false, error: "Division by zero")
  else:
    Result[float](isOk: true, value: a / b)

# Effect tracking with func (pure)
func add(a, b: int): int = a + b

# Preallocate sequences
var items = newSeqOfCap[int](1000)
for i in 0..<1000:
  items.add(i)
```

## Anti-Patterns Claude Generates
- Mixing refc and ARC/ORC — choose one memory model
- `cast[]` without justification — use conversion procs
- `proc` when `func` works — use `func` for purity
- Growing seqs in loops — use `newSeqOfCap`
- Complex macros — prefer templates for simple cases

## Version Gotchas
- **Nim 2.x**: ORC is default GC, improved stability
- **ARC vs ORC**: ORC handles cycles, ARC is faster
- **Effect system**: `func` is pure, `proc` can have side effects
- **Templates vs macros**: Templates are simpler, prefer them
- **With C**: Interop is straightforward but needs safety wrappers
