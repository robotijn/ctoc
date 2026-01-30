# Starlette CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
pip install starlette uvicorn
# Starlette 0.40+ - ASGI foundation (powers FastAPI)
uvicorn main:app --reload
```

## Claude's Common Mistakes
1. **Blocking operations in async endpoints** — Use `run_in_executor` for sync code
2. **Reading request body twice** — Body can only be consumed once
3. **Missing lifespan context** — Use for startup/shutdown (DB pools, etc.)
4. **Ignoring middleware order** — Order matters; earliest runs first/last
5. **No exception handlers** — Errors return generic 500 without handlers

## Correct Patterns (2026)
```python
from starlette.applications import Starlette
from starlette.routing import Route, Mount
from starlette.responses import JSONResponse
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

# Lifespan for startup/shutdown
@asynccontextmanager
async def lifespan(app):
    # Startup
    app.state.db = await create_db_pool()
    yield
    # Shutdown
    await app.state.db.close()

# Async endpoint (don't block!)
async def create_user(request):
    data = await request.json()  # Only read once
    if not data.get('email'):
        return JSONResponse({'error': 'email required'}, status_code=400)

    db = request.app.state.db
    user = await db.fetchrow(
        "INSERT INTO users (email) VALUES ($1) RETURNING *",
        data['email']
    )
    return JSONResponse(dict(user), status_code=201)

# Exception handler
async def server_error(request, exc):
    return JSONResponse({'error': 'Internal error'}, status_code=500)

routes = [
    Mount('/api', routes=[
        Route('/users', create_user, methods=['POST']),
    ]),
]

middleware = [
    Middleware(CORSMiddleware, allow_origins=['*']),
]

app = Starlette(
    routes=routes,
    middleware=middleware,
    lifespan=lifespan,
    exception_handlers={500: server_error}
)
```

## Version Gotchas
- **Starlette 0.40+**: Foundation for FastAPI; can use standalone
- **Lifespan**: Replaces on_startup/on_shutdown events
- **Asyncio**: All endpoints should be async; sync blocks event loop
- **Request body**: Can only be read once per request

## What NOT to Do
- ❌ `time.sleep()` in async endpoint — Use `asyncio.sleep()`
- ❌ `data = await request.json()` twice — Store in variable
- ❌ Missing `lifespan` for DB connections — Leaks connections
- ❌ Sync middleware in async app — Blocks event loop
- ❌ No exception handlers — Returns generic error pages

## Middleware Order
```python
# Executes outside-in on request, inside-out on response
middleware = [
    Middleware(ErrorMiddleware),     # 1st on request, last on response
    Middleware(LoggingMiddleware),   # 2nd on request
    Middleware(AuthMiddleware),      # 3rd on request
]
```

## Common Errors
| Error | Fix |
|-------|-----|
| `RuntimeError: Event loop closed` | Use lifespan context manager |
| `Request body already consumed` | Only read body once, store result |
| `Middleware not executing` | Check middleware list order |
| `Connection not available` | Initialize in lifespan, store in `app.state` |
