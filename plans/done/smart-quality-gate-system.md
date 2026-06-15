---
approved_by: human
approved_at: 2026-06-15T09:45:22.725Z
gate_crossed: review → done
---

---
title: "Smart Quality Gate System"
created: "2026-02-03T09:45:00Z"
priority: HIGH
type: feature
approved_by: human
approved_at: 2026-02-08T17:10:00.000Z
started_at: 2026-02-08T18:00:00.000Z
gate_crossed: todo → in-progress
---

# Smart Quality Gate System

## Problem Statement

**Current pain points:**
1. Pre-commit hooks run full test suites (30-120s) → Developers bypass with `--no-verify`
2. Quality checks are binary: all-or-nothing, no tiered approach
3. Tests run on every commit even when code hasn't changed
4. No incremental testing: changing one file runs ALL tests
5. Security scans happen too late (in CI, after code is pushed)
6. Quality gates limited to lint/type/test — missing security, complexity, architecture

**The insight:** If tests already passed on current code state, pre-commit should just *verify* that fact (<100ms), not re-run tests.

## Solution Overview

A **layered quality gate system** with:
1. **Smart incremental testing** — Only run tests affected by changed files
2. **Quality state cache** — Track what passed, when, on which code
3. **Tiered gates** — Blocking vs warning vs review-time vs CI-only
4. **Instant pre-commit** — Verify cache state, don't execute
5. **Specialized agents** — Each quality dimension has an expert

## Design Decisions (from discussion)

### Decision 1: Test Framework Detection

**Hybrid approach with priority order:**
1. User config (`.ctoc/quality-config.yaml`) — explicit override
2. Auto-detect from project files:
   | File | Language |
   |------|----------|
   | package.json | JavaScript/TypeScript |
   | pyproject.toml | Python |
   | go.mod | Go |
   | Cargo.toml | Rust |
   | pom.xml / build.gradle | Java |
   | *.csproj | C# |
   | Gemfile | Ruby |
3. CTOC skills fallback (`skills/languages/*.md`)
4. Prompt user if still unknown

### Decision 2: Coverage Map Rebuild Triggers

**Smart triggers — rebuild when ANY of:**
- Test files added/removed/renamed
- Source file added (no mapping exists)
- Config files changed (tsconfig, pytest.ini, etc.)
- Map > 7 days old
- Manual: `ctoc coverage-map rebuild`

### Decision 3: Flaky Test Handling

**Zero tolerance:**
- Retry failed test 2x to confirm flakiness
- If flaky detected → BLOCK until fixed
- 0 flaky tests allowed
- No "pre-existing" excuses

### Decision 4: CI Integration

**Local-only cache (start simple):**
- Each developer has own `.ctoc/quality-state/`
- CI runs Tier 4 independently
- `.gitignore` the cache
- Add team sync later if/when team grows

### Decision 5: Monorepo Support

**Yes, required:**
- CTOC is a monorepo
- CTOC is designed for monorepo projects
- Need package-scoped quality checks
- On change in `packages/foo/` → only test foo
- Shared code changes → test all dependents

### Decision 6: Missing Tool Handling

**Detect and guide:**
- Check if tool exists before running
- If missing → show install command (e.g., `npm install -D eslint`)
- Don't fail silently, teach user what's needed

### Decision 7: Cross-Platform Compatibility

**Abstract via Node.js:**
- Use cross-spawn/execa for commands
- Path handling via path.join (no hardcoded `/`)
- Works everywhere Node runs

### Decision 8: Interrupted Quality Checks

**Combined belt-and-suspenders:**
- Atomic writes (write temp file, then rename)
- Running state in status.json (`idle` | `running` | `pass` | `fail`)
- Completion timestamp (`completedAt`)
- Lockfile with PID for concurrency detection
- Self-healing recovery on startup

### Decision 9: Existing Pre-commit Hooks

