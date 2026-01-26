# Drizzle CTO
> Type-safe SQL for TypeScript with zero runtime overhead.

## Commands
```bash
# Setup | Dev | Test
npm install drizzle-orm drizzle-kit
npx drizzle-kit generate && npx drizzle-kit migrate
npm test
```

## Non-Negotiables
1. Schema-first design with TypeScript inference
2. Drizzle-kit for all migrations (never manual SQL)
3. Prepared statements for repeated queries
4. Transaction wrappers for multi-table operations
5. Explicit relation definitions for type-safe joins
6. Connection pooling in production

## Red Lines
- Raw SQL strings bypassing type safety
- Missing migration files in version control
- N+1 queries from lazy relation loading
- Hardcoded credentials in connection strings
- Skipping schema validation on deploy

## Pattern: Type-Safe Database Layer
```typescript
import { drizzle } from 'drizzle-orm/node-postgres';
import { pgTable, serial, text, timestamp, integer } from 'drizzle-orm/pg-core';
import { eq, and, desc } from 'drizzle-orm';

// Schema definition
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const orders = pgTable('orders', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id),
  total: integer('total').notNull(),
});

// Type-safe queries
const db = drizzle(pool);

const userOrders = await db
  .select({
    userName: users.name,
    orderTotal: orders.total,
  })
  .from(users)
  .leftJoin(orders, eq(users.id, orders.userId))
  .where(and(eq(users.email, email), orders.total > 100))
  .orderBy(desc(orders.total));
```

## Integrates With
- **Databases**: PostgreSQL, MySQL, SQLite, Turso
- **Frameworks**: Next.js, Remix, SvelteKit
- **Serverless**: Vercel, Cloudflare Workers, AWS Lambda

## Common Errors
| Error | Fix |
|-------|-----|
| `relation does not exist` | Run `drizzle-kit migrate` |
| `Type instantiation too deep` | Simplify nested query types |
| `Connection timeout` | Configure pool `max` and `idleTimeout` |
| `Cannot find module` | Check drizzle-kit version compatibility |

## Prod Ready
- [ ] Migrations tested in staging
- [ ] Connection pooling configured
- [ ] Schema validation on CI/CD
- [ ] Prepared statements for hot paths
- [ ] Foreign key constraints enforced
