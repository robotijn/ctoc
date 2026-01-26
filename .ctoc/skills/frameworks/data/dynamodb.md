# DynamoDB CTO
> Serverless NoSQL at any scale.

## Non-Negotiables
1. Single-table design
2. Partition key selection
3. GSI for access patterns
4. On-demand vs provisioned
5. TTL for cleanup

## Red Lines
- Table per entity (relational thinking)
- Hot partitions
- Scan operations
- Missing GSIs for patterns
- No TTL on ephemeral data

## Pattern
```
PK: USER#123
SK: ORDER#2024-01-15#456
GSI1PK: ORDER#456
GSI1SK: USER#123
```
