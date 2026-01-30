# Elysia CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
bun create elysia my-app
cd my-app && bun run dev
# Elysia 1.x - Bun-first web framework
```

## Claude's Common Mistakes
1. **Missing schema validation** — TypeBox schemas provide type safety AND runtime validation
2. **Type assertions over inference** — Let Elysia infer types from schemas
3. **Ignoring plugin order** — Decorators must be registered before use
4. **No `onError` handler** — Unhandled errors return generic 500
5. **Swagger in production** — Disable `@elysiajs/swagger` in prod

## Correct Patterns (2026)
```typescript
import { Elysia, t } from 'elysia';
import { swagger } from '@elysiajs/swagger';

// Define schemas (provides types AND runtime validation)
const UserSchema = t.Object({
  email: t.String({ format: 'email' }),
  password: t.String({ minLength: 8 }),
});

const UserResponseSchema = t.Object({
  id: t.Number(),
  email: t.String(),
});

const app = new Elysia()
  .use(swagger({ path: '/docs' }))  // Only in development
  .decorate('db', new Database())   // Register before use
  .onError(({ code, error, set }) => {
    console.error(error);
    if (code === 'VALIDATION') {
      set.status = 400;
      return { error: error.message };
    }
    set.status = 500;
    return { error: 'Internal server error' };
  })
  .group('/api', (app) =>
    app
      .post('/users', async ({ body, db }) => {
        const user = await db.createUser(body);
        return user;
      }, {
        body: UserSchema,           // Validates AND types
        response: UserResponseSchema,
        detail: { tags: ['Users'] },
      })
      .get('/users/:id', async ({ params, db, error }) => {
        const user = await db.getUser(params.id);
        if (!user) return error(404, 'User not found');
        return user;
      }, {
        params: t.Object({ id: t.Numeric() }),
        response: UserResponseSchema,
      })
  )
  .listen(3000);

// Export type for Eden client
export type App = typeof app;
```

## Version Gotchas
- **Elysia 1.x**: Stable; Bun-first (not Node.js)
- **TypeBox**: Built-in; provides both types and validation
- **Eden**: Type-safe client from exported `App` type
- **Plugins**: Must be registered in correct order

## What NOT to Do
- ❌ Missing `body:` schema — No validation, loses type safety
- ❌ `as User` type assertions — Let schemas infer types
- ❌ Using `db` before `.decorate('db', ...)` — Order matters
- ❌ No `onError` handler — Generic 500 responses
- ❌ Swagger in `NODE_ENV=production` — Security risk

## Plugin Order
```typescript
new Elysia()
  .decorate('db', db)        // 1. Decorators first
  .use(authPlugin)           // 2. Auth middleware
  .use(swagger())            // 3. Swagger
  .group('/api', routes)     // 4. Routes last
```

## Eden Client
```typescript
// Client-side (full type safety)
import { treaty } from '@elysiajs/eden';
import type { App } from './server';

const api = treaty<App>('localhost:3000');
const { data } = await api.api.users.post({ email, password });
```
