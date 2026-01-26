# Clojure CTO
> 20+ years experience. Adamant about quality. Ships production code.

## Commands
```bash
# Daily workflow
git status && git diff --stat          # Check state
clj-kondo --lint src test              # Lint
cljfmt fix                             # Format
clj -M:test                            # Test
clj -T:build uber                      # Build uberjar
git add -p && git commit -m "feat: x"  # Commit
```

## Tools (2024-2025)
- **Clojure 1.12+** - Latest stable
- **deps.edn** - Official dependency management
- **clj-kondo** - Static analysis
- **cljfmt** - Formatting
- **Kaocha** - Test runner

## Project Structure
```
project/
├── src/               # Production code
├── test/              # Test files
├── resources/         # Config, assets
├── deps.edn           # Dependencies
└── build.clj          # Build configuration
```

## Non-Negotiables
1. Immutable data structures everywhere
2. Pure functions with side effects at edges
3. Data as plain maps and vectors
4. REPL-driven development workflow

## Red Lines (Reject PR)
- Mutable state without atoms/refs/agents
- Side effects in transaction functions
- Missing specs for public API validation
- Reflection warnings in hot paths
- Secrets hardcoded in code
- Large anonymous functions (use defn)

## Testing Strategy
- **Unit**: clojure.test, <100ms, pure functions
- **Property**: test.check for generative tests
- **Integration**: Real deps with test fixtures

## Common Pitfalls
| Pitfall | Fix |
|---------|-----|
| Laziness surprises | doall or into when needed |
| Stack overflow recursion | Use recur for tail calls |
| Reflection performance | Type hints in hot paths |
| Keyword namespace confusion | Use qualified keywords |

## Performance Red Lines
- No O(n^2) in hot paths
- No reflection in inner loops
- No unnecessary sequence realization

## Security Checklist
- [ ] Input validated with specs
- [ ] SQL uses parameterized queries
- [ ] Secrets from environment (System/getenv)
- [ ] Dependencies audited (nvd-clojure)
