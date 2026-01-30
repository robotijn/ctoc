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
