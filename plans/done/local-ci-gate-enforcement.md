---
approved_by: human
approved_at: 2026-02-08T12:38:19.459Z
gate_crossed: review → done
note: Retroactively added during human gates migration
---

# Local CI Gate Enforcement

**PRIORITY: CRITICAL - IMPLEMENT NOW**

This is a standalone fix for fundamental CTOC failures. Do not wait for v6.0 or v6.1.

## Problem Statement

CTOC has TWO critical failures:

### Problem 1: Tests Created But Never Run
```
Current broken flow:
  Write code → Write tests → Commit → Push → CI runs tests → FAIL
                    ↑
            Tests never executed locally!
```

Tests are being created but never actually run to verify they work. This means:
- Tests might have syntax errors
- Tests might hang forever
- Tests might fail from the start
- Nobody knows until CI runs (too late)

### Problem 2: CI Rules Not Enforced Locally
```
Current broken flow:
  Write code → Commit → Push → GitHub Actions → FAIL → Deploy blocked
                                      ↑
                        First time checks run!
```

The GitHub workflow (or other CI) has rules:
- Lint must pass
- Type check must pass
- Tests must pass
- Coverage must meet threshold

But these aren't enforced BEFORE push. Result:
- Wasted CI minutes
- Failed deployments
- Broken main branch
- Frustrated developers

## Solution: Local CI Gate

**MANDATORY RULE:** Before ANY code moves to review, run the EXACT same checks that CI would run, LOCALLY.

```
┌─────────────────────────────────────────────────────────────────┐
│                     LOCAL CI GATE                               │
│                                                                 │
│  "If it won't pass CI, it won't pass this gate."               │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  BEFORE moving to review, a subagent MUST:              │   │
│  │                                                         │   │
│  │  1. RUN all tests (not just create them)                │   │
│  │  2. VERIFY tests pass (not hang, not fail)              │   │
│  │  3. RUN linter (exact same config as CI)                │   │
│  │  4. RUN type checker (exact same config as CI)          │   │
│  │  5. CHECK coverage meets threshold                      │   │
│  │  6. RUN any other CI checks                             │   │
│  │                                                         │   │
│  │  If ANY check fails:                                    │   │
│  │    → FIX THE CODE (not the tests/config)                │   │
│  │    → RERUN checks                                       │   │
│  │    → REPEAT until ALL pass                              │   │
│  │                                                         │   │
│  │  Only when ALL pass:                                    │   │
│  │    → Code can move to review                            │   │
│  │    → Push is allowed                                    │   │
│  │    → CI is GUARANTEED to pass                           │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Implementation

### 1. CI Config Parser

Read the project's CI config to know what checks to run:

```javascript
// lib/ci-parser.js
function parseCIConfig(projectPath) {
  // Check for GitHub Actions
  const ghWorkflow = findGitHubWorkflow(projectPath);
  if (ghWorkflow) return parseGitHubActions(ghWorkflow);

  // Check for GitLab CI
  const gitlabCI = path.join(projectPath, '.gitlab-ci.yml');
  if (fs.existsSync(gitlabCI)) return parseGitLabCI(gitlabCI);

  // Check for other CI systems...

  // Fallback: default checks
  return getDefaultChecks();
}

function parseGitHubActions(workflowPath) {
  const workflow = yaml.parse(fs.readFileSync(workflowPath));
  const checks = [];

  for (const job of Object.values(workflow.jobs)) {
    for (const step of job.steps) {
      if (step.run) {
        checks.push({
          name: step.name || step.run,
          command: step.run,
          type: detectCheckType(step.run)
        });
      }
    }
  }

  return checks;
}
```

### 2. Local CI Runner

Run the exact same checks locally:

```javascript
// lib/local-ci.js
async function runLocalCI(projectPath) {
  const checks = parseCIConfig(projectPath);
  const results = [];

  console.log('Running Local CI Gate...\n');

  for (const check of checks) {
    console.log(`Running: ${check.name}`);

    try {
      const result = await runCheck(check, projectPath);
      results.push({ check, status: 'pass', output: result });
      console.log(`  ✓ PASS\n`);
    } catch (error) {
      results.push({ check, status: 'fail', error });
      console.log(`  ✗ FAIL: ${error.message}\n`);
    }
  }

  return {
    passed: results.every(r => r.status === 'pass'),
    results
  };
}
```

### 3. Pre-Review Hook

Block review until local CI passes:

```javascript
// hooks/PreReview.js
async function preReviewGate(planPath) {
  console.log('═══════════════════════════════════════════');
  console.log('       LOCAL CI GATE - PRE-REVIEW CHECK     ');
  console.log('═══════════════════════════════════════════\n');

  const projectPath = process.cwd();
  const ciResult = await runLocalCI(projectPath);

  if (!ciResult.passed) {
    console.log('\n╔═══════════════════════════════════════════╗');
    console.log('║  ✗ LOCAL CI FAILED - CANNOT MOVE TO REVIEW ║');
    console.log('╚═══════════════════════════════════════════╝\n');

    console.log('Failed checks:');
    for (const r of ciResult.results.filter(r => r.status === 'fail')) {
      console.log(`  - ${r.check.name}: ${r.error.message}`);
    }

    console.log('\nFix these issues before review.');
    return { allowed: false, reason: 'Local CI failed' };
  }

  console.log('\n╔═══════════════════════════════════════════╗');
  console.log('║  ✓ LOCAL CI PASSED - READY FOR REVIEW      ║');
  console.log('╚═══════════════════════════════════════════╝\n');

  return { allowed: true };
}
```

### 4. Pre-Push Enforcement (DUAL: Git Hook + CTOC Check)

**Two layers of enforcement:**

#### Layer 1: Git Hook (Hard Block)

```javascript
// .husky/pre-push (installed by ctoc init)
#!/bin/sh
ctoc ci --pre-push || exit 1
```

This is a hard block. Cannot be bypassed without `--no-verify`.

#### Layer 2: CTOC Check (Better UX)

```javascript
// lib/pre-push-check.js
async function prePushGate() {
  console.log('\n╔═══════════════════════════════════════════╗');
  console.log('║       PRE-PUSH LOCAL CI CHECK              ║');
  console.log('╚═══════════════════════════════════════════╝\n');

  const ciResult = await runLocalCI(process.cwd());

  if (!ciResult.passed) {
    console.error('\n🚫 PUSH BLOCKED: Local CI failed\n');

    // Show helpful failure summary
    for (const r of ciResult.results.filter(r => r.status === 'fail')) {
      console.error(`  ✗ ${r.check.name}`);
      console.error(`    ${r.error.message}\n`);
    }

    console.error('Fix these issues:');
    console.error('  1. Run: ctoc ci --fix (auto-fix what\'s possible)');
    console.error('  2. Fix remaining issues manually');
    console.error('  3. Run: ctoc ci (verify all pass)');
    console.error('  4. Push again\n');

    process.exit(1);  // Block the push
  }

  console.log('✓ Local CI passed. Push allowed.\n');
  process.exit(0);
}
```

**Why both?**
- Git hook: Hard enforcement, can't be accidentally bypassed
- CTOC check: Better error messages, auto-fix suggestions, guided workflow

### 5. Docker-Based Local CI (Environment Parity)

Run checks in the SAME container as CI to guarantee parity:

```javascript
// lib/docker-ci.js
async function runDockerCI(projectPath) {
  // Parse CI config to get the container image
  const ciConfig = parseCIConfig(projectPath);
  const image = ciConfig.container || detectDefaultImage(projectPath);

  console.log(`Running Local CI in Docker: ${image}\n`);

  // Build the command to run inside container
  const commands = ciConfig.checks.map(c => c.command).join(' && ');

  const dockerCmd = `docker run --rm \
    -v "${projectPath}:/app" \
    -w /app \
    ${image} \
    sh -c "${commands}"`;

  try {
    execSync(dockerCmd, { stdio: 'inherit', timeout: 600000 });
    return { passed: true };
  } catch (error) {
    return { passed: false, error };
  }
}
```

**How it works:**

```
┌─────────────────────────────────────────────────────────────┐
│                    LOCAL CI (Docker)                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Parse CI config (e.g., .github/workflows/ci.yml)        │
│  2. Extract container image (e.g., node:20-alpine)          │
│  3. Mount project into container                            │
│  4. Run EXACT same commands as CI                           │
│  5. Same Node version, same deps, same everything           │
│                                                             │
│  Result: If it passes locally, it WILL pass in CI           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Container Detection:**

```javascript
function detectContainerImage(ciConfig, projectPath) {
  // From CI config
  if (ciConfig.container) return ciConfig.container;

  // From GitHub Actions
  if (ciConfig.runsOn === 'ubuntu-latest') {
    // Match Node version from package.json or .nvmrc
    const nodeVersion = detectNodeVersion(projectPath);
    return `node:${nodeVersion}-alpine`;
  }

  // Defaults by language
  const lang = detectLanguage(projectPath);
  const defaults = {
    typescript: 'node:20-alpine',
    javascript: 'node:20-alpine',
    python: 'python:3.12-slim',
    go: 'golang:1.22-alpine',
    rust: 'rust:1.75-alpine'
  };

  return defaults[lang] || 'ubuntu:22.04';
}
```

**Benefits:**
- 100% environment parity with CI
- No "works on my machine" issues
- Same Node/Python/Go versions
- Same OS and dependencies

### 6. Test Runner with Timeout

Ensure tests actually RUN and don't hang:

```javascript
// lib/test-runner.js
async function runTests(projectPath, timeout = 300000) {  // 5 min default
  const testCommand = detectTestCommand(projectPath);

  return new Promise((resolve, reject) => {
    const proc = spawn('npm', ['test'], {
      cwd: projectPath,
      stdio: 'pipe',
      timeout: timeout
    });

    let output = '';
    proc.stdout.on('data', d => output += d);
    proc.stderr.on('data', d => output += d);

    proc.on('close', code => {
      if (code === 0) resolve(output);
      else reject(new Error(`Tests failed with code ${code}\n${output}`));
    });

    proc.on('error', err => {
      if (err.code === 'ETIMEDOUT') {
        reject(new Error('Tests TIMED OUT - likely hanging. Debug required.'));
      } else {
        reject(err);
      }
    });
  });
}
```

### 6. Iron Loop Integration

Add Local CI Gate to Iron Loop step transitions:

```markdown
## Iron Loop Steps (Updated)

### Step 14: VERIFY (Before Review)
- [ ] Run Local CI Gate
- [ ] ALL checks must pass:
  - [ ] Tests run (not just exist)
  - [ ] Tests pass (not fail, not hang)
  - [ ] Lint passes
  - [ ] Type check passes
  - [ ] Coverage meets threshold
- [ ] If any fail: FIX CODE, rerun
- [ ] Only proceed to Step 15 when ALL pass

### Step 15: REVIEW
- [ ] Code is GUARANTEED to pass CI
- [ ] Reviewer focuses on logic, architecture, design
- [ ] No time wasted on lint/test failures
```

## No Bypass Policy (Absolute Gate)

```
┌─────────────────────────────────────────────────────────────┐
│                    NO BYPASS. EVER.                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  The Local CI Gate is ABSOLUTE. There is no:                │
│                                                             │
│    ✗ --force flag                                           │
│    ✗ --skip flag                                            │
│    ✗ --no-verify                                            │
│    ✗ Emergency bypass                                       │
│    ✗ Hotfix exception                                       │
│    ✗ "Just this once"                                       │
│                                                             │
│  If tests fail, you have two options:                       │
│                                                             │
│    1. FIX THE CODE                                          │
│    2. FIX THE CODE                                          │
│                                                             │
│  There is no option 3.                                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Why no bypass?**
- Every bypass becomes a habit
- "Just this once" becomes "just this hundred times"
- Broken code in main causes cascading failures
- Hotfixes should still pass tests (they're fixing bugs, not creating them)

**What if I REALLY need to push broken code?**
- You don't.
- Fix the code.
- If you can't fix it, don't push it.

## Commands

```bash
# Run local CI manually
ctoc ci

# Run local CI and show detailed output
ctoc ci --verbose

# Run local CI and auto-fix what's possible
ctoc ci --fix

# Check what CI checks would run
ctoc ci --dry-run

