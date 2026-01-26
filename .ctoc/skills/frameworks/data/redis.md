# Redis CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
# Server
docker run -d --name redis -p 6379:6379 redis:7.4-alpine

# Clients
pip install redis          # Python
npm install redis          # Node.js (use redis, not ioredis for official)
```

## Claude's Common Mistakes
1. **Creating new connections per request** - Use connection pooling always
2. **Using KEYS in production** - Use SCAN for iteration (KEYS blocks)
3. **Missing TTL on cache keys** - Causes memory bloat
4. **Ignoring hash field expiration** - v7.4 supports per-field TTL
5. **Large values (>100KB)** - Split into smaller keys or use streams

## Correct Patterns (2026)
```python
import redis

# Connection pool (singleton pattern)
pool = redis.ConnectionPool(
    host='localhost', port=6379,
    max_connections=20,
    decode_responses=True,
    health_check_interval=30  # Auto-reconnect on stale connections
)
r = redis.Redis(connection_pool=pool)

# Key naming: namespace:type:id
USER_KEY = "app:user:{user_id}"

# Hash with field-level TTL (Redis 7.4+)
r.hset(f"app:session:{sid}", mapping={"user": "alice", "role": "admin"})
r.hexpire(f"app:session:{sid}", 3600, "user", "role")  # Per-field expiry

# Pipeline for bulk operations (reduces round trips)
with r.pipeline() as pipe:
    for uid in user_ids:
        pipe.hgetall(USER_KEY.format(user_id=uid))
    results = pipe.execute()

# SCAN instead of KEYS (non-blocking)
for key in r.scan_iter(match="app:user:*", count=100):
    process(key)
```

## Version Gotchas
- **v7.4**: Hash field expiration (HEXPIRE), BFLOAT16/FLOAT16 for AI vectors
- **v7.4**: XREAD with `+` to start from last message
- **Valkey**: Redis fork; GLIDE client auto-multiplexes connections
- **Cluster**: Use hash tags `{user}:123` to colocate related keys

## What NOT to Do
- Do NOT use `KEYS *` in production (blocks server)
- Do NOT create connection per request (use pool)
- Do NOT store values >100KB per key
- Do NOT skip TTL on cached data (memory leak)
