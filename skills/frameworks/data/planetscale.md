# PlanetScale CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
# Install CLI
brew install planetscale/tap/pscale
pscale auth login
pscale connect mydb main --port 3306
```

## Claude's Common Mistakes
1. **Using foreign key constraints** - Not supported (Vitess limitation)
2. **Direct production schema changes** - Use deploy requests (safe migrations)
3. **Single connection string** - Use branch-specific connections
4. **Ignoring Query Insights** - Built-in query analyzer
5. **Not using branch workflow** - Branches are like git for databases

## Correct Patterns (2026)
```bash
# Branch-based workflow (like git)
pscale branch create mydb feature-add-users
pscale connect mydb feature-add-users --port 3306

# Apply schema on branch
mysql -h 127.0.0.1 -P 3306 -u root < migration.sql

# Create deploy request (PR for schema)
pscale deploy-request create mydb feature-add-users

# Review and deploy (non-blocking)
pscale deploy-request diff mydb 1
pscale deploy-request deploy mydb 1
```

```sql
-- Schema WITHOUT foreign keys (enforce in application)
CREATE TABLE users (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_created (created_at)
);

CREATE TABLE orders (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    total DECIMAL(10,2),
    INDEX idx_user (user_id)
    -- NO FOREIGN KEY - enforce in application
);
```

## Version Gotchas
- **No foreign keys**: Vitess limitation; use application-level integrity
- **Deploy requests**: Non-blocking schema migrations
- **Boost**: Edge caching for read-heavy workloads
- **Branches**: Each branch has isolated schema and data

## What NOT to Do
- Do NOT use FOREIGN KEY constraints (not supported)
- Do NOT change production schema directly (use deploy requests)
- Do NOT ignore Query Insights alerts
- Do NOT forget branch workflow for schema changes

## Schema Footguns — no foreign keys, deploy requests, Vitess sharding
PlanetScale runs on **Vitess**, which shards MySQL horizontally. That imposes three
correctness constraints Claude routinely gets wrong:

1. **No foreign keys by default.** Vitess cannot enforce FK constraints across shards,
   so `FOREIGN KEY` is unsupported (FK *emulation* exists but referential integrity is
   NOT guaranteed at the database — enforce it in the application).
2. **Never `ALTER` production directly.** Schema changes go through a **deploy request**
   (a database PR) applied by Vitess's online-DDL engine — non-blocking, no table lock,
   reversible.
3. **No cross-shard transactions.** A transaction that touches rows on different shards
   is **not** atomic; keep each transaction inside one shard (one keyspace/VIndex value).

```sql
-- FOOTGUN: FK is silently unsupported; app can write orphaned rows
CREATE TABLE orders (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)   -- NOT enforced across shards
);

-- RIGHT: no FK; enforce integrity in the app + index the join column
CREATE TABLE orders (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    INDEX idx_user (user_id)                      -- app validates user_id exists
);
```
```bash
# RIGHT: branch -> migrate on branch -> deploy request -> non-blocking online DDL
pscale branch create mydb add-orders
pscale connect mydb add-orders --port 3306      # apply migration.sql on the branch
pscale deploy-request create mydb add-orders    # opens the schema PR
pscale deploy-request deploy mydb 1             # Vitess applies it online, no lock
```
- Branches are copy-on-write clones of the production schema — treat them like git
  branches for the database. [planetscale.com deploy-requests + operating-without-foreign-key-constraints, retrieved 2026-07-10]

## Correctness — the serverless HTTP driver & read replicas
`@planetscale/database` talks to PlanetScale over **HTTP (fetch)**, not the MySQL wire
protocol — that is what makes it work in edge/serverless runtimes (Cloudflare Workers,
Vercel Edge) where raw TCP sockets are unavailable.

```typescript
import { connect } from '@planetscale/database'   // HTTP driver, edge-safe

const conn = connect({ url: process.env.DATABASE_URL })   // no persistent socket

