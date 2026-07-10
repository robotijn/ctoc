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

## Blocking & Memory Footguns (inherits Redis' single-thread command model)
Valkey is a **fork of Redis 7.2**, so command *execution* is still on one main thread.
Valkey's multi-threading is **I/O only** (socket read/write/parse), not command
execution — so every Redis blocking footgun carries over unchanged.

```python
from valkey import Valkey
v = Valkey(decode_responses=True)

# FOOTGUN: KEYS / big-collection ops block the single command thread O(N)
v.keys("user:*")                       # freezes all clients — same trap as Redis
# RIGHT: cursor-based SCAN in bounded chunks
for key in v.scan_iter(match="user:*", count=200):
    process(key)

# FOOTGUN: default maxmemory-policy is 'noeviction' → writes fail with OOM at the cap.
# RIGHT for a cache: evict, and set the cap.
v.config_set("maxmemory", "2gb")
v.config_set("maxmemory-policy", "allkeys-lru")
```
- **`io-threads`** parallelizes network I/O across cores (Valkey improved this over
  upstream), but **command logic stays serialized** — a slow `SORT`/`KEYS`/big-key op
  still stalls everyone. Multi-threaded I/O is not multi-threaded execution.
- Cluster multi-key ops need one hash slot — colocate with hash tags `{user:123}:x`.
- Eviction, big-key, cache-stampede, RDB/AOF persistence semantics are **identical to
  Redis** (see redis.md) — Valkey inherited the storage engine at the fork point.
  [valkey.io/docs + github.com/valkey-io/valkey release notes, retrieved 2026-07-10]

## Compatibility & Correctness (Redis-fork, then diverging)
- **API-compatible with Redis (RESP2/RESP3).** `redis-py`, `ioredis`, and most clients
  work unchanged against Valkey; the dedicated **GLIDE** client is Valkey's own.
- Valkey **8.x/9.x add features that Redis 7.2 lacked and that post-fork Redis 8 added
  independently** — so a script/module written for Redis 8 may reference commands
  Valkey doesn't have (and vice-versa). Pin to the compatibility level you test against;
  do not assume 1:1 feature parity as both projects evolve.
- **Redis Modules** (RediSearch, RedisJSON, etc.) are **not** part of Valkey — Valkey
  has its own module ecosystem. Do not assume a Redis Stack module loads on Valkey.
  [valkey.io + github.com/valkey-io/valkey, retrieved 2026-07-10]

## Security — same unauthenticated-exposure RCE class as Redis
- **CWE-306 (Missing Authentication for Critical Function)** + **CWE-1188 (insecure
  default)**: an internet-exposed, unauthenticated Valkey lets an attacker use
  `CONFIG SET dir` + `SAVE` to plant an SSH key/cron → RCE — exactly the historical
  Redis attack. **`protected-mode yes`** (inherited default) blocks non-loopback
  connections until you configure auth. Never disable it; never `bind 0.0.0.0` on an
  untrusted network.

```conf
# valkey.conf — least-privilege hardening (Redis-identical directives)
protected-mode yes
bind 127.0.0.1 -::1
requirepass <long-random-secret>
tls-port 6379
# ACLs (inherited from Redis 6+): scope users to key patterns + command categories
# user appuser on >pw ~app:* +@read +@write -@dangerous -flushall -config
```
- Use an **ACL** ruleset + **TLS**; disable/rename `FLUSHALL`, `CONFIG`, `DEBUG`, `EVAL`. Because
  Valkey forked from Redis 7.2, Lua-scripting CVEs from that lineage apply — track
  Valkey's advisories and upgrade the patch line.
  [valkey.io/topics/security, CWE-306, retrieved 2026-07-10]

## Performance
- Enable **`io-threads`** on multi-core hosts to parallelize network handling; benchmark
  — beyond a few threads returns diminish. Command execution is still single-threaded, so
  keep individual ops cheap (`SCAN COUNT`, bounded collections, no `KEYS`).
- Pipeline bulk ops to collapse RTT; use short server-side scripts for read-modify-write.
  [valkey.io/docs performance, retrieved 2026-07-10]

## Testing
```python
from valkey import Valkey
def test_scan_not_keys(vk: Valkey):
    for i in range(500):
        vk.set(f"user:{i}", "1")
    seen = list(vk.scan_iter(match="user:*", count=100))   # bounded, non-blocking
    assert len(seen) == 500                                 # SCAN visits every key
```
- Run integration tests against a real `valkey/valkey` container (Redis clients work);
  assert eviction/TTL/cluster-slot behavior for real — do not mock the client away.

## Version-Specific Gotchas (dated, sourced)
- **Valkey 9.1.0** is the current stable release, published **2026-05-19**; the
  **8.1.x** line (e.g. **8.1.8**, 2026-06-02) is a maintained LTS-style branch.
  [github.com/valkey-io/valkey/releases, retrieved 2026-07-10]
- **Valkey is BSD-3-Clause licensed** (SPDX `BSD-3-Clause`) — the permissive license
  Redis used through 7.2. Valkey was forked in 2024 **because Redis 8 relicensed** to
  RSALv2/SSPLv1/AGPLv3 (see redis.md); Valkey is a Linux Foundation project.
  [github.com/valkey-io/valkey/blob/9.1.0/COPYING, retrieved 2026-07-10]
- **Fork base is Redis 7.2** — features added to Redis *after* the fork are NOT
  automatically in Valkey; verify command availability against your target version.

## References (retrieved 2026-07-10)
- Valkey releases: https://github.com/valkey-io/valkey/releases
- Valkey license (BSD-3-Clause): https://github.com/valkey-io/valkey/blob/9.1.0/COPYING
- Valkey docs: https://valkey.io/docs/
- Valkey security: https://valkey.io/topics/security/
- Eviction / persistence (inherited from Redis): https://redis.io/docs/latest/develop/reference/eviction/
- CWE-306 (Missing Authentication): https://cwe.mitre.org/data/definitions/306.html
- CWE-1188 (Insecure Default): https://cwe.mitre.org/data/definitions/1188.html
