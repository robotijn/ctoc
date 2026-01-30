# Prisma CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
npm install prisma @prisma/client
npx prisma init  # Creates prisma.config.ts (required in v7)
```

## Claude's Common Mistakes
1. **Missing prisma.config.ts** - v7 requires config file, not just schema.prisma
2. **No driver adapter** - v7 requires explicit driver adapters (pg, mysql2, etc.)
3. **Auto-loading env vars** - v7 doesn't auto-load .env; use dotenv explicitly
4. **Old client import** - Generator is now `prisma-client`, not `prisma-client-js`
5. **node_modules output** - v7 generates to project source, not node_modules

## Correct Patterns (2026)
```typescript
// prisma.config.ts (REQUIRED in v7)
import { defineConfig } from 'prisma'
import { PrismaPg } from '@prisma/adapter-pg'

export default defineConfig({
  earlyAccess: true,
  schema: './prisma/schema.prisma',
})

// Client setup with driver adapter (v7 pattern)
import { PrismaClient } from './prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

// Type-safe query with explicit select
const orders = await prisma.order.findMany({
  where: { customerId, status: { in: ['pending', 'processing'] } },
  select: { id: true, total: true, items: { select: { productId: true } } },
  take: 20,
})
```

## Version Gotchas
- **v6->v7**: Driver adapters required, prisma.config.ts mandatory
- **v7 enums**: @map with enums has breaking behavior change
- **v7 SSL**: node-pg used instead of Rust engine; SSL defaults changed
- **With Next.js 16**: Turbopack has module resolution issues with prisma-client

## What NOT to Do
- Do NOT expect DATABASE_URL to auto-load from .env
- Do NOT use `prisma-client-js` generator (use `prisma-client`)
- Do NOT skip the driver adapter setup in v7
- Do NOT import from `@prisma/client` (import from generated location)
