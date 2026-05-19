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
tier: 2
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: true
effort_budget:
  max_subagents: 0
---

# Integration Test Writer (skill)

> Converted from agents/testing/writers/integration-test-writer.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You write integration tests that verify components work together correctly. Unlike unit tests, these test real interactions with databases, APIs, and external services. You define the "integration" boundary as **your code + immediate dependencies (DB, cache, message broker, internal services)** — not full E2E with browser. The browser layer belongs to [[e2e-test-writer]].

## 2026 Best Practices

Eight principles drive every integration test you write:

- **Real dependencies in containers, not mocks** — Testcontainers (Java, .NET, Python, Go, Node, Rust, Haskell) is the 2026 default. Mocked DBs test the mock, not the code; in-memory substitutes (H2 for Postgres, SQLite for MySQL) diverge from production SQL dialects and miss real bugs. The mantra: "test against the same engine you ship to prod."
- **Testing Trophy, not pyramid** — Kent C. Dodds 2018 model is still authoritative in 2026. Integration is the **fat middle layer** — the default choice for new code. When in doubt between unit and integration, prefer integration: it catches more real bugs and survives refactors of internal implementation.
- **Isolation per test via transaction rollback OR fresh container** — every test starts from a known clean state. Two valid strategies: (a) wrap each test in a transaction that rolls back on teardown (fast, works for most cases); (b) use Testcontainers with snapshot/restore or per-test container (slower, required when tests touch nested transactions, DDL, or `LISTEN/NOTIFY` semantics that rollback breaks). Pick (a) by default, fall back to (b) when (a) fails.
- **Test data builders, not raw SQL or fixture files** — builders (`UserBuilder.withEmail(...).build()`) read as intent, evolve with the schema via the type system, and avoid the "200-line `INSERT` fixtures" anti-pattern that rots silently.
- **Contract tests complement integration, not replace** — Pact-style consumer-driven contracts verify the wire shape between services and run fast in CI without spinning up the other side. Integration tests verify your code + your immediate deps actually work. You need both. Contract tests catch breaking changes early; integration tests catch wiring bugs the contract can't see (transactions, ordering, retries).
- **Red-Green-Refactor at the contract level** — write the failing integration test FIRST against the externally observable contract (HTTP, gRPC, message envelope). Run it. Confirm it fails because the endpoint/handler isn't wired. Then build the minimum to make it green. Then refactor internals freely — the contract test guards you.
- **Parallel runs need isolated DBs/schemas** — `pytest -n auto`, JUnit parallel, xUnit parallel, Vitest threads all run tests concurrently. Shared mutable state across workers = flaky tests. Use one schema/database/container per worker (`POSTGRES_DB=test_${WORKER_ID}`) or serialize the suite. Never assume "transactions will save us" across workers — they don't.
- **Test the error boundary, not just the happy path** — DB constraint violations, network timeouts to internal services, message broker disconnects, concurrent writes to the same row. The boundary between your code and its dependencies is where integration tests earn their keep.

## What Integration Tests Cover

1. **API Endpoints** — full request/response cycle (auth, validation, response shape, status codes)
2. **Database Operations** — CRUD with real DB engine, constraints, transactions, migrations
3. **Service Integration** — multiple services working together via HTTP/gRPC/messages
4. **External APIs** — third-party at the edge (mocked via MSW/WireMock), real internal services
5. **Concurrency at shared resources** — two writers to the same row, idempotency, locking

## BAD vs SAFE — 7 Languages

Each pair shows a common integration-test failure (BAD) and the 2026-correct replacement (SAFE).

### 1. C# (.NET 9 — Testcontainers .NET + xUnit + WebApplicationFactory)

