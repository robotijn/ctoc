# Koa CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
npm init -y
npm install koa @koa/router koa-bodyparser
# Requires Node.js 18+
```

## Claude's Common Mistakes
1. **Missing error middleware** — Must be first in chain to catch all errors
2. **Callback-based middleware** — Always use async/await
3. **Not calling `await next()`** — Breaks middleware chain
4. **Setting `ctx.body` multiple times** — Only set once per request
5. **Ignoring `ctx.state`** — Use for request-scoped data sharing

## Correct Patterns (2026)
```typescript
import Koa from 'koa';
import Router from '@koa/router';
import bodyParser from 'koa-bodyparser';

const app = new Koa();
const router = new Router();

// Error handling MUST be first
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
  await next();  // MUST await next()
  const ms = Date.now() - start;
  ctx.set('X-Response-Time', `${ms}ms`);
});

app.use(bodyParser());

// Routes
router.post('/users', async (ctx) => {
  const { email, password } = ctx.request.body;
  // Validate
  if (!email || !password) {
    ctx.throw(400, 'Email and password required');
  }
  const user = await userService.create({ email, password });
  ctx.status = 201;
  ctx.body = user;  // Set once
});

// Register routes AFTER middleware
app.use(router.routes());
app.use(router.allowedMethods());

app.listen(3000);
```

## Version Gotchas
- **Koa 2.x**: Async/await native; callbacks deprecated
- **Node.js 18+**: Required for latest features
- **ctx.request.body**: Requires bodyparser middleware
- **router.allowedMethods()**: Returns 405 for wrong HTTP methods

## What NOT to Do
- ❌ Missing error handler at top — Errors escape to Node.js
- ❌ `app.use((ctx, next) => { ... })` without async — Use async/await
- ❌ Forgetting `await next()` — Downstream middleware won't run
- ❌ Setting `ctx.body` multiple times — Confusing behavior
- ❌ Routes before bodyparser — Request body not parsed

## Middleware Order
```typescript
// Correct order:
app.use(errorHandler);    // 1. Error catching
app.use(logger);          // 2. Logging
app.use(cors());          // 3. CORS
app.use(bodyParser());    // 4. Body parsing
app.use(auth);            // 5. Authentication
app.use(router.routes()); // 6. Routes (last)
```

## Common Errors
| Error | Fix |
|-------|-----|
| `Not Found` empty body | Check router registered with `app.use()` |
| `ctx.body not set` | Ensure `await next()` is called |
| `Cannot read property` | Check bodyParser middleware order |
| `Error not caught` | Add error middleware at chain start |
