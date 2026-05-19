---
name: unit-test-runner
description: Executes unit tests and reports results + coverage — Step 14 VERIFY quality gate.
when_to_load:
  - "run unit test"
  - "run unit tests"
  - "unit test run"
  - "run tests"
  - "execute tests"
  - "test suite"
  - "jest run"
  - "pytest run"
related_skills:
  - testing/writers/unit-test-writer
  - testing/coverage-enforcer
  - testing/quality-gate-runner
  - testing/smart-test-runner
effort_level: medium
model_optimized_for: opus-4-7
tools: Bash, Read
model: sonnet
tier: 2
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: false
effort_budget:
  max_subagents: 0
---

# Unit Test Runner (skill)

> Converted from agents/testing/runners/unit-test-runner.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You **run the existing unit test suite** and report results + coverage. You do **not write tests** — authoring belongs to [[testing/writers/unit-test-writer]]. You execute, observe, and report. If a test is missing, shallow, or assertion-less, emit a finding referencing the writer skill — never author the missing test in this skill, never silently expand scope. This skill is the executor inside Step 14 (VERIFY) — the quality gate that must pass before documentation and final review.

## 2026 Best Practices (Testing category)

The testing landscape in 2026 has converged on a small set of non-negotiable execution patterns. A runner that ignores them either runs too slowly to be used pre-commit or fails silently in CI.

