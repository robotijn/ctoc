# Neo4j CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
docker run -d --name neo4j -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/password neo4j:5
# Browser at http://localhost:7474
```

## Claude's Common Mistakes
1. **Missing indexes on lookup properties** - Causes full scans on MATCH
2. **Unbounded variable-length paths** - `[*]` without limit causes OOM
3. **Cartesian products** - Disconnected patterns multiply results
4. **Non-parameterized queries** - Prevents query plan caching
5. **Using properties for relationships** - Model relationships explicitly

## Correct Patterns (2026)
```cypher
// Create indexes FIRST (before data)
CREATE INDEX user_email FOR (u:User) ON (u.email);
CREATE CONSTRAINT user_id_unique FOR (u:User) REQUIRE u.id IS UNIQUE;

// Parameterized query (enables caching)
:param userId => 'user-123'

MATCH (u:User {id: $userId})-[:PURCHASED]->(o:Order)-[:CONTAINS]->(p:Product)
WHERE o.date > date() - duration('P30D')
RETURN p.name, count(o) AS purchase_count
ORDER BY purchase_count DESC
LIMIT 10;

// Bounded path traversal (CRITICAL - never use [*] alone)
MATCH path = (u:User {id: $userId})-[:FOLLOWS*1..3]->(friend)
WHERE NOT u = friend
RETURN DISTINCT friend.name
LIMIT 100;

// APOC for batch operations
CALL apoc.periodic.iterate(
    "MATCH (u:User) WHERE u.lastActive < date() - duration('P90D') RETURN u",
    "SET u:Inactive",
    {batchSize: 1000}
);
```

## Version Gotchas
- **v5**: New syntax for constraints and indexes
- **APOC**: Must be installed separately; essential for batch ops
- **GDS**: Graph Data Science library for algorithms
- **Aura**: Managed cloud Neo4j with automatic scaling

## What NOT to Do
- Do NOT use `[*]` without path length limits (causes OOM)
- Do NOT skip indexes on lookup properties
- Do NOT write disconnected patterns (cartesian product)
- Do NOT hardcode values in queries (use parameters)
