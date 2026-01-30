# Drizzle ORM CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
npm install drizzle-orm
npm install -D drizzle-kit
# Plus your database driver: pg, mysql2, better-sqlite3, @libsql/client
```

## Claude's Common Mistakes
1. **Using serial instead of identity** - PostgreSQL recommends identity columns now
2. **Forgetting drizzle-kit migrate** - Schema changes need migration
3. **Client-side code generation** - Drizzle has no codegen; types are inferred
4. **Missing connection pooling** - Essential for serverless/production
5. **Prisma-style includes** - Drizzle uses explicit joins, not magic relations

## Correct Patterns (2026)
```typescript
import { drizzle } from 'drizzle-orm/node-postgres';
import { pgTable, text, timestamp, integer, primaryKey } from 'drizzle-orm/pg-core';
import { eq, and, desc } from 'drizzle-orm';
import { Pool } from 'pg';

// Schema with identity (not serial)
export const users = pgTable('users', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  email: text('email').notNull().unique(),
  name: text('name'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const orders = pgTable('orders', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  userId: integer('user_id').notNull().references(() => users.id),
  total: integer('total').notNull(),
});

// Connection pool (essential for production)
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 20 });
const db = drizzle(pool);

// Type-safe query with explicit join
const userOrders = await db
  .select({ userName: users.name, orderTotal: orders.total })
  .from(users)
  .leftJoin(orders, eq(users.id, orders.userId))
  .where(and(eq(users.email, email), orders.total > 100))
  .orderBy(desc(orders.total));

// Safe delete with where clause (prevent accidental full delete)
await db.delete(orders).where(eq(orders.id, orderId));
```

## Version Gotchas
- **No codegen**: Types inferred at compile time; no generate step
- **Migrations**: drizzle-kit generate + migrate; review generated SQL
- **Serverless**: Works with Neon, PlanetScale, Turso, D1, Vercel Postgres
- **vs Prisma**: SQL-like syntax; no implicit includes; explicit joins

## What NOT to Do
- Do NOT expect Prisma-style `include` (use explicit joins)
- Do NOT use serial columns (use identity for PostgreSQL)
- Do NOT delete without where clause (full table delete risk)
- Do NOT skip connection pooling in production
