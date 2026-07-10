# D CTO
> Claude Code correction guide. Updated January 2026.

## Critical Corrections
- Claude uses @trusted carelessly — requires careful security review
- Claude ignores @safe — use @safe by default
- Claude forgets scope guards — use `scope(exit)` for cleanup
- Claude allocates in hot paths — profile GC impact first

## Current Tooling (2026)
| Tool | Use | NOT |
|------|-----|-----|
| `ldc` | LLVM-based (optimized) | DMD for production |
| `dmd` | Reference compiler | Only for dev |
| `dub` | Package manager/build | Manual compilation |
| `d-scanner` | Static analysis | No linting |
| `dfmt` | Code formatting | Manual style |

## Patterns Claude Should Use
```d
import std.algorithm : map, filter;
import std.range : iota;

// @safe by default
@safe:

struct User {
    string name;
    int age;
}

// RAII with scope guards
void processFile(string path) {
    auto file = File(path, "r");
    scope(exit) file.close();  // Guaranteed cleanup

    foreach (line; file.byLine) {
        process(line);
    }
}

// Ranges over raw pointers
auto processUsers(User[] users) {
    return users
        .filter!(u => u.age >= 18)
        .map!(u => u.name);
}

// @nogc for hot paths (after profiling)
@nogc pure nothrow
int fastCompute(int x) {
    return x * x + 1;
}

// Template constraints
T add(T)(T a, T b) if (is(typeof(a + b) : T)) {
    return a + b;
}
```

## Anti-Patterns Claude Generates
- @trusted without review — use @safe, mark @trusted carefully
- Raw pointers in @safe — use slices and ranges
- GC in hot paths (unverified) — profile first
- Missing scope guards — use `scope(exit)` for cleanup
- Unconstrained templates — add template constraints

## Version Gotchas
- **LDC**: Use for production builds (optimized)
- **@safe**: Default for new code, audit @trusted
- **GC**: Avoid in hot paths, use @nogc if needed
- **Ranges**: Idiomatic D, prefer over manual loops
- **With C**: Easy interop via extern(C)

## Memory / GC Footguns
D is **garbage-collected by default**, but ships `@nogc` and `-betterC` for
GC-free code and the `@safe`/`@trusted`/`@system` attributes to gate memory
safety. Claude mixes these carelessly.

```d
// The three memory-safety attributes:
@safe    void s() { ... }   // compiler-checked: no raw pointer arithmetic, etc.
@trusted void t() { ... }   // YOU promise it's safe — audit EVERY line
@system  void y() { ... }   // unchecked (the default for un-annotated code)

// @nogc: no GC allocation allowed here (compile error if you try).
@nogc pure nothrow int hot(int x) => x * x + 1;

// FOOTGUN: manual malloc/free interop leaks or double-frees if an exception
// unwinds past the free. Pair it with scope(exit).
import core.stdc.stdlib : malloc, free;
auto p = malloc(n);
scope(exit) free(p);   // freed on every exit path, including throw
```
- **`@trusted` is the escape hatch that eats safety**: a `@safe` function may call
  `@trusted`, so one wrong `@trusted` line silently makes the whole call tree
  unsafe. Mark the *smallest possible* block `@trusted`, and review it like C.
- **DIP1000** adds **`scope` pointer-lifetime checking** (escape analysis) so a
  `scope` pointer cannot outlive what it points at — preventing dangling-pointer
  **use-after-free (CWE-416)**. Its default-on status has shifted across releases;
  verify whether it is enabled for your compiler version and enable `-preview=dip1000`
  if not.
- Source: dlang.org/spec/memory-safe-d.html (`@safe`/`@trusted`/`@system`),
  dlang.org DIP1000; cwe.mitre.org/data/definitions/416.html. See References.

