# Hono CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
npm create hono@latest my-app
# Select template: nodejs, cloudflare-workers, bun, deno, etc.
# Requires Node.js 18+
cd my-app && npm install && npm run dev
```

## Claude's Common Mistakes
1. **Rails-style controllers** — Path params can't be inferred; write handlers inline
2. **Heavy dependencies** — Keep bundle small for edge; Hono is 14kB with zero deps
3. **Blocking operations at edge** — Edge has limited CPU time; use async patterns
4. **Platform-specific code** — Abstract runtime differences for portability
5. **Missing error middleware** — Always add `app.onError()` handler

## Correct Patterns (2026)
```typescript
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { jwt } from 'hono/jwt';
import { cors } from 'hono/cors';

const app = new Hono();

// Middleware stack
app.use('*', cors());
app.use('/api/*', jwt({ secret: process.env.JWT_SECRET! }));

// Validation schema
const CreateUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

// Handlers inline (NOT in separate controller class)
app.post(
  '/api/users',
  zValidator('json', CreateUserSchema),
  async (c) => {
    const data = c.req.valid('json');
    const user = await db.users.create(data);
    return c.json(user, 201);
  }
);

// Error handling (required)
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'Internal Server Error' }, 500);
});

export default app;
```

## Version Gotchas
- **Runtime agnostic**: Same code runs on Bun, Deno, Node, CF Workers
- **Edge constraints**: Limited CPU time, no long-running operations
- **D1/Turso**: Use edge-compatible databases, not traditional ORMs
- **Bundle size**: Target < 50KB for optimal edge cold starts

## What NOT to Do
- ❌ `class UserController { ... }` — Path params won't infer; use inline handlers
- ❌ Heavy ORM imports — Use lightweight, edge-compatible DB clients
- ❌ Sync blocking code at edge — Use async; edge has CPU limits
- ❌ Missing `app.onError()` — Errors will be unhandled
- ❌ `process.env` on Cloudflare — Use `c.env` bindings

## Runtime Differences
```typescript
// Node.js
const secret = process.env.JWT_SECRET;

// Cloudflare Workers
app.get('/api/data', (c) => {
  const secret = c.env.JWT_SECRET;  // From wrangler.toml bindings
  const db = c.env.DB;              // D1 binding
});

// Bun
const secret = Bun.env.JWT_SECRET;
```

## Best Practices
| Practice | Why |
|----------|-----|
| Inline handlers | Type inference works correctly |
| Zod validation | `@hono/zod-validator` official support |
| Edge databases | D1, Turso, PlanetScale for edge |
| Minimal deps | Keep bundle < 50KB for cold starts |
