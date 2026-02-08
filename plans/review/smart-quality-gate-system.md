---
approved_by: human
approved_at: 2026-02-03T10:00:00Z
gate_crossed: functional → implementation
---

---
approved_by: human
approved_at: 2026-02-04T13:00:00Z
gate_crossed: implementation → todo
---

---
title: "Smart Quality Gate System"
created: "2026-02-03T09:45:00Z"
priority: HIGH
type: feature
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

## Quality Gate Taxonomy

```
┌─────────────────────────────────────────────────────────────────┐
│                    QUALITY GATE TIERS                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  TIER 1: BLOCKING (Must pass before commit)        ~5-30s       │
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
│                    CTOC + BACKGROUND QUALITY AGENT               │
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

## Acceptance Criteria

- [ ] git commit never blocks (instant)
- [ ] Background agent auto-starts on commit
- [ ] Smart test runner only runs affected tests
- [ ] Coverage map built from coverage reports
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
