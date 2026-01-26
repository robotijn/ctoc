# Dgraph CTO
> Distributed native GraphQL database for connected data at scale.

## Commands
```bash
# Setup | Dev | Test
docker run -d --name dgraph -p 8080:8080 -p 9080:9080 dgraph/standalone
curl localhost:8080/alter -d '{"drop_all": true}'
curl localhost:8080/query -d 'query { q(func: has(name)) { name } }'
```

## Non-Negotiables
1. Schema-first with type definitions
2. Indexes on all query predicates (term, exact, hash)
3. DQL or GraphQL+/- for queries
4. ACLs for production security
5. Sharding strategy for horizontal scale
6. Backup and restore procedures tested

## Red Lines
- Missing type schema definitions
- No indexes on filtered predicates
- Unbounded recursive queries
- Ignoring sharding for large graphs
- No backup strategy
- ACLs disabled in production

## Pattern: Schema and Query Design
```graphql
# Schema with proper indexes
type User {
  name: string @index(term, fulltext) .
  email: string @index(exact) @upsert .
  age: int @index(int) .
  friends: [User] @reverse .
  posts: [Post] @reverse .
  createdAt: datetime @index(hour) .
}

type Post {
  title: string @index(term, fulltext) .
  content: string .
  author: User .
  tags: [string] @index(exact) .
}

# DQL query with filters and pagination
{
  users(func: type(User), orderdesc: createdAt, first: 20, offset: 0)
    @filter(ge(age, 18) AND has(email)) {
    uid
    name
    email
    friendCount: count(friends)
    recentPosts: posts(orderdesc: createdAt, first: 5) {
      title
      tags
    }
  }
}

# GraphQL mutation
mutation {
  addUser(input: [{
    name: "Alice"
    email: "alice@example.com"
    age: 25
  }]) {
    user { id name }
  }
}
```

## Integrates With
- **Clients**: Official Go, Python, Java, JS clients
- **GraphQL**: Native GraphQL endpoint
- **Auth**: JWT authentication, ACL rules

## Common Errors
| Error | Fix |
|-------|-----|
| `predicate not indexed` | Add @index directive to schema |
| `schema not found` | Apply schema with /alter endpoint |
| `connection refused` | Check Zero and Alpha are running |
| `query timeout` | Add pagination, optimize predicates |

## Prod Ready
- [ ] Schema with all required indexes
- [ ] ACLs configured for security
- [ ] Sharding strategy documented
- [ ] Backup automation configured
- [ ] Monitoring via Prometheus metrics
