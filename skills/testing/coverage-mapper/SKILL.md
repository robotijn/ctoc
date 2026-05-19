---
name: coverage-mapper
description: Builds and maintains file-to-test mappings and maps uncovered code to risk so test additions go where they matter.
type: skill
when_to_load:
  - "coverage map"
  - "build coverage map"
  - "rebuild coverage map"
  - "file to test mapping"
  - "which tests cover"
  - "smart test selection"
  - "uncovered risk"
  - "coverage risk rank"
  - "where to add tests"
  - "PR coverage diff"
related_skills:
  - testing/coverage-enforcer
  - testing/smart-test-runner
  - testing/runners/unit-test-runner
effort_level: medium
model_optimized_for: opus-4-7
tools: Bash, Read, Write, Grep, Glob
model: sonnet
tier: 2
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: true
effort_budget:
  max_subagents: 0
---

# Coverage Mapper (skill)

> Converted from agents/testing/coverage-mapper.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You build and maintain two artifacts:

1. **The file → test mapping** that enables smart test selection (which tests exercise which source files).
2. **The uncovered-code → risk mapping** that tells writer skills *where to add tests next* — weighted by criticality, churn, complexity, change-in-PR, and ownership.

**Role split — non-negotiable.** This skill MAPS coverage findings to risk and SUGGESTS where to add tests. It does NOT enforce thresholds and does NOT block merges. The gate is [[coverage-enforcer]]; the runner is [[smart-test-runner]]; the authors are the writer skills (unit/integration/e2e test makers). Coverage-mapper produces structured signals; the other three act on them.

**Core Principle**: Coverage is an INPUT to risk, not a goal. A 100%-covered codebase with shallow assertions is worse than 80%-covered with strong assertions on the right paths. Map uncovered code to risk; let the gate decide pass/fail.

## 2026 Best Practices (Testing category)

Coverage-as-vanity is dead. The 2026 consensus across Codecov, Datadog, SonarQube Cloud, and Qodana is **risk-weighted coverage with PR-diff focus** — gate on what changed, prioritize what matters, and treat the overall % as a trailing indicator.

### Foundational shifts

- **Uncovered-but-trivial ≠ uncovered-and-risky.** A getter, a default constructor, a `toString()`, a dataclass field — these are uncovered noise. An untested branch in an authorization check, an untested catch block in a payment flow, an untested conditional in a SQL escape path — these are uncovered debt. The mapper MUST distinguish the two; otherwise it floods the writer skills with low-value targets.
- **Diff coverage gates, not absolute %**. The 2026 pattern: require strong coverage for new/changed code (typically branch-coverage threshold on the PR diff), enforce branch coverage thresholds on core logic modules (allowlist), and improve legacy areas incrementally without blocking shipping. Codecov, diff-cover (Python), and the GitHub PR-comment pattern all converge on this.
- **Testing Trophy, not pyramid.** When building the file → test map, weight by Trophy layers. An integration test that covers 20 files is more valuable than 20 isolated unit tests that each cover 1 file. The map should expose this so [[smart-test-runner]] can prefer wide-coverage tests for shared-dependency changes.
- **Intent-based test authoring.** When a file lacks coverage, the map's "uncovered" list drives writer skills to author *intent-based* tests (user-visible behavior, not implementation details). Flagging "0% covered" without context just produces low-value implementation tests.
- **Risk-rank, not flat list.** Codecov, SonarQube Cloud, and Datadog Code Coverage all surface "risk-ranked" or "criticality-weighted" uncovered lines in 2026. The mapper emits a `risk_score` per uncovered region; downstream skills sort by it.
- **Reachability matters for coverage too.** Dead code that's "uncovered" because nothing ever calls it is not a bug — it's removable code. If the mapper can prove an uncovered function has no callers in the repo, emit `reachable: false` and recommend deletion instead of testing.

### Risk-weighting inputs (the formula behind `risk_score`)

