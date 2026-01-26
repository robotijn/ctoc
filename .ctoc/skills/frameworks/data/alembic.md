# Alembic CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
pip install alembic sqlalchemy
alembic init alembic
# Configure alembic.ini and env.py with your database URL
```

## Claude's Common Mistakes
1. **Trusting autogenerate blindly** - Always review generated migrations
2. **Missing downgrade** - Every migration needs working rollback
3. **ALTER TABLE locks** - Use CONCURRENTLY for indexes on large tables
4. **One big migration** - Split into atomic, focused changes
5. **Skipping production-like testing** - Test with real data volumes

## Correct Patterns (2026)
```python
# alembic/versions/001_add_user_email_index.py
"""Add index on user email for login performance."""
from alembic import op
import sqlalchemy as sa

revision = '001'
down_revision = None

def upgrade():
    # CONCURRENTLY avoids table lock (PostgreSQL)
    op.execute(
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS "
        "ix_users_email ON users (email)"
    )

    # Add nullable first, backfill, then add constraint
    op.add_column('users', sa.Column('verified_at', sa.DateTime, nullable=True))

def downgrade():
    op.drop_index('ix_users_email', 'users')
    op.drop_column('users', 'verified_at')

# For async SQLAlchemy 2.0 in env.py:
from sqlalchemy.ext.asyncio import async_engine_from_config

async def run_async_migrations():
    connectable = async_engine_from_config(config.get_section("alembic"))
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
```

## Version Gotchas
- **SQLAlchemy 2.0**: Use async_engine_from_config for async support
- **Autogenerate**: Misses index name changes, CHECK constraints, triggers
- **PostgreSQL**: Use CONCURRENTLY for production index creation
- **Batch mode**: Required for SQLite ALTER TABLE operations

## What NOT to Do
- Do NOT trust autogenerate without review
- Do NOT skip downgrade implementation
- Do NOT create indexes without CONCURRENTLY on large tables
- Do NOT run untested migrations in production
