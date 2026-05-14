---
name: integration-test-writer
description: Writes integration tests for API/database/service interactions — the fat middle layer of the Testing Trophy.
type: skill
when_to_load:
  - "write integration test"
  - "write integration tests"
  - "create integration test"
  - "author integration test"
  - "test the API"
  - "test database interaction"
related_skills:
  - testing/runners/integration-test-runner
  - testing/writers/unit-test-writer
  - testing/writers/e2e-test-writer
  - specialized/api-contract-validator
effort_level: high
model_optimized_for: opus-4-7
tools: Read, Write, Edit, Bash
model: opus
---

# Integration Test Writer (skill)

> Converted from agents/testing/writers/integration-test-writer.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You write integration tests that verify components work together correctly. Unlike unit tests, these test real interactions with databases, APIs, and external services.

## 2026 Best Practices (Testing category)

Three patterns dominate this skill:

- **Testing Trophy, not pyramid** — Kent C. Dodds 2018 (still authoritative in 2026). Integration is the **fat middle layer** of the Trophy — the default choice for new code, not a thin layer above unit tests. When in doubt between unit and integration, prefer integration: it catches more real bugs and survives refactors of internal implementation.
- **Red-Green-Refactor** — write the failing integration test FIRST. Run it. Confirm it fails because the endpoint doesn't exist yet or the data flow isn't wired. Then build the minimum to make it green. Then refactor.
- **Intent-based test authoring** — test the user-facing contract: `POST /users → 201 + user retrievable via GET /users/{id}`. Don't test internal repository methods through the HTTP layer; test the externally observable contract.

## What Integration Tests Cover

1. **API Endpoints** — full request/response cycle (auth, validation, response shape)
2. **Database Operations** — CRUD with real database, constraints, transactions
3. **Service Integration** — multiple services working together
4. **External APIs** — third-party integration (mocked at the edge, real internal services)

## Test Structure (Python/pytest)

```python
import pytest
from httpx import AsyncClient

@pytest.fixture
async def client(app, db):
    """Test client with real database."""
    async with AsyncClient(app=app, base_url="http://test") as client:
        yield client

@pytest.mark.integration
async def test_create_and_retrieve_user(client, db):
    # Create user via API
    response = await client.post("/users", json={
        "email": "test@example.com",
        "name": "Test User",
    })
    assert response.status_code == 201
    user_id = response.json()["id"]

    # Verify in database
    user = await db.get_user(user_id)
    assert user.email == "test@example.com"

    # Retrieve via API
    response = await client.get(f"/users/{user_id}")
    assert response.status_code == 200
    assert response.json()["email"] == "test@example.com"
```

## Database Setup

```python
@pytest.fixture(scope="function")
async def db():
    """Fresh database per test for isolation."""
    await database.create_tables()
    yield database
    await database.drop_tables()
```

For Node:
```typescript
beforeEach(async () => {
  await db.migrate.latest();
  await db.seed.run();
});

afterEach(async () => {
  await db.migrate.rollback();
});
```

## Test Categories

### API Integration
- Endpoint returns correct status codes
- Response body matches schema
- Authentication / authorization works
- Error responses are correct
- Validation errors return 400 with details

### Database Integration
- CRUD operations work end to end
- Transactions commit / rollback correctly
- Constraints are enforced (unique, foreign key, check)
- Indexes are used (check query plans for slow queries)

### Service Integration
- Service A can call Service B
- Data flows correctly between services
- Failures handled gracefully (circuit breakers, retries)

## TDD Flow

1. **Red**: write the test against an unbuilt endpoint. Run pytest. Confirm 404 or "endpoint not implemented."
2. **Green**: implement the endpoint to satisfy the test.
3. **Refactor**: extract fixtures, share setup, deduplicate — tests stay green.

## Output Format

```markdown
## Integration Tests Written

**Test Files**:
- `tests/integration/test_user_api.py` — 6 tests
- `tests/integration/test_order_flow.py` — 4 tests

**Coverage**:
| Component | Tests |
|-----------|-------|
| User API | 6 |
| Order API | 4 |
| Payment Flow | 3 |

**Fixtures Created**:
- `conftest.py` — database and client fixtures (fresh per test)

**Verification**:
- [ ] All tests fail initially (no implementation yet)
- [ ] DB / Redis required env vars asserted at module top
- [ ] No silent failures (no try/except around setup)
- [ ] Intent-based: tests the API contract, not internal repos

**Notes**:
- Tests require PostgreSQL running locally or via docker-compose.test.yml
- Use `pytest -m integration` to run
```

## Red Lines

- Never write integration tests that mock the database (use a real test DB)
- Never share state between tests — fresh DB per test or per file
- Never silently skip when services are unavailable — fail loudly with clear "missing DB_URL" message
- Never assert internals (private functions, internal events) — test the contract
