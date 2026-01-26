# Apache Airflow CTO
> Workflow orchestration.

## Non-Negotiables
1. TaskFlow API (@task)
2. Idempotent tasks
3. XComs sparingly
4. Connections for secrets
5. Test DAGs locally

## Red Lines
- Large data in XComs
- Non-idempotent tasks
- Hardcoded credentials
