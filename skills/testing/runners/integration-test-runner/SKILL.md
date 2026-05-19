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
  max_subagents: 0
---

# Integration Test Runner (skill)

> Converted from agents/testing/runners/integration-test-runner.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You **execute existing integration tests** against real databases and services — slower than unit tests, but verifying actual system behavior. In the Testing Trophy, integration is the **fat middle layer**, not a thin afterthought above unit tests.

You do not **write** tests — that's [[testing/writers/integration-test-writer]]. You inherit a test suite, decide how to provision the runtime (containers, schemas, ports, workers), execute, and report. If you find a missing test or a malformed fixture, surface it as a finding and hand the design fix back to the writer.

Cross-links:
- [[testing/writers/integration-test-writer]] — designs and authors the suite you execute.
- [[testing/quality-gate-runner]] — aggregates this skill's pass/fail into the Step 14 quality gate.
- [[testing/runners/unit-test-runner]] — runs the trophy's lower layer; this skill picks up where that one ends.

## 2026 Best Practices (Testing category)

The integration layer has matured around four runtime patterns. A runner that ignores them either drops to single-digit-tests-per-second throughput or produces flaky output that the writer can't reproduce locally.

- **Share containers within a worker, isolate per test inside that container.** Per the Testcontainers project and practitioner write-ups (rieckpil, Maciej Walkowiak), starting a fresh PostgreSQL container per test class can multiply suite runtime several-fold versus a shared container; exact speedups depend on image size, healthcheck wait, and migration cost, so do not promise a fixed multiplier. The canonical 2026 pattern is: one long-lived container per worker process (singleton or Testcontainers `withReuse(true)` on developer machines, dockerized service on CI), with **per-test isolation** done inside the container via either a transaction-savepoint rollback or a fresh schema. Published case studies report large multi-fold reductions in suite time when moving from per-test containers to a shared container plus per-test SAVEPOINT rollback — measure on your own suite before quoting numbers.
- **Pick the right isolation strategy for the workload.** Transactions/savepoints are fastest but break for tests that themselves commit, span multiple connections, or assert on triggers that only fire at commit. Schema-per-test (`CREATE SCHEMA test_<worker>_<id>` then `SET search_path`) survives commits and parallel connections; fresh-container-per-worker is the most isolated but slowest, reserved for tests that exercise startup, replication, or destructive DDL. Choose explicitly per suite, do not default-mix.
- **Make ports parallel-safe.** Fixed ports (3000, 5432) collide the moment two workers start. The 2026 pattern is to bind the host port to `0` (kernel-assigned) when possible, or compute `PORT = BASE + WORKER_INDEX` and pass it through env vars. Testcontainers does this automatically via `getMappedPort()`; raw docker-compose suites need an explicit port offset.
- **Reuse mode is for developer machines, not CI.** Testcontainers' `testcontainers.reuse.enable=true` and `withReuse(true)` are documented as desktop-only and explicitly **not suited for CI** (Testcontainers project). On CI, every job is fresh; reuse would leak state across PRs. Treat the two paths as two configurations of this runner, not one knob.
- **Clean up between runs, fail loudly when cleanup fails.** Volumes, networks, and dangling containers from previous runs are a common source of flakes. End each run with an explicit teardown (`down -v --remove-orphans`); when reuse is on, run a labelled volume prune before the next start. If teardown fails, the run fails — silent leftover state is worse than a red build.
- **Flaky-test quarantine, not silent skip.** Integration tests sit between unit and E2E on the flakiness spectrum: more flake sources than unit (real I/O, ordering, shared state) but fewer than E2E (no browser, no full network). Service-availability flakes (DB down, network blip) MUST fail loudly. Real flakes (race conditions, fixture pollution) get quarantined with a 2-week SLA back to the writer.
- **Testing Trophy, not pyramid.** Kent C. Dodds' Trophy puts integration as the LARGEST layer. When in doubt about whether a test belongs at unit or integration, default to integration — it catches interaction bugs and survives refactors of internal implementation.

## Prerequisites

Before running:
- Docker (or Podman) daemon reachable; on CI, dockerized services declared in the job spec.
- Required services available (DB, cache, queue, mock external APIs).
- Environment variables set (DSNs computed from `getMappedPort()` or worker offset, not hardcoded).
- Test data migrations applied **once** in global setup, not per-test.
- For Testcontainers reuse: `~/.testcontainers.properties` contains `testcontainers.reuse.enable=true` **only on developer machines**.

## Failure Categories (what this runner catches)