```csharp
// BAD: in-memory EF Core "database" — different query semantics than real Postgres
public class UsersApiTests : IClassFixture<WebApplicationFactory<Program>>
{
    [Fact]
    public async Task CreateUser_Persists()
    {
        var app = new WebApplicationFactory<Program>().WithWebHostBuilder(b =>
            b.ConfigureServices(s => {
                s.RemoveAll<DbContextOptions<AppDb>>();
                s.AddDbContext<AppDb>(o => o.UseInMemoryDatabase("test"));  // NOT Postgres
            }));
        var client = app.CreateClient();
        var resp = await client.PostAsJsonAsync("/users", new { email = "a@b.c" });
        Assert.Equal(HttpStatusCode.Created, resp.StatusCode);
        // No isolation — next test sees this user. No real constraint checks.
    }
}

// SAFE: Testcontainers Postgres + WebApplicationFactory + per-test transaction rollback
public class UsersApiTests : IAsyncLifetime
{
    private readonly PostgreSqlContainer _pg = new PostgreSqlBuilder()
        .WithImage("postgres:17-alpine")
        .Build();
    private WebApplicationFactory<Program> _app = null!;

    public async Task InitializeAsync()
    {
        await _pg.StartAsync();
        _app = new WebApplicationFactory<Program>().WithWebHostBuilder(b =>
            b.ConfigureServices(s => {
                s.RemoveAll<DbContextOptions<AppDb>>();
                s.AddDbContext<AppDb>(o => o.UseNpgsql(_pg.GetConnectionString()));
            }));
        using var scope = _app.Services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<AppDb>().Database.MigrateAsync();
    }

    public async Task DisposeAsync() { await _app.DisposeAsync(); await _pg.DisposeAsync(); }
    // Amortize container start-up across the assembly by promoting `_pg` into an
    // `ICollectionFixture<PostgresFixture>` once the suite has more than a few classes.

    [Fact]
    public async Task CreateUser_Persists_AndIsRetrievable()
    {
        var client = _app.CreateClient();
        var create = await client.PostAsJsonAsync("/users",
            UserBuilder.New().WithEmail("a@example.test").Build());
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        var id = (await create.Content.ReadFromJsonAsync<UserDto>())!.Id;

        var get = await client.GetFromJsonAsync<UserDto>($"/users/{id}");
        Assert.Equal("a@example.test", get!.Email);
    }
}
```

### 2. Java (21+ — Testcontainers + Spring Boot Test + JUnit 5)

```java
// BAD: H2 in-memory pretending to be Postgres; tests share state via @SpringBootTest singleton
@SpringBootTest
@AutoConfigureMockMvc
class UserApiTest {
    @Autowired MockMvc mvc;

    @Test
    void createUser() throws Exception {
        mvc.perform(post("/users")
                .contentType(APPLICATION_JSON)
                .content("{\"email\":\"a@b.c\"}"))
           .andExpect(status().isCreated());
        // H2 dialect != Postgres. UNIQUE on citext column behaves differently.
        // No rollback declared — next test sees this row.
    }
}

// SAFE: @Testcontainers + real Postgres + @Transactional rollback per test
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
@Transactional   // Spring rolls back at end of each @Test
class UserApiTest {
    @Container
    @ServiceConnection                          // Spring Boot 3.1+ auto-wires URL/user/pwd
    static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:17-alpine");

    @Autowired MockMvc mvc;

    @Test
    void createUser_persistsAndIsRetrievable() throws Exception {
        var req = UserBuilder.aUser().withEmail("a@example.test").asJson();
        var resp = mvc.perform(post("/users").contentType(APPLICATION_JSON).content(req))
                      .andExpect(status().isCreated())
                      .andReturn().getResponse().getContentAsString();
        var id = JsonPath.read(resp, "$.id").toString();

        mvc.perform(get("/users/{id}", id))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.email").value("a@example.test"));
    }
}
```

### 3. Python (3.12+ — pytest + testcontainers-python + httpx ASGI transport)

