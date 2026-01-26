# Bun CTO
> All-in-one JavaScript runtime - fast by default, native APIs, drop-in Node replacement.

## Commands
```bash
# Setup | Dev | Test
bun init
bun run index.ts
bun test
```

## Non-Negotiables
1. Native Bun APIs over npm packages when available
2. `Bun.serve()` for HTTP servers
3. `bun:sqlite` for local databases
4. Bun bundler for production builds
5. Bun test runner for testing

## Red Lines
- Node.js APIs when Bun native exists
- `npm` when `bun install` works
- Ignoring Bun's performance advantages
- Missing `bun.lockb` in version control
- Heavy polyfills for web APIs

## Pattern: HTTP Server with SQLite
```typescript
import { Database } from 'bun:sqlite';

const db = new Database('app.db');
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL
  )
`);

const createUser = db.prepare('INSERT INTO users (email, password) VALUES (?, ?) RETURNING *');
const getUser = db.prepare('SELECT id, email FROM users WHERE id = ?');

Bun.serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === '/users' && req.method === 'POST') {
      const body = await req.json();
      const user = createUser.get(body.email, await Bun.password.hash(body.password));
      return Response.json(user, { status: 201 });
    }

    if (url.pathname.startsWith('/users/') && req.method === 'GET') {
      const id = url.pathname.split('/')[2];
      const user = getUser.get(id);
      if (!user) return new Response('Not found', { status: 404 });
      return Response.json(user);
    }

    return new Response('Not found', { status: 404 });
  },
  error(error) {
    console.error(error);
    return new Response('Internal Server Error', { status: 500 });
  },
});
```

## Integrates With
- **Framework**: Hono, Elysia for structured routing
- **DB**: `bun:sqlite` native, or Postgres/MySQL via drivers
- **Auth**: Built-in `Bun.password` for hashing
- **File I/O**: `Bun.file()` for fast file operations

## Common Errors
| Error | Fix |
|-------|-----|
| `Module not found` | Check import path, run `bun install` |
| `Cannot find bun:sqlite` | Update Bun to latest version |
| `EADDRINUSE` | Port already in use, change port |
| `TypeError: Response.json` | Use `Response.json()` not `new Response(JSON)` |

## Prod Ready
- [ ] `bun build` for production bundle
- [ ] Environment variables via `.env`
- [ ] Error handling in `error` callback
- [ ] Health check endpoint
- [ ] Graceful shutdown with signal handlers
- [ ] Docker multi-stage build with `oven/bun`
