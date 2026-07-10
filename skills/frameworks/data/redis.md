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

## Blocking & Memory Footguns (the single-thread trap)
Redis executes commands on **one main thread**. Any `O(N)` command over a big
collection stalls *every other client* for the duration — that is the root cause
behind the majority of "Redis got slow" incidents Claude writes.

```python
import redis, random
r = redis.Redis(decode_responses=True)

# FOOTGUN: KEYS / FLUSHALL / big-collection scans block the whole server O(N)
r.keys("app:user:*")          # O(N) over the ENTIRE keyspace — freezes all clients
smembers = r.smembers("huge") # O(N); SORT / LRANGE 0 -1 / HGETALL on big keys too

# RIGHT: SCAN family iterates in small cursor-bounded chunks (non-blocking)
for key in r.scan_iter(match="app:user:*", count=200):   # HSCAN/SSCAN/ZSCAN mirror this
    process(key)

# FOOTGUN: one giant key ("big key") — a 50MB hash blocks on read AND on eviction/expire
# RIGHT: shard by suffix so each op touches a bounded slice
r.hset(f"bucket:{random.randint(0, 63)}", field, value)

# Cache stampede: N clients miss the SAME hot key at once and all hammer the DB.
# RIGHT: single-flight lock + jittered TTL so keys don't co-expire.
def get_or_lock(key, ttl):
    val = r.get(key)
    if val is not None:
        return val
    if r.set(f"{key}:lock", "1", nx=True, ex=10):        # only one rebuilder wins
        val = rebuild_from_db(key)
        r.set(key, val, ex=ttl + random.randint(0, ttl // 4))  # jitter avoids herd re-expiry
        r.delete(f"{key}:lock")
    return val
```
- **`maxmemory-policy` is the eviction control.** The default **`noeviction`** makes
  writes **fail with OOM errors** once `maxmemory` is hit — a cache that returns errors
  instead of evicting. For a pure cache set `allkeys-lru`/`allkeys-lfu`; use
  `volatile-*` only when some keys must never be evicted. Always set `maxmemory`.
- **Pipelining** batches round-trips (not atomicity — use `MULTI`/`EXEC` or a Lua
  script for that). Do not confuse a pipeline with a transaction.
- **Cluster:** multi-key ops require all keys in one hash slot — use hash tags
  `{user:123}:profile` to colocate; cross-slot multi-key commands error.
  [redis.io/docs latency + eviction + cluster-spec, retrieved 2026-07-10; see References]

## Persistence & Correctness (RDB vs AOF)
```bash
# RDB: point-in-time fork+snapshot — compact, fast restart, but you LOSE writes
# since the last snapshot on a crash.
save 900 1                    # snapshot if >=1 key changed in 900s (coarse)

# AOF: append every write to a log — durable, larger, slower restart (replay).
appendonly yes
appendfsync everysec          # fsync ~1x/sec: at most ~1s of writes lost on crash
# appendfsync always          # zero loss, big throughput cost; 'no' = OS-buffered (risky)
```
- **RDB alone can lose minutes of data**; AOF `everysec` bounds loss to ~1s. Production
  durability usually runs **both** (AOF for recovery, RDB for fast full reloads).
- Redis transactions (`MULTI`/`EXEC`) are **not rollback-on-error** — a command that
  fails at *runtime* still lets the others in the block run. Use `WATCH` for optimistic
  concurrency; don't assume SQL-style atomic rollback.
  [redis.io/docs persistence + transactions, retrieved 2026-07-10; see References]

## Security — unauthenticated exposure is remote code execution
- **Never bind Redis to a public interface.** Historically Redis shipped with **no
  auth** and, when exposed, the `CONFIG SET dir`/`SET`/`SAVE` trick let attackers write
  an SSH key or a cron job → full RCE. This is **CWE-306 (Missing Authentication for
  Critical Function)** combined with **CWE-1188 (insecure default)**. Modern Redis
  ships **`protected-mode yes`**, which refuses non-loopback connections until a
  password/bind is configured — do not disable it.
