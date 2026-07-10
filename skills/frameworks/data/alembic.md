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

## Migration Footguns — autogenerate misses, batch mode, revision chain
`alembic revision --autogenerate` diffs your models against the DB, but it does NOT
detect everything. **Review every generated revision** — the misses below silently
ship as no-ops.

```python
# What autogenerate MISSES (must be hand-written):
#   - server_default changes (it detects add/remove of a column, not a default change)
#   - column TYPE changes in many cases (esp. VARCHAR length, ENUM value edits)
#   - CHECK constraints, some index renames, triggers, views, sequences
#   - anything on a table not in target_metadata (autogenerate only sees mapped tables)

def upgrade():
    # SQLite cannot ALTER most columns -> Alembic "batch mode" recreates the table.
    # REQUIRED for SQLite ALTER TABLE (drop column, alter type, add FK, etc.)
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(sa.Column("verified_at", sa.DateTime(), nullable=True))
        batch_op.alter_column("email", existing_type=sa.String(120), nullable=False)

def downgrade():
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("verified_at")
```
- **`down_revision` is the migration chain.** A wrong or duplicated `down_revision`
  splits history into branches; `alembic heads` shows multiple heads, and `upgrade head`
  errors until you `alembic merge` them into one. Never hand-edit a revision id after it
  has run somewhere.
- **Batch mode for SQLite** (`op.batch_alter_table`) is mandatory because SQLite's
  `ALTER TABLE` supports only add-column/rename — batch mode does copy-to-temp,
  swap-table under the hood. On Postgres/MySQL you usually don't need it.
  [alembic.sqlalchemy.org/en/latest/autogenerate.html +
  alembic.sqlalchemy.org/en/latest/batch.html, retrieved 2026-07-10]

## Safety — transactional DDL, data migrations, offline vs online
```python
# FOOTGUN: mixing SCHEMA changes and a big DATA backfill in one revision. If the data
# step fails halfway, some DBs (MySQL) can't roll back the DDL -> half-applied migration.
# RIGHT: schema change and data migration are SEPARATE revisions.

# revision N: schema only (add nullable column)
def upgrade():
    op.add_column("users", sa.Column("full_name", sa.String(), nullable=True))

# revision N+1: data migration only (backfill), reversible where possible
def upgrade():
    users = sa.table("users", sa.column("id"), sa.column("full_name"),
                     sa.column("first"), sa.column("last"))
    op.execute(users.update().values(full_name=users.c.first + " " + users.c.last))
```
- **Postgres has transactional DDL** (a failed migration rolls back cleanly);
  **MySQL does not** — a failed multi-statement migration can leave the schema
  half-changed. Keep MySQL migrations small and each independently re-runnable.
- **Non-transactional statements**: Postgres `CREATE INDEX CONCURRENTLY` cannot run
  inside a transaction block. Set the migration's `transactional_ddl`/run it with
  autocommit, or Alembic will wrap it and Postgres will reject it.
- **Offline mode** (`alembic upgrade head --sql`) emits SQL to a file for a DBA to run;
  it CANNOT execute Python data-migration logic that reads from the DB (there's no
  connection) — keep data steps online.
  [alembic.sqlalchemy.org/en/latest/cookbook.html, retrieved 2026-07-10]

## Security — no untrusted input in migration SQL (CWE-89)
Migrations run with elevated DB privileges. Building migration SQL from any external/
untrusted value is **CWE-89** (cwe.mitre.org/89) — and far worse here because the
migration role can DROP tables.

```python
# VULNERABLE (CWE-89): interpolating an env/config value straight into DDL/DML
tenant = os.environ["TENANT"]                       # attacker-controlled at deploy time
op.execute(f"DELETE FROM audit WHERE tenant = '{tenant}'")   # injection in a migration!

# SAFE: bind parameters via a SQLAlchemy construct, never f-string the SQL
audit = sa.table("audit", sa.column("tenant"))
op.execute(audit.delete().where(audit.c.tenant == sa.bindparam("t")), {"t": tenant})
```
- Migrations should operate on **static, reviewed** SQL. If a data migration must use a
  runtime value, bind it as a parameter through a SQLAlchemy expression — do not build
  the statement string by formatting.
  [alembic.sqlalchemy.org/en/latest/ops.html + cwe.mitre.org/data/definitions/89.html,
  retrieved 2026-07-10]

## Testing
```python
# FOOTGUN: only ever testing `upgrade` -> a broken `downgrade` is discovered in prod
# during a rollback, the worst possible moment.
# RIGHT: round-trip every revision in CI (upgrade to head, then downgrade to base).
from alembic.config import Config
from alembic import command

def test_migrations_round_trip(tmp_path):
    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", f"sqlite:///{tmp_path/'t.db'}")
    command.upgrade(cfg, "head")     # applies every revision
    command.downgrade(cfg, "base")   # exercises every downgrade
    command.upgrade(cfg, "head")     # and back up -- proves reversibility

def test_no_pending_autogenerate():
    # models and migrations agree: autogenerate against head should be EMPTY
    ...  # compare_metadata(context, target_metadata) returns [] -> no drift
```
- Round-trip (up→down→up) in CI so a broken downgrade fails the build, not the rollback.
  Assert `alembic heads` returns exactly one head (no accidental branch).
  [alembic.sqlalchemy.org/en/latest/api/commands.html, retrieved 2026-07-10]

## Performance
- **`CREATE INDEX CONCURRENTLY`** (Postgres) builds an index without a long write lock;
  a plain `CREATE INDEX` on a large hot table blocks writes for the whole build.
- **Split risky migrations**: add nullable column → backfill in batches → add
  `NOT NULL` / constraint. A single `ALTER TABLE ... SET NOT NULL` scans + locks the
  whole table.
- **Batch backfills**: `op.execute` of one giant `UPDATE` locks many rows and bloats
  WAL; loop in bounded id ranges for very large tables.
  [alembic.sqlalchemy.org/en/latest/cookbook.html, retrieved 2026-07-10]

## Version-Specific Gotchas (dated, sourced)
- **Alembic 1.18.5** is the current release, published to PyPI **2026-06-25**.
  [pypi.org/project/alembic/, retrieved 2026-07-10]
- **SQLAlchemy 2.0 + async**: use `async_engine_from_config` / `run_sync` in `env.py`
  to drive migrations over an async engine.
  [alembic.sqlalchemy.org/en/latest/cookbook.html#using-asyncio-with-alembic,
  retrieved 2026-07-10]
- **Autogenerate limitations** (server defaults, some type changes, CHECK constraints,
  unmapped tables) are documented, stable behavior — always review, never trust blind.
  [alembic.sqlalchemy.org/en/latest/autogenerate.html, retrieved 2026-07-10]
- Injection in migration SQL is CWE-89 regardless of version — bind parameters, never
  interpolate. [cwe.mitre.org/data/definitions/89.html, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- Alembic releases (PyPI): https://pypi.org/project/alembic/
- Autogenerate (and its limitations): https://alembic.sqlalchemy.org/en/latest/autogenerate.html
- Batch mode (SQLite ALTER): https://alembic.sqlalchemy.org/en/latest/batch.html
- Operations reference (op.execute / bindparam): https://alembic.sqlalchemy.org/en/latest/ops.html
- Cookbook (async, data migrations, offline): https://alembic.sqlalchemy.org/en/latest/cookbook.html
- Commands API (testing): https://alembic.sqlalchemy.org/en/latest/api/commands.html
- CWE-89 (SQL Injection): https://cwe.mitre.org/data/definitions/89.html