**Ask user during setup:**
On `ctoc init` when existing hooks detected, ask:
1. Add alongside (keep existing, add CTOC)
2. Replace (CTOC becomes only pre-commit)
3. Skip (don't install CTOC hooks)

### Decision 10: MAJOR - Background Agent Replaces Pre-commit

**Background quality agent instead of blocking hooks:**

OLD approach (removed):
- Pre-commit hook blocks until cache verified (<100ms)

NEW approach:
- `git commit` → instant, no blocking
- Background agent auto-starts, runs all quality checks
- Pass → auto-push to remote, notify "Pushed to origin"
- Fail → don't push, notify "Tests failed, fix X"
- Developer keeps working while tests run

### Decision 11: Background Agent Triggers

**Hybrid:**
- Auto-trigger on `git commit`
- Manual trigger: `ctoc push`

### Decision 12: Notification System

**Terminal notification:**
- Print results to terminal when done
- Simple, universal

### Decision 13: Failed Push Retry

**Any commit triggers retry:**
- Both `git commit --amend` and new commit auto-trigger
- Developer chooses their preferred workflow

### Decision 14: Vision Pipeline (extracted)

**Moved to separate plan:** `plans/functional/vision-pipeline.md`

The vision-to-functional decomposition pipeline (Vision Decomposer Agent, Product Owner Agent, human checkpoint UI) is now tracked independently.

### Decision 15: Auto-push Remote Conflict

**Pull-rebase then push:**
- If `git push` fails (remote ahead), auto `git pull --rebase`
- Re-run affected tests on rebased code
- Push again if tests pass
- If rebase conflicts → notify user "Conflict on push, run `ctoc sync`"
- Never force-push

### Decision 16: Coverage Map Without Coverage Tooling

**Import analysis as primary fallback:**
- Parse test files for `require`/`import` statements to build file→test map
- No coverage runner needed — just static analysis of imports
- Similar to how Jest's `--findRelatedTests` works internally
- Fallback chain: coverage reports → import analysis → filename heuristics → full suite

### Decision 17: Claude Quality Integration

**Notify on non-success only:**
- Claude sees quality results when: tests fail, warnings triggered, deprecated deps found, security issues detected
- Silent on clean pass (no context noise)
- Implementation: PostToolUse hook reads `.ctoc/quality-state/status.json`, injects into Claude context when status ≠ `pass`
- User can configure to always-on or always-off via `.ctoc/quality-config.yaml`

## Quality Gate Taxonomy

```
┌─────────────────────────────────────────────────────────────────┐
│                    QUALITY GATE TIERS                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  TIER 1: BLOCKING (Must pass before push)          ~5-30s       │
│  ──────────────────────────────────────────                     │
│  ✓ Lint/format passed                                           │
│  ✓ Type check passed                                            │
│  ✓ Affected unit tests passed                                   │
│  ✓ No secrets detected in changes                               │
│  ✓ No critical/high CVEs in new deps                            │
│                                                                  │
│  TIER 2: WARNING (Should fix, doesn't block)       ~10-30s      │
│  ──────────────────────────────────────────                     │
│  ⚠ Code coverage >= threshold (default 80%)                     │
│  ⚠ Cyclomatic complexity <= threshold (default 10)              │
│  ⚠ Cognitive complexity <= threshold (default 15)               │
│  ⚠ No new code duplication (>= 6 lines)                         │
│  ⚠ No medium-severity CVEs                                      │
│                                                                  │
│  TIER 3: REVIEW (Checked at stage transition)      ~30-60s      │
│  ──────────────────────────────────────────                     │
│  📋 Documentation coverage adequate                              │
│  📋 No circular dependencies introduced                          │
│  📋 Bundle size delta < threshold (default 10%)                  │
│  📋 API backward compatible (if applicable)                      │
│  📋 Performance benchmarks stable (< 10% regression)             │
│  📋 Integration tests pass                                       │
│                                                                  │
│  TIER 4: CI ONLY (Full verification on push)       ~2-10min     │
│  ──────────────────────────────────────────                     │
│  🔒 Full test suite (all tests)                                  │
│  🔒 E2E tests                                                    │
│  🔒 Mutation testing score >= threshold                          │
│  🔒 Memory leak check (long-running tests)                       │
│  🔒 License compliance scan                                      │
│  🔒 Full security audit                                          │
│  🔒 Accessibility checks (if applicable)                         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Quality State Cache

### Directory Structure

```
.ctoc/
├── quality-state/
│   ├── status.json              # Overall quality status
│   ├── file-hashes.json         # SHA256 of each source file
│   ├── test-results.json        # Pass/fail per test
│   ├── coverage-map.json        # file → [tests that cover it]
│   ├── lint-results.json        # Lint status per file
│   ├── type-results.json        # Type check status
│   ├── security-results.json    # Security scan results
│   ├── complexity-results.json  # Complexity metrics per file
│   └── last-full-run.json       # Last complete quality run
```

### status.json (Pre-commit reads this)

```json
{
  "overallStatus": "green",
  "asOf": "2026-02-03T09:30:00Z",
  "gitHead": "abc123def",
  "tiers": {
    "tier1": { "status": "pass", "checkedAt": "2026-02-03T09:30:00Z" },
    "tier2": { "status": "pass", "warnings": 2 },
    "tier3": { "status": "pending", "lastRun": "2026-02-03T08:00:00Z" }
  },
  "stagedFiles": {
    "allTested": true,
    "untested": []
  },
  "summary": {
    "tests": { "passed": 142, "failed": 0, "skipped": 3 },
    "coverage": 87.3,
    "lint": { "errors": 0, "warnings": 5 },
    "security": { "critical": 0, "high": 0, "medium": 2 }
  }
}
```

### coverage-map.json (Smart test selection)

```json
{
  "src/lib/state.js": {
    "tests": ["tests/unit/state.test.js", "tests/integration/workflow.test.js"],
    "lastModified": "2026-02-03T09:00:00Z",
    "hash": "abc123"
  },
  "src/tabs/vision.js": {
    "tests": ["tests/unit/vision.test.js"],
    "lastModified": "2026-02-03T08:30:00Z",
    "hash": "def456"
  }
}
```

## Smart Test Runner Algorithm

```
┌─────────────────────────────────────────────────────────────────┐
│                    SMART TEST ALGORITHM                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Get list of changed files (git diff + staged)               │
│                                                                  │
│  2. For each changed file:                                       │
│     a. Compute current SHA256 hash                              │
│     b. Compare to cached hash in file-hashes.json               │
│     c. If different → mark as "needs testing"                   │
│                                                                  │
│  3. For each file needing testing:                              │
│     a. Look up coverage-map.json                                │
│     b. Get list of tests that cover this file                   │
│     c. Add to "tests to run" set (deduplicated)                 │
│                                                                  │
│  4. If coverage map missing for a file:                         │
│     a. Try filename heuristics (state.js → state.test.js)       │
│     b. If no match → flag for "full test suite needed"          │
│                                                                  │
│  5. Run only the tests in "tests to run" set                    │
│                                                                  │
│  6. Update cache:                                                │
│     a. New hashes for tested files                              │
│     b. Test results (pass/fail per test)                        │
│     c. Overall status                                           │
│                                                                  │
│  7. Report: "Ran 5 tests (3 files changed), all passed"         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Fallback Rules

| Situation | Action |
|-----------|--------|
| No coverage map exists | Run full suite, build map |
| Coverage map > 7 days old | Run full suite, rebuild map |
| File not in coverage map | Run full suite for safety |
| Test file changed | Run that test + dependents |
| Config file changed (.eslintrc, tsconfig) | Run full suite |
| Package.json/lock changed | Run full suite + security scan |

## Background Quality Agent

**Replaces blocking pre-commit hooks with async background testing.**

```
┌─────────────────────────────────────────────────────────────────┐
│                    BACKGROUND AGENT FLOW                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Developer          Background Agent         Remote              │
│  ─────────          ────────────────         ──────              │
│                                                                  │
│  git commit ───────► post-commit hook starts agent               │
│  (instant)          │                                            │
│                     ▼                                            │
│  keep coding        Running quality checks...                    │
│  keep coding        • lint ✓                                     │
│  keep coding        • typecheck ✓                                │
│  keep coding        • tests (47 affected)...                     │
│  keep coding        • security scan ✓                            │
│                     │                                            │
│                     ▼                                            │
│                ┌────┴────┐                                       │
│                │ Result? │                                       │
│                └────┬────┘                                       │
│           ┌────────┴────────┐                                    │
│           ▼                 ▼                                    │
│        PASS ✅           FAIL ❌                                 │
│           │                 │                                    │
│           ▼                 ▼                                    │
│     git push ──────► remote   Notify: "Fix X"                   │
│     Notify: "Pushed"          Don't push                         │
│                                                                  │
│  ─────────────────────────────────────────────────────────────  │
│                                                                  │
│  RETRY ON FAILURE:                                              │
│                                                                  │
│  Developer fixes issue                                           │
│  git commit (or --amend) ───► Agent auto-starts again           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Post-commit Hook (Agent Trigger)

```javascript
#!/usr/bin/env node
/**
 * Post-commit hook - triggers background quality agent
 * This hook is NON-BLOCKING - commit always succeeds
 */

const { spawn } = require('child_process');
const path = require('path');

// Start background agent (detached)
const agent = spawn('node', [
  path.join(__dirname, '../lib/quality-agent.js'),
  '--on-success=push',
  '--notify=terminal'
], {
  detached: true,
  stdio: 'ignore'
});

agent.unref();
console.log('🔄 Quality agent started in background...');
```

### Quality Agent (Background Runner)

```javascript
#!/usr/bin/env node
/**
 * Background Quality Agent
 * Runs all quality checks, pushes on success
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const STATE_DIR = '.ctoc/quality-state';

async function main() {
  const lockfile = path.join(STATE_DIR, '.lock');

  try {
    // 1. Acquire lock (with PID for stale detection)
    acquireLock(lockfile);
    updateStatus('running');

    // 2. Run quality checks
    console.log('🔍 Running quality checks...\n');

    const results = {
      lint: await runCheck('lint'),
      typecheck: await runCheck('typecheck'),
      tests: await runCheck('tests'),
      security: await runCheck('security')
    };

    // 3. Evaluate results
    const allPassed = Object.values(results).every(r => r.passed);

    if (allPassed) {
      updateStatus('pass');
      console.log('\n✅ All checks passed\n');

      // Auto-push
      console.log('📤 Pushing to remote...');
      execSync('git push', { stdio: 'inherit' });
      console.log('\n✅ Pushed successfully!');
    } else {
      updateStatus('fail');
      console.log('\n❌ Quality checks failed:\n');
      for (const [name, result] of Object.entries(results)) {
        if (!result.passed) {
          console.log(`  • ${name}: ${result.error}`);
        }
      }
      console.log('\nFix issues and commit again to retry.');
    }
  } finally {
    releaseLock(lockfile);
  }
}

main().catch(console.error);
```

## Agents

### 1. Smart Test Runner Agent

**File:** `agents/testing/smart-test-runner.md`

```markdown
# Smart Test Runner Agent

## Role
Run only the tests affected by code changes, maintaining a coverage map
for instant test selection.

## Trigger
- After Write/Edit on source files
- Manual: `ctoc test`
- Before stage transition: in-progress → review

## Algorithm
1. Detect changed files (compare hashes)
2. Look up coverage map for affected tests
3. Run ONLY affected tests
4. Update quality state cache
5. Report results

## Tools
- Bash (run test commands)
- Read/Write (cache management)
- Glob (find test files)

## Coverage Map Building
When coverage map is missing or stale:
1. Run full test suite with coverage
2. Parse coverage report (lcov, coverage.py, go cover)
3. Build file → test mapping
4. Store in coverage-map.json

## Output Format
"Ran 5 tests (3 files changed) in 2.3s
 ✓ state.test.js (0.8s)
 ✓ workflow.test.js (1.2s)
 ✓ vision.test.js (0.3s)
 All tests passed. Cache updated."
```

### 2. Security Scanner Agent

**File:** `agents/security/security-scanner.md`

```markdown
# Security Scanner Agent

## Role
Detect security issues in code changes: secrets, CVEs, vulnerable patterns.

## Checks
1. **Secret Detection**
   - API keys, tokens, passwords in code
   - Tools: gitleaks, trufflehog patterns

2. **Dependency CVEs**
   - npm audit / pip-audit / go mod audit
   - Check against NVD database

3. **Code Vulnerabilities**
   - SAST patterns (SQL injection, XSS, etc.)
   - Tools: semgrep, bandit (Python), eslint-plugin-security

## Severity Levels
- CRITICAL: Block immediately (secrets, critical CVEs)
- HIGH: Block commit (high CVEs, obvious vulns)
- MEDIUM: Warning (medium CVEs, potential issues)
- LOW: Informational

## Output
Updates .ctoc/quality-state/security-results.json
```

### 3. Complexity Analyzer Agent

**File:** `agents/quality/complexity-analyzer.md`

```markdown
# Complexity Analyzer Agent

## Role
Measure and track code complexity metrics.

## Metrics
1. **Cyclomatic Complexity**
   - Number of independent paths through code
   - Threshold: <= 10 per function (configurable)

2. **Cognitive Complexity**
   - How hard code is to understand
   - Threshold: <= 15 per function (configurable)

3. **Lines per Function**
   - Threshold: <= 50 lines (configurable)

4. **Nesting Depth**
   - Threshold: <= 4 levels (configurable)

## Tools by Language
- JavaScript/TypeScript: eslint-plugin-complexity, plato
- Python: radon, mccabe
- Go: gocyclo, gocognit
- Rust: cargo-complexity

## Output
Per-file complexity scores with hotspots highlighted.
```

### 4. Coverage Mapper Agent

**File:** `agents/testing/coverage-mapper.md`

```markdown
# Coverage Mapper Agent

## Role
Build and maintain the file → test mapping for smart test selection.

## Process
1. Run full test suite with coverage enabled
2. Parse coverage report (JSON format preferred)
3. For each source file, record which tests executed it
4. Store mapping in coverage-map.json

## Coverage Report Formats
- Jest: --coverage --coverageReporters=json
- pytest: --cov --cov-report=json
- go: -coverprofile then go tool cover -func
- nyc/istanbul: --reporter=json

## Refresh Triggers
- Manual: ctoc coverage-map rebuild
- Auto: When coverage map > 7 days old
- Auto: When new source files detected without mapping
```

### 5. Dependency Auditor Agent

**File:** `agents/security/dependency-auditor.md`

```markdown
# Dependency Auditor Agent

## Role
Audit dependencies for security vulnerabilities and maintenance status.

## Checks
1. **Known CVEs**
   - npm audit / yarn audit
   - pip-audit / safety
   - go mod audit

2. **Outdated Packages**
   - Major versions behind
   - Unmaintained (no updates > 2 years)

3. **License Compliance**
   - Detect GPL in proprietary projects
   - Flag unknown licenses

4. **Dependency Risk Score**
   - Maintenance activity
   - Download trends
   - Known issues

## Severity Mapping
- Critical CVE → CRITICAL (blocks)
- High CVE → HIGH (blocks)
- Medium CVE → MEDIUM (warning)
- Outdated major version → LOW (informational)
```

### 6. Architecture Checker Agent

**File:** `agents/quality/architecture-checker.md`

```markdown
# Architecture Checker Agent

## Role
Detect architectural violations and dependency issues.

## Checks
1. **Circular Dependencies**
   - Tools: madge (JS), deptry (Python), go mod graph
   - Block if new cycles introduced

2. **Layer Violations**
   - Define allowed dependency directions
   - e.g., UI → Service → Data (not reverse)

3. **Blast Radius Analysis**
   - Count dependents of changed files
   - Warn if change affects > N components

4. **Import Depth**
   - Maximum allowed import chain length
   - Detect deep coupling

## Configuration
.ctoc/architecture-rules.yaml defines allowed patterns.
```

### 7. Performance Validator Agent

**File:** `agents/quality/performance-validator.md`

```markdown
# Performance Validator Agent

## Role
Detect performance regressions before they ship.

## Checks
1. **Benchmark Comparison**
   - Run benchmarks on changed code
   - Compare to baseline (main branch)
   - Flag if > 10% regression

2. **Bundle Size Delta**
   - Measure JS bundle size
   - Compare to previous build
   - Flag if > 10% increase

3. **Memory Profiling**
   - Detect potential memory leaks
   - Check allocation patterns

4. **Response Time SLO**
   - For API changes, check latency impact

## Tools
- Benchmarks: hyperfine, pytest-benchmark, go test -bench
- Bundle: bundlesize, size-limit, webpack-bundle-analyzer
- Memory: heaptrack, tracemalloc, pprof
```

### 8. Quality Gate Orchestrator Agent

**File:** `agents/quality/quality-gate.md`

```markdown
# Quality Gate Orchestrator Agent

## Role
Coordinate all quality checks and make pass/fail decisions.

## Orchestration Flow

### On Code Change (Tier 1)
1. Spawn Smart Test Runner (affected tests)
2. Spawn Security Scanner (secrets + CVEs)
3. Run lint and type check
4. Update quality state cache
5. Report: pass/fail with details

### On Stage Transition (Tier 2 + 3)
1. Verify Tier 1 passed
2. Run Complexity Analyzer
3. Run Architecture Checker
4. Run Performance Validator (if benchmarks exist)
5. Check documentation coverage
6. Aggregate results with warnings
7. Decision: pass (with warnings) or block

### Decision Matrix

| Tier 1 | Tier 2 | Tier 3 | Decision |
|--------|--------|--------|----------|
| FAIL   | -      | -      | BLOCK    |
| PASS   | FAIL   | -      | WARN     |
| PASS   | PASS   | FAIL   | WARN     |
| PASS   | PASS   | PASS   | PASS     |

## Human Override
User can acknowledge warnings and proceed.
Overrides are logged for audit trail.
```

## Configuration

### .ctoc/quality-config.yaml

```yaml
# Quality Gate Configuration

tiers:
  tier1:
    blocking: true
    checks:
      - lint
      - typecheck
      - affected-tests
      - secrets
      - critical-cves

  tier2:
    blocking: false
    checks:
      - coverage:
          threshold: 80
      - complexity:
          cyclomatic: 10
          cognitive: 15
      - duplication:
          minLines: 6
      - medium-cves

  tier3:
    blocking: false
    runAt: stage-transition
    checks:
      - documentation
      - circular-deps
      - bundle-size:
          maxDelta: 10%
      - api-compat
      - benchmarks:
          maxRegression: 10%
      - integration-tests

coverage:
  mapRefreshDays: 7
  fallbackToFull: true

cache:
  maxAgeHours: 24
  location: .ctoc/quality-state

languages:
  javascript:
    lint: eslint .
    typecheck: tsc --noEmit
    test: jest
    coverage: jest --coverage --coverageReporters=json

  typescript:
    lint: eslint .
    typecheck: tsc --noEmit
    test: jest
    coverage: jest --coverage --coverageReporters=json

  python:
    lint: ruff check .
    typecheck: mypy .
    test: pytest
    coverage: pytest --cov --cov-report=json

  go:
    lint: golangci-lint run
    typecheck: go build ./...
    test: go test ./...
    coverage: go test -coverprofile=coverage.out ./...
```

## Integration with CTOC Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│                    FULL CTOC PIPELINE WITH GATES                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   functional/ (plans created by user or vision pipeline)         │
│     ↓ (HUMAN GATE: user approves → implementation)              │
│   implementation/ (detail technical approach)                    │
│     ↓ (HUMAN GATE: user approves → todo)                        │
│   todo/ → in-progress/                                          │
│     ↓                                                           │
│   ...code changes + quality gates (see below)...                │
│     ↓                                                           │
│   review/ → done/ (HUMAN GATE: user approves)                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    BACKGROUND QUALITY AGENT                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   todo/ → in-progress/                                          │
│            ↓                                                    │
│   Executor makes code changes                                   │
│            ↓                                                    │
│   git commit (instant, never blocks)                            │
│            ↓                                                    │
│   Background Agent starts automatically                         │
│            ↓                                                    │
│   Quality Gate (Tier 1 + 2):                                    │
│     • Smart Test Runner (affected tests)                        │
│     • Security Scanner (secrets + CVEs)                         │
│     • Lint + Type check                                         │
│     • Coverage check                                            │
│     • Complexity analysis                                       │
│            ↓                                                    │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │  PASS ✅                    │  FAIL ❌                  │   │
│   │  • Auto-push to remote      │  • Don't push             │   │
│   │  • Notify: "Pushed!"        │  • Notify: "Fix X"        │   │
│   │  • Update cache             │  • Wait for next commit   │   │
│   └─────────────────────────────────────────────────────────┘   │
│            ↓                                                    │
│   in-progress/ → review/  (HUMAN GATE)                          │
│            ↓                                                    │
│   Quality Gate (Tier 3) at stage transition:                    │
│     • Architecture check                                        │
│     • Performance validation                                    │
│     • Integration tests                                         │
│            ↓                                                    │
│   review/ → done/  (HUMAN GATE - business approval)             │
│            ↓                                                    │
│   CI: Full Tier 4 suite (final verification on push)            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `agents/testing/smart-test-runner.md` | CREATE | Incremental test runner |
| `agents/testing/coverage-mapper.md` | CREATE | Build file→test mapping |
| `agents/security/security-scanner.md` | CREATE | Secrets + CVE detection |
| `agents/security/dependency-auditor.md` | CREATE | Dep vulnerability check |
| `agents/quality/complexity-analyzer.md` | CREATE | Complexity metrics |
| `agents/quality/architecture-checker.md` | CREATE | Circular deps, layers |
| `agents/quality/performance-validator.md` | CREATE | Benchmarks, bundle size |
| `agents/quality/quality-gate.md` | CREATE | Orchestrator agent |
| `hooks/post-commit.js` | CREATE | Triggers background agent |
| `lib/quality-agent.js` | CREATE | Background quality runner |
| `lib/quality-state.js` | CREATE | Cache read/write utilities |
| `lib/coverage-map.js` | CREATE | Coverage map utilities |
| `lib/hash-utils.js` | CREATE | File hashing utilities |
| `lib/tool-detector.js` | CREATE | Detect test frameworks per language |
| `scripts/build-coverage-map.js` | CREATE | Coverage report parser |
| `.ctoc/quality-state/` | CREATE | State cache directory |
| `.ctoc/quality-config.yaml` | CREATE | Configuration template |
| `commands/quality.md` | CREATE | Quality command docs |
| `commands/push.md` | CREATE | Manual push trigger docs |
| `CLAUDE.md` | MODIFY | Add quality gate rules |

## Commands

| Command | Description |
|---------|-------------|
| `ctoc quality` | Run Tier 1 checks on changed files |
| `ctoc quality --full` | Run all tiers |
| `ctoc quality --tier1` | Run only Tier 1 |
| `ctoc quality --tier2` | Run Tier 1 + 2 |
| `ctoc quality --security` | Security checks only |
| `ctoc coverage-map rebuild` | Rebuild file→test mapping |
| `ctoc quality status` | Show current quality state |

## Performance Targets

| Operation | Target | Notes |
|-----------|--------|-------|
| git commit | <1s | Never blocks, instant |
| Background agent startup | <500ms | Post-commit hook |
| Tier 1+2 (affected tests) | 5-60s | Runs in background |
| Tier 3 (stage transition) | 30-60s | At review transition |
| Coverage map rebuild | 1-5min | On triggers (see Decision 2) |

## Implementation Priority & Sequencing

| Priority | Agent/Component | Why first |
|----------|----------------|-----------|
| P0 | `lib/quality-state.js` + `lib/hash-utils.js` | Foundation — everything depends on the cache |
| P0 | `lib/quality-agent.js` + `hooks/post-commit.js` | Core loop — background agent + trigger |
| P1 | Smart Test Runner Agent | Most impactful — affected-tests-only |
| P1 | Quality Gate Orchestrator | Coordinates all checks |
| P2 | `lib/tool-detector.js` | Detect frameworks per language |
| P2 | `lib/coverage-map.js` + mapper agent | Enables smart test selection |
| P3 | Security Scanner Agent | Can start as `npm audit` wrapper |
| P3 | Complexity Analyzer Agent | Can start as eslint-plugin wrapper |
| P4 | Architecture Checker Agent | Nice to have for v1 |
| P4 | Performance Validator Agent | Nice to have for v1 |
| P4 | Dependency Auditor Agent | Nice to have for v1 |

**Note:** Vision Pipeline (previously Phase B) has been extracted to `plans/functional/vision-pipeline.md`.

## Acceptance Criteria

- [ ] git commit never blocks (instant)
- [ ] Background agent auto-starts on commit
- [ ] Smart test runner only runs affected tests
- [ ] Coverage map built from coverage reports or import analysis
- [ ] Auto-push on all checks pass
- [ ] Terminal notification on completion
- [ ] Tier 1 failures block push (not commit)
- [ ] Tier 2 warns but doesn't block
- [ ] Tier 3 runs at stage transitions
- [ ] Any commit (new or amend) triggers retry
- [ ] Quality state persists across sessions
- [ ] Cross-platform via Node.js abstractions
- [ ] Hybrid detection: config → auto-detect → skills → prompt
- [ ] Monorepo package-scoped checks
- [ ] Works with existing CTOC workflow
- [ ] Auto-push handles remote conflicts via pull-rebase + re-test
- [ ] Quality failures/warnings inject into Claude context via PostToolUse hook

## Success Metrics

| Metric | Before | After |
|--------|--------|-------|
| Commit time | 30-120s (blocking) | <1s (instant) |
| Developer bypass rate | High (--no-verify) | Near zero |
| Security issues caught | At CI | At code change |
| Test runs per commit | Full suite | Affected only |
| Quality visibility | Binary | Tiered + detailed |
| Push success rate | Unknown until CI | Known before push |

---

*"Fast feedback loops create better code. Make the right thing easy."*

---

## Implementation Details

### Existing Code Status

Analysis of the codebase reveals that Phase A P0/P1 files **already exist** with substantial implementations. This section documents the current state, remaining gaps, and the exact integration work needed to make the system operational end-to-end.

#### Files Already Implemented

| File | Status | Lines | Completeness |
|------|--------|-------|--------------|
| `lib/quality-state.js` | EXISTS | 315 | ~90% complete |
| `lib/hash-utils.js` | EXISTS | 316 | ~95% complete |
| `lib/quality-agent.js` | EXISTS | 378 | ~75% complete |
| `hooks/post-commit.js` | EXISTS | 89 | ~90% complete |
| `lib/coverage-map.js` | EXISTS | 529 | ~85% complete |
| `lib/tool-detector.js` | EXISTS | 349 | ~80% complete |
| `lib/quality-gate.js` | EXISTS | 684 | ~80% complete (threshold evaluation) |
| `lib/quality-config.js` | EXISTS | 583 | ~85% complete (20 languages) |
| `agents/testing/smart-test-runner.md` | EXISTS | 283 | ~95% complete |
| `agents/quality/quality-gate.md` | EXISTS | 391 | ~95% complete |
| `agents/testing/coverage-mapper.md` | EXISTS | - | EXISTS |
| `agents/security/security-scanner.md` | EXISTS | - | EXISTS |
| `agents/security/dependency-auditor.md` | EXISTS | - | EXISTS |
| `agents/quality/complexity-analyzer.md` | EXISTS | - | EXISTS |
| `agents/quality/architecture-checker.md` | EXISTS | - | EXISTS |
| `agents/quality/performance-validator.md` | EXISTS | - | EXISTS |
| `.ctoc/quality-state/status.json` | EXISTS | 24 | Initialized with defaults |

---

### P0: `lib/quality-state.js` — Gaps and Integration

**File:** `/home/tijn/ctoc/lib/quality-state.js` (315 lines, exists)

**Current state:** Fully functional cache read/write with atomic writes, lockfile management, PID-based stale detection, and self-healing recovery. All core functions are implemented.

**Exported API (already working):**

```javascript
// Core operations
ensureStateDir()              // Creates .ctoc/quality-state/ if missing
atomicWrite(filePath, data)   // Write temp file -> rename (corruption-safe)
safeRead(filePath, default)   // JSON.parse with fallback

// Lock management
acquireLock()    // Returns true if acquired, false if another process running
releaseLock()    // Only releases if current process owns the lock
isProcessAlive(pid)  // Check if PID is running (for stale lock detection)

// Status management
getStatus()                    // Returns current status.json or defaults
updateStatus(updates)          // Merge updates into status.json
setRunning(triggeredBy)        // Mark state as "running"
setCompleted(passed, summary)  // Mark as "pass"/"fail" with summary
recoverIfNeeded()              // Detect interrupted runs, reset to "unknown"

// File hashes (delegates to hash-utils)
getFileHashes()                // Read file-hashes.json
updateFileHashes(hashes)       // Merge new hashes into cache

// Coverage map
getCoverageMap()               // Read coverage-map.json
updateCoverageMap(map)         // Write full map
needsCoverageMapRebuild()      // Check age and emptiness
```

**Gap 1: STATE_DIR uses `process.cwd()` instead of project root**

The current implementation:
```javascript
const STATE_DIR = path.join(process.cwd(), '.ctoc', 'quality-state');
```

This is fragile because `process.cwd()` may differ when called from git hooks versus normal execution. Must use `findProjectRoot()` from `lib/project-root.js`.

**Fix required:**
```javascript
const { findProjectRoot } = require('./project-root');

function getStateDir() {
  const root = findProjectRoot();
  return path.join(root, '.ctoc', 'quality-state');
}
```

All dependent paths (`STATUS_FILE`, `LOCK_FILE`, `FILE_HASHES`, `COVERAGE_MAP`) must become functions or be lazily computed, since `findProjectRoot()` may not be available at module load time when invoked from a git hook.

**Gap 2: Tier-level status updates missing**

`updateStatus()` merges at the top level but the plan requires per-tier status updates. Need:

```javascript
/**
 * Update a specific tier's status
 * @param {string} tierName - 'tier1', 'tier2', or 'tier3'
 * @param {Object} tierResult - { status, checkedAt, warnings?, details? }
 */
function updateTierStatus(tierName, tierResult) {
  const status = getStatus();
  status.tiers[tierName] = {
    ...status.tiers[tierName],
    ...tierResult,
    checkedAt: new Date().toISOString()
  };
  atomicWrite(getStatusFilePath(), status);
  return status;
}
```

**Gap 3: Git HEAD tracking not wired**

`getStatus()` returns `gitHead: null` by default but never gets populated. The quality agent must set this when starting:

```javascript
function setRunning(triggeredBy = 'manual') {
  const gitHead = getGitHead(); // from quality-agent.js or inline
  return updateStatus({
    overallStatus: 'running',
    gitHead,
    lastRun: { ... }
  });
}
```

**Gap 4: `.gitignore` entry missing**

The `.ctoc/quality-state/` directory is NOT in `.gitignore`. The plan specifies it should be gitignored (Decision 4: Local-only cache). Must add:

```
# Quality state cache (local-only, per-developer)
.ctoc/quality-state/
```

**Integration point with `lib/background.js`:**

`quality-state.js` operates independently from the existing `lib/background.js` status tracking. They serve different purposes:
- `background.js`: Tracks plan-level background agents (research, implementation-planner, etc.)
- `quality-state.js`: Tracks quality check state (tests, lint, security)

No direct integration needed, but the `PostToolUse.status-check.js` hook should be extended (per Decision 17) to also read `quality-state/status.json` and inject quality context when status is not `pass`.

---

### P0: `lib/hash-utils.js` — Gaps and Integration

**File:** `/home/tijn/ctoc/lib/hash-utils.js` (316 lines, exists)

**Current state:** Fully functional. All required functions are implemented and working.

**Exported API (already working):**

```javascript
// Core hashing
hashFile(filePath)           // SHA256 of file contents, returns hex string or null
hashString(content)          // SHA256 of string content
hashFiles(filePaths)         // Map of filePath -> hash for multiple files
hashFilesComposite(paths)    // Single combined hash for set of files

// Change detection
hasFileChanged(filePath, cachedHash)     // Compare current vs cached, returns { changed, reason, currentHash, cachedHash }
findChangedFiles(filePaths, cachedHashes) // Categorize files: changed[], unchanged[], missing[], newFiles[]

// Utilities
createHashEntry(filePath)    // { hash, lastModified, size } for coverage map entries
verifyFileIntegrity(path, expected)  // Timing-safe comparison
hashDirectory(dirPath, options)      // Recursive directory hashing (for monorepo)
```

**Gaps: None significant.**

This module is complete and ready for integration. The only minor note:

- Uses `crypto.timingSafeEqual` for `verifyFileIntegrity()` which is good security practice but is only used for integrity verification, not for the normal change-detection path (`findChangedFiles` uses simple `!==` comparison, which is correct for non-security-sensitive hash comparison).

**Integration with `quality-state.js`:**

The data flow is:
```
quality-agent.js
  -> gets changed files from git
  -> calls hash-utils.findChangedFiles(files, qualityState.getFileHashes())
  -> runs tests on changed files
  -> calls qualityState.updateFileHashes(newHashes)
```

This integration is already wired in `quality-agent.js` implicitly (the agent runs tests on all changes), but **not explicitly using the hash-based incremental approach yet**. See quality-agent.js gaps below.

---

### P0: `lib/quality-agent.js` — Gaps and Integration

**File:** `/home/tijn/ctoc/lib/quality-agent.js` (378 lines, exists)

**Current state:** Functional skeleton that runs lint, typecheck, tests, and security scan sequentially. Missing the smart test selection (hash-based), tiered orchestration, and proper error reporting.

**Current flow:**
```
main()
  -> recoverIfNeeded()
  -> acquireLock()
  -> setRunning()
  -> detectTools()                    // from tool-detector.js
  -> runLint(tools)                   // sequential
  -> runTypecheck(tools)              // sequential
  -> runTests(tools)                  // runs ALL tests, not affected-only
  -> runSecurityScan()                // basic secret grep
  -> setCompleted(allPassed, summary)
  -> if allPassed && onSuccess=='push': git push
  -> releaseLock()
```

**Gap 1: No smart test selection (the core value proposition)**

The current `runTests()` runs the full test suite (`npm test` / `pytest` / etc.). It does NOT:
- Check file hashes to find changed files
- Look up coverage map for affected tests
- Run only affected tests
- Fall back to heuristics when coverage map is missing

**Required change:** Replace `runTests(tools)` with smart test selection:

```javascript
const { findChangedFiles } = require('./hash-utils');
const { getFileHashes, updateFileHashes } = require('./quality-state');
const { findAffectedTests } = require('./coverage-map');

async function runSmartTests(tools) {
  console.log('\n Running tests...');

  // 1. Get changed files from git
  const changedResult = runCommand('git diff HEAD~1 --name-only', { silent: true, allowFail: true });
  const gitChangedFiles = (changedResult.output || '').split('\n').filter(f => f.trim());

  // 2. Compare hashes to find actually-changed files
  const cachedHashes = getFileHashes();
  const hashResult = findChangedFiles(
    gitChangedFiles.map(f => path.resolve(f)),
    cachedHashes
  );

  if (hashResult.changed.length === 0) {
    console.log('   No file content changes detected. Cache valid.');
    return { passed: true, passed: 0, failed: 0, skipped: 0, flaky: 0, cached: true };
  }

  // 3. Find affected tests via coverage map
  const affected = findAffectedTests(hashResult.changed, cachedHashes);

  if (affected.requiresFullSuite) {
    console.log(`   Full suite required: ${affected.reason}`);
    // Fall back to full suite
    return runFullTests(tools);
  }

  if (affected.tests.length === 0) {
    console.log('   No tests affected by changes.');
    return { passed: true, passed: 0, failed: 0, skipped: 0, flaky: 0 };
  }

  // 4. Run only affected tests
  console.log(`   Running ${affected.tests.length} affected tests...`);
  const result = runSpecificTests(tools, affected.tests);

  // 5. Update hash cache on success
  if (result.passed) {
    updateFileHashes(hashResult.currentHashes);
  }

  return result;
}
```

**Gap 2: No tiered execution**

The current agent runs all checks as one flat list. The plan requires Tier 1 (blocking) and Tier 2 (warning) separation:

```javascript
async function runTieredChecks(tools) {
  // Tier 1: BLOCKING
  const tier1 = {
    lint: await runLint(tools),
    typecheck: await runTypecheck(tools),
    tests: await runSmartTests(tools),
    security: await runSecurityScan()
  };

  const tier1Passed = Object.values(tier1).every(r => r.passed);
  qualityState.updateTierStatus('tier1', {
    status: tier1Passed ? 'pass' : 'fail',
    checks: tier1
  });

  if (!tier1Passed) {
    return { tier1, tier2: null, allPassed: false, action: 'block' };
  }

  // Tier 2: WARNING (run only if Tier 1 passed)
  // Note: Tier 2 checks are aspirational for v1; start with empty
  const tier2 = {};
  qualityState.updateTierStatus('tier2', {
    status: 'pass',
    checks: tier2
  });

  return { tier1, tier2, allPassed: true, action: 'push' };
}
```

**Gap 3: `runCommand()` does not support running specific test files**

The current implementation calls the generic test command (e.g., `npm test`). Need:

```javascript
/**
 * Run specific test files
 * @param {Object} tools - Detected tools per language
 * @param {string[]} testFiles - Specific test file paths
 */
function runSpecificTests(tools, testFiles) {
  // For Jest: npx jest --findRelatedTests file1.js file2.js
  // For pytest: pytest test1.py test2.py
  // For go: go test ./specific/package/...

  for (const [lang, langTools] of Object.entries(tools)) {
    if (!langTools.test) continue;

    let cmd;
    if (langTools.testFramework === 'jest') {
      cmd = `npx jest ${testFiles.join(' ')}`;
    } else if (langTools.testFramework === 'vitest') {
      cmd = `npx vitest run ${testFiles.join(' ')}`;
    } else if (langTools.testFramework === 'pytest') {
      cmd = `pytest ${testFiles.join(' ')}`;
    } else {
      // Fallback: run full suite
      cmd = langTools.test;
    }

    const result = runCommand(cmd, { allowFail: true, silent: true });
    // ... parse result
  }
}
```

**Gap 4: `pushToRemote()` does not handle remote conflicts (Decision 15)**

The plan requires pull-rebase-then-push on conflict:

```javascript
function pushToRemote() {
  try {
    runCommand('git push', { silent: false });
    return true;
  } catch (err) {
    if (err.message.includes('rejected') || err.message.includes('non-fast-forward')) {
      console.log('   Remote ahead, rebasing...');
      try {
        runCommand('git pull --rebase', { silent: false });
        // Re-run affected tests on rebased code
        // Then push again
        runCommand('git push', { silent: false });
        return true;
      } catch (rebaseErr) {
        console.log('   Conflict during rebase. Run `ctoc sync` to resolve.');
        return false;
      }
    }
    return false;
  }
}
```

**Gap 5: Duplicate property name bug in `runTests()`**

Lines 149-151 and 173-176 in the existing code have duplicate `passed` properties:
```javascript
return {
  passed: false,    // boolean - is this pass or fail
  passed: totalPassed,  // number - BUG: overwrites the boolean above
  ...
};
```

This must be fixed by renaming the count property:
```javascript
return {
  passed: false,
  passCount: totalPassed,
  failed: totalFailed + 1,
  ...
};
```

**Integration points:**

| Consumer | How it uses quality-agent.js |
|----------|----------------------------|
| `hooks/post-commit.js` | Spawns as detached background process |
| `PostToolUse.status-check.js` | Reads resulting `status.json` (Decision 17, not yet wired) |
| `lib/cmd-quality.js` | Could invoke directly for `ctoc quality` command (not yet wired) |
| `lib/actions.js` | Could trigger at stage transition for Tier 3 (not yet wired) |

---

### P0: `hooks/post-commit.js` — Gaps and Integration

**File:** `/home/tijn/ctoc/hooks/post-commit.js` (89 lines, exists)

**Current state:** Functional. Correctly spawns the quality agent as a detached background process. Has proper skip conditions (merge, rebase, env var).

**Exported API:**
```javascript
main()         // Entry point: shouldRun() -> startAgent()
shouldRun()    // Check CTOC_SKIP_QUALITY, merge/rebase state
startAgent()   // Spawn quality-agent.js detached with stdio: 'ignore'
```

**Gap 1: Not registered in `.claude-plugin/hooks.json`**

The current `hooks.json` has `SessionStart`, `PostToolUse`, `PreToolUse` hooks but **no post-commit hook registration**. This is because Claude Code plugin hooks and git hooks are different systems:

- Claude Code hooks: `SessionStart`, `PreToolUse`, `PostToolUse` (in `.claude-plugin/hooks.json`)
- Git hooks: `post-commit`, `pre-commit`, etc. (in `.git/hooks/`)

The `post-commit.js` must be installed as a **git hook**, not a Claude Code hook. This requires a setup step.

**Integration approach:**

The `hooks-installer.js` (already exists at `lib/hooks-installer.js`) should be extended to install the post-commit hook:

```javascript
// In lib/hooks-installer.js or via ctoc init:
function installPostCommitHook(projectRoot) {
  const hooksDir = path.join(projectRoot, '.git', 'hooks');
  const hookPath = path.join(hooksDir, 'post-commit');
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || path.join(__dirname, '..');
  const agentHookPath = path.join(pluginRoot, 'hooks', 'post-commit.js');

  // Create hook script that delegates to our post-commit.js
  const hookContent = `#!/bin/sh
# CTOC post-commit hook - triggers background quality agent
node "${agentHookPath}" 2>/dev/null &
`;

  fs.writeFileSync(hookPath, hookContent, { mode: 0o755 });
}
```

**Gap 2: Agent path resolution**

The current code uses `__dirname` to find the quality agent:
```javascript
const agentPath = path.join(__dirname, '..', 'lib', 'quality-agent.js');
```

This works when the hook runs from the plugin directory but may fail when installed as a git hook in the user's project. The hook should use `CLAUDE_PLUGIN_ROOT` env var or find the plugin root dynamically.

**Gap 3: PostToolUse integration for Decision 17**

Per Decision 17 (Claude Quality Integration), the `PostToolUse.status-check.js` hook should also check quality state and inject context on non-pass. This requires adding to the existing hook:

```javascript
// In hooks/PostToolUse.status-check.js, add after existing agent check:

function checkQualityState() {
  const statusPath = path.join(process.cwd(), '.ctoc', 'quality-state', 'status.json');
  if (!fs.existsSync(statusPath)) return;

  try {
    const status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));

    if (status.overallStatus === 'fail') {
      console.log('\n[QUALITY GATE FAILED] Background quality checks detected failures.');
      console.log(`Status: ${status.overallStatus}`);
      if (status.summary) {
        if (status.summary.tests?.failed > 0) {
          console.log(`  Tests: ${status.summary.tests.failed} failed`);
        }
        if (status.summary.lint?.errors > 0) {
          console.log(`  Lint: ${status.summary.lint.errors} errors`);
        }
        if (status.summary.security?.critical > 0) {
          console.log(`  Security: ${status.summary.security.critical} critical`);
        }
      }
      console.log('Fix issues and commit again to retry.');
    }
  } catch {
    // Fail open
  }
}
```

---

### P1: Smart Test Runner Agent — Integration Details

**File:** `/home/tijn/ctoc/agents/testing/smart-test-runner.md` (283 lines, exists)

**Current state:** Complete agent definition with algorithm, fallback rules, test commands per language, flaky test detection, cache structure, heuristic discovery, and output format. This agent definition is ready to use.

**Integration:** The agent definition is a reference document for Claude. The actual test execution logic lives in `lib/quality-agent.js` (the `runSmartTests()` function described above). The agent markdown tells Claude how to use the tools; the lib module provides the runtime infrastructure.

**No code changes needed** to this file. The gap is in `lib/quality-agent.js` which needs to implement the algorithm described in this agent definition.

---

### P1: Quality Gate Orchestrator Agent — Integration Details

**File:** `/home/tijn/ctoc/agents/quality/quality-gate.md` (391 lines, exists)

**Current state:** Complete agent definition with tiered orchestration flow, decision matrix, output format, cache management, agent dispatch configuration, error handling, and performance targets.

**Integration:** This agent orchestrates by dispatching sub-agents via the `Task` tool. The runtime infrastructure is split between:

1. `lib/quality-agent.js` — The background runner that executes checks directly
2. `lib/quality-gate.js` — The `QualityGate` class that evaluates metrics against thresholds
3. `lib/quality-state.js` — The cache that stores results

**Wiring needed:**

The `quality-agent.js` currently does NOT use `QualityGate` class from `quality-gate.js`. After running checks, it should evaluate results through the gate:

```javascript
const { QualityGate } = require('./quality-gate');