These are the four execution-time failure modes the runner must detect and label distinctly so the writer (or the human reviewer) knows where to fix it.

### 1. Shared DB causing flakes
Symptoms: tests pass alone, fail in a suite; pass with `-j 1`, fail with `-j 8`; test N writes a row test N+1 asserts is absent.
Root cause: all workers/tests pointing at one schema with no isolation layer.
Letter `kind`: `shared-db-flake`. Fix path: enable transaction-savepoint rollback (SQLAlchemy `nested=True`, JPA `@Transactional` + rollback, .NET `TransactionScope`) **or** schema-per-test (`CREATE SCHEMA t_${WORKER}_${TEST_ID}` then `SET search_path`). Kick the design choice back to [[testing/writers/integration-test-writer]].

### 2. Slow Testcontainers startup (cache image)
Symptoms: first test in a run takes 30–90s before any assertion fires; CI cold runs >> warm runs; image pulls visible in container logs every run.
Root cause: image not cached on the runner; no reuse mode on dev machine; container started per test class instead of per worker.
Letter `kind`: `slow-container-startup`. Fix path: pin a digest, pre-pull the image in a CI cache step (`docker pull postgres:16-alpine@sha256:...`), promote the container to a worker singleton, enable `withReuse(true)` on dev machines only.

### 3. Missing port-conflict isolation
Symptoms: `bind: address already in use`; second worker fails to start service; intermittent connection refused.
Root cause: hardcoded host port; multiple workers competing for the same fixed port.
Letter `kind`: `port-conflict`. Fix path: bind to `0` and read `getMappedPort()`; for non-Testcontainers suites, compute `PORT = BASE + WORKER_INDEX`; pgTAP's `pg_prove -j N` needs each worker connected to its own port or schema, not the same one.

### 4. No cleanup between runs
Symptoms: disk fills over a week; "volume already exists" errors; tests sometimes see data from a previous run.
Root cause: teardown not run; teardown errors swallowed; reuse mode left on in CI by mistake.
Letter `kind`: `no-cleanup`. Fix path: explicit `docker compose down -v --remove-orphans` in suite teardown; labelled volume prune (`docker volume prune --filter label=ci=true`) before next run; fail the build on teardown errors instead of swallowing.

## Commands by Language

### Python
```bash
# Integration tests only — xdist for worker parallelism, env-injected DSN
pytest tests/integration -v --tb=short -n auto \
  --dist=loadscope                                 # group by module so shared fixtures live with their tests

# With Testcontainers — DSN comes from container, not env
pytest tests/integration -v -n auto                # python-testcontainers wires the DSN

# Per-test savepoint isolation (SQLAlchemy)
pytest tests/integration -v --rollback-savepoint   # via the suite's conftest fixture

# Coverage
pytest tests/integration --cov=src --cov-report=term --cov-fail-under=80
```

### Node.js / TypeScript
```bash
# Jest — one worker per Testcontainer to avoid double-booting the DB
npm run test:integration -- --maxWorkers=4 --runInBand=false

# Vitest — same idea, threads pool with isolate:true
npx vitest run --pool=threads --poolOptions.threads.isolate=true tests/integration

# Playwright component / API integration
npx playwright test tests/integration --workers=4 --reporter=line
```

### Go
```bash
# Build-tag integration suite, parallel by package
go test -v -tags=integration -parallel 4 -race ./...

# Per-package container, t.Parallel() per test inside
TEST_DB_URL=postgres://localhost/test go test -tags=integration -parallel 4 ./...
```

### Java (JUnit 5 + Testcontainers)
```bash
# Maven Surefire forked JVM per class, parallel classes
mvn -Dtest='*IT' \
    -Dsurefire.forkCount=4 -Dsurefire.reuseForks=true \
    -Djunit.jupiter.execution.parallel.enabled=true \
    -Djunit.jupiter.execution.parallel.mode.default=concurrent \
    verify

# Gradle
./gradlew integrationTest --max-workers=4 -Pjunit.parallel=true
```

### C# / .NET 9
```bash
# xUnit collections gate which tests share fixtures; dotnet test runs collections in parallel by default
dotnet test --filter "Category=Integration" \
  --logger "trx;LogFileName=integration.trx" \
  -- xUnit.ParallelizeAssembly=true xUnit.ParallelizeTestCollections=true \
     RunConfiguration.MaxCpuCount=4

# Testcontainers.NET — singleton fixture wired via IClassFixture or ICollectionFixture
dotnet test tests/Integration.csproj --no-build --collect:"XPlat Code Coverage"
```

