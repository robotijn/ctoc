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

## Multi-model Footguns (AQL, indexes, traversal depth, join cost)
ArangoDB is one engine over documents, graphs and key/value; the correctness trap
is treating a **graph** as a document collection (or vice-versa) and writing AQL
that scans instead of using an index or bounded traversal.

```aql
// FOOTGUN: no index on `email` -> full collection scan on every lookup
FOR u IN users FILTER u.email == @email RETURN u

// RIGHT: create a persistent index once, then the same FILTER uses it
// db.users.ensureIndex({ type: "persistent", fields: ["email"], unique: true })
FOR u IN users FILTER u.email == @email LIMIT 1 RETURN u

// Inspect the plan — look for an IndexNode, not an EnumerateCollectionNode
// db._explain("FOR u IN users FILTER u.email == @email RETURN u")
```

- **Bounded traversal is mandatory.** `FOR v,e,p IN 1..3 OUTBOUND start edges` sets
  min..max depth; an unbounded `0..` traversal over a dense graph explodes memory.
  Always pass `OPTIONS { bfs: true, uniqueVertices: "global" }` for shortest-path
  style traversals so vertices are not revisited.
- **Edge vs document collection:** relationships MUST live in an **edge collection**
  (`db._createEdgeCollection("follows")`) with `_from`/`_to`; a document collection
  cannot be traversed. Index `_from`/`_to` for the traversal direction you query.
- **`persistent` (RocksDB) index** is the general-purpose index today; a `hash`
  index only helps exact-match equality. A missing index on a `FILTER` predicate is
  the #1 AQL performance bug.
  [docs.arangodb.com/3.12/aql/graphs/traversals/ +
  docs.arangodb.com/3.12/index-and-search/indexing/, retrieved 2026-07-10]

## Consistency (write concern, SmartGraphs, cluster)
```aql
// FOOTGUN: a cross-collection multi-document change is NOT atomic unless declared
// (single-server single-collection writes are atomic; multi-collection needs a
//  transaction with explicit write locks)

// RIGHT: JS transaction API declaring the collections it writes (exclusive locks)
db._executeTransaction({
  collections: { write: ["accounts"] },
  action: function ({ from, to, amount }) {
    const db = require("@arangodb").db;
    db.accounts.update(from, { bal: db.accounts.document(from).bal - amount });
    db.accounts.update(to,   { bal: db.accounts.document(to).bal   + amount });
  },
  params: { from, to, amount: 100 }
});
```

- In a **cluster**, a plain graph is sharded arbitrarily so traversals cross network
  boundaries; use **SmartGraphs** (Enterprise) to co-locate connected vertices on the
  same shard and cut inter-node hops.
- Set the **write concern** (`writeConcern` / `minReplicationFactor`) so a write is
  acknowledged only after enough replicas have it; the default can ack before full
  replication.
  [docs.arangodb.com/3.12/develop/transactions/, retrieved 2026-07-10]

## Security — AQL bind parameters, not string concat (CWE-943)
Building an AQL string by concatenating user input is **query injection —
CWE-943 (Improper Neutralization of Special Elements in Data Query Logic)**. It is
**CWE-943, not CWE-89** (CWE-89 is SQL). Always pass user values as **bind
parameters** (`@value`) and collection names as **`@@collection`** bind parameters.

```javascript
// FOOTGUN: string-concatenated AQL — a crafted `name` rewrites the query
const q = `FOR u IN users FILTER u.name == "${req.query.name}" RETURN u`;
db._query(q);   // name = '" RETURN u._key // ' leaks or alters the query

// RIGHT: value bind parameter @name — the driver never lets it change query structure
db._query(
  `FOR u IN users FILTER u.name == @name LIMIT 1 RETURN u`,
  { name: String(req.query.name) }
);

// Collection names are bind parameters too (@@coll), never interpolated strings
db._query(`FOR d IN @@coll FILTER d.active == @a RETURN d`,
          { "@coll": "users", a: true });
```

- Enforce **RBAC**: give the application user the minimum database/collection
  permissions (`rw` only where needed, `none` elsewhere) via
  `arangosh`/`users` API; never connect as `root` from app code.
- Bind parameters make the value **data**, never executable query structure — this
  is the single defence against AQL injection.
  [cwe.mitre.org/data/definitions/943.html +
  docs.arangodb.com/3.12/aql/fundamentals/bind-parameters/, retrieved 2026-07-10]

## Error Handling & Testing
```javascript
const { aql, ArangoError } = require("arangojs");
try {
  await db.query(aql`INSERT ${doc} INTO users`);   // aql`` template = safe bind params
} catch (e) {
  if (e instanceof ArangoError && e.errorNum === 1210) throw new Conflict("unique constraint");
  throw e;   // never empty-catch; ArangoError.errorNum identifies the exact failure
}
```

- The `arangojs` **`aql` template tag** builds bind parameters automatically — prefer
  it over manual string queries; it makes injection structurally impossible.
- Test error paths: unique-constraint violation (`errorNum 1210`), traversal depth
  limit, missing-index scan (assert the `_explain` plan uses an `IndexNode`).
- Test against a **real ArangoDB** (the official Docker image `arangodb/arangodb:3.12`),
  not a mock of the driver.

## Performance Traps
- **Filter before traversal**, not after — `FILTER` on the start set prunes the graph
  frontier early; a post-traversal `FILTER` expands the whole neighbourhood first.
- **`db._explain(query)`** must show an `IndexNode` for each predicate; an
  `EnumerateCollectionNode` means a full scan — add the index.
- **`OPTIONS { uniqueVertices: "global", bfs: true }`** stops a traversal revisiting
  vertices (supernode blow-up); pick the smallest useful `max` depth.
- **`LIMIT` early** so the optimizer can stop producing rows once enough are found.

## Version-Specific Gotchas (dated, sourced)
- **ArangoDB 3.12** is the current stable server line (improved AQL optimizer, RocksDB
  engine, better graph performance); the Docker image is `arangodb/arangodb:3.12`.
  [docs.arangodb.com/3.12/, retrieved 2026-07-10]
- **`python-arango` 8.3.3** (PyPI, uploaded 2026-06-01) is the current Python driver;
  `arangojs` is the maintained Node driver with the safe `aql` template tag.
  [pypi.org/pypi/python-arango/json, retrieved 2026-07-10]
- **SmartGraphs / ArangoSearch / Foxx** are version-stable features; SmartGraphs and
  disjoint SmartGraphs require an Enterprise license in a cluster.

## References (retrieved 2026-07-10)
- ArangoDB 3.12 docs: https://docs.arangodb.com/3.12/
- AQL bind parameters: https://docs.arangodb.com/3.12/aql/fundamentals/bind-parameters/
- Graph traversals: https://docs.arangodb.com/3.12/aql/graphs/traversals/
- Indexing: https://docs.arangodb.com/3.12/index-and-search/indexing/
- Transactions: https://docs.arangodb.com/3.12/develop/transactions/
- CWE-943 (query injection): https://cwe.mitre.org/data/definitions/943.html
- python-arango (PyPI JSON): https://pypi.org/pypi/python-arango/json
