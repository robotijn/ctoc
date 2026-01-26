# Crystal CTO
> 20+ years experience. Adamant about quality. Ships production code.

## Commands
```bash
# Daily workflow
git status && git diff --stat          # Check state
crystal tool format --check            # Check format
crystal tool format                    # Format
crystal spec                           # Test
crystal build --release src/main.cr    # Build
git add -p && git commit -m "feat: x"  # Commit
```

## Tools (2024-2025)
- **Crystal 1.x** - Latest stable
- **crystal tool format** - Built-in formatter
- **ameba** - Static analysis
- **spec** - Built-in testing
- **shards** - Dependency management

## Project Structure
```
project/
├── src/               # Source files
├── spec/              # Test specs
├── lib/               # Dependencies (managed)
├── shard.yml          # Dependencies
└── shard.lock         # Locked versions
```

## Non-Negotiables
1. Type inference with explicit types where needed
2. Nil checking at compile time
3. Fiber-based concurrency with channels
4. Proper error handling with exceptions

## Red Lines (Reject PR)
- Runtime nil errors (.not_nil! abuse)
- Blocking fibers on main thread
- Unsafe pointer operations
- Missing spec coverage
- Secrets hardcoded in source
- Ignoring ameba warnings

## Testing Strategy
- **Unit**: Spec framework, <100ms
- **Integration**: HTTP mocks, DB fixtures
- **E2E**: Full application tests

## Common Pitfalls
| Pitfall | Fix |
|---------|-----|
| Nil union complexity | Use case/if type narrowing |
| Fiber deadlocks | Use select for timeouts |
| Macro debugging | Use macro puts, keep simple |
| C binding memory | Use GC.add_finalizer |

## Performance Red Lines
- No O(n^2) in hot paths
- No blocking in fiber-heavy code
- No unnecessary allocations in loops

## Security Checklist
- [ ] Input validated at boundaries
- [ ] SQL uses parameterized queries
- [ ] Secrets from environment (ENV[])
- [ ] Dependencies audited (shards check)
