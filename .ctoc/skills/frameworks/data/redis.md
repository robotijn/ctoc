# Redis CTO
> In-memory data structure store for caching, messaging, and real-time data.

## Commands
```bash
# Setup | Dev | Test
docker run -d --name redis -p 6379:6379 redis:7-alpine
redis-cli PING
redis-cli --eval tests/script.lua
```

## Non-Negotiables
1. Data structure selection matches access pattern
2. Consistent key naming convention (namespace:type:id)
3. TTL on all cached data
4. Pipeline or MULTI for bulk operations
5. Lua scripts for atomic multi-key operations
6. Memory limits with eviction policy

## Red Lines
- `KEYS *` in production (use SCAN)
- Missing TTL causing memory bloat
- Large values >100KB per key
- No persistence for critical data
- Blocking operations without timeouts

## Pattern: Production Redis Patterns
```python
import redis

r = redis.Redis(host='localhost', decode_responses=True)

# Key naming convention: namespace:type:id
USER_KEY = "app:user:{user_id}"
SESSION_KEY = "app:session:{session_id}"

# Hash for objects
r.hset(USER_KEY.format(user_id=123), mapping={
    "name": "Alice",
    "email": "alice@example.com",
    "plan": "premium"
})
r.expire(USER_KEY.format(user_id=123), 3600)

# Sorted set for leaderboard
r.zadd("app:leaderboard:daily", {"user:123": 1500, "user:456": 2200})
top_10 = r.zrevrange("app:leaderboard:daily", 0, 9, withscores=True)

# Pipeline for bulk operations
with r.pipeline() as pipe:
    for user_id in user_ids:
        pipe.hgetall(USER_KEY.format(user_id=user_id))
    results = pipe.execute()

# Lua script for atomic operations
RATE_LIMIT_SCRIPT = """
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local current = redis.call('INCR', key)
if current == 1 then redis.call('EXPIRE', key, window) end
return current <= limit and 1 or 0
"""
rate_limit = r.register_script(RATE_LIMIT_SCRIPT)
```

## Integrates With
- **Caching**: Application cache, session store
- **Messaging**: Pub/Sub, Streams for queues
- **Search**: RediSearch for full-text

## Common Errors
| Error | Fix |
|-------|-----|
| `OOM command not allowed` | Configure maxmemory and eviction policy |
| `CROSSSLOT` in cluster | Use hash tags `{user}:123` |
| `Connection pool exhausted` | Increase pool size or fix leaks |
| `SLOWLOG` entries | Optimize commands, add indexes |

## Prod Ready
- [ ] Memory limits with eviction policy
- [ ] Persistence configured (RDB/AOF)
- [ ] Sentinel or Cluster for HA
- [ ] Key TTLs on all cached data
- [ ] SLOWLOG monitoring enabled
