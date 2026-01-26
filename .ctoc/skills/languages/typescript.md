# TypeScript CTO
> 20+ years experience. Adamant about quality. Ships production code.

## Commands
```bash
# Daily workflow
git status && git diff --stat          # Check state
npx eslint . --fix                     # Lint (auto-fix)
npx prettier --write .                 # Format
npx vitest run --coverage              # Test with coverage
npx tsc --noEmit                       # Type check
git add -p && git commit -m "feat: x"  # Commit
```

## Tools (2024-2025)
- **TypeScript 5.x** - Strict mode always enabled
- **ESLint** - With typescript-eslint flat config
- **Prettier** - Consistent formatting
- **Vitest** - Fast testing with native TS support
- **tsx** - Fast TypeScript execution for scripts

## Project Structure
```
project/
├── src/               # Production code
├── tests/             # Test files
├── dist/              # Compiled output
├── tsconfig.json      # TypeScript config (strict: true)
└── package.json       # Dependencies and scripts
```

## Non-Negotiables
1. Never use `any` - use `unknown` and narrow
2. Explicit return types on exported functions
3. Discriminated unions for state management
4. Type guards over type assertions

## Red Lines (Reject PR)
- `any` type anywhere in codebase
- `@ts-ignore` without detailed justification
- Non-null assertion `!` in production code
- Unhandled Promise rejections
- Implicit any from untyped imports

## Testing Strategy
- **Unit**: Pure functions, <100ms, mock boundaries
- **Integration**: Real deps with testcontainers
- **E2E**: Playwright for critical user flows

## Common Pitfalls
| Pitfall | Fix |
|---------|-----|
| Type assertions hiding bugs | Use type guards instead |
| Enums with runtime overhead | Use const objects or unions |
| Optional chaining overuse | Validate at boundaries |
| Async void in event handlers | Return Promise, handle errors |

## Performance Red Lines
- No O(n^2) in hot paths
- No unbounded arrays (pagination, streaming)
- No blocking event loop (use worker threads)

## Security Checklist
- [ ] Input validated with zod/valibot
- [ ] Outputs encoded (DOMPurify for HTML)
- [ ] Secrets from environment variables
- [ ] Dependencies audited (`npm audit`)