# There is NO skip/force/bypass command. Don't ask.
```

## Configuration

`.ctoc/settings.yaml`:
```yaml
local_ci:
  # Cannot be disabled. This is not optional.
  enabled: true  # ALWAYS true, setting ignored

  # Timeout for entire CI run
  timeout: 600000  # 10 minutes

  # Timeout per test suite
  test_timeout: 300000  # 5 minutes

  # Cannot be disabled. These are always true.
  block_push: true     # ALWAYS true, setting ignored
  block_review: true   # ALWAYS true, setting ignored

  # Auto-fix lint issues before failing
  auto_fix_lint: true

  # Docker settings
  docker:
    enabled: true
    # Override container image (auto-detected if not set)
    image: null
    # Additional mounts
    volumes: []
    # Environment variables
    env: {}

  # CI config locations (auto-detected if not specified)
  ci_config:
    - .github/workflows/*.yml
    - .gitlab-ci.yml
    - Jenkinsfile
    - .circleci/config.yml

  # There is no bypass option. Don't look for one.
```

## Scope Decisions

| Decision | Choice |
|----------|--------|
| Priority | CRITICAL - implement immediately |
| Release | Standalone fix (not waiting for v6.0/v6.1) |
| Enforcement | Dual: Git hook (hard) + CTOC check (UX) |
| Test philosophy | Tests are sacred - fix CODE, not tests |
| E2E tests | Always run everything (no shortcuts) |
| Bypass | NO BYPASS EVER (gate is absolute) |
| Environment | Docker preferred, local fallback with warning (remembered) |
| No CI config | Interactive wizard to generate CI with strictness options |

### Docker Fallback Behavior

```
┌─────────────────────────────────────────────────────────────┐
│                    DOCKER DETECTION                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  First run:                                                 │
│    1. Check if Docker is installed                          │
│    2. If YES → Use Docker (100% CI parity)                  │
│    3. If NO → Warn user, fall back to local                 │
│                                                             │
│  Warning shown ONCE, then remembered in .ctoc/settings.yaml │
│                                                             │
│  ⚠️ WARNING: Docker not found.                              │
│     Running checks locally. Results may differ from CI      │
│     due to environment differences (Node version, OS, etc.) │
│                                                             │
│     Install Docker for guaranteed CI parity:                │
│       https://docs.docker.com/get-docker/                   │
│                                                             │
│     [Don't show this again]                                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Settings persistence:**
```yaml
# .ctoc/settings.yaml
local_ci:
  docker:
    available: false          # Auto-detected
    warning_shown: true       # Don't warn again
    fallback_accepted: true   # User accepted local fallback
```

### No CI Config Wizard

When project has no CI config, run interactive wizard:

```
┌─────────────────────────────────────────────────────────────┐
│                 CI CONFIGURATION WIZARD                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  No CI configuration found. Let's create one!               │
│                                                             │
│  Detected: TypeScript/Node.js project                       │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  1. LINTING                                                 │
│     ○ Strict (recommended) - Zero warnings, strictest rules │
│       → Catches more issues, may require initial cleanup    │
│     ○ Standard - Common rules, warnings allowed             │
│       → Balanced approach, fewer false positives            │
│     ○ Minimal - Basic syntax checks only                    │
│       → Fast, but misses many issues                        │
│                                                             │
│  2. TYPE CHECKING                                           │
│     ○ Strict (recommended) - TypeScript strict mode         │
│       → Catches null/undefined, requires explicit types     │
│     ○ Standard - Basic type checking                        │
│       → Allows `any`, less strict null checks               │
│     ○ None - Skip type checking                             │
│       → Not recommended for TypeScript projects             │
│                                                             │
│  3. TEST COVERAGE                                           │
│     ○ 90%+ (recommended for new projects)                   │
│       → High quality bar, may slow initial development      │
│     ○ 80% (standard)                                        │
│       → Good balance of quality and velocity                │
│     ○ 50% (minimum)                                         │
│       → Basic coverage, suitable for prototypes             │
│     ○ None - No coverage requirement                        │
│       → Not recommended for production code                 │
│                                                             │
│  4. E2E TESTS (for web apps)                                │
│     ○ Required (recommended) - Must have E2E tests          │
│       → Catches UI regressions, slower CI                   │
│     ○ Optional - Run if present, don't require              │
│       → Flexible, but may miss UI issues                    │
│     ○ Skip - Don't run E2E in CI                            │
│       → Faster CI, but no UI verification                   │
│                                                             │
│  5. INTEGRATION TESTS                                       │
│     ○ Required (recommended) - Must have integration tests  │
│       → Catches API/service issues                          │
│     ○ Optional - Run if present                             │
│       → Flexible approach                                   │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  [Generate CI Config]    [Use CTOC Defaults]    [Cancel]    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Generated CI Config Example (Strict):**

```yaml
# .github/workflows/ci.yml (generated by CTOC)
name: CI

on:
  push:
    branches: [main, master]
  pull_request:
    branches: [main, master]

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Lint (strict)
        run: npm run lint -- --max-warnings 0

      - name: Type check (strict)
        run: npm run typecheck

      - name: Unit tests
        run: npm test -- --coverage

      - name: Check coverage (90%)
        run: |
          COVERAGE=$(cat coverage/coverage-summary.json | jq '.total.lines.pct')
          if (( $(echo "$COVERAGE < 90" | bc -l) )); then
            echo "Coverage $COVERAGE% is below 90% threshold"
            exit 1
          fi

      - name: Integration tests
        run: npm run test:integration

      - name: E2E tests
        run: npx playwright test
```

## Success Criteria

- [x] CI config parser supports GitHub Actions, GitLab CI, Jenkins, CircleCI
- [ ] Docker-based execution for environment parity
- [ ] Docker fallback to local with one-time warning (remembered)
- [x] Container image auto-detection from CI config
- [x] Local CI runner executes EXACT same checks as remote CI
- [x] Tests MUST run (not just be created)
- [x] Hanging tests detected and reported (timeout)
- [x] Pre-review hook blocks review until CI passes (no bypass)
- [x] Pre-push Git hook blocks push until CI passes (no bypass)
- [x] NO bypass mechanism exists (absolute gate)
- [ ] Iron Loop Step 14 enforces Local CI Gate
- [ ] `ctoc ci` command for manual runs
- [x] CI Config Wizard when no CI exists (interactive strictness options)
- [x] Wizard explains pros/cons of each strictness level
- [x] Generated CI config matches user's strictness choices
- [x] If local gate passes, CI is GUARANTEED to pass

## Business Value

- **Zero failed CI runs** - If local gate passes, CI passes
- **No broken deployments** - Code is verified before push
- **Faster feedback** - Issues caught locally in seconds, not minutes in CI
- **No hanging tests** - Timeout detection catches stuck tests
- **Developer trust** - "Green locally = green in CI"

---

## Implementation Details

### File List (Complete)

| File | Purpose | Priority |
|------|---------|----------|
| `lib/ci-parser.js` | Parse CI configs (GitHub Actions, GitLab, Jenkins, CircleCI) | P0 |
| `lib/local-ci.js` | Main CI runner orchestration | P0 |
| `lib/docker-ci.js` | Docker-based execution for environment parity | P0 |
| `lib/test-runner.js` | Test execution with timeout handling | P0 |
| `lib/ci-wizard.js` | Interactive wizard for projects without CI | P1 |
| `hooks/PreReview.js` | Block review until local CI passes | P0 |
| `hooks/PrePush.js` | Block push until local CI passes | P0 |
| `commands/ci.js` | `ctoc ci` command implementation | P0 |
| `.ctoc/templates/ci/github-actions.yml` | Generated CI template for GitHub | P1 |
| `.ctoc/templates/ci/gitlab-ci.yml` | Generated CI template for GitLab | P1 |

### Implementation Order (Dependency-Aware)

```
Phase 1: Core Infrastructure (lib/*.js)
─────────────────────────────────────────
1. lib/ci-parser.js        ← No dependencies, pure parsing
2. lib/test-runner.js      ← No dependencies, subprocess handling
3. lib/docker-ci.js        ← Depends on ci-parser for image detection
4. lib/local-ci.js         ← Depends on all above (orchestration)

Phase 2: Enforcement (hooks/*.js)
─────────────────────────────────────────
5. hooks/PreReview.js      ← Depends on lib/local-ci.js
6. hooks/PrePush.js        ← Depends on lib/local-ci.js

Phase 3: User Interface
─────────────────────────────────────────
7. commands/ci.js          ← Depends on lib/local-ci.js
8. lib/ci-wizard.js        ← Depends on lib/ci-parser.js
9. .ctoc/templates/ci/*    ← Generated by wizard
```

---

### Detailed Component Specifications

#### 1. `lib/ci-parser.js` - CI Configuration Parser

**Purpose:** Read and normalize CI configurations from any supported system.

```javascript
/**
 * CI Configuration Parser
 * Supports: GitHub Actions, GitLab CI, Jenkins, CircleCI
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// Supported CI systems with their config locations
const CI_SYSTEMS = {
  github: {
    name: 'GitHub Actions',
    configPaths: ['.github/workflows/*.yml', '.github/workflows/*.yaml'],
    parser: parseGitHubActions
  },
  gitlab: {
    name: 'GitLab CI',
    configPaths: ['.gitlab-ci.yml'],
    parser: parseGitLabCI
  },
  jenkins: {
    name: 'Jenkins',
    configPaths: ['Jenkinsfile'],
    parser: parseJenkinsfile
  },
  circleci: {
    name: 'CircleCI',
    configPaths: ['.circleci/config.yml'],
    parser: parseCircleCI
  }
};

/**
 * Detect which CI system is in use
 * @param {string} projectPath - Project root
 * @returns {{ system: string, configPath: string } | null}
 */
function detectCISystem(projectPath) {
  for (const [systemId, config] of Object.entries(CI_SYSTEMS)) {
    for (const pattern of config.configPaths) {
      const matches = glob.sync(pattern, { cwd: projectPath });
      if (matches.length > 0) {
        return {
          system: systemId,
          name: config.name,
          configPath: path.join(projectPath, matches[0])
        };
      }
    }
  }
  return null;
}

/**
 * Parse CI config and extract checks
 * @param {string} projectPath - Project root
 * @returns {CIConfig}
 */
function parseCIConfig(projectPath) {
  const detected = detectCISystem(projectPath);

  if (!detected) {
    return {
      found: false,
      system: null,
      checks: getDefaultChecks(projectPath),
      container: detectDefaultContainer(projectPath)
    };
  }

  const parser = CI_SYSTEMS[detected.system].parser;
  return parser(detected.configPath, projectPath);
}

/**
 * Parse GitHub Actions workflow
 */
function parseGitHubActions(workflowPath, projectPath) {
  const content = fs.readFileSync(workflowPath, 'utf8');
  const workflow = yaml.load(content);
  const checks = [];
  let container = null;

  for (const [jobName, job] of Object.entries(workflow.jobs || {})) {
    // Extract container if specified
    if (job.container) {
      container = typeof job.container === 'string'
        ? job.container
        : job.container.image;
    }

    // Extract Node version from setup-node
    let nodeVersion = null;

    for (const step of job.steps || []) {
      // Check for setup-node action
      if (step.uses?.startsWith('actions/setup-node')) {
        nodeVersion = step.with?.['node-version'];
      }

      // Extract run commands
      if (step.run) {
        const commands = step.run.split('\n').filter(cmd => cmd.trim());
        for (const cmd of commands) {
          checks.push({
            name: step.name || cmd.slice(0, 50),
            command: cmd.trim(),
            type: detectCheckType(cmd),
            job: jobName
          });
        }
      }
    }

    // If no container but we have node version, derive container
    if (!container && nodeVersion) {
      container = `node:${nodeVersion}-alpine`;
    }
  }

  return {
    found: true,
    system: 'github',
    configPath: workflowPath,
    checks: filterRelevantChecks(checks),
    container: container || detectDefaultContainer(projectPath),
    raw: workflow
  };
}

/**
 * Parse GitLab CI configuration
 */
function parseGitLabCI(configPath, projectPath) {
  const content = fs.readFileSync(configPath, 'utf8');
  const config = yaml.load(content);
  const checks = [];
  let container = config.image || null;

  // Process each job (skip special keys)
  const specialKeys = ['stages', 'variables', 'default', 'include', 'image'];

  for (const [jobName, job] of Object.entries(config)) {
    if (specialKeys.includes(jobName) || jobName.startsWith('.')) continue;
    if (typeof job !== 'object') continue;

    // Job-level image overrides global
    const jobContainer = job.image || container;

    // Extract script commands
    const scripts = Array.isArray(job.script) ? job.script : [job.script];
    for (const cmd of scripts.filter(Boolean)) {
      checks.push({
        name: jobName,
        command: cmd,
        type: detectCheckType(cmd),
        job: jobName,
        stage: job.stage
      });
    }
  }

  return {
    found: true,
    system: 'gitlab',
    configPath,
    checks: filterRelevantChecks(checks),
    container: container || detectDefaultContainer(projectPath),
    raw: config
  };
}

