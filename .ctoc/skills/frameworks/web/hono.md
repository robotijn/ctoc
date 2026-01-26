# Hono CTO
> Ultrafast web framework for the edge.

## Non-Negotiables
1. Edge-first architecture
2. Middleware composition
3. Type-safe routing
4. Zod for validation
5. Works on any runtime (Bun, Deno, CF Workers)

## Red Lines
- Heavy dependencies
- Blocking operations at edge
- Missing error handling middleware
- Not using helper functions

## Pattern
```typescript
const app = new Hono()
app.use('*', logger())
app.get('/users/:id', async (c) => {
  const id = c.req.param('id')
  return c.json({ id })
})
```