// After running all checks:
const gate = new QualityGate(projectRoot, { mode: 'strict' });
const gateResult = gate.evaluate({
  coverage: coverageMetrics,
  security: securityMetrics,
  codeQuality: { lintErrors: results.lint.errors, lintWarnings: results.lint.warnings },
  complexity: complexityMetrics
});

// Use gateResult.passed to decide push vs block
```

---

### P1: `lib/cmd-quality.js` — Integration with Background Agent

**File:** `/home/tijn/ctoc/lib/cmd-quality.js` (574 lines, exists)

**Current state:** Full quality command implementation with init, check, dashboard, report, and trend subcommands. Uses `QualityScorer`, `CoverageChecker`, `ArchitectureDetector`, `DashboardRenderer`, and `QualityReporter`.

**Gap: No integration with the background quality agent or quality state cache**

The `runQualityCheck()` function runs its own set of checks independently. It should also:

1. Read `quality-state/status.json` to show background agent status
2. Optionally trigger a manual quality agent run for `ctoc quality --run`
3. Show quality state in the `ctoc quality status` command

**Required addition:**

```javascript
const qualityState = require('./quality-state');

async function showStatus() {
  const status = qualityState.getStatus();

  const lines = [];
  lines.push('Quality Gate Status');
  lines.push('===================');
  lines.push(`Overall: ${status.overallStatus}`);
  lines.push(`Git HEAD: ${status.gitHead || 'unknown'}`);
  lines.push(`Last run: ${status.lastRun?.completedAt || 'never'}`);
  lines.push(`Duration: ${status.lastRun?.duration ? (status.lastRun.duration / 1000).toFixed(1) + 's' : '-'}`);
  lines.push(`Triggered by: ${status.lastRun?.triggeredBy || '-'}`);
  lines.push('');

  // Tier statuses
  for (const [tier, data] of Object.entries(status.tiers)) {
    lines.push(`${tier}: ${data.status} (${data.checkedAt || 'never'})`);
  }

  return { success: true, message: lines.join('\n') };
}
```

---

### Data Flow Diagram (End-to-End)

```
git commit
    |
    v