// Parameterized query — placeholders are bound server-side (see Security below)
const results = await conn.execute(
  'SELECT id, email FROM users WHERE status = ? LIMIT 20',
  ['active'],
)
```
- **Read replicas are eventually consistent.** A read routed to a replica immediately
  after a write may not see that write (replication lag). Route
  read-your-own-writes traffic to the primary, or accept staleness explicitly.
- The HTTP driver is **stateless** — there is no long-lived transaction/session to leak,
  which is exactly why it suits serverless. For multi-statement transactions use
  `conn.transaction(async (tx) => { ... })`, kept within a single shard.
  [planetscale.com serverless-driver docs (npm @planetscale/database), retrieved 2026-07-10]

## Security — parameterized queries (CWE-89) & password scopes
PlanetScale is MySQL — the injection class is **CWE-89 "Improper Neutralization of
Special Elements used in an SQL Command ('SQL Injection')"**
(cwe.mitre.org/data/definitions/89.html).

```typescript
// VULNERABLE (CWE-89): user input concatenated into SQL
await conn.execute(`SELECT * FROM users WHERE email = '${email}'`);   // ' OR '1'='1

// SAFE: ? placeholders bound as parameters, never parsed as SQL
await conn.execute('SELECT * FROM users WHERE email = ?', [email]);
```
- Always use `?` placeholders with a values array; never build SQL by concatenation.
- **Scope database passwords** to the least privilege and the specific branch they
  serve (a production password should not connect to dev branches); rotate them and
  never commit `DATABASE_URL` to the repo.
  [planetscale.com connecting/passwords + cwe.mitre.org/89, retrieved 2026-07-10]

## Performance — indexes, replicas & Query Insights
```sql
-- FOOTGUN: no index on the join/filter column -> full table scan on every read
SELECT * FROM orders WHERE user_id = ?;              -- scans without idx_user

-- RIGHT: index the columns you filter/join on (Vitess routes on the sharding key)
ALTER TABLE orders ADD INDEX idx_user (user_id);
```
- Route read-heavy traffic to **read replicas** (eventually consistent) to spare the
  primary; keep read-your-own-writes on the primary. Use **Query Insights** to find the
  slow/full-scan queries PlanetScale flags, and add covering indexes for them.
- Vitess routes queries by the **sharding key (VIndex)** — a query missing the sharding
  key **scatter-gathers across every shard** (slow, expensive). Include the sharding
  key in `WHERE` wherever possible. [planetscale.com query-insights + vitess sharding,
  retrieved 2026-07-10]

## Error Handling
```typescript
try {
  await conn.execute('INSERT INTO users (email) VALUES (?)', [email]);
} catch (e: any) {
  // MySQL error codes are stable: 1062 = duplicate entry (unique violation)
  if (e?.body?.code === 'ALREADY_EXISTS' || /1062/.test(String(e?.message))) {
    handleDuplicate(email);   // don't 500 on an expected unique-constraint hit
  } else {
    throw e;
  }
}
```
- Branch on the **stable MySQL error number** (`1062` duplicate key, `1452` would be FK
  — but FKs are off here) rather than the message string. Let unexpected errors
  propagate. [planetscale.com serverless-driver error handling, retrieved 2026-07-10]

## Testing
```typescript
// FOOTGUN: tests against production data are destructive and mask replica lag.
// RIGHT: create a throwaway BRANCH per test run, migrate it, tear it down after.
//   pscale branch create mydb ci-$RUN_ID   ->  run tests  ->  branch delete
// Assert the app-level integrity check fires (since the DB won't enforce the FK):
it('rejects an order for a non-existent user', async () => {
  await assert.rejects(createOrder({ userId: 999999 }));   // app must validate
});
```
- Because the database does NOT enforce foreign keys, your tests must cover the
  **application-level** referential checks — those are now the only integrity guard.
  [planetscale.com branching (test branches), retrieved 2026-07-10]

## Version-Specific Gotchas (dated, sourced)
- **`@planetscale/database` 1.20.1** is the current serverless HTTP driver, published
  **2026-03-25** to npm. [registry.npmjs.org/@planetscale/database, retrieved 2026-07-10]
- **Vitess is the engine** — no foreign keys, no cross-shard atomic transactions, and
  online DDL via deploy requests are permanent, structural properties, not bugs to work
  around. [planetscale.com operating-without-foreign-key-constraints, retrieved 2026-07-10]
- **Read replicas are eventually consistent** — replication lag is expected; do not
  assume read-after-write on a replica. [planetscale.com replicas docs, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- @planetscale/database (npm): https://registry.npmjs.org/@planetscale/database
- Operating without foreign keys (Vitess): https://planetscale.com/docs/vitess/operating-without-foreign-key-constraints
- Deploy requests: https://planetscale.com/docs/concepts/deploy-requests
- Branching: https://planetscale.com/docs/concepts/branching
- Query Insights: https://planetscale.com/docs/concepts/query-insights
- CWE-89 (SQL Injection): https://cwe.mitre.org/data/definitions/89.html
