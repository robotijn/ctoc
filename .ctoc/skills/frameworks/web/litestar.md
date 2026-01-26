# Litestar CTO
> Modern Python ASGI framework - fast, typed, batteries included.

## Commands
```bash
# Setup | Dev | Test
pip install litestar uvicorn
uvicorn main:app --reload
pytest tests/ -v
```

## Non-Negotiables
1. DTO pattern for request/response I/O
2. Dependency injection for services
3. OpenAPI documentation auto-generated
4. Layered architecture with controllers
5. Msgspec for high-performance serialization

## Red Lines
- Missing DTOs - always define input/output schemas
- Skipping dependency injection - no manual instantiation
- Blocking operations in async handlers
- No input validation
- Ignoring Litestar patterns for FastAPI habits

## Pattern: Controller with DTOs
```python
from dataclasses import dataclass
from litestar import Litestar, Controller, get, post
from litestar.di import Provide
from litestar.dto import DataclassDTO

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

async def get_user_service(state: State) -> UserService:
    return UserService(state.db)

app = Litestar(
    route_handlers=[UserController],
    state=State({"db": create_db_pool()}),
)
```

## Integrates With
- **DB**: SQLAlchemy async, Tortoise ORM
- **Auth**: `litestar-jwt` or custom guards
- **Validation**: Msgspec or Pydantic DTOs
- **Docs**: Built-in OpenAPI with Swagger/Redoc

## Common Errors
| Error | Fix |
|-------|-----|
| `ValidationException` | Check DTO matches request body |
| `NotFoundException` | Raise proper exception, don't return None |
| `Dependency not found` | Add to controller `dependencies` dict |
| `Serialization error` | Check DTO is properly decorated |

## Prod Ready
- [ ] DTOs for all endpoints
- [ ] Guards for authentication
- [ ] Exception handlers configured
- [ ] OpenAPI documented
- [ ] Health check endpoint
- [ ] Structured logging enabled
