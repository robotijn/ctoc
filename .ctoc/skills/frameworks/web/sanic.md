# Sanic CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
pip install sanic sanic-ext
sanic server:app --dev
# Sanic 24.x - async Python web framework
```

## Claude's Common Mistakes
1. **Blocking calls in handlers** — Use `run_in_executor` for sync code
2. **Sync database drivers** — Use async drivers (asyncpg, motor)
3. **Creating connections in handlers** — Use `before_server_start` signal
4. **Missing blueprints** — Organize routes with blueprints
5. **Ignoring worker configuration** — Tune workers for production

## Correct Patterns (2026)
```python
from sanic import Sanic, Blueprint, json
from sanic.exceptions import NotFound
from sanic_ext import validate
from dataclasses import dataclass

@dataclass
class CreateUserRequest:
    email: str
    password: str

app = Sanic("MyApp")
users_bp = Blueprint("users", url_prefix="/users")

@users_bp.post("/")
@validate(json=CreateUserRequest)
async def create_user(request, body: CreateUserRequest):
    # Use app.ctx for shared resources
    user = await request.app.ctx.user_service.create(
        email=body.email,
        password=body.password
    )
    return json(user.to_dict(), status=201)

@users_bp.get("/<user_id:int>")
async def get_user(request, user_id: int):
    user = await request.app.ctx.user_service.get(user_id)
    if not user:
        raise NotFound("User not found")
    return json(user.to_dict())

# Setup connections in signal (NOT in handlers)
@app.before_server_start
async def setup_db(app, loop):
    app.ctx.db = await create_db_pool()
    app.ctx.user_service = UserService(app.ctx.db)

@app.after_server_stop
async def close_db(app, loop):
    await app.ctx.db.close()

app.blueprint(users_bp)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, workers=4)
```

## Version Gotchas
- **Sanic 24.x**: Current stable; improved signals
- **`app.ctx`**: Application context for shared resources
- **`before_server_start`**: Where to create DB pools (not handler)
- **Workers**: Use multiple for production (1 per CPU core)

## What NOT to Do
- ❌ `requests.get()` in handlers — Use `httpx.AsyncClient`
- ❌ `psycopg2` — Use `asyncpg` (async driver)
- ❌ Creating DB pool in handler — Use `before_server_start`
- ❌ Routes without blueprints in large apps — Hard to maintain
- ❌ Single worker in production — Use `workers=N`

## Signal Order
```python
@app.before_server_start  # 1. Setup (DB connections)
@app.after_server_start   # 2. After listening
@app.before_server_stop   # 3. Before shutdown
@app.after_server_stop    # 4. Cleanup (close connections)
```

## Common Errors
| Error | Fix |
|-------|-----|
| `attached to different loop` | Create connections in `before_server_start` |
| `SanicException: no body` | Check Content-Type header |
| `Worker timeout` | Increase timeout or optimize handler |
| `Blueprint not found` | Register with `app.blueprint()` |
