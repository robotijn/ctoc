# Hapi CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
npm init -y
npm install @hapi/hapi @hapi/joi @hapi/boom
# Hapi 21+ - requires Node.js 18+
```

## Claude's Common Mistakes
1. **Missing Joi validation** — Validate all route inputs
2. **No authentication strategy** — Register auth before routes
3. **Monolithic plugins** — One concern per plugin
4. **Ignoring `server.ext` hooks** — Use for logging, auth
5. **Synchronous handlers** — Always use async handlers

## Correct Patterns (2026)
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
        auth: 'jwt',  // Auth strategy must be registered first
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

// server.js
const Hapi = require('@hapi/hapi');

const init = async () => {
  const server = Hapi.server({ port: 3000 });

  // Register auth BEFORE routes
  await server.register(require('hapi-auth-jwt2'));
  server.auth.strategy('jwt', 'jwt', { /* config */ });

  // Register plugins
  await server.register(usersPlugin);

  await server.start();
};
```

## Version Gotchas
- **Hapi 21+**: Node.js 18+ required
- **@hapi/joi**: Validation; install separately
- **@hapi/boom**: HTTP-friendly error objects
- **Auth strategies**: Must register before routes use them

## What NOT to Do
- ❌ Routes without `validate` option — Always validate input
- ❌ Using auth before registering strategy — Register auth first
- ❌ Multiple concerns in one plugin — Split by domain
- ❌ Sync handlers blocking event loop — Use async
- ❌ Throwing plain errors — Use Boom for HTTP errors

## Plugin Architecture
```javascript
// One plugin per domain
plugins/
├── users.js      // User routes and handlers
├── auth.js       // Authentication strategy
├── health.js     // Health check endpoint
└── logging.js    // Request logging
```

## Common Errors
| Error | Fix |
|-------|-----|
| `Unknown authentication strategy` | Register strategy before routes |
| `Validation error` | Check Joi schema matches request |
| `Plugin already registered` | Check for duplicate registration |
| `Handler method did not return` | Return value or `h.response()` |
