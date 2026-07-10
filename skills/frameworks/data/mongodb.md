# MongoDB CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
# Server
docker run -d --name mongo -p 27017:27017 mongo:7

# Drivers
pip install pymongo[srv]   # Python (includes DNS for Atlas)
npm install mongodb        # Node.js official driver
```

## Claude's Common Mistakes
1. **New connection per request** - Reuse client instance (singleton pattern)
2. **Missing compound indexes** - Queries scan entire collection
3. **Unbounded arrays** - Arrays that grow indefinitely cause document bloat
4. **No write concern for critical data** - Data loss on replica failover
5. **Using $where with user input** - JavaScript injection vulnerability

## Correct Patterns (2026)
```javascript
// Singleton client (reuse across requests)
import { MongoClient } from 'mongodb';

const client = new MongoClient(process.env.MONGO_URI, {
  maxPoolSize: 50,              // Connection pool size
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,       // 2-3x slowest query
  compressors: ['zstd'],        // Compression (MongoDB 4.2+)
});

// Ensure indexes before queries
await db.orders.createIndex({ customerId: 1, createdAt: -1 });
await db.orders.createIndex({ status: 1, createdAt: -1 });

// Aggregation with early filtering
const topProducts = await db.orders.aggregate([
  { $match: { createdAt: { $gte: new Date('2025-01-01') } } },
  { $unwind: '$items' },
  { $group: { _id: '$items.productId', revenue: { $sum: '$items.price' } } },
  { $sort: { revenue: -1 } },
  { $limit: 10 }
]).toArray();

// Write concern for critical operations
await db.orders.insertOne(order, {
  writeConcern: { w: 'majority', j: true }
});
```

## Version Gotchas
- **v7**: Improved queryable encryption, time series collections
- **Atlas**: Use `mongodb+srv://` connection string for DNS seedlist
- **Mongoose 8**: Now ESM-first; uses `mongodb` driver v6 internally
- **Motor (Python async)**: Use with asyncio, not pymongo for async

## What NOT to Do
- Do NOT create new MongoClient per request
- Do NOT use $where with untrusted input (injection risk)
- Do NOT design unbounded arrays (16MB doc limit)
- Do NOT skip compound indexes on filtered+sorted queries

## Query Footguns (COLLSCAN, $lookup, aggregation memory)
The most common MongoDB performance bug Claude writes is a query with **no
supporting index**, which the planner satisfies with a full `COLLSCAN`
(collection scan). Always confirm the plan with `explain("executionStats")`
and look for `IXSCAN`, never `COLLSCAN`, on a hot path.

```javascript
// FOOTGUN: no index on {status, createdAt} -> COLLSCAN over the whole collection
const plan = await db.orders
  .find({ status: 'open' })
  .sort({ createdAt: -1 })
  .explain('executionStats');
// plan.executionStats.executionStages.stage === 'COLLSCAN'  -> add the index

// RIGHT: a compound index that serves BOTH the equality filter AND the sort
// (ESR rule: Equality, Sort, Range — order the keys equality->sort->range)
await db.orders.createIndex({ status: 1, createdAt: -1 });
// now the same query reports stage 'IXSCAN' with no in-memory SORT
```

- **`$lookup` is a nested-loop join** — for each input document it runs a query
  against the foreign collection. Without an index on the `foreignField` it is an
  O(n·m) scan. Index the joined field, and prefer embedding for
  read-heavy 1:few relationships instead of joining at read time.
- **Aggregation pipeline memory:** each stage is capped at **100 MB of RAM** by
  default; a `$group`/`$sort` over more data fails with
  `QueryExceededMemoryLimitNoDiskUseAllowed` unless you pass
  `{ allowDiskUse: true }` (which spills to disk and is slower). Filter early with
  `$match` + `$project` so less data reaches the blocking stage.
- **Unbounded arrays** hit the hard **16 MB BSON document limit** (`BSONObjectTooLarge`).
  Model an ever-growing list (events, comments) as its own collection with a
  reference, or use the bucket pattern; never `$push` without bound.
  [www.mongodb.com/docs/manual/core/aggregation-pipeline-limits/ + /reference/limits/,
  retrieved 2026-07-10]

## Correctness (read/write concern, transactions, secondaries)
```javascript
// FOOTGUN: reading from a secondary can return STALE data (replication lag)
const stale = await db.orders.findOne(
  { _id: id }, { readPreference: 'secondaryPreferred' });   // may miss a just-written doc

// RIGHT: read-your-writes needs primary reads or causal consistency in a session
const session = client.startSession({ causalConsistency: true });
const fresh = await db.orders.findOne({ _id: id }, { session });

// Multi-document transaction (replica set / sharded cluster) — all-or-nothing
await session.withTransaction(async () => {
  await db.accounts.updateOne({ _id: from }, { $inc: { bal: -100 } }, { session });
  await db.accounts.updateOne({ _id: to },   { $inc: { bal:  100 } }, { session });
}, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
```

- **`writeConcern: { w: 'majority', j: true }`** is required for data that must
  survive a primary failover; the default `w: 1` acknowledges before replication
  and can be **rolled back** on failover (silent data loss).
