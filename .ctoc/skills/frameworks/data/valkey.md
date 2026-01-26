# Valkey CTO
> Open-source Redis fork.

## Non-Negotiables
1. Same Redis patterns apply
2. Cluster mode for scale
3. Proper persistence (RDB/AOF)
4. Memory management
5. Client library compatibility

## Red Lines
- KEYS * in production
- No memory limits
- Missing persistence
- Single instance for critical data
- Ignoring slow log
