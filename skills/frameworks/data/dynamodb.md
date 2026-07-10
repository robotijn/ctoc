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

## Modeling Footguns (partition key + access patterns first)
DynamoDB is access-pattern-driven: you enumerate every query BEFORE the schema,
then design keys to serve them. The partition key controls placement and the hard
scaling ceiling.

```python
# FOOTGUN: HOT PARTITION — a low-cardinality or sequential partition key funnels
# traffic onto one partition. DynamoDB caps a single partition at ~3000 RCU /
# 1000 WCU; exceed it and you get ProvisionedThroughputExceededException even
# though the TABLE has spare capacity.
Item = {'PK': 'STATUS#active', ...}     # every active row → one partition → throttle

# RIGHT: high-cardinality partition key; add a write-sharding suffix if a single
# logical key is genuinely hot.
import random
Item = {'PK': f'USER#{user_id}', ...}                  # spreads across partitions
Item = {'PK': f'FEED#{random.randint(0,9)}', ...}      # sharded hot key (fan-in on read)
```

- **Single-table design + composite keys.** Related entities share one table; the
  sort key (`SK`) encodes the relationship (`METADATA`, `ORDER#<date>#<id>`), and a
  `begins_with` Query fetches an entity and its children in one request. Table-per-entity
  forces N requests and loses transactional/GSI locality.
- **`Scan` vs `Query`.** `Scan` reads the ENTIRE table (paying RCU for every item,
  then filtering client-side); `Query` reads one partition by key. Never `Scan` a
  hot path — model a key or GSI so a `Query` answers it.
- **Item-size limit is 400 KB** (hard DynamoDB service quota — key + attribute names
  + values). Large blobs belong in S3 with a pointer stored in the item. Oversized
  writes are rejected. [docs.aws.amazon.com DynamoDB service quotas, retrieved
  2026-07-10; see References]

## GSIs — projection, eventual consistency, throttle propagation
```python
# A Global Secondary Index (GSI) is a SEPARATE partition space with its own key
# and its OWN capacity. Three footguns Claude routinely hits:
#
# 1) PROJECTION: only projected attributes are readable from the GSI. Query a GSI
#    for a non-projected attribute → an implicit, expensive fetch back to the base
#    table (or a KeyError). Project exactly what the query needs (KEYS_ONLY /
#    INCLUDE / ALL — ALL doubles storage).
# 2) EVENTUAL CONSISTENCY: GSIs are ONLY eventually consistent. A read right after
#    a write may miss the item. There is no ConsistentRead=True on a GSI.
# 3) THROTTLE PROPAGATION: if a GSI's capacity is exhausted, writes to the BASE
#    table are throttled (back-pressure). Size GSI capacity like the base table.

resp = table.query(
    IndexName='GSI1',
    KeyConditionExpression=Key('GSI1PK').eq('ORDER#456'),
    # ConsistentRead is NOT valid here — GSIs are eventually consistent
)
```
- Use a **Local Secondary Index (LSI)** only when you need strong consistency on an
  alternate sort key AND can accept the 10 GB per-partition item-collection limit;
  otherwise prefer GSIs.

## Cost & Throughput (RCU/WCU, batch retries)
```python
# On-demand: pay-per-request, auto-scales, no capacity planning — best for spiky
# or unknown traffic. Provisioned + auto-scaling: cheaper for steady, predictable
# load. 1 RCU = 1 strongly-consistent 4KB read/s (2 eventually-consistent);
# 1 WCU = 1 write up to 1KB/s.
#
# BatchWriteItem / BatchGetItem return UnprocessedItems on partial throttle —
# they DO NOT auto-retry. Silently dropping them loses writes.
import time
def batch_write(table_name, items, client):
    req = {table_name: [{'PutRequest': {'Item': i}} for i in items]}
    backoff = 0.05
    while req:
        resp = client.batch_write_item(RequestItems=req)
        req = resp.get('UnprocessedItems')            # MUST re-submit these
        if req:
            time.sleep(backoff); backoff = min(backoff * 2, 2.0)  # exp backoff
```
- boto3 retries individual `PutItem`/`GetItem` on throttle, but **batch APIs return
  unprocessed items instead of raising** — you own the retry loop. [docs.aws.amazon.com
  BatchWriteItem, retrieved 2026-07-10; see References]

## Security — IAM least-privilege & condition expressions
DynamoDB has no query-injection surface (typed API, not string SQL), but the real
risks are over-broad IAM and lost-update races.

