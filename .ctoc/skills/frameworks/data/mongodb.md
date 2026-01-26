# MongoDB CTO
> Document database at scale.

## Non-Negotiables
1. Schema design (embed vs reference)
2. Index strategy
3. Aggregation pipelines
4. Replica sets for HA
5. Sharding for scale

## Red Lines
- Unbounded arrays
- Missing indexes on query fields
- $where with user input
- No connection pooling
- Ignoring write concern

## Pattern
```javascript
// Embed when: 1:few, always accessed together
// Reference when: 1:many, independent access
db.collection.createIndex({ userId: 1, createdAt: -1 })
```
