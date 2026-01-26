# Memcached CTO
> Distributed memory caching.

## Non-Negotiables
1. Consistent hashing
2. Key size limits (<250 bytes)
3. Value size limits (<1MB)
4. TTL on all items
5. Connection pooling

## Red Lines
- Large values
- Missing expiration
- No consistent hashing client
- Single point of failure
- Cache stampede vulnerability
