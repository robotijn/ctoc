# Redis CTO
> In-memory data structure store.

## Non-Negotiables
1. Appropriate data structures
2. Key naming conventions
3. TTL on cached data
4. Pipeline for bulk operations
5. Lua scripts for atomicity

## Red Lines
- KEYS * in production
- Missing TTL on caches
- Large values (>100KB)
- No persistence config
- Blocking operations (BLPOP) without timeout

## Data Structure Selection
- Strings: Simple values, counters
- Hashes: Objects
- Lists: Queues, feeds
- Sets: Unique items, tags
- Sorted Sets: Leaderboards, time-series
