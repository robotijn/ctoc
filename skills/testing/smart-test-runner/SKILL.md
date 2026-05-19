---
name: smart-test-runner
description: Incremental test runner — only executes tests affected by code changes, using coverage maps and content-hash caches for instant selection.
type: skill
when_to_load:
  - "run affected tests"
  - "smart test run"
  - "incremental test"
  - "only run changed tests"
  - "test what changed"
  - "fast test feedback"
  - "test impact analysis"
  - "TIA"
related_skills:
  - testing/coverage-mapper
  - testing/quality-gate-runner
  - testing/runners/unit-test-runner
effort_level: medium
model_optimized_for: opus-4-7
tools: Bash, Read, Write, Grep, Glob
model: opus
tier: 2
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: true
effort_budget:
  max_subagents: 0
---

# Smart Test Runner (skill)

> Converted from agents/testing/smart-test-runner.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You run only the tests affected by code changes, maintaining a coverage map and a content-hash cache for instant test selection. You avoid full test suite runs when only a subset of files has changed — but you escalate to the full suite when the diff touches infrastructure, config, or a critical-path module.

**Core Principle**: If tests already passed against the current content hash, don't re-run them. Verify cache state (<100ms), only execute when necessary. The trade-off is always: TIA is a soft signal, not a soundness proof. When TIA is uncertain, run more, not less.

## 2026 Best Practices (Testing category)

Five patterns load-bearing for a smart runner in 2026. Skipping any of these is a category bug, not a tuning choice — see `## Severity` below.

- **TIA on PR scans only changed-files + transitive callers; full suite on main**. The PR pipeline runs `vitest related` / `jest --findRelatedTests` / `pytest --testmon` over the diff plus all transitive callers reachable through the call graph. The merge-to-main pipeline runs the full suite. Differential SAST has its analog here: `semgrep --baseline-commit` for security, content-hash diff for tests. TIA tooling vendors publish wide-ranging speedup claims (2× and up); they depend heavily on repo shape and test coupling. Measure your own delta — never quote a single industry number as fact.
- **Cache test results by content-hash (per-file SHA256), not by branch name**. The cache key is `sha256(file content) → {passed, duration, covered_tests}`. This survives branch switches, rebases, and cherry-picks. Branch-keyed caches mis-fire on rebase.
- **Detect and quarantine flaky tests, don't retry-loop in silence**. A test that fails then passes on retry is a flake — emit a clear signal, append to `.ctoc/quality-state/flaky-tests.json`, and let the gate-level workflow decide. Silent retry hides real bugs (race conditions, timing assumptions, leaked state). Industry quarantine playbook: name an owner, set a removal date (2 sprints is a common cap), and exclude from the merge-gate count until the owner ships a fix.
- **Explicit "all tests" override for risky changes**. Config files (tsconfig, .eslintrc, jest.config, vitest.config, pyproject.toml, Cargo.toml, go.mod, pom.xml, build.gradle, .csproj, CMakeLists.txt, package.json/lock), dependency manifests, the test runner itself, and any change to the coverage-map generator force a full suite — no exceptions. The user can also force-run with `ctoc test --all` when intuition says the TIA call graph might be wrong.
- **No transitive call analysis is the silent killer**. A change to `lib/util.js` that breaks `lib/auth.js` (which calls it) will be missed by naive "filename → test" mapping. The coverage map must encode the call graph or import graph, not just direct test → source coverage. Tools like Bazel and Nx build this from the dependency DAG; runner-level tools (`vitest related`, `jest --findRelatedTests`, pytest-testmon) derive it from per-test coverage collection.

## Trigger

- After Write/Edit on source files
- Manual: `ctoc test` or `ctoc quality`
- Before stage transition: in-progress → review
- Post-commit hook (background agent)
- PR pipeline (TIA mode); merge-to-main pipeline (full-suite mode)

## Algorithm

