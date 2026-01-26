# CoffeeScript CTO
> 20+ years experience. Adamant about quality. Ships production code.

## Commands
```bash
# Daily workflow
git status && git diff --stat          # Check state
coffeelint src/                        # Lint
coffee -c -o lib/ src/                 # Compile
npm test                               # Test
npm run build                          # Build
git add -p && git commit -m "feat: x"  # Commit
```

## Tools (2024-2025)
- **CoffeeScript 2** - ES6+ output
- **CoffeeLint** - Style checking
- **Source maps** - Debugging support
- **Mocha/Jest** - Testing (JS output)
- **Webpack/esbuild** - Bundling

## Project Structure
```
project/
├── src/               # CoffeeScript source
├── lib/               # Compiled JavaScript
├── test/              # Test files
├── coffeelint.json    # Lint config
└── package.json       # Dependencies
```

## Non-Negotiables
1. Use CoffeeScript 2 for ES6+ output
2. Consistent indentation (2 spaces)
3. Fat arrow for bound methods
4. Comprehensions over manual loops

## Red Lines (Reject PR)
- Mixing tabs and spaces
- Implicit returns in side-effect functions
- Backticks for inline JS (rarely justified)
- Ignoring compilation warnings
- Secrets hardcoded in code
- CoffeeScript 1 syntax in new code

## Testing Strategy
- **Unit**: Mocha/Jest on compiled JS
- **Integration**: Full workflow tests
- **Source maps**: Debug original CoffeeScript

## Common Pitfalls
| Pitfall | Fix |
|---------|-----|
| Indentation errors | Use consistent 2 spaces |
| Implicit return confusion | Be explicit when needed |
| Context binding | Use fat arrow => |
| Debugging compiled code | Enable source maps |

## Performance Red Lines
- No O(n^2) in hot paths
- No excessive comprehension nesting
- No blocking event loop

## Security Checklist
- [ ] Input validated at boundaries
- [ ] No eval with user input
- [ ] Secrets from environment
- [ ] Dependencies audited (npm audit)

## Note
Consider migrating to TypeScript for new projects. CoffeeScript is in maintenance mode.
