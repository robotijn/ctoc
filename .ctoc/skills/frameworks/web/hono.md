# Hono CTO
> Ultrafast web framework - edge-first, runtime agnostic, minimal overhead.

## Commands
```bash
# Setup | Dev | Test
npm create hono@latest myapp  # Select runtime (Bun, Cloudflare, Node)
npm run dev
npm test
```

## Non-Negotiables
1. Edge-first architecture - minimal cold starts
2. Middleware composition with `app.use()`
3. Type-safe routing with generics
4. Zod validation with `@hono/zod-validator`
5. Runtime agnostic - works on Bun, Deno, CF Workers, Node

## Red Lines
- Heavy dependencies - keep bundle small for edge
- Blocking operations at edge
- Missing error handling middleware
- Not using helper functions (`c.json`, `c.html`, etc.)
- Platform-specific code without abstraction

## Pattern: Validated Routes
```typescript
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { jwt } from 'hono/jwt';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';

const app = new Hono();

// Middleware
app.use('*', logger());
app.use('/api/*', cors());
app.use('/api/*', jwt({ secret: Deno.env.get('JWT_SECRET')! }));

// Validation schema
const CreateUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

// Routes with validation
app.post(
  '/api/users',
  zValidator('json', CreateUserSchema),
  async (c) => {
    const { email, password } = c.req.valid('json');
    const jwtPayload = c.get('jwtPayload');

    const user = await c.env.DB.prepare(
      'INSERT INTO users (email, password) VALUES (?, ?) RETURNING *'
    ).bind(email, password).first();

    return c.json(user, 201);
  }
);

// Error handling
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'Internal Server Error' }, 500);
});

export default app;
```

## Integrates With
- **DB**: D1, Turso, PlanetScale (edge-compatible)
- **Auth**: Built-in JWT middleware
- **Validation**: Zod with official validator middleware
- **Cache**: KV stores, Cache API

## Common Errors
| Error | Fix |
|-------|-----|
| `Bindings not available` | Check wrangler.toml or adapter config |
| `Invalid JSON` | Check Content-Type header |
| `JWT verification failed` | Check secret matches, token format |
| `Module not found` | Check import paths for runtime |

## Prod Ready
- [ ] Error handling middleware configured
- [ ] Environment variables via bindings
- [ ] Health check endpoint
- [ ] Rate limiting for public APIs
- [ ] CORS properly configured
- [ ] Bundle size minimal (< 50KB)
