# SQLAlchemy CTO
> The Python SQL toolkit and ORM for database-agnostic applications.

## Commands
```bash
# Setup | Dev | Test
pip install sqlalchemy[asyncio] psycopg alembic
python -c "from sqlalchemy import __version__; print(__version__)"
pytest tests/ -v
```

## Non-Negotiables
1. SQLAlchemy 2.0 style: `select()` over legacy `query()`
2. Session context managers for automatic cleanup
3. Alembic for all schema migrations
4. `mapped_column()` with explicit types
5. Eager loading with `selectinload`/`joinedload`
6. Connection pooling configured for production

## Red Lines
- N+1 queries from lazy loading
- Connection leaks from missing session cleanup
- Raw SQL without parameter binding (SQL injection)
- Legacy 1.x patterns in new code
- Missing transaction boundaries

## Pattern: Modern SQLAlchemy 2.0
```python
from sqlalchemy import create_engine, select, ForeignKey
from sqlalchemy.orm import (
    DeclarativeBase, Mapped, mapped_column, relationship,
    Session, selectinload
)

class Base(DeclarativeBase):
    pass

class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(unique=True, index=True)
    orders: Mapped[list["Order"]] = relationship(back_populates="user")

class Order(Base):
    __tablename__ = "orders"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    total: Mapped[float]
    user: Mapped["User"] = relationship(back_populates="orders")

# Engine with connection pooling
engine = create_engine(
    "postgresql://user:pass@localhost/db",
    pool_size=5,
    max_overflow=10,
    pool_pre_ping=True,
)

# Context manager for session safety
with Session(engine) as session:
    stmt = (
        select(User)
        .where(User.email.contains("@example.com"))
        .options(selectinload(User.orders))
    )
    users = session.scalars(stmt).all()
```

## Integrates With
- **Databases**: PostgreSQL, MySQL, SQLite, Oracle, MSSQL
- **Async**: asyncio with `create_async_engine`
- **Frameworks**: FastAPI, Flask, Django (via adapter)

## Common Errors
| Error | Fix |
|-------|-----|
| `DetachedInstanceError` | Access attributes within session context |
| `IntegrityError: duplicate key` | Add conflict handling or check exists |
| `TimeoutError` on connection | Increase pool size or check connection limits |
| `SAWarning: relationship` | Define `back_populates` on both sides |

## Prod Ready
- [ ] SQLAlchemy 2.0 patterns throughout
- [ ] Connection pooling with health checks
- [ ] Alembic migrations in CI/CD
- [ ] Eager loading for known access patterns
- [ ] Query logging in development mode
