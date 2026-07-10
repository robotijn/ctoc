# Crystal CTO
> Claude Code correction guide. Updated January 2026.

## Critical Corrections
- Claude abuses `.not_nil!` — use proper nil checks
- Claude blocks fibers — use non-blocking I/O
- Claude creates complex macros — keep macros simple
- Claude ignores ameba warnings — fix all warnings

## Current Tooling (2026)
| Tool | Use | NOT |
|------|-----|-----|
| `crystal 1.x+` | Latest stable | Older versions |
| `crystal tool format` | Built-in formatting | Manual style |
| `ameba` | Static analysis | No linting |
| `spec` | Built-in testing | External frameworks |
| `shards` | Dependency management | Manual deps |

## Patterns Claude Should Use
```crystal
# Proper nil handling with type narrowing
def process(user : User?)
  return unless user  # user is now User, not User?
  puts user.name
end

# Use case for exhaustive checks
def handle(status : Status)
  case status
  when .pending?
    process_pending
  when .active?
    process_active
  when .completed?
    process_completed
  end
end

# Fibers with channels for concurrency
channel = Channel(String).new
spawn do
  channel.send(fetch_data)
end
result = channel.receive

# Timeout with select
select
when result = channel.receive
  process(result)
when timeout(5.seconds)
  raise "Timeout waiting for data"
end
```

## Anti-Patterns Claude Generates
- `.not_nil!` abuse — use type narrowing or guards
- Blocking main fiber — use spawn for I/O
- Complex macros — keep simple, use macro puts to debug
- Ignoring ameba — fix all static analysis warnings
- Missing specs — write tests for public APIs

## Version Gotchas
- **Nil safety**: Compiler enforces nil checks
- **Fibers**: Cooperative, not preemptive
- **Macros**: Compile-time metaprogramming
- **C bindings**: Use `GC.add_finalizer` for cleanup
- **With shards**: Lock versions with `shards.lock`

## Concurrency / Fibers Footguns
Crystal concurrency is **fibers** (green threads), scheduled **cooperatively on a
single OS thread by default**. Multi-threading is still a **preview**, and Claude
consistently writes code that assumes real parallelism it does not have.

```crystal
# FOOTGUN 1: a fiber only yields at I/O / Channel / sleep. A tight CPU loop with
# no yield point STARVES every other fiber — the whole program stalls.
spawn do
  loop { heavy_cpu }   # BAD: never yields; nothing else runs
end

# FOOTGUN 2: shared mutable state under multi-threading. With single-thread
# fibers there is no data race; the moment you enable the MT preview there IS.
# Communicate via Channel (CSP), do not share a mutable Array across fibers.
channel = Channel(Int32).new
spawn { channel.send(compute) }
value = channel.receive
```
- **Multi-threading is preview**: built with `-Dpreview_mt` (and the newer
  `-Dexecution_context` experimental scheduler). Under it, unsynchronized shared
  state is a genuine **data race** — the single-thread safety assumption is gone.
- Prefer **`Channel`** (CSP message passing) over shared memory. `select` lets a
  fiber wait on multiple channels / a `timeout`.
- Source: crystal-lang.org "Concurrency" guide (fibers, `-Dpreview_mt`).
  See References.

## Error Handling Idioms
```crystal
begin
  risky
rescue ex : IO::Error   # rescue specific types, not a bare rescue
  handle(ex)
ensure
  cleanup               # always runs
end

# Nil is part of the TYPE system: user is `User?` until narrowed.
if user
  user.name             # narrowed to User here
end
```
- **`.not_nil!` panics (raises `NilAssertionError`) at runtime** if the value is
  actually `nil` — it defeats the compiler's nil checking. Narrow with `if x`,
  `x.try { ... }`, or handle the `Nil` union explicitly instead.
- Union types + exhaustive `case ... in` let the compiler prove you handled every
  variant.

## Security and Dependency Gotchas
- **Compiled, but C FFI reintroduces C's memory-safety CWE classes.** Ruby-like
  syntax hides the fact that `lib`/`fun` C bindings and raw `Pointer(T)` are
  unsafe: a pointer freed by C and still used from Crystal is a **use-after-free
  (CWE-416)**; an unchecked write past a buffer is **CWE-787**. Keep bindings
  thin and wrap them in a safe Crystal API; use `GC.add_finalizer` carefully so
  finalization does not free memory C still owns.
- **Dependencies**: `shards install` writes **`shard.lock`** pinning exact
  versions/commits — commit it. `shards update` is the only thing that should
  move the lock. An unpinned git dependency can change under you.
- Source: cwe.mitre.org/data/definitions/416.html; crystal-lang.org shards docs.
  See References.

## Testing Conventions
```crystal
require "spec"

describe Calculator do
  it "adds" do
    Calculator.add(2, 3).should eq(5)
  end
  it "raises on divide by zero" do
    expect_raises(DivisionByZeroError) { Calculator.div(1, 0) }  # error path
  end
end
```
- Built-in **Spec** framework (`describe`/`context`/`it`, `.should`); run with
  `crystal spec`. `expect_raises` asserts the failure path, not just happy cases.

## Performance Traps
- **`struct` (value, stack) vs `class` (reference, heap)**: a `class` allocates
  on the GC heap; a `struct` is copied by value. Using a `class` for a tiny
  hot-loop value adds GC pressure; using a large `struct` copies it on every
  pass. Choose deliberately.
- **String building**: concatenating with `+` in a loop reallocates each time —
  use **`String.build { |io| ... }`** or an `IO::Memory` to build once.
- **Boxing in unions**: storing mixed types in a union can box; keep hot
  collections monomorphic where possible.

## Version-Specific Gotchas (dated, sourced)
- **Crystal 1.x is stable** (post-1.0 semver); the current release is **1.20.3**.
  The language/stdlib are stable, but **multi-threading remains behind
  `-Dpreview_mt`** — do not assume parallel fibers in shipped code.
  [crystal-lang.org/api/ (project_version meta = 1.20.3), retrieved 2026-07-10]
- **`-Dexecution_context`** is the newer experimental MT scheduler layered on the
  preview_mt work — experimental, subject to change; verify against the release
  notes for your exact Crystal version before relying on it.
  [crystal-lang.org release notes, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- Crystal API / current version: https://crystal-lang.org/api/
- Crystal concurrency guide (fibers, preview_mt): https://crystal-lang.org/reference/guides/concurrency.html
- Crystal shards / shard.lock: https://crystal-lang.org/reference/man/shards/
- CWE-416 (Use After Free): https://cwe.mitre.org/data/definitions/416.html
- CWE-787 (Out-of-bounds Write): https://cwe.mitre.org/data/definitions/787.html
