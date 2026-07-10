# Zig CTO
> Claude Code correction guide. Updated January 2026.

## Critical Corrections
- Claude ignores error returns — handle all errors with `try`/`catch`
- Claude uses hidden allocations — allocators must be explicit
- Claude uses `unreachable` in reachable paths — causes undefined behavior
- Claude forgets `defer` for cleanup — memory leaks

## Current Tooling (2026)
| Tool | Use | NOT |
|------|-----|-----|
| `zig 0.13+` | Latest stable | Older versions |
| `zig fmt` | Built-in formatting | Manual style |
| `zig build test` | Built-in testing | External runners |
| `build.zig` | Build configuration | Makefiles |
| `-fsanitize` | Runtime checks | No sanitizers |

## Patterns Claude Should Use
```zig
const std = @import("std");

// Explicit allocator - no hidden allocations
pub fn createList(allocator: std.mem.Allocator) !std.ArrayList(u8) {
    var list = std.ArrayList(u8).init(allocator);
    errdefer list.deinit(); // cleanup on error
    try list.append(42);
    return list;
}

// Always use defer for cleanup
pub fn readFile(path: []const u8) ![]u8 {
    var file = try std.fs.cwd().openFile(path, .{});
    defer file.close();
    return try file.readToEndAlloc(allocator, max_size);
}

// Handle all errors explicitly
const result = operation() catch |err| switch (err) {
    error.NotFound => return default,
    else => return err,
};
```

## Anti-Patterns Claude Generates
- Ignoring `try` return — always handle errors
- Hidden allocations — pass allocators explicitly
- `unreachable` in reachable code — causes UB
- Missing `defer`/`errdefer` — resource leaks
- `@ptrCast` without validation — memory corruption

## Version Gotchas
- **0.13+**: Improved error messages, better comptime
- **No hidden control flow**: Errors are explicit values
- **Comptime**: Powerful but has limits on complexity
- **C interop**: Drop-in C compiler replacement
- **With C code**: Proper safety wrappers required

## Memory / Allocator Footguns
Zig has **no hidden allocation** and **no default global allocator** — every
function that allocates takes an `std.mem.Allocator` explicitly. That is the
whole safety model, and it is exactly what Claude tramples.

```zig
// FOOTGUN 1: use-after-free (CWE-416). `errdefer` cleans up on the error path,
// but if you `return list` on success the caller now OWNS it — freeing here too
// is a double-free. Match every alloc to exactly ONE owner.
var list = std.ArrayList(u8).init(allocator);
errdefer list.deinit();   // runs ONLY if a later `try` fails
try list.append(42);
return list;              // success path: caller must deinit(), NOT us

// FOOTGUN 2: `defer` vs `errdefer` order. `defer` runs on EVERY exit,
// `errdefer` only on error. Freeing with `defer` then returning the value
// is a use-after-free the moment the caller dereferences it.

// SAFE: GeneralPurposeAllocator in Debug detects leaks + double-free at deinit.
var gpa = std.heap.GeneralPurposeAllocator(.{}){};
defer std.debug.assert(gpa.deinit() == .ok);  // .leak if you forgot a free
const alloc = gpa.allocator();
```
- **Use-after-free / double-free** are **CWE-416** — the dominant Zig memory bug
  class because ownership is manual. `defer p.free()` inside a loop that returns
  a slice into `p` frees memory the caller still reads.
- **`@ptrCast` / `@alignCast`** bypass the type system — an under-aligned cast is
  UB. Prefer slices (`[]T`) which carry a length over raw `[*]T` pointers.
- Source: cwe.mitre.org/data/definitions/416.html (CWE-416 "Use After Free"); Zig
  `std.heap.GeneralPurposeAllocator` docs — ziglang.org/documentation/0.16.0/std.
  See References.

## Concurrency Footguns
- **`async`/`await` is in flux pre-1.0.** Zig's stackless async was **removed
  from the language in the 0.11–0.12 era** and a new I/O model is still landing;
  do NOT assume `async`/`await` keywords are available on the version you target
  — pin to your exact toolchain and read that version's release notes.
- Use `std.Thread` for real OS threads. Shared **mutable** state across threads
  with no `std.Thread.Mutex` is a data race — Zig will not catch it for you.
```zig
var mutex = std.Thread.Mutex{};
mutex.lock();
defer mutex.unlock();   // release even on early error return
shared_counter += 1;
```
- Source: ziglang.org release notes (async status is version-specific pre-1.0).
  See References.

