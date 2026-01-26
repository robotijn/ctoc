# Great Expectations CTO
> Data quality validation framework for reliable pipelines.

## Commands
```bash
# Setup | Dev | Test
pip install great_expectations
great_expectations init
great_expectations checkpoint run my_checkpoint
```

## Non-Negotiables
1. Expectations defined in code, version controlled
2. Checkpoints integrated into pipeline orchestration
3. Data docs generated for stakeholder visibility
4. Custom expectations for domain-specific rules
5. Validation at data boundaries (ingest, transform, export)
6. Fail-fast on critical expectation failures

## Red Lines
- Data entering pipelines without validation
- Expectations only in notebooks, not production
- Ignoring validation failures in ETL
- Missing data docs for compliance
- No alerting on expectation failures

## Pattern: Production Data Validation
```python
import great_expectations as gx
from great_expectations.checkpoint import Checkpoint

# Initialize context
context = gx.get_context()

# Create expectation suite programmatically
suite = context.add_expectation_suite("orders_suite")

# Add expectations
context.add_expectations(
    suite,
    expectations=[
        gx.expectations.ExpectColumnValuesToNotBeNull(column="order_id"),
        gx.expectations.ExpectColumnValuesToBeUnique(column="order_id"),
        gx.expectations.ExpectColumnValuesToBeBetween(
            column="amount", min_value=0, max_value=1_000_000
        ),
        gx.expectations.ExpectColumnValuesToMatchRegex(
            column="email", regex=r"^[\w\.-]+@[\w\.-]+\.\w+$"
        ),
    ]
)

# Run checkpoint and handle results
checkpoint = Checkpoint(
    name="orders_checkpoint",
    data_context=context,
    validations=[{"batch_request": batch_request, "expectation_suite_name": "orders_suite"}]
)
result = checkpoint.run()

if not result.success:
    raise ValueError(f"Validation failed: {result.statistics}")
```

## Integrates With
- **Orchestration**: Airflow, Prefect, Dagster operators
- **Storage**: S3, GCS, databases via data connectors
- **Alerting**: Slack, PagerDuty, email notifications

## Common Errors
| Error | Fix |
|-------|-----|
| `DataContextError: cannot find` | Run `great_expectations init` first |
| `BatchRequestError` | Verify datasource configuration |
| `Expectation evaluation error` | Check column exists and dtype matches |
| `Checkpoint run timeout` | Profile large datasets, sample if needed |

## Prod Ready
- [ ] Expectations in version control
- [ ] Checkpoints in CI/CD pipelines
- [ ] Data docs hosted and accessible
- [ ] Alerting on validation failures
- [ ] Custom expectations for business rules
