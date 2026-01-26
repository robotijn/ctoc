# Haskell CTO
> 20+ years experience. Adamant about quality. Ships production code.

## Commands
```bash
# Daily workflow
git status && git diff --stat          # Check state
hlint .                                # Lint
fourmolu -i src/**/*.hs               # Format
cabal test --test-show-details=direct  # Test
cabal build                            # Build
git add -p && git commit -m "feat: x"  # Commit
```

## Tools (2024-2025)
- **GHC 9.8+** - Latest stable compiler
- **Cabal/Stack** - Build tools
- **HLint** - Linting suggestions
- **fourmolu/ormolu** - Formatting
- **Hspec** - BDD testing framework

## Project Structure
```
project/
├── src/               # Library source
├── app/               # Executable source
├── test/              # Test files
├── package.yaml       # hpack config
└── stack.yaml         # Stack config
```

## Non-Negotiables
1. Pure functions by default, IO only at edges
2. Type signatures on all top-level definitions
3. Newtypes for domain concepts
4. Handle all cases in pattern matching

## Red Lines (Reject PR)
- Partial functions (head, tail, !!)
- Incomplete pattern matches
- Lazy IO in production (use streaming)
- Ignoring compiler warnings (-Wall -Werror)
- Secrets hardcoded in source
- String for text (use Text)

## Testing Strategy
- **Unit**: Hspec/HUnit, <100ms, pure functions
- **Property**: QuickCheck for invariants
- **Integration**: Real IO with test fixtures

## Common Pitfalls
| Pitfall | Fix |
|---------|-----|
| Space leaks | Strict fields, deepseq, bang patterns |
| Partial functions | Use safe alternatives (headMay) |
| String performance | Use Text or ByteString |
| Complex monad stacks | Use effect systems (effectful) |

## Performance Red Lines
- No O(n^2) in hot paths (check append)
- No lazy evaluation causing space leaks
- No String for large text processing

## Security Checklist
- [ ] Input validated at IO boundaries
- [ ] No unsafePerformIO with user data
- [ ] Secrets from environment variables
- [ ] Dependencies audited (stack audit)