A useful 2026 risk-score combines (weights are project-tunable defaults; reconcile against your repo's history before pinning):

| Input | Why it matters | Where to get it |
|---|---|---|
| **Criticality of the module** | Auth, payments, crypto, RBAC, SQL builders — failures here are user-facing or security-critical | `.ctoc/settings.yaml` → `critical_paths:` allowlist, or path heuristics (`auth/`, `payments/`, `security/`) |
| **Churn (git log frequency)** | Files changed often have more chances to introduce regressions | `git log --since=90.days --name-only | sort | uniq -c` |
| **Cyclomatic complexity** | Complex branches = more untested edge cases | `radon`, `eslint-plugin-sonarjs`, `lizard`, `pmd-cpd` |
| **Call-count / fan-in** | Widely-used helpers; a bug ripples | Static call-graph analysis or runtime tracing |
| **Uncovered-kind** | Error path > branch > line > function-without-callers | From coverage report (`b`, `s`, `f` counters) |
| **In-PR delta** | New-uncovered lines block, pre-existing don't | Diff against `origin/main` |
| **Ownership / staleness** | Owner active? Module touched in last 6 months? | `git log` + `CODEOWNERS` |

### Uncovered categories (what to surface to writer skills)

The mapper categorizes every uncovered region. Categories drive both the `risk_score` weight and the choice of writer skill:

| Category | Example | Default risk weight | Writer to dispatch |
|---|---|---|---|
| **Uncovered error path** | `except ValueError:` body never executed | high | unit-test-maker (error path tests) |
| **Uncovered branch in critical module** | `if user.is_admin:` else-branch in auth | critical | integration-test-maker |
| **Uncovered file in high-churn area** | File with 12 commits/90d, 0% covered | high | unit-test-maker (foundational) |
| **Uncovered new code in PR** | Lines added in this PR with no assertion | critical | unit-test-maker (PR-blocking) |
| **Uncovered catch block** | `try: ... except: log` — failure swallowed | high | unit-test-maker (negative case) |
| **Uncovered conditional in security-sensitive path** | Path-traversal check, SQL escape, JWT verify | critical | integration-test-maker + sast-scanner cross-check |
| **Uncovered trivial getter / ctor / DTO field** | `def name(self): return self._name` | informational | none — suppress |
| **Uncovered dead code (no callers)** | Function exists, nobody calls it | informational | refactoring-suggester (delete, don't test) |

Informational rows are **emitted but suppressed in the writer dispatch list** unless the user explicitly asks `show trivial`.

## Trigger

- Manual: `ctoc coverage-map rebuild`
- Manual: `ctoc coverage-map risk` (recompute risk scores without re-running tests)
- Auto: map > 7 days old
- Auto: test files added/removed/renamed
- Auto: new source file detected without mapping
- Auto: config files changed (tsconfig, pytest.ini, jest.config, `coverlet.runsettings`, `pom.xml`)
- Auto: PR opened with new uncovered lines in critical paths

## Process

```
1. Run full test suite with coverage enabled (or load existing report)
2. Parse coverage report (format depends on language; see "Tool Integration" below)
3. For each source file, record which tests executed it
4. Compute risk_score per uncovered region using the inputs above
5. Categorize each uncovered region (error-path / branch / dead / trivial / ...)
6. Diff against PR base if running on a PR (emit `delta_to_baseline`)
7. Store in .ctoc/quality-state/coverage-map.json
8. Store metadata (build time, config hash, git sha, PR base sha)
9. Emit per-region letters for any region with risk_score >= configured threshold
```

## Coverage Map Structure

`.ctoc/quality-state/coverage-map.json`:
```json
{
  "metadata": {
    "builtAt": "2026-05-19T09:00:00Z",
    "configHash": "sha256:abc...",
    "testFramework": "jest",
    "totalTests": 145,
    "totalFiles": 87,
    "prBaseSha": "abc1234",
    "headSha": "def5678"
  },
  "files": {
    "src/lib/state.js": {
      "tests": ["tests/unit/state.test.js", "tests/integration/workflow.test.js"],
      "linesCovered": 45,
      "linesTotal": 50,
      "branchesCovered": 18,
      "branchesTotal": 22,
      "coverage": 90.0,
      "branchCoverage": 81.8,
      "criticality": "high",
      "churn90d": 7,
      "complexity": 12,
      "hash": "sha256:abc..."
    }
  },
  "tests": {
    "tests/unit/state.test.js": {
      "covers": ["src/lib/state.js", "src/utils/helpers.js"],
      "duration": 0.823,
      "assertions": 12
    }
  },
  "uncovered_regions": [
    {
      "file": "src/auth/jwt.js",
      "line": 87,
      "uncovered_kind": "branch",
      "category": "uncovered_conditional_security",
      "risk_score": 9.2,
      "reachable": true,
      "delta_to_baseline": "new",
      "in_pr": true,
      "suggested_test": "Add a unit test that passes a JWT with mismatched `iss` claim — expect rejection."
    }
  ]
}
```

## Tool Integration (2026)

Two layers: (1) coverage-format parsers per language, (2) aggregation + risk-rank platforms.

### Layer 1 — coverage formats by language

| Language | Format | Generator | Notes |
|---|---|---|---|
| TypeScript / JavaScript | LCOV + Istanbul JSON | `c8`, `nyc`, Jest `--coverage`, Vitest `--coverage`, Playwright | LCOV is the lingua franca; Istanbul JSON has branch granularity |
| Python | `coverage.py` JSON, LCOV, Cobertura XML | `coverage run -m pytest`, `pytest --cov` | `--include` / `--omit` for scoping |
| C# / .NET | Coverlet (OpenCover XML, Cobertura, LCOV, JSON) + ReportGenerator | `dotnet test /p:CollectCoverage=true /p:CoverletOutputFormat=cobertura,opencover,lcov` | ReportGenerator merges multi-project runs |
| Java / Kotlin | JaCoCo XML + HTML | `./gradlew jacocoTestReport`, `mvn jacoco:report` | XML feeds Codecov/SonarQube; counters: INSTRUCTION, BRANCH, LINE, METHOD, CLASS, COMPLEXITY |
| C / C++ | gcov → lcov → gcovr | `g++ --coverage`, `gcov`, `lcov --capture`, `gcovr --xml-pretty` | gcovr emits Cobertura XML for CI |
| Go | Go cover profile | `go test -coverprofile=cover.out -covermode=atomic ./...` | `go tool cover -html=cover.out` for review |
| Rust | tarpaulin / llvm-cov | `cargo tarpaulin --out Lcov`, `cargo llvm-cov --lcov` | llvm-cov is closer to source-level truth |
| SQL (pgTAP) | TAP output | `pg_prove --recurse t/` | Coverage in SQL means "every branch in the procedural code (PL/pgSQL) has a test"; pgTAP gives the assertion layer, but line-level coverage on PL/pgSQL is sparse — track via `plpgsql_check.plpgsql_show_dependency_tb` for unreached blocks |

### Layer 2 — aggregation + risk-rank platforms

| Tool | Strengths | When to use |
|---|---|---|
| **Codecov** | Unified PR comment, diff coverage, "Unexpected Coverage Changes" detection, 20+ format support (LCOV, Cobertura XML, JaCoCo XML, clover, gcov, ...), component-based grouping | PR-blocking diff coverage, multi-language repos |
| **diff-cover** (Python) | Local-first; prints diff coverage to console; CI-friendly; LCOV + Cobertura input | Lightweight repos, pre-push hook |
| **SonarQube Cloud / Sonar IDE** | Test coverage + "new code" coverage parameter, multi-tool ingestion (LCOV, JaCoCo, OpenCover, Cobertura, ...), quality-gate integration | Org-wide quality gates |
| **Datadog Code Coverage** | Test-impact analysis, flakiness correlation, real-runtime tracing for risk weighting | Large monorepos with CI cost concerns |
| **Qodana** (JetBrains) | Coverage + static analysis in one report, IDE-integrated | JetBrains-stack teams |

The mapper writes a normalized JSON; downstream skills don't care which engine produced it. When integrating with Codecov, post the per-region letters as a GitHub PR comment alongside the standard Codecov delta.

### LCOV → PR-diff mapping example (TypeScript)

```javascript
// Given coverage/lcov.info and a PR diff against origin/main,
// emit only uncovered lines that are also in the PR diff.
import { execSync } from 'node:child_process';
import fs from 'node:fs';

function parseLcov(file) {
  const blocks = fs.readFileSync(file, 'utf-8').split('end_of_record');
  return blocks.flatMap(block => {
    const sf = block.match(/SF:(.+)/)?.[1];
    if (!sf) return [];
    const uncovered = [...block.matchAll(/DA:(\d+),0/g)].map(m => Number(m[1]));
    const branches  = [...block.matchAll(/BRDA:(\d+),\d+,\d+,(\d+|-)/g)]
      .filter(m => m[2] === '0' || m[2] === '-').map(m => Number(m[1]));
    return uncovered.map(line => ({ file: sf, line, kind: 'line' }))
      .concat(branches.map(line => ({ file: sf, line, kind: 'branch' })));
  });
}

function prDiffLines(base = 'origin/main') {
  const out = execSync(`git diff --unified=0 ${base}...HEAD`).toString();
  const byFile = {};
  let current = null;
  for (const line of out.split('\n')) {
    const f = line.match(/^\+\+\+ b\/(.+)/); if (f) { current = f[1]; byFile[current] = new Set(); continue; }
    const h = line.match(/^@@ .* \+(\d+)(?:,(\d+))?/);
    if (h && current) {
      const start = +h[1], count = h[2] ? +h[2] : 1;
      for (let i = 0; i < count; i++) byFile[current].add(start + i);
    }
  }
  return byFile;
}

const uncovered = parseLcov('coverage/lcov.info');
const diff = prDiffLines();
const inPr = uncovered.filter(u => diff[u.file]?.has(u.line));
// inPr is the list to risk-score and surface as PR-blocking
```

### Python — `coverage.py` scoped to changed paths

```bash
# Scope to changed files for fast PR feedback
CHANGED=$(git diff --name-only origin/main...HEAD -- '*.py' | paste -sd, -)
coverage run --include="$CHANGED" -m pytest
coverage json -o coverage.json
coverage report --include="$CHANGED" --skip-covered --show-missing
# diff-cover for diff-only view
diff-cover coverage.xml --compare-branch=origin/main --fail-under=80
```

### .NET — Coverlet → Cobertura → ReportGenerator

```bash
dotnet test /p:CollectCoverage=true \
            /p:CoverletOutputFormat=\"cobertura,opencover,lcov\" \
            /p:CoverletOutput=./TestResults/
reportgenerator -reports:./**/coverage.cobertura.xml \
                -targetdir:./coverage-html \
                -reporttypes:Html,Cobertura,MarkdownSummaryGithub
# MarkdownSummaryGithub is appropriate for $GITHUB_STEP_SUMMARY
```

### Java / Kotlin — JaCoCo XML

```bash
./gradlew test jacocoTestReport
# build/reports/jacoco/test/jacocoTestReport.xml
# Counters: INSTRUCTION (finest), BRANCH, LINE, METHOD, CLASS, COMPLEXITY (cyclomatic)
# Feed XML to Codecov / SonarQube; risk-rank uses BRANCH + COMPLEXITY together
```

### C / C++ — gcov + lcov + gcovr

```bash
g++ -O0 -g --coverage -o app src/*.cpp
./app   # exercise via your test harness (ctest, gtest, catch2)
lcov --capture --directory . --output-file coverage.info
lcov --remove coverage.info '/usr/*' '*/vendor/*' --output-file coverage.info
genhtml coverage.info --output-directory coverage-html
# gcovr is the modern wrapper — emits Cobertura XML for CI
gcovr -r . --cobertura coverage.xml --html-details coverage.html \
      --exclude '.*/vendor/.*' --exclude '.*_test\.cpp'
```

### SQL (pgTAP) — assertions + PL/pgSQL gap finder

```bash
# pgTAP supplies assertions, not line coverage
pg_prove --recurse --ext .sql t/
# For uncovered-branch surfacing inside PL/pgSQL procedures:
# plpgsql_check audits dead code and unreached branches
psql -c "SELECT * FROM plpgsql_check_function('public.calc_total()', performance_warnings => true);"
# Coverage-mapper treats every plpgsql_check warning of dead/unreached as an uncovered_region.
```

### Foundational walk-through — Python (full uncovered → risk pipeline)

End-to-end, in one language, to show every input feeding `risk_score`:

```bash
# 1. Run coverage with branch tracking
coverage run --branch --source=src -m pytest
coverage json -o coverage.json
```

```python
# 2. Parse + classify + risk-score
import json, subprocess, ast, os
from pathlib import Path

cov = json.load(open("coverage.json"))
pr_base = os.environ.get("PR_BASE", "origin/main")

def churn(path, days=90):
    out = subprocess.check_output(
        ["git", "log", f"--since={days}.days", "--oneline", "--", path]).decode()
    return len([l for l in out.splitlines() if l])

def pr_lines(path):
    try:
        diff = subprocess.check_output(
            ["git", "diff", "--unified=0", f"{pr_base}...HEAD", "--", path]).decode()
    except subprocess.CalledProcessError:
        return set()
    added = set()
    for hunk in diff.split("\n"):
        if hunk.startswith("@@"):
            try:
                start = int(hunk.split("+")[1].split(",")[0].split(" ")[0])
                count = int(hunk.split("+")[1].split(",")[1].split(" ")[0]) if "," in hunk.split("+")[1] else 1
                for i in range(count):
                    added.add(start + i)
            except Exception:
                pass
    return added

def is_critical_path(path):
    parts = Path(path).parts
    return any(p in {"auth", "payments", "security", "crypto", "rbac"} for p in parts)

def classify(file, line, src):
    # Read a small window around the uncovered line to categorize
    try:
        text = Path(file).read_text().splitlines()
        ctx = "\n".join(text[max(0, line - 3):line + 2])
    except Exception:
        return "uncovered_line"
    if "except" in ctx and ":" in ctx: return "uncovered_catch_block"
    if "raise" in ctx: return "uncovered_error_path"
    if any(k in ctx for k in ("if ", "elif ", "match ", "case ")): return "uncovered_branch"
    if "def " in ctx and is_critical_path(file): return "uncovered_conditional_security"
    return "uncovered_line"

regions = []
for file, data in cov["files"].items():
    crit = is_critical_path(file)
    ch = churn(file)
    pr = pr_lines(file)
    for line in data["missing_lines"]:
        cat = classify(file, line, data)
        score = 1.0
        if crit:                          score += 4.0
        if line in pr:                    score += 3.0
        if cat == "uncovered_catch_block":      score += 2.0
        if cat == "uncovered_error_path":       score += 2.0
        if cat == "uncovered_conditional_security": score += 3.0
        score += min(ch / 4.0, 2.0)       # churn capped at +2
        regions.append({
            "file": file, "line": line, "category": cat,
            "risk_score": round(score, 1),
            "in_pr": line in pr, "criticality": "high" if crit else "normal",
        })

regions.sort(key=lambda r: r["risk_score"], reverse=True)
json.dump({"uncovered_regions": regions[:200]}, open(".ctoc/quality-state/coverage-map.json", "w"), indent=2)
```

The same shape ports trivially to TS/Go/.NET/Java/C++. The skill ships this as the reference implementation; per-language wrappers convert LCOV/Cobertura/JaCoCo to the same `{file, line, category, risk_score, in_pr, criticality}` row shape.

## Mapping Tests to Files

### Option 1: Import analysis (fast, approximate)

```javascript
function analyzeTestImports(testFile) {
  const content = fs.readFileSync(testFile, 'utf-8');
  const imports = [];
  const importRegex = /import\s+.*\s+from\s+['"]([^'"]+)['"]/g;
  let match;
  while ((match = importRegex.exec(content)) !== null) imports.push(match[1]);
  const requireRegex = /require\(['"]([^'"]+)['"]\)/g;
  while ((match = requireRegex.exec(content)) !== null) imports.push(match[1]);
  return imports;
}
```

### Option 2: Per-test coverage (slow, accurate)

```javascript
async function getPerTestCoverage(testFile) {
  await exec(`npx jest ${testFile} --coverage --coverageReporters=json`);
  const coverage = JSON.parse(fs.readFileSync('coverage/coverage-final.json'));
  return Object.keys(coverage);
}
```

Use Option 1 for fast incremental rebuilds, Option 2 for full rebuild and for any path crossing a critical-path boundary (auth/payment/crypto). When Option 1 disagrees with Option 2, prefer Option 2 silently and log the divergence in `.ctoc/logs/coverage-mapper.json`.

## Rebuild Triggers

```javascript
function needsRebuild(coverageMap) {
  const ageInDays = (new Date() - new Date(coverageMap.metadata.builtAt)) / 86_400_000;
  if (ageInDays > 7) return { rebuild: true, reason: 'map > 7 days' };
  if (computeConfigHash() !== coverageMap.metadata.configHash) {
    return { rebuild: true, reason: 'config changed' };
  }
  for (const file of glob.sync('src/**/*.{ts,js,py,go,cs,java,cpp,c,h,rs}')) {
    if (!coverageMap.files[file]) return { rebuild: true, reason: `new file: ${file}` };
  }
  const testFiles = glob.sync('tests/**/*.{test,spec}.{ts,js,py,go,cs,java,cpp}');
  if (testFiles.length !== Object.keys(coverageMap.tests).length) {
    return { rebuild: true, reason: 'tests added/removed' };
  }
  return { rebuild: false };
}
```

## Incremental Updates

```javascript
async function incrementalUpdate(changedTestFiles) {
  const coverageMap = loadCoverageMap();
  for (const testFile of changedTestFiles) {
    await exec(`npx jest ${testFile} --coverage --coverageReporters=json`);
    const coverage = JSON.parse(fs.readFileSync('coverage/coverage-final.json'));
    coverageMap.tests[testFile] = {
      covers: Object.keys(coverage),
      duration: getTestDuration(testFile),
      lastRun: new Date().toISOString()
    };
    for (const sourceFile of Object.keys(coverage)) {
      coverageMap.files[sourceFile] ??= { tests: [] };
      if (!coverageMap.files[sourceFile].tests.includes(testFile)) {
        coverageMap.files[sourceFile].tests.push(testFile);
      }
    }
  }
  saveCoverageMap(coverageMap);
}
```

## Output Format

```markdown
## Coverage Map Build Report

**Status**: SUCCESS
**Duration**: 2m 34s
**Framework**: jest

### Summary
| Metric | Value |
|--------|-------|
| Source Files | 87 |
| Test Files | 45 |
| Total Lines | 12,456 |
| Covered Lines | 10,987 |
| Overall Coverage | 88.2% |
| Branch Coverage | 79.4% |
| PR-diff Coverage | 64.0% (12 of 32 new lines uncovered) |

### Top Risk-Ranked Uncovered Regions
| risk | file:line | category | in_pr | suggested_test |
|---|---|---|---|---|
| 9.2 | src/auth/jwt.js:87 | uncovered_conditional_security | yes | Reject token with mismatched `iss` claim |
| 8.4 | src/payments/refund.ts:142 | uncovered_error_path | yes | Stripe API 503 — verify retry + idempotency key |
| 7.6 | src/rbac/check.py:55 | uncovered_branch | no | Non-admin user accessing admin-only resource → 403 |

### Suppressed (informational only)
- 47 trivial getters / dataclass fields
- 3 dead functions with no callers (consider deletion)

### Coverage Map Location
`.ctoc/quality-state/coverage-map.json`

### Next Rebuild Triggers
- map age > 7 days
- test files added/removed
- config files changed
- Manual: `ctoc coverage-map rebuild`
```

## Severity (internal triage vs. refinement-loop output)

These tiers are the **internal triage view** used when you produce a human-readable scan report. When this skill emits a letter to CTO Chief via the refinement loop, **every finding becomes `severity: critical`** per the warnings-are-bugs rule (see [agents/_shared/warnings-are-critical.md](../../../agents/_shared/warnings-are-critical.md)) — there is no soft tier on the wire. The triage tiers below stay in the report body for prioritization, but the letter's `severity` field is always `critical`.

| Triage tier | Examples | Internal action recommendation |
|---|---|---|
| CRITICAL | Uncovered new code in PR in critical path; uncovered conditional in auth/payment/crypto; uncovered catch in payment flow | BLOCK |
| HIGH | Uncovered error path in non-critical module; uncovered branch in high-churn file; uncovered file in critical path | Fix before merge |
| MEDIUM | Uncovered branch in low-churn non-critical module; uncovered line in stable module | Add to backlog |
| LOW / informational | Uncovered trivial getter, ctor, DTO field; dead code with no callers | Suppress unless `show trivial` |

Triage and wire severity reconcile this way: triage HIGH and CRITICAL both emit `severity: critical` on the wire (because they block phase advancement); triage MEDIUM/LOW emit as `severity: critical` only when `risk_score >= configured_threshold` (default 6.0 — tune in `.ctoc/settings.yaml`). Trivial/informational rows are emitted as `severity: critical` with `confidence: low` and `reachable: false|unknown`, and the integrator MAY defer them. This is the same reconciliation pattern [[sast-scanner]] uses for `reachable: false` findings.

## Letter schema (refinement-loop output contract)

When emitting a finding via the refinement loop, write the letter with these fields:

```yaml
finding_id: <sha256(critic+file+line+kind)[:12]>      # fingerprint for dedup
severity: critical                                     # ALWAYS critical (warnings-are-bugs)
confidence: high | medium | low                        # high = corroborated by per-test rerun; low = import-analysis only
engine: c8 | jest | nyc | vitest | coverage.py | coverlet | jacoco | gcov | go-cover | tarpaulin | llvm-cov | pgtap | manual
kind: coverage-uncovered                               # this skill emits one kind
target_file: src/auth/jwt.js
line: 87
uncovered_kind: branch | line | function | error_path | catch_block | dead
category: uncovered_error_path | uncovered_conditional_security | uncovered_branch_critical |
          uncovered_file_high_churn | uncovered_new_code_pr | uncovered_catch_block |
          uncovered_dead_code | uncovered_trivial
risk_score: 9.2                                        # weighted, 0.0–10.0
risk_inputs:
  criticality: high | normal | trivial
  churn90d: 12
  complexity: 14
  in_pr: true
  reachable: true | false | unknown
delta_to_baseline: new | unchanged | regressed         # vs. previous map run
suggested_test: "Add a test that passes a JWT with mismatched `iss` claim — expect rejection."
suggested_writer: unit-test-maker | integration-test-maker | e2e-test-maker | refactoring-suggester
reference: <link to internal docs or external best-practice URL>
```

The integrator uses `confidence` and `risk_score` to weight findings — a `confidence: low` import-analysis-only finding doesn't block phase advancement on its own, but per-test rerun corroboration escalates it. `category: uncovered_trivial` and `category: uncovered_dead_code` are emitted as informational; the integrator MAY defer them with no review burden. `delta_to_baseline: unchanged` lets the integrator skip already-accepted regions.

## Red Lines (NEVER Compromise)

- NEVER skip files when building the map
- NEVER cache maps across major test framework updates
- NEVER trust import analysis alone for critical paths (use per-test coverage)
- NEVER delete maps without rebuilding first
- NEVER emit a `risk_score` without listing its `risk_inputs` (every score must be auditable)
- NEVER recommend deleting code based on "dead" status alone — require both static (no callers) AND runtime (no production telemetry hits in N days) signals before suggesting deletion
- ALWAYS validate map integrity after build
- ALWAYS scope to PR diff when running on a PR (per-PR signal, not whole-repo retread)
- ALWAYS distinguish triage severity from wire severity in the report

---

## Refinement Loop — critic mode (v6.9.8)

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md):

- Every uncovered region with `risk_score >= threshold` emits as `severity: critical` in the letter you write to CTO Chief.
- The [letter schema](../../../.ctoc/architecture/refinement-loop-schema.json) rejects `warn` — there is no soft tier.
- Uncovered new code in a PR in a critical path blocks phase advancement (critical → medium) until covered, refactored, or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section.

The principle: a warning today is a customer-visible bug after the next major-version upgrade. Code that ships green-with-uncovered-error-paths ships with known latent failures.
