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
