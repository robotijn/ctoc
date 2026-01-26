# Neon CTO
> Serverless PostgreSQL.

## Non-Negotiables
1. Branching for development
2. Autoscaling configuration
3. Connection pooling
4. Compute endpoint sizing
5. Point-in-time recovery

## Red Lines
- Long-running connections without pooling
- Missing branch strategy
- No autosuspend for dev branches
- Ignoring compute limits
- No backup verification
