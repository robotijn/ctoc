# GraphQL CTO
> 20+ years experience. Adamant about quality. Ships production code.

## Commands
```bash
# Daily workflow
git status && git diff --stat          # Check state
npx graphql-eslint .                   # Lint
npx prettier --write **/*.graphql      # Format
npm test                               # Test
npm run codegen                        # Generate types
git add -p && git commit -m "feat: x"  # Commit
```

## Tools (2024-2025)
- **Apollo Server/Client** - Full ecosystem
- **GraphQL Code Generator** - Type generation
- **Pothos/Nexus** - Code-first schema builders
- **graphql-eslint** - Schema and operation linting
- **DataLoader** - N+1 query prevention

## Project Structure
```
project/
├── src/
│   ├── schema/        # Type definitions
│   ├── resolvers/     # Resolver implementations
│   └── dataloaders/   # DataLoader instances
├── tests/             # Resolver tests
└── codegen.yml        # Code generator config
```

## Non-Negotiables
1. Schema-first or code-first (pick one, be consistent)
2. DataLoader for all database associations
3. Cursor-based pagination for lists
4. Query complexity/depth limits

## Red Lines (Reject PR)
- N+1 queries without DataLoader
- Unbounded list queries (require pagination)
- Exposing internal errors to clients
- Missing authentication/authorization
- Over-fetching sensitive fields
- Secrets in schema or resolvers

## Testing Strategy
- **Unit**: Resolver unit tests
- **Integration**: Full query tests
- **Schema**: Breaking change detection

## Common Pitfalls
| Pitfall | Fix |
|---------|-----|
| N+1 queries | Use DataLoader everywhere |
| Circular references | Lazy loading, depth limits |
| Schema breaking changes | Use schema registry |
| Over-fetching | Field-level authorization |

## Performance Red Lines
- No N+1 database queries
- No unbounded result sets
- No expensive computations without caching

## Security Checklist
- [ ] Authentication on all mutations
- [ ] Field-level authorization
- [ ] Query complexity limits enforced
- [ ] Introspection disabled in production