```python
# BAD: sqlite in-memory; module-scoped client = shared state; no rollback
@pytest.fixture(scope="module")
def client():
    app.dependency_overrides[get_db] = lambda: sqlite_session()  # SQLite != Postgres
    return TestClient(app)

def test_create_user(client):
    r = client.post("/users", json={"email": "a@b.c"})
    assert r.status_code == 201
    # next test sees this user; FK behavior differs from Postgres

# SAFE: Testcontainers Postgres + per-test transaction rollback via SAVEPOINT
import pytest
from httpx import AsyncClient, ASGITransport
from testcontainers.postgres import PostgresContainer
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

@pytest.fixture(scope="session")
def pg():
    with PostgresContainer("postgres:17-alpine") as c:
        yield c

@pytest.fixture(scope="session")
async def engine(pg):
    eng = create_async_engine(pg.get_connection_url().replace("postgresql://", "postgresql+asyncpg://"))
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    await eng.dispose()

@pytest.fixture
async def db(engine):
    """Per-test transaction; rolled back on teardown."""
    async with engine.connect() as conn:
        trans = await conn.begin()
        Session = async_sessionmaker(bind=conn, expire_on_commit=False)
        async with Session() as session:
            yield session
        await trans.rollback()

@pytest.fixture
async def client(app, db):
    app.dependency_overrides[get_db] = lambda: db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c

@pytest.mark.integration
async def test_create_user_persists_and_is_retrievable(client):
    user = UserBuilder().with_email("a@example.test").build()
    create = await client.post("/users", json=user)
    assert create.status_code == 201
    user_id = create.json()["id"]
    get = await client.get(f"/users/{user_id}")
    assert get.json()["email"] == "a@example.test"
```

### 4. C (C17/C23 — minimal HTTP test harness against a real test binary)

C integration testing is realistic only when the unit under test is an HTTP service or library exposing a real protocol. Skip if the target is a pure compute library — unit tests suffice. For an HTTP server, use `libcurl` against a real running test binary on an ephemeral port; for DB code, use `sqlite3` or `libpq` directly with a Testcontainers-managed Postgres.

```c
/* BAD: assert against an "in-memory" fake server in the same process —
 * tests the fake, not your code. */
int test_create_user(void) {
    fake_server_t *fake = fake_server_new();
    assert(fake_post(fake, "/users", "{\"email\":\"a@b.c\"}") == 201);
    return 0;
}

/* SAFE: spawn the real binary on a random port, hit it with libcurl,
 * tear it down per test for isolation. */
#include <curl/curl.h>
#include <unistd.h>
#include <signal.h>

static pid_t spawn_server(int *port) {
    *port = pick_free_port();                /* getsockname() on a bound socket */
    char p[16]; snprintf(p, sizeof p, "%d", *port);
    pid_t pid = fork();
    if (pid == 0) { execl("./build/test-server", "test-server", p, NULL); _exit(127); }
    wait_for_port_ready(*port, /*timeout_ms=*/5000);
    return pid;
}

int test_create_user_persists(void) {
    int port; pid_t pid = spawn_server(&port);
    char url[128]; snprintf(url, sizeof url, "http://127.0.0.1:%d/users", port);

    CURL *c = curl_easy_init();
    long status = 0;
    const char *body = "{\"email\":\"a@example.test\"}";
    curl_easy_setopt(c, CURLOPT_URL, url);
    curl_easy_setopt(c, CURLOPT_POSTFIELDS, body);
    curl_easy_setopt(c, CURLOPT_HTTPHEADER,
        curl_slist_append(NULL, "Content-Type: application/json"));
    curl_easy_perform(c);
    curl_easy_getinfo(c, CURLINFO_RESPONSE_CODE, &status);
    curl_easy_cleanup(c);

    kill(pid, SIGTERM); waitpid(pid, NULL, 0);   /* fresh server next test */
    return status == 201 ? 0 : 1;
}
```

If the target is purely a compute library (no I/O, no socket, no file), there is **no realistic integration test** to write — unit tests cover it fully and adding HTTP harnesses is theatre. Document that decision in the plan.

### 5. C++ (20/23 — GoogleTest + real deps; same patterns hold for Catch2)

