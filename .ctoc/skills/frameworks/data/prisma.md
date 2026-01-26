# Prisma CTO
> Next-generation TypeScript ORM with type-safe database access.

## Commands
```bash
# Setup | Dev | Test
npm install prisma @prisma/client
npx prisma migrate dev --name init
npx prisma generate && npm test
```

## Non-Negotiables
1. Schema-first design in `prisma/schema.prisma`
2. Prisma Migrate for all schema changes
3. Generated client for type-safe queries
4. Explicit `select` or `include` to avoid over-fetching
5. Transactions for multi-model operations
6. Connection pooling with PgBouncer for serverless

## Red Lines
- Raw SQL when Prisma Client suffices
- N+1 queries from missing `include`
- Missing `@@index` on filtered columns
- Schema changes without migrations
- Unbounded queries without pagination

## Pattern: Type-Safe Data Access
```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log: ['query', 'warn', 'error'],
});

// Type-safe query with relations
async function getOrdersWithCustomer(customerId: string) {
  return prisma.order.findMany({
    where: {
      customerId,
      status: { in: ['pending', 'processing'] },
    },
    select: {
      id: true,
      total: true,
      createdAt: true,
      items: {
        select: { productId: true, quantity: true },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
}

// Transaction for data integrity
async function transferFunds(fromId: string, toId: string, amount: number) {
  return prisma.$transaction(async (tx) => {
    const from = await tx.account.update({
      where: { id: fromId },
      data: { balance: { decrement: amount } },
    });
    if (from.balance < 0) throw new Error('Insufficient funds');

    await tx.account.update({
      where: { id: toId },
      data: { balance: { increment: amount } },
    });
  });
}
```

## Integrates With
- **Databases**: PostgreSQL, MySQL, SQLite, MongoDB, CockroachDB
- **Frameworks**: Next.js, NestJS, Express
- **Serverless**: Vercel, AWS Lambda with connection pooling

## Common Errors
| Error | Fix |
|-------|-----|
| `P2002: Unique constraint failed` | Check for duplicate key or add conflict handling |
| `P2025: Record not found` | Use `findFirst` or handle null case |
| `Connection pool exhausted` | Increase pool size or use PgBouncer |
| `Migration failed` | Check `prisma migrate diff` for conflicts |

## Prod Ready
- [ ] Migrations in version control
- [ ] Connection pooling for serverless
- [ ] Indexes on all filtered columns
- [ ] Query logging in development
- [ ] Soft deletes for audit requirements
