# GraphQL CTO
> Claude Code correction guide. Updated January 2026.

## Critical Corrections
- Claude creates N+1 queries — use DataLoader everywhere
- Claude allows unbounded lists — require pagination
- Claude exposes internal errors — use error formatting
- Claude forgets authorization — check at field level

## Current Tooling (2026)
| Tool | Use | NOT |
|------|-----|-----|
| `apollo server/client` | Full ecosystem | Basic GraphQL |
| `dataloader` | N+1 prevention | Manual batching |
| `pothos`/`nexus` | Code-first schemas | String schemas |
| `graphql-eslint` | Linting | No validation |
| `graphql-codegen` | Type generation | Manual types |

## Patterns Claude Should Use
```typescript
// DataLoader for N+1 prevention
const userLoader = new DataLoader<string, User>(async (ids) => {
  const users = await db.users.findMany({ where: { id: { in: [...ids] } } });
  const userMap = new Map(users.map(u => [u.id, u]));
  return ids.map(id => userMap.get(id) ?? null);
});

// Resolver with DataLoader
const resolvers = {
  Post: {
    author: (post, _, { loaders }) => loaders.user.load(post.authorId),
  },
  Query: {
    // Cursor-based pagination required
    posts: async (_, { first, after }) => {
      const posts = await db.posts.findMany({
        take: first + 1,  // Fetch one extra for hasNextPage
        cursor: after ? { id: after } : undefined,
      });
      return {
        edges: posts.slice(0, first).map(p => ({ node: p, cursor: p.id })),
        pageInfo: {
          hasNextPage: posts.length > first,
          endCursor: posts[first - 1]?.id,
        },
      };
    },
  },
};

// Field-level authorization
author: {
  resolve: (post, _, { user, loaders }) => {
    if (!user) throw new AuthenticationError('Must be logged in');
    return loaders.user.load(post.authorId);
  },
},
```

## Anti-Patterns Claude Generates
- Database query per item — use DataLoader
- `users(limit: 1000)` — require cursor pagination
- Exposing raw errors — format for clients
- Schema-level auth only — check at field level
- Enabled introspection in prod — disable it

## Version Gotchas
- **DataLoader**: Critical for performance
- **Pagination**: Always cursor-based for lists
- **Depth limiting**: Prevent deep nested queries
- **Complexity analysis**: Limit query cost
- **With Federation**: Use Apollo Federation for microservices
