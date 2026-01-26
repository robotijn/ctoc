# CockroachDB CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
docker run -d --name cockroach -p 26257:26257 -p 8080:8080 \
  cockroachdb/cockroach:v24.1 start-single-node --insecure
# PostgreSQL wire protocol
pip install psycopg  # Standard PostgreSQL driver works
```

## Claude's Common Mistakes
1. **No transaction retry logic** - Serializable isolation requires retries
2. **Sequential primary keys** - Causes hot ranges; use UUID
3. **Large transactions** - Spanning many ranges causes contention
4. **Missing locality config** - Multi-region needs explicit setup
5. **Expecting PostgreSQL behavior** - Distributed semantics differ

## Correct Patterns (2026)
```python
import psycopg
from tenacity import retry, retry_if_exception_type, stop_after_attempt

# Transaction retry decorator (REQUIRED for production)
@retry(
    retry=retry_if_exception_type(psycopg.errors.SerializationFailure),
    stop=stop_after_attempt(3)
)
def transfer_funds(conn, from_id: str, to_id: str, amount: float):
    with conn.transaction():
        conn.execute(
            "UPDATE accounts SET balance = balance - %s WHERE id = %s",
            (amount, from_id)
        )
        conn.execute(
            "UPDATE accounts SET balance = balance + %s WHERE id = %s",
            (amount, to_id)
        )
```

```sql
-- UUID primary keys (avoid hot ranges)
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    total DECIMAL(10,2) NOT NULL,
    region STRING NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    INDEX idx_orders_user (user_id, created_at DESC)
);

-- Multi-region locality
ALTER TABLE orders SET LOCALITY REGIONAL BY ROW AS region;

-- Changefeed for CDC
CREATE CHANGEFEED FOR TABLE orders INTO 'kafka://broker:9092';
```

## Version Gotchas
- **v24+**: Improved query optimizer, better PostgreSQL compatibility
- **Serializable**: Default isolation; requires retry handling
- **Changefeeds**: Built-in CDC to Kafka/cloud storage
- **Serverless**: CockroachDB Serverless for auto-scaling

## What NOT to Do
- Do NOT skip transaction retry logic (serialization failures)
- Do NOT use sequential primary keys (hot ranges)
- Do NOT create large transactions (span many ranges)
- Do NOT assume PostgreSQL semantics (distributed is different)
