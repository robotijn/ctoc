# Falcon CTO
> High-performance Python API framework - minimal, fast, ASGI/WSGI.

## Commands
```bash
# Setup | Dev | Test
pip install falcon uvicorn
uvicorn app:app --reload
pytest tests/ -v
```

## Non-Negotiables
1. Resource classes for API endpoints
2. Middleware hooks for cross-cutting concerns
3. ASGI for async, WSGI for sync
4. Responder methods (`on_get`, `on_post`, etc.)
5. Minimal overhead - no magic

## Red Lines
- Logic outside resource classes
- Missing media handlers for serialization
- Sync code in ASGI mode
- Ignoring hooks for auth/logging
- Not validating input data

## Pattern: ASGI Resource
```python
import falcon.asgi

class UserResource:
    def __init__(self, user_service):
        self.user_service = user_service

    async def on_get(self, req, resp, user_id):
        user = await self.user_service.get(user_id)
        if not user:
            raise falcon.HTTPNotFound(description='User not found')
        resp.media = user.to_dict()

    async def on_post(self, req, resp):
        data = await req.get_media()
        if not data.get('email'):
            raise falcon.HTTPBadRequest(description='Email required')

        user = await self.user_service.create(data)
        resp.status = falcon.HTTP_201
        resp.media = user.to_dict()

class HealthResource:
    async def on_get(self, req, resp):
        resp.media = {'status': 'ok'}

class AuthMiddleware:
    async def process_request(self, req, resp):
        token = req.get_header('Authorization')
        if req.path.startswith('/api') and not token:
            raise falcon.HTTPUnauthorized(description='Token required')

user_service = UserService()

app = falcon.asgi.App(middleware=[AuthMiddleware()])
app.add_route('/health', HealthResource())
app.add_route('/api/users', UserResource(user_service))
app.add_route('/api/users/{user_id}', UserResource(user_service))
```

## Integrates With
- **DB**: SQLAlchemy async, `databases`
- **Validation**: Marshmallow or Pydantic
- **Auth**: Custom middleware
- **OpenAPI**: `falcon-apispec`

## Common Errors
| Error | Fix |
|-------|-----|
| `Media handler not found` | Set `resp.media` or add custom handler |
| `Async not working` | Use `falcon.asgi.App`, not `falcon.App` |
| `AttributeError on resource` | Check method name (`on_get` not `get`) |
| `Request body empty` | Use `await req.get_media()` for async |

## Prod Ready
- [ ] ASGI server (uvicorn, hypercorn)
- [ ] Middleware for logging
- [ ] Error handlers configured
- [ ] Health check endpoint
- [ ] Input validation on all routes
- [ ] CORS middleware if needed