```cpp
// BAD: mock the DB connector — you test the mock, not the SQL.
class UserRepoTest : public ::testing::Test {
    MockDb db_;   // returns canned results — never sees real query
};
TEST_F(UserRepoTest, CreateUser) {
    EXPECT_CALL(db_, exec(_)).WillOnce(Return(Rows{{"1", "a@b.c"}}));
    UserRepo r(&db_);
    auto u = r.create("a@b.c");
    EXPECT_EQ(u.id, 1);   // passes whether or not the real SQL works
}

// SAFE: Testcontainers-cpp launches a real Postgres; libpqxx talks to it.
#include <gtest/gtest.h>
#include <pqxx/pqxx>
#include <testcontainers/testcontainers.hpp>

class UserRepoTest : public ::testing::Test {
protected:
    static testcontainers::PostgresContainer pg_;
    pqxx::connection conn_{pg_.connection_string()};

    static void SetUpTestSuite()    { pg_.start(); run_migrations(pg_.connection_string()); }
    static void TearDownTestSuite() { pg_.stop(); }

    void SetUp() override {
        pqxx::work tx(conn_);
        tx.exec0("BEGIN");                       // explicit SAVEPOINT pattern
    }
    void TearDown() override {
        pqxx::work tx(conn_);
        tx.exec0("ROLLBACK");                    // discard everything this test inserted
    }
};
testcontainers::PostgresContainer UserRepoTest::pg_{"postgres:17-alpine"};

TEST_F(UserRepoTest, CreateUser_PersistsAndIsRetrievable) {
    UserRepo repo(&conn_);
    auto u = repo.create(UserBuilder{}.with_email("a@example.test").build());
    auto found = repo.find(u.id);
    ASSERT_TRUE(found.has_value());
    EXPECT_EQ(found->email, "a@example.test");
}
```

### 6. TypeScript (Vitest + Testcontainers + MSW + supertest)

```typescript
// BAD: jest.mock('pg') — you test the mock; supertest hits a stubbed DB.
import { describe, it, expect, vi } from 'vitest';
vi.mock('pg', () => ({
  Pool: vi.fn(() => ({ query: vi.fn().mockResolvedValue({ rows: [{ id: 1 }] }) }))
}));
import request from 'supertest';
import { app } from '../src/app.js';

describe('POST /users (BAD)', () => {
  it('creates user', async () => {
    const res = await request(app).post('/users').send({ email: 'a@b.c' });
    expect(res.status).toBe(201);              // passes even if your SQL is broken
  });
});

// SAFE: Testcontainers Postgres + MSW for outbound third-party + per-test TRUNCATE for isolation.
// (Why TRUNCATE not BEGIN/ROLLBACK on a Pool: separate `Pool` connections see different
// transaction scopes, so wrapping `pool.query('BEGIN')` does NOT isolate requests issued
// via supertest. Choose ONE of: TRUNCATE between tests, a per-test schema, or pass a
// single dedicated client into the app under test.)
import { describe, it, beforeAll, afterAll, afterEach, expect } from 'vitest';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import request from 'supertest';
import pg from 'pg';
import { buildApp } from '../src/app.js';
import { UserBuilder } from './support/user-builder.js';

let pgC: StartedPostgreSqlContainer;
let pool: pg.Pool;
let app: ReturnType<typeof buildApp>;
const mswServer = setupServer(
  http.post('https://billing.test/charges', () => HttpResponse.json({ id: 'ch_1' }))
);

beforeAll(async () => {
  pgC = await new PostgreSqlContainer('postgres:17-alpine').start();
  pool = new pg.Pool({ connectionString: pgC.getConnectionUri() });
  await pool.query('CREATE EXTENSION IF NOT EXISTS citext');
  await pool.query('CREATE TABLE users (id serial primary key, email citext unique not null)');
  app = buildApp({ pool, billingBase: 'https://billing.test' });
  mswServer.listen({ onUnhandledRequest: 'error' });
});

afterAll(async () => { mswServer.close(); await pool.end(); await pgC.stop(); });

afterEach(async () => {
  // TRUNCATE all tables, restart sequences — fast on small test data, fully isolating.
  await pool.query('TRUNCATE TABLE users RESTART IDENTITY CASCADE');
});

describe('POST /users (SAFE)', () => {
  it('persists and is retrievable; unique-email constraint enforced', async () => {
    const body = UserBuilder.new().withEmail('a@example.test').build();
    const created = await request(app).post('/users').send(body).expect(201);
    const got = await request(app).get(`/users/${created.body.id}`).expect(200);
    expect(got.body.email).toBe('a@example.test');

    // boundary: unique constraint
    await request(app).post('/users').send(body).expect(409);
  });
});
```

### 7. SQL (foundational — transaction-rollback fixtures, pgTAP, sqitch test runs)

