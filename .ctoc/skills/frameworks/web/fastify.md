# Fastify CTO
> Fast and low overhead Node.js framework - schema-based, plugin-driven, TypeScript-first.

## Commands
```bash
# Setup | Dev | Test
npm init -y && npm install fastify @fastify/type-provider-typebox
npm run dev
npm test
```

## Non-Negotiables
1. JSON Schema validation on all routes
2. Plugin encapsulation with proper scope
3. Decorators extend request/reply safely
4. Hooks for lifecycle management
5. TypeScript with type providers

## Red Lines
- Skipping schema validation - performance and security loss
- `await` on plugin registration - use `register()` correctly
- Circular plugin dependencies
- Synchronous route handlers without schema
- Ignoring plugin encapsulation

## Pattern: Type-Safe Plugin
```typescript
import Fastify from 'fastify';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Type, Static } from '@sinclair/typebox';

const CreateUserSchema = Type.Object({
  email: Type.String({ format: 'email' }),
  password: Type.String({ minLength: 8 }),
});
type CreateUserBody = Static<typeof CreateUserSchema>;

const UserResponseSchema = Type.Object({
  id: Type.Number(),
  email: Type.String(),
});

const usersPlugin = async (fastify: FastifyInstance) => {
  fastify.post<{ Body: CreateUserBody }>(
    '/users',
    {
      schema: {
        body: CreateUserSchema,
        response: { 201: UserResponseSchema },
      },
    },
    async (request, reply) => {
      const { email, password } = request.body;
      const user = await fastify.userService.create(email, password);
      return reply.code(201).send(user);
    }
  );
};

export default usersPlugin;

// Register plugin
const app = Fastify().withTypeProvider<TypeBoxTypeProvider>();
app.register(usersPlugin, { prefix: '/api' });
```

## Integrates With
- **DB**: `@fastify/postgres` or Prisma
- **Auth**: `@fastify/jwt` with decorators
- **Validation**: JSON Schema or TypeBox
- **Docs**: `@fastify/swagger` with `@fastify/swagger-ui`

## Common Errors
| Error | Fix |
|-------|-----|
| `FST_ERR_PLUGIN_TIMEOUT` | Plugin async registration taking too long |
| `Schema validation failed` | Check request matches schema exactly |
| `Decorator already exists` | Use unique decorator names, check scope |
| `Reply already sent` | Don't call reply methods multiple times |

## Prod Ready
- [ ] Schemas for all routes
- [ ] Response serialization schemas
- [ ] Health check endpoint
- [ ] Structured logging with `pino`
- [ ] Graceful shutdown
- [ ] Rate limiting with `@fastify/rate-limit`
