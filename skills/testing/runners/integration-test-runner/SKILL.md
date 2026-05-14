---
name: integration-test-runner
description: Runs integration tests against real databases and services — the fat middle layer of the Testing Trophy.
type: skill
when_to_load:
  - "run integration test"
  - "run integration tests"
  - "integration test run"
  - "integration test suite"
  - "test against database"
  - "test with real services"
related_skills:
  - testing/writers/integration-test-writer
  - testing/quality-gate-runner
  - testing/runners/unit-test-runner
effort_level: medium
model_optimized_for: opus-4-7
tools: Bash, Read
model: opus
tier: 2
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: true
effort_budget:
  max_tokens: 25000
  max_tool_calls: 20
  max_subagents: 0
---

# Integration Test Runner (skill)

> Converted from agents/testing/runners/integration-test-runner.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You execute integration tests that interact with real databases and services — slower than unit tests, but verifying actual system behavior. In the Testing Trophy, integration is the **fat middle layer**, not a thin afterthought above unit tests.

## 2026 Best Practices (Testing category)

Two patterns dominate this skill:

- **Testing Trophy, not pyramid** — Kent C. Dodds' Trophy puts integration as the LARGEST layer (fat middle). For new code, integration tests should be the default choice over unit tests because they catch interaction bugs and survive refactors of internal implementation. When running, ensure the integration suite is generous, not minimal.
- **Flaky test quarantine workflow** — integration tests are the second-flakiest layer (after E2E). Service availability flakes (DB down, network blip) should NOT cause silent skips — they must fail loudly. Real flakes (race conditions, test data pollution) get quarantined with 2-week SLA.

## Prerequisites

Before running:
- Database running and accessible
- Required services available
- Environment variables set
- Test data migrations applied

## Commands by Language

### Python
```bash
# Integration tests only
pytest tests/integration -v --tb=short

# With database URL
DATABASE_URL=postgresql://localhost/test pytest tests/integration

# With coverage
pytest tests/integration --cov=src --cov-report=term
```

### Node.js
```bash
npm run test:integration

# With specific database
DATABASE_URL=postgresql://localhost/test npm run test:integration
```

### Go
```bash
go test -v -tags=integration ./...

# With test DB
TEST_DB_URL=postgres://localhost/test go test -tags=integration ./...
```

## Docker-Based Setup

```bash
# Start test services
docker-compose -f docker-compose.test.yml up -d

# Wait for services
./scripts/wait-for-it.sh localhost:5432

# Run tests
pytest tests/integration

# Cleanup
docker-compose -f docker-compose.test.yml down -v
```

## Output Format

```markdown
## Integration Test Report

**Status**: PASS | FAIL
**Duration**: 45.2s

### Services Tested
| Service | Status |
|---------|--------|
| PostgreSQL | Connected |
| Redis | Connected |
| External API | Mocked |

### Results
| Suite | Passed | Failed | Skipped |
|-------|--------|--------|---------|
| User API | 6 | 0 | 0 |
| Order API | 4 | 1 | 0 |
| Payment | 3 | 0 | 1 |

### Failures (1)
1. `test_order_creation_with_inventory_check`
   - Error: IntegrityError: duplicate key
   - Cause: Test isolation issue
   - File: `tests/integration/test_orders.py:45`

### Slow Tests (> 5s)
- `test_bulk_import`: 8.2s
- `test_full_sync`: 6.1s

### Database Stats
- Queries executed: 234
- Slowest query: 120ms (ORDER BY without index)
```

## CRITICAL: NO SILENT FAILURES

**Tests must NEVER silently fail.** Non-negotiable.

### Integration-Specific Rules

1. **Service unavailable = FAIL, not skip**
   ```javascript
   // BAD: silently passes when DB is down
   beforeAll(async () => {
     try { db = await connectDB(); } catch { db = null; }
   });
   test('user query', () => {
     if (!db) return; // SILENT FAILURE
   });

   // GOOD: fails loudly
   beforeAll(async () => {
     db = await connectDB(); // throws if unavailable
   });
   ```

2. **Fixtures depending on DB must fail explicitly**
   ```javascript
   // BAD
   async function seedTestData() {
     try { await db.insert(testUsers); } catch { /* ignore */ }
   }

   // GOOD
   async function seedTestData() {
     if (!db) throw new Error('DB required for seeding');
     await db.insert(testUsers);
   }
   ```

3. **Environment checks at test start**
   ```javascript
   const requiredEnv = ['DATABASE_URL', 'REDIS_URL'];
   for (const env of requiredEnv) {
     if (!process.env[env]) throw new Error(`Missing required env: ${env}`);
   }
   ```

4. **Connection failures = test failures**
   - No database → FAIL
   - No Redis → FAIL
   - No network → FAIL
   - These are not skips; fix the infrastructure or the test.

**If a test cannot run due to missing infrastructure, it must FAIL. Period.**
