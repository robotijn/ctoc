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

## Cypher Footguns (index, cartesian product, variable-length paths, supernodes)
The most common Cypher bug Claude writes is a `MATCH` on a property with **no
index**, forcing a label scan of every node. Always confirm the plan with
`PROFILE`/`EXPLAIN` and look for a `NodeIndexSeek`, never an `AllNodesScan` or
`NodeByLabelScan` on a hot path.

```cypher
// FOOTGUN: no index on :User(email) -> NodeByLabelScan over every User
PROFILE MATCH (u:User {email: $email}) RETURN u;   // db hits ~ node count

// RIGHT: a lookup index (or uniqueness constraint, which creates a backing index)
CREATE CONSTRAINT user_email_unique FOR (u:User) REQUIRE u.email IS UNIQUE;
PROFILE MATCH (u:User {email: $email}) RETURN u;   // now NodeIndexSeek, db hits ~ 1
```

- **Cartesian products:** two disconnected patterns in one `MATCH` multiply rows
  (Neo4j warns `This query builds a cartesian product`). Connect the patterns with a
  relationship, or split into `MATCH ... WITH ... MATCH ...`.
- **Unbounded variable-length paths:** `-[:FOLLOWS*]->` (no bound) walks the entire
  reachable graph and OOMs. Always bound: `*1..3`. Add `WHERE` predicates and a
  `LIMIT`.
- **Supernodes:** a node with millions of relationships (a "supernode") makes any
  traversal through it catastrophically slow. Model around it — bucket relationships,
  add an intermediate node, or filter on relationship type/property before expanding.

```cypher
// FOOTGUN: cartesian product — u and p are unconnected, rows = |User| * |Product|
MATCH (u:User), (p:Product) RETURN u, p;

// RIGHT: connect them, and bound any variable-length expansion
MATCH (u:User {id: $userId})-[:PURCHASED*1..2]->(p:Product)
RETURN DISTINCT p.name LIMIT 50;
```
[neo4j.com/docs/cypher-manual/current/planning-and-tuning/ +
neo4j.com/docs/cypher-manual/current/indexes/, retrieved 2026-07-10]

## Correctness — MERGE semantics and accidental duplicates
```cypher
// FOOTGUN: MERGE on the WHOLE pattern (node + all properties) creates a duplicate
// node whenever any property differs from an existing one
MERGE (u:User {id: $id, lastSeen: $now});   // new lastSeen each call -> duplicate Users

// RIGHT: MERGE on the IDENTIFYING key only, then SET the mutable properties
MERGE (u:User {id: $id})           // matches on stable identity
ON CREATE SET u.createdAt = $now
ON MATCH  SET u.lastSeen  = $now;  // update in place, no duplicate
```

- **A uniqueness constraint is the backstop.** `MERGE` alone does not guarantee
  uniqueness under concurrency — two transactions can both miss and both create.
  `CREATE CONSTRAINT ... REQUIRE u.id IS UNIQUE` makes the duplicate fail loudly and
  provides the index `MERGE` needs to be fast.
- **`MERGE` on a relationship** between two already-matched nodes is safe; `MERGE` on
  a pattern that includes unmatched nodes may create more than you expect — split the
  node `MERGE`s first, then `MERGE` the relationship.
  [neo4j.com/docs/cypher-manual/current/clauses/merge/, retrieved 2026-07-10]

## Security — Cypher parameters ($param), not string concat (CWE-943)
Concatenating user input into a Cypher string is **Cypher injection —
CWE-943 (Improper Neutralization of Special Elements in Data Query Logic)**, the
graph analogue of SQL injection. It is **CWE-943, not CWE-89** (CWE-89 is SQL).
Always pass user values as **`$param`** parameters; the driver sends them out-of-band
so they can never change query structure. (Parameters also enable query-plan caching.)

