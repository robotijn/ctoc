# OCaml CTO
> 20+ years experience. Adamant about quality. Ships production code.

## Commands
```bash
# Daily workflow
git status && git diff --stat          # Check state
dune build @lint                       # Lint
ocamlformat -i **/*.ml                 # Format
dune runtest                           # Test
dune build                             # Build
git add -p && git commit -m "feat: x"  # Commit
```

## Tools (2024-2025)
- **OCaml 5.x** - Multicore support
- **dune** - Build system
- **ocamlformat** - Formatting
- **ppx_expect/Alcotest** - Testing
- **opam** - Package management

## Project Structure
```
project/
├── lib/               # Library code
├── bin/               # Executables
├── test/              # Tests
├── dune-project       # Project config
└── .ocamlformat       # Format config
```

## Non-Negotiables
1. Immutability by default - minimize ref
2. Exhaustive pattern matching
3. Type signatures on module interfaces (.mli)
4. Use Result for error handling

## Red Lines (Reject PR)
- Partial pattern matches
- ref without clear justification
- Ignoring compiler warnings
- Obj.magic usage
- Secrets hardcoded in source
- Missing .mli for public modules

## Testing Strategy
- **Unit**: Alcotest/ppx_expect, <100ms
- **Property**: QCheck for invariants
- **Integration**: Real I/O with test fixtures

## Common Pitfalls
| Pitfall | Fix |
|---------|-----|
| Stack overflow recursion | Use tail recursion |
| String inefficiency | Use Bytes or Buffer |
| Exception handling confusion | Prefer Result type |
| Functor complexity | Use first-class modules |

## Performance Red Lines
- No O(n^2) in hot paths
- No excessive boxing (use unboxed types)
- No lazy evaluation causing space leaks

## Security Checklist
- [ ] Input validated at boundaries
- [ ] No Obj.magic with user data
- [ ] Secrets from environment
- [ ] Dependencies audited (opam audit)
