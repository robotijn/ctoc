# Dgraph CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
docker run -d --name dgraph -p 8080:8080 -p 9080:9080 dgraph/standalone:v23
# GraphQL at http://localhost:8080/graphql
# Admin at http://localhost:8080/admin
```

## Claude's Common Mistakes
1. **Missing @index directives** - Queries fail without proper indexes
2. **No type schema** - Dgraph needs explicit type definitions
3. **Unbounded recursive queries** - Always use first/offset pagination
4. **Ignoring @reverse for bidirectional** - Needed for reverse edge traversal
5. **DQL vs GraphQL confusion** - Different query languages for different APIs

## Correct Patterns (2026)
```graphql
# Schema with proper indexes (REQUIRED)
type User {
  name: String @search(by: [term, fulltext])
  email: String @search(by: [hash]) @id
  age: Int @search
  friends: [User] @hasInverse(field: friends)
  posts: [Post]
  createdAt: DateTime @search(by: [hour])
}

type Post {
  title: String @search(by: [term, fulltext])
  content: String
  author: User @hasInverse(field: posts)
  tags: [String] @search(by: [exact])
}
```

```graphql
# GraphQL query with pagination (REQUIRED)
query GetUsers {
  queryUser(
    filter: { age: { ge: 18 }, has: email }
    order: { desc: createdAt }
    first: 20
    offset: 0
  ) {
    id
    name
    email
    posts(order: { desc: createdAt }, first: 5) {
      title
      tags
    }
  }
}
```

## Version Gotchas
- **v23+**: Improved GraphQL support, better performance
- **@hasInverse**: Required for bidirectional relationships
- **@search**: Must specify index type (term, hash, exact, etc.)
- **Cloud vs Self-hosted**: Different deployment considerations

## What NOT to Do
- Do NOT query predicates without @search indexes
- Do NOT skip pagination (first/offset required)
- Do NOT forget @hasInverse for bidirectional edges
- Do NOT mix DQL and GraphQL patterns incorrectly

## Graph Footguns (DQL/GraphQL±, @index, @reverse, upsert, expand-all)
Dgraph exposes two query languages: **DQL** (native, `query { ... }`) and **GraphQL**
(schema-generated). The most common bug Claude writes is a `DQL` filter or ordering
on a predicate with **no `@index`** — Dgraph rejects it (`Predicate ... is not
indexed`) or scans, and adding the right index token type is mandatory.

```dql
# FOOTGUN: filtering/ordering an un-indexed predicate fails or is slow
{ q(func: eq(email, "a@b.co")) { uid name } }   # error unless email has @index

# RIGHT: declare the DQL schema with the matching tokenizer, THEN query
# schema (via /alter):
#   email: string @index(hash) @upsert .
#   name:  string @index(term) .
#   friend: [uid] @reverse .        # enables reverse-edge traversal ~friend
{ q(func: eq(email, "a@b.co")) { uid name friend { name } } }
```

- **`@index(<tokenizer>)`** is per-predicate and token-specific: `hash`/`exact` for
  equality, `term`/`fulltext` for text search, `int`/`float`/`dt` for ranges. A
  `func: eq/le/anyofterms` on a predicate whose index lacks the right tokenizer fails.
- **`@reverse`** on a `uid` predicate is required to traverse an edge backwards
  (`~friend`); without it reverse queries return nothing.
- **`expand(_all_)`** fetches every predicate on a node — cheap on a small node,
  expensive on a wide one; list the predicates you need instead on hot paths.
- **Always paginate** with `first:`/`offset:` (GraphQL) or `first`/`offset` (DQL); an
  unpaginated `queryUser`/root func can return the whole graph.
  [dgraph.io/docs/dql/predicate-indexing/ + dgraph.io/docs/dql/dql-schema/,
  retrieved 2026-07-10]

## Consistency (best-effort vs linearizable reads, transaction conflicts)
Dgraph is transactional and distributed; a write transaction can fail with a
**transaction conflict** (`ErrAborted`) when two transactions touch the same data —
this is expected and MUST be retried, not swallowed.

```dql
# Upsert block: query + conditional mutation in ONE transaction (atomic get-or-create)
upsert {
  query {
    v as var(func: eq(email, "a@b.co"))     # v = existing uid (empty if none)
  }
  mutation {
    set {
      uid(v) <email> "a@b.co" .             # updates existing or creates new node
      uid(v) <name>  "Ada" .
    }
  }
}
```

```go
// Transaction conflict MUST be retried (do not ignore ErrAborted)
for {
  txn := dg.NewTxn()
  _, err := txn.Mutate(ctx, mu)
  if err == nil { err = txn.Commit(ctx) }
  if err == dgo.ErrAborted { continue }     // conflict -> retry the whole txn
  break
}
```

- **Reads** default to *best-effort* (may be slightly stale for lower latency); pass
  `BestEffort(false)` / use a read-write txn for **linearizable** reads when you need
  read-your-writes.
- **`@upsert`** on the predicate in the DQL schema is required for the upsert block to
  enforce uniqueness/conflict detection on that predicate.
  [dgraph.io/docs/mutations/upsert-block/ + dgraph.io/docs/design-concepts/consistency-model/,
  retrieved 2026-07-10]

## Security — parameterized DQL variables and ACL
Build DQL/GraphQL with **query variables**, never string concatenation of user input;
concatenating a user string into a query is query injection (the CWE-943 class,
*Improper Neutralization of Special Elements in Data Query Logic* — not CWE-89, which
is SQL). Dgraph's Go/JS clients bind `$var` values out-of-band.

```go
// FOOTGUN: string-built DQL — a crafted value rewrites the query
q := `{ q(func: eq(email, "` + userInput + `")) { uid } }`   // injectable