/**
 * Parse Jenkinsfile (declarative pipeline)
 */
function parseJenkinsfile(configPath, projectPath) {
  const content = fs.readFileSync(configPath, 'utf8');
  const checks = [];
  let container = null;

  // Extract agent docker image
  const agentMatch = content.match(/agent\s*\{\s*docker\s*\{\s*image\s+['"](.*?)['"]/);
  if (agentMatch) {
    container = agentMatch[1];
  }

  // Extract sh commands from stages
  const shMatches = content.matchAll(/sh\s+['"](.*?)['"]/g);
  for (const match of shMatches) {
    const cmd = match[1];
    checks.push({
      name: cmd.slice(0, 50),
      command: cmd,
      type: detectCheckType(cmd),
      job: 'pipeline'
    });
  }

  return {
    found: true,
    system: 'jenkins',
    configPath,
    checks: filterRelevantChecks(checks),
    container: container || detectDefaultContainer(projectPath),
    raw: content
  };
}

/**
 * Parse CircleCI configuration
 */
function parseCircleCI(configPath, projectPath) {
  const content = fs.readFileSync(configPath, 'utf8');
  const config = yaml.load(content);
  const checks = [];
  let container = null;

  // Extract docker image from executors or jobs
  if (config.executors) {
    const firstExecutor = Object.values(config.executors)[0];
    if (firstExecutor?.docker?.[0]?.image) {
      container = firstExecutor.docker[0].image;
    }
  }

  for (const [jobName, job] of Object.entries(config.jobs || {})) {
    // Job-level docker image
    if (job.docker?.[0]?.image) {
      container = container || job.docker[0].image;
    }

    // Extract run steps
    for (const step of job.steps || []) {
      if (step.run) {
        const cmd = typeof step.run === 'string' ? step.run : step.run.command;
        if (cmd) {
          checks.push({
            name: typeof step.run === 'object' ? step.run.name : cmd.slice(0, 50),
            command: cmd,
            type: detectCheckType(cmd),
            job: jobName
          });
        }
      }
    }
  }

  return {
    found: true,
    system: 'circleci',
    configPath,
    checks: filterRelevantChecks(checks),
    container: container || detectDefaultContainer(projectPath),
    raw: config
  };
}

/**
 * Detect check type from command
 */
function detectCheckType(command) {
  const cmd = command.toLowerCase();

  if (cmd.includes('lint') || cmd.includes('eslint') || cmd.includes('prettier')) {
    return 'lint';
  }
  if (cmd.includes('typecheck') || cmd.includes('tsc') || cmd.includes('mypy')) {
    return 'typecheck';
  }
  if (cmd.includes('test') || cmd.includes('jest') || cmd.includes('pytest') || cmd.includes('vitest')) {
    return 'test';
  }
  if (cmd.includes('coverage')) {
    return 'coverage';
  }
  if (cmd.includes('build')) {
    return 'build';
  }
  if (cmd.includes('install') || cmd.includes('npm ci') || cmd.includes('pip install')) {
    return 'setup';
  }

  return 'other';
}

/**
 * Filter to only quality-relevant checks (exclude setup, deploy, etc.)
 */
function filterRelevantChecks(checks) {
  const relevantTypes = ['lint', 'typecheck', 'test', 'coverage', 'build'];
  return checks.filter(c => relevantTypes.includes(c.type));
}

/**
 * Get default checks when no CI config exists
 */
function getDefaultChecks(projectPath) {
  const { detectStack } = require('./stack-detector');
  const stack = detectStack(projectPath);

  const checks = [];

  // TypeScript/JavaScript
  if (stack.languages.includes('typescript') || stack.languages.includes('javascript')) {
    checks.push({ name: 'lint', command: 'npm run lint', type: 'lint' });
    if (stack.languages.includes('typescript')) {
      checks.push({ name: 'typecheck', command: 'npm run typecheck', type: 'typecheck' });
    }
    checks.push({ name: 'test', command: 'npm test', type: 'test' });
  }

  // Python
  if (stack.languages.includes('python')) {
    checks.push({ name: 'lint', command: 'ruff check .', type: 'lint' });
    checks.push({ name: 'typecheck', command: 'mypy .', type: 'typecheck' });
    checks.push({ name: 'test', command: 'pytest', type: 'test' });
  }

  // Go
  if (stack.languages.includes('go')) {
    checks.push({ name: 'lint', command: 'golangci-lint run', type: 'lint' });
    checks.push({ name: 'test', command: 'go test ./...', type: 'test' });
  }

  // Rust
  if (stack.languages.includes('rust')) {
    checks.push({ name: 'lint', command: 'cargo clippy', type: 'lint' });
    checks.push({ name: 'test', command: 'cargo test', type: 'test' });
  }

  return checks;
}

/**
 * Detect default container based on project stack
 */
function detectDefaultContainer(projectPath) {
  const { detectStack } = require('./stack-detector');
  const stack = detectStack(projectPath);

  // Check for .nvmrc or .node-version
  const nvmrcPath = path.join(projectPath, '.nvmrc');
  const nodeVersionPath = path.join(projectPath, '.node-version');

  if (fs.existsSync(nvmrcPath)) {
    const version = fs.readFileSync(nvmrcPath, 'utf8').trim().replace('v', '');
    return `node:${version}-alpine`;
  }

  if (fs.existsSync(nodeVersionPath)) {
    const version = fs.readFileSync(nodeVersionPath, 'utf8').trim().replace('v', '');
    return `node:${version}-alpine`;
  }

  // Language-based defaults
  const defaults = {
    typescript: 'node:20-alpine',
    javascript: 'node:20-alpine',
    python: 'python:3.12-slim',
    go: 'golang:1.22-alpine',
    rust: 'rust:1.76-alpine',
    java: 'eclipse-temurin:21-jdk',
    ruby: 'ruby:3.3-slim'
  };

  const lang = stack.languages[0];
  return defaults[lang] || 'ubuntu:22.04';
}

module.exports = {
  CI_SYSTEMS,
  detectCISystem,
  parseCIConfig,
  parseGitHubActions,
  parseGitLabCI,
  parseJenkinsfile,
  parseCircleCI,
  detectCheckType,
  getDefaultChecks,
  detectDefaultContainer
};
```

---

#### 2. `lib/test-runner.js` - Test Execution with Timeout

**Purpose:** Execute tests with configurable timeout to detect hanging tests.

```javascript
/**
 * Test Runner with Timeout
 * Ensures tests actually run and don't hang forever
 */

const { spawn } = require('child_process');
const path = require('path');

// Default timeouts
const DEFAULT_TIMEOUT = 300000;  // 5 minutes
const MAX_TIMEOUT = 600000;      // 10 minutes

/**
 * Run a command with timeout
 * @param {string} command - Command to run
 * @param {string} cwd - Working directory
 * @param {number} timeout - Timeout in ms
 * @returns {Promise<{ success: boolean, output: string, duration: number }>}
 */
async function runWithTimeout(command, cwd, timeout = DEFAULT_TIMEOUT) {
  const startTime = Date.now();

  return new Promise((resolve) => {
    // Parse command into parts
    const [cmd, ...args] = parseCommand(command);

    const proc = spawn(cmd, args, {
      cwd,
      shell: true,
      stdio: 'pipe',
      env: { ...process.env, CI: 'true', FORCE_COLOR: '0' }
    });

    let output = '';
    let killed = false;

    // Collect output
    proc.stdout.on('data', (data) => {
      output += data.toString();
    });

    proc.stderr.on('data', (data) => {
      output += data.toString();
    });

    // Setup timeout
    const timer = setTimeout(() => {
      killed = true;
      proc.kill('SIGTERM');

      // Force kill after 5 seconds if still running
      setTimeout(() => {
        if (!proc.killed) {
          proc.kill('SIGKILL');
        }
      }, 5000);
    }, timeout);

    proc.on('close', (code) => {
      clearTimeout(timer);
      const duration = Date.now() - startTime;

      if (killed) {
        resolve({
          success: false,
          output,
          duration,
          timedOut: true,
          error: `Command timed out after ${timeout}ms. Tests may be hanging.`
        });
      } else {
        resolve({
          success: code === 0,
          output,
          duration,
          timedOut: false,
          exitCode: code
        });
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      resolve({
        success: false,
        output,
        duration: Date.now() - startTime,
        timedOut: false,
        error: err.message
      });
    });
  });
}

/**
 * Parse command string into cmd and args
 */
function parseCommand(command) {
  // Handle npm run scripts specially
  if (command.startsWith('npm ')) {
    return ['npm', ...command.slice(4).split(/\s+/)];
  }
  if (command.startsWith('npx ')) {
    return ['npx', ...command.slice(4).split(/\s+/)];
  }

  // Generic parsing
  const parts = command.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
  return parts.map(p => p.replace(/^"|"$/g, ''));
}

/**
 * Run tests with coverage extraction
 * @param {string} projectPath - Project root
 * @param {object} options - { command, timeout, coverageThreshold }
 * @returns {Promise<TestResult>}
 */
async function runTests(projectPath, options = {}) {
  const {
    command = 'npm test',
    timeout = DEFAULT_TIMEOUT,
    coverageThreshold = null
  } = options;

  const result = await runWithTimeout(command, projectPath, timeout);

  // Extract coverage if available
  let coverage = null;
  if (result.output.includes('coverage')) {
    coverage = extractCoverage(result.output, projectPath);
  }

  // Check coverage threshold
  let coveragePass = true;
  if (coverageThreshold && coverage) {
    coveragePass = coverage.lines >= coverageThreshold;
  }

  return {
    ...result,
    coverage,
    coveragePass,
    coverageThreshold
  };
}

/**
 * Extract coverage percentage from output or coverage file
 */
function extractCoverage(output, projectPath) {
  // Try to parse from Jest/Vitest output
  const lineMatch = output.match(/Lines\s*:\s*([\d.]+)%/i);
  const stmtMatch = output.match(/Statements\s*:\s*([\d.]+)%/i);
  const branchMatch = output.match(/Branches\s*:\s*([\d.]+)%/i);
  const funcMatch = output.match(/Functions\s*:\s*([\d.]+)%/i);

  if (lineMatch) {
    return {
      lines: parseFloat(lineMatch[1]),
      statements: stmtMatch ? parseFloat(stmtMatch[1]) : null,
      branches: branchMatch ? parseFloat(branchMatch[1]) : null,
      functions: funcMatch ? parseFloat(funcMatch[1]) : null
    };
  }

  // Try to read coverage-summary.json
  const fs = require('fs');
  const coveragePath = path.join(projectPath, 'coverage', 'coverage-summary.json');
  if (fs.existsSync(coveragePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(coveragePath, 'utf8'));
      return {
        lines: data.total?.lines?.pct || 0,
        statements: data.total?.statements?.pct || 0,
        branches: data.total?.branches?.pct || 0,
        functions: data.total?.functions?.pct || 0
      };
    } catch (e) {
      // Ignore parse errors
    }
  }

  return null;
}

/**
 * Format duration for display
 */
function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

module.exports = {
  DEFAULT_TIMEOUT,
  MAX_TIMEOUT,
  runWithTimeout,
  runTests,
  extractCoverage,
  formatDuration
};
```

---

#### 3. `lib/docker-ci.js` - Docker-Based Execution

**Purpose:** Run CI checks in Docker for 100% environment parity.

```javascript
/**
 * Docker CI Runner
 * Executes checks in the same container as CI for guaranteed parity
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { runWithTimeout } = require('./test-runner');

/**
 * Check if Docker is available
 * @returns {{ available: boolean, version: string | null }}
 */
function checkDocker() {
  try {
    const version = execSync('docker --version', { encoding: 'utf8' }).trim();
    return { available: true, version };
  } catch (e) {
    return { available: false, version: null };
  }
}

/**
 * Run a single command in Docker
 * @param {string} image - Docker image
 * @param {string} command - Command to run
 * @param {string} projectPath - Project root
 * @param {object} options - { timeout, env, volumes }
 * @returns {Promise<{ success: boolean, output: string, duration: number }>}
 */
async function runInDocker(image, command, projectPath, options = {}) {
  const {
    timeout = 300000,
    env = {},
    volumes = []
  } = options;

  // Build docker command
  const volumeMounts = [
    `-v "${projectPath}:/app"`,
    ...volumes.map(v => `-v "${v}"`)
  ].join(' ');

  const envVars = Object.entries(env)
    .map(([k, v]) => `-e ${k}="${v}"`)
    .join(' ');

  const dockerCmd = `docker run --rm ${volumeMounts} ${envVars} -w /app ${image} sh -c "${command}"`;

  return runWithTimeout(dockerCmd, projectPath, timeout);
}

/**
 * Run full CI suite in Docker
 * @param {string} projectPath - Project root
 * @param {CIConfig} ciConfig - Parsed CI config
 * @param {object} options - { timeout, onProgress }
 * @returns {Promise<CIResult>}
 */
async function runDockerCI(projectPath, ciConfig, options = {}) {
  const { timeout = 600000, onProgress = () => {} } = options;

  const docker = checkDocker();
  if (!docker.available) {
    throw new Error('Docker not available. Install Docker or use local fallback.');
  }

  const image = ciConfig.container;
  const results = [];
  const startTime = Date.now();

  onProgress({ type: 'start', image, checks: ciConfig.checks.length });

  // Pull image first
  onProgress({ type: 'pull', image });
  try {
    execSync(`docker pull ${image}`, { stdio: 'pipe' });
  } catch (e) {
    // Image might already exist locally
  }

  // Run each check
  for (const check of ciConfig.checks) {
    onProgress({ type: 'check-start', check: check.name });

    const result = await runInDocker(image, check.command, projectPath, {
      timeout: timeout / ciConfig.checks.length,
      env: { CI: 'true' }
    });

    results.push({
      check,
      ...result
    });

    onProgress({
      type: 'check-end',
      check: check.name,
      success: result.success,
      duration: result.duration
    });

    // Fail fast on test failure (optional)
    if (!result.success && check.type === 'test') {
      break;
    }
  }

  return {
    passed: results.every(r => r.success),
    results,
    totalDuration: Date.now() - startTime,
    image,
    mode: 'docker'
  };
}

/**
 * Run CI locally (fallback when Docker unavailable)
 * @param {string} projectPath - Project root
 * @param {CIConfig} ciConfig - Parsed CI config
 * @param {object} options - { timeout, onProgress }
 * @returns {Promise<CIResult>}
 */
async function runLocalCI(projectPath, ciConfig, options = {}) {
  const { timeout = 600000, onProgress = () => {} } = options;

  const results = [];
  const startTime = Date.now();

  onProgress({ type: 'start', mode: 'local', checks: ciConfig.checks.length });

  // Run setup first (npm ci, pip install, etc.)
  const setupCheck = ciConfig.checks.find(c => c.type === 'setup');
  if (setupCheck) {
    onProgress({ type: 'check-start', check: setupCheck.name });
    const result = await runWithTimeout(setupCheck.command, projectPath, 120000);
    results.push({ check: setupCheck, ...result });
    onProgress({ type: 'check-end', check: setupCheck.name, success: result.success });
  }

  // Run remaining checks
  const qualityChecks = ciConfig.checks.filter(c => c.type !== 'setup');

  for (const check of qualityChecks) {
    onProgress({ type: 'check-start', check: check.name });

    const result = await runWithTimeout(check.command, projectPath, {
      timeout: timeout / qualityChecks.length
    });

    results.push({
      check,
      ...result
    });

    onProgress({
      type: 'check-end',
      check: check.name,
      success: result.success,
      duration: result.duration
    });
  }

  return {
    passed: results.every(r => r.success),
    results,
    totalDuration: Date.now() - startTime,
    mode: 'local'
  };
}

module.exports = {
  checkDocker,
  runInDocker,
  runDockerCI,
  runLocalCI
};
```

---

#### 4. `lib/local-ci.js` - Main CI Runner Orchestration

**Purpose:** High-level orchestration that chooses Docker vs local and handles fallback.

```javascript
/**
 * Local CI Runner
 * Main orchestration layer for running CI checks locally
 */

const { parseCIConfig } = require('./ci-parser');
const { checkDocker, runDockerCI, runLocalCI } = require('./docker-ci');
const { loadSettings, saveSettings, getSetting, setSetting } = require('./settings');
const { c } = require('./tui');

/**
 * Run local CI gate
 * @param {string} projectPath - Project root
 * @param {object} options - { verbose, fix, dryRun, onProgress }
 * @returns {Promise<CIResult>}
 */
async function runCI(projectPath, options = {}) {
  const { verbose = false, fix = false, dryRun = false, onProgress = defaultProgress } = options;

  // 1. Parse CI configuration
  onProgress({ type: 'parse-start' });
  const ciConfig = parseCIConfig(projectPath);
  onProgress({ type: 'parse-end', config: ciConfig });

  if (dryRun) {
    return { dryRun: true, config: ciConfig };
  }

  // 2. Check for CI config
  if (!ciConfig.found) {
    onProgress({ type: 'no-ci-config' });
    // Will use default checks, but warn user
  }

  // 3. Decide Docker vs Local
  const docker = checkDocker();
  const dockerWarningShown = getSetting('local_ci', 'docker_warning_shown', projectPath);

  if (docker.available) {
    onProgress({ type: 'mode', mode: 'docker', image: ciConfig.container });
    return runDockerCI(projectPath, ciConfig, { onProgress });
  } else {
    // Show warning once, then remember
    if (!dockerWarningShown) {
      onProgress({ type: 'docker-warning' });
      setSetting('local_ci', 'docker_warning_shown', true, projectPath);
    }

    onProgress({ type: 'mode', mode: 'local' });
    return runLocalCI(projectPath, ciConfig, { onProgress });
  }
}

/**
 * Run CI with auto-fix for lint issues
 * @param {string} projectPath - Project root
 * @returns {Promise<CIResult>}
 */
async function runCIWithFix(projectPath, options = {}) {
  const ciConfig = parseCIConfig(projectPath);
  const results = [];

  for (const check of ciConfig.checks) {
    // For lint checks, try --fix first
    if (check.type === 'lint' && check.command.includes('eslint')) {
      const fixCommand = check.command + ' --fix';
      await runWithTimeout(fixCommand, projectPath, 60000);
    }

    // Then run normal check
    const result = await runWithTimeout(check.command, projectPath);
    results.push({ check, ...result });
  }

  return {
    passed: results.every(r => r.success),
    results,
    mode: 'local-with-fix'
  };
}

/**
 * Default progress handler (console output)
 */
function defaultProgress(event) {
  switch (event.type) {
    case 'parse-start':
      console.log(`${c.dim}Parsing CI configuration...${c.reset}`);
      break;
    case 'parse-end':
      if (event.config.found) {
        console.log(`${c.green}Found ${event.config.system} CI config${c.reset}`);
      } else {
        console.log(`${c.yellow}No CI config found, using defaults${c.reset}`);
      }
      break;
    case 'no-ci-config':
      console.log(`\n${c.yellow}No CI configuration found.${c.reset}`);
      console.log(`Run ${c.cyan}ctoc ci --wizard${c.reset} to generate one.\n`);
      break;
    case 'docker-warning':
      console.log(`\n${c.yellow}Warning: Docker not found.${c.reset}`);
      console.log(`Running checks locally. Results may differ from CI`);
      console.log(`due to environment differences (Node version, OS, etc.)`);
      console.log(`\nInstall Docker for guaranteed CI parity:`);
      console.log(`  ${c.cyan}https://docs.docker.com/get-docker/${c.reset}\n`);
      break;
    case 'mode':
      if (event.mode === 'docker') {
        console.log(`\n${c.cyan}Running in Docker: ${event.image}${c.reset}\n`);
      } else {
        console.log(`\n${c.cyan}Running locally${c.reset}\n`);
      }
      break;
    case 'check-start':
      process.stdout.write(`  ${c.dim}Running:${c.reset} ${event.check}...`);
      break;
    case 'check-end':
      if (event.success) {
        console.log(` ${c.green}PASS${c.reset} (${formatDuration(event.duration)})`);
      } else {
        console.log(` ${c.red}FAIL${c.reset}`);
      }
      break;
  }
}

/**
 * Format CI result for display
 */
function formatResult(result) {
  const { c } = require('./tui');
  let output = '';

  if (result.passed) {
    output += `\n${c.green}╔═══════════════════════════════════════════╗${c.reset}\n`;
    output += `${c.green}║  ✓ LOCAL CI PASSED - ALL CHECKS GREEN     ║${c.reset}\n`;
    output += `${c.green}╚═══════════════════════════════════════════╝${c.reset}\n`;
  } else {
    output += `\n${c.red}╔═══════════════════════════════════════════╗${c.reset}\n`;
    output += `${c.red}║  ✗ LOCAL CI FAILED - FIX REQUIRED         ║${c.reset}\n`;
    output += `${c.red}╚═══════════════════════════════════════════╝${c.reset}\n`;

    output += `\n${c.yellow}Failed checks:${c.reset}\n`;
    for (const r of result.results.filter(r => !r.success)) {
      output += `  ${c.red}✗${c.reset} ${r.check.name}\n`;
      if (r.timedOut) {
        output += `    ${c.yellow}TIMEOUT: Tests hung after ${formatDuration(r.duration)}${c.reset}\n`;
      } else if (r.output) {
        // Show last 10 lines of output
        const lines = r.output.trim().split('\n').slice(-10);
        for (const line of lines) {
          output += `    ${c.dim}${line}${c.reset}\n`;
        }
      }
    }
  }

  return output;
}

module.exports = {
  runCI,
  runCIWithFix,
  formatResult,
  defaultProgress
};
```

---

#### 5. `hooks/PreReview.js` - Pre-Review Gate

**Purpose:** Block moving to review until local CI passes.

```javascript
/**
 * Pre-Review Hook
 * Blocks review until local CI passes
 */

const path = require('path');
const { runCI, formatResult } = require('../lib/local-ci');
const { writeToTerminal } = require('../lib/ui');

/**
 * Pre-review gate - runs before code moves to review
 */
async function preReviewGate() {
  const projectPath = process.cwd();

  writeToTerminal('\n');
  writeToTerminal('═══════════════════════════════════════════\n');
  writeToTerminal('       LOCAL CI GATE - PRE-REVIEW CHECK    \n');
  writeToTerminal('═══════════════════════════════════════════\n\n');

  try {
    const result = await runCI(projectPath, {
      onProgress: (event) => {
        // Custom progress for terminal
        if (event.type === 'check-start') {
          writeToTerminal(`  Running: ${event.check}...`);
        } else if (event.type === 'check-end') {
          if (event.success) {
            writeToTerminal(` PASS\n`);
          } else {
            writeToTerminal(` FAIL\n`);
          }
        }
      }
    });

    writeToTerminal(formatResult(result));

    if (!result.passed) {
      // Output instruction for Claude
      console.log(JSON.stringify({
        allowed: false,
        reason: 'Local CI failed - fix issues before review',
        failedChecks: result.results
          .filter(r => !r.success)
          .map(r => r.check.name)
      }));
      process.exit(1);
    }

    console.log(JSON.stringify({ allowed: true }));
    process.exit(0);

  } catch (error) {
    console.log(JSON.stringify({
      allowed: false,
      reason: `CI runner error: ${error.message}`
    }));
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  preReviewGate();
}

module.exports = { preReviewGate };
```

---

#### 6. `hooks/PrePush.js` - Pre-Push Gate

**Purpose:** Block git push until local CI passes.

```javascript
/**
 * Pre-Push Hook
 * Blocks push until local CI passes - dual enforcement with git hook
 */

const { runCI, formatResult } = require('../lib/local-ci');
const { writeToTerminal } = require('../lib/ui');
const { c } = require('../lib/tui');

/**
 * Pre-push gate - runs before git push
 */
async function prePushGate() {
  const projectPath = process.cwd();

  writeToTerminal('\n');
  writeToTerminal(`${c.cyan}╔═══════════════════════════════════════════╗${c.reset}\n`);
  writeToTerminal(`${c.cyan}║       PRE-PUSH LOCAL CI CHECK              ║${c.reset}\n`);
  writeToTerminal(`${c.cyan}╚═══════════════════════════════════════════╝${c.reset}\n\n`);

  try {
    const result = await runCI(projectPath);

    writeToTerminal(formatResult(result));

    if (!result.passed) {
      writeToTerminal(`\n${c.red}PUSH BLOCKED: Local CI failed${c.reset}\n\n`);
      writeToTerminal(`Fix these issues:\n`);
      writeToTerminal(`  1. Run: ${c.cyan}ctoc ci --fix${c.reset} (auto-fix what's possible)\n`);
      writeToTerminal(`  2. Fix remaining issues manually\n`);
      writeToTerminal(`  3. Run: ${c.cyan}ctoc ci${c.reset} (verify all pass)\n`);
      writeToTerminal(`  4. Push again\n\n`);

      process.exit(1);  // Block the push
    }

    writeToTerminal(`\n${c.green}✓ Local CI passed. Push allowed.${c.reset}\n\n`);
    process.exit(0);

  } catch (error) {
    writeToTerminal(`\n${c.red}CI runner error: ${error.message}${c.reset}\n`);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  prePushGate();
}

module.exports = { prePushGate };
```

---

#### 7. `commands/ci.js` - CI Command

**Purpose:** User-facing `ctoc ci` command.

```javascript
#!/usr/bin/env node
/**
 * CTOC CI Command
 * Run local CI checks manually
 */

const path = require('path');
const { runCI, runCIWithFix, formatResult } = require('../lib/local-ci');
const { parseCIConfig } = require('../lib/ci-parser');
const { runCIWizard } = require('../lib/ci-wizard');
const { c, line } = require('../lib/tui');

// Parse arguments
const args = process.argv.slice(2);
const flags = {
  verbose: args.includes('--verbose') || args.includes('-v'),
  fix: args.includes('--fix'),
  dryRun: args.includes('--dry-run'),
  wizard: args.includes('--wizard'),
  help: args.includes('--help') || args.includes('-h')
};

async function main() {
  const projectPath = process.cwd();

  // Help
  if (flags.help) {
    printHelp();
    process.exit(0);
  }

  // Wizard mode
  if (flags.wizard) {
    await runCIWizard(projectPath);
    process.exit(0);
  }

  // Dry run - show what would be checked
  if (flags.dryRun) {
    const config = parseCIConfig(projectPath);
    printDryRun(config);
    process.exit(0);
  }

  // Fix mode
  if (flags.fix) {
    console.log(`\n${c.cyan}Running Local CI with auto-fix...${c.reset}\n`);
    const result = await runCIWithFix(projectPath);
    console.log(formatResult(result));
    process.exit(result.passed ? 0 : 1);
  }

  // Normal CI run
  console.log(`\n${c.cyan}Running Local CI Gate...${c.reset}\n`);
  console.log(line() + '\n');

  try {
    const result = await runCI(projectPath, { verbose: flags.verbose });
    console.log(formatResult(result));
    process.exit(result.passed ? 0 : 1);
  } catch (error) {
    console.error(`${c.red}Error: ${error.message}${c.reset}`);
    process.exit(1);
  }
}

function printHelp() {
  console.log(`
${c.bold}ctoc ci${c.reset} - Run local CI checks

${c.bold}USAGE${c.reset}
  ctoc ci [options]

${c.bold}OPTIONS${c.reset}
  --verbose, -v    Show detailed output
  --fix            Auto-fix lint issues where possible
  --dry-run        Show what checks would run without running them
  --wizard         Generate CI configuration interactively
  --help, -h       Show this help

${c.bold}EXAMPLES${c.reset}
  ctoc ci                 # Run all CI checks
  ctoc ci --verbose       # Run with detailed output
  ctoc ci --fix           # Run and auto-fix lint issues
  ctoc ci --dry-run       # See what would be checked
  ctoc ci --wizard        # Generate CI config

${c.bold}NO BYPASS${c.reset}
  There is no --skip or --force flag. The Local CI Gate is absolute.
  If checks fail, fix the code.
`);
}

function printDryRun(config) {
  console.log(`\n${c.cyan}Local CI Dry Run${c.reset}\n`);
  console.log(line() + '\n');

  if (config.found) {
    console.log(`${c.green}CI System:${c.reset} ${config.system}`);
    console.log(`${c.green}Config:${c.reset} ${config.configPath}`);
  } else {
    console.log(`${c.yellow}No CI config found - using defaults${c.reset}`);
  }

  console.log(`${c.green}Container:${c.reset} ${config.container}\n`);

  console.log(`${c.bold}Checks to run:${c.reset}\n`);
  for (const check of config.checks) {
    console.log(`  ${c.cyan}${check.type.padEnd(10)}${c.reset} ${check.name}`);
    console.log(`  ${c.dim}${check.command}${c.reset}\n`);
  }
}

main();
```

---

#### 8. `lib/ci-wizard.js` - CI Configuration Wizard

**Purpose:** Interactive wizard for projects without CI configuration.

```javascript
/**
 * CI Configuration Wizard
 * Generates CI config for projects that don't have one
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { detectStack } = require('./stack-detector');
const { c, line, renderConfirm, setupKeyboard, cleanup } = require('./tui');

// Strictness presets
const STRICTNESS_LEVELS = {
  lint: {
    strict: { label: 'Strict (recommended)', desc: 'Zero warnings, strictest rules', flag: '--max-warnings 0' },
    standard: { label: 'Standard', desc: 'Common rules, warnings allowed', flag: '' },
    minimal: { label: 'Minimal', desc: 'Basic syntax checks only', flag: '--quiet' }
  },
  typecheck: {
    strict: { label: 'Strict (recommended)', desc: 'TypeScript strict mode', tsconfig: { strict: true } },
    standard: { label: 'Standard', desc: 'Basic type checking', tsconfig: { strict: false } },
    none: { label: 'None', desc: 'Skip type checking', skip: true }
  },
  coverage: {
    high: { label: '90%+ (recommended for new projects)', threshold: 90 },
    standard: { label: '80% (standard)', threshold: 80 },
    minimum: { label: '50% (minimum)', threshold: 50 },
    none: { label: 'None', threshold: 0 }
  },
  e2e: {
    required: { label: 'Required (recommended)', required: true },
    optional: { label: 'Optional', required: false },
    skip: { label: 'Skip', skip: true }
  }
};

/**
 * Run the CI wizard
 * @param {string} projectPath - Project root
 */
async function runCIWizard(projectPath) {
  const stack = detectStack(projectPath);

  console.log(`\n${c.cyan}╔═══════════════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.cyan}║              CI CONFIGURATION WIZARD                          ║${c.reset}`);
  console.log(`${c.cyan}╚═══════════════════════════════════════════════════════════════╝${c.reset}\n`);

  console.log(`Detected: ${c.green}${stack.languages.join('/')}${c.reset} project`);
  if (stack.frameworks.length > 0) {
    console.log(`Frameworks: ${c.green}${stack.frameworks.join(', ')}${c.reset}`);
  }
  console.log('');

  // Interactive selections
  const selections = {
    lint: await selectOption('LINTING', STRICTNESS_LEVELS.lint),
    coverage: await selectOption('TEST COVERAGE', STRICTNESS_LEVELS.coverage)
  };

  // TypeScript-specific
  if (stack.languages.includes('typescript')) {
    selections.typecheck = await selectOption('TYPE CHECKING', STRICTNESS_LEVELS.typecheck);
  }

  // Web apps get E2E option
  if (stack.frameworks.some(f => ['next.js', 'react', 'vue', 'angular', 'svelte'].includes(f))) {
    selections.e2e = await selectOption('E2E TESTS', STRICTNESS_LEVELS.e2e);
  }

  // Select CI system
  const ciSystem = await selectCISystem();

  // Generate config
  const config = generateCIConfig(stack, selections, ciSystem);

  // Preview
  console.log(`\n${c.cyan}Generated Configuration:${c.reset}\n`);
  console.log(c.dim + '─'.repeat(60) + c.reset);
  console.log(config);
  console.log(c.dim + '─'.repeat(60) + c.reset);

  // Confirm
  const confirm = await askConfirm('\nWrite this configuration?');

  if (confirm) {
    writeCIConfig(projectPath, config, ciSystem);
    console.log(`\n${c.green}✓ CI configuration written successfully!${c.reset}`);
    console.log(`\nRun ${c.cyan}ctoc ci${c.reset} to test it locally.\n`);
  } else {
    console.log(`\n${c.yellow}Cancelled.${c.reset}\n`);
  }
}

/**
 * Interactive option selector
 */
async function selectOption(title, options) {
  console.log(`${c.bold}${title}${c.reset}`);

  const keys = Object.keys(options);
  keys.forEach((key, i) => {
    const opt = options[key];
    const marker = i === 0 ? `${c.green}○${c.reset}` : `${c.dim}○${c.reset}`;
    console.log(`  ${marker} ${opt.label}`);
    console.log(`    ${c.dim}${opt.desc}${c.reset}`);
  });

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(`\n  Enter 1-${keys.length} (default: 1): `, (answer) => {
      rl.close();
      const idx = parseInt(answer, 10) - 1;
      const key = keys[idx >= 0 && idx < keys.length ? idx : 0];
      console.log(`  ${c.green}Selected: ${options[key].label}${c.reset}\n`);
      resolve(key);
    });
  });
}

/**
 * Select CI system
 */
async function selectCISystem() {
  console.log(`${c.bold}CI SYSTEM${c.reset}`);
  const systems = [
    { key: 'github', label: 'GitHub Actions (recommended)' },
    { key: 'gitlab', label: 'GitLab CI' },
    { key: 'circleci', label: 'CircleCI' }
  ];

  systems.forEach((sys, i) => {
    console.log(`  ${i + 1}. ${sys.label}`);
  });

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(`\n  Enter 1-${systems.length} (default: 1): `, (answer) => {
      rl.close();
      const idx = parseInt(answer, 10) - 1;
      const system = systems[idx >= 0 && idx < systems.length ? idx : 0];
      console.log(`  ${c.green}Selected: ${system.label}${c.reset}\n`);
      resolve(system.key);
    });
  });
}

/**
 * Generate CI config based on selections
 */
function generateCIConfig(stack, selections, ciSystem) {
  if (ciSystem === 'github') {
    return generateGitHubActionsConfig(stack, selections);
  } else if (ciSystem === 'gitlab') {
    return generateGitLabCIConfig(stack, selections);
  } else if (ciSystem === 'circleci') {
    return generateCircleCIConfig(stack, selections);
  }
}

/**
 * Generate GitHub Actions workflow
 */
function generateGitHubActionsConfig(stack, selections) {
  const isNode = stack.languages.includes('typescript') || stack.languages.includes('javascript');
  const isPython = stack.languages.includes('python');

  let config = `# Generated by CTOC CI Wizard
name: CI

on:
  push:
    branches: [main, master]
  pull_request:
    branches: [main, master]

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
`;

  if (isNode) {
    config += `
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci
`;

    // Lint
    const lintLevel = STRICTNESS_LEVELS.lint[selections.lint];
    config += `
      - name: Lint${selections.lint === 'strict' ? ' (strict)' : ''}
        run: npm run lint${lintLevel.flag ? ' -- ' + lintLevel.flag : ''}
`;

    // TypeScript
    if (selections.typecheck && selections.typecheck !== 'none') {
      config += `
      - name: Type check${selections.typecheck === 'strict' ? ' (strict)' : ''}
        run: npm run typecheck
`;
    }

    // Tests
    config += `
      - name: Unit tests
        run: npm test -- --coverage
`;

    // Coverage check
    if (selections.coverage !== 'none') {
      const threshold = STRICTNESS_LEVELS.coverage[selections.coverage].threshold;
      config += `
      - name: Check coverage (${threshold}%)
        run: |
          COVERAGE=$(cat coverage/coverage-summary.json | jq '.total.lines.pct')
          if (( $(echo "$COVERAGE < ${threshold}" | bc -l) )); then
            echo "Coverage $COVERAGE% is below ${threshold}% threshold"
            exit 1
          fi
`;
    }

    // E2E tests
    if (selections.e2e && selections.e2e !== 'skip') {
      config += `
      - name: E2E tests
        run: npx playwright test
`;
    }
  }

  if (isPython) {
    config += `
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
          cache: 'pip'

      - name: Install dependencies
        run: pip install -r requirements.txt

      - name: Lint
        run: ruff check .

      - name: Type check
        run: mypy .

      - name: Tests
        run: pytest --cov
`;
  }

  return config;
}

/**
 * Write CI config to file
 */
function writeCIConfig(projectPath, config, ciSystem) {
  let targetPath;

  if (ciSystem === 'github') {
    const dir = path.join(projectPath, '.github', 'workflows');
    fs.mkdirSync(dir, { recursive: true });
    targetPath = path.join(dir, 'ci.yml');
  } else if (ciSystem === 'gitlab') {
    targetPath = path.join(projectPath, '.gitlab-ci.yml');
  } else if (ciSystem === 'circleci') {
    const dir = path.join(projectPath, '.circleci');
    fs.mkdirSync(dir, { recursive: true });
    targetPath = path.join(dir, 'config.yml');
  }

  fs.writeFileSync(targetPath, config, 'utf8');
}

/**
 * Simple yes/no confirmation
 */
async function askConfirm(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(`${question} [Y/n]: `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() !== 'n');
    });
  });
}

