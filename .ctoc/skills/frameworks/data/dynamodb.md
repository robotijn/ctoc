# DynamoDB CTO
> Serverless NoSQL database with single-digit millisecond latency at any scale.

## Commands
```bash
# Setup | Dev | Test
docker run -d --name dynamodb -p 8000:8000 amazon/dynamodb-local
aws dynamodb list-tables --endpoint-url http://localhost:8000
aws dynamodb scan --table-name MyTable --endpoint-url http://localhost:8000
```

## Non-Negotiables
1. Single-table design for related entities
2. Partition key selection for even distribution
3. GSIs for all access patterns
4. On-demand vs provisioned capacity planning
5. TTL for automatic data expiration
6. Transactions for multi-item consistency

## Red Lines
- Table-per-entity (relational thinking)
- Hot partitions from poor key design
- Scan operations in production
- Missing GSIs for required patterns
- No TTL on ephemeral data

## Pattern: Single-Table Design
```python
import boto3
from boto3.dynamodb.conditions import Key

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table('Application')

# Single-table key structure
# PK: USER#123, SK: METADATA          -> User profile
# PK: USER#123, SK: ORDER#2024-01-15#456 -> User's order
# GSI1PK: ORDER#456, GSI1SK: USER#123 -> Order lookup

# Create user
table.put_item(Item={
    'PK': 'USER#123',
    'SK': 'METADATA',
    'GSI1PK': 'USER#123',
    'email': 'alice@example.com',
    'name': 'Alice',
    'type': 'user'
})

# Create order
table.put_item(Item={
    'PK': 'USER#123',
    'SK': f'ORDER#2024-01-15#456',
    'GSI1PK': 'ORDER#456',
    'GSI1SK': 'USER#123',
    'total': 299.99,
    'status': 'pending',
    'type': 'order',
    'ttl': int(time.time()) + 86400 * 90  # 90 days
})

# Query user's orders (sorted by date)
response = table.query(
    KeyConditionExpression=Key('PK').eq('USER#123') & Key('SK').begins_with('ORDER#'),
    ScanIndexForward=False,
    Limit=20
)

# Query order by ID (GSI)
response = table.query(
    IndexName='GSI1',
    KeyConditionExpression=Key('GSI1PK').eq('ORDER#456')
)
```

## Integrates With
- **Lambda**: Native triggers for event processing
- **Streams**: Change data capture for replication
- **DAX**: In-memory caching for microsecond latency

## Common Errors
| Error | Fix |
|-------|-----|
| `ProvisionedThroughputExceeded` | Switch to on-demand or increase capacity |
| `ValidationException: key schema` | Check PK/SK types match table definition |
| `Hot partition throttling` | Redesign partition key for distribution |
| `Item size exceeded` | Keep items <400KB, split if needed |

## Prod Ready
- [ ] Single-table design with access patterns documented
- [ ] GSIs for all query patterns
- [ ] TTL enabled for ephemeral data
- [ ] Capacity mode appropriate for workload
- [ ] Point-in-time recovery enabled
