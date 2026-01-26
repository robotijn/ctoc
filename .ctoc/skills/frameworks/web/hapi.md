# Hapi CTO
> Configuration-driven Node.js framework - enterprise-ready, plugin architecture.

## Commands
```bash
# Setup | Dev | Test
npm init -y && npm install @hapi/hapi @hapi/joi @hapi/boom
npm run start
npm test
```

## Non-Negotiables
1. Plugin architecture for modularity
2. Joi validation on all route inputs
3. Server methods for caching and reusable logic
4. Authentication strategies configured properly
5. Lifecycle hooks for cross-cutting concerns

## Red Lines
- Direct request handling without validation
- Ignoring `server.ext` hooks for auth/logging
- Missing authentication on protected routes
- Monolithic plugins - one concern per plugin
- Synchronous handlers blocking event loop

## Pattern: Plugin with Validation
```javascript
// plugins/users.js
const Joi = require('@hapi/joi');
const Boom = require('@hapi/boom');

const usersPlugin = {
  name: 'users',
  version: '1.0.0',
  register: async (server, options) => {
    const { userService } = server.app.services;

    server.route({
      method: 'POST',
      path: '/users',
      options: {
        auth: 'jwt',
        validate: {
          payload: Joi.object({
            email: Joi.string().email().required(),
            password: Joi.string().min(8).required(),
          }),
        },
        handler: async (request, h) => {
          try {
            const user = await userService.create(request.payload);
            return h.response(user).code(201);
          } catch (err) {
            if (err.code === 'EMAIL_EXISTS') {
              throw Boom.conflict('Email already registered');
            }
            throw Boom.internal();
          }
        },
      },
    });
  },
};

module.exports = usersPlugin;
```

## Integrates With
- **DB**: Any ORM, inject via `server.app`
- **Auth**: `@hapi/cookie`, `hapi-auth-jwt2`
- **Caching**: `@hapi/catbox` with Redis adapter
- **Docs**: `hapi-swagger` for OpenAPI

## Common Errors
| Error | Fix |
|-------|-----|
| `Unknown authentication strategy` | Register auth strategy before routes |
| `Validation error` | Check Joi schema matches request shape |
| `Plugin already registered` | Check for duplicate plugin registration |
| `Handler method did not return` | Return value or `h.response()` |

## Prod Ready
- [ ] All routes have validation
- [ ] Authentication on protected endpoints
- [ ] Server methods for expensive operations
- [ ] Health check plugin registered
- [ ] Error handling with Boom
- [ ] Request logging plugin