## Error Handling Idioms
Errors are **values**, not exceptions. A function that can fail returns an error
union `!T`; you MUST handle it with `try`, `catch`, or `if (x) |v| ... else |e|`.
```zig
// error set + union; `try` propagates, `catch` handles
const Err = error{ NotFound, Timeout };
fn lookup(k: []const u8) Err!u32 { ... }

const v = lookup(key) catch |err| switch (err) {
    error.NotFound => 0,          // exhaustive: every error handled
    error.Timeout  => return err, // re-propagate
};
```
- **`unreachable`** asserts a branch never happens. In Debug/ReleaseSafe it
  panics; in **ReleaseFast it is UB** if actually reached — never use it for
  reachable input validation. Use `@panic("msg")` or return an error instead.

## Security and Dependency Gotchas
- **Integer overflow is build-mode-dependent (CWE-190).** `+`/`-`/`*` are
  **safety-checked (panic) in Debug and ReleaseSafe, but wrap/UB in ReleaseFast
  and ReleaseSmall**. Do not ship security-sensitive arithmetic in ReleaseFast
  assuming it traps — use the explicit wrapping (`+%`) or saturating (`+|`)
  operators, or `std.math.add` which returns an error on overflow.
- **Out-of-bounds** indexing is **CWE-787/CWE-125** — bounds-checked in
  Debug/ReleaseSafe, elided in ReleaseFast. Pick the build mode per your threat
  model; do not assume `[]const u8` indexing traps in release.
- **Dependencies**: `zig fetch --save <url>` records a **content hash** in
  `build.zig.zon`; the hash is verified on fetch, so pin it and commit the
  `build.zig.zon` — an unpinned dependency is a supply-chain hole.
- Source: cwe.mitre.org/data/definitions/190.html (CWE-190 "Integer Overflow or
  Wraparound"), cwe.mitre.org/data/definitions/787.html (CWE-787 "Out-of-bounds
  Write"). See References.

## Testing Conventions
```zig
const std = @import("std");
const testing = std.testing;

test "list appends" {
    var list = std.ArrayList(u8).init(testing.allocator); // leak-checking allocator
    defer list.deinit();
    try list.append(1);
    try testing.expectEqual(@as(usize, 1), list.items.len);
}
```
- Run with `zig build test` (or `zig test file.zig`). **`std.testing.allocator`
  fails the test if any allocation leaks** — always allocate through it in tests,
  never through a GPA that swallows the report.
- `try testing.expectError(error.NotFound, lookup("x"));` asserts the error path,
  not just the happy path.

## Performance Traps
- **Comptime bloat**: heavy `comptime` / generic instantiation is monomorphized —
  each type combination emits fresh code, inflating binary size. Measure with
  `zig build -Doptimize=ReleaseSmall` if size matters.
- **ReleaseSafe vs ReleaseFast**: ReleaseSafe keeps bounds/overflow/UB checks
  (slower, safe); ReleaseFast drops them. The correct default for most services
  is **ReleaseSafe** — reach for ReleaseFast only for measured hot paths.
- Bounds-check elision happens **only** in ReleaseFast/ReleaseSmall — do not
  benchmark in Debug and extrapolate.

## Version-Specific Gotchas (dated, sourced) — pre-1.0, verify per toolchain
- **Zig is pre-1.0 and breaks between minor releases** — pin every claim above to
  your exact `zig version`. Latest **stable is 0.16.0** (released **2026-04-13**);
  `master` is **0.17.0-dev** as of 2026-07-08.
  [ziglang.org/download/index.json, retrieved 2026-07-10]
- **`std.ArrayList` and the std allocator/I/O APIs have changed across 0.13 →
  0.16** — code snippets that compiled on 0.13 may not compile on 0.16. Always
  read the release notes for the version you target before trusting an example.
  [ziglang.org/download/ release-notes links, retrieved 2026-07-10]
- **Build modes** (`-Doptimize=Debug|ReleaseSafe|ReleaseFast|ReleaseSmall`) govern
  whether overflow/bounds/UB checks exist — the single most important safety knob.
  [ziglang.org/documentation/0.16.0, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- Zig downloads / version index: https://ziglang.org/download/index.json
- Zig download page (release notes): https://ziglang.org/download/
- Zig 0.16.0 language/std docs: https://ziglang.org/documentation/0.16.0/
- CWE-416 (Use After Free): https://cwe.mitre.org/data/definitions/416.html
- CWE-190 (Integer Overflow or Wraparound): https://cwe.mitre.org/data/definitions/190.html
- CWE-787 (Out-of-bounds Write): https://cwe.mitre.org/data/definitions/787.html
