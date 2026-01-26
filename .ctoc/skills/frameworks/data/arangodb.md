# ArangoDB CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
docker run -d --name arango -p 8529:8529 \
  -e ARANGO_ROOT_PASSWORD=password arangodb/arangodb:3.11
# Web UI at http://localhost:8529
```

## Claude's Common Mistakes
1. **Document collection for relationships** - Use edge collections for graphs
2. **Missing indexes on query predicates** - Causes full collection scans
3. **Unbounded graph traversals** - Always set depth limits (1..N)
4. **FILTER after traversal** - Filter early in AQL for performance
5. **Wrong collection type** - Document vs edge collections have different uses

## Correct Patterns (2026)
```javascript
// Document collection with indexes
db._create("users");
db.users.ensureIndex({ type: "persistent", fields: ["email"], unique: true });
db.users.ensureIndex({ type: "persistent", fields: ["status", "createdAt"] });

// Edge collection for relationships (not document!)
db._createEdgeCollection("follows");
db.follows.ensureIndex({ type: "persistent", fields: ["_from", "createdAt"] });
```

```aql
// AQL: Filter BEFORE traversal (performance critical)
FOR user IN users
  FILTER user.status == "active"  // Filter early
  LET followers = (
    FOR v, e IN 1..1 INBOUND user follows
      FILTER e.createdAt > DATE_SUBTRACT(DATE_NOW(), 30, "day")
      RETURN v
  )
  FILTER LENGTH(followers) > 10
  LIMIT 100
  RETURN { user, followerCount: LENGTH(followers) }

// Graph traversal with bounds (REQUIRED)
FOR v, e, p IN 1..3 OUTBOUND "users/123" follows
  OPTIONS { bfs: true, uniqueVertices: "global" }
  FILTER v.status == "active"
  RETURN v
```

## Version Gotchas
- **v3.11**: Improved AQL optimizer, better graph performance
- **SmartGraphs**: Enterprise feature for sharded graphs
- **ArangoSearch**: Full-text and ranking built-in
- **Foxx**: Server-side JavaScript microservices

## What NOT to Do
- Do NOT use document collections for relationships (use edge)
- Do NOT traverse without depth limits (memory explosion)
- Do NOT filter after traversal (filter early in AQL)
- Do NOT skip indexes on query predicates