- **CVE-2024-31449** — an *authenticated* user could run a crafted **Lua** script to
  trigger a stack buffer overflow (`bit` library) → potential **RCE**
  (**CWE-94**-class, CVSS 7.0); fixed in **6.2.16 / 7.2.6 / 7.4.1**. Lesson: the Lua
  scripting sandbox is a real attack surface — patch promptly and restrict `EVAL`/
  `FUNCTION` via ACL.

```conf
# redis.conf — least-privilege hardening
protected-mode yes
bind 127.0.0.1 -::1                 # never 0.0.0.0 on an untrusted network
requirepass <long-random-secret>    # or, better, ACLs:
# user appuser on >pw ~app:* +@read +@write -@dangerous -flushall -config
```
- Use **ACLs** (Redis 6+) to scope users to key patterns and command categories;
  disable/rename `FLUSHALL`, `CONFIG`, `DEBUG`, `EVAL` for app users. Terminate TLS.
  [redis.io ACL + security + CVE-2024-31449 advisory (nvd.nist.gov), retrieved 2026-07-10]

## Performance
- **Pipeline** to collapse RTT on bulk ops; **`SCAN COUNT`** to tune chunk size; keep
  values small and collections bounded so no single op dominates the one thread.
- Prefer server-side **Lua/`FUNCTION`** for read-modify-write to avoid RTT races, but
  keep scripts short — a long script blocks the server just like `KEYS`.
- Watch **big keys** with `redis-cli --bigkeys` / `MEMORY USAGE`; they dominate latency,
  eviction, and replication buffers. [redis.io latency/optimization, retrieved 2026-07-10]

## Testing
```python
import fakeredis   # in-process Redis-compatible fake — no external server in unit tests
def test_stampede_lock():
    r = fakeredis.FakeStrictRedis(decode_responses=True)
    assert r.set("k:lock", "1", nx=True, ex=10) is True   # first caller wins the lock
    assert r.set("k:lock", "1", nx=True, ex=10) is None    # second is locked out
```
- Assert eviction/TTL behavior against a real container in integration tests; unit-test
  logic (key naming, lock, jitter) with `fakeredis`. Never mock away the client and
  assert on the mock — test observable behavior.

## Version-Specific Gotchas (dated, sourced)
- **Redis 8.8.0** is the current stable release, published **2026-05-25** (the 8.6.x
  patch line, e.g. **8.6.4**, 2026-06-04, backports fixes to the prior minor).
  [github.com/redis/redis/releases, retrieved 2026-07-10]
- **Licensing changed at Redis 8:** Redis Open Source is **tri-licensed** — your choice
  of **RSALv2**, **SSPLv1**, or **AGPLv3**. Redis **7.2 and earlier remain BSD-3-Clause**.
  This relicense (2024) is *why* **Valkey** was forked (see valkey.md).
  [github.com/redis/redis LICENSE.txt, retrieved 2026-07-10]
- **v7.4**: hash field expiration (`HEXPIRE`), FLOAT16/BFLOAT16 for vectors — verify your
  client (`redis-py`) exposes `hexpire` before relying on it.

## References (retrieved 2026-07-10)
- Redis releases: https://github.com/redis/redis/releases
- Redis license (tri-license from v8): https://github.com/redis/redis/blob/8.8.0/LICENSE.txt
- Eviction / `maxmemory-policy`: https://redis.io/docs/latest/develop/reference/eviction/
- Persistence (RDB/AOF): https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/
- Security & protected-mode: https://redis.io/docs/latest/operate/oss_and_stack/management/security/
- ACL: https://redis.io/docs/latest/operate/oss_and_stack/management/security/acl/
- CVE-2024-31449 (Lua RCE): https://nvd.nist.gov/vuln/detail/CVE-2024-31449
- CWE-306 (Missing Authentication): https://cwe.mitre.org/data/definitions/306.html
- CWE-1188 (Insecure Default): https://cwe.mitre.org/data/definitions/1188.html
- CWE-94 (Code Injection): https://cwe.mitre.org/data/definitions/94.html
