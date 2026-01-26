# Memcached CTO
> High-performance distributed memory caching system.

## Commands
```bash
# Setup | Dev | Test
docker run -d --name memcached -p 11211:11211 memcached:alpine
echo "stats" | nc localhost 11211
python -c "import pymemcache; print(pymemcache.__version__)"
```

## Non-Negotiables
1. Consistent hashing for cluster distribution
2. Key size under 250 bytes
3. Value size under 1MB (default)
4. TTL on all cached items
5. Connection pooling in clients
6. Cache invalidation strategy defined

## Red Lines
- Large values exceeding slab size
- Missing expiration causing memory pressure
- No consistent hashing in multi-node setup
- Single instance for production
- Cache stampede without protection

## Pattern: Production Caching Layer
```python
from pymemcache.client.hash import HashClient
from pymemcache import serde
import hashlib

# Consistent hashing client for cluster
client = HashClient(
    servers=[
        ('memcached1', 11211),
        ('memcached2', 11211),
        ('memcached3', 11211),
    ],
    serializer=serde.pickle_serde.serialize,
    deserializer=serde.pickle_serde.deserialize,
    connect_timeout=1,
    timeout=0.5,
    retry_attempts=2,
    retry_timeout=0.1,
)

def make_key(namespace: str, *args) -> str:
    """Generate safe cache key under 250 bytes."""
    raw = f"{namespace}:" + ":".join(str(a) for a in args)
    if len(raw) > 200:
        return f"{namespace}:{hashlib.sha256(raw.encode()).hexdigest()[:32]}"
    return raw

# Cache-aside pattern with stampede protection
def get_user(user_id: int) -> dict:
    key = make_key("user", user_id)
    user = client.get(key)
    if user is not None:
        return user

    # Lock to prevent stampede
    lock_key = f"{key}:lock"
    if client.add(lock_key, "1", expire=10):
        try:
            user = db.fetch_user(user_id)
            client.set(key, user, expire=3600)
        finally:
            client.delete(lock_key)
        return user

    # Wait and retry if another process is loading
    time.sleep(0.1)
    return client.get(key) or db.fetch_user(user_id)
```

## Integrates With
- **Languages**: Native clients for Python, Java, PHP, Node.js
- **Frameworks**: Django, Rails, Laravel cache backends
- **Load Balancers**: HAProxy for connection pooling

## Common Errors
| Error | Fix |
|-------|-----|
| `SERVER_ERROR out of memory` | Increase memory or reduce TTL |
| `Key too long` | Hash long keys to fixed length |
| `Connection timeout` | Check network, increase timeout |
| `Item too large` | Compress value or use chunking |

## Prod Ready
- [ ] Multiple nodes with consistent hashing
- [ ] Connection pooling configured
- [ ] TTL on all cached items
- [ ] Stampede protection implemented
- [ ] Monitoring for hit rate and evictions