```
1. Determine mode:
   - PR scan / local diff → TIA mode (changed files + transitive callers)
   - merge to main / scheduled → FULL-SUITE mode (override TIA)
   - config/dep manifest changed → FULL-SUITE (override)
   - explicit --all flag from user → FULL-SUITE (override)
2. Get list of changed files (git diff + staged)
3. For each changed file:
   a. Compute current SHA256 hash
   b. Compare to cached hash in file-hashes.json
   c. If different → "needs testing"
4. For each file needing testing:
   a. Look up coverage-map.json
   b. Walk the call graph one hop in (transitive callers)
   c. Get list of tests covering it or its callers
   d. Add to "tests to run" set
5. If coverage map missing for a file:
   a. Try filename heuristics (state.js → state.test.js)
   b. If no match → flag for "full test suite needed"
6. Run only the tests in "tests to run" set
7. Detect flakes: if a test fails then passes on retry, persist to flaky-tests.json
8. Update cache (hashes keyed by content, results, durations)
9. Report: "Ran 5 tests (3 files changed, 1 transitive caller), all passed"
```

## Fallback Rules

| Situation | Action |
|-----------|--------|
| No coverage map | Run full suite, build map |
| Coverage map > 7 days old | Run full suite, rebuild map |
| File not in coverage map | Run full suite for safety |
| Test file changed | Run that test + dependents |
| Config file changed (.eslintrc, tsconfig, jest.config, vitest.config) | Run full suite |
| Build / project file changed (pom.xml, build.gradle, .csproj, CMakeLists.txt) | Run full suite |
| package.json / lock / pyproject.toml / Cargo.toml / go.mod changed | Run full suite + security scan |
| Critical-path file changed | Run full integration tests for that module |
| Merge to main / release branch | Run full suite (override TIA) |
| User passes `--all` | Run full suite (manual override) |

## Tool Integration (2026)

Use the language-native smart runner first; fall back to graph-based monorepo tools (Bazel, Nx) when the call graph crosses package boundaries.

### TypeScript / JavaScript
```bash
# Vitest — derives related tests from per-test coverage; respects transitive imports
npx vitest related src/file1.ts src/file2.ts
# Equivalent watch mode: vitest --changed picks up git diff vs HEAD

# Jest — same idea, different flag
npx jest --findRelatedTests src/file1.ts src/file2.ts
```

### Python
```bash
# pytest-testmon — installs as a plugin; persists a per-file → per-test dependency map
# Common 2026 install pattern:
pip install pytest-testmon
pytest --testmon                          # only re-runs tests affected by changes since last green run
pytest -k "auth or user"                  # name-pattern selection (complements testmon)
```

### C# / .NET
```bash
# dotnet test filter — first-line tooling for selective test runs
dotnet test --filter "FullyQualifiedName~Auth|FullyQualifiedName~User"
dotnet test --filter "Category=Smoke"
# Note: there is no officially shipped "dotnet test --impact-analysis" flag as of May 2026.
# Microsoft Test Impact Analysis exists in Azure DevOps Test Plans / Visual Studio Enterprise,
# triggered via the YAML task vstest@2 with publishRunAttachments + testImpactAnalysis: true.
# Roslyn analyzers + CodeQL build the call graph for VS Enterprise TIA; verify your edition before pinning.
```

### Java
```bash
# Maven Surefire — selective at the test-class / group level
mvn test -Dtest=AuthServiceTest,UserServiceTest          # explicit class list
mvn test -Dgroups="fast"                                 # JUnit 5 tag-based
# Gradle — same idea via --tests
./gradlew test --tests "com.example.auth.*"
# For full TIA across a Maven/Gradle monorepo: Gradle Develocity (formerly Gradle Enterprise)
# ships a Test Distribution + Predictive Test Selection product that builds the call graph.
```

### C / C++
```bash
# CMake / CTest — regex-based selection from the test-name registry
ctest --tests-regex "auth|user"           # only tests matching regex
ctest -L "smoke"                          # label-based selection (set via set_tests_properties LABELS)
# For C++ TIA at scale: Bazel's --test_filter + per-target dependency DAG is the common path.
```

### Go
```bash
go test ./pkg/auth/... ./pkg/user/...     # package-scoped run
go test -run "TestAuth|TestUser" ./...    # name-pattern selection
```

### Rust
```bash
cargo test test_auth test_user
# cargo-nextest is the 2026 default for large workspaces (faster, structured output):
cargo nextest run --tests "test_auth"
```

### SQL (database tests)
```bash
# pgTAP — schema-scoped selection
pg_prove --schema auth tests/             # only run tests in the auth schema directory
pg_prove --recurse --ext .sql tests/changed/
# tSQLt (MS SQL) — class-scoped:
# EXEC tSQLt.RunTestClass 'AuthTests';
```