- **Parallel-by-default with worker count = CPU cores.** Vitest, Jest (`--maxWorkers=N`), and pytest-xdist (`pytest -n auto`) all default to or accept "one worker per logical core" today. The exception is local dev with `--watch`, where one fewer worker leaves headroom for the editor. For CI on 32 cores split into 4 shards, the canonical formula is 7 worker threads per shard (`(1 + 7) * 4 = 32` accounting for the orchestrator thread per shard).
- **Deterministic ordering for reproducibility.** Random order finds order-coupled bugs; deterministic order is needed to reproduce a CI failure locally. The pattern: randomize by default with a `--seed`, log the seed in the report header, and accept `--seed=<n>` to replay. Vitest `sequence.seed`, Jest `--randomize` + `--seed`, pytest-randomly, JUnit `junit.jupiter.execution.order.random.seed` — all support this. Never run unseeded random.
- **Per-worker process isolation for true parallel safety.** Threaded workers share heap and global state; module-level caches and singletons corrupt parallel runs. Use process-pool workers (Vitest `pool: 'forks'`, Jest's default child processes, pytest-xdist `--dist=loadfile`) unless you have measured that the suite is leaf-pure. Setting `--no-isolate` speeds Vitest up but only if you've audited every test file for shared state — opt-in, never default.
- **File-watching for fast local feedback.** `vitest`, `jest --watch`, `pytest-watch`, `cargo watch -x test`, `dotnet watch test` give sub-second feedback on the affected slice via test-graph awareness. The runner should detect a TTY and propose watch mode; in CI it must explicitly disable watch.
- **CI uses sharding, not "run everything on one big box".** GitHub Actions matrix with `SHARD`/`TOTAL_SHARDS` env vars; balance by historical execution time, not test count — equal time per shard is the goal. Bazel `shard_count`, Nx Cloud Atomizer, Turborepo task-splitting, and GitHub matrix all solve this; pick one and persist a timing CSV in the repo so the next run is balanced.
- **Fail-fast on first failure for PR feedback.** PR scans want short signal: `--bail=1` (Jest/Vitest), `pytest -x`, `cargo test --no-fail-fast=false`, `dotnet test --blame --no-restore -- --stopOnFailure=true`. Scheduled / pre-release runs do the opposite — full sweep with `--no-bail` to surface every flake at once.
- **Test result caching by content hash.** Nx, Turborepo, Bazel, and Vitest's experimental `--changed` use the source + dep graph to skip tests whose inputs have not changed since the last green run. The runner must honor cache hits explicitly: report `cached: true` per file, never silently pretend the test ran.
- **Runner choice (2026 landscape).** Vitest is the default for Vite/Next/Astro stacks; Jest remains for legacy CRA/Webpack. Pytest dominates Python with xdist for parallel and pytest-randomly for ordering. JUnit Platform Console Launcher (JUnit 5/6) replaces the older `runner` API — Gradle `test { useJUnitPlatform() }` and Maven Surefire `<useJUnitPlatform>` are the wire format; `maxParallelForks` controls process-level parallelism on top. For C# / .NET 9, `dotnet test` invokes VSTest by default but `Microsoft.Testing.Platform` (the new MTP runner) is GA for .NET 9 with native parallel execution. For C/C++, CTest's `--parallel N` and `ctest -j N` are the two equivalent flags. For SQL, `pg_prove --jobs N` runs pgTAP files in parallel processes against separate test databases.

## Test Commands by Language (7-language coverage)

### TypeScript / JavaScript (Vitest + Jest)

```ts
// BAD: defaults that hurt — single worker, no seed, no coverage, no reporter discipline
// package.json
{ "scripts": { "test": "vitest run" } }
```

```ts
// SAFE: parallel forks, seeded, coverage gate, sharded in CI, fail-fast on PR
// vitest.config.ts
export default defineConfig({
  test: {
    pool: 'forks',                          // process isolation; per-worker safety
    poolOptions: { forks: { singleFork: false } },
    fileParallelism: true,
    sequence: { shuffle: true, seed: Number(process.env.TEST_SEED ?? Date.now()) },
    isolate: true,                          // never disable without audit
    reporters: process.env.CI ? ['default','junit','json'] : ['default'],
    coverage: {
      provider: 'v8',
      reporter: ['text','lcov','json-summary'],
      thresholds: { lines: 80, branches: 70, functions: 80, statements: 80 },
    },
  },
});

# CLI
vitest run --pool=forks --reporter=default --reporter=junit \
           --shard=$SHARD/$TOTAL_SHARDS \
           --bail=$([[ "$EVENT" = pull_request ]] && echo 1 || echo 0)

# Jest equivalent
jest --maxWorkers=$(nproc) --randomize --seed=${TEST_SEED} \
     --shard=$SHARD/$TOTAL_SHARDS --ci --reporters=default --reporters=jest-junit
```

### Python (pytest + pytest-xdist + pytest-randomly)

```bash
# BAD: serial, no seed, no coverage
pytest

# SAFE: parallel by core, seeded, coverage, fail-fast on PR
pytest -n auto --dist=loadfile \
       -p randomly --randomly-seed=${TEST_SEED:-last} \
       --cov=src --cov-report=term-missing --cov-report=xml \
       --cov-fail-under=80 \
       $( [[ "$EVENT" = pull_request ]] && echo "-x --maxfail=1" )

# Sharded across CI nodes — use pytest-split
pytest --splits $TOTAL_SHARDS --group $SHARD --durations-path .test-durations
```

### Go

```bash
# BAD: serial, no race detector, no coverage
go test ./...

# SAFE: parallel packages (default), parallel tests within package, race detector, coverage
go test -race -shuffle=on -count=1 \
        -parallel=$(nproc) \
        -coverprofile=coverage.out -covermode=atomic ./...
go tool cover -func=coverage.out | tail -1   # totals
```

### Rust

```bash
# BAD: stdout captured + serial-by-default for integration tests
cargo test

# SAFE: nextest is the 2026 default — parallel by core, deterministic retry on flake,
# JUnit XML + JSON reporters, --partition for sharding
cargo nextest run --test-threads=$(nproc) \
                  --partition count:$SHARD/$TOTAL_SHARDS \
                  --retries 0 \
                  --failure-output immediate-final \
                  $([[ "$EVENT" = pull_request ]] || echo "--no-fail-fast")
# coverage via cargo-llvm-cov
cargo llvm-cov nextest --lcov --output-path lcov.info --fail-under-lines 80
```

### C# / .NET 9

```bash
# BAD: default dotnet test — no parallel collection assembly, no logger discipline,
# warnings ignored, no coverage threshold
dotnet test

# SAFE: parallel assemblies + parallel collections, deterministic order via seed,
# trx + cobertura + warnings-as-errors, sharded via --filter or VSTest /TestCaseFilter
dotnet test --configuration Release \
            --logger "trx;LogFileName=test.trx" \
            --logger "console;verbosity=minimal" \
            --collect:"XPlat Code Coverage" \
            --results-directory ./TestResults \
            -- RunConfiguration.MaxCpuCount=0 \
               RunConfiguration.DisableParallelization=false \
               RunConfiguration.TreatNoTestsAsError=true \
               xUnit.ParallelizeAssembly=true \
               xUnit.ParallelizeTestCollections=true
# .NET 9 Microsoft.Testing.Platform (MTP) — opt-in via project property
# <UseMicrosoftTestingPlatformRunner>true</UseMicrosoftTestingPlatformRunner>
# then:
dotnet run --project tests/MyApp.Tests -- --parallel --report-trx --coverage

# vstest.console direct invocation for sharding fan-out
vstest.console.exe MyApp.Tests.dll \
   /Parallel /InIsolation \
   /TestCaseFilter:"FullyQualifiedName~Shard${SHARD}" \
   /Logger:trx /Logger:console;verbosity=minimal
```

### Java (Gradle + Maven Surefire + JUnit Platform Console Launcher)

```groovy
// BAD (build.gradle): no JUnit Platform, no parallel forks, defaults
test { }

// SAFE: JUnit 5/6 platform, process-level parallelism via forks, in-JVM parallelism
// via junit.jupiter.execution.parallel, deterministic seed, JaCoCo coverage
test {
    useJUnitPlatform()
    maxParallelForks = Runtime.runtime.availableProcessors().intdiv(2) ?: 1
    forkEvery = 100
    systemProperties = [
        'junit.jupiter.execution.parallel.enabled'            : 'true',
        'junit.jupiter.execution.parallel.mode.default'       : 'concurrent',
        'junit.jupiter.execution.parallel.mode.classes.default': 'concurrent',
        'junit.jupiter.execution.order.random.seed'           : (System.getenv('TEST_SEED') ?: '12345'),
    ]
    failFast = (System.getenv('EVENT') == 'pull_request')
    reports.junitXml.required = true
    reports.html.required     = true
    finalizedBy jacocoTestReport
}
```

```xml
<!-- Maven Surefire: parallel + JUnit Platform -->
<plugin>
  <artifactId>maven-surefire-plugin</artifactId>
  <configuration>
    <parallel>classesAndMethods</parallel>
    <threadCount>${env.NPROC}</threadCount>
    <forkCount>1C</forkCount>            <!-- one fork per core -->
    <reuseForks>false</reuseForks>       <!-- process isolation -->
    <runOrder>random</runOrder>
    <runOrderRandomSeed>${env.TEST_SEED}</runOrderRandomSeed>
  </configuration>
</plugin>
```

```bash
# JUnit Platform Console Launcher — direct invocation, useful for shards
java -jar junit-platform-console-standalone.jar execute \
     --scan-classpath \
     --config junit.jupiter.execution.parallel.enabled=true \
     --config junit.jupiter.execution.parallel.config.fixed.parallelism=$(nproc) \
     --include-tag "shard-${SHARD}" \
     --reports-dir ./build/test-results/junit
```

### C (CMake CTest + Unity)

```cmake
# BAD: tests registered but no parallel hint, no timeout, no output capture
add_test(NAME unit_math COMMAND test_math)

# SAFE: parallel CTest, per-test timeout, deterministic via fixture ordering,
# Unity runner generates one binary per test file for shard-ability
enable_testing()
add_test(NAME unit_math COMMAND test_math)
set_tests_properties(unit_math PROPERTIES
    TIMEOUT 30
    LABELS  "unit;shard-1"
    PROCESSORS 1)
```

```bash
# BAD
ctest

# SAFE: parallel by core, JUnit-XML output, shard by label, fail-fast on PR
ctest --parallel $(nproc) \
      --output-on-failure \
      --output-junit ctest-junit.xml \
      --schedule-random \
      --label-regex "shard-${SHARD}" \
      $( [[ "$EVENT" = pull_request ]] && echo "--stop-on-failure" )
# coverage via gcov + lcov
lcov --capture --directory . --output-file coverage.info
```

### C++ (CTest + GoogleTest)

```cmake
# BAD: one giant test binary, no GTest discovery, no parallel
add_executable(all_tests ${SOURCES})
add_test(NAME all COMMAND all_tests)

# SAFE: gtest_discover_tests registers each TEST() as a CTest entry — enables
# per-test parallelism, sharding by GTest filter, accurate timing
include(GoogleTest)
add_executable(unit_tests ${SOURCES})
target_link_libraries(unit_tests PRIVATE GTest::gtest_main GTest::gmock)
gtest_discover_tests(unit_tests
    PROPERTIES TIMEOUT 30 LABELS "unit"
    DISCOVERY_MODE PRE_TEST)
```

```bash
# SAFE: GTest also supports native sharding via env vars (no CTest needed)
GTEST_TOTAL_SHARDS=$TOTAL_SHARDS GTEST_SHARD_INDEX=$SHARD \
GTEST_SHUFFLE=1 GTEST_RANDOM_SEED=${TEST_SEED:-0} \
./unit_tests --gtest_output=xml:gtest.xml --gtest_brief=1

# or via CTest
ctest --parallel $(nproc) --output-junit ctest.xml --schedule-random
```

### SQL (pgTAP + pg_prove)

```sql
-- BAD: tests baked into application schema, no isolation, no parallel-safe naming
BEGIN;
SELECT plan(3);
SELECT has_table('users');
SELECT ok(count(*) > 0, 'users present') FROM users;
SELECT * FROM finish();
ROLLBACK;
```

```sql
-- SAFE: each test file gets its own temp schema; transactional rollback per test
-- file; pg_prove --jobs runs files in parallel against separate connections.
-- Schema names use the backend PID to stay unique across parallel workers.
BEGIN;
SELECT format('test_%s', pg_backend_pid()) AS schema_name \gset
EXECUTE format('CREATE SCHEMA %I', :'schema_name');
EXECUTE format('SET search_path = %I, public', :'schema_name');
SELECT plan(3);
-- ... fixtures + assertions ...
SELECT * FROM finish();
ROLLBACK;
```

```bash
# BAD: serial
pg_prove tests/

# SAFE: parallel by core, JUnit harness, deterministic order via filename sort,
# fail-fast on PR
pg_prove --jobs $(nproc) \
         --harness TAP::Harness::JUnit \
         --recurse tests/ \
         $( [[ "$EVENT" = pull_request ]] && echo "--failures" )
```

## What to Report

1. **Test results**: total / passed / failed / skipped / cached + failure details with stack traces and the seed used.
2. **Coverage**: line %, branch %, function %, uncovered files/functions, delta vs. last green.
3. **Performance**: total wall-clock, per-shard wall-clock, slowest 10 tests, files that timed out.
4. **Flake signal**: any test that passed on retry — appended to `.ctoc/quality-state/flaky-tests.json`.
5. **Cache hit rate**: percent of test files that were content-hash cached vs. re-run.

## Coverage Thresholds

| Metric | Minimum | Target |
|--------|---------|--------|
| Line | 70% | 85% |
| Branch | 60% | 75% |
| New code (diff) | 80% | 90% |

Coverage thresholds are advisory targets; the **non-negotiable Step-14 gate is 80% on new code** (matching CLAUDE.md). Existing-code coverage can be lower if a documented migration plan exists in the plan's `## Decisions Taken Under Ambiguity`.

## Output Format

```markdown
## Test Results

**Status**: PASS | FAIL
**Seed**: 1747661234567
**Wall-clock**: 12.5s (sharded across 4 nodes, max-shard 3.4s)
**Cache hit rate**: 38% (file-level)

### Summary
| Metric | Value |
|--------|-------|
| Total Tests | 145 |
| Passed | 143 |
| Failed | 2 |
| Skipped | 0 |
| Cached | 55 |

### Coverage
| Metric | Value | Threshold | Status |
|--------|-------|-----------|--------|
| Line | 87% | 70% | PASS |
| Branch | 72% | 60% | PASS |
| New Code | 94% | 80% | PASS |

### Failed Tests (2)
1. `test_user_authentication` — tests/test_auth.py:45 — AssertionError: Expected 200, got 401
2. `test_order_validation` — tests/test_order.py:78 — ValueError: Invalid order state

### Slow Tests (> 1s)
- `test_bulk_import`: 2.3s
- `test_full_sync`: 1.8s

### Flake Signal
None this run. Quarantine file: .ctoc/quality-state/flaky-tests.json (2 tracked).
```

## Anti-pattern categories (BLOCK at Step 14)

The runner emits a finding (and BLOCKS phase advancement) whenever it detects one of these. They are not test-author bugs; they are test-execution misconfigurations.

| Category | Symptom | Why it blocks |
|---|---|---|
| Serial execution on multi-core | `pool: 'threads'` + `singleThread: true`, `pytest` without `-n`, `maxParallelForks = 1` | Wastes 8–32× compute time; turns 30s suites into 5min CI bottlenecks |
| No worker isolation | `vitest --no-isolate` without audit; threaded pool with module-level singletons | Parallel runs corrupt shared state — flakes that don't reproduce locally |
| Missing fail-fast in CI PR | No `--bail`/`-x`/`--stop-on-failure` on PR builds | PR feedback delayed by tests after the first failure |
| No test result caching | Re-running full suite on unchanged files; no `--changed` / Nx / Turborepo cache | Wasted compute; slows down monorepo PRs |
| Filesystem-state dependency | Tests that `open('/tmp/state.json')` without `tmpdir` fixture or cleanup | Parallel workers collide on filesystem paths |
| Hardcoded ports / global resources | `app.listen(3000)` in test setup | Two workers can't bind the same port — random failures under parallelism |
| Unseeded random ordering | `--randomize` without `--seed` logged in output | CI failure unreproducible — engineer can't replay the failing order |
| Skipped tests without platform reason | `it.skip('TODO fix later')` | Silent coverage hole |
| Mocked-away core logic | The system under test is replaced by the mock | Tests the mock, not the code |
| Empty catch in fixtures | `beforeEach: try { setup() } catch {}` | Setup failure silently produces green tests |

## Tool Integration (2026)

Language-specific runners and the sharding layer that orchestrates them.

| Layer | Tool | Use when |
|---|---|---|
| Runner — TS/JS | **Vitest** (Vite stacks), **Jest** (legacy Webpack/CRA) | Pre-commit, watch, PR, scheduled |
| Runner — Python | **pytest** + `pytest-xdist` + `pytest-randomly` + `pytest-split` | All Python projects |
| Runner — Go | **`go test`** with `-race -shuffle=on` | All Go projects |
| Runner — Rust | **`cargo nextest`** (default in 2026; faster + better JUnit output than `cargo test`) | All Rust projects |
| Runner — C# | **`dotnet test`** (VSTest) or **Microsoft.Testing.Platform** (.NET 9 GA, opt-in via `UseMicrosoftTestingPlatformRunner`) | All .NET projects |
| Runner — Java/JVM | **JUnit Platform Console Launcher**, **Gradle `test { useJUnitPlatform() }`**, **Maven Surefire `<useJUnitPlatform>`** | All JVM projects |
| Runner — C | **CTest** + **Unity** runner (one binary per file) | All C projects |
| Runner — C++ | **CTest** + **GoogleTest** + `gtest_discover_tests` | All C++ projects |
| Runner — SQL | **`pg_prove --jobs N`** (pgTAP); **tSQLt** for SQL Server with sqlcmd loop | All SQL test suites |
| Sharding / orchestration | **Nx Cloud Atomizer** (auto-split by historical time), **Turborepo** (task graph + remote cache), **Bazel** (`shard_count`, deterministic), **GitHub Actions matrix** (`SHARD/TOTAL_SHARDS` strategy) | Any monorepo or CI with > 30s test wall-clock |
| Watch / fast feedback | `vitest`, `jest --watch`, `pytest-watch`, `cargo watch -x nextest`, `dotnet watch test` | Local dev only — never in CI |

Persist a **timing CSV** (`.test-durations`, `.nx/timing.json`, etc.) in the repo. The next CI run uses it to balance shards — equal time, not equal count.

## Severity (internal triage vs. refinement-loop output) — reconciliation

The skill keeps two views of severity. The **internal triage view** (table below) is used for the human-readable report ordering and for the action recommendation column. The **wire-level letter severity** is always `critical` per [warnings-are-critical.md](../../../agents/_shared/warnings-are-critical.md) — there is no `warn` / `medium` / `low` on the wire; the [letter schema](../../../.ctoc/architecture/refinement-loop-schema.json) rejects them.

Reconciliation rule: the runner emits one letter per finding with `severity: critical`. The integrator uses `confidence`, `kind`, and `reachable`-equivalent signals (here: `delta_to_baseline` and `seed` reproducibility) to decide whether to block the phase immediately or surface for review. The internal triage tier is conveyed via the `kind` field, not via the `severity` field.

| Triage tier | Wire `kind` examples | Internal action |
|---|---|---|
| CRITICAL | `failed_test`, `coverage_drop` > 5pp, `flake` past 14d SLA | BLOCK phase advancement |
| HIGH | `serial_misconfig`, `no_fail_fast`, `unseeded_random`, `hardcoded_port`, `no_isolation` | BLOCK |
| MEDIUM | `cache_miss` < 20% in > 100-file monorepo, `slow_test` > 5s without `@slow` mark | Fix soon (logged, not blocked) |
| LOW | Reporter verbosity, missing JUnit-XML output, no `--durations` artifact | Backlog (logged, not blocked) |

MEDIUM and LOW findings still emit `severity: critical` on the wire — the integrator demotes them via `kind` and `confidence`, never via a soft severity field.

## Letter schema (refinement-loop output contract)

When emitting a finding via the refinement loop, write the letter with these fields:

```yaml
finding_id: <sha256(critic+file+line+kind)[:12]>   # fingerprint for dedup
severity: critical                                  # ALWAYS critical (warnings-are-bugs)
confidence: high | medium | low                     # high = reproduced 3x; low = single observation
engine: vitest | jest | pytest | go-test | nextest | dotnet-test | junit | ctest | gtest | pg_prove | manual
kind: failed_test | flake | coverage_drop | serial_misconfig | no_isolation | no_fail_fast |
      hardcoded_port | unseeded_random | skipped_no_reason | slow_test | cache_miss
target_file: tests/test_auth.py
line: 45
suggested_fix: "Add @pytest.fixture(scope='function') and use tmp_path instead of /tmp/state.json"
seed: 1747661234567                                 # the seed under which the failure occurred
shard: "2/4"                                        # which shard observed it (CI sharded runs only)
duration_ms: 2340                                   # for slow_test
coverage_delta: -7.2                                # for coverage_drop (percentage points on changed files)
reference: https://vitest.dev/guide/improving-performance
```

The integrator uses `confidence` and `seed` to weight findings — a `confidence: low` single-shard failure with seed `S` should be replayable with `--seed=S` before blocking. Three reproductions with the same seed escalates to `confidence: high`.

## Zero tolerance: skipped tests

**0 skipped tests allowed.** BLOCKING at Step 14.

| Situation | Action |
|---|---|
| Test can't run | FIX (make it runnable) |
| Test is obsolete | DELETE |
| Platform-specific | Conditional skip with explicit reason ONLY |

Valid (the ONLY exception) — platform-specific test guarded by an explicit reason string:

```javascript
// Vitest 2026 API — skipIf takes a condition and a reason
test.skipIf(process.platform !== 'linux')('io_uring ring buffer (Linux-only)', () => {
  // ...
});

// Jest equivalent
(process.platform === 'linux' ? test : test.skip)('io_uring ring buffer (Linux-only)', () => {
  // ...
});

// pytest equivalent
@pytest.mark.skipif(sys.platform != "linux", reason="io_uring is Linux-only")
def test_ring_buffer(): ...
```

Invalid (BLOCKING):
```javascript
test.skip('TODO: fix later');        // NO — no platform reason
test.skip();                          // NO — no reason at all
it.skip('some test', () => { ... });  // NO — bare skip without platform guard
```

## Zero tolerance: flaky tests

**0 flaky tests allowed.** BLOCKING at Step 14.

If a test fails intermittently:
1. Retry up to 2 times automatically with the recorded seed.
2. If still fails → report as flaky and BLOCK.
3. Append to `.ctoc/quality-state/flaky-tests.json` with `first_seen`, `last_seen`, `retry_count`, `seed`.
4. 3 flakes in 7 days → auto-quarantine with a 2-week SLA.
5. After SLA: delete or fix. Never "pre-existing"-ignore.
6. Fix root cause (async timing, shared state, port reuse, unseeded random).

## CRITICAL: NO SILENT FAILURES

Anti-patterns that BLOCK:

```javascript
// BAD: silent failure
let db;
try { db = await connectDB(); } catch { db = null; }
if (!db) return; // test "passes" silently

// GOOD: explicit failure
const db = await connectDB(); // throws if unavailable

// BAD
if (!process.env.DB_URL) return;
// GOOD
test.skipIf(!process.env.DB_URL, 'Requires DB_URL environment variable');

// BAD: fixture swallows error
beforeEach(async () => {
  try { await setupDB(); } catch { /* ignore */ }
});
// GOOD
beforeEach(async () => {
  await setupDB(); // fails test if setup fails
});

// BAD: no assertion
test('user exists', () => {
  const user = getUser();
});
// GOOD
test('user exists', () => {
  const user = getUser();
  expect(user).toBeDefined();
  expect(user.name).toBe('expected');
});
```

**If a test cannot run, it must FAIL. Period.**

## CI integration

- Run on every push and every PR.
- PR builds: fail-fast (`--bail=1`, `-x`, `--stop-on-failure`), JUnit-XML output for annotations.
- Push to main / scheduled: full sweep, no fail-fast, full coverage report uploaded.
- Block merge on failure; never auto-merge if any test failed or coverage dropped.
- Aggregate JUnit-XML across shards into one report (`junit-merge`, `pytest-results-merge`, etc.).
- Persist `.test-durations` timing artifact in cache for the next shard rebalance.

---

## Refinement Loop — critic mode (v6.9.15)

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md):

- Every failed test, every flake, every coverage drop, every execution-time regression beyond the configured threshold, and every misconfiguration (serial-on-multi-core, no-isolation, no-fail-fast, unseeded-random) emits as `severity: critical` in the letter you write to CTO Chief.
- The [letter schema](../../../.ctoc/architecture/refinement-loop-schema.json) rejects `warn` — there is no soft tier.
- Findings block phase advancement until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section.

The principle: a slow or flaky suite today is a CI bottleneck and a deployment-day surprise tomorrow. Tests that run fast, deterministically, and in parallel are the difference between "we deploy ten times a day" and "we deploy on Tuesday with everyone watching".
