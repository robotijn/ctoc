# TypeScript CTO
> Claude Code correction guide. Updated January 2026.

## Critical Corrections
- Claude uses `any` as escape hatch — use `unknown` and narrow
- Claude suggests enum — use `as const` objects or union types
- Claude forgets TypeScript 6.0 will be rewritten in Go (10x faster)
- Claude uses legacy eslintrc — use flat config (`eslint.config.js`)

## Current Tooling (2026)
| Tool | Use | NOT |
|------|-----|-----|
| `typescript 5.8+` | Strict mode always | Loose config |
| `eslint 9` flat config | Linting | Legacy .eslintrc |
| `vitest` | Testing | Jest (slower) |
| `tsx` | TS execution | `ts-node` (slower) |
| `biome` | Format + lint (optional) | Separate tools |

## Patterns Claude Should Use
```typescript
// Inferred type predicates (TS 5.5+)
const isString = (x: unknown) => typeof x === "string";
// TS now infers: (x: unknown) => x is string

// Discriminated unions for state
type State =
  | { status: "loading" }
  | { status: "success"; data: Data }
  | { status: "error"; error: Error };

// satisfies for type checking without widening
const config = {
  port: 3000,
  host: "localhost",
} satisfies ServerConfig;
```

## Anti-Patterns Claude Generates
- `as Type` assertions hiding bugs — use type guards
- `!` non-null assertion — handle nulls explicitly
- `@ts-ignore` without comment — use `@ts-expect-error` with reason
- `enum` with runtime overhead — use const objects
- `Function` type — use specific signatures

## Version Gotchas
- **5.6+**: `--noUncheckedSideEffectImports` catches bad imports
- **5.6+**: `IteratorObject` type for native iterators
- **5.5+**: Type predicates auto-inferred in filter callbacks
- **With Node**: Use `"type": "module"` and `.js` extensions in imports
- **With React**: Prefer `React.FC` removed — use function declarations
