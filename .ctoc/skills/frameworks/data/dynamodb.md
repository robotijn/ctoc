# DynamoDB CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
# Local development
docker run -d --name dynamodb -p 8000:8000 amazon/dynamodb-local
# Python SDK
pip install boto3
```

## Claude's Common Mistakes
1. **Table-per-entity design** - Use single-table design for related data
2. **Sequential primary keys** - Causes hot partitions; use composite keys
3. **Scan operations** - Never scan in production; always Query
4. **Missing GSIs** - Every access pattern needs an index
5. **No TTL on ephemeral data** - Causes storage bloat and cost

## Correct Patterns (2026)
```python
import boto3
from boto3.dynamodb.conditions import Key

table = boto3.resource('dynamodb').Table('Application')

# Single-table key design
# PK: USER#123, SK: METADATA          -> User profile
# PK: USER#123, SK: ORDER#2024-01-15#456 -> User's order
# GSI1PK: ORDER#456, GSI1SK: USER#123 -> Order lookup

# Create user
table.put_item(Item={
    'PK': 'USER#123',
    'SK': 'METADATA',
    'GSI1PK': 'USER#123',
    'email': 'alice@example.com',
    'type': 'user'
})

# Create order with TTL
import time
table.put_item(Item={
    'PK': 'USER#123',
    'SK': 'ORDER#2024-01-15#456',
    'GSI1PK': 'ORDER#456',
    'total': 299.99,
    'status': 'pending',
    'ttl': int(time.time()) + 86400 * 90  # 90 days
})

# Query user's orders (NOT scan!)
response = table.query(
    KeyConditionExpression=Key('PK').eq('USER#123') & Key('SK').begins_with('ORDER#'),
    ScanIndexForward=False,
    Limit=20
)
```

## Version Gotchas
- **On-demand vs Provisioned**: On-demand for variable; provisioned for predictable
- **DAX**: In-memory cache for microsecond reads
- **Global Tables**: Multi-region replication
- **Streams**: Change data capture for Lambda triggers

## What NOT to Do
- Do NOT create table-per-entity (use single-table design)
- Do NOT use Scan operations (always Query with indexes)
- Do NOT use sequential IDs as partition keys (hot partition)
- Do NOT skip TTL on ephemeral data (cost/storage bloat)