- **Transactions across shards** work but hold locks and have a default 60 s
  runtime limit (`transactionLifetimeLimitSeconds`); keep them short. A retryable
  `TransientTransactionError` must be retried — `withTransaction` does this for you.
  [www.mongodb.com/docs/manual/core/transactions/ + /reference/write-concern/,
  retrieved 2026-07-10]

## Security — $where / operator injection is NoSQL injection (CWE-943)
Passing an untrusted string into `$where` (server-side JavaScript) or letting a
user-controlled object become a query **operator** is **NoSQL injection —
CWE-943 (Improper Neutralization of Special Elements in Data Query Logic)**, the
NoSQL analogue of SQL injection. It is **CWE-943, not CWE-89** (CWE-89 is SQL).

```javascript
// FOOTGUN 1: $where runs attacker JavaScript on the server
db.users.find({ $where: `this.name == '${req.query.name}'` });  // ' || true // -> dumps all

// FOOTGUN 2: operator injection — a JSON body { "$gt": "" } smuggles an operator in
db.users.findOne({ password: req.body.password });  // body = {"$gt":""} matches ANY password

// RIGHT: never use $where; coerce user input to a primitive; reject operator keys
const name = String(req.query.name);                 // force to a string, no object
db.users.find({ name });                             // driver sends it as a literal value
const password = String(req.body.password);          // strips a {$gt:...} object to "[object Object]"
db.users.findOne({ username: String(req.body.username), password });
```

- Disable server-side JS entirely when you do not need it:
  `security.javascriptEnabled: false` in mongod config (kills `$where`,
  `$accumulator`, `$function`, `mapReduce`).
- Validate/whitelist that user input destined for a query is a **primitive**, not
  an object whose keys could be `$gt`/`$ne`/`$regex`; enforce a JSON schema at the
  API boundary and use a `$jsonSchema` validator on the collection.
  [cwe.mitre.org/data/definitions/943.html +
  www.mongodb.com/docs/manual/faq/fundamentals/#how-does-mongodb-address-sql-or-query-injection,
  retrieved 2026-07-10]

## Error Handling & Testing
```javascript
import { MongoServerError } from 'mongodb';

// Duplicate-key (unique index) is code 11000 — handle it, don't swallow it
try {
  await db.users.insertOne({ email }, { writeConcern: { w: 'majority' } });
} catch (e) {
  if (e instanceof MongoServerError && e.code === 11000) throw new ConflictError('email taken');
  throw e;                       // never empty-catch; surface unknown driver errors
}

// Integration test against a real server (mongodb-memory-server), NOT a mock of the driver
import { MongoMemoryReplSet } from 'mongodb-memory-server';
const mongod = await MongoMemoryReplSet.create({ replSet: { count: 1 } }); // txns need a replset
```

- Test error paths: duplicate key (11000), write-concern timeout, transaction
  abort/retry. Assert `explain()` reports `IXSCAN` on hot queries so a dropped
  index fails the test loudly instead of silently degrading in production.
- Use `mongodb-memory-server` (a real ephemeral `mongod`) — never mock the driver,
  or you test the mock, not your query.

## Performance Traps
- **Confirm every hot query is `IXSCAN`** via `explain('executionStats')`;
  `totalDocsExamined` should be close to `nReturned`. A large ratio means the
  index is missing or not selective.
- **The ESR rule** orders compound-index keys: Equality fields, then the Sort
  field, then Range fields — a wrong order forces an in-memory `SORT` stage.
- **Covered queries** (all projected fields in the index) skip fetching documents
  entirely — fastest possible read.
- **`$regex` unanchored** (`/foo/`) cannot use an index; only a left-anchored
  prefix (`/^foo/`) does.

## Version-Specific Gotchas (dated, sourced)
- **MongoDB 8.0** is the current **LTS** server line (latest patch **8.0.27**);
  **8.2.12** is the latest rapid release. 8.0 shipped major query-execution and
  time-series improvements over 7.0.
  [www.mongodb.com/docs/manual/release-notes/8.0/, retrieved 2026-07-10]
- **Node driver `mongodb` 7.5.0** is current on npm; **pymongo 4.17.0** (PyPI,
  uploaded 2026-04-20) is the current Python driver. Mongoose 8 is ESM-first and
  wraps `mongodb` driver v6+.
  [registry.npmjs.org/mongodb + pypi.org/pypi/pymongo/json, retrieved 2026-07-10]
- **`$where` / server-side JS** remains a live injection surface in every version;
  disable `security.javascriptEnabled` unless required (see Security).

## References (retrieved 2026-07-10)
- MongoDB 8.0 release notes: https://www.mongodb.com/docs/manual/release-notes/8.0/
- Aggregation pipeline limits: https://www.mongodb.com/docs/manual/core/aggregation-pipeline-limits/
- Document / BSON limits (16 MB): https://www.mongodb.com/docs/manual/reference/limits/
- Transactions: https://www.mongodb.com/docs/manual/core/transactions/
- Write concern: https://www.mongodb.com/docs/manual/reference/write-concern/
- Query-injection FAQ: https://www.mongodb.com/docs/manual/faq/fundamentals/
- CWE-943 (NoSQL / query injection): https://cwe.mitre.org/data/definitions/943.html
- mongodb driver (npm): https://registry.npmjs.org/mongodb
- pymongo (PyPI JSON): https://pypi.org/pypi/pymongo/json
