# Litestar CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
pip install litestar uvicorn
uvicorn main:app --reload
# Litestar 2.x - modern Python ASGI framework
```

## Claude's Common Mistakes
1. **Using FastAPI patterns** — Litestar has different conventions
2. **Missing DTOs** — Always define input/output schemas
3. **Skipping dependency injection** — Use `Provide()` for services
4. **Controller-less routes** — Use Controller classes for organization
5. **Ignoring msgspec** — Faster than Pydantic for serialization

## Correct Patterns (2026)
```python
from dataclasses import dataclass
from litestar import Litestar, Controller, get, post
from litestar.di import Provide
from litestar.dto import DataclassDTO
from litestar.exceptions import NotFoundException

@dataclass
class CreateUserDTO:
    email: str
    password: str

@dataclass
class UserResponseDTO:
    id: int
    email: str

class UserController(Controller):
    path = "/users"
    dependencies = {"user_service": Provide(get_user_service)}

    @post("/", dto=DataclassDTO[CreateUserDTO], return_dto=DataclassDTO[UserResponseDTO])
    async def create_user(
        self, data: CreateUserDTO, user_service: UserService
    ) -> UserResponseDTO:
        user = await user_service.create(data.email, data.password)
        return UserResponseDTO(id=user.id, email=user.email)

    @get("/{user_id:int}", return_dto=DataclassDTO[UserResponseDTO])
    async def get_user(
        self, user_id: int, user_service: UserService
    ) -> UserResponseDTO:
        user = await user_service.get_by_id(user_id)
        if not user:
            raise NotFoundException("User not found")
        return UserResponseDTO(id=user.id, email=user.email)

# Dependency provider
async def get_user_service(state: State) -> UserService:
    return UserService(state.db)

app = Litestar(
    route_handlers=[UserController],
    state=State({"db": create_db_pool()}),
)
```

## Version Gotchas
- **Litestar 2.x**: Renamed from Starlite; different from FastAPI
- **DTOs**: Required for proper request/response handling
- **Dependency Injection**: Use `Provide()`, not FastAPI's `Depends()`
- **Controllers**: Organize routes into Controller classes

## What NOT to Do
- ❌ FastAPI patterns — Litestar has its own conventions
- ❌ Missing DTOs — Always define schemas
- ❌ `Depends()` — Use `Provide()` for DI
- ❌ Flat route handlers — Use Controller classes
- ❌ Pydantic by default — Consider msgspec for performance

## Common Errors
| Error | Fix |
|-------|-----|
| `ValidationException` | Check DTO matches request body |
| `Dependency not found` | Add to controller `dependencies` |
| `Serialization error` | Add proper DTO decorators |
| `NotFoundException` | Raise exception, don't return None |
