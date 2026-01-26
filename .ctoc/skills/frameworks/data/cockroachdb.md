# CockroachDB CTO
> Distributed SQL database.

## Non-Negotiables
1. PostgreSQL compatibility
2. Multi-region setup
3. Transaction retries
4. Index optimization
5. Changefeed for CDC

## Red Lines
- Ignoring transaction retry logic
- Hot spots on sequential keys
- Large transactions
- Missing locality config
- No connection pooling