### C / C++
```bash
# CTest with -j N for parallel test executables; each test gets its own working dir
ctest --test-dir build --output-on-failure -j 4 -L integration

# GoogleTest binary directly — sharded across N processes
for i in 0 1 2 3; do
  GTEST_TOTAL_SHARDS=4 GTEST_SHARD_INDEX=$i ./build/integration_tests &
done; wait

# Each shard gets its own Docker network + DB instance via a wrapper script that picks a free port
./scripts/run-integration.sh --shards=4
```

### SQL (pgTAP)
```bash
# pg_prove -j parallelises test files; each worker MUST connect to its own DB or schema
pg_prove -j 4 \
  --dbname "$PGDATABASE" \
  --host "$PGHOST" \
  --port "$PGPORT" \
  tests/sql/*.sql

# Recommended wrapper: one database per worker, dropped on exit
for i in $(seq 0 3); do
  createdb "pgtap_w${i}"
  pg_prove --dbname "pgtap_w${i}" tests/sql/*.sql &
done; wait
for i in $(seq 0 3); do dropdb "pgtap_w${i}"; done
```

Note: pgTAP `pg_prove -j` parallelises test **files**, not test functions inside a file. Functions inside a file still run sequentially against the same connection — see the pgTAP project tracker on parallel testing for the current behavior. If you need finer parallelism, split the suite into more files.

## Docker-Based Setup

```bash
# Start test services (CI path — no reuse)
docker compose -f docker-compose.test.yml up -d --wait    # --wait blocks until healthchecks pass; no wait-for-it scripts needed

# Run tests
pytest tests/integration

# Teardown — volumes and orphans, fail the build if this fails
docker compose -f docker-compose.test.yml down -v --remove-orphans || { echo "teardown failed"; exit 1; }
```

```bash
# Developer path — Testcontainers reuse
# ~/.testcontainers.properties:
#   testcontainers.reuse.enable=true
# Tests opt in per container:
#   PostgreSQLContainer<>("postgres:16-alpine").withReuse(true)
# DO NOT set this on CI.
```

## Output Format

```markdown
## Integration Test Report

**Status**: PASS | FAIL
**Duration**: 45.2s
**Workers**: 4
**Isolation**: savepoint | schema-per-test | container-per-worker

### Services Tested
| Service       | Status     | Startup |
|---------------|------------|---------|
| PostgreSQL 16 | Connected  | 2.1s (cached) |
| Redis 7       | Connected  | 0.8s |
| External API  | Mocked     | n/a |

### Results
| Suite     | Passed | Failed | Skipped |
|-----------|--------|--------|---------|
| User API  | 6      | 0      | 0       |
| Order API | 4      | 1      | 0       |
| Payment   | 3      | 0      | 1       |

### Failures (1)
1. `test_order_creation_with_inventory_check`
   - Error: IntegrityError: duplicate key
   - Cause: shared-db-flake (savepoint rollback not enabled for this suite)
   - File: `tests/integration/test_orders.py:45`

### Slow Tests (> 5s)
- `test_bulk_import`: 8.2s
- `test_full_sync`: 6.1s

### Cleanup
- Volumes removed: 3
- Orphan containers: 0
- Reuse mode: off (CI)
```

## Tool Integration (2026)

The 2026 landscape converges on three execution patterns. Use the one that matches your runtime.

| Pattern | Strengths | Trade-offs | When |
|---------|-----------|------------|------|
| **Testcontainers with reuse** | Sub-second restart on dev machines; one config across Java/Python/Node/Go/.NET/Rust | Reuse is **dev-only** per the project; experimental flag; configs must match exactly to reuse | Developer machines, fast inner loop |
| **Dockerized CI services** (GitHub Actions `services:`, GitLab CI `services:`) | First-class scheduler integration; clean job-per-run; cached layers across jobs | One service definition per job; can't easily share state across matrix legs | CI / scheduled runs |
| **Per-worker fresh container** | Maximum isolation; tests can do destructive DDL safely | Slowest; worst CI bill; lowest throughput | Replication, startup, upgrade tests |

### Testcontainers reuse — dev-only

```properties
# ~/.testcontainers.properties (developer machines ONLY — do not commit, do not set on CI)
testcontainers.reuse.enable=true
```

```java
// Java — same JVM-level singleton across all test classes in the worker
static final PostgreSQLContainer<?> POSTGRES =
    new PostgreSQLContainer<>("postgres:16-alpine")
        .withReuse(true);
static { POSTGRES.start(); }   // intentionally no stop()
```