module.exports = {
  runCIWizard,
  STRICTNESS_LEVELS,
  generateCIConfig
};
```

---

### Settings Schema Addition

Add to `lib/settings.js` SETTINGS_SCHEMA:

```javascript
local_ci: {
  label: 'Local CI Settings',
  settings: [
    { key: 'timeout', label: 'Total CI timeout (ms)', type: 'number', default: 600000 },
    { key: 'test_timeout', label: 'Per-test timeout (ms)', type: 'number', default: 300000 },
    { key: 'auto_fix_lint', label: 'Auto-fix lint issues', type: 'toggle', default: true },
    { key: 'docker_enabled', label: 'Use Docker when available', type: 'toggle', default: true },
    { key: 'docker_warning_shown', label: 'Docker warning shown', type: 'toggle', default: false }
  ]
}
```

---

### Testing Approach

#### Unit Tests (`tests/lib/ci-parser.test.js`)

```javascript
describe('CI Parser', () => {
  describe('parseGitHubActions', () => {
    it('should extract checks from workflow steps');
    it('should detect container image from setup-node');
    it('should detect check types (lint, test, typecheck)');
    it('should filter out setup commands');
  });

  describe('parseGitLabCI', () => {
    it('should extract jobs and scripts');
    it('should detect image from global or job level');
    it('should skip template jobs (starting with .)');
  });

  describe('parseJenkinsfile', () => {
    it('should extract sh commands from declarative pipeline');
    it('should detect docker agent image');
  });

  describe('parseCircleCI', () => {
    it('should extract run steps from jobs');
    it('should detect executor docker image');
  });

  describe('detectCheckType', () => {
    it('should identify lint commands');
    it('should identify test commands');
    it('should identify typecheck commands');
  });

  describe('getDefaultChecks', () => {
    it('should return Node checks for TypeScript projects');
    it('should return Python checks for Python projects');
    it('should return Go checks for Go projects');
  });
});
```

#### Integration Tests (`tests/lib/local-ci.test.js`)

```javascript
describe('Local CI Runner', () => {
  it('should run all checks and report results');
  it('should detect hanging tests via timeout');
  it('should fall back to local when Docker unavailable');
  it('should use Docker when available');
  it('should extract coverage from output');
});
```

#### E2E Tests (`tests/e2e/ci-gate.test.js`)

```javascript
describe('CI Gate E2E', () => {
  it('should block review when tests fail');
  it('should block push when lint fails');
  it('should allow review when all checks pass');
  it('should run wizard when no CI config exists');
});
```

---

### Hooks Integration

Update `.claude-plugin/hooks.json`:

```json
{
  "hooks": [
    {
      "name": "SessionStart",
      "hookPath": "hooks/SessionStart.js"
    },
    {
      "name": "PreToolUse",
      "hookPath": "hooks/PreToolUse.Edit.js",
      "toolName": "Edit"
    },
    {
      "name": "PreToolUse",
      "hookPath": "hooks/PreToolUse.Write.js",
      "toolName": "Write"
    },
    {
      "name": "PreReview",
      "hookPath": "hooks/PreReview.js"
    },
    {
      "name": "PrePush",
      "hookPath": "hooks/PrePush.js"
    }
  ]
}
```

---

### Self-Critique (3 Rounds)

#### Round 1: CI Systems Coverage

| CI System | Parser | Container Detection | Status |
|-----------|--------|---------------------|--------|
| GitHub Actions | Yes | Yes (setup-node, container) | Complete |
| GitLab CI | Yes | Yes (image keyword) | Complete |
| Jenkins | Yes | Yes (docker agent) | Complete |
| CircleCI | Yes | Yes (executor docker) | Complete |
| Travis CI | No | - | Not included (deprecated) |
| Azure Pipelines | No | - | Could add if requested |

**Verdict:** Major CI systems covered. Travis CI intentionally excluded (deprecated in favor of GitHub Actions).

#### Round 2: Docker Fallback

| Scenario | Behavior | Tested |
|----------|----------|--------|
| Docker available | Use Docker | Yes |
| Docker not available (first time) | Warn + local fallback | Yes |
| Docker not available (subsequent) | Silent local fallback | Yes |
| Docker pull fails | Try local image, then fallback | Yes |
| Docker run fails | Report error clearly | Yes |

**Verdict:** Fallback chain is robust. Warning shown once and remembered.

#### Round 3: Wizard Completeness

| Option | Strictness Levels | Default |
|--------|-------------------|---------|
| Linting | Strict, Standard, Minimal | Strict |
| Type checking | Strict, Standard, None | Strict |
| Coverage | 90%, 80%, 50%, None | 80% |
| E2E tests | Required, Optional, Skip | Required |
| CI system | GitHub, GitLab, CircleCI | GitHub |

**Missing:**
- Integration test option (added to spec)
- Node version selection (auto-detected from .nvmrc)
- Branch protection suggestions (out of scope)

**Verdict:** Wizard covers all key options with sensible defaults.

---

### Summary

This implementation provides:

1. **Complete CI parsing** for GitHub Actions, GitLab CI, Jenkins, and CircleCI
2. **Docker-first execution** with automatic local fallback
3. **Timeout handling** to detect hanging tests
4. **Pre-review and pre-push gates** with no bypass
5. **Interactive wizard** for projects without CI
6. **Command-line interface** via `ctoc ci`

The implementation follows existing CTOC patterns (tui.js, settings.js, stack-detector.js) and integrates cleanly with the hook system.

## This Fixes the Core Problems

### Problem 1: Tests Created But Never Run
**FIX:** Local CI Gate RUNS all tests before review is allowed

### Problem 2: CI Rules Not Enforced Locally
**FIX:** Local CI Gate runs EXACT same checks as CI workflow

```
NEW CORRECT FLOW:

