# CockroachDB CTO
> Distributed SQL database with PostgreSQL compatibility and global scale.

## Commands
```bash
# Setup | Dev | Test
docker run -d --name cockroach -p 26257:26257 -p 8080:8080 cockroachdb/cockroach start-single-node --insecure
cockroach sql --insecure -e "SELECT version()"
cockroach sql --insecure < tests/queries.sql
```

## Non-Negotiables
1. PostgreSQL-compatible SQL with distributed semantics
2. Transaction retry logic for serializable isolation
3. UUID or hash-based primary keys (avoid sequential)
4. Multi-region configuration for global deployments
5. Changefeeds for change data capture
6. Connection pooling in application layer

## Red Lines
- Ignoring transaction retry requirements
- Sequential primary keys causing hot spots
- Large transactions spanning many ranges
- Missing locality configuration for multi-region
- No connection pooling with high concurrency

## Pattern: Distributed-Aware Schema
```sql
-- UUID primary keys to avoid hot spots
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    total DECIMAL(10,2) NOT NULL,
    status STRING NOT NULL DEFAULT 'pending',
    region STRING NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    INDEX idx_orders_user (user_id, created_at DESC),
    INDEX idx_orders_status (status) WHERE status != 'completed'
);

-- Multi-region table with locality
ALTER TABLE orders SET LOCALITY REGIONAL BY ROW AS region;

-- Changefeed for CDC
CREATE CHANGEFEED FOR TABLE orders
INTO 'kafka://broker:9092'
WITH updated, resolved = '10s';
```

```python
import psycopg
from tenacity import retry, retry_if_exception_type, stop_after_attempt

# Transaction retry decorator for serializable conflicts
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

## Integrates With
- **PostgreSQL**: Wire-compatible, most tools work
- **ORM**: SQLAlchemy, Prisma, GORM with retry handling
- **CDC**: Kafka, Pub/Sub via changefeeds

## Common Errors
| Error | Fix |
|-------|-----|
| `RETRY_WRITE_TOO_OLD` | Implement transaction retry logic |
| `range too large` | Reduce transaction scope |
| `connection refused` | Check cluster health, node status |
| `hot range` | Use UUID keys, check data distribution |

## Prod Ready
- [ ] Transaction retry logic implemented
- [ ] UUID or hash primary keys
- [ ] Multi-region locality configured
- [ ] Connection pooling with PgBouncer
- [ ] Monitoring via DB Console
