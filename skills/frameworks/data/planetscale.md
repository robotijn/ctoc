# PlanetScale CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
# Install CLI
brew install planetscale/tap/pscale
pscale auth login
pscale connect mydb main --port 3306
```

## Claude's Common Mistakes
1. **Using foreign key constraints** - Not supported (Vitess limitation)
2. **Direct production schema changes** - Use deploy requests (safe migrations)
3. **Single connection string** - Use branch-specific connections
4. **Ignoring Query Insights** - Built-in query analyzer
5. **Not using branch workflow** - Branches are like git for databases

## Correct Patterns (2026)
```bash
# Branch-based workflow (like git)
pscale branch create mydb feature-add-users
pscale connect mydb feature-add-users --port 3306

# Apply schema on branch
mysql -h 127.0.0.1 -P 3306 -u root < migration.sql

# Create deploy request (PR for schema)
pscale deploy-request create mydb feature-add-users

# Review and deploy (non-blocking)
pscale deploy-request diff mydb 1
pscale deploy-request deploy mydb 1
```

```sql
-- Schema WITHOUT foreign keys (enforce in application)
CREATE TABLE users (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_created (created_at)
);

CREATE TABLE orders (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    total DECIMAL(10,2),
    INDEX idx_user (user_id)
    -- NO FOREIGN KEY - enforce in application
);
```

## Version Gotchas
- **No foreign keys**: Vitess limitation; use application-level integrity
- **Deploy requests**: Non-blocking schema migrations
- **Boost**: Edge caching for read-heavy workloads
- **Branches**: Each branch has isolated schema and data

## What NOT to Do
- Do NOT use FOREIGN KEY constraints (not supported)
- Do NOT change production schema directly (use deploy requests)
- Do NOT ignore Query Insights alerts
- Do NOT forget branch workflow for schema changes