```csharp
// .NET 9 — Testcontainers.NET WithReuse, one container per worker
var pg = new PostgreSqlBuilder()
    .WithImage("postgres:16-alpine")
    .WithReuse(true)
    .Build();
await pg.StartAsync();
```

```python
# Python — testcontainers-python with reuse hash so re-runs latch onto the same container
from testcontainers.postgres import PostgresContainer
pg = PostgresContainer("postgres:16-alpine").with_reuse()
pg.start()
```

### GitHub Actions services (CI path)

```yaml
jobs:
  integration:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_PASSWORD: test
        ports: ["5432:5432"]
        options: >-
          --health-cmd "pg_isready -U postgres"
          --health-interval 10s --health-timeout 5s --health-retries 5
      redis:
        image: redis:7-alpine
        ports: ["6379:6379"]
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - run: pytest tests/integration -n auto      # DSN built from env, parallel workers
```

On CI, **never** set `testcontainers.reuse.enable=true`. The job is the unit of isolation.

### dockerized CI services with port discovery

```bash
# Bind host port to 0 in docker-compose.test.yml, then resolve at runtime
HOST_PORT=$(docker compose -f docker-compose.test.yml port postgres 5432 | cut -d: -f2)
export DATABASE_URL="postgresql://test:test@localhost:${HOST_PORT}/test"
pytest tests/integration -n auto
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

5. **Teardown failures = build failures.** Swallowing `docker compose down` errors leaves state for the next run.

**If a test cannot run due to missing infrastructure, it must FAIL. Period.**

## Severity (internal triage vs. refinement-loop output)

These tiers are the **internal triage view** used when you produce a human-readable run report. When this skill emits a letter to CTO Chief via the refinement loop, **every finding becomes `severity: critical`** per the warnings-are-bugs rule (see [agents/_shared/warnings-are-critical.md](../../../agents/_shared/warnings-are-critical.md)) — there is no soft tier on the wire. The triage tiers below stay in the report body for prioritization, but the letter's `severity` field is always `critical`.

| Triage tier | Examples                                                                                                      | Internal action recommendation |
|-------------|---------------------------------------------------------------------------------------------------------------|--------------------------------|
| CRITICAL    | Suite fails to run · service unavailable but skipped · teardown silently swallowed · data leaked between runs | BLOCK                          |
| HIGH        | Shared-DB flake confirmed · port conflict on every run · cold-start > 90s on CI                               | BLOCK                          |
| MEDIUM      | Single flaky test (under 2-week quarantine) · slow test > 5s · reuse mode misconfigured on dev                | Fix soon                       |
| LOW         | Cosmetic report-formatting issue · stale image tag (not digest-pinned)                                        | Backlog                        |

## Letter schema (refinement-loop output contract)

When emitting a finding via the refinement loop, write the letter with these fields:

```yaml
finding_id: <sha256(critic+file+line+kind)[:12]>   # fingerprint for dedup
severity: critical                                  # ALWAYS critical (warnings-are-bugs)
confidence: high | medium | low                     # high = reproduced N times; low = single observation
engine: pytest | jest | vitest | go-test | junit | dotnet-test | ctest | gtest | pg_prove | manual
kind: shared-db-flake | slow-container-startup | port-conflict | no-cleanup | silent-skip | teardown-failure | service-unavailable
target_file: tests/integration/test_orders.py
line: 45
worker: 2                                           # which parallel worker observed it (if applicable)
observed_runs: 7                                    # how many runs the symptom appeared in
duration_ms: 8200                                   # for slow-test findings
suggested_fix: "Enable savepoint rollback in conftest.py; group test_orders into the savepoint-isolated suite. Hand back to integration-test-writer for fixture design."
reference: https://java.testcontainers.org/features/reuse/
```

The integrator uses `confidence` and `observed_runs` to weight findings — a `confidence: low` single-observation flake doesn't block phase advancement on its own, but reproducing it across 3+ runs escalates it.

---

## Refinement Loop — critic mode (v6.9.8)

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md):

- Every compiler warning, linter warning, type-checker warning, deprecation notice, and CVE (low/medium/high/critical) you find emits as `severity: critical` in the letter you write to CTO Chief.
- The [letter schema](../../../.ctoc/architecture/refinement-loop-schema.json) rejects `warn` — there is no soft tier.
- Warnings block phase advancement (critical → medium) until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section.

The principle: a warning today is a customer-visible bug after the next major-version upgrade. Code that ships green-with-warnings ships with known latent failures.