hooks/post-commit.js
    |  spawn detached
    v
lib/quality-agent.js (background process)
    |
    |-- 1. qualityState.recoverIfNeeded()
    |-- 2. qualityState.acquireLock()
    |-- 3. qualityState.setRunning('post-commit')
    |-- 4. toolDetector.detectTools()
    |
    |-- 5. TIER 1 (blocking):
    |   |-- runLint(tools)          -> lint results
    |   |-- runTypecheck(tools)     -> typecheck results
    |   |-- runSmartTests(tools):
    |   |   |-- git diff HEAD~1 --name-only  -> changed files
    |   |   |-- hashUtils.findChangedFiles(files, qualityState.getFileHashes())
    |   |   |-- coverageMap.findAffectedTests(changedFiles)
    |   |   |-- run specific tests OR full suite
    |   |   |-- qualityState.updateFileHashes(newHashes)
    |   |   '-> test results
    |   |-- runSecurityScan()       -> security results
    |   '-- qualityState.updateTierStatus('tier1', results)
    |
    |-- 6. TIER 2 (warning, only if Tier 1 passed):
    |   |-- (future: complexity, coverage, duplication)
    |   '-- qualityState.updateTierStatus('tier2', results)
    |
    |-- 7. qualityState.setCompleted(allPassed, summary)
    |
    |-- 8. if allPassed:
    |   |-- pushToRemote() with pull-rebase on conflict
    |   '-- console.log('Pushed!')
    |-- 8. if failed:
    |   '-- console.log('Fix issues...')
    |
    '-- 9. qualityState.releaseLock()


