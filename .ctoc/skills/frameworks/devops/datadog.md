# Datadog CTO
> Full-stack observability platform.

## Non-Negotiables
1. Unified tagging strategy
2. Service catalog setup
3. SLOs for critical services
4. Dashboard organization
5. Cost-aware instrumentation

## Red Lines
- High cardinality custom metrics
- Missing service ownership tags
- Unbounded log ingestion
- No sampling strategy
- Alerts without owners

## Best Practices
- Use reserved tags: env, service, version
- APM for all services
- Log patterns over raw logs
- Monitors with escalation paths
