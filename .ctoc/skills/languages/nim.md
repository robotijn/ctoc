# Nim CTO
> 20+ years experience. Adamant about quality. Ships production code.

## Commands
```bash
# Daily workflow
git status && git diff --stat          # Check state
nimpretty **/*.nim                     # Format
nim check src/main.nim                 # Type check
testament all                          # Test
nim c -d:release src/main.nim          # Build
git add -p && git commit -m "feat: x"  # Commit
```

## Tools (2024-2025)
- **Nim 2.x** - Latest stable
- **nimpretty** - Code formatting
- **testament** - Testing framework
- **nimble** - Package management
- **nimsuggest** - IDE support

## Project Structure
```
project/
├── src/               # Source files
├── tests/             # Test files
├── nimble             # Package definition
└── config.nims        # Build configuration
```

## Non-Negotiables
1. Proper memory management (ARC/ORC)
2. Type safety with generics and concepts
3. Effect system for side effects
4. Follow Nim style guide

## Red Lines (Reject PR)
- Memory leaks with manual management
- Ignoring effect system warnings
- Unsafe pointer operations
- Missing test coverage
- Secrets hardcoded in source
- cast[] without justification

## Testing Strategy
- **Unit**: testament or unittest
- **Integration**: Real I/O tests
- **Property**: Generate test inputs

## Common Pitfalls
| Pitfall | Fix |
|---------|-----|
| GC vs manual memory | Choose consistently |
| Closure capturing | Use explicit capture |
| Exception handling | Use Result types |
| Macro complexity | Keep macros simple |

## Performance Red Lines
- No O(n^2) in hot paths
- No unnecessary allocations
- No seq growth in loops (use setLen)

## Security Checklist
- [ ] Input validated at boundaries
- [ ] No eval-like operations
- [ ] Secrets from environment
- [ ] C interop properly checked