Integration tests of SQL — stored procedures, triggers, RLS policies, migrations — must run against the **same engine and version** you ship. Two patterns: pgTAP for procedural assertions inside the DB, and sqitch/migra for migration-test reversibility.

```sql
-- BAD: test "passes" because nothing was asserted and the transaction committed.
-- If the trigger silently failed, the test still passes.
BEGIN;
INSERT INTO users(email) VALUES ('a@example.test');
-- (no assertions)
COMMIT;   -- pollutes next test, and we proved nothing.

-- SAFE: pgTAP — assertions inside the DB + ROLLBACK keeps the suite isolated.
BEGIN;
SELECT plan(3);

-- Builder: a helper function as the "test data builder" equivalent
CREATE OR REPLACE FUNCTION test.make_user(p_email text)
RETURNS users LANGUAGE sql AS $$
  INSERT INTO users(email) VALUES (coalesce(p_email, 'u-' || gen_random_uuid() || '@test'))
  RETURNING *;
$$;

-- 1. Trigger sets created_at
SELECT lives_ok($$ SELECT test.make_user('a@example.test') $$, 'insert succeeds');

-- 2. Unique constraint fires
SELECT throws_ok(
  $$ SELECT test.make_user('a@example.test'); SELECT test.make_user('a@example.test'); $$,
  '23505',                                  -- unique_violation
  'duplicate email rejected'
);

-- 3. RLS isolates tenants
SET LOCAL ROLE app_user;
SET LOCAL app.tenant_id = 'tenant-A';
SELECT make_user_in_tenant('x@a.test');
SET LOCAL app.tenant_id = 'tenant-B';
SELECT is(
  (SELECT count(*) FROM users WHERE email = 'x@a.test'),
  0::bigint,
  'tenant-B cannot see tenant-A rows under RLS'
);

SELECT * FROM finish();
ROLLBACK;                                    -- discard everything; next test gets clean DB
```

Run with `pg_prove -d testdb tests/sql/*.sql` and wire pgTAP install into the Testcontainers init script (`CREATE EXTENSION pgtap;`). For migrations, use `sqitch verify` per deploy step so every migration has a rollback path tested in CI.

## Categories of Bad Integration Tests (Detect-And-Flag List)

These are the seven recurring failure modes. Flag any you see in the target codebase.

1. **Shared mutable state across tests** — module-scoped fixtures that hold rows, env vars, or singletons across test runs. Symptom: tests pass alone, fail in suite, or vice versa.
2. **Mocked DB / mocked HTTP client at the dependency boundary** — testing the mock, not the code. Allowed only at the outermost edge (third-party APIs) via MSW/WireMock, never the immediate DB.
3. **No transaction rollback (test order matters)** — if `pytest tests/test_a.py tests/test_b.py` and `pytest tests/test_b.py tests/test_a.py` give different results, isolation is broken.
4. **Test data not isolated by tenant / workspace** — multi-tenant SaaS that doesn't reset tenant scope between tests. Especially dangerous when RLS policies are part of the contract you're verifying.
5. **Slow tests (>10s individually, usually >2s suspicious)** — almost always means: container started per test instead of per suite, or real network call to a third party, or unnecessary `sleep(...)`. Per-test container is correct only when transaction rollback can't isolate (e.g., DDL changes, replication tests).
6. **Missing error scenarios at the boundary** — only the happy path is tested. Constraint violations, FK errors, network timeouts, deadlocks, retries, idempotency keys — the boundary is where bugs live.
7. **Missing concurrency tests for shared resources** — two writers racing on the same row, two consumers of the same message, two workers picking the same job from a queue. Use `asyncio.gather` / `Task.WhenAll` / parallel goroutines / threads to assert the locking contract.

## Tool Integration (2026)

