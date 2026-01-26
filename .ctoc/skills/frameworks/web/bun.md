# Bun CTO
> All-in-one JavaScript runtime.

## Non-Negotiables
1. Native APIs over npm packages
2. Bun.serve for HTTP
3. SQLite with bun:sqlite
4. Bundler for production
5. Test runner for tests

## Red Lines
- Node.js APIs when Bun native exists
- npm when bun install works
- Ignoring performance advantages
- Missing lockfile

## Pattern
```typescript
Bun.serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url)
    if (url.pathname === '/api') {
      return Response.json({ ok: true })
    }
    return new Response('Not found', { status: 404 })
  }
})
```
