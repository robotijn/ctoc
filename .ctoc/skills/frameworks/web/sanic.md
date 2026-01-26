# Sanic CTO
> Async Python web server - fast, Flask-like, built for concurrency.

## Commands
```bash
# Setup | Dev | Test
pip install sanic
sanic server:app --dev
pytest tests/ -v
```

## Non-Negotiables
1. Async/await everywhere - never block
2. Blueprints for route organization
3. Middleware properly ordered
4. Signal handlers for lifecycle events
5. Worker configuration for production

## Red Lines
- Blocking calls in handlers - use `run_in_executor`
- Missing blueprints for large applications
- Sync database calls - use async drivers
- Ignoring worker count - tune for your workload
- Not using Sanic's request context properly

## Pattern: Structured Application
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

## Integrates With
- **DB**: `asyncpg`, `databases`, or `tortoise-orm`
- **Validation**: `sanic-ext` with dataclasses/pydantic
- **Auth**: `sanic-jwt` or custom middleware
- **OpenAPI**: Built-in with `sanic-ext`

## Common Errors
| Error | Fix |
|-------|-----|
| `SanicException: no body` | Check Content-Type header |
| `RuntimeError: attached to different loop` | Create connections in `before_server_start` |
| `Worker timeout` | Increase timeout or optimize handler |
| `Blueprint not found` | Register with `app.blueprint()` |

## Prod Ready
- [ ] Workers configured for CPU count
- [ ] Graceful shutdown enabled
- [ ] Request logging middleware
- [ ] Health check endpoint
- [ ] CORS configured
- [ ] HTTPS with SSL certificates
