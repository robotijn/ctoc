# PlanetScale CTO
> Serverless MySQL platform with branching and non-blocking schema changes.

## Commands
```bash
# Setup | Dev | Test
pscale auth login
pscale branch create mydb feature-branch
pscale connect mydb feature-branch --port 3306
```

## Non-Negotiables
1. Branch-based development workflow
2. Deploy requests for schema changes
3. Per-branch connection strings
4. Query Insights for optimization
5. PlanetScale Boost for edge caching
6. No foreign key constraints (Vitess limitation)

## Red Lines
- Direct schema changes in production
- Using foreign key constraints (not supported)
- Missing deploy requests for migrations
- Ignoring Query Insights alerts
- No safe migrations workflow

## Pattern: Branch-Based Workflow
```bash
# Create feature branch from main
pscale branch create mydb add-user-preferences

# Connect to feature branch
pscale connect mydb add-user-preferences --port 3306

# Apply schema changes on branch
mysql -h 127.0.0.1 -P 3306 -u root < migration.sql

# Create deploy request (PR for schema)
pscale deploy-request create mydb add-user-preferences

# Review schema diff
pscale deploy-request diff mydb 1

# Deploy to production (non-blocking)
pscale deploy-request deploy mydb 1
```

```sql
-- Schema without foreign keys (use application-level integrity)
CREATE TABLE users (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_created (created_at)
);

CREATE TABLE preferences (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    theme VARCHAR(50) DEFAULT 'light',
    INDEX idx_user (user_id)
    -- No FOREIGN KEY, enforce in application
);

-- Safe migration: add column with default
ALTER TABLE users ADD COLUMN status VARCHAR(20) DEFAULT 'active';

-- Safe migration: add index (non-blocking in PlanetScale)
CREATE INDEX idx_status ON users(status);
```

## Integrates With
- **ORM**: Prisma, Drizzle, Sequelize (disable FK)
- **Frameworks**: Next.js, Rails, Laravel
- **Edge**: PlanetScale Boost for global caching

## Common Errors
| Error | Fix |
|-------|-----|
| `foreign key constraint` | Remove FK, use application joins |
| `deploy request conflict` | Resolve schema differences |
| `branch not found` | Check branch name with `pscale branch list` |
| `connection timeout` | Use regional connection strings |

## Prod Ready
- [ ] Branch workflow established
- [ ] Deploy requests for all changes
- [ ] Query Insights monitored
- [ ] Application-level referential integrity
- [ ] Boost configured for read-heavy workloads
