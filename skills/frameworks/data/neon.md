# Neon CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
npm install @neondatabase/serverless
# Or CLI
brew install neonctl && neon auth
```

## Claude's Common Mistakes
1. **Non-pooled connections in serverless** - Always use pooled connection string
2. **Not using branch workflow** - Branches enable instant dev/staging environments
3. **Long-running connections** - Neon is optimized for short-lived connections
4. **Missing autosuspend on dev** - Wastes compute; set suspend timeout
5. **Direct psql in production** - Use Neon serverless driver for edge/serverless

## Correct Patterns (2026)
```typescript
import { neon, neonConfig } from '@neondatabase/serverless';

// Enable connection caching for serverless
neonConfig.fetchConnectionCache = true;

// Serverless-optimized connection (HTTP-based)
const sql = neon(process.env.DATABASE_URL!);

// Efficient query pattern
const users = await sql`
  SELECT id, email, name
  FROM users
  WHERE status = ${'active'}
  LIMIT 20
`;

// Transaction support (pooled connection)
import { Pool } from '@neondatabase/serverless';
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query('UPDATE accounts SET balance = balance - $1 WHERE id = $2', [100, from]);
  await client.query('UPDATE accounts SET balance = balance + $1 WHERE id = $2', [100, to]);
  await client.query('COMMIT');
} finally {
  client.release();
}
```

```bash
# Branch workflow
neon branches create --name feature-auth --parent main
neon connection-string --branch feature-auth --pooled
```

## Version Gotchas
- **Pooled vs direct**: Use `-pooler` connection string for serverless
- **Autoscaling**: Configure min/max compute units for cost control
- **Branching**: Instant copy-on-write; great for previews
- **Cold starts**: First query after suspend is slower (~500ms)

## What NOT to Do
- Do NOT use direct (non-pooled) connections in serverless
- Do NOT forget autosuspend on development branches
- Do NOT ignore connection caching in edge functions
- Do NOT skip branching workflow for dev/staging

## Serverless Footguns — scale-to-zero cold start & pooled vs direct
Neon **scales compute to zero** after an idle window (autosuspend). The *first* query
after suspend pays a **cold-start** penalty (compute resumes, typically a few hundred
ms) — a spiky, real latency source that never shows up in a warm benchmark.

The bigger footgun is **connection mode**. A serverless function that opens a *direct*
Postgres connection per invocation exhausts `max_connections` under load. Neon ships a
**PgBouncer pooler** reached via the `-pooler` host suffix:

```typescript
// DATABASE_URL host WITH the pooler:
//   postgresql://user:pass@ep-xxx-pooler.us-east-2.aws.neon.tech/db   <- serverless
// DATABASE_URL host WITHOUT it (direct):
//   postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/db          <- migrations only

// FOOTGUN: a new direct Pool per request exhausts connections under load
export async function handler() {
  const pool = new Pool({ connectionString: process.env.DIRECT_URL });  // direct = bad here
}

// RIGHT (HTTP driver, no pooling needed — one round trip, no socket):
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL!);            // -pooler host
const users = await sql`SELECT id, email FROM users WHERE status = ${'active'} LIMIT 20`;
```
- **PgBouncer transaction mode** (what the pooler uses) does NOT preserve session
  state between statements: **session-level `SET`, advisory locks, `LISTEN/NOTIFY`,
  and server-side prepared statements can break or behave unexpectedly**. Use the
  **direct** (non-pooler) connection string for migrations and anything needing a
  stable session; use the **pooler** for app request traffic.
- Use the **`@neondatabase/serverless` HTTP driver** for one-shot queries in edge
  runtimes — it has no socket to pool and no cold-connection handshake.
  [neon.com connect/connection-pooling + serverless/serverless-driver, retrieved 2026-07-10]

## Correctness — connection-per-request & branching
```typescript
// FOOTGUN: a module-scope Pool held across invocations in a stateless runtime leaks.
// RIGHT for serverless: the HTTP driver is connectionless — call it per request.
import { neon } from '@neondatabase/serverless';
export async function GET(req: Request) {
  const sql = neon(process.env.DATABASE_URL!);         // no persistent connection
  return Response.json(await sql`SELECT now()`);
}
```
```bash
# Copy-on-write branching: an instant clone of prod data for previews/tests
neon branches create --name pr-123 --parent main       # instant, storage is shared
neon connection-string pr-123 --pooled                 # pooler URL for the branch
```
- Neon branches are **copy-on-write** — creating one is instant and cheap; each branch
  gets its own compute + connection string. Use a branch per PR/preview, and DELETE it
  on teardown so idle compute suspends. [neon.com introduction/branching, retrieved 2026-07-10]

## Security — parameterized SQL (CWE-89), RLS & branch credentials
Neon is Postgres, so the injection class is **CWE-89 "Improper Neutralization of Special
Elements used in an SQL Command ('SQL Injection')"** (cwe.mitre.org/data/definitions/89.html).

```typescript
// VULNERABLE (CWE-89): input concatenated into SQL
await sql.query(`SELECT * FROM users WHERE email = '${email}'`);