| Tool / library | Languages | What it gives you | When to use |
|---|---|---|---|
| **Testcontainers** | Java, .NET, Python, Go, Node/TS, Rust, Haskell, C++ | Real Docker containers for Postgres, MySQL, Redis, Kafka, RabbitMQ, Elasticsearch, MongoDB, Localstack, etc. | Default for any integration test that touches a DB or broker |
| **TestServer / WebApplicationFactory** | ASP.NET Core | In-process HTTP host; share DI with the real app | API integration tests on .NET |
| **Spring Boot Test slices** | Java/Kotlin | `@SpringBootTest`, `@DataJpaTest`, `@WebMvcTest`, `@ServiceConnection` | Spring apps; auto-wire Testcontainers via `@ServiceConnection` (Spring Boot 3.1+) |
| **pytest-postgresql / pytest-mysql** | Python | Spin up a local DB process via pytest fixtures (alternative to Testcontainers for CI without Docker) | When Docker is not available in CI |
| **mysql-test-runner (mtr)** | SQL (MySQL) | Official MySQL test harness for stored procs and replication | MySQL-heavy projects |
| **pgTAP** | SQL (Postgres) | TAP-style assertions inside the DB | Stored procedures, RLS policies, triggers |
| **Localstack** | All — AWS clients | Local emulation of S3, SQS, SNS, DynamoDB, Lambda, etc. | AWS-dependent code without hitting real AWS |
| **MSW (Mock Service Worker)** | Node/TS, browser | Intercepts outbound HTTP at the network layer | Mock third-party APIs at the boundary |
| **WireMock** | Java + standalone HTTP | HTTP stubs/contracts; record-and-replay | Mock third-party HTTP in JVM stacks |
| **supertest** | Node/TS | HTTP client bound to an in-process server | Express/Fastify/Koa endpoint tests |
| **httpx (ASGI transport)** | Python | In-process async HTTP against FastAPI/Starlette | FastAPI endpoint tests without a real socket |
| **Pact** | All major languages | Consumer-driven contract tests; complements (does not replace) integration | Microservices boundaries |

```bash
# Python — pytest + Testcontainers + parallel-safe
pytest -m integration -n auto --dist loadscope    # one DB schema per worker

# Java — Maven Failsafe with Testcontainers (Surefire = unit; Failsafe = integration)
mvn verify -Pintegration

# .NET — xUnit + Testcontainers, run integration project only
dotnet test ./tests/Integration.Tests --filter "Category=Integration"

# Node/TS — Vitest with Testcontainers; one worker per test file
vitest run --pool=threads --test-timeout=30000 tests/integration

# SQL — pgTAP via pg_prove against a Testcontainers-managed Postgres
pg_prove -d "$(testcontainers pg url)" tests/sql/*.sql
```

## TDD Flow

1. **Red**: write the integration test against the unbuilt endpoint or handler. Run. Confirm failure cause is "not implemented" (404, handler missing, NoSuchTable, etc.) — not "test infra broken."
2. **Green**: implement the endpoint/handler to satisfy the contract.
3. **Refactor**: extract fixtures, share Testcontainers singletons across the suite (not across tests), introduce test data builders for the third repeated INSERT block. Tests stay green.

## Output Format

```markdown
## Integration Tests Written

**Test Files**:
- `tests/integration/test_user_api.py` — 8 tests (3 boundary, 1 concurrency)
- `tests/integration/test_order_flow.py` — 5 tests

**Coverage**:
| Component | Happy | Boundary | Concurrency |
|-----------|-------|----------|-------------|
| User API  | 3     | 4        | 1           |
| Order API | 2     | 2        | 1           |

**Infra**:
- Testcontainers: postgres:17-alpine, redis:7-alpine
- MSW: stubs billing.test, mail.test
- Isolation: per-test transaction rollback (SAVEPOINT inside per-suite container)

**Builders Created**:
- `tests/support/user_builder.py` · `tests/support/order_builder.py`

**Verification**:
- [ ] All tests fail initially against unimplemented endpoint
- [ ] Tests pass in any order (shuffle: `pytest -p random_order`)
- [ ] Suite under 60 s on dev laptop; container start-up amortized across tests
- [ ] Boundary tests cover: 409 conflict, 400 validation, 401 auth, 5xx retries
- [ ] Parallel runs isolated: `pytest -n auto` green twice in a row
```

## Severity (internal triage vs. refinement-loop output)