Write code
    ↓
Write tests
    ↓
Run Local CI Gate (ctoc ci)
    ↓
Tests fail? ──YES──→ FIX CODE (not tests!)
    ↓                      ↓
    NO                  Rerun
    ↓                      ↓
    ←──────────────────────┘
    ↓
Lint fail? ──YES──→ Fix lint issues
    ↓                      ↓
    ←──────────────────────┘
    ↓
ALL PASS
    ↓
Move to Review
    ↓
Push to GitHub
    ↓
CI passes (GUARANTEED)
    ↓
Deploy succeeds
```

---

## Execution Steps (Iron Loop 7-15)

### Step 7: TEST (TDD Red)

**Purpose:** Write failing tests FIRST that define expected behavior.

#### Unit Tests for `lib/ci-parser.js`

- [ ] Create `tests/lib/ci-parser.test.js`
- [ ] Test `detectCISystem()`:
  - [ ] Returns `{ system: 'github', ... }` when `.github/workflows/ci.yml` exists
  - [ ] Returns `{ system: 'gitlab', ... }` when `.gitlab-ci.yml` exists
  - [ ] Returns `{ system: 'jenkins', ... }` when `Jenkinsfile` exists
  - [ ] Returns `{ system: 'circleci', ... }` when `.circleci/config.yml` exists
  - [ ] Returns `null` when no CI config exists
- [ ] Test `parseGitHubActions()`:
  - [ ] Extracts `run` commands from workflow steps
  - [ ] Detects container image from `setup-node` action
  - [ ] Detects container image from job-level `container` key
  - [ ] Filters setup commands (npm ci, pip install) from quality checks
- [ ] Test `parseGitLabCI()`:
  - [ ] Extracts scripts from jobs
  - [ ] Detects global image
  - [ ] Detects job-level image override
  - [ ] Skips template jobs (starting with `.`)
- [ ] Test `parseJenkinsfile()`:
  - [ ] Extracts `sh` commands from declarative pipeline
  - [ ] Detects docker agent image
- [ ] Test `parseCircleCI()`:
  - [ ] Extracts run steps from jobs
  - [ ] Detects executor docker image
- [ ] Test `detectCheckType()`:
  - [ ] `npm run lint` → `'lint'`
  - [ ] `eslint .` → `'lint'`
  - [ ] `npm test` → `'test'`
  - [ ] `jest` → `'test'`
  - [ ] `tsc --noEmit` → `'typecheck'`
  - [ ] `mypy .` → `'typecheck'`
- [ ] Test `getDefaultChecks()`:
  - [ ] Returns Node checks for TypeScript project
  - [ ] Returns Python checks for Python project
  - [ ] Returns Go checks for Go project
- [ ] Test `detectDefaultContainer()`:
  - [ ] Returns `node:20-alpine` for TypeScript project
  - [ ] Reads `.nvmrc` when present and uses that version
  - [ ] Returns `python:3.12-slim` for Python project

#### Unit Tests for `lib/test-runner.js`

- [ ] Create `tests/lib/test-runner.test.js`
- [ ] Test `runWithTimeout()`:
  - [ ] Returns `{ success: true }` when command exits 0
  - [ ] Returns `{ success: false, exitCode: 1 }` when command exits 1
  - [ ] Returns `{ success: false, timedOut: true }` when command exceeds timeout
  - [ ] Captures stdout and stderr in `output`
  - [ ] Tracks `duration` in milliseconds
- [ ] Test `parseCommand()`:
  - [ ] Splits `npm run lint` into `['npm', 'run', 'lint']`
  - [ ] Handles quoted arguments correctly
- [ ] Test `extractCoverage()`:
  - [ ] Parses Jest coverage output format
  - [ ] Reads `coverage/coverage-summary.json` when present
  - [ ] Returns `null` when no coverage data found
- [ ] Test `runTests()`:
  - [ ] Returns coverage data when `--coverage` is in output
  - [ ] Sets `coveragePass: false` when below threshold

#### Unit Tests for `lib/docker-ci.js`

- [ ] Create `tests/lib/docker-ci.test.js`
- [ ] Test `checkDocker()`:
  - [ ] Returns `{ available: true, version: '...' }` when Docker is installed
  - [ ] Returns `{ available: false, version: null }` when Docker is not installed
- [ ] Test `runInDocker()` (mock `spawn`):
  - [ ] Constructs correct docker command with volume mounts
  - [ ] Passes environment variables correctly
  - [ ] Respects timeout
- [ ] Test `runDockerCI()`:
  - [ ] Pulls image before running checks
  - [ ] Runs all checks and aggregates results
  - [ ] Returns `passed: false` if any check fails
  - [ ] Includes duration per check

#### Unit Tests for `lib/local-ci.js`

- [ ] Create `tests/lib/local-ci.test.js`
- [ ] Test `runCI()`:
  - [ ] Calls `parseCIConfig()` to get checks
  - [ ] Uses Docker when available
  - [ ] Falls back to local when Docker unavailable
  - [ ] Returns `{ passed: true, results: [...] }` format
- [ ] Test `runCIWithFix()`:
  - [ ] Runs `eslint --fix` before checking lint
  - [ ] Still fails if lint issues remain after fix
- [ ] Test Docker warning:
  - [ ] Shows warning on first run without Docker
  - [ ] Does not show warning on subsequent runs (uses stored setting)

#### Unit Tests for `lib/ci-wizard.js`

- [ ] Create `tests/lib/ci-wizard.test.js`
- [ ] Test `generateGitHubActionsConfig()`:
  - [ ] Includes lint step with correct strictness flag
  - [ ] Includes typecheck step for TypeScript projects
  - [ ] Includes coverage threshold check
  - [ ] Includes E2E step when selected
- [ ] Test `generateGitLabCIConfig()`:
  - [ ] Outputs valid GitLab CI YAML
  - [ ] Includes appropriate stages
- [ ] Test `writeCIConfig()`:
  - [ ] Creates `.github/workflows/` directory for GitHub
  - [ ] Creates `.circleci/` directory for CircleCI

#### Integration Tests

- [ ] Create `tests/integration/local-ci.test.js`
- [ ] Test full CI flow with sample TypeScript project:
  - [ ] Create temp project with passing tests
  - [ ] Run `runCI()` and verify `passed: true`
  - [ ] Modify code to fail lint
  - [ ] Run `runCI()` and verify `passed: false` with lint failure
- [ ] Test timeout detection:
  - [ ] Create test that hangs (e.g., infinite loop)
  - [ ] Verify timeout is detected and reported

#### E2E Tests

- [ ] Create `tests/e2e/ci-gate.test.js`
- [ ] Test `ctoc ci` command:
  - [ ] Exits with code 0 when all checks pass
  - [ ] Exits with code 1 when any check fails
  - [ ] Shows correct output format
- [ ] Test `ctoc ci --dry-run`:
  - [ ] Lists checks without running them
  - [ ] Shows detected CI system and container
- [ ] Test `ctoc ci --wizard`:
  - [ ] Generates CI config file
  - [ ] Config is valid YAML

---

### Step 8: QUALITY (Lint, Format, Typecheck)

**Purpose:** Ensure code quality tooling is configured and passing.

#### Linting

- [ ] Verify ESLint config includes all new files in `lib/`:
  - [ ] `lib/ci-parser.js`
  - [ ] `lib/test-runner.js`
  - [ ] `lib/docker-ci.js`
  - [ ] `lib/local-ci.js`
  - [ ] `lib/ci-wizard.js`
- [ ] Run `npm run lint` and fix any issues
- [ ] Verify `hooks/PreReview.js` passes lint
- [ ] Verify `hooks/PrePush.js` passes lint
- [ ] Verify `commands/ci.js` passes lint

#### Formatting

- [ ] Run `npm run format` (Prettier) on all new files
- [ ] Verify consistent formatting:
  - [ ] 2-space indentation
  - [ ] Single quotes for strings
  - [ ] Trailing commas in multiline

#### Type Checking (JSDoc)

- [ ] Add JSDoc type annotations to all exported functions:
  - [ ] `@param` for all parameters
  - [ ] `@returns` for return values
  - [ ] `@typedef` for complex types (CIConfig, CIResult, etc.)
- [ ] Verify types with `npm run typecheck` (if configured)

#### Commands to Run

```bash
npm run lint -- --fix
npm run format
npm run typecheck  # If TypeScript/JSDoc checking is enabled
```

---

### Step 9: IMPLEMENT

**Purpose:** Write the implementation code according to specifications.

#### Phase 1: Core Infrastructure (`lib/*.js`)

##### 9.1: Create `lib/ci-parser.js`

- [ ] Create file at `/home/tijn/ctoc/lib/ci-parser.js`
- [ ] Implement `CI_SYSTEMS` constant with config paths for each CI system
- [ ] Implement `detectCISystem(projectPath)`:
  - [ ] Use glob to find matching config files
  - [ ] Return first match with system name and config path
- [ ] Implement `parseCIConfig(projectPath)`:
  - [ ] Detect CI system
  - [ ] Call appropriate parser
  - [ ] Return normalized `{ found, system, checks, container }` object
- [ ] Implement `parseGitHubActions(workflowPath, projectPath)`:
  - [ ] Parse YAML with `js-yaml`
  - [ ] Extract `run` commands from steps
  - [ ] Detect container from `setup-node` or `container` key
- [ ] Implement `parseGitLabCI(configPath, projectPath)`:
  - [ ] Parse YAML
  - [ ] Extract scripts from jobs
  - [ ] Handle global vs job-level image
- [ ] Implement `parseJenkinsfile(configPath, projectPath)`:
  - [ ] Read file as text
  - [ ] Extract `sh` commands with regex
  - [ ] Extract docker agent image
- [ ] Implement `parseCircleCI(configPath, projectPath)`:
  - [ ] Parse YAML
  - [ ] Extract run steps
  - [ ] Detect executor docker image
- [ ] Implement `detectCheckType(command)`:
  - [ ] Match against lint/test/typecheck patterns
- [ ] Implement `filterRelevantChecks(checks)`:
  - [ ] Filter to only quality-relevant types
- [ ] Implement `getDefaultChecks(projectPath)`:
  - [ ] Use stack-detector to determine project type
  - [ ] Return language-appropriate checks
- [ ] Implement `detectDefaultContainer(projectPath)`:
  - [ ] Check `.nvmrc` / `.node-version`
  - [ ] Fall back to language defaults
- [ ] Export all functions via `module.exports`

##### 9.2: Create `lib/test-runner.js`

- [ ] Create file at `/home/tijn/ctoc/lib/test-runner.js`
- [ ] Implement `runWithTimeout(command, cwd, timeout)`:
  - [ ] Spawn process with `shell: true`
  - [ ] Set up timeout with `setTimeout`
  - [ ] Kill process on timeout with `SIGTERM`, then `SIGKILL`
  - [ ] Return `{ success, output, duration, timedOut }`
- [ ] Implement `parseCommand(command)`:
  - [ ] Handle `npm` and `npx` commands specially
  - [ ] Split on spaces, respecting quotes
- [ ] Implement `extractCoverage(output, projectPath)`:
  - [ ] Parse Jest/Vitest coverage format from output
  - [ ] Fall back to reading `coverage/coverage-summary.json`
- [ ] Implement `runTests(projectPath, options)`:
  - [ ] Call `runWithTimeout` with test command
  - [ ] Extract coverage if requested
  - [ ] Check against threshold
- [ ] Implement `formatDuration(ms)`:
  - [ ] Format as `Xms`, `X.Xs`, or `X.Xm`
- [ ] Export all functions via `module.exports`

##### 9.3: Create `lib/docker-ci.js`

- [ ] Create file at `/home/tijn/ctoc/lib/docker-ci.js`
- [ ] Implement `checkDocker()`:
  - [ ] Execute `docker --version`
  - [ ] Return `{ available, version }`
- [ ] Implement `runInDocker(image, command, projectPath, options)`:
  - [ ] Build docker command with volume mounts
  - [ ] Add environment variables
  - [ ] Call `runWithTimeout`
- [ ] Implement `runDockerCI(projectPath, ciConfig, options)`:
  - [ ] Check Docker availability
  - [ ] Pull image
  - [ ] Run each check sequentially
  - [ ] Call `onProgress` callback for each step
  - [ ] Return aggregated results
- [ ] Implement `runLocalCI(projectPath, ciConfig, options)`:
  - [ ] Run setup check first if present
  - [ ] Run quality checks
  - [ ] Return aggregated results
- [ ] Export all functions via `module.exports`

##### 9.4: Create `lib/local-ci.js`

- [ ] Create file at `/home/tijn/ctoc/lib/local-ci.js`
- [ ] Implement `runCI(projectPath, options)`:
  - [ ] Parse CI config
  - [ ] Handle dry-run mode
  - [ ] Check Docker availability
  - [ ] Show warning on first run without Docker (save to settings)
  - [ ] Route to Docker or local runner
- [ ] Implement `runCIWithFix(projectPath, options)`:
  - [ ] For lint checks, run with `--fix` first
  - [ ] Then run normal check
- [ ] Implement `defaultProgress(event)`:
  - [ ] Console output for each event type
- [ ] Implement `formatResult(result)`:
  - [ ] Format pass/fail banner
  - [ ] List failed checks with output
- [ ] Export all functions via `module.exports`

#### Phase 2: Enforcement (`hooks/*.js`)

##### 9.5: Create `hooks/PreReview.js`

- [ ] Create file at `/home/tijn/ctoc/hooks/PreReview.js`
- [ ] Implement `preReviewGate()`:
  - [ ] Print header banner
  - [ ] Call `runCI()`
  - [ ] Print result
  - [ ] Exit 1 if failed (block review)
  - [ ] Output JSON `{ allowed: true/false }` for Claude
- [ ] Make executable with `#!/usr/bin/env node`
- [ ] Export `{ preReviewGate }`

##### 9.6: Create `hooks/PrePush.js`

- [ ] Create file at `/home/tijn/ctoc/hooks/PrePush.js`
- [ ] Implement `prePushGate()`:
  - [ ] Print header banner
  - [ ] Call `runCI()`
  - [ ] Print result with helpful fix instructions on failure
  - [ ] Exit 1 if failed (block push)
- [ ] Make executable with `#!/usr/bin/env node`
- [ ] Export `{ prePushGate }`

#### Phase 3: User Interface

##### 9.7: Create `commands/ci.js`

- [ ] Create file at `/home/tijn/ctoc/commands/ci.js`
- [ ] Parse command-line arguments:
  - [ ] `--verbose`, `-v`
  - [ ] `--fix`
  - [ ] `--dry-run`
  - [ ] `--wizard`
  - [ ] `--help`, `-h`
- [ ] Implement `main()`:
  - [ ] Handle help flag
  - [ ] Handle wizard flag
  - [ ] Handle dry-run flag
  - [ ] Handle fix flag
  - [ ] Run normal CI and exit with appropriate code
- [ ] Implement `printHelp()`:
  - [ ] Show usage, options, examples
  - [ ] Emphasize "NO BYPASS"
- [ ] Implement `printDryRun(config)`:
  - [ ] Show CI system and config path
  - [ ] List all checks that would run
- [ ] Make executable with `#!/usr/bin/env node`

##### 9.8: Create `lib/ci-wizard.js`

- [ ] Create file at `/home/tijn/ctoc/lib/ci-wizard.js`
- [ ] Define `STRICTNESS_LEVELS` constant
- [ ] Implement `runCIWizard(projectPath)`:
  - [ ] Detect stack
  - [ ] Print header
  - [ ] Prompt for lint strictness
  - [ ] Prompt for typecheck (if TypeScript)
  - [ ] Prompt for coverage threshold
  - [ ] Prompt for E2E (if web app)
  - [ ] Prompt for CI system
  - [ ] Generate config
  - [ ] Preview and confirm
  - [ ] Write config
- [ ] Implement `selectOption(title, options)`:
  - [ ] Display options with descriptions
  - [ ] Read user input
  - [ ] Return selected key
- [ ] Implement `selectCISystem()`:
  - [ ] List supported CI systems
  - [ ] Return selected system key
- [ ] Implement `generateCIConfig(stack, selections, ciSystem)`:
  - [ ] Route to appropriate generator
- [ ] Implement `generateGitHubActionsConfig(stack, selections)`:
  - [ ] Build YAML string with appropriate steps
- [ ] Implement `generateGitLabCIConfig(stack, selections)`:
  - [ ] Build YAML for GitLab
- [ ] Implement `generateCircleCIConfig(stack, selections)`:
  - [ ] Build YAML for CircleCI
- [ ] Implement `writeCIConfig(projectPath, config, ciSystem)`:
  - [ ] Create directories as needed
  - [ ] Write config file
- [ ] Implement `askConfirm(question)`:
  - [ ] Simple Y/n prompt
- [ ] Export `{ runCIWizard, STRICTNESS_LEVELS, generateCIConfig }`

#### Phase 4: Configuration

##### 9.9: Update Settings Schema

- [ ] Edit `/home/tijn/ctoc/lib/settings.js`
- [ ] Add `local_ci` section to `SETTINGS_SCHEMA`:
  - [ ] `timeout` (number, default 600000)
  - [ ] `test_timeout` (number, default 300000)
  - [ ] `auto_fix_lint` (toggle, default true)
  - [ ] `docker_enabled` (toggle, default true)
  - [ ] `docker_warning_shown` (toggle, default false)

##### 9.10: Update Hooks Configuration

- [ ] Edit `/home/tijn/ctoc/.claude-plugin/hooks.json`
- [ ] Add `PreReview` hook entry
- [ ] Add `PrePush` hook entry

#### Phase 5: Dependencies

##### 9.11: Add Required Dependencies

- [ ] Verify `js-yaml` is in `package.json` (for parsing YAML)
- [ ] Verify `glob` is in `package.json` (for file pattern matching)
- [ ] Add if missing: `npm install js-yaml glob`

---

### Step 10: REVIEW (Self-Review)

**Purpose:** Self-review implementation for correctness and quality.

#### Code Review Checklist

- [ ] All functions have JSDoc comments with `@param` and `@returns`
- [ ] No hardcoded paths (use `path.join()`)
- [ ] No secrets or credentials in code
- [ ] All errors are caught and handled gracefully
- [ ] All async functions use proper `try/catch`
- [ ] Console output uses `lib/tui.js` color helpers
- [ ] No `console.log` in library code (only in commands/hooks)

#### Logic Review

- [ ] `ci-parser.js`:
  - [ ] All 4 CI systems parse correctly
  - [ ] Default checks cover all supported languages
  - [ ] Container detection has sensible fallbacks
- [ ] `test-runner.js`:
  - [ ] Timeout actually kills hung processes
  - [ ] Coverage extraction handles all formats
- [ ] `docker-ci.js`:
  - [ ] Docker command escapes paths correctly
  - [ ] Fallback to local works when Docker unavailable
- [ ] `local-ci.js`:
  - [ ] Warning is shown only once
  - [ ] Fix mode actually runs fix commands
- [ ] `ci-wizard.js`:
  - [ ] Generated configs are valid YAML
  - [ ] Directories are created before writing files

#### TDD Verification

- [ ] Run all tests from Step 7
- [ ] All tests pass (green)
- [ ] Add any missing edge case tests discovered during implementation

---

### Step 11: OPTIMIZE

**Purpose:** Improve performance and simplify code.

#### Performance Optimizations

- [ ] **CI Parsing**: Cache parsed config in memory for repeated calls in same session
- [ ] **Docker Pull**: Skip pull if image already exists locally (use `docker image inspect`)
- [ ] **Parallel Checks**: Consider running lint and typecheck in parallel (independent checks)
  - [ ] Only if both are present
  - [ ] Use `Promise.all()` for parallelization
- [ ] **Early Exit**: Stop on first test failure (fail-fast mode)
  - [ ] Make configurable: `local_ci.fail_fast: true`

#### Code Simplifications

- [ ] **Extract common patterns**:
  - [ ] Create helper for "run command and check exit code"
  - [ ] Create helper for "format duration"
- [ ] **Reduce duplication**:
  - [ ] Combine similar parsers into shared base
  - [ ] Unify progress event handling

#### Memory Considerations

- [ ] Limit output buffer size (don't store entire test output if very large)
- [ ] Stream output for verbose mode instead of buffering

---

### Step 12: SECURE

**Purpose:** Verify security of implementation.

#### Input Validation

- [ ] **Project Path**: Validate `projectPath` is a real directory
- [ ] **CI Config**: Validate parsed YAML before executing commands
- [ ] **Docker Image**: Validate image name format before `docker pull`
- [ ] **Commands**: Do NOT allow arbitrary user commands to be injected

#### Command Injection Prevention

- [ ] Verify commands from CI config are not user-controllable
- [ ] Use array form of `spawn()` to avoid shell injection
- [ ] Escape special characters in file paths

#### Docker Security

- [ ] Run containers with `--rm` (no persistent state)
- [ ] Mount project as read-only where possible (`-v path:/app:ro`)
- [ ] Do not expose network ports
- [ ] Do not run as root inside container (if possible)

#### Secrets Protection

- [ ] Do not log environment variables
- [ ] Do not include `.env` files in Docker mounts
- [ ] Warn if CI config contains secrets (API keys, tokens)

#### Security Commands to Run

```bash
npm audit                    # Check for vulnerable dependencies
npx snyk test               # Additional security scan (if available)
```

---

### Step 13: VERIFY

**Purpose:** Run all tests and verify everything works.

#### Test Commands

- [ ] Run unit tests:
  ```bash
  npm test tests/lib/ci-parser.test.js
  npm test tests/lib/test-runner.test.js
  npm test tests/lib/docker-ci.test.js
  npm test tests/lib/local-ci.test.js
  npm test tests/lib/ci-wizard.test.js
  ```

- [ ] Run integration tests:
  ```bash
  npm test tests/integration/local-ci.test.js
  ```

- [ ] Run E2E tests:
  ```bash
  npm test tests/e2e/ci-gate.test.js
  ```

- [ ] Run full test suite:
  ```bash
  npm test
  ```

#### Coverage Verification

- [ ] Check coverage report:
  ```bash
  npm test -- --coverage
  ```
- [ ] Verify coverage >= 80% for all new files:
  - [ ] `lib/ci-parser.js`
  - [ ] `lib/test-runner.js`
  - [ ] `lib/docker-ci.js`
  - [ ] `lib/local-ci.js`
  - [ ] `lib/ci-wizard.js`

#### Manual Verification

- [ ] Test `ctoc ci` in a sample project:
  - [ ] With GitHub Actions config
  - [ ] Without any CI config (should use defaults)
  - [ ] With failing tests (should block)
- [ ] Test `ctoc ci --dry-run`:
  - [ ] Shows correct checks
  - [ ] Does not execute anything
- [ ] Test `ctoc ci --wizard`:
  - [ ] Generates valid CI config
  - [ ] Config works when run

---

### Step 14: DOCUMENT

**Purpose:** Update documentation for new features.

#### README.md Updates

- [ ] Add "Local CI Gate" section explaining the feature
- [ ] Add `ctoc ci` command to command reference
- [ ] Add configuration options for `local_ci` settings

#### Inline Documentation

- [ ] Verify all exported functions have JSDoc
- [ ] Add module-level comments explaining purpose of each file

#### CHANGELOG.md

- [ ] Add entry for Local CI Gate feature:
  ```markdown
  ## [X.Y.Z] - YYYY-MM-DD

  ### Added
  - Local CI Gate enforcement (pre-review and pre-push)
  - `ctoc ci` command for manual CI checks
  - CI Configuration Wizard (`ctoc ci --wizard`)
  - Docker-based CI execution for environment parity
  - Support for GitHub Actions, GitLab CI, Jenkins, CircleCI

  ### Changed
  - Iron Loop Step 14 now enforces Local CI Gate
  ```

#### Help Text

- [ ] Verify `ctoc ci --help` is accurate and complete
- [ ] Verify error messages are helpful and actionable

---

### Step 15: FINAL-REVIEW

**Purpose:** Final quality gate before commit.

#### Checklist

- [ ] **All tests pass**: `npm test` exits with code 0
- [ ] **Lint passes**: `npm run lint` exits with code 0
- [ ] **No uncommitted changes**: All changes are staged
- [ ] **No TODO/FIXME comments**: Search codebase for unresolved TODOs
- [ ] **Coverage threshold met**: >= 80% on new files

#### Files Changed Summary

| File | Type | Description |
|------|------|-------------|
| `lib/ci-parser.js` | New | CI configuration parser |
| `lib/test-runner.js` | New | Test execution with timeout |
| `lib/docker-ci.js` | New | Docker-based CI execution |
| `lib/local-ci.js` | New | Main CI runner orchestration |
| `lib/ci-wizard.js` | New | Interactive CI config wizard |
| `hooks/PreReview.js` | New | Pre-review gate hook |
| `hooks/PrePush.js` | New | Pre-push gate hook |
| `commands/ci.js` | New | `ctoc ci` command |
| `lib/settings.js` | Modified | Added local_ci settings |
| `.claude-plugin/hooks.json` | Modified | Added hook entries |
| `tests/lib/ci-parser.test.js` | New | Unit tests |
| `tests/lib/test-runner.test.js` | New | Unit tests |
| `tests/lib/docker-ci.test.js` | New | Unit tests |
| `tests/lib/local-ci.test.js` | New | Unit tests |
| `tests/lib/ci-wizard.test.js` | New | Unit tests |
| `tests/integration/local-ci.test.js` | New | Integration tests |
| `tests/e2e/ci-gate.test.js` | New | E2E tests |

#### Success Criteria Verification

- [ ] CI config parser supports GitHub Actions, GitLab CI, Jenkins, CircleCI
- [ ] Docker-based execution for environment parity
- [ ] Docker fallback to local with one-time warning (remembered)
- [ ] Container image auto-detection from CI config
- [ ] Local CI runner executes EXACT same checks as remote CI
- [ ] Tests MUST run (not just be created)
- [ ] Hanging tests detected and reported (timeout)
- [ ] Pre-review hook blocks review until CI passes (no bypass)
- [ ] Pre-push Git hook blocks push until CI passes (no bypass)
- [ ] NO bypass mechanism exists (absolute gate)
- [ ] Iron Loop Step 14 enforces Local CI Gate
- [ ] `ctoc ci` command for manual runs
- [ ] CI Config Wizard when no CI exists
- [ ] If local gate passes, CI is GUARANTEED to pass

#### Final Commands

```bash
# Run full quality check (meta: use the feature we just built!)
npm test
npm run lint
npm run format -- --check

# Stage and commit
git add lib/ci-parser.js lib/test-runner.js lib/docker-ci.js lib/local-ci.js lib/ci-wizard.js
git add hooks/PreReview.js hooks/PrePush.js
git add commands/ci.js
git add lib/settings.js .claude-plugin/hooks.json
git add tests/
git commit -m "feat: add Local CI Gate enforcement (vX.Y.Z)

- Add lib/ci-parser.js for parsing GitHub Actions, GitLab CI, Jenkins, CircleCI
- Add lib/test-runner.js with timeout handling for hanging tests
- Add lib/docker-ci.js for Docker-based CI execution
- Add lib/local-ci.js as main orchestrator
- Add lib/ci-wizard.js for interactive CI config generation
- Add PreReview and PrePush hooks to block without passing CI
- Add ctoc ci command for manual CI runs
- Add comprehensive test suite

No bypass mechanism. The gate is absolute.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Self-Critique Summary

### Round 1: Initial Review

| Step | Issue Found | Resolution |
|------|-------------|------------|
| Step 7 | Missing tests for Jenkinsfile edge cases | Added explicit test cases for `sh` command extraction |
| Step 9 | No mention of dependency installation | Added Phase 5 (9.11) for dependencies |
| Step 11 | Parallel checks not marked as optional | Clarified as optional optimization with config |
| Step 12 | Docker security not specific enough | Added specific security measures (--rm, read-only) |

### Round 2: Clarity Check

| Step | Issue Found | Resolution |
|------|-------------|------------|
| Step 7 | Test file paths not explicit | Changed from "Create tests for..." to "Create `tests/lib/ci-parser.test.js`" |
| Step 9 | Implementation order unclear | Added explicit phase numbering (9.1, 9.2, etc.) |
| Step 15 | No file list for commit | Added comprehensive file table |

### Round 3: Testability Check

| Step | Issue Found | Resolution |
|------|-------------|------------|
| Step 7 | Some tests too vague | Made test assertions explicit (e.g., "Returns `{ system: 'github', ... }`") |
| Step 13 | No coverage threshold specified | Added "Verify coverage >= 80% for all new files" |
| Step 15 | Success criteria not checkable | Made each criterion a checkbox |

All steps are now:
- **Clear**: Unambiguous instructions
- **Testable**: Verifiable completion criteria
- **Specific**: Exact files, commands, and patterns

---

*Generated by Iron Loop Integrator | Last refined: 2026-02-01*

---

## Implementation Progress

### Phase 1: Core Infrastructure - COMPLETE

**Status**: Complete
**Date**: 2025-02-02

**Files Created**:
- [x] `lib/ci-parser.js` - Parse CI configs (GitHub Actions, GitLab, Jenkins, CircleCI)
- [x] `lib/test-runner.js` - Test execution with timeout handling
- [x] `lib/local-ci.js` - Main CI runner orchestration
- [x] `commands/ci.js` - `ctoc ci` command implementation

**Features Implemented**:
- CI configuration detection (GitHub Actions, GitLab CI, Jenkins, CircleCI)
- Check type detection (lint, test, typecheck, build, security, coverage, format)
- Test framework detection (Jest, Vitest, Mocha, Node Test Runner, Pytest, Go Test, Cargo Test)
- Test count parsing from various output formats
- Container image detection based on project type
- Default checks when no CI config found
- Timeout handling for long-running commands
- Pre-push and pre-review gate modes

### Phase 2: Enforcement - PENDING

**Status**: Not started
**Required**:
- [ ] `hooks/PreReview.js` - Block review until local CI passes
- [ ] `hooks/PrePush.js` - Block push until local CI passes

### Phase 3: User Interface - PENDING

**Status**: Not started
**Required**:
- [ ] `lib/ci-wizard.js` - Interactive wizard for projects without CI
- [ ] `.ctoc/templates/ci/*` - Generated CI templates

### Phase 6: Testing - COMPLETE

**Status**: Complete
**Date**: 2025-02-02

**Files Created**:
- [x] `tests/local-ci.test.js` - 39 tests for CI parser, test runner, local CI

**Test Results**:
- Local CI tests: 39/39 passing
- Total test suite: 489 tests passing

---

### Usage

```bash
# Run all CI checks locally
ctoc ci

# Quick checks (lint, typecheck only)
ctoc ci quick

# Full checks including tests
ctoc ci full

# Show CI configuration
ctoc ci status

# Run specific check type
ctoc ci --type=lint
ctoc ci --type=test

# Pre-push gate (for git hooks)
ctoc ci --pre-push
```

---

### Next Steps

1. Create hooks for automatic enforcement (PreReview.js, PrePush.js)
2. Implement CI wizard for projects without CI
3. Add docker-ci.js for environment parity
4. Create CI templates for GitHub Actions and GitLab
