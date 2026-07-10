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

## ORM Footguns — N+1, lazy vs eager, identity map
The classic ORM trap: load a list, then touch each row's relationship in a loop. With
the default `lazy="select"` strategy each access emits its own query — **1 query for the
list + N for the relations = N+1**.

```python
from sqlalchemy.orm import selectinload, joinedload

# FOOTGUN (N+1): default lazy loading fires one query PER user for .orders
users = session.execute(select(User)).scalars().all()
for u in users:
    print(len(u.orders))        # each iteration -> SELECT ... FROM orders WHERE user_id=?

# RIGHT: eager-load the collection in ONE extra query (selectinload = IN(...) batch)
stmt = select(User).options(selectinload(User.orders))
users = session.execute(stmt).scalars().all()      # 2 queries total, not 1+N

# selectinload  -> separate SELECT ... WHERE user_id IN (...); best for collections.
# joinedload    -> single LEFT OUTER JOIN; best for many-to-one / one-to-one.
#                  Beware "cartesian" row multiplication when joinedload-ing a *collection*
#                  with LIMIT -- use selectinload for to-many + LIMIT instead.
stmt = select(Order).options(joinedload(Order.user))   # to-one: JOIN is fine
```
- The tell is any relationship access inside a `for`/comprehension. Fix at the QUERY
  with `.options(selectinload(...))` / `joinedload(...)`, or define `lazy="selectin"` on
  the `relationship()`. Turn on `create_engine(..., echo=True)` to *see* the N+1.
- **Identity map + `expire_on_commit`**: by default a `commit()` expires all loaded
  attributes, so the next access re-queries (and in async, a re-query on an expired
  attribute triggers implicit IO → greenlet error). Set
  `async_sessionmaker(engine, expire_on_commit=False)` for async.
  [docs.sqlalchemy.org/en/20/orm/queryguide/relationships.html, retrieved 2026-07-10]

## Correctness — autoflush, detached instances, session scope
```python
# FOOTGUN: implicit autoflush pushes pending changes mid-read at a surprising moment,
# e.g. a half-built object gets flushed by a SELECT in the same session and hits a
# NOT NULL / constraint error you didn't expect there.
with Session(engine) as session:
    u = User(email=None)                 # not yet valid
    session.add(u)
    session.execute(select(Order))       # autoflush -> flushes u -> IntegrityError here
    # RIGHT: guard the read, or complete the object before any query
    with session.no_autoflush:
        session.execute(select(Order))

# FOOTGUN: DetachedInstanceError -- accessing a lazy attribute AFTER the session closed
with Session(engine) as session:
    u = session.get(User, 1)
# print(u.orders)   # DetachedInstanceError: instance is not bound to a Session
# RIGHT: eager-load inside the session, or keep the session open while you use the object
```
- **Session = one unit of work**, short-lived, NOT shared across threads or asyncio
  tasks. One `AsyncSession` per request/task; never a module-global session reused
  concurrently. Use `async with AsyncSessionLocal() as session:` so it always closes.
  [docs.sqlalchemy.org/en/20/orm/session_basics.html, retrieved 2026-07-10]

## Security — SQL injection via text() (CWE-89)
`text()` runs raw SQL. Interpolating user input into the string is **CWE-89 "Improper
Neutralization of Special Elements used in an SQL Command ('SQL Injection')"**
(cwe.mitre.org/89). The ORM/Core expression API is parameterized by construction — the
danger is only in hand-built SQL.

