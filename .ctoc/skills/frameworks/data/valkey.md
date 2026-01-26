# Valkey CTO
> Open-source Redis fork with full compatibility and community governance.

## Commands
```bash
# Setup | Dev | Test
docker run -d --name valkey -p 6379:6379 valkey/valkey:7-alpine
valkey-cli PING
valkey-cli INFO server
```

## Non-Negotiables
1. Same Redis patterns and best practices apply
2. Cluster mode for horizontal scaling
3. Persistence configured (RDB snapshots + AOF)
4. Memory limits with maxmemory-policy
5. Client library compatibility verified
6. Slow log monitoring enabled

## Red Lines
- `KEYS *` in production (use SCAN)
- No memory limits causing OOM
- Missing persistence for durable data
- Single instance for critical workloads
- Ignoring slow log warnings

## Pattern: Cluster-Ready Configuration
```bash
# valkey.conf for production
maxmemory 4gb
maxmemory-policy allkeys-lru
appendonly yes
appendfsync everysec
save 900 1
save 300 10
slowlog-log-slower-than 10000
slowlog-max-len 128

# Enable cluster mode
cluster-enabled yes
cluster-config-file nodes.conf
cluster-node-timeout 5000
```

```python
from valkey import Valkey
from valkey.cluster import ValkeyCluster

# Cluster client
cluster = ValkeyCluster(
    host='valkey-cluster',
    port=6379,
    decode_responses=True,
)

# Use hash tags for multi-key operations
user_id = 123
cluster.hset(f"{{user:{user_id}}}:profile", mapping={"name": "Alice"})
cluster.sadd(f"{{user:{user_id}}}:roles", "admin", "editor")
cluster.expire(f"{{user:{user_id}}}:profile", 3600)

# Pipeline within hash slot
with cluster.pipeline() as pipe:
    pipe.hgetall(f"{{user:{user_id}}}:profile")
    pipe.smembers(f"{{user:{user_id}}}:roles")
    profile, roles = pipe.execute()
```

## Integrates With
- **Compatibility**: Drop-in Redis replacement
- **Clients**: Redis clients work unchanged
- **Ecosystem**: Sentinel, Cluster, Streams

## Common Errors
| Error | Fix |
|-------|-----|
| `MOVED` in cluster | Use cluster-aware client |
| `OOM command not allowed` | Configure maxmemory |
| `CLUSTERDOWN` | Check cluster health, node status |
| `CROSSSLOT` | Use hash tags for related keys |

## Prod Ready
- [ ] Cluster mode with replicas
- [ ] Memory limits and eviction policy
- [ ] AOF persistence enabled
- [ ] Slow log monitoring
- [ ] Backup strategy configured
