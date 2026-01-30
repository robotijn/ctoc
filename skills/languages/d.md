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
