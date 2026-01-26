# Starlette CTO
> ASGI framework foundation - minimal, fast, the basis of FastAPI.

## Commands
```bash
# Setup | Dev | Test
pip install starlette uvicorn
uvicorn main:app --reload
pytest tests/ -v
```

## Non-Negotiables
1. ASGI understanding - middleware and lifespan
2. Middleware composition for cross-cutting concerns
3. Route classes for resource organization
4. Background tasks for non-blocking operations
5. Proper exception handling with handlers

## Red Lines
- Blocking operations in async endpoints
- Missing exception handlers
- Sync middleware blocking event loop
- Ignoring lifespan events for startup/shutdown
- Not using Request/Response properly

## Pattern: Structured Application
```python
from starlette.applications import Starlette
from starlette.routing import Route, Mount
from starlette.responses import JSONResponse
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app):
    # Startup
    app.state.db = await create_db_pool()
    yield
    # Shutdown
    await app.state.db.close()

async def create_user(request):
    data = await request.json()
    # Validate
    if not data.get('email'):
        return JSONResponse({'error': 'email required'}, status_code=400)

    db = request.app.state.db
    user = await db.execute(
        "INSERT INTO users (email, password) VALUES ($1, $2) RETURNING *",
        data['email'], data['password']
    )
    return JSONResponse(dict(user), status_code=201)

async def get_user(request):
    user_id = request.path_params['user_id']
    db = request.app.state.db
    user = await db.fetchrow("SELECT * FROM users WHERE id = $1", user_id)
    if not user:
        return JSONResponse({'error': 'not found'}, status_code=404)
    return JSONResponse(dict(user))

routes = [
    Mount('/api', routes=[
        Route('/users', create_user, methods=['POST']),
        Route('/users/{user_id:int}', get_user, methods=['GET']),
    ]),
]

middleware = [
    Middleware(CORSMiddleware, allow_origins=['*']),
]

app = Starlette(routes=routes, middleware=middleware, lifespan=lifespan)
```

## Integrates With
- **DB**: `databases` async package or `asyncpg`
- **Auth**: Custom middleware with JWT
- **Validation**: Pydantic models for request parsing
- **Templates**: Jinja2 with `Starlette.templates`

## Common Errors
| Error | Fix |
|-------|-----|
| `RuntimeError: Event loop closed` | Use proper lifespan context manager |
| `Starlette not accepting connections` | Check port binding, run with uvicorn |
| `Request body already consumed` | Only read body once, store if needed |
| `Middleware not executing` | Check middleware order in list |

## Prod Ready
- [ ] Lifespan manages connections
- [ ] Exception handlers for all error types
- [ ] Middleware for logging and timing
- [ ] Health check endpoint
- [ ] CORS properly configured
- [ ] Multiple workers with uvicorn
