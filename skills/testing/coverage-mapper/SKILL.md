---
name: coverage-mapper
description: Builds and maintains file-to-test mappings for smart test selection by parsing coverage reports.
type: skill
when_to_load:
  - "coverage map"
  - "build coverage map"
  - "rebuild coverage map"
  - "file to test mapping"
  - "which tests cover"
  - "smart test selection"
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
  max_tokens: 25000
  max_tool_calls: 20
  max_subagents: 0
---

# Coverage Mapper (skill)

> Converted from agents/testing/coverage-mapper.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You build and maintain the file → test mapping that enables smart test selection. Run tests with coverage, parse results, and create a map showing which tests exercise which source files.

**Core Principle**: Know exactly which tests cover each file, so we only run what's needed.

## 2026 Best Practices (Testing category)

Two patterns most relevant here:

- **Testing Trophy, not pyramid** — when building the coverage map, weight by Trophy layers. An integration test that covers 20 files is more valuable than 20 isolated unit tests that each cover 1 file. The map should expose this so smart-test-runner can prefer wide-coverage tests for shared-dependency changes.
- **Intent-based test authoring** — when a file lacks coverage, the map's "uncovered" list should drive the writer skills to author *intent-based* tests (user-visible behavior, not implementation details). Flagging "0% covered" without context just produces low-value implementation tests.

## Trigger

- Manual: `ctoc coverage-map rebuild`
- Auto: map > 7 days old
- Auto: test files added/removed/renamed
- Auto: new source file detected without mapping
- Auto: config files changed (tsconfig, pytest.ini, jest.config)

## Process

```
1. Run full test suite with coverage enabled
2. Parse coverage report (JSON preferred)
3. For each source file, record which tests executed it
4. Store in .ctoc/quality-state/coverage-map.json
5. Store metadata (build time, config hash)
```

## Coverage Map Structure

`.ctoc/quality-state/coverage-map.json`:
```json
{
  "metadata": {
    "builtAt": "2026-02-03T09:00:00Z",
    "configHash": "sha256:abc...",
    "testFramework": "jest",
    "totalTests": 145,
    "totalFiles": 87
  },
  "files": {
    "src/lib/state.js": {
      "tests": ["tests/unit/state.test.js", "tests/integration/workflow.test.js"],
      "linesCovered": 45,
      "linesTotal": 50,
      "coverage": 90.0,
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
  "uncovered": ["src/legacy/deprecated.js", "src/utils/debug.js"]
}
```

## Coverage Generators

### Jest / Vitest / nyc (Istanbul format)
```bash
npx jest --coverage --coverageReporters=json --coverageReporters=json-summary
npx vitest run --coverage --coverage.reporter=json
npx nyc --reporter=json npm test
# Output: coverage/coverage-final.json
```

### pytest
```bash
pytest --cov=src --cov-report=json
# Output: coverage.json
```

### Go
```bash
go test -coverprofile=coverage.out ./...
go tool cover -func=coverage.out
```

### Rust (tarpaulin)
```bash
cargo tarpaulin --out Json --output-dir coverage
```

## Parsing Istanbul Coverage

```javascript
function parseIstanbulCoverage(coverageData) {
  const fileMap = {};
  for (const [filePath, coverage] of Object.entries(coverageData)) {
    const executedLines = [];
    const missingLines = [];
    for (const [stmtId, count] of Object.entries(coverage.s)) {
      const stmt = coverage.statementMap[stmtId];
      (count > 0 ? executedLines : missingLines).push(stmt.start.line);
    }
    fileMap[filePath] = {
      linesCovered: executedLines.length,
      linesTotal: executedLines.length + missingLines.length,
      coverage: (executedLines.length / (executedLines.length + missingLines.length)) * 100,
      executedLines,
      missingLines
    };
  }
  return fileMap;
}
```

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

Use Option 1 for fast incremental rebuilds, Option 2 for full rebuild and for any path crossing a critical-path boundary (auth/payment).

## Rebuild Triggers

```javascript
function needsRebuild(coverageMap) {
  const ageInDays = (new Date() - new Date(coverageMap.metadata.builtAt)) / 86_400_000;
  if (ageInDays > 7) return { rebuild: true, reason: 'map > 7 days' };
  if (computeConfigHash() !== coverageMap.metadata.configHash) {
    return { rebuild: true, reason: 'config changed' };
  }
  for (const file of glob.sync('src/**/*.{ts,js,py,go}')) {
    if (!coverageMap.files[file]) return { rebuild: true, reason: `new file: ${file}` };
  }
  const testFiles = glob.sync('tests/**/*.{test,spec}.{ts,js,py}');
  if (testFiles.length !== Object.keys(coverageMap.tests).length) {
    return { rebuild: true, reason: 'tests added/removed' };
  }
  return { rebuild: false };
}
```

## Incremental Updates

When only a few tests changed:
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

### Unmapped Files (No Test Coverage)
- `src/legacy/deprecated.js` (0%)
- `src/utils/debug.js` (0%)

### Coverage Map Location
`.ctoc/quality-state/coverage-map.json`

### Next Rebuild Triggers
- map age > 7 days
- test files added/removed
- config files changed
- Manual: `ctoc coverage-map rebuild`
```

## Red Lines (NEVER Compromise)

- NEVER skip files when building the map
- NEVER cache maps across major test framework updates
- NEVER trust import analysis alone for critical paths (use per-test coverage)
- NEVER delete maps without rebuilding first
- ALWAYS validate map integrity after build