PostToolUse.status-check.js (on every tool use):
    |-- Read .ctoc/quality-state/status.json
    |-- if status != 'pass' and status != 'unknown':
    |   '-- Inject quality failure context into Claude conversation
    '-- (existing: check for pending plan agents)


ctoc quality status (manual command):
    |-- Read .ctoc/quality-state/status.json
    '-- Display tiered results + last run info
```

---

### Module Dependency Graph (P0-P1 Only)

```
hooks/post-commit.js
    '-> lib/quality-agent.js
           |-> lib/quality-state.js
           |       '-> lib/project-root.js
           |-> lib/hash-utils.js (crypto, fs, path)
           |-> lib/tool-detector.js (fs, path, child_process)
           |-> lib/coverage-map.js
           |       |-> lib/hash-utils.js
           |       '-> lib/quality-state.js (atomicWrite, safeRead)
           '-> lib/quality-gate.js (QualityGate class)

hooks/PostToolUse.status-check.js
    '-> reads .ctoc/quality-state/status.json (file I/O, no module dep)
```

---

### Configuration Requirements

**File: `.ctoc/quality-config.yaml`** (template already defined in plan)

For P0/P1, the minimum viable config is:

```yaml
# Minimum viable quality config
tiers:
  tier1:
    blocking: true
    checks: [lint, typecheck, affected-tests, secrets]

