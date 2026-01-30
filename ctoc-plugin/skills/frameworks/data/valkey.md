# Valkey CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
docker run -d --name valkey -p 6379:6379 valkey/valkey:8-alpine
# Python client
pip install valkey  # or use redis-py (compatible)
```

## Claude's Common Mistakes
1. **Treating differently from Redis** - Valkey is Redis-compatible; same patterns
2. **KEYS * in production** - Use SCAN (same as Redis)
3. **Single instance for critical data** - Use cluster mode
4. **No persistence configured** - Enable AOF for durability
5. **Missing memory limits** - Configure maxmemory and eviction policy

## Correct Patterns (2026)
```python
from valkey import Valkey
from valkey.cluster import ValkeyCluster

# Cluster client (production)
cluster = ValkeyCluster(
    host='valkey-cluster',
    port=6379,
    decode_responses=True,
)

# Use hash tags for multi-key operations (same slot)
user_id = 123
cluster.hset(f"{{user:{user_id}}}:profile", mapping={"name": "Alice"})
cluster.sadd(f"{{user:{user_id}}}:roles", "admin", "editor")
cluster.expire(f"{{user:{user_id}}}:profile", 3600)

# Pipeline within hash slot
with cluster.pipeline() as pipe:
    pipe.hgetall(f"{{user:{user_id}}}:profile")
    pipe.smembers(f"{{user:{user_id}}}:roles")
    profile, roles = pipe.execute()

# SCAN instead of KEYS (non-blocking)
for key in cluster.scan_iter(match="user:*", count=100):
    process(key)
```

## Version Gotchas
- **v8**: Based on Redis 7.2; fully compatible
- **Redis clients work**: redis-py, ioredis work unchanged
- **Fork reason**: Open-source governance after Redis license change
- **GLIDE client**: Valkey's new auto-multiplexing client

## What NOT to Do
- Do NOT use KEYS * (use SCAN)
- Do NOT skip cluster mode for production (no HA)
- Do NOT forget maxmemory and eviction policy
- Do NOT use without persistence for durable data
