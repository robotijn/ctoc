# SQLAlchemy CTO
> Python database access.

## Non-Negotiables (2.0 Style)
1. select() over query()
2. Session context managers
3. Alembic for migrations
4. mapped_column() with types

## Red Lines
- N+1 queries (use joinedload)
- Connection leaks
- Raw SQL without params