These tiers are the **internal triage view** used when this skill produces a human-readable integration-test report. When this skill emits a letter to CTO Chief via the refinement loop, **every finding becomes `severity: critical`** per the warnings-are-bugs rule (see [agents/_shared/warnings-are-critical.md](../../../agents/_shared/warnings-are-critical.md)) — there is no soft tier on the wire. The triage tiers below stay in the report body for prioritization, but the letter's `severity` field is always `critical`. Reconciliation: triage CRITICAL/HIGH/MEDIUM/LOW all collapse to wire `severity: critical`; the distinction survives via the `confidence` and `kind` fields, which the integrator weights when ordering fixes.

| Triage tier | Examples | Internal action recommendation |
|-------|----------|--------|
| CRITICAL | DB mocked at the integration boundary; tests pass when SQL is provably broken; no rollback so test order changes outcome; concurrent-write race condition untested on shared resource | BLOCK |
| HIGH | In-memory DB pretending to be Postgres (H2 / SQLite-for-MySQL); module-scoped client shared across tests with mutable state; missing boundary tests (only happy path) | BLOCK |
| MEDIUM | Slow tests (>10s) due to per-test container start; missing concurrency test on shared resource that has no current contention bug; raw INSERT fixtures instead of builders | Fix soon |
| LOW | Builder pattern absent but tests are short and clear; suite ordering not randomized but currently passes; missing one of several error-boundary cases | Backlog |

## Letter schema (refinement-loop output contract)

When emitting an integration-test finding via the refinement loop, write the letter with these fields:

```yaml
finding_id: <sha256(critic+file+line+kind)[:12]>    # fingerprint for dedup
severity: critical                                   # ALWAYS critical (warnings-are-bugs)
confidence: high | medium | low                      # high = reproduced; low = single-read inference
engine: integration-test-writer | testcontainers | pytest | xunit | junit | vitest | pgtap | manual
kind: missing_test | mocked_boundary | no_isolation | shared_state | missing_error_path |
      missing_concurrency_test | in_memory_db_substitute | slow_test | builder_absent |
      contract_drift | parallel_unsafe
target_file: tests/integration/test_user_api.py
line: 42                                             # nearest meaningful anchor
suggested_test_skeleton: |                           # ready-to-paste test stub
  @pytest.mark.integration
  async def test_user_create_rejects_duplicate_email(client, db):
      user = UserBuilder().with_email("dup@example.test").build()
      first  = await client.post("/users", json=user)
      assert first.status_code == 201
      second = await client.post("/users", json=user)
      assert second.status_code == 409
      assert "email" in second.json()["detail"]
message: "Missing boundary test: duplicate-email constraint not asserted at API layer"
fix: "Add 409 conflict test; use UserBuilder; wrap in per-test transaction rollback"
reference: "docs/IRON_LOOP.md#step-8-test"
```

The integrator uses `confidence` and `kind` to weight findings. `kind: mocked_boundary` and `kind: no_isolation` are always reproducible on a re-read, so they should ship at `confidence: high`. `kind: missing_concurrency_test` is `confidence: medium` unless an observed race in production motivates it.

## Red Lines

- Never mock the database at the integration boundary — use a real Testcontainers DB.
- Never use in-memory substitutes (H2 for Postgres, SQLite for MySQL) at the integration layer.
- Never share mutable state between tests — per-test rollback or per-test container.
- Never silently skip when services are unavailable — fail loudly with "missing TESTCONTAINERS_HOST" or "Docker not running."
- Never assert internals (private functions, internal events) — test the externally observable contract.
- Never write a test that passes when the SQL is broken (the mocked-cursor anti-pattern).
- Never use raw INSERT fixture blobs — use builders so the schema can evolve.

---

## Refinement Loop — critic mode (v6.9.15)

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md):

- Every missing integration test, mocked DB at the boundary, isolation failure, missing error-path test, or contract drift you find emits as `severity: critical` in the letter you write to CTO Chief.
- The [letter schema](../../../.ctoc/architecture/refinement-loop-schema.json) rejects `warn` — there is no soft tier.
- Findings block phase advancement (critical → medium) until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section.

The principle: an integration test that passes against a mocked DB or an in-memory substitute is a known latent failure — it ships green while the real query path is unverified. A warning today is a customer-visible bug after the next schema change or version upgrade.
