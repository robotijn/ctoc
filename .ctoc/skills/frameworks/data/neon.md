# Neon CTO
> Serverless PostgreSQL with branching, autoscaling, and instant provisioning.

## Commands
```bash
# Setup | Dev | Test
neon projects create --name myproject
neon branches create --name feature-branch
psql $(neon connection-string)
```

## Non-Negotiables
1. Branch-based development workflow
2. Autoscaling compute configuration
3. Connection pooling for serverless workloads
4. Compute endpoint sizing for workload
5. Point-in-time recovery understood
6. Autosuspend for development branches

## Red Lines
- Long-running connections without pooling
- Missing branch strategy for development
- No autosuspend on non-production branches
- Ignoring compute limits and cold starts
- No backup verification strategy

## Pattern: Serverless-Optimized Setup
```bash
# Create production branch
neon branches create --name production

# Create feature branch from production
neon branches create --name feature-auth --parent production

# Get pooled connection string (required for serverless)
neon connection-string --pooled

# Configure autoscaling (0.5 to 4 compute units)
neon compute set --branch production --min-cu 0.5 --max-cu 4

# Set autosuspend for dev branches (5 minutes)
neon compute set --branch feature-auth --suspend-timeout 300
```

```typescript
import { neon } from '@neondatabase/serverless';

// Serverless-optimized connection
const sql = neon(process.env.DATABASE_URL!);

// Efficient query pattern for serverless
async function getUser(id: string) {
  const [user] = await sql`
    SELECT id, email, name
    FROM users
    WHERE id = ${id}
  `;
  return user;
}

// Transaction support
import { neonConfig, Pool } from '@neondatabase/serverless';
neonConfig.fetchConnectionCache = true;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  await client.query('BEGIN');
  // ... transaction queries
  await client.query('COMMIT');
} finally {
  client.release();
}
```

## Integrates With
- **Frameworks**: Next.js, Vercel, Cloudflare Workers
- **ORM**: Prisma, Drizzle with pooled connections
- **PostgreSQL**: Full compatibility, extensions

## Common Errors
| Error | Fix |
|-------|-----|
| `connection timeout` | Use pooled connection string |
| `too many connections` | Enable connection pooling |
| `compute suspended` | Configure autosuspend timeout |
| `branch not found` | Check branch name with `neon branches list` |

## Prod Ready
- [ ] Connection pooling enabled
- [ ] Autoscaling configured
- [ ] Branch workflow established
- [ ] Autosuspend on dev branches
- [ ] Point-in-time recovery tested
