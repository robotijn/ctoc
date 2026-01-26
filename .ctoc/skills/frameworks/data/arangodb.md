# ArangoDB CTO
> Multi-model database: documents, graphs, and key-value in one engine.

## Commands
```bash
# Setup | Dev | Test
docker run -d --name arango -p 8529:8529 arangodb/arangodb
arangosh --server.endpoint tcp://localhost:8529
arangosh --javascript.execute tests/queries.js
```

## Non-Negotiables
1. Collection type matches use case (document vs. edge)
2. AQL queries with FILTER before traversal
3. Persistent indexes on filtered/sorted fields
4. Graph traversals with depth limits
5. Foxx microservices for server-side logic
6. Proper _key design for document lookups

## Red Lines
- Wrong collection type for access pattern
- Missing indexes on query predicates
- Unbounded graph traversals without limits
- Using document collections for relationships
- Ignoring query explain output

## Pattern: Multi-Model Data Access
```javascript
// Document collection with proper indexing
db._create("users");
db.users.ensureIndex({ type: "persistent", fields: ["email"], unique: true });
db.users.ensureIndex({ type: "persistent", fields: ["status", "createdAt"] });

// Edge collection for relationships
db._createEdgeCollection("follows");
db.follows.ensureIndex({ type: "persistent", fields: ["_from", "createdAt"] });

// AQL: Combined document and graph query
FOR user IN users
  FILTER user.status == "active"
  LET followers = (
    FOR v, e IN 1..1 INBOUND user follows
      FILTER e.createdAt > DATE_SUBTRACT(DATE_NOW(), 30, "day")
      RETURN v
  )
  FILTER LENGTH(followers) > 10
  SORT LENGTH(followers) DESC
  LIMIT 100
  RETURN {
    user: user,
    followerCount: LENGTH(followers),
    recentFollowers: SLICE(followers, 0, 5)
  }

// Graph traversal with bounds
FOR v, e, p IN 1..3 OUTBOUND "users/123" follows
  OPTIONS { bfs: true, uniqueVertices: "global" }
  FILTER v.status == "active"
  RETURN v
```

## Integrates With
- **Drivers**: Official drivers for Python, Java, Node.js, Go
- **Search**: Integrated ArangoSearch with analyzers
- **Foxx**: Server-side JavaScript microservices

## Common Errors
| Error | Fix |
|-------|-----|
| `collection not found` | Check collection name and database |
| `unique constraint violated` | Handle upsert or check exists |
| `AQL query timeout` | Add LIMIT, optimize with EXPLAIN |
| `out of memory` | Reduce result set or add indexes |

## Prod Ready
- [ ] Indexes on all query predicates
- [ ] Edge collections for graph relationships
- [ ] Traversal depth limits enforced
- [ ] Query performance profiled
- [ ] Cluster mode for high availability
