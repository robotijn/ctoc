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

## Validation Footguns (suites, checkpoints, batches, data docs)
The core Great Expectations 1.x model bug Claude writes: **calling
`batch.validate(suite)` ad-hoc and treating its return value as the whole story**,
instead of running a **Checkpoint** — the object that binds a *batch* to an
*expectation suite*, runs the validation, triggers an **action list**, and updates
**Data Docs**. Ad-hoc validation gives you a result object but *no persisted
history, no docs, and no failure actions*.

```python
import great_expectations as gx

context = gx.get_context()   # file/ephemeral/cloud context — where suites & results live

# An expectation SUITE = the versioned contract (belongs in source control)
suite = context.suites.add(gx.ExpectationSuite(name="orders_suite"))
suite.add_expectation(gx.expectations.ExpectColumnValuesToNotBeNull(column="order_id"))

# A BATCH DEFINITION selects the data slice; a VALIDATION DEFINITION pairs data+suite
ds = context.data_sources.add_pandas("src")
asset = ds.add_dataframe_asset("orders")
batch_def = asset.add_batch_definition_whole_dataframe("full")
val_def = context.validation_definitions.add(
    gx.ValidationDefinition(name="orders_vd", data=batch_def, suite=suite)
)

# A CHECKPOINT runs the validation + fires actions + updates Data Docs (the real entry point)
checkpoint = context.checkpoints.add(
    gx.Checkpoint(name="orders_cp", validation_definitions=[val_def],
                  actions=[gx.checkpoint.UpdateDataDocsAction(name="docs")])
)
result = checkpoint.run(batch_parameters={"dataframe": df})
if not result.success:
    raise ValueError("orders_suite failed — see Data Docs")   # fail-fast at the boundary
```

- **Suite = versioned contract.** Keep expectation suites (JSON in the GX store) in
  source control; a suite defined only in a notebook is not a production contract.
- **Checkpoint = the run unit.** It applies a suite to a batch AND runs an
  **action list** on the outcome (update Data Docs, notify Slack/email, etc.).
  Skipping the checkpoint skips the actions.
- **Batch requests select the slice.** A batch definition (whole-dataframe, or
  partitioned by a batching regex/column) determines *what* is validated — the wrong
  batch validates the wrong rows.
- **Validation vs profiling.** Validation *asserts* a known suite; profiling
  *suggests* expectations from data. Don't ship auto-profiled expectations as if
  they were reviewed contracts.
- **Data Docs are the stakeholder view.** They render suites + validation history to
  HTML; wire `UpdateDataDocsAction` into the checkpoint and host the output.
  [docs.greatexpectations.io core: suites / checkpoints / batches / data-docs,
  retrieved 2026-07-10]

## Correctness & Performance (empty-batch false pass, batch throughput)
- **The empty-batch false pass** is the silent killer: most column expectations
  evaluate over rows, and **zero rows means zero failing rows**, so a suite can
  report `success=True` on an *empty* batch — a broken upstream job passes
  validation. Guard it explicitly with a row-count floor.
```python
# Make "no data" a LOUD failure, not a silent pass
suite.add_expectation(
    gx.expectations.ExpectTableRowCountToBeBetween(min_value=1)   # empty batch => fail
)
```
- **Pin the batch identifier** (partition/date) you validate so a checkpoint run is
  reproducible and points at a known slice; an ambiguous batch request can validate
  yesterday's data and report green.
- **Performance / throughput:** validation cost scales with batch size × number of
  expectations. On a SQL datasource, push validation *into the warehouse* (a
  SQL/Spark execution engine) instead of pulling every row into pandas; on huge
  tables, validate a bounded **batch** (partition/day) rather than the whole table
  per run so a checkpoint stays within its schedule window.
  [docs.greatexpectations.io expectations + batches, retrieved 2026-07-10]

## Error Handling & Testing
```python
# Treat a failed checkpoint as a pipeline error at the ingestion boundary
result = checkpoint.run(batch_parameters={"dataframe": df})
assert result.success, [r for r in result.run_results.values() if not r["success"]]

# TEST the contract itself against a known-bad frame — the suite MUST fail on it
def test_orders_suite_rejects_null_order_id():
    bad = pd.DataFrame({"order_id": [None], "amount": [10]})
    res = checkpoint.run(batch_parameters={"dataframe": bad})
    assert not res.success            # the contract catches the defect (not a false green)
```
- Assert on `result.success` AND inspect `run_results` so a partial failure surfaces
  the failing expectation, not just a boolean.
- Test your *suite* with a deliberately bad frame so you prove it can fail — a suite
  that never fails is a false-green contract. [docs.greatexpectations.io checkpoints
  docs, retrieved 2026-07-10]

## Security & Dependency (CWE-798)
- **Datasource credentials never in code (CWE-798).** GX 1.x reads connection
  strings/credentials via `config_variables.yml` and `${ENV_VAR}` substitution or a
  secrets manager — never hardcode a DB URI with a password into a datasource or
  checkpoint. Keep `great_expectations.yml`/`config_variables.yml` credential values
  out of source control.
- No public CVE is currently listed for the `great_expectations` PyPI package in the
  GitHub Advisory Database (checked 2026-07-10); the datasource-credential exposure
  above is the concrete standing risk (CWE-798), grounded in the official
  credential-handling docs rather than an advisory. [github.com/advisories query
  (pip/great_expectations, 0 results) + docs.greatexpectations.io credential
  handling; cwe.mitre.org CWE-798; retrieved 2026-07-10]

## Version-Specific Gotchas (dated, sourced)
- **great_expectations 1.18.2** is the current stable release, uploaded
  **2026-06-26**, `requires_python >=3.10,<3.14`. [pypi.org/project/great-expectations
  JSON API, retrieved 2026-07-10]
- **The 1.0 rewrite changed everything:** the fluent API — `context.suites`,
  `context.data_sources`, `context.validation_definitions`, `context.checkpoints` —
  replaced the pre-1.0 `DataContext`/`RuntimeBatchRequest` style. **Checkpoints were
  restructured** (validation definitions + action lists), and **Data Docs are
  auto-generated** but hosted separately. Pre-1.0 tutorials will not run on 1.x.
  [docs.greatexpectations.io v1 docs + pypi.org, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- Great Expectations releases (PyPI JSON): https://pypi.org/pypi/great-expectations/json
- GX 1.x overview: https://docs.greatexpectations.io/docs/core/introduction/gx_overview
- Expectation suites: https://docs.greatexpectations.io/docs/core/define_expectations/organize_expectation_suites
- Checkpoints & actions: https://docs.greatexpectations.io/docs/core/trigger_actions_based_on_results/run_a_checkpoint
- Batch definitions: https://docs.greatexpectations.io/docs/core/connect_to_data/dataframes
- Data Docs: https://docs.greatexpectations.io/docs/core/configure_project_settings/configure_data_docs
- Credential handling: https://docs.greatexpectations.io/docs/core/connect_to_data/sql_data
- GitHub Advisory Database: https://github.com/advisories
- CWE-798 Use of Hard-coded Credentials: https://cwe.mitre.org/data/definitions/798.html
