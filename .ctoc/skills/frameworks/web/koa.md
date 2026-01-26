# Koa CTO
> Elegant middleware for Node.js - async/await native, minimal core, modular by design.

## Commands
```bash
# Setup | Dev | Test
npm init -y && npm install koa @koa/router koa-bodyparser
npm run dev
npm test
```

## Non-Negotiables
1. Async/await middleware - no callbacks
2. Context-based API - use `ctx` consistently
3. Error handling middleware at the top
4. Modular middleware selection - add only what you need
5. Proper response handling with `ctx.body`

## Red Lines
- Callback-based middleware - always async/await
- Mutating `ctx.body` multiple times in one request
- Missing error handler middleware
- Monolithic middleware chains - keep middleware focused
- Ignoring ctx.state for request-scoped data

## Pattern: Layered Middleware
```typescript
import Koa from 'koa';
import Router from '@koa/router';
import bodyParser from 'koa-bodyparser';

const app = new Koa();
const router = new Router();

// Error handling - must be first
app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err: any) {
    ctx.status = err.status || 500;
    ctx.body = { error: err.message };
    ctx.app.emit('error', err, ctx);
  }
});

// Logging middleware
app.use(async (ctx, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  ctx.set('X-Response-Time', `${ms}ms`);
  console.log(`${ctx.method} ${ctx.url} - ${ms}ms`);
});

app.use(bodyParser());

// Routes
router.post('/users', async (ctx) => {
  const { email, password } = ctx.request.body;
  // Validate and create user
  const user = await userService.create({ email, password });
  ctx.status = 201;
  ctx.body = user;
});

app.use(router.routes()).use(router.allowedMethods());
```

## Integrates With
- **Routing**: `@koa/router` for structured routes
- **Auth**: `koa-passport` or custom JWT middleware
- **Validation**: `koa-joi-router` or custom Zod middleware
- **Session**: `koa-session` with Redis store

## Common Errors
| Error | Fix |
|-------|-----|
| `Not Found` with empty body | Check router is registered with `app.use()` |
| `ctx.body not set` | Ensure middleware calls `await next()` |
| `Cannot read property of undefined` | Check bodyParser middleware order |
| `Error not caught` | Add error middleware at top of chain |

## Prod Ready
- [ ] Error handling middleware configured
- [ ] Request logging with correlation IDs
- [ ] Helmet-style security headers
- [ ] Graceful shutdown handling
- [ ] Health check endpoint
- [ ] Rate limiting middleware
