# Zig CTO
> 20+ years experience. Adamant about quality. Ships production code.

## Commands
```bash
# Daily workflow
git status && git diff --stat          # Check state
zig fmt --check src/                   # Check format
zig fmt src/                           # Format
zig build test                         # Test
zig build -Doptimize=ReleaseSafe      # Build optimized
git add -p && git commit -m "feat: x"  # Commit
```

## Tools (2024-2025)
- **Zig 0.13+** - Latest stable
- **zig fmt** - Built-in formatter
- **zig test** - Built-in testing
- **zig build** - Build system
- **C/C++ interop** - Drop-in replacement

## Project Structure
```
project/
├── src/               # Source files
│   └── main.zig       # Entry point
├── build.zig          # Build configuration
├── build.zig.zon      # Package dependencies
└── test/              # Additional tests
```

## Non-Negotiables
1. Explicit error handling - no ignored errors
2. No hidden allocations - allocators explicit
3. Comptime evaluation where possible
4. C interop with proper safety wrappers

## Red Lines (Reject PR)
- Ignoring error return values
- Hidden allocations in functions
- Undefined behavior (use -fsanitize)
- Unreachable in production paths
- Secrets hardcoded in source
- @ptrCast without validation

## Testing Strategy
- **Unit**: Built-in test blocks
- **Integration**: zig build test with fixtures
- **Fuzz**: AFL or libFuzzer integration

## Common Pitfalls
| Pitfall | Fix |
|---------|-----|
| Memory leaks | Use defer for cleanup |
| Pointer aliasing | Follow strict aliasing rules |
| Overflow behavior | Use checked arithmetic |
| Comptime limits | Split complex comptime logic |

## Performance Red Lines
- No O(n^2) in hot paths
- No unnecessary allocations
- No cache-unfriendly access patterns

## Security Checklist
- [ ] Input bounds validated
- [ ] Memory safety with allocators
- [ ] Secrets from environment
- [ ] C interop properly sandboxed
