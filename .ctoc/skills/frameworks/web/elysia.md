# Elysia CTO
> Ergonomic Bun web framework.

## Non-Negotiables
1. End-to-end type safety
2. Plugin composition
3. Schema validation with TypeBox
4. Proper error handling
5. Swagger documentation

## Red Lines
- Missing input validation
- Type assertions over inference
- Ignoring plugin lifecycle
- Heavy middleware chains

## Pattern
```typescript
const app = new Elysia()
  .use(swagger())
  .post('/users', ({ body }) => createUser(body), {
    body: t.Object({
      name: t.String(),
      email: t.String({ format: 'email' })
    })
  })
```