push:
  autoPush: true
  allowWarnings: false

cache:
  location: .ctoc/quality-state
```

Full config parsing is deferred to P2 (`lib/tool-detector.js` `readUserConfig()` currently returns raw content without YAML parsing).

---

### `.gitignore` Changes Required

Add to `/home/tijn/ctoc/.gitignore`:

```
# Quality state cache (local-only, per-developer)
.ctoc/quality-state/
```

This prevents quality state from being committed (Decision 4: Local-only cache).

---

### Testing Strategy for P0-P1

Since the quality gate system is infrastructure code that runs in the background, testing focuses on:

1. **Unit tests for `lib/hash-utils.js`:**
   - `hashFile()` returns consistent SHA256 for same content
   - `findChangedFiles()` correctly categorizes changed/unchanged/new/missing
   - `hashDirectory()` respects exclusion patterns

2. **Unit tests for `lib/quality-state.js`:**
   - `atomicWrite()` survives interrupted writes (write then check file exists and is valid JSON)
   - `acquireLock()` prevents double-acquisition
   - `acquireLock()` cleans stale locks from dead PIDs
   - `setRunning()` / `setCompleted()` round-trip through `getStatus()`
   - `recoverIfNeeded()` resets stuck "running" state

3. **Unit tests for `lib/coverage-map.js`:**
   - `findAffectedTests()` returns mapped tests for known files
   - `findAffectedTests()` falls back to heuristics for unmapped files
   - `findAffectedTests()` requires full suite when config files change
   - `findTestsByHeuristic()` finds co-located tests

4. **Integration test for `lib/quality-agent.js`:**
   - Mock `execSync` to simulate lint/test/security commands
   - Verify state transitions: unknown -> running -> pass/fail
   - Verify lock acquire/release lifecycle
   - Verify push is called on pass, not called on fail

5. **Hook test for `hooks/post-commit.js`:**
   - Verify `shouldRun()` returns false during merge/rebase
   - Verify `startAgent()` spawns detached process
   - Verify `CTOC_SKIP_QUALITY=1` suppresses agent

---

### Implementation Order (within P0-P1)

```
Step 1: Fix quality-state.js
   - Replace process.cwd() with findProjectRoot()
   - Add updateTierStatus()
   - Add gitHead tracking in setRunning()
   - Fix: add .ctoc/quality-state/ to .gitignore