```python
from sqlalchemy import text

# VULNERABLE (CWE-89): f-string builds the SQL text from user input
email = "x' OR '1'='1"
session.execute(text(f"SELECT * FROM users WHERE email = '{email}'"))   # injection

# SAFE: bound parameter with :name, values passed separately -> driver binds them
session.execute(
    text("SELECT * FROM users WHERE email = :email"),
    {"email": email},
)

# SAFE (idiomatic): the Core/ORM select() is parameterized automatically
session.execute(select(User).where(User.email == email))
```
- Never build SQL by string formatting, even "just for an IN clause" — use
  `.where(User.id.in_(ids))` or an `expanding` bindparam. `text()` binds `:name`
  placeholders; it does NOT bind identifiers, so a dynamic table/column name must be
  validated against an allow-list, never interpolated.
  [docs.sqlalchemy.org/en/20/core/sqlelement.html#sqlalchemy.sql.expression.text +
  cwe.mitre.org/data/definitions/89.html, retrieved 2026-07-10]

## Testing
```python
# FOOTGUN: committing to a shared DB between tests leaks state and makes order matter.
# RIGHT: wrap each test in a transaction rolled back at the end (savepoint pattern).
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

@pytest.fixture
def session():
    engine = create_engine("sqlite://")       # in-memory, isolated
    Base.metadata.create_all(engine)
    conn = engine.connect()
    trans = conn.begin()
    s = Session(bind=conn)
    yield s
    s.close()
    trans.rollback()                          # discard everything the test wrote
    conn.close()

def test_unique_email(session):
    session.add(User(email="a@b.com")); session.flush()
    session.add(User(email="a@b.com"))
    with pytest.raises(IntegrityError):
        session.flush()                        # assert the constraint, not a message
```
- Assert on the SQLAlchemy exception type (`IntegrityError`, `NoResultFound`), never on
  the DB's message string. Roll back per test for isolation without re-creating schema.
  [docs.sqlalchemy.org/en/20/orm/session_transaction.html, retrieved 2026-07-10]

## Performance
- **Eager-load the right way**: `selectinload` for collections, `joinedload` for
  to-one. Combine with `.options()` per query rather than making relations eager
  globally (which over-fetches).
- **Load only what you need**: `select(User.id, User.email)` (column-only) skips full
  entity hydration; `load_only()` / `defer()` control column loading.
- **Bulk ops**: `session.execute(insert(User), [ {...}, ... ])` (executemany) beats a
  Python loop of `session.add`. `pool_pre_ping=True` avoids stale-connection errors
  after a DB restart at the cost of a cheap liveness check.
  [docs.sqlalchemy.org/en/20/orm/queryguide/select.html, retrieved 2026-07-10]

## Version-Specific Gotchas (dated, sourced)
- **SQLAlchemy 2.0.51** is the current release, published to PyPI **2026-06-15**.
  [pypi.org/project/SQLAlchemy/, retrieved 2026-07-10]
- **1.4 → 2.0**: the legacy `Query` API (`session.query(...)`) is deprecated in favor
  of `select()` + `session.execute()`; declarative uses `Mapped[]` +
  `mapped_column()`. 1.4 code that relied on autobegin/implicit commit changes
  behavior. [docs.sqlalchemy.org/en/20/changelog/migration_20.html, retrieved 2026-07-10]
- **Async requires greenlet** (install via the `[asyncio]` extra); lazy loading under
  async raises `MissingGreenlet` — eager-load instead.
  [docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html, retrieved 2026-07-10]
- Injection behavior is stable across 1.4/2.0: bound `:name`/`in_()` parameters are
  safe; string-built `text()` is CWE-89.
  [cwe.mitre.org/data/definitions/89.html, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- SQLAlchemy releases (PyPI): https://pypi.org/project/SQLAlchemy/
- Relationship loading (N+1 / selectinload): https://docs.sqlalchemy.org/en/20/orm/queryguide/relationships.html
- Session basics / scope: https://docs.sqlalchemy.org/en/20/orm/session_basics.html
- Session transactions / testing: https://docs.sqlalchemy.org/en/20/orm/session_transaction.html
- text() construct: https://docs.sqlalchemy.org/en/20/core/sqlelement.html
- 1.4 -> 2.0 migration: https://docs.sqlalchemy.org/en/20/changelog/migration_20.html
- asyncio extension: https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html
- CWE-89 (SQL Injection): https://cwe.mitre.org/data/definitions/89.html
