# Express CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
# Express 5 (stable) - requires Node.js 18+
npm install express@^5.0.0
# With TypeScript:
npm install -D typescript @types/node @types/express tsx
# Add to package.json: "type": "module"
```

## Claude's Common Mistakes
1. **Using Express 4 patterns** — Express 5 has breaking changes in res.json(), routing, params
2. **Not handling async errors** — Express 5 auto-forwards rejected promises to error middleware
3. **Using `app.del()`** — Removed; use `app.delete()`
4. **Using `req.param(name)`** — Removed; use `req.params`, `req.body`, or `req.query`
5. **Using `res.json(obj, status)`** — Use `res.status(status).json(obj)`

## Correct Patterns (2026)
```typescript
// Express 5: Async error handling (automatic)
import express from 'express';
const app = express();

// Rejected promises auto-forward to error middleware
app.get('/users/:id', async (req, res) => {
  const user = await db.users.findById(req.params.id);
  if (!user) throw new NotFoundError('User not found');
  res.json(user);
});

// Centralized error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status ?? 500).json({
    error: err.message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Express 5: Correct response pattern
app.post('/items', async (req, res) => {
  const item = await db.items.create(req.body);
  res.status(201).json(item);  // Not res.json(item, 201)
});

// Express 5: Body parsers (no combined bodyParser)
app.use(express.json());
app.use(express.urlencoded({ extended: true, depth: 10 }));
```

## Version Gotchas
- **v4→v5**: `res.json(obj, status)` → `res.status(status).json(obj)`
- **v4→v5**: `app.del()` → `app.delete()`
- **v4→v5**: `req.param()` removed, use specific sources
- **v4→v5**: `request.query` is now read-only
- **v4→v5**: Regex routes removed (ReDoS prevention)
- **v4→v5**: path-to-regexp upgraded to v8 (stricter patterns)

## What NOT to Do
- ❌ `res.json({ data }, 201)` — Use `res.status(201).json({ data })`
- ❌ `app.del('/resource', ...)` — Use `app.delete('/resource', ...)`
- ❌ `req.param('id')` — Use `req.params.id`
- ❌ `app.get(/regex/, ...)` — Use string patterns
- ❌ Manual try/catch in every route — Express 5 handles async errors

## Migration Codemods
```bash
# Auto-fix common patterns
npx @expressjs/codemod <migration-name> <path>
```

## Production Setup
```typescript
import express from 'express';
import helmet from 'helmet';
import compression from 'compression';

const app = express();
app.use(helmet());
app.use(compression());
app.use(express.json({ limit: '10kb' }));
app.disable('x-powered-by');
```
