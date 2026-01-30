# Memcached CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
docker run -d --name memcached -p 11211:11211 memcached:alpine -m 512
# Python client
pip install pymemcache
```

## Claude's Common Mistakes
1. **Single instance in production** - Use multiple nodes with consistent hashing
2. **No cache stampede protection** - Multiple clients refreshing same key
3. **Missing TTL on items** - Causes memory pressure and eviction issues
4. **Large values (>1MB)** - Exceeds default slab size
5. **Long keys (>250 bytes)** - Hash long keys to fixed length

## Correct Patterns (2026)
```python
from pymemcache.client.hash import HashClient
from pymemcache import serde
import hashlib, time

# Consistent hashing cluster (not single node)
client = HashClient(
    servers=[('mc1', 11211), ('mc2', 11211), ('mc3', 11211)],
    serializer=serde.pickle_serde.serialize,
    deserializer=serde.pickle_serde.deserialize,
    connect_timeout=1,
    timeout=0.5,
)

def make_key(namespace: str, *args) -> str:
    """Generate safe cache key under 250 bytes."""
    raw = f"{namespace}:" + ":".join(str(a) for a in args)
    if len(raw) > 200:
        return f"{namespace}:{hashlib.sha256(raw.encode()).hexdigest()[:32]}"
    return raw

# Cache-aside with stampede protection
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
            client.set(key, user, expire=3600)  # Always set TTL
        finally:
            client.delete(lock_key)
        return user

    time.sleep(0.1)  # Wait for other process
    return client.get(key) or db.fetch_user(user_id)
```

## Version Gotchas
- **vs Redis**: Memcached is simpler; Redis has more data structures
- **Consistent hashing**: Required for multi-node; client-side
- **Slab allocator**: Values chunked into slab classes
- **No persistence**: Pure cache; data lost on restart

## What NOT to Do
- Do NOT use single instance in production (no HA)
- Do NOT skip stampede protection (thundering herd)
- Do NOT store items without TTL (memory pressure)
- Do NOT use keys >250 bytes (hash them)
