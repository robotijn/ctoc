# Starlette CTO
> ASGI framework foundation.

## Non-Negotiables
1. ASGI understanding
2. Middleware composition
3. Route classes
4. Background tasks
5. Proper exception handling

## Red Lines
- Blocking in async endpoints
- Missing exception handlers
- Sync middleware
- Ignoring lifespan events

## Pattern
```python
from starlette.applications import Starlette
from starlette.routing import Route

async def create_user(request):
    data = await request.json()
    user = await user_service.create(data)
    return JSONResponse(user, status_code=201)

app = Starlette(routes=[Route("/users", create_user, methods=["POST"])])
```
