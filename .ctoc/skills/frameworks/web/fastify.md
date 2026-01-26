# Fastify CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
npm init -y
npm install fastify @fastify/type-provider-typebox @sinclair/typebox
# Requires Node.js 18+ (recommend LTS 24 for 2026)
```

## Claude's Common Mistakes
1. **Skipping schema validation** — Loses Fastify's performance advantage and security
2. **Awaiting plugin registration** — Use `register()` correctly, don't `await` incorrectly
3. **Global variables for state** — Use decorators or request context
4. **Underestimating Fastify** — It's a full framework, not just Express alternative
5. **Missing response schemas** — Precompiled serialization needs response schema

## Correct Patterns (2026)
```typescript
import Fastify from 'fastify';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Type, Static } from '@sinclair/typebox';

// Define schemas
const CreateUserSchema = Type.Object({
  email: Type.String({ format: 'email' }),
  password: Type.String({ minLength: 8 }),
});

const UserResponseSchema = Type.Object({
  id: Type.Number(),
  email: Type.String(),
});

type CreateUserBody = Static<typeof CreateUserSchema>;

// Plugin with proper encapsulation
const usersPlugin = async (fastify) => {
  fastify.post<{ Body: CreateUserBody }>(
    '/users',
    {
      schema: {
        body: CreateUserSchema,
        response: { 201: UserResponseSchema },  // Required for fast serialization
      },
    },
    async (request, reply) => {
      const { email, password } = request.body;
      const user = await fastify.userService.create(email, password);
      return reply.code(201).send(user);
    }
  );
};

// App setup
const app = Fastify({
  logger: true,  // Pino logger built-in
}).withTypeProvider<TypeBoxTypeProvider>();

app.register(usersPlugin, { prefix: '/api' });
```

## Version Gotchas
- **Node.js 24 LTS**: Recommended for 2026 production
- **TypeBox**: Preferred over Zod for Fastify (faster schema compilation)
- **Pino logger**: Built-in, extremely low overhead
- **Plugin timeout**: `FST_ERR_PLUGIN_TIMEOUT` if registration takes too long

## What NOT to Do
- ❌ Routes without schema validation — Loses performance + security
- ❌ `await app.register(plugin)` incorrectly — Check plugin registration docs
- ❌ Global state variables — Use decorators or request context
- ❌ Missing response schema — Slows serialization
- ❌ `console.log` for logging — Use built-in Pino logger

## Schema Benefits
| Feature | Benefit |
|---------|---------|
| Request validation | Runs before handler; invalid requests never hit DB |
| Response serialization | Precompiled; 2-3x faster than JSON.stringify |
| OpenAPI docs | Auto-generated with @fastify/swagger |
| TypeScript types | Full type safety from schema |

## Common Errors
| Error | Fix |
|-------|-----|
| `FST_ERR_PLUGIN_TIMEOUT` | Plugin async registration too slow |
| `Schema validation failed` | Request doesn't match schema |
| `Decorator already exists` | Use unique names, check scope |
| `Reply already sent` | Don't call reply methods twice |