// RIGHT: parameterized DQL variables ($email is data, never query structure)
vars := map[string]string{"$email": userInput}
q := `query u($email: string) { q(func: eq(email, $email)) { uid name } }`
resp, err := dg.NewReadOnlyTxn().QueryWithVars(ctx, q, vars)
```

- Enable **ACL** (Enterprise): create users, groups and per-predicate `READ`/`WRITE`/
  `MODIFY` rules so the app connects with least privilege — never as `groot` from app
  code. Guard the `/alter` (schema) endpoint especially.
- GraphQL `@auth` rules attach row-level authorization to types; use them so a query
  can only return the caller's own data.
  [cwe.mitre.org/data/definitions/943.html + dgraph.io/docs/enterprise-features/access-control-lists/,
  retrieved 2026-07-10]

## Error Handling & Testing
```go
resp, err := txn.Mutate(ctx, mu)
if err != nil {
  if err == dgo.ErrAborted { /* retry the transaction */ }
  return fmt.Errorf("dgraph mutate: %w", err)   // never swallow; wrap and surface
}
```

- Test error paths: transaction conflict/retry (`ErrAborted`), missing-`@index`
  query rejection, and a schema `/alter` before querying an indexed predicate.
- Assert the DQL schema contains the required `@index`/`@reverse`/`@upsert` directives
  so a dropped directive fails the test loudly.
- Test against a **real Dgraph** (`dgraph/standalone:v25.3` container), never a mock of
  the client — you would otherwise test the mock, not the query.

## Performance Traps
- **Index only what you query** — every `@index` costs write throughput and disk;
  add the tokenizer the query needs and no more.
- **List predicates instead of `expand(_all_)`** on hot reads over wide nodes.
- **Paginate** every root func (`first`/`offset`) and cursor with `after:` on large
  result sets.
- **`@reverse`** avoids materializing a second edge predicate for the reverse
  direction — cheaper than maintaining both edges by hand.

## Version-Specific Gotchas (dated, sourced)
- **Dgraph v25.3.8** is the current release (published 2026-07-09 on GitHub); the
  Docker image is `dgraph/standalone:v25.3`. (The old `v23` in the Installation block
  above predates this — pin v25.3 for new work.)
  [github.com/dgraph-io/dgraph/releases, retrieved 2026-07-10]
- **`pydgraph` 25.2.0** (PyPI, uploaded 2026-02-25) is the current Python client;
  `dgo` is the official Go client. Client major versions track the server line.
  [pypi.org/pypi/pydgraph/json, retrieved 2026-07-10]
- **DQL vs GraphQL:** the generated GraphQL API and native DQL share the same
  underlying store but have different syntax and index declarations — do not mix
  their directives (`@search` is GraphQL-schema, `@index` is DQL-schema).

## References (retrieved 2026-07-10)
- Dgraph releases: https://github.com/dgraph-io/dgraph/releases
- DQL predicate indexing: https://dgraph.io/docs/dql/predicate-indexing/
- DQL schema: https://dgraph.io/docs/dql/dql-schema/
- Upsert block: https://dgraph.io/docs/mutations/upsert-block/
- Consistency model: https://dgraph.io/docs/design-concepts/consistency-model/
- Access control (ACL): https://dgraph.io/docs/enterprise-features/access-control-lists/
- CWE-943 (query injection): https://cwe.mitre.org/data/definitions/943.html
- pydgraph (PyPI JSON): https://pypi.org/pypi/pydgraph/json
