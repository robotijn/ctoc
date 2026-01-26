# Alembic CTO
> Database migration management for SQLAlchemy applications.

## Commands
```bash
# Setup | Dev | Test
pip install alembic sqlalchemy
alembic init alembic && alembic revision --autogenerate -m "Initial"
alembic upgrade head && alembic downgrade -1
```

## Non-Negotiables
1. Autogenerate as starting point, always review manually
2. Every migration must have working downgrade
3. Test migrations against production-like data
4. Batch operations for large table alterations
5. Transaction-safe migrations (no partial applies)
6. Version control all migration files

## Red Lines
- Untested migrations going to production
- Migrations causing data loss without explicit handling
- Missing indexes on foreign keys
- Long-running locks on production tables
- Skipping migration review before commit

## Pattern: Safe Production Migration
```python
# alembic/versions/001_add_user_email_index.py
"""Add index on user email for login performance."""
from alembic import op
import sqlalchemy as sa

revision = '001'
down_revision = None

def upgrade():
    # Create index concurrently to avoid table locks
    op.execute(
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS "
        "ix_users_email ON users (email)"
    )

    # Add nullable column first, backfill, then make NOT NULL
    op.add_column('users', sa.Column('verified_at', sa.DateTime))

    # Batch large updates to avoid long transactions
    op.execute("""
        UPDATE users SET verified_at = created_at
        WHERE verified_at IS NULL
        LIMIT 10000
    """)

def downgrade():
    op.drop_index('ix_users_email', 'users')
    op.drop_column('users', 'verified_at')
```

## Integrates With
- **ORM**: SQLAlchemy 2.0 with async support
- **Databases**: PostgreSQL, MySQL, SQLite
- **CI/CD**: Migration verification in pipelines

## Common Errors
| Error | Fix |
|-------|-----|
| `Target database is not up to date` | Run `alembic upgrade head` first |
| `Can't locate revision` | Check `down_revision` chain integrity |
| `Table already exists` | Use `IF NOT EXISTS` in operations |
| `Lock timeout during ALTER` | Use concurrent index creation or batch ops |

## Prod Ready
- [ ] All migrations tested with rollback
- [ ] Concurrent operations for large tables
- [ ] Data backup before destructive changes
- [ ] CI/CD migration verification
- [ ] Monitoring for long-running migrations
