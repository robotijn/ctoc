# Great Expectations CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
pip install great_expectations
great_expectations init
# Creates gx/ directory with data context
```

## Claude's Common Mistakes
1. **Expectations only in notebooks** - Must be in version control for production
2. **Ignoring validation failures** - Pipeline should fail-fast on critical failures
3. **No data docs** - Stakeholders need visibility into data quality
4. **Custom expectations for standard checks** - Built-in expectations cover most cases
5. **Validating after transformations only** - Validate at ingestion too

## Correct Patterns (2026)
```python
import great_expectations as gx

# Initialize context (v1.0+ API)
context = gx.get_context()

# Create expectation suite programmatically
suite = context.suites.add(gx.ExpectationSuite(name="orders_suite"))

# Add expectations
suite.add_expectation(
    gx.expectations.ExpectColumnValuesToNotBeNull(column="order_id")
)
suite.add_expectation(
    gx.expectations.ExpectColumnValuesToBeUnique(column="order_id")
)
suite.add_expectation(
    gx.expectations.ExpectColumnValuesToBeBetween(
        column="amount", min_value=0, max_value=1_000_000
    )
)

# Define data source and batch
datasource = context.data_sources.add_pandas("my_datasource")
data_asset = datasource.add_dataframe_asset("orders")
batch_definition = data_asset.add_batch_definition_whole_dataframe("full_batch")

# Run validation
batch = batch_definition.get_batch(batch_parameters={"dataframe": df})
results = batch.validate(suite)

if not results.success:
    raise ValueError(f"Data validation failed: {results.statistics}")
```

## Version Gotchas
- **v1.0**: Major API rewrite; context.suites, context.data_sources
- **Checkpoints**: Renamed and restructured in v1.0
- **Data docs**: Now auto-generated; configure hosting separately
- **Cloud**: GX Cloud for managed expectations and collaboration

## What NOT to Do
- Do NOT leave expectations only in notebooks (version control them)
- Do NOT ignore validation failures in production pipelines
- Do NOT write custom expectations for standard validations
- Do NOT skip validation at data ingestion boundaries
