# Falcon CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
pip install falcon uvicorn
uvicorn app:app --reload
# Falcon 4.x - high-performance Python API framework
```

## Claude's Common Mistakes
1. **Wrong method names** — Use `on_get`, `on_post` (not `get`, `post`)
2. **Using sync App for async** — Use `falcon.asgi.App` for async
3. **Missing media handlers** — Set `resp.media` for JSON responses
4. **Forgetting `await` in ASGI** — Use `await req.get_media()`
5. **No middleware for auth** — Use middleware for cross-cutting

## Correct Patterns (2026)
```python
import falcon.asgi

class UserResource:
    def __init__(self, user_service):
        self.service = user_service

    async def on_get(self, req, resp, user_id):
        user = await self.service.get(user_id)
        if not user:
            raise falcon.HTTPNotFound(description='User not found')
        resp.media = user.to_dict()

    async def on_post(self, req, resp):
        # MUST await for ASGI
        data = await req.get_media()
        if not data.get('email'):
            raise falcon.HTTPBadRequest(description='Email required')
        user = await self.service.create(data)
        resp.status = falcon.HTTP_201
        resp.media = user.to_dict()

class HealthResource:
    async def on_get(self, req, resp):
        resp.media = {'status': 'ok'}

# Middleware for cross-cutting concerns
class AuthMiddleware:
    async def process_request(self, req, resp):
        token = req.get_header('Authorization')
        if req.path.startswith('/api') and not token:
            raise falcon.HTTPUnauthorized(description='Token required')

# ASGI App (NOT falcon.App for async)
app = falcon.asgi.App(middleware=[AuthMiddleware()])
app.add_route('/health', HealthResource())
app.add_route('/api/users', UserResource(UserService()))
app.add_route('/api/users/{user_id}', UserResource(UserService()))
```

## Version Gotchas
- **Falcon 4.x**: ASGI-first; `falcon.asgi.App` for async
- **Method names**: `on_get`, `on_post`, `on_put`, `on_delete`
- **Media**: Use `resp.media` for automatic JSON serialization
- **Async**: Always `await req.get_media()` in ASGI

## What NOT to Do
- ❌ `falcon.App` for async — Use `falcon.asgi.App`
- ❌ `def on_get` in ASGI — Use `async def on_get`
- ❌ `req.media` without await — Use `await req.get_media()`
- ❌ `resp.body = json.dumps()` — Use `resp.media`
- ❌ `get()`, `post()` methods — Use `on_get()`, `on_post()`

## Common Errors
| Error | Fix |
|-------|-----|
| `Method not allowed` | Check method name: `on_get` not `get` |
| `Media handler not found` | Set `resp.media` |
| `coroutine not awaited` | Add `await` for async calls |
| `Request body empty` | Use `await req.get_media()` |
