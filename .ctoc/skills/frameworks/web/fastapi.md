# FastAPI CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
pip install "fastapi[standard]"
# Includes: uvicorn, fastapi-cli, uvloop
# Without cloud CLI:
pip install "fastapi[standard-no-fastapi-cloud-cli]"
# Development:
fastapi dev main.py
# Production:
fastapi run main.py
```

## Claude's Common Mistakes
1. **Blocking code in async routes** — `async def` routes block event loop if using sync I/O
2. **One endpoint calling another** — Extract shared logic to service layer, don't chain endpoints
3. **Everything in main.py** — Use routers, schemas/, services/, core/ structure
4. **Single worker on multi-core** — Use multiple Uvicorn workers (1 per CPU core)
5. **Using `asyncio.create_task` for critical ops** — Await tasks that affect response

## Correct Patterns (2026)
```python
# Proper async vs sync choice
from fastapi import FastAPI, Depends
from sqlalchemy.ext.asyncio import AsyncSession

# Use sync def for CPU-bound (runs in threadpool)
@app.get("/sync")
def sync_route():
    return heavy_cpu_computation()

# Use async def ONLY for true async I/O
@app.get("/async")
async def async_route(db: AsyncSession = Depends(get_db)):
    result = await db.execute(query)  # Non-blocking
    return result.scalars().all()

# Service layer pattern
# services/user.py
class UserService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, data: UserCreate) -> User:
        user = User(**data.model_dump())
        self.db.add(user)
        await self.db.commit()
        return user

# routers/user.py
@router.post("/users")
async def create_user(
    data: UserCreate,
    service: UserService = Depends()
):
    return await service.create(data)
```

## Version Gotchas
- **Pydantic v1→v2**: `.dict()` → `.model_dump()`, `Config` → `model_config`
- **Python 3.9+**: Use `list[str]` not `List[str]`, `dict` not `Dict`
- **With SQLAlchemy 2.0**: Use async sessions, not sync in async routes

## What NOT to Do
- ❌ `async def route(): requests.get(...)` — Blocks event loop
- ❌ `@app.get("/a") ... @app.get("/b"): return await call_a()` — Use services
- ❌ Single uvicorn worker in production — Use `--workers N`
- ❌ `asyncio.create_task(critical_op)` without await — Silent failures
- ❌ Heavy in-memory objects with multiple workers — Memory multiplies per worker

## Production Setup
```bash
# Multi-worker production (N = CPU cores)
gunicorn main:app -w 4 -k uvicorn.workers.UvicornWorker
# Or direct uvicorn:
uvicorn main:app --workers 4 --host 0.0.0.0
```
