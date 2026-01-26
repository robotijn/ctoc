# Fastify CTO
> Fast and low overhead Node.js framework.

## Non-Negotiables
1. JSON Schema validation
2. Plugin encapsulation
3. Decorators for extension
4. Proper hooks usage
5. TypeScript with type providers

## Red Lines
- Skipping schema validation
- Await on registration
- Circular plugin dependencies
- Sync route handlers

## Pattern
```typescript
fastify.post('/users', {
  schema: {
    body: {
      type: 'object',
      required: ['name'],
      properties: { name: { type: 'string' } }
    }
  }
}, async (request) => {
  return createUser(request.body)
})
```
