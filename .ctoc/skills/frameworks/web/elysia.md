# Elysia CTO
> Ergonomic Bun web framework - end-to-end type safety, fast, developer-friendly.

## Commands
```bash
# Setup | Dev | Test
bun create elysia myapp && cd myapp
bun run dev
bun test
```

## Non-Negotiables
1. End-to-end type safety with TypeBox
2. Plugin composition for modularity
3. Schema validation on all routes
4. Proper error handling with `onError`
5. Swagger documentation in development

## Red Lines
- Missing input validation
- Type assertions over type inference
- Ignoring plugin lifecycle hooks
- Heavy middleware chains - keep plugins focused
- Skipping schema definitions

## Pattern: Type-Safe CRUD
```typescript
import { Elysia, t } from 'elysia';
import { swagger } from '@elysiajs/swagger';
import { jwt } from '@elysiajs/jwt';

const UserSchema = t.Object({
  email: t.String({ format: 'email' }),
  password: t.String({ minLength: 8 }),
});

const UserResponseSchema = t.Object({
  id: t.Number(),
  email: t.String(),
});

const app = new Elysia()
  .use(swagger())
  .use(jwt({ name: 'jwt', secret: process.env.JWT_SECRET! }))
  .decorate('db', new Database())
  .group('/api', (app) =>
    app
      .post('/users', async ({ body, db }) => {
        const user = await db.createUser(body);
        return user;
      }, {
        body: UserSchema,
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
  .onError(({ code, error }) => {
    console.error(error);
    return { error: code === 'VALIDATION' ? error.message : 'Internal error' };
  })
  .listen(3000);

export type App = typeof app;
```

## Integrates With
- **DB**: Any, decorated via `.decorate()`
- **Auth**: `@elysiajs/jwt` for JWT tokens
- **Validation**: TypeBox (built-in)
- **Docs**: `@elysiajs/swagger` for OpenAPI

## Common Errors
| Error | Fix |
|-------|-----|
| `Type mismatch` | Check schema matches request/response |
| `Plugin not found` | Ensure `bun add @elysiajs/plugin` |
| `Decorator not available` | Check plugin order, decorator registration |
| `VALIDATION error` | Request doesn't match schema |

## Prod Ready
- [ ] Swagger disabled in production
- [ ] Error handling with `onError`
- [ ] Rate limiting with plugin
- [ ] Health check endpoint
- [ ] CORS configured properly
- [ ] Environment variables validated
