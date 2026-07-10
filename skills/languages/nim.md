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

## Memory / GC Footguns
Nim 2.x defaults to **ORC** (`--mm:orc`) — ARC (reference counting) **plus** a
cycle collector. Claude routinely mixes memory models or reaches for `--mm:none`
without understanding the consequences.

```nim
# FOOTGUN 1: mixing memory models across compilation. --mm is a WHOLE-PROGRAM
# choice — you cannot compile one module refc and another orc and link them.
# Pick ONE (orc is the 2.x default) and keep it consistent everywhere.

# FOOTGUN 2: --mm:none = manual memory. `ref` objects are no longer freed for
# you; you own alloc/dealloc. Dangling refs become use-after-free (CWE-416).

# SAFE: let ORC manage cycles; use `sink`/move to avoid copies, not manual free.
proc take(s: sink string): string = s   # takes ownership, no copy
```
- **ORC vs ARC**: ARC alone **leaks reference cycles** (a graph that points back
  at itself). ORC adds cycle collection — that is why it is the 2.x default.
  Choosing `--mm:arc` for speed silently reintroduces cycle leaks.
- **Dangling refs across FFI**: a Nim `ref`/`seq`/`string` passed to C and held
  past the Nim object's lifetime is a **use-after-free (CWE-416)** — GC.ref /
  keep-alive the object or copy into C-owned memory.
- Source: nim-lang.org "Nim's memory management" (`--mm:orc`/`arc`/`none`);
  cwe.mitre.org/data/definitions/416.html. See References.

## Concurrency Footguns
```nim
# Threads must be GC-safe: a proc run on another thread may not touch shared
# GC'd heap without {.gcsafe.}. The compiler enforces this — do not silence it
# by slapping {.gcsafe.} on a proc that actually IS unsafe.
proc worker() {.thread, gcsafe.} =
  discard

# Prefer Channel (typed message passing) over shared mutable globals.
var chan: Channel[int]
chan.open()
```
- Compile threaded code with `--threads:on`. Sharing mutable GC'd data between
  threads without isolation is a data race — use `Channel`, `isolate`, or copy.
- `{.gcsafe.}` is a **promise to the compiler**; an incorrect one reintroduces
  the exact race the effect system is trying to prevent.
- Source: nim-lang.org manual (threads / channels). See References.

## Error Handling Idioms
Nim uses exceptions, but the **effect system** lets you prove a proc raises
nothing — enforce it rather than hoping.
```nim
# {.raises: [].} — compile ERROR if this proc can raise anything.
proc parse(s: string): int {.raises: [ValueError].} =
  parseInt(s)   # ValueError is declared; anything else fails to compile

func pure(a, b: int): int = a + b   # `func` = no side effects, cannot raise

# defer for cleanup on any exit
proc withFile(p: string) =
  let f = open(p)
  defer: f.close()
```
- Annotate public procs with `{.raises: [...].}`; an empty `{.raises: [].}` is
  the strongest contract. Do not swallow exceptions with a bare `except:`.

## Security and Dependency Gotchas
- **Compile-time code execution**: Nim **templates and macros run at compile
  time** and can execute arbitrary Nim (including, with `--experimental` /
  `staticExec`, shelling out). Never compile untrusted Nim source or untrusted
  macros — compilation is code execution.
- **C FFI inherits C's memory-safety CWE classes**: `importc`/`emit` and raw
  `ptr`/`addr` bypass Nim's safety — use-after-free (**CWE-416**) and buffer
  overflow (**CWE-787**) live at the FFI boundary. Keep the unsafe surface tiny
  and wrap it in a safe Nim API.
- **Dependencies**: nimble supports a **lock file** (`nimble lock` →
  `nimble.lock`) — commit it so builds are reproducible and a compromised
  upstream tag cannot silently change your dependency tree.
- Source: cwe.mitre.org/data/definitions/416.html, /787.html; nim-lang.org
  nimble lock docs. See References.

## Testing Conventions
```nim
import unittest

suite "math":
  test "adds":
    check add(2, 3) == 5
  test "raises on bad input":
    expect(ValueError): discard parse("x")   # assert the error path
```
- Use the stdlib `unittest` module (`suite`/`test`/`check`); the compiler's own
  test suite runs via **`testament`**. `check` reports the failing expression,
  unlike a bare `assert`.

## Performance Traps
- **Implicit copies**: assigning a `seq`/`string`/`ref` may copy. Use `sink`
  parameters and `lent`/move semantics (2.x) to pass ownership without copying;
  a hot loop that copies a large `seq` each iteration is a silent O(n²).
- **`seq` reallocation**: growing a `seq` in a loop reallocates — preallocate
  with `newSeqOfCap[T](n)`.
- **Bounds checks**: on by default. `--boundChecks:off` (release only, measured)
  removes them — but then an out-of-range index is UB (**CWE-787**), so only do
  it on code you have proven safe.

## Version-Specific Gotchas (dated, sourced)
- **Nim 2.x makes ORC the default `--mm`** (was refc in 1.x); latest stable in
  the 2.2 line is **2.2.10**. Code that relied on the old refc GC (finalizer
  timing, cycle behavior) can behave differently under ORC.
  [nim-lang.org/install.html, retrieved 2026-07-10]
- **1.6 → 2.x** also changed default `--mm` and tightened the effect system —
  `{.raises.}` violations that were warnings can now be errors. Read the 2.0
  release notes before upgrading a 1.6 codebase.
  [nim-lang.org/blog.html (2.0.0 release), retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- Nim install / current version: https://nim-lang.org/install.html
- Nim blog / release notes: https://nim-lang.org/blog.html
- Nim manual (memory management, threads, effects): https://nim-lang.org/docs/manual.html
- CWE-416 (Use After Free): https://cwe.mitre.org/data/definitions/416.html
- CWE-787 (Out-of-bounds Write): https://cwe.mitre.org/data/definitions/787.html
