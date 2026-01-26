# Koa CTO
> Elegant middleware for Node.js.

## Non-Negotiables
1. Async/await middleware
2. Context-based API
3. Proper error handling middleware
4. Modular middleware selection
5. No bundled middleware

## Red Lines
- Callback-based middleware
- Mutating ctx.body multiple times
- Missing error handler
- Monolithic middleware chains

## Pattern
```javascript
const Koa = require('koa')
const app = new Koa()

app.use(async (ctx, next) => {
  const start = Date.now()
  await next()
  ctx.set('X-Response-Time', `${Date.now() - start}ms`)
})
```
