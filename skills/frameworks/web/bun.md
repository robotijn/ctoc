# Bun CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
curl -fsSL https://bun.sh/install | bash
bun init
bun run index.ts
# Bun 1.1+ - all-in-one JavaScript runtime
```

## Claude's Common Mistakes
1. **Using Node.js APIs when Bun native exists** — `Bun.serve()` over `http.createServer()`
2. **Using `npm` instead of `bun`** — `bun install` is faster
3. **Missing `bun.lockb`** — Always commit lockfile for reproducibility
4. **Node.js polyfills** — Bun has native Web APIs; no polyfills needed
5. **Ignoring `Bun.password`** — Built-in secure password hashing

## Correct Patterns (2026)
```typescript
import { Database } from 'bun:sqlite';

// Native SQLite (no npm package needed)
const db = new Database('app.db');
db.run(`CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL
)`);

const createUser = db.prepare(
  'INSERT INTO users (email, password) VALUES (?, ?) RETURNING *'
);

// Native HTTP server (faster than Express)
Bun.serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === '/users' && req.method === 'POST') {
      const body = await req.json();
      // Built-in password hashing
      const hashed = await Bun.password.hash(body.password);
      const user = createUser.get(body.email, hashed);
      return Response.json(user, { status: 201 });
    }

    return new Response('Not found', { status: 404 });
  },
  error(error) {
    console.error(error);
    return new Response('Internal Server Error', { status: 500 });
  },
});
```

## Version Gotchas
- **Bun 1.1+**: Stable; Windows support improved
- **`bun:sqlite`**: Native, faster than better-sqlite3
- **`Bun.password`**: Argon2 hashing built-in
- **`Bun.file()`**: Fast file I/O API

## What NOT to Do
- ❌ `npm install` — Use `bun install`
- ❌ `require('http').createServer()` — Use `Bun.serve()`
- ❌ `bcrypt` package — Use `Bun.password.hash()`
- ❌ `better-sqlite3` — Use native `bun:sqlite`
- ❌ Missing `bun.lockb` in git — Commit for reproducibility

## Bun Native APIs
| Node.js | Bun Native |
|---------|------------|
| `http.createServer` | `Bun.serve()` |
| `fs.readFile` | `Bun.file()` |
| `bcrypt` | `Bun.password` |
| `better-sqlite3` | `bun:sqlite` |
| `child_process.spawn` | `Bun.spawn()` |

## Production Setup
```bash
# Build for production
bun build ./index.ts --compile --outfile server

# Docker
FROM oven/bun:1
COPY . .
RUN bun install --frozen-lockfile
CMD ["bun", "run", "index.ts"]
```
