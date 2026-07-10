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

## Slab Allocator, Item-Size Limit & LRU (the memory model)
Memcached carves RAM into **slab classes** (fixed size-buckets, growth factor ~1.25).
Two consequences bite Claude constantly:

```python
from pymemcache.client.base import Client
mc = Client(("localhost", 11211))

# FOOTGUN: default max item size is 1 MB (1048576 bytes). A 1.5 MB value is REJECTED.
big = "x" * (2 * 1024 * 1024)
mc.set("blob", big)                # stored=False — silently NOT cached unless you check
# RIGHT: raise the limit at startup, or don't put >1MB objects in memcached
#   memcached -I 4m -m 2048        # -I raises max item size; -m sets total cache MB

# FOOTGUN: slab calcification — a value that jumps size class lands in a slab with no
# free chunks even though other slabs have room; you see evictions with RAM "free".
#   RIGHT: memcached -o slab_reassign,slab_automove=1   # let it rebalance slab pages
```
- **LRU eviction per slab class, and there is NO persistence.** When a slab class fills,
  the **least-recently-used item is evicted** even if it hasn't expired — and a restart
  loses *everything*. Treat memcached as a pure volatile cache: the database is the
  source of truth, always.
- **No built-in clustering** — sharding is **client-side consistent hashing**
  (`HashClient`); adding/removing a node remaps only ~1/N keys with a proper ring.
- **Connection limits:** default `-c 1024`; a connection-per-request pattern exhausts it.
  Pool and reuse. [memcached.org wiki (ServerMaint/Slabs/LRU), retrieved 2026-07-10]

## Correctness — no atomic multi-key; use `cas` for compare-and-swap
```python
# FOOTGUN: read-modify-write is a race — two clients read the same value and both write.
val, cas_token = mc.gets("counter")          # gets() returns the CAS version token
new = int(val) + 1
if not mc.cas("counter", str(new), cas_token):   # cas() writes ONLY if unchanged since gets()
    retry()                                       # someone else won — re-read and retry
# RIGHT for pure counters: incr/decr are atomic server-side
mc.incr("hits", 1)                            # atomic; no read-modify-write race
```
- **There are no cross-key transactions.** `cas` (compare-and-swap via the version token
  from `gets`) is the *only* concurrency primitive; `add` (set-if-absent) and
  `incr`/`decr` (atomic numeric) cover the common cases. Never assume two `set`s are
  atomic together. [memcached.org protocol.txt (cas/gets/incr), retrieved 2026-07-10]

## Security — disable UDP; never expose unauthenticated to the internet
- **UDP amplification.** Memcached's UDP listener was abused for massive reflection DDoS
  (2018, up to ~1.7 Tbps) — a spoofed small request yields a huge response.
  **CVE-2018-1000115** classifies this as **CWE-406 (Insufficient Control of Network
  Message Volume / Network Amplification)**. Since **1.5.6 UDP is disabled by default**;
  keep it off unless you truly need it: `memcached -U 0`.
- Memcached has **no authentication by default** (optional SASL only). An
  internet-exposed instance is **CWE-306 (Missing Authentication for Critical
  Function)** — anyone can read/overwrite the whole cache. Bind to localhost / a private
  network; front it with the app, never the public internet.

```bash
# hardened startup
memcached -l 127.0.0.1 -U 0 -m 1024 -c 4096 -I 4m
#          bind private   ^ disable UDP amplification
#   -S enables SASL auth if you must expose it on a shared network
```
[memcached.org (release notes / security), CVE-2018-1000115 (nvd.nist.gov), retrieved 2026-07-10]

## Performance
- **Right-size `-m`** (total RAM) and the **growth factor `-f`** to your value-size
  distribution so slab classes match real object sizes (less waste, fewer evictions).
- **Multiget** (`get_many`) collapses N round-trips into one; use it for batch reads.
- Enable **`slab_automove`** so hot/cold size shifts don't calcify slabs.
  [memcached.org wiki (Performance/Slabs), retrieved 2026-07-10]

## Testing
```python
from pymemcache.client.base import Client
def test_cas_blocks_lost_update(mc: Client):
    mc.set("k", "1")
    _, tok = mc.gets("k")
    mc.set("k", "2")                       # a concurrent writer bumps the version
    assert mc.cas("k", "3", tok) is False  # stale token -> write refused (no lost update)
```
- Assert item-size rejection, LRU eviction, and `cas` semantics against a real
  `memcached` container; unit-test key-hashing/ring logic in-process. Do not mock the
  client and assert on the mock.

## Version-Specific Gotchas (dated, sourced)
- **Memcached 1.6.45** is the current stable release (tagged **2026-07-10**); the 1.6.x
  line is the maintained series. [github.com/memcached/memcached/releases, retrieved 2026-07-10]
- **UDP off by default since 1.5.6** — do not re-enable it without a reflection-DDoS
  mitigation. [memcached.org release notes, retrieved 2026-07-10]
- **Default max item size = 1 MB** (`-I` to raise) and **default `-c 1024`
  connections** — both are common silent-failure limits; set them explicitly for your
  workload. [memcached.org wiki (ConfiguringServer), retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- Memcached releases: https://github.com/memcached/memcached/releases
- Memcached wiki (slabs, LRU, config): https://github.com/memcached/memcached/wiki
- Protocol (cas/gets/incr): https://github.com/memcached/memcached/blob/master/doc/protocol.txt
- CVE-2018-1000115 (UDP amplification): https://nvd.nist.gov/vuln/detail/CVE-2018-1000115
- CWE-406 (Network Amplification): https://cwe.mitre.org/data/definitions/406.html
- CWE-306 (Missing Authentication): https://cwe.mitre.org/data/definitions/306.html
