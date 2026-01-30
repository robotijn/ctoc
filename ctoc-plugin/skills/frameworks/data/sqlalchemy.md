# SQLAlchemy CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
pip install "sqlalchemy[asyncio]>=2.0" psycopg alembic
# For async PostgreSQL (recommended):
pip install asyncpg
```

## Claude's Common Mistakes
1. **Using 1.x query() pattern** - Use 2.0 select() style exclusively
2. **One AsyncSession for multiple tasks** - Each asyncio task needs its own session
3. **Lazy loading in async** - Causes "greenlet" errors; use selectinload/joinedload
4. **Missing session context manager** - Causes connection leaks
5. **N+1 queries from relationships** - Always eager load with options()

## Correct Patterns (2026)
```python
from sqlalchemy import select, ForeignKey
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, selectinload

class Base(DeclarativeBase):
    pass

class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(unique=True, index=True)
    orders: Mapped[list["Order"]] = relationship(back_populates="user")

# Async engine with connection pooling
engine = create_async_engine(
    "postgresql+asyncpg://user:pass@localhost/db",
    pool_size=5,
    max_overflow=10,
    pool_pre_ping=True,
)

AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)

# Async session per task (CRITICAL for asyncio)
async def get_user_with_orders(user_id: int):
    async with AsyncSessionLocal() as session:
        stmt = (
            select(User)
            .where(User.id == user_id)
            .options(selectinload(User.orders))  # Eager load
        )
        result = await session.execute(stmt)
        return result.scalar_one_or_none()
```

## Version Gotchas
- **v1.4->v2.0**: query() deprecated; use select() exclusively
- **v2.0 async**: Requires greenlet; install with `[asyncio]` extra
- **v2.0 types**: Use Mapped[] and mapped_column() for type hints
- **Write-only relations**: Use for collections in async to avoid implicit IO

## What NOT to Do
- Do NOT use legacy query() in new code
- Do NOT share AsyncSession across asyncio tasks
- Do NOT use lazy loading with async (greenlet errors)
- Do NOT forget session context managers (connection leak)
