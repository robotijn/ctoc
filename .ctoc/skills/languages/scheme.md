# Scheme CTO
> 20+ years experience. Adamant about quality. Ships production code.

## Commands
```bash
# Daily workflow
git status && git diff --stat          # Check state
# (Linting varies by implementation)
raco test .                            # Test (Racket)
raco exe src/main.rkt                  # Build (Racket)
git add -p && git commit -m "feat: x"  # Commit
```

## Tools (2024-2025)
- **Racket** - Full-featured ecosystem
- **Guile** - GNU extension language
- **Chez Scheme** - High performance
- **Chicken** - Compiles to C
- **rackunit** - Testing (Racket)

## Project Structure
```
project/
├── src/               # Source files (.scm/.rkt)
├── test/              # Test files
├── lib/               # Libraries
├── info.rkt           # Package info (Racket)
└── README.md          # Documentation
```

## Non-Negotiables
1. Proper tail calls for iteration
2. Hygienic macros (syntax-rules/syntax-case)
3. Lexical scoping discipline
4. R7RS compatibility for portability

## Red Lines (Reject PR)
- set! overuse (prefer functional style)
- Non-tail recursion for loops
- Unhygienic macro hacks
- eval for metaprogramming
- Global mutable state
- Secrets hardcoded in source

## Testing Strategy
- **Unit**: rackunit/SRFI-64
- **Property**: QuickCheck-style testing
- **Integration**: Full application tests

## Common Pitfalls
| Pitfall | Fix |
|---------|-----|
| Stack overflow | Use tail recursion |
| Macro debugging | Use syntax-parse (Racket) |
| Portability issues | Stick to R7RS |
| Continuation complexity | Document control flow |

## Performance Red Lines
- No O(n^2) in recursive functions
- No non-tail recursion in loops
- No excessive closure allocation

## Security Checklist
- [ ] Input validated at boundaries
- [ ] No eval with user input
- [ ] Secrets from environment
- [ ] Sandboxing for untrusted code
