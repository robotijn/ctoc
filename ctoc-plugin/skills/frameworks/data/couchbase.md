# Couchbase CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
docker run -d --name couchbase -p 8091-8096:8091-8096 -p 11210:11210 couchbase:enterprise-7.2
# Web console at http://localhost:8091
# Python SDK
pip install couchbase
```

## Claude's Common Mistakes
1. **Missing GSI indexes** - Full bucket scans without indexes
2. **No prepared statements** - Prevents query plan caching
3. **Document design without type** - Use type field for filtering
4. **Large documents (>20MB)** - Exceeds practical limits
5. **Ignoring N1QL explain** - Check index usage before production

## Correct Patterns (2026)
```sql
-- Document key design: type::id
-- Key: "user::123"
{
  "type": "user",
  "email": "alice@example.com",
  "name": "Alice"
}

-- Create GSI for queries (REQUIRED)
CREATE INDEX idx_users_email ON bucket(email) WHERE type = "user";
CREATE INDEX idx_orders_user ON bucket(userId, createdAt DESC) WHERE type = "order";

-- Prepared statement for hot queries
PREPARE user_by_email AS
SELECT META().id, * FROM bucket
WHERE type = "user" AND email = $email;

EXECUTE user_by_email USING {"email": "alice@example.com"};

-- N1QL with proper index usage
SELECT o.*, u.name AS customerName
FROM bucket o
JOIN bucket u ON KEYS "user::" || o.userId
WHERE o.type = "order" AND o.status = "pending"
ORDER BY o.createdAt DESC
LIMIT 20;
```

## Version Gotchas
- **v7.2+**: Vector search support, improved SQL++ (N1QL)
- **Capella**: Managed cloud service with auto-scaling
- **Eventing**: Server-side functions for triggers
- **Mobile**: Couchbase Lite for offline-first apps

## What NOT to Do
- Do NOT query without GSI indexes (full bucket scan)
- Do NOT skip prepared statements for repeated queries
- Do NOT store documents >20MB
- Do NOT ignore EXPLAIN output for queries
