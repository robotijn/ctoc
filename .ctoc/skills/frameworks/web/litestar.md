# Litestar CTO
> Modern Python ASGI framework.

## Non-Negotiables
1. DTO pattern for I/O
2. Dependency injection
3. OpenAPI generation
4. Layered architecture
5. Msgspec for performance

## Red Lines
- Missing DTOs
- Skipping dependency injection
- Blocking operations
- No input validation

## Pattern
```python
from litestar import Litestar, post
from litestar.dto import DataclassDTO

@post("/users", dto=DataclassDTO[CreateUserDTO])
async def create_user(data: CreateUserDTO, service: UserService) -> User:
    return await service.create(data)
```
