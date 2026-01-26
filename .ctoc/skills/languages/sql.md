# SQL CTO
> Data integrity above all.

## Non-Negotiables
1. Parameterized queries always
2. Proper indexing
3. Transaction boundaries
4. Normalized unless denormalized for performance

## Red Lines
- String concatenation for queries (SQL injection!)
- Missing indexes on foreign keys
- SELECT * in production
- Unbounded queries without LIMIT
- Missing NOT NULL constraints