```python
# RIGHT: optimistic concurrency via a ConditionExpression — prevents lost updates
# and enforces idempotency without a read-modify-write race.
table.put_item(
    Item={'PK': 'USER#123', 'SK': 'METADATA', 'version': 2, ...},
    ConditionExpression='attribute_not_exists(PK) OR version = :v',
    ExpressionAttributeValues={':v': 1},   # rejected if someone else bumped version
)
```
- **IAM least-privilege**: scope the policy to the specific table ARN and actions
  (`dynamodb:Query`, `PutItem`), and use `dynamodb:LeadingKeys` conditions to fence
  each caller to their own partition. Never grant `dynamodb:*` on `Resource: *`.
- Enable encryption at rest (default) + PITR; use VPC endpoints to keep traffic off
  the public internet. Validate/normalize user input before it becomes a key.
  [docs.aws.amazon.com DynamoDB IAM / condition expressions, retrieved 2026-07-10;
  see References]

## Testing
```python
import pytest, boto3
from testcontainers.core.container import DockerContainer

@pytest.fixture(scope="session")
def table():
    c = DockerContainer("amazon/dynamodb-local:latest").with_exposed_ports(8000)
    c.start()
    endpoint = f"http://{c.get_container_host_ip()}:{c.get_exposed_port(8000)}"
    ddb = boto3.resource('dynamodb', endpoint_url=endpoint,
                         region_name='us-east-1',
                         aws_access_key_id='x', aws_secret_access_key='x')
    t = ddb.create_table(
        TableName='App',
        KeySchema=[{'AttributeName':'PK','KeyType':'HASH'},
                   {'AttributeName':'SK','KeyType':'RANGE'}],
        AttributeDefinitions=[{'AttributeName':'PK','AttributeType':'S'},
                              {'AttributeName':'SK','AttributeType':'S'}],
        BillingMode='PAY_PER_REQUEST')
    yield t; c.stop()

def test_condition_expression_blocks_stale_write(table):
    table.put_item(Item={'PK':'U#1','SK':'M','version':1})
    with pytest.raises(Exception):  # ConditionalCheckFailedException
        table.put_item(Item={'PK':'U#1','SK':'M','version':1},
                       ConditionExpression='attribute_not_exists(PK)')
```
- Prefer **DynamoDB Local** (real engine, containerized) over mocking boto3 — key
  routing, GSIs, and condition expressions are engine behavior a mock can't reproduce.

## Performance
- **Query, never Scan** on hot paths; a Scan's cost scales with table size.
- **DAX** (DynamoDB Accelerator) gives microsecond cached reads for read-heavy,
  read-consistent workloads; it does not help write-heavy or strongly-consistent reads.
- **Sparse GSIs** (index only items that have the GSI key attribute) shrink index
  size and cost — a common modeling win for "find items in state X".
- **Streams + Lambda** for CDC/fan-out instead of client-side polling.

## Version-Specific Gotchas (dated, sourced)
- **boto3 1.43.45** (AWS SDK for Python), uploaded **2026-07-09**, requires
  Python >= 3.10. For JS/TS use the **AWS SDK v3** modular `@aws-sdk/client-dynamodb`
  + `@aws-sdk/lib-dynamodb` `DynamoDBDocumentClient` (v2 is end-of-support).
  [pypi.org/project/boto3 JSON API, retrieved 2026-07-10; see References]
- **Item size 400 KB**, single-partition ~**3000 RCU / 1000 WCU**, LSI item
  collection ~**10 GB** — hard/soft service quotas, not tunable per item. Design
  within them. [docs.aws.amazon.com DynamoDB service quotas, retrieved 2026-07-10]
- **On-demand** now scales instantly and supports higher default throughput; still
  cannot exceed per-partition limits — write-shard genuinely hot keys.
- **GSIs remain eventually consistent** across all SDK versions — no
  `ConsistentRead` on an index.

## References (retrieved 2026-07-10)
- boto3 releases (PyPI JSON): https://pypi.org/pypi/boto3/json
- DynamoDB service quotas (item size, RCU/WCU, LSI): https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/ServiceQuotasOverview.html
- Single-table design / best practices: https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/best-practices.html
- BatchWriteItem (UnprocessedItems): https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_BatchWriteItem.html
- IAM & fine-grained access (LeadingKeys): https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/specifying-conditions.html
- Condition expressions: https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.ConditionExpressions.html
- AWS SDK for JavaScript v3 DynamoDB: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/dynamodb/
