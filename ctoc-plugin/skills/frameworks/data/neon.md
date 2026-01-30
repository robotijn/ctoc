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
