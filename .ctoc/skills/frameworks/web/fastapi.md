# FastAPI CTO
> High-performance async Python APIs.

## Key Insight
- **Async routes** - Never block the event loop
- **Sync routes** - Blocking OK but has overhead

## Non-Negotiables
1. Pydantic models for all I/O
2. Dependency injection
3. Separate schemas (Create/Update/Response)
4. Service layer for business logic

## Red Lines
- Blocking calls in async (use httpx, not requests)
- Business logic in route handlers
- Missing input validation
- N+1 queries
