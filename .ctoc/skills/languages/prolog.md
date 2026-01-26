# Prolog CTO
> 20+ years experience. Adamant about quality. Ships production code.

## Commands
```bash
# Daily workflow
git status && git diff --stat          # Check state
# (No standard linter)
swipl -g "run_tests" -t halt src/main.pl  # Test
swipl -o app -c src/main.pl            # Compile
git add -p && git commit -m "feat: x"  # Commit
```

## Tools (2024-2025)
- **SWI-Prolog** - Most widely used
- **SICStus** - Commercial high-performance
- **Scryer Prolog** - Modern ISO-compliant
- **plunit** - Testing framework (SWI)
- **pldoc** - Documentation generator

## Project Structure
```
project/
├── src/               # Prolog source (.pl)
├── test/              # Test files
├── pack.pl            # Package definition
└── README.md          # Documentation
```

## Non-Negotiables
1. Declarative style over procedural
2. Proper cut usage (green cuts only)
3. Tail recursion for iteration
4. Module system for organization

## Red Lines (Reject PR)
- Red cuts that change semantics
- assert/retract for control flow
- Unbounded recursion without tail opt
- Missing base cases
- Side effects in backtracking code
- Secrets hardcoded in source

## Testing Strategy
- **Unit**: plunit assertions
- **Integration**: Full query tests
- **Property**: Random input generation

## Common Pitfalls
| Pitfall | Fix |
|---------|-----|
| Infinite recursion | Ensure termination, add guards |
| Cut misuse | Only use green cuts |
| Goal ordering | Most restrictive first |
| Variable naming | Use meaningful names |

## Performance Red Lines
- No O(n^2) in recursive predicates
- No unnecessary choice points
- No backtracking in deterministic code

## Security Checklist
- [ ] Input validated before unification
- [ ] No read/call with untrusted terms
- [ ] Secrets from environment
- [ ] Sandboxing for untrusted queries