## Concurrency Footguns
```d
import std.concurrency;   // actor-style message passing

void worker() {
    receive((int x) { /* handle */ });
}
auto tid = spawn(&worker);
send(tid, 42);            // typed messages, no shared mutable state
```
- Prefer **`std.concurrency`** message passing over shared memory. Data that
  crosses threads must be `shared` or `immutable`; a plain mutable global touched
  by two threads is a data race the type system will flag only if you mark it
  `shared`.
- **`shared`** requires explicit `synchronized`/atomics to access; **`immutable`**
  data is safe to share freely. `core.thread` gives raw threads when needed.

## Error Handling Idioms
```d
// scope guards run in reverse order of declaration on the matching exit path.
void process() {
    auto r = acquire();
    scope(exit)    r.release();   // always
    scope(failure) rollback();    // only if an exception propagates
    scope(success) commit();      // only on normal exit
    doWork();
}

import std.exception : enforce;
auto f = enforce(open(path), "cannot open " ~ path);  // throws if false/null
```
- Exception hierarchy: `Throwable` → `Exception` (recoverable) and `Error`
  (unrecoverable — do NOT catch `Error` to keep running). `nothrow` proves a
  function raises no `Exception`. Use `enforce` for precondition failures.

## Security and Dependency Gotchas
- **`@system` code + C FFI inherits C's memory-safety CWE classes.**
  `extern(C)` bindings, raw pointers, and `@trusted` blocks can produce
  use-after-free (**CWE-416**) and out-of-bounds writes (**CWE-787**). Default to
  **`@safe`**, isolate the unsafe surface in a small audited `@trusted` wrapper,
  and never mark a whole module `@trusted` to silence errors.
- **Dependencies**: dub records resolved versions in **`dub.selections.json`** —
  commit it so builds are reproducible; `dub upgrade` is the only thing that
  should move it. An unpinned `~>` range can pull a changed transitive dep.
- Source: cwe.mitre.org/data/definitions/416.html, /787.html; dlang.org/spec/memory-safe-d.html;
  dub package format docs. See References.

## Testing Conventions
```d
// Built-in unittest blocks live next to the code they test.
int add(int a, int b) => a + b;

unittest {
    assert(add(2, 3) == 5);
    import std.exception : assertThrown;
    assertThrown!Exception(parse(""));   // assert the error path
}
```
- Run with `dub test` (or `dmd -unittest`). Add `-cov` for coverage `.lst`
  files. `unittest` blocks compile out of release builds, so they never slow
  production.

## Performance Traps
- **GC pauses**: any GC allocation on a latency-critical path can trigger a
  collection pause. Mark hot paths **`@nogc`** so the compiler *proves* they do
  not allocate — then the pause cannot happen there.
- **Array bounds checks**: on in `@safe`/debug. `-boundscheck=off` (release,
  measured) removes them — but an out-of-range index is then **CWE-787** UB.
- **Template bloat**: like C++, each template instantiation emits code; heavy
  generic use inflates binary size. `-betterC` drops the runtime/GC/exceptions
  entirely for C-like output — but then GC, `TypeInfo`, and exceptions are gone.

## Version-Specific Gotchas (dated, sourced)
- **Current DMD/druntime/Phobos release is 2.112.0.** Use **LDC** (LLVM) for
  optimized production builds; DMD is the fast-iterating reference compiler.
  [dlang.org/changelog/2.112.0.html, retrieved 2026-07-10]
- **DIP1000 scope-lifetime checking** has changed default-enabled status across
  releases; do not assume it is on — check `-preview=dip1000` for your compiler
  version. Getting this wrong means dangling-pointer bugs pass `@safe` silently.
  [dlang.org DIP1000 / changelog, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- D changelog / current version (2.112.0): https://dlang.org/changelog/2.112.0.html
- D changelog index: https://dlang.org/changelog/
- Memory-safe D (`@safe`/`@trusted`/`@system`, DIP1000): https://dlang.org/spec/memory-safe-d.html
- CWE-416 (Use After Free): https://cwe.mitre.org/data/definitions/416.html
- CWE-787 (Out-of-bounds Write): https://cwe.mitre.org/data/definitions/787.html
