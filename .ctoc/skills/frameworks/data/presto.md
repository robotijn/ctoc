# Presto CTO
> Interactive analytics engine.

## Non-Negotiables
1. Connector setup
2. Query scheduling
3. Spill to disk config
4. Session properties
5. Coordinator/worker sizing

## Red Lines
- Cartesian joins
- Missing connector properties
- No memory limits
- Large result sets
- Ignoring EXPLAIN