Step 2: Wire quality-agent.js smart test selection
   - Import hash-utils and coverage-map
   - Implement runSmartTests() using findChangedFiles + findAffectedTests
   - Implement runSpecificTests() with framework-specific commands
   - Fix duplicate `passed` property bug
   - Add tiered execution (tier1 blocking, tier2 warning)

Step 3: Wire push conflict handling
   - Implement pull-rebase-push in pushToRemote()
   - Add re-test on rebased code

Step 4: Wire PostToolUse quality context injection
   - Extend PostToolUse.status-check.js to read quality state
   - Inject failure context into Claude conversation

Step 5: Wire git hook installation
   - Extend lib/hooks-installer.js to install post-commit hook
   - Handle CLAUDE_PLUGIN_ROOT for cross-project installation

Step 6: Wire cmd-quality.js status command
   - Add showStatus() reading from quality-state
   - Connect to ctoc quality status menu option
```

---

### Risk Assessment

| Risk | Mitigation |
|------|------------|
| Background agent orphaned on crash | PID-based lock with stale detection (already implemented) |
| `process.cwd()` differs in git hooks | Replace with `findProjectRoot()` (Step 1) |
| YAML config parsing without library | Defer full YAML parsing to P2; use JSON fallback for P0 |
| Coverage map never built (no coverage tooling) | Import analysis fallback in `findTestsByHeuristic()` (already implemented) |
| Tests pass locally but fail on push | Pull-rebase + re-test handles remote conflicts (Step 3) |
| Quality agent blocks terminal | Already spawned detached with `stdio: 'ignore'` |
| Multiple commits before agent finishes | Lock prevents concurrent runs; latest commit triggers new run |
