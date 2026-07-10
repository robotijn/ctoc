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

## Query-Complexity / N+1 Footguns
The single most common GraphQL performance bug is a resolver that fires one database
query per parent object (**N+1**). Batch with **DataLoader**, which coalesces the
per-item loads inside a single tick into one backend call.

```typescript
// FOOTGUN: Post.author resolver runs once PER post -> N+1 queries.
Post: { author: (post) => db.user.findUnique({ where: { id: post.authorId } }) }

// FIX: one DataLoader per request; keys are batched into a single IN (...) query.
const userLoader = new DataLoader<string, User>(async (ids) =>
  db.user.findMany({ where: { id: { in: [...ids] } } })
    .then((rows) => ids.map((id) => rows.find((u) => u.id === id) ?? null)));
Post: { author: (post) => userLoader.load(post.authorId) }
```
- **Create the loader per request**, never module-global — a shared loader leaks one
  user's data into another's cache and never sees fresh writes.
- **List-field fan-out** multiplies work: a list of N posts each resolving a list of M
  comments is N×M loads — batch every level.
- **Unbounded nesting** (`user { posts { author { posts { ... } } } }`) lets a client
  demand exponential work from a small query string — see the DoS control below.

## Error Handling Idioms
GraphQL does not use HTTP status for field errors — a response can be **`200 OK` with
a top-level `errors` array** and partial `data`. Clients MUST inspect `errors`.

```typescript
// A resolver throwing produces an entry in `errors` and nulls that field.
// Nullability propagation: if a NON-NULL field (String!) errors, the error
// "bubbles up" and nulls the nearest NULLABLE parent — a single deep failure can
// null a large subtree. Design schemas so recoverable fields are nullable.

// Return typed, client-safe error extensions; never leak internals:
throw new GraphQLError('Forbidden', {
  extensions: { code: 'FORBIDDEN' },   // stable machine-readable code
});
// Do NOT return raw exception messages/stack traces to clients (info disclosure).
```
- Distinguish **request errors** (whole operation invalid → no `data`) from **field
  errors** (partial `data` + `errors`). Log the cause server-side; return a generic
  message + a stable `code` to the client.

## Security and Dependency Gotchas
- **Query-depth / complexity DoS — CWE-770**: without limits, a client can send a
  small but deeply nested or highly-branching query that forces unbounded work
  (allocation of resources without throttling). Enforce a **max depth** AND a
  **cost/complexity budget**, and prefer **persisted queries** (an allow-list of
  known operation hashes) in production. (CWE-770 "Allocation of Resources Without
  Limits or Throttling" — cwe.mitre.org.)

```typescript
// Depth + complexity limiting at the validation stage (before execution):
const server = new ApolloServer({
  validationRules: [depthLimit(8)],           // reject queries deeper than 8
  plugins: [createComplexityPlugin({ maximumComplexity: 1000 })],
});
// Persisted queries: server executes only pre-registered operation hashes,
// so arbitrary attacker-crafted queries are rejected outright.
```
- **Introspection exposure**: `__schema` / `__type` reveal your entire type graph and
  hidden fields — **disable introspection in production** (or gate it behind auth).
  It is enabled by default in most servers.
- **Injection via unvalidated arguments**: a field argument forwarded into a
  downstream SQL/NoSQL/OS call is still injection — validate and parameterize at the
  resolver, exactly as for any untrusted input.
- **Batching abuse / aliases**: attackers duplicate an expensive field via aliases or
  array-batched operations to multiply cost — cap operation count and apply the same
  complexity budget across the whole request.

## Testing Conventions
- **Schema / contract tests** — snapshot the SDL and fail CI on unexpected changes.
- **Resolver unit tests** — call the resolver with a mocked context (loaders, auth)
  and assert the shape; test the error path (throws → `errors` entry), not just happy.
- **`graphql-inspector`** — diffs two schemas and flags **breaking changes** (removed
  field, narrowed type) in CI before they ship to clients.
- **Persisted-query / depth-limit tests** — assert that an over-deep or
  non-allow-listed query is rejected, so the DoS control cannot silently regress.

## Performance Traps
- **Over-fetching in resolvers**: selecting all columns when the query asked for two —
  push the requested field set down to the data layer where practical.
- **Missing field-level caching**: memoize per-request (DataLoader cache) and cache
  hot, cacheable fields across requests with a TTL.
- **No pagination on lists**: return **cursor connections** (`edges`/`pageInfo`), not
  unbounded arrays — an unbounded list is both a perf trap and a DoS vector.
- **Synchronous / blocking resolvers**: a CPU-heavy or blocking call in a resolver
  stalls the event loop and every concurrent request — offload it.

## Version-Specific Gotchas (dated, sourced)
- The current **ratified** GraphQL specification edition is **October 2021**; newer
  work (including **incremental delivery, `@defer` / `@stream`**) lives in the
  **Working Draft** at spec.graphql.org and is not part of the ratified 2021 edition —
  confirm your server's support before relying on it, and pin the draft you target.
  [spec.graphql.org (editions list: October 2021 + Working Draft), retrieved 2026-07-10]
- Server implementations gate features independently of the spec edition; treat
  `@defer`/`@stream` and full-schema introspection controls as
  implementation-and-version-specific, never assumed.

## References (retrieved 2026-07-10)
- CWE-770 (Allocation of Resources Without Limits or Throttling): https://cwe.mitre.org/data/definitions/770.html
- GraphQL specification (editions + Working Draft): https://spec.graphql.org/
- GraphQL security guidance: https://graphql.org/learn/security/
- OWASP GraphQL Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/GraphQL_Cheat_Sheet.html
