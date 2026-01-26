# Trino CTO
> Distributed SQL query engine.

## Non-Negotiables
1. Connector configuration
2. Memory management
3. Query optimization
4. Cost-based optimization
5. Resource groups

## Red Lines
- Cross-catalog joins at scale
- Missing statistics
- Large broadcast joins
- No resource limits
- Ignoring query plans
