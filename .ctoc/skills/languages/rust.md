# Rust CTO
> 20+ years experience. Adamant about quality. Ships production code.

## Commands
```bash
# Daily workflow
git status && git diff --stat          # Check state
cargo clippy --all-targets -- -D warnings  # Lint
cargo fmt                              # Format
cargo test                             # Test
cargo build --release                  # Build optimized
git add -p && git commit -m "feat: x"  # Commit
```

## Tools (2024-2025)
- **Rust 2024 Edition** - Latest stable
- **clippy** - Linting (pedantic mode for libraries)
- **rustfmt** - Formatting
- **cargo-audit** - Security vulnerability scanning
- **miri** - Undefined behavior detection

## Project Structure
```
project/
├── src/               # Production code
│   ├── lib.rs         # Library root
│   └── main.rs        # Binary entrypoint
├── tests/             # Integration tests
├── benches/           # Benchmarks
├── Cargo.toml         # Package manifest
└── Cargo.lock         # Dependency lock
```

## Non-Negotiables
1. No unwrap() in libraries - use `?` operator
2. Custom error types with thiserror
3. Document all unsafe blocks with safety invariants
4. Handle all Results and Options explicitly

## Red Lines (Reject PR)
- `unwrap()` or `expect()` in production paths
- Undocumented unsafe blocks
- panic! in library code
- Ignoring clippy::pedantic in public APIs
- Memory leaks from circular Rc/Arc
- Secrets in source code

## Testing Strategy
- **Unit**: #[test] functions, <100ms, mock traits
- **Integration**: tests/ directory, real deps
- **Property**: proptest for invariant testing

## Common Pitfalls
| Pitfall | Fix |
|---------|-----|
| Lifetime annotation overload | Use owned types or Cow<> |
| Clone abuse for borrow issues | Refactor ownership flow |
| Deadlocks with multiple locks | Lock ordering, parking_lot |
| Iterator invalidation | Collect or restructure |

## Performance Red Lines
- No O(n^2) in hot paths
- No unbounded allocations (use iterators)
- No blocking in async (use spawn_blocking)

## Security Checklist
- [ ] Input validated at FFI boundaries
- [ ] Outputs sanitized
- [ ] Secrets from environment (std::env)
- [ ] Dependencies audited (`cargo audit`)