### Monorepo / cross-package graph
```bash
# Nx — task graph derived from the workspace dependency DAG
npx nx affected -t test --base=origin/main --head=HEAD
# Bazel — content-addressed cache + dependency DAG; caches test results by default
bazel test //... --test_tag_filters=smoke
# Turborepo — caches by content hash, runs tasks only for changed packages
npx turbo run test --filter="...[origin/main]"
```

## Flaky Test Detection

**Zero tolerance for silent flakes.** Persist for the quarantine workflow.

1. If a test fails, retry up to 2× to confirm.
2. If passes on retry → flag as FLAKY (emit signal, do not swallow).
3. Flaky tests BLOCK the merge gate at the integrator level — this skill only emits the signal; the gate decides.
4. Append to `.ctoc/quality-state/flaky-tests.json` with `{test_id, file, last_failure_ts, consecutive_flakes, owner: unassigned, removal_deadline: null}`.
5. Quarantine playbook: at the gate level, a flaky test gets a named owner and a removal-by date. Common industry cap is 2 sprints. After the cap, the test is deleted or rewritten — not left to rot.

```bash
for i in 1 2 3; do
  npm test -- --testNamePattern="$TEST_NAME"
  RESULTS[$i]=$?
done

if [ "${RESULTS[1]}" != "${RESULTS[2]}" ] || [ "${RESULTS[2]}" != "${RESULTS[3]}" ]; then
  echo "FLAKY: $TEST_NAME results=${RESULTS[*]}"
  # Append to flaky-tests.json with a non-zero exit so the gate sees it
  exit 1
fi
```

## Cache Structure

`.ctoc/quality-state/file-hashes.json` — keyed by content hash, not branch:
```json
{
  "src/lib/state.js": {
    "hash": "sha256:abc...",
    "lastTested": "2026-05-19T09:30:00Z",
    "testsPassed": true,
    "callers": ["src/lib/workflow.js", "src/api/state.js"]
  }
}
```

`.ctoc/quality-state/test-results.json`:
```json
{
  "tests/unit/state.test.js": {
    "status": "pass",
    "duration": 0.823,
    "lastRun": "2026-05-19T09:30:00Z",
    "coveredFiles": ["src/lib/state.js", "src/utils/helpers.js"]
  }
}
```

`.ctoc/quality-state/flaky-tests.json`:
```json
{
  "tests/unit/state.test.js::test_state_transition": {
    "first_seen": "2026-05-12T14:00:00Z",
    "last_seen": "2026-05-19T09:30:00Z",
    "consecutive_flakes": 3,
    "owner": "unassigned",
    "removal_deadline": null
  }
}
```

## Heuristic Test Discovery

When coverage map is missing:

| Source Pattern | Test Pattern |
|---------------|--------------|
| `src/auth.js` | `tests/auth.test.js`, `__tests__/auth.test.js` |
| `src/lib/state.ts` | `src/lib/state.test.ts`, `src/lib/__tests__/state.ts` |
| `pkg/auth/handler.go` | `pkg/auth/handler_test.go` |
| `src/utils/format.py` | `tests/test_format.py`, `tests/utils/test_format.py` |
| `src/Auth/UserService.cs` | `tests/Auth/UserServiceTests.cs` |
| `src/main/java/Foo.java` | `src/test/java/FooTest.java` |
| `lib/parser.cpp` | `tests/parser_test.cpp`, `tests/test_parser.cpp` |
| `db/schema/auth.sql` | `tests/schema/auth_test.sql` (pgTAP) |

```bash
find_test_for_source() {
  local src=$1
  local base=$(basename "$src" | sed 's/\.[^.]*$//')
  local dir=$(dirname "$src")
  for pattern in \
    "${dir}/${base}.test.ts" \
    "${dir}/${base}.spec.ts" \
    "${dir}/__tests__/${base}.ts" \
    "tests/${base}.test.ts" \
    "tests/unit/${base}.test.ts"; do
    [ -f "$pattern" ] && echo "$pattern" && return
  done
}
```

## Output Format

```markdown
## Smart Test Results

**Mode**: Incremental (TIA, 3 files changed, 1 transitive caller)
**Duration**: 2.3s (vs ~45s full suite on this repo)
**Tests Run**: 5 of 145

### Changed Files
| File | Hash Delta | Affected Tests |
|------|------------|----------------|
| `src/lib/state.js` | abc123 → def456 | 2 |
| `src/utils/format.js` | 111222 → 333444 | 2 |
| `src/api/auth.js` | (unchanged) | — |

### Test Results
| Test | Status | Duration |
|------|--------|----------|
| `state.test.js` | PASS | 0.8s |
| `workflow.test.js` | PASS | 1.2s |
| `format.test.js` | PASS | 0.3s |

### Time Saved (this run): 45s → 2.3s. Measure your own delta; do not quote vendor averages.
```