```javascript
// FOOTGUN: string-built Cypher — a crafted name rewrites the query
const q = `MATCH (u:User {name: '${req.query.name}'}) RETURN u`;
session.run(q);   // name = "') DETACH DELETE (u) //" deletes data

// RIGHT: $name parameter — value is data, never executable Cypher
session.run(
  'MATCH (u:User {name: $name}) RETURN u',
  { name: String(req.query.name) }
);
```

- **Labels and relationship types cannot be parameterized** in Cypher. If they must
  be dynamic, whitelist against a fixed allow-list of known labels — never interpolate
  a user string as a label.
- Grant the app user least-privilege roles (Neo4j RBAC: `reader`/`editor`, custom
  roles); never run application queries as `neo4j`/admin.
  [cwe.mitre.org/data/definitions/943.html +
  neo4j.com/docs/cypher-manual/current/syntax/parameters/, retrieved 2026-07-10]

## Error Handling & Testing
```javascript
const neo4j = require('neo4j-driver');
const driver = neo4j.driver(uri, neo4j.auth.basic(user, pass));
const session = driver.session();
try {
  await session.executeWrite(tx =>
    tx.run('MERGE (u:User {id:$id}) ON CREATE SET u.createdAt=$now', { id, now }));
} catch (e) {
  // ConstraintValidationFailed => a real uniqueness collision; surface it
  if (e.code === 'Neo.ClientError.Schema.ConstraintValidationFailed') throw new Conflict();
  throw e;                     // never empty-catch; e.code names the exact Neo4j error
} finally {
  await session.close();       // sessions/driver MUST be closed (connection leak otherwise)
}
```

- Use **managed transaction functions** (`executeWrite`/`executeRead`) — they retry
  transient errors (`Neo.TransientError.*`, e.g. deadlocks) automatically.
- Test error paths: constraint violation, transient/deadlock retry, and assert
  `PROFILE` reports `NodeIndexSeek` (not `AllNodesScan`) on hot queries so a dropped
  index fails the test.
- Test against a real Neo4j via **Testcontainers** (`neo4j:2026.06` image), never a
  mock of the driver.

## Performance Traps
- **`PROFILE` every hot query** and confirm `NodeIndexSeek`/`NodeIndexScan`, not
  `AllNodesScan`/`NodeByLabelScan`; watch `db hits`.
- **Parameterize** so the planner caches the compiled plan — literal-valued queries
  recompile every call and thrash the plan cache.
- **Bound variable-length paths** (`*1..n`) and prefer directed relationships
  (`-[:R]->`) so the expansion is smaller.
- **Avoid supernodes** on the traversal path; filter on relationship type/property
  before expanding a high-degree node.

## Version-Specific Gotchas (dated, sourced)
- Neo4j moved to **calendar versioning**: **2026.06.0** is the current release line;
  **5.26** is the current **LTS** (long-term support) for teams that pin an LTS. The
  Docker tag `neo4j:2026.06` / `neo4j:5.26` selects them.
  [neo4j.com/release-notes/database/, retrieved 2026-07-10]
- **`neo4j` driver 6.2.0** is current on both npm and PyPI (PyPI upload 2026-05-04).
  [pypi.org/pypi/neo4j/json + registry.npmjs.org/neo4j-driver, retrieved 2026-07-10]
- **APOC** (batch/util procedures) and **GDS** (Graph Data Science) are installed
  separately and version-matched to the server; a mismatch fails at startup.

## References (retrieved 2026-07-10)
- Neo4j release notes: https://neo4j.com/release-notes/database/
- Cypher parameters: https://neo4j.com/docs/cypher-manual/current/syntax/parameters/
- MERGE clause: https://neo4j.com/docs/cypher-manual/current/clauses/merge/
- Indexes: https://neo4j.com/docs/cypher-manual/current/indexes/
- Planning & tuning (PROFILE/EXPLAIN): https://neo4j.com/docs/cypher-manual/current/planning-and-tuning/
- CWE-943 (query injection): https://cwe.mitre.org/data/definitions/943.html
- neo4j driver (PyPI JSON): https://pypi.org/pypi/neo4j/json
