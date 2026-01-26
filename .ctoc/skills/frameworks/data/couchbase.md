# Couchbase CTO
> Distributed NoSQL with SQL++ (N1QL) and built-in caching.

## Commands
```bash
# Setup | Dev | Test
docker run -d --name couchbase -p 8091:8091 -p 11210:11210 couchbase:enterprise
curl http://localhost:8091/pools
cbq -u Administrator -p password -e "SELECT * FROM system:keyspaces"
```

## Non-Negotiables
1. Document modeling with type prefixes
2. N1QL queries with proper indexes
3. Global Secondary Indexes (GSI) for query patterns
4. Prepared statements for repeated queries
5. Memory quotas sized appropriately
6. XDCR for cross-datacenter replication

## Red Lines
- Full bucket scans without indexes
- Missing GSI on query predicates
- No prepared statements for hot queries
- Ignoring bucket memory quotas
- Large documents exceeding 20MB

## Pattern: Document Model and Queries
```sql
-- Document design with type prefix
-- Key: "user::123"
{
  "type": "user",
  "id": "123",
  "email": "alice@example.com",
  "name": "Alice",
  "createdAt": "2024-01-15T10:00:00Z"
}

-- Key: "order::456"
{
  "type": "order",
  "id": "456",
  "userId": "123",
  "items": [...],
  "total": 299.99,
  "status": "pending"
}

-- Create GSI for common queries
CREATE INDEX idx_users_email ON bucket(email) WHERE type = "user";
CREATE INDEX idx_orders_user ON bucket(userId, createdAt DESC) WHERE type = "order";

-- Prepared statement for user lookup
PREPARE user_by_email AS
SELECT META().id, * FROM bucket
WHERE type = "user" AND email = $email;

-- Execute prepared statement
EXECUTE user_by_email USING {"email": "alice@example.com"};

-- N1QL query with proper index usage
SELECT o.*, u.name AS customerName
FROM bucket o
JOIN bucket u ON KEYS "user::" || o.userId
WHERE o.type = "order"
  AND o.status = "pending"
  AND o.createdAt > "2024-01-01"
ORDER BY o.createdAt DESC
LIMIT 20;
```

## Integrates With
- **SDKs**: Official SDKs for Java, .NET, Node.js, Python, Go
- **Cache**: Built-in memcached protocol support
- **Mobile**: Couchbase Lite for offline-first apps

## Common Errors
| Error | Fix |
|-------|-----|
| `No index available` | Create GSI covering query |
| `Timeout` on query | Optimize query or add index |
| `Bucket memory quota exceeded` | Increase quota or evict data |
| `XDCR replication lag` | Check network and cluster health |

## Prod Ready
- [ ] GSI indexes for all query patterns
- [ ] Prepared statements for hot paths
- [ ] Memory quotas configured
- [ ] XDCR for disaster recovery
- [ ] Monitoring via Admin Console