// SAFE: the neon tagged template BINDS ${email} as a parameter ($1), not text
const rows = await sql`SELECT * FROM users WHERE email = ${email}`;
// SAFE (parameterized form): placeholders + values array
await sql.query('SELECT * FROM users WHERE email = $1', [email]);
```
- The `neon\`...\`` tagged template parameterizes interpolations; string-built SQL does
  not — never concatenate user input.
- **RLS (Row-Level Security)** is standard Postgres here: enable it and write policies
  per table when clients query directly (e.g. via a data API). A table without RLS
  policies is readable by anyone holding that role's credentials.
- **Branch credentials are real credentials.** A preview branch's connection string
  grants access to a full copy of production data — scope, rotate, and never commit it.
  [neon.com connect + postgresql row-level-security + cwe.mitre.org/89, retrieved 2026-07-10]

## Performance — cold starts, autoscaling & the HTTP driver
```typescript
// FOOTGUN: a chatty request that issues N sequential sql`...` calls pays N HTTP
// round trips on the serverless driver -> latency stacks up.
for (const id of ids) { await sql`SELECT * FROM t WHERE id = ${id}`; }   // N round trips

// RIGHT: one round trip with a set-based query
const rows = await sql`SELECT * FROM t WHERE id = ANY(${ids})`;          // 1 round trip
```
- **Cold start**: the first query after scale-to-zero resumes compute (few hundred ms).
  For latency-critical endpoints, raise the **autosuspend** timeout or set a **minimum
  compute** (min > 0 CU) so the endpoint never fully suspends — trading idle cost for
  predictable p99. Configure **autoscaling** min/max CU to cap spend while absorbing
  spikes.
- The HTTP driver adds one network round trip **per** `sql\`\`` call; batch with
  set-based SQL (`ANY(...)`, a single JOIN) instead of looping. [neon.com
  introduction/autoscaling + serverless-driver, retrieved 2026-07-10]

## Error Handling
```typescript
try {
  await sql`INSERT INTO users (email) VALUES (${email})`;
} catch (e: any) {
  if (e?.code === '23505') handleDuplicate(email);   // unique_violation SQLSTATE
  else if (e?.code === '57P01') retry();              // admin_shutdown / conn drop -> retry
  else throw e;
}
```
- Branch on the **Postgres SQLSTATE `e.code`** (`23505` unique violation, `57P01`
  connection terminated) — never string-match the message. Transient connection drops
  after a scale-to-zero resume are expected: retry idempotent reads.
  [neon.com serverless-driver error handling, retrieved 2026-07-10]

## Testing
```typescript
// FOOTGUN: tests against `main` mutate shared data and don't exercise cold starts.
// RIGHT: spin a copy-on-write branch per CI run, point DATABASE_URL at it, delete after.
//   neon branches create --name ci-$RUN_ID --parent main
//   ... run suite against the branch's -pooler URL ...
//   neon branches delete ci-$RUN_ID
it('reads its own write on the primary (no replica lag on a fresh branch)', async () => {
  await sql`INSERT INTO t (v) VALUES (1)`;
  assert.equal((await sql`SELECT count(*)::int AS n FROM t`)[0].n, 1);
});
```
- A per-run branch gives every CI job an isolated, prod-shaped database for free —
  and lets you assert behavior against real data without touching `main`.
  [neon.com branching for testing, retrieved 2026-07-10]

## Version-Specific Gotchas (dated, sourced)
- **`@neondatabase/serverless` 1.1.0** is the current driver, published **2026-04-17**
  to npm. [registry.npmjs.org/@neondatabase/serverless, retrieved 2026-07-10]
- **Scale-to-zero + the `-pooler` host** are core, stable platform behavior — the
  pooler runs PgBouncer in **transaction mode** (session-state caveats apply). [neon.com
  connect/connection-pooling, retrieved 2026-07-10]
- **Branches are copy-on-write** and instant; treat branch credentials as
  production-grade secrets. [neon.com introduction/branching, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- @neondatabase/serverless (npm): https://registry.npmjs.org/@neondatabase/serverless
- Connection pooling (-pooler / PgBouncer): https://neon.com/docs/connect/connection-pooling
- Serverless driver: https://neon.com/docs/serverless/serverless-driver
- Branching: https://neon.com/docs/introduction/branching
- Autoscaling: https://neon.com/docs/introduction/autoscaling
- CWE-89 (SQL Injection): https://cwe.mitre.org/data/definitions/89.html
