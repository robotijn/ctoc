# FastAPI CTO
> High-performance async Python APIs with automatic OpenAPI docs and type safety.

## Commands
```bash
# Setup | Dev | Test
pip install fastapi uvicorn[standard] pydantic-settings
uvicorn app.main:app --reload --port 8000
pytest tests/ -v --cov=app --cov-report=term-missing
```

## Non-Negotiables
1. Pydantic models for all request/response schemas
2. Dependency injection for services, DB sessions, auth
3. Separate schemas: CreateDTO, UpdateDTO, ResponseDTO
4. Service layer isolates business logic from routes
5. Async all the way - never block the event loop

## Red Lines
- Blocking calls in async routes (use `httpx`, not `requests`)
- Business logic in route handlers
- Missing input validation on any endpoint
- N+1 queries - always eager load relationships
- Hardcoded secrets or config values

## Pattern: Service Layer
```python
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.db import get_db
from app.schemas.user import UserCreate, UserResponse
from app.services.user import UserService

router = APIRouter(prefix="/users", tags=["users"])

@router.post("/", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    user_in: UserCreate,
    db: AsyncSession = Depends(get_db),
    service: UserService = Depends(),
) -> UserResponse:
    if await service.get_by_email(db, user_in.email):
        raise HTTPException(status_code=400, detail="Email already registered")
    return await service.create(db, user_in)
```

## Integrates With
- **DB**: SQLAlchemy async with `asyncpg`, use `select()` not legacy query
- **Auth**: `fastapi-users` or custom JWT with `python-jose`
- **Cache**: `redis.asyncio` with dependency injection

## Common Errors
| Error | Fix |
|-------|-----|
| `RuntimeWarning: coroutine was never awaited` | Add `await` to async call |
| `422 Unprocessable Entity` | Check Pydantic schema matches request body |
| `sqlalchemy.exc.MissingGreenlet` | Use async session, not sync in async route |
| `Event loop is closed` | Use `@pytest.fixture(scope="function")` for async tests |

## Prod Ready
- [ ] Structured logging with `structlog` or `loguru`
- [ ] Health check endpoint at `/health`
- [ ] OpenAPI docs disabled in production (`docs_url=None`)
- [ ] Rate limiting with `slowapi`
- [ ] CORS configured for allowed origins only
- [ ] Alembic migrations with `--autogenerate`
