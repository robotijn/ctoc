# Neo4j CTO
> Native graph database for connected data and relationship-centric queries.

## Commands
```bash
# Setup | Dev | Test
docker run -d --name neo4j -p 7474:7474 -p 7687:7687 neo4j:latest
cypher-shell -u neo4j -p password "RETURN 1"
cypher-shell -f tests/queries.cypher
```

## Non-Negotiables
1. Proper graph modeling (nodes for entities, relationships for connections)
2. Indexes on all lookup properties
3. Parameterized queries for caching
4. APOC library for extended functionality
5. Bounded variable-length paths with limits
6. Profile queries before production

## Red Lines
- Dense properties on relationships (use nodes)
- Missing indexes on frequently queried properties
- Unbounded variable-length paths `[*]`
- MATCH patterns without WHERE constraints
- Cartesian products from disconnected patterns

## Pattern: Graph Data Modeling
```cypher
// Create indexes first
CREATE INDEX user_email FOR (u:User) ON (u.email);
CREATE INDEX product_sku FOR (p:Product) ON (p.sku);
CREATE CONSTRAINT user_id_unique FOR (u:User) REQUIRE u.id IS UNIQUE;

// Parameterized query with bounded path
:param userId => 'user-123'

MATCH (u:User {id: $userId})-[:PURCHASED]->(o:Order)-[:CONTAINS]->(p:Product)
WHERE o.date > date() - duration('P30D')
RETURN p.name, count(o) AS purchase_count
ORDER BY purchase_count DESC
LIMIT 10;

// Bounded path traversal for recommendations
MATCH (u:User {id: $userId})-[:PURCHASED]->(:Order)-[:CONTAINS]->(p:Product)
      <-[:CONTAINS]-(:Order)<-[:PURCHASED]-(other:User)
      -[:PURCHASED]->(:Order)-[:CONTAINS]->(rec:Product)
WHERE NOT (u)-[:PURCHASED]->(:Order)-[:CONTAINS]->(rec)
  AND u <> other
RETURN rec.name, count(DISTINCT other) AS recommenders
ORDER BY recommenders DESC
LIMIT 5;

// APOC for batch operations
CALL apoc.periodic.iterate(
    "MATCH (u:User) WHERE u.lastActive < date() - duration('P90D') RETURN u",
    "SET u:Inactive",
    {batchSize: 1000, parallel: true}
);
```

## Integrates With
- **Drivers**: Official drivers for Python, Java, JS, .NET
- **Viz**: Neo4j Browser, Bloom for exploration
- **ETL**: Kafka Connect, APOC import procedures

## Common Errors
| Error | Fix |
|-------|-----|
| `Cartesian product warning` | Connect patterns with relationships |
| `MATCH caused eager` | Profile and restructure query |
| `OutOfMemory on path` | Add path length limits `[*1..5]` |
| `Index not found` | Create index and wait for population |

## Prod Ready
- [ ] Indexes on all lookup properties
- [ ] Constraints for data integrity
- [ ] Query profiling completed
- [ ] Causal clustering for HA
- [ ] APOC library installed