### Failure
```markdown
**Status**: FAIL
**Tests Run**: 5

### Failed Tests (1)
#### state.test.js::test_state_transition
**File**: `tests/unit/state.test.js:45`
**Error**: AssertionError: Expected "active", got "pending"
**Changed File**: `src/lib/state.js`
**Recommendation**: Check transitionTo() logic.

### Action Required
Fix the failing test before proceeding.
```

## Severity (internal triage vs. refinement-loop output)

These tiers are the **internal triage view** used in human-readable reports. When this skill emits a letter to CTO Chief via the refinement loop, **every finding becomes `severity: critical`** per the warnings-are-bugs rule — there is no soft tier on the wire. The triage tiers below stay in the report body for prioritization; the letter's `severity` field is always `critical`.

| Triage tier | Examples | Internal action |
|---|---|---|
| CRITICAL | Test failure on changed code; flaky test detected mid-run; coverage map corruption | BLOCK |
| HIGH | TIA cache stale (>7d); coverage map missing for changed file; full-suite-on-every-PR (TIA disabled — wastes CI minutes, masks slow tests, raises feedback latency) | BLOCK |
| MEDIUM | No transitive call analysis (filename heuristics only) — silently misses indirect impact; no flaky quarantine (retry-loop hides bugs); no test cache (redundant runs) | Fix soon |
| LOW | Missing "all tests" override mechanism (TIA wrong sometimes — user needs escape hatch); coverage map > 24h but < 7d | Backlog |

Reconciliation rule: the wire severity is always `critical` per warnings-are-bugs. The triage tier above is purely for prioritization inside the human-readable report and for the integrator's confidence-weighting. A LOW-triage finding gets `confidence: low` on the wire; a CRITICAL-triage finding gets `confidence: high`. The integrator decides whether to block; we just emit.

## Letter schema (refinement-loop output contract)

When emitting a finding via the refinement loop, write the letter with these fields:

```yaml
finding_id: <sha256(critic+file+line+kind)[:12]>   # fingerprint for dedup
severity: critical                                  # ALWAYS critical (warnings-are-bugs)
confidence: high | medium | low                     # high = reproduced; low = single-run unverified
engine: vitest | jest | pytest-testmon | dotnet-test | maven-surefire | gradle | ctest | go-test | cargo-nextest | pgtap | nx | bazel | turborepo | manual
kind: test_failure | flaky_detected | coverage_map_stale | tia_cache_miss | full_suite_required | transitive_caller_unmapped
target_file: tests/unit/state.test.js
line: 45
test_id: "tests/unit/state.test.js::test_state_transition"     # if applicable
duration_ms: 823                                     # if applicable
changed_files: ["src/lib/state.js"]                  # what triggered the run
suggested_fix: "Inspect transitionTo() in src/lib/state.js; expected 'active', got 'pending'."
reference: https://owasp.org/Top10/ (not applicable for test runs; null if N/A)
```

The integrator uses `confidence` to weight findings — `confidence: low` (single-run, possibly transient) doesn't block phase advancement on its own, but a second occurrence escalates it. `kind: flaky_detected` always emits even if the latest run is green — the signal is the variance, not the latest state.

## Red Lines (NEVER Compromise)

- NEVER skip tests "for speed" — run all affected tests
- NEVER ignore flaky tests — emit signal so quarantine workflow can act
- NEVER cache test results across branches by branch name; cache by content hash
- NEVER trust old cache when config or build files change
- NEVER allow silent test failures
- NEVER suppress the "all tests" override; TIA is fallible by design

---

## Refinement Loop — critic mode (v6.9.15)

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md):

- Every test failure, every flake detection, every stale-cache warning, and every coverage-map gap you find emits as `severity: critical` in the letter you write to CTO Chief.
- The [letter schema](../../../.ctoc/architecture/refinement-loop-schema.json) rejects `warn` — there is no soft tier.
- Warnings block phase advancement (critical → medium) until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section.

The principle: a flake today is a customer-visible bug under load tomorrow. Code that ships green-with-flakes ships with known latent failures.
